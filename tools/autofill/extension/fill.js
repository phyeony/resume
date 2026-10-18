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

  // Order matters: the first rule whose pattern matches answers. Specific before general.
  const RULES = [
    { key: 'sponsorship', test: /sponsor|visa\b|work permit sponsorship/, value: (a, q) => workAuthFor(q, a.workAuth)?.sponsorship },
    {
      key: 'workAuthorized',
      test: /(authori[sz]ed|eligible|legally (able|permitted|entitled)|right) to work|work authori[sz]ation|employment eligibility/,
      value: (a, q) => workAuthFor(q, a.workAuth)?.authorized,
    },
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

  async function fill(kit) {
    const answers = kit.answers;
    const report = { url: window.location.href, filled: [], left: [], already: 0, resume: 'no upload field', transcript: 'no upload field' };
    const fields = [...document.querySelectorAll('input, select, textarea')].filter(
      (el) => !el.disabled && !el.readOnly && !/^(hidden|submit|button|reset|image|search|password)$/.test(el.type),
    );
    const seen = new Set();
    const files = [];

    for (const el of fields) {
      if (seen.has(el)) continue;
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
