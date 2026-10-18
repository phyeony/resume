// Resume Studio autofill: fills a job application form on the current page from an apply kit.
//
// Plain script, no imports: the extension injects it into every frame, the Playwright script adds it with
// addScriptTag, and Claude runs it through the browser tools. It defines window.__resumeStudio:
//   await __resumeStudio.fill(kit)  fills what it can, outlines fields (green filled, amber left for you),
//                                   returns a report. Never overwrites what's already filled.
//   __resumeStudio.findSubmit()     the submit button, or null. Nothing here clicks it; the caller does,
//                                   and only after you've confirmed.
(() => {
  const GREEN = '#1e8e3e';
  const AMBER = '#f9ab00';

  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const norm = (s) => clean(s).toLowerCase().replace(/[*✱:?]+/g, ' ').replace(/\s+/g, ' ').trim();

  // ---- reading the form ---------------------------------------------------------

  function visible(el) {
    if (el.closest('[hidden], [aria-hidden="true"]')) return false;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const st = getComputedStyle(n);
      if (st.display === 'none' || st.visibility === 'hidden') return false;
    }
    return true;
  }

  /** Text of an element without the form controls (and option labels) inside it. */
  function textWithoutControls(node) {
    const copy = node.cloneNode(true);
    // Labels of radios/checkboxes are the answers, not the question.
    const copyLabels = copy.querySelectorAll('label');
    node.querySelectorAll('label').forEach((l, i) => {
      const f = l.getAttribute('for');
      const target = l.querySelector('input') || (f ? node.querySelector(`#${CSS.escape(f)}`) : null);
      if (target && (target.type === 'radio' || target.type === 'checkbox')) copyLabels[i].remove();
    });
    copy.querySelectorAll('input, select, textarea, button, option, script, style, [role="listbox"]').forEach((n) => n.remove());
    return clean(copy.textContent);
  }

  function byIds(ids) {
    return clean(
      (ids || '')
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent || '')
        .join(' '),
    );
  }

  /** "first_name" / "firstName" / "urls[LinkedIn]" → "first name" / "first name" / "urls linkedin". */
  const nameHint = (s) => clean((s || '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_\-[\].]+/g, ' '));

  /** Fields that belong together: a radio group, or a checkbox group sharing a name. */
  function groupOf(el) {
    if ((el.type === 'radio' || el.type === 'checkbox') && el.name) {
      const scope = el.form || document;
      return [...scope.querySelectorAll(`input[type="${el.type}"]`)].filter((x) => x.name === el.name);
    }
    return [el];
  }

  /** The question a field (or group) asks. */
  function questionOf(el, group) {
    const choice = el.type === 'radio' || el.type === 'checkbox';
    if (!choice) {
      if (el.labels && el.labels.length) {
        const t = clean([...el.labels].map((l) => textWithoutControls(l)).join(' '));
        if (t) return t;
      }
      const lb = byIds(el.getAttribute('aria-labelledby'));
      if (lb) return lb;
      if (el.getAttribute('aria-label')) return clean(el.getAttribute('aria-label'));
    }
    const fs = el.closest('fieldset');
    const legend = fs && fs.querySelector('legend');
    if (legend && group.every((g) => fs.contains(g))) return clean(legend.textContent);
    const rg = el.closest('[role="radiogroup"], [role="group"]');
    if (rg) {
      const t = byIds(rg.getAttribute('aria-labelledby')) || clean(rg.getAttribute('aria-label'));
      if (t) return t;
    }
    // Walk up until the container holds text, but not another question's field.
    const own = new Set(group);
    for (let n = el.parentElement, depth = 0; n && depth < 6; n = n.parentElement, depth++) {
      if (choice && n.tagName === 'LABEL') continue;
      const others = [...n.querySelectorAll('input:not([type="hidden"]), select, textarea')].filter((x) => !own.has(x));
      if (others.length) break;
      const t = textWithoutControls(n);
      if (t && t.length <= 400) return t;
    }
    if (choice && group.length === 1 && el.labels && el.labels.length) return clean(el.labels[0].textContent);
    return clean(el.getAttribute('placeholder')) || nameHint(el.name || el.id);
  }

  function choiceLabel(el) {
    if (el.labels && el.labels.length) return clean(el.labels[0].textContent);
    return clean(el.getAttribute('aria-label') || el.value);
  }

  const isRequired = (el, q) => el.required || el.getAttribute('aria-required') === 'true' || /[*✱]/.test(q);

  const isCombobox = (el) => el.getAttribute('role') === 'combobox' || !!el.getAttribute('aria-autocomplete');

  // ---- matching questions to answers ------------------------------------------

  const COUNTRY_ALIASES = {
    'united states': ['united states', 'u.s.', 'usa', 'america', /\bus\b/],
    'united kingdom': ['united kingdom', 'u.k.', 'britain', 'england', /\buk\b/],
    'european union': ['european union', /\beu\b/, 'europe', 'eea'],
    'south korea': ['south korea', 'korea'],
  };

  function aliasesOf(country) {
    const c = norm(country);
    if (COUNTRY_ALIASES[c]) return COUNTRY_ALIASES[c];
    if (c === 'us' || c === 'usa') return COUNTRY_ALIASES['united states'];
    if (c === 'uk') return COUNTRY_ALIASES['united kingdom'];
    if (c === 'eu' || c === 'europe') return COUNTRY_ALIASES['european union'];
    return [c];
  }

  /** The work authorization row for the country a question names, else the "*" row. */
  function workAuthFor(q, rows) {
    const named = rows.filter((r) => r.country && r.country !== '*');
    const hit = named.find((r) => aliasesOf(r.country).some((a) => (typeof a === 'string' ? q.includes(a) : a.test(q))));
    return hit || rows.find((r) => r.country === '*');
  }

  function locationOf(a) {
    return [a.city, a.region, a.country].filter(Boolean).join(', ');
  }

  /** The job you're in now, else the most recent one (the resume lists them newest first). */
  const latestJob = (a) => (a.experience || []).find((j) => j.current) || (a.experience || [])[0];

  // Order matters: the first rule whose pattern matches answers. Specific before general.
  const RULES = [
    { key: 'sponsorship', test: /sponsor|visa\b|work permit sponsorship/, value: (a, q) => workAuthFor(q, a.workAuth)?.sponsorship },
    {
      key: 'workAuthorized',
      test: /(authori[sz]ed|eligible|legally (able|permitted|entitled)|right) to work|work authori[sz]ation|employment eligibility/,
      value: (a, q) => workAuthFor(q, a.workAuth)?.authorized,
    },
    { key: 'currentCompany', test: /(current|most recent|present|latest) (company|employer|organi[sz]ation)/, value: (a) => latestJob(a)?.company },
    { key: 'currentTitle', test: /(current|most recent|present|latest) (job |position |role )?title|(current|most recent) (position|role)\b/, value: (a) => latestJob(a)?.title },
    { key: 'preferredName', test: /preferred (first )?name|nickname|name you go by/, value: (a) => a.preferredName || a.firstName },
    { key: 'firstName', test: /first name|given name|forename/, value: (a) => a.firstName },
    { key: 'lastName', test: /last name|surname|family name/, value: (a) => a.lastName },
    { key: 'fullName', test: /^(full |legal |your )?name$|full name|full legal name/, value: (a) => clean(`${a.firstName} ${a.lastName}`) },
    { key: 'email', test: /e-?mail/, value: (a) => a.email },
    { key: 'phone', test: /phone|mobile|telephone|cell/, value: (a) => a.phone },
    { key: 'linkedin', test: /linkedin/, value: (a) => a.linkedin },
    { key: 'github', test: /github/, value: (a) => a.github },
    { key: 'website', test: /website|portfolio|personal (site|url|page)|blog/, value: (a) => a.website },
    { key: 'pronouns', test: /pronoun/, value: (a) => a.pronouns },
    { key: 'hispanic', test: /hispanic|latin[oax]/, value: (a) => a.hispanic },
    { key: 'race', test: /\brace\b|ethnic/, value: (a) => a.race },
    { key: 'gender', test: /gender|\bsex\b/, value: (a) => a.gender },
    { key: 'veteran', test: /veteran|military|armed forces/, value: (a) => a.veteran },
    { key: 'disability', test: /disabilit/, value: (a) => a.disability },
    { key: 'postalCode', test: /postal|zip/, value: (a) => a.postalCode },
    { key: 'location', test: /^(current )?location|where are you (located|based)|city.{0,10}(state|province).{0,10}country/, value: locationOf },
    { key: 'city', test: /\bcity\b/, value: (a) => a.city },
    { key: 'region', test: /province|\bstate\b|region/, value: (a) => a.region },
    { key: 'country', test: /\bcountry\b/, value: (a) => a.country },
    { key: 'address', test: /street|address line 1|^address$|mailing address|home address/, value: (a) => a.address },
    { key: 'graduation', test: /graduat/, value: (a) => a.graduation },
    { key: 'school', test: /school|university|college|institution/, value: (a) => a.school },
    { key: 'degree', test: /degree/, value: (a) => a.degree },
    { key: 'major', test: /major|discipline|field of study|area of study|program of study/, value: (a) => a.major },
    { key: 'startDate', test: /start date|available to start|earliest start|when can you start|availability/, value: (a) => a.startDate },
    { key: 'salary', test: /salary|compensation|pay expectation|desired pay|expected pay/, value: (a) => a.salary },
  ];

  /** [key, answer] for a question, or null. Your own questions win over the built-in rules. */
  function answerFor(question, answers) {
    const q = norm(question);
    if (!q) return null;
    for (const c of answers.custom || []) {
      const p = norm(c.pattern);
      if (p && q.includes(p) && c.answer) return ['custom', c.answer];
    }
    for (const r of RULES) {
      if (r.test.test(q)) {
        const v = r.value(answers, q);
        return v ? [r.key, v] : [r.key, null];
      }
    }
    return null;
  }

  const DECLINE = /decline|prefer not|don.?t wish|do not wish|not to (say|answer|disclose|identify|self-identify)|choose not|rather not/;

  /** Index of the option that best fits the answer, or -1. Placeholders ("Select…") never match. */
  function pickOption(labels, answer) {
    const want = norm(answer);
    const opts = labels.map((l) => norm(l));
    const usable = (i) => opts[i] && !/^(select|choose|please select|--)/.test(opts[i]);
    const find = (pred) => opts.findIndex((o, i) => usable(i) && pred(o));
    let i = find((o) => o === want);
    if (i < 0 && DECLINE.test(want)) i = find((o) => DECLINE.test(o));
    if (i < 0 && /^(yes|no)\b/.test(want)) {
      const yn = want.startsWith('yes') ? 'yes' : 'no';
      i = find((o) => o === yn || o.startsWith(yn + ' ') || o.startsWith(yn + ','));
    }
    if (i < 0) i = find((o) => o.startsWith(want) || want.startsWith(o));
    if (i < 0 && want.length >= 3) i = find((o) => o.includes(want));
    return i;
  }

  // ---- filling --------------------------------------------------------------------

  function setValue(el, value) {
    const proto =
      el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    // React and similar keep their own copy of the value; the prototype setter lets their change handler see it.
    if (setter) setter.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function mark(el, color) {
    const target = el.type === 'radio' || el.type === 'checkbox' ? el.closest('fieldset, [role="radiogroup"], [role="group"]') || el.parentElement : el;
    if (target) {
      target.style.outline = `2px solid ${color}`;
      target.style.outlineOffset = '2px';
    }
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /** Searchable dropdowns (react-select and co.): type the answer, then click the option that fits. */
  async function fillCombobox(el, answer) {
    el.focus();
    setValue(el, answer);
    for (let t = 0; t < 8; t++) {
      await sleep(100);
      const id = el.getAttribute('aria-controls');
      const lb = id ? document.getElementById(id) : null;
      const opts = [...(lb || document).querySelectorAll('[role="option"]')].filter(visible);
      if (!opts.length) continue;
      const i = pickOption(
        opts.map((o) => o.textContent),
        answer,
      );
      if (i < 0) return false;
      opts[i].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      opts[i].click();
      return true;
    }
    return false;
  }

  /** Puts a kit PDF ({fileName, pdfBase64}) into a file input. */
  function attachPdf(input, pdf) {
    if (!pdf || !pdf.pdfBase64) return false;
    const bytes = Uint8Array.from(atob(pdf.pdfBase64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], pdf.fileName, { type: 'application/pdf' }));
    input.files = dt.files;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function isFilled(el, group) {
    if (el.type === 'radio' || el.type === 'checkbox') return group.some((g) => g.checked);
    if (el instanceof HTMLSelectElement) return el.selectedIndex > 0 && !!el.value;
    if (el.type === 'file') return el.files && el.files.length > 0;
    return !!clean(el.value);
  }


  // ---- Workday work experience ------------------------------------------------------
  // Workday parses the resume into "Work Experience N" entries and often gets them wrong. Replace them with the
  // kit's jobs: delete each entry, then Add one per job and fill it. Selectors checked on a live tenant
  // (docs/superpowers/specs/2026-10-18-workday-experience-design.md).

  const workdaySection = () => document.querySelector('[role="group"][aria-labelledby="Work-Experience-section"]');

  /** Polls until test() is truthy (and returns it), or gives up after ~3 s. */
  async function until(test) {
    for (let t = 0; t < 30; t++) {
      const v = test();
      if (v) return v;
      await sleep(100);
    }
    return null;
  }

  async function fillWorkdayExperience(sec, jobs, report) {
    const panels = () => [...sec.querySelectorAll('[role="group"][aria-labelledby$="-panel"]')];
    // Field ids are "workExperience-<n>--jobTitle"; <n> isn't the entry number, so match the end.
    const field = (p, name) => p.querySelector(`[id$="--${name}"]`);
    const describe = (p) => [field(p, 'jobTitle')?.value, field(p, 'companyName')?.value].map(clean).filter(Boolean).join(' at ') || '(blank)';
    const stop = (why) => {
      report.left.push({ question: 'Work experience', required: true, why });
      mark(sec, AMBER);
      return why;
    };
    if (!jobs || !jobs.length) return stop('no work experience in the kit: download a new kit from Profile');

    const same = (a, b) => norm(a) === norm(b);
    const existing = panels();
    if (
      existing.length === jobs.length &&
      existing.every((p, i) => same(field(p, 'jobTitle')?.value, jobs[i].title) && same(field(p, 'companyName')?.value, jobs[i].company))
    ) {
      return 'already matches your resume';
    }

    const removed = [];
    for (const p of existing) {
      const del = [...p.querySelectorAll('button')].find((b) => /^delete$/i.test(clean(b.textContent)));
      const what = describe(p);
      if (!del) return stop(`couldn't find Delete on "${what}"; nothing added`);
      del.click();
      if (!(await until(() => !p.isConnected))) return stop(`"${what}" didn't delete; nothing added`);
      removed.push(what);
    }

    const left = (p, label, why) => {
      report.left.push({ question: label, required: true, why });
      if (p) mark(p, AMBER);
    };
    let added = 0;
    for (const job of jobs) {
      const add = [...sec.querySelectorAll('button')].find((b) => b.getAttribute('data-automation-id') === 'add-button' || /^add( another)?$/i.test(clean(b.textContent)));
      if (!add) return stop(`no Add button; added ${added} of ${jobs.length} jobs`);
      const before = panels().length;
      add.click();
      const p = await until(() => panels().length > before && panels()[panels().length - 1]);
      if (!p || !(await until(() => field(p, 'jobTitle')))) return stop(`Add didn't open a new entry; added ${added} of ${jobs.length} jobs`);
      const label = `${job.title} at ${job.company}`;

      const text = async (name, value) => {
        const el = field(p, name);
        if (!el || !value) return;
        if (isCombobox(el) && !(await fillCombobox(el, value))) return left(el, `${label}: ${name}`, `no option matches "${value}"`);
        if (!isCombobox(el)) setValue(el, value);
        mark(el, GREEN);
      };
      await text('jobTitle', job.title);
      await text('companyName', job.company);
      await text('location', job.location);
      const cur = field(p, 'currentlyWorkHere');
      if (job.current && cur && !cur.checked) cur.click();
      // Month and year are separate spin boxes; Workday shows months without a leading zero.
      const date = async (which, m, y) => {
        const any = await until(() => field(p, `${which}-dateSectionMonth-input`) || field(p, `${which}-dateSectionYear-input`));
        const monthEl = field(p, `${which}-dateSectionMonth-input`);
        const yearEl = field(p, `${which}-dateSectionYear-input`);
        if (!any || !y || (monthEl && !m)) return left(p, `${label}: ${which === 'startDate' ? 'From' : 'To'}`, 'date not in the kit');
        for (const [el, v] of [
          [monthEl, m],
          [yearEl, y],
        ]) {
          if (!el) continue;
          el.focus();
          setValue(el, String(v));
          mark(el, GREEN);
        }
      };
      await date('startDate', job.startMonth, job.startYear);
      if (!job.current) await date('endDate', job.endMonth, job.endYear);
      await text('roleDescription', job.description);
      report.filled.push({ question: 'Work experience', answer: label });
      added++;
    }
    return removed.length ? `replaced ${removed.length} Workday entries (${removed.join('; ')}) with your ${added} jobs` : `added your ${added} jobs`;
  }

  // ---- Work experience on other sites ------------------------------------------------
  // Best effort: find blocks with a job title and a company field (one block per job), fill the blank ones with
  // the kit's jobs in order, and click the site's "Add" for the rest. Never touches a block that has anything in
  // it. What it can't place is left amber.

  const JOB = {
    title: /job title|position title|role title|^(job |position |role )?title$|^position$|^role$|\btitle\b/,
    company: /company|employer|organi[sz]ation|business name/,
    location: /location|\bcity\b/,
    current: /current|present|still (work|employed)|i work here/,
    start: /start|from|began|begin/,
    end: /end|\bto\b|until|finish|left/,
    description: /description|responsibilit|duties|summary|achievements|what did you do/,
  };
  const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

  const formFields = (root) =>
    [...root.querySelectorAll('input, select, textarea')].filter(
      (el) => !el.disabled && !el.readOnly && !/^(hidden|submit|button|reset|image|search|password|file|radio)$/.test(el.type) && visible(el),
    );
  // Tests a field's question, then its name/id, so "experience[0][company]" counts even with a vague label.
  const has = (el, re) => re.test(norm(questionOf(el, [el]))) || re.test(norm(`${nameHint(el.name)} ${nameHint(el.id)}`));
  const isTitleField = (el) => el.type !== 'checkbox' && has(el, JOB.title) && !has(el, /name|first|last|prefix/);
  const isCompanyField = (el) => el.type !== 'checkbox' && has(el, JOB.company);

  const dateish = (f) =>
    f.type !== 'checkbox' &&
    (has(f, /date|month|year|\bmm\b|yyyy/) || MONTH_SELECT(f) || YEAR_SELECT(f) || /^(month|date)$/.test(f.type) || /\bmm\b|yyyy/i.test(f.getAttribute('placeholder') || ''));
  // Contact and reference fields mean the container is the whole form or a references entry, not a job.
  const NOT_A_JOB = /e-?mail|phone|first name|last name|full name|reference|referee/;

  /** One element per job entry: the smallest container holding a title field and a company field, and no other title. */
  function jobBlocks(root = document) {
    const blocks = [];
    for (const t of formFields(root).filter(isTitleField)) {
      for (let n = t.parentElement, depth = 0; n && n !== document.body && depth < 8; n = n.parentElement, depth++) {
        const inside = formFields(n);
        if (inside.filter(isTitleField).length > 1) break;
        if (inside.some(isCompanyField)) {
          const jobLike = inside.some((f) => dateish(f) || f instanceof HTMLTextAreaElement) && !inside.some((f) => has(f, NOT_A_JOB));
          if (jobLike && !blocks.includes(n)) blocks.push(n);
          break;
        }
      }
    }
    return blocks;
  }

  const MONTH_SELECT = (el) => el instanceof HTMLSelectElement && [...el.options].filter((o) => MONTH_NAMES.some((m) => norm(o.textContent).startsWith(m.slice(0, 3)))).length >= 12;
  const YEAR_SELECT = (el) => el instanceof HTMLSelectElement && [...el.options].filter((o) => /^(19|20)\d\d$/.test(clean(o.textContent))).length >= 5;

  /** Writes a month/year into one date field: picks the format from its type and placeholder. */
  function dateText(el, m, y) {
    const mm = String(m || 1).padStart(2, '0');
    if (el.type === 'month') return `${y}-${mm}`;
    if (el.type === 'date') return `${y}-${mm}-01`;
    const ph = norm(el.getAttribute('placeholder'));
    if (/yyyy.?mm/.test(ph)) return `${y}-${mm}`;
    if (/^yyyy$/.test(ph)) return String(y);
    if (/mm.?dd.?yyyy/.test(ph)) return `${mm}/01/${y}`;
    return m ? `${mm}/${y}` : String(y);
  }

  /** Fills a start or end date: one field, or a month and a year (selects or boxes). True when done. */
  function fillDate(els, m, y) {
    if (!els.length || !y) return false;
    const month = els.find((el) => MONTH_SELECT(el) || has(el, /\bmonth\b|\bmm\b/));
    const year = els.find((el) => el !== month && (YEAR_SELECT(el) || has(el, /\byear\b|yyyy/) && !has(el, /month/)));
    const put = (el, v, labels) => {
      if (el instanceof HTMLSelectElement) {
        const i = pickOption([...el.options].map((o) => o.textContent), labels);
        if (i < 0) return false;
        setValue(el, el.options[i].value);
      } else setValue(el, v);
      mark(el, GREEN);
      return true;
    };
    if (month && year) {
      if (!m) return false;
      const okM = MONTH_SELECT(month) ? put(month, '', MONTH_NAMES[m - 1]) : put(month, String(m).padStart(2, '0'));
      return put(year, String(y), String(y)) && okM;
    }
    const one = year || els[0];
    return put(one, dateText(one, m, y), String(y));
  }

  /** Fills an empty job block; returns what it couldn't place. */
  async function fillJobBlock(b, job) {
    const left = [];
    const fs = formFields(b);
    const used = new Set();
    const take = (pred) => {
      const el = fs.find((f) => !used.has(f) && pred(f));
      if (el) used.add(el);
      return el;
    };
    const title = take(isTitleField);
    const company = take(isCompanyField);
    const cur = take((f) => f.type === 'checkbox' && has(f, JOB.current));
    const desc = take((f) => f instanceof HTMLTextAreaElement || has(f, JOB.description));
    const location = take((f) => has(f, JOB.location));
    const starts = fs.filter((f) => !used.has(f) && dateish(f) && has(f, JOB.start));
    starts.forEach((f) => used.add(f));
    // Ends: labelled as such, or the date fields left once the start ones are taken.
    const ends = fs.filter((f) => !used.has(f) && dateish(f) && (has(f, JOB.end) || starts.length));

    const text = async (el, v) => {
      if (!el || !v) return;
      if (isCombobox(el) ? await fillCombobox(el, v) : (setValue(el, v), true)) mark(el, GREEN);
      else left.push(el);
    };
    await text(title, job.title);
    await text(company, job.company);
    await text(location, job.location);
    if (job.current && cur && !cur.checked) {
      cur.click();
      mark(cur, GREEN);
    }
    if (!fillDate(starts, job.startMonth, job.startYear) && starts.length) left.push(...starts);
    if (!job.current && !fillDate(ends, job.endMonth, job.endYear) && ends.length) left.push(...ends);
    if (job.current && !cur && ends.length === 1 && ends[0] instanceof HTMLInputElement && ends[0].type === 'text') setValue(ends[0], 'Present');
    await text(desc, job.description);
    left.forEach((el) => mark(el, AMBER));
    return left;
  }

  /** The site's "Add another job" button next to the job blocks. */
  function addJobButton(blocks) {
    const last = blocks[blocks.length - 1];
    for (let n = last.parentElement, depth = 0; n && depth < 4; n = n.parentElement, depth++) {
      const b = [...n.querySelectorAll('button, a, [role="button"]')].find(
        (x) => !last.contains(x) && visible(x) && /^\+?\s*add\b/i.test(clean(x.textContent || x.getAttribute('aria-label'))) && !/education|school|language|skill|reference|certif/i.test(clean(x.textContent)),
      );
      if (b) return b;
    }
    return null;
  }

  async function fillOtherExperience(jobs, report) {
    let blocks = jobBlocks();
    if (!blocks.length) return null;
    if (!jobs || !jobs.length) {
      report.left.push({ question: 'Work experience', required: false, why: 'no work experience in the kit: download a new kit from Profile' });
      return { blocks, summary: null };
    }
    const value = (b, pred) => clean(formFields(b).find(pred)?.value);
    const isBlank = (b) => formFields(b).every((f) => (f.type === 'checkbox' ? !f.checked : f instanceof HTMLSelectElement ? f.selectedIndex <= 0 : !clean(f.value)));
    // Jobs already on the form (typed by you or the site's resume parser) aren't added again.
    const there = blocks.filter((b) => !isBlank(b)).map((b) => norm(value(b, isCompanyField) + ' ' + value(b, isTitleField)));
    const todo = jobs.filter((j) => !there.includes(norm(`${j.company} ${j.title}`)));
    let filled = 0;
    for (const job of todo) {
      let b = blocks.find((x) => isBlank(x));
      if (!b) {
        const add = addJobButton(blocks);
        if (!add) break;
        const before = blocks.length;
        add.click();
        if (!(await until(() => jobBlocks().length > before))) break;
        blocks = jobBlocks();
        b = blocks.find((x) => isBlank(x));
        if (!b) break;
      }
      const missed = await fillJobBlock(b, job);
      report.filled.push({ question: 'Work experience', answer: `${job.title} at ${job.company}` });
      missed.forEach((el) => report.left.push({ question: `${job.title} at ${job.company}: ${questionOf(el, [el])}`, required: isRequired(el, ''), why: 'job detail it could not fill' }));
      filled++;
    }
    if (filled < todo.length) {
      report.left.push({ question: 'Work experience', required: false, why: `filled ${filled} of ${todo.length} jobs; add the rest yourself` });
    }
    const summary = `filled ${filled} job${filled === 1 ? '' : 's'} into the form${there.length ? ` (${there.length} already there)` : ''}`;
    return { blocks: jobBlocks(), summary };
  }

  /** opts.keepExperience: leave Workday's work experience entries as they are. */
  async function fill(kit, opts = {}) {
    const answers = { ...kit.answers, experience: kit.experience };
    const report = { url: window.location.href, filled: [], left: [], already: 0, resume: 'no upload field', transcript: 'no upload field' };
    const fields = [...document.querySelectorAll('input, select, textarea')].filter(
      (el) => !el.disabled && !el.readOnly && !/^(hidden|submit|button|reset|image|search|password)$/.test(el.type),
    );
    const seen = new Set();
    const files = [];

    // Workday's work experience is filled entry by entry (or kept), never field by field.
    const sec = workdaySection();
    if (sec) {
      report.experience = opts.keepExperience ? "kept Workday's entries" : await fillWorkdayExperience(sec, kit.experience, report);
      sec.querySelectorAll('input, select, textarea').forEach((el) => seen.add(el));
    } else {
      const other = await fillOtherExperience(kit.experience, report);
      if (other) {
        if (other.summary) report.experience = other.summary;
        other.blocks.forEach((b) => b.querySelectorAll('input, select, textarea').forEach((el) => seen.add(el)));
      }
    }

    for (const el of fields) {
      // Workday entries deleted above are gone from the page.
      if (seen.has(el) || !el.isConnected) continue;
      const group = groupOf(el);
      group.forEach((g) => seen.add(g));
      if (el.type === 'file') {
        files.push(el);
        continue;
      }
      if (!group.some(visible)) continue;
      const question = questionOf(el, group);
      const required = group.some((g) => isRequired(g, question));
      if (isFilled(el, group)) {
        report.already++;
        continue;
      }
      const found = answerFor(question, answers);
      const answer = found && found[1];
      const leave = (why) => {
        report.left.push({ question, required, why });
        mark(el, AMBER);
      };
      if (!answer) {
        if (el.type === 'checkbox' && group.length === 1) leave('checkbox: yours to tick');
        else if (el instanceof HTMLTextAreaElement) leave('free text');
        else leave(found ? `no answer saved for ${found[0]}` : 'unknown question');
        continue;
      }

      let ok = false;
      if (el.type === 'radio' || el.type === 'checkbox') {
        if (el.type === 'checkbox' && group.length === 1) {
          leave('checkbox: yours to tick');
          continue;
        }
        const i = pickOption(group.map(choiceLabel), answer);
        if (i >= 0) {
          group[i].click();
          ok = true;
        }
      } else if (el instanceof HTMLSelectElement) {
        const i = pickOption(
          [...el.options].map((o) => o.textContent),
          answer,
        );
        if (i >= 0) {
          setValue(el, el.options[i].value);
          ok = true;
        }
      } else if (isCombobox(el)) {
        ok = await fillCombobox(el, answer);
      } else {
        setValue(el, answer);
        ok = true;
      }
      if (ok) {
        report.filled.push({ question, answer });
        mark(el, GREEN);
      } else leave(`no option matches "${answer}"`);
    }

    // Transcript: the upload field that names it. Resume: the one that asks for a resume/CV, else the only one
    // left that isn't for a cover letter or a transcript.
    const fileText = (f) => questionOf(f, [f]) + ' ' + (f.name || '') + ' ' + (f.id || '');
    const transcriptField = files.find((f) => /transcript/i.test(fileText(f)));
    const others = files.filter((f) => f !== transcriptField && !/cover|transcript/i.test(fileText(f)));
    const resumeField = files.find((f) => f !== transcriptField && /resume|cv\b|curriculum/i.test(fileText(f))) || (others.length === 1 ? others[0] : undefined);
    const attach = (field, pdf) => {
      if (!field) return 'no upload field';
      if (field.files && field.files.length) return 'already attached';
      if (!pdf) return 'none in the kit';
      return attachPdf(field, pdf) ? `attached ${pdf.fileName}` : 'could not attach';
    };
    report.resume = attach(resumeField, kit.resume);
    report.transcript = attach(transcriptField, kit.transcript);
    for (const f of files) {
      if (f === resumeField || (f.files && f.files.length)) continue;
      const question = questionOf(f, [f]);
      report.left.push({ question, required: isRequired(f, question), why: f === transcriptField ? `transcript: ${report.transcript}` : 'file upload' });
    }
    const submit = findSubmit();
    report.submit = submit ? clean(submit.textContent || submit.value) || 'Submit' : null;
    return report;
  }

  const SUBMIT_TEXT = /^(submit( your)?( application)?|apply( now)?|send( application)?|submit & apply|finish)$/i;

  function findSubmit() {
    const buttons = [...document.querySelectorAll('button, input[type="submit"], [role="button"]')].filter(visible);
    return (
      buttons.find((b) => SUBMIT_TEXT.test(clean(b.textContent || b.value))) ||
      buttons.find((b) => b.type === 'submit' && b.closest('form')) ||
      null
    );
  }

  window.__resumeStudio = { fill, findSubmit, answerFor, pickOption, questionOf: (el) => questionOf(el, groupOf(el)) };
})();
