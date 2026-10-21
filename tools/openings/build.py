"""Builds src/applications/openings.json: when each company posted internships in past years.

Walks the git history of the internship lists the Leads page imports (each list drops old jobs, so the
history is the only record), keeps the first date each job was seen and the term it was for, and writes
one compact file the Openings page predicts from.

    python3 tools/openings/build.py            # clones into a temp folder, ~10 minutes
    python3 tools/openings/build.py --work DIR # reuse clones in DIR
"""
import argparse, datetime, json, os, re, subprocess, sys, tempfile

REPOS = {
    # Simplify (was pittcsc): one repo, renamed every season; listings.json since mid 2023.
    'simplify': ('https://github.com/SimplifyJobs/Summer2027-Internships.git', 'dev', '.github/scripts/listings.json'),
    'negarprh': ('https://github.com/negarprh/Canadian-Tech-Internships-2027.git', None, 'README.md'),
    'hanzili': ('https://github.com/hanzili/canada_sde_intern_position.git', None, 'README.md'),
}
EPOCH = datetime.date(2020, 1, 1)
SEASONS = {'winter': 'W', 'spring': 'Sp', 'summer': 'S', 'fall': 'F', 'autumn': 'F'}
MONTHS = {m: i + 1 for i, m in enumerate('jan feb mar apr may jun jul aug sep oct nov dec'.split())}


def git(work, name, *args):
    return subprocess.run(['git', '-C', os.path.join(work, name), *args], capture_output=True, check=True).stdout


def clone(work, name):
    url, branch, _ = REPOS[name]
    if os.path.isdir(os.path.join(work, name)):
        git(work, name, 'fetch', '-q', 'origin')
        return
    cmd = ['git', 'clone', '-q', '--filter=blob:none', '--no-checkout']
    if branch:
        cmd += ['--single-branch', '--branch', branch]
    subprocess.run(cmd + [url, os.path.join(work, name)], check=True)


def snapshots(work, name, per_month):
    """(sha, unix time) of commits touching the file, oldest first, about per_month a month."""
    path = REPOS[name][2]
    ref = 'origin/' + REPOS[name][1] if REPOS[name][1] else 'origin/HEAD'
    rows = [l.split() for l in git(work, name, 'log', ref, '--format=%h %at', '--', path).decode().splitlines() if l.strip()]
    rows.reverse()
    seen = {}
    for sha, at in rows:
        d = datetime.datetime.fromtimestamp(int(at), datetime.timezone.utc)
        slot = (d.year, d.month, min(d.day * per_month // 32, per_month - 1))
        seen[slot] = (sha, int(at))  # the last commit in each slot
    return sorted(seen.values(), key=lambda r: r[1])


def term_of(text):
    """'Summer 2027', 'Sept 2026 - Apr 2027' -> 'S27', 'F26'. The first one named; None when none is."""
    m = re.search(r'\b(winter|spring|summer|fall|autumn)\s*[\'’]?\s*(20)?(\d\d)\b', text, re.I)
    best = (m.start(), SEASONS[m.group(1).lower()] + m.group(3)) if m else None
    n = re.search(r'\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*(20\d\d)\b', text, re.I)
    if n and (not best or n.start() < best[0]):
        month = MONTHS[n.group(1).lower()]
        season = 'W' if month <= 4 else 'S' if month <= 8 else 'F'
        best = (n.start(), season + n.group(2)[2:])
    return best[1] if best else None


def simplify_terms(title, terms):
    """The terms a Simplify job is for. A term in the title wins; a job tagged with three or more terms is
    one posting open to all of them, kept as 'S27|W27|F27' so it shows a term is open without skewing
    when that term's postings usually go up."""
    named = term_of(title)
    if named:
        return [named]
    out = []
    for t in terms or []:
        m = re.match(r'(Winter|Spring|Summer|Fall) 20(\d\d)$', t)
        if m:
            out.append(SEASONS[m.group(1).lower()] + m.group(2))
    if not out:
        return [None]
    return out if len(out) <= 2 else ['|'.join(sorted(set(out)))]


def cells(line):
    line = re.sub(r'^\|', '', line)
    line = re.sub(r'(?<!\\)\|\s*$', '', line)
    return [c.strip() for c in re.split(r'(?<!\\)\|', line)]


def text(c):
    c = re.sub(r'<br\s*/?>', ', ', c)
    c = re.sub(r'!\[[^\]]*\]\([^)]*\)', '', c)
    c = re.sub(r'\[([^\]]*)\]\([^)]*\)', r'\1', c)
    c = re.sub(r'<[^>]+>|\*\*|__', '', c)
    return re.sub(r'\s+', ' ', c.replace('&amp;', '&')).strip()


def from_simplify(raw, _):
    for x in json.loads(raw):
        if x.get('date_posted') and x.get('company_name'):
            for t in simplify_terms(x.get('title', ''), x.get('terms') or ([x['season'] + ' ' + str(x.get('year', ''))] if x.get('season') else [])):
                yield x['company_name'], x.get('title', ''), x['date_posted'], t, x.get('locations') or []


def from_negarprh(raw, _):
    company = ''
    for line in raw.decode().splitlines():
        line = line.strip()
        if not line.startswith('|') or re.match(r'^\|\s*:?-', line) or re.match(r'^\|\s*Company\s*\|', line):
            continue
        c = cells(line)
        if len(c) < 5:
            continue
        name = text(c[0])
        if name and name != '↳':
            company = name
        try:
            at = datetime.datetime.strptime(text(c[4]), '%b %d, %Y').replace(tzinfo=datetime.timezone.utc).timestamp()
        except ValueError:
            continue
        role = text(c[1])
        yield company, role, at, term_of(role), [l.strip() for l in text(c[2]).split(' / ') if l.strip()]


def from_hanzili(raw, at):
    # Title | Company | … | Apply. Early on a column held the posting date; later there is none, and the
    # first snapshot a job shows up in stands for when it was posted.
    for line in raw.decode().splitlines():
        line = line.strip()
        if not line.startswith('|') or len(cells(line)) < 6 or not re.search(r'<!--\s*id:\w+\s*-->', line):
            continue
        c = cells(line)
        role = re.sub(r'^[\s🆕🔥💤]+', '', text(c[0]))
        dated = [x for x in map(text, c) if re.fullmatch(r'20\d\d-\d\d-\d\d', x)]
        posted = datetime.datetime.strptime(dated[0], '%Y-%m-%d').replace(tzinfo=datetime.timezone.utc).timestamp() if dated else at
        details = text(c[4]) if len(c) >= 7 else ''
        where = text(c[5]) if len(c) >= 7 else text(c[2])
        yield text(c[1]).split(' | ')[0].strip(), role, posted, term_of(role + ' ' + details), [where] if where else []


READERS = {'simplify': (from_simplify, 2), 'negarprh': (from_negarprh, 2), 'hanzili': (from_hanzili, 8)}

SUFFIX = re.compile(r'\b(inc|incorporated|ltd|limited|llc|corp|corporation|co|plc|gmbh|ag|sa|lp|llp)\b\.?', re.I)


def company_key(name):
    return re.sub(r'[^a-z0-9]+', '', SUFFIX.sub('', name.lower())) or re.sub(r'[^a-z0-9]+', '', name.lower())


def title_key(title):
    return re.sub(r'[^a-z]+', '', re.sub(r'\b(winter|spring|summer|fall|20\d\d|\d+\s*mo(nths?)?)\b', '', title.lower()))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--work')
    ap.add_argument('--out', default=os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'applications', 'openings.json'))
    args = ap.parse_args()
    work = args.work or tempfile.mkdtemp(prefix='openings-')
    os.makedirs(work, exist_ok=True)
    jobs, names = {}, {}
    for name, (read, per_month) in READERS.items():
        clone(work, name)
        snaps = snapshots(work, name, per_month)
        for i, (sha, at) in enumerate(snaps):
            raw = git(work, name, 'show', f'{sha}:{REPOS[name][2]}')
            for company, title, posted, term, places in read(raw, at):
                key = company_key(company)
                if not key:
                    continue
                day = (datetime.datetime.fromtimestamp(min(posted, at), datetime.timezone.utc).date() - EPOCH).days
                # A job naming no term is told apart by the year it went up, so last year's doesn't absorb it.
                jk = (key, title_key(title), term or datetime.datetime.fromtimestamp(min(posted, at), datetime.timezone.utc).year)
                j = jobs.get(jk)
                if j is None or day < j[0]:
                    jobs[jk] = (day, title, j[2] if j else [])
                for place in places:
                    place = re.sub(r'\s+', ' ', place).strip()
                    if place and place not in jobs[jk][2] and len(jobs[jk][2]) < 4:
                        jobs[jk][2].append(place)
                names.setdefault(key, {}).setdefault(company, 0)
                names[key][company] += 1
            print(f'{name} {i + 1}/{len(snaps)} {len(jobs)} jobs', file=sys.stderr)
    companies = {}
    places = {}  # each distinct location list once; postings point at it
    for (key, _, term), (day, title, where) in jobs.items():
        term = term if isinstance(term, str) else None
        c = companies.setdefault(key, {'p': [], 't': []})
        c['p'].append([day, term or '', places.setdefault(' / '.join(where), len(places))])
        c['t'].append((day, title))
    out = []
    for key, c in companies.items():
        if len(c['p']) < 2:
            continue
        c['p'].sort()
        latest = sorted(c['t'], reverse=True)
        titles = list(dict.fromkeys(t for _, t in latest))[:4]
        out.append({'k': key, 'n': max(names[key], key=names[key].get), 'p': c['p'], 't': titles})
    out.sort(key=lambda c: -len(c['p']))
    doc = {
        'generatedAt': datetime.date.today().isoformat(),
        'epoch': EPOCH.isoformat(),
        'sources': ['SimplifyJobs internships list (since Aug 2023)', "negarprh's Canadian Tech Internships (since Jul 2025)", "hanzili's Canadian intern list (since Oct 2025)"],
        'places': sorted(places, key=places.get),
        'companies': out,
    }
    with open(args.out, 'w') as f:
        json.dump(doc, f, ensure_ascii=False, separators=(',', ':'))
    print(f'{len(out)} companies, {sum(len(c["p"]) for c in out)} postings -> {args.out}', file=sys.stderr)


if __name__ == '__main__':
    main()
