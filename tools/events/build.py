"""Builds src/events/events.json: dev and tech events in Vancouver, Seoul and online, for the Events page.

Two inputs:
  * tools/events/captured.json: events copied from Luma, Meetup and Eventbrite. Those sites refuse the
    machines this usually runs on, so they are copied from a browser and kept here.
  * brave-people/Dev-Event on GitHub: the community list of Korean developer events, fetched fresh. Only
    Seoul-area and online events are kept.

    python3 tools/events/build.py                 # fetch Dev-Event and write src/events/events.json
    python3 tools/events/build.py --dev-event FILE # use a saved copy of the Dev-Event README
"""
import argparse, datetime, json, os, re, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CAPTURED = os.path.join(ROOT, 'tools', 'events', 'captured.json')
OUT = os.path.join(ROOT, 'src', 'events', 'events.json')
DEV_EVENT = 'https://raw.githubusercontent.com/brave-people/Dev-Event/master/README.md'

# The offset each region's local times are in, as the sites showed them in Nov 2026 (BC keeps UTC-7 all year now).
OFFSETS = {'van': '-07:00', 'seoul': '+09:00'}
# Seoul is only worth listing while you're there.
SEOUL_UNTIL = '2026-12-25'
SOURCES = {'L': 'Luma', 'M': 'Meetup', 'E': 'Eventbrite', 'D': 'Dev-Event'}
# Places near enough to Seoul to count, as Dev-Event writes them.
SEOUL_AREA = {'서울': 'Seoul', '경기': 'Gyeonggi', '인천': 'Incheon'}


def url_of(src, ref):
    if ref.startswith('http'):
        return ref
    if src == 'L':
        return 'https://luma.com/' + ref
    if src == 'M':
        return 'https://www.meetup.com/' + ref + ('' if ref.endswith('/') else '/')
    if src == 'E':
        return 'https://www.eventbrite.ca/e/' + ref
    raise ValueError(src)


def iso(day_time, offset):
    """'2026-11-21 10:00' (+ '-05:00' already on it, or the region's) -> '2026-11-21T10:00:00-07:00'."""
    m = re.fullmatch(r'(\d{4}-\d\d-\d\d) (\d\d:\d\d)([+-]\d\d:\d\d)?', day_time)
    if not m:
        raise ValueError(day_time)
    return f'{m.group(1)}T{m.group(2)}:00{m.group(3) or offset}'


def end_iso(start, hhmm):
    """The end on the start's day, or the next day when it's earlier than the start (a hackathon past midnight)."""
    if not hhmm:
        return None
    day = datetime.datetime.fromisoformat(start)
    end = day.replace(hour=int(hhmm[:2]), minute=int(hhmm[3:]))
    if end <= day:
        end += datetime.timedelta(days=1)
    return end.isoformat()


def captured():
    with open(CAPTURED, encoding='utf-8') as f:
        data = json.load(f)
    out = []
    for src, region, start, end, title, city, online, ref, host in data['events']:
        s = iso(start, OFFSETS.get(region, ''))
        out.append({
            'title': title, 'start': s, 'end': end_iso(s, end), 'city': city, 'region': region,
            'online': bool(online), 'url': url_of(src, ref), 'host': host, 'source': SOURCES[src],
        })
    return data['capturedAt'], out


DATE = r'(\d\d)\. (\d\d)\([^)]*\)(?: (\d\d:\d\d))?'


def dev_event(text):
    """Events from the Dev-Event README: '## `26년 11월`' sections of '- __[title](url)__' items."""
    out = []
    year = month = None
    item = None

    def flush():
        if item and item.get('start'):
            out.append(item)

    for line in text.splitlines():
        h = re.match(r'## `(\d\d)년 (\d\d?)월`', line)
        if h:
            flush()
            item = None
            year, month = 2000 + int(h.group(1)), int(h.group(2))
            continue
        if line.startswith('## '):  # past events, contributors, ...
            flush()
            item = None
            year = None
            continue
        if year is None:
            continue
        t = re.match(r'- __\[(.+)\]\((\S+)\)__', line.strip())
        if t:
            flush()
            item = {'title': t.group(1), 'url': t.group(2), 'tags': [], 'source': 'Dev-Event', 'host': '', 'city': '', 'online': False}
            continue
        if not item:
            continue
        body = line.strip().lstrip('- ').strip()
        if body.startswith('분류:'):
            item['tags'] = re.findall(r'`([^`]+)`', body)
        elif body.startswith('주최:'):
            item['host'] = body[3:].strip()
        elif body.startswith(('일시:', '접수:')):
            dates = re.findall(DATE, body)
            if not dates:
                continue

            def at(mm, dd, hhmm):
                y = year - 1 if int(mm) - month > 6 else year + 1 if month - int(mm) > 6 else year
                return f'{y}-{mm}-{dd}T{hhmm or "00:00"}:00+09:00'

            if body.startswith('일시:'):
                item['start'] = at(*dates[0])
                if len(dates) > 1:
                    item['end'] = at(*dates[1])
                item['allDay'] = not dates[0][2]
            else:
                # Only the registration window is known: list it on its last day, as a deadline.
                item['start'] = at(*dates[-1])
                item['deadline'] = True
                item['allDay'] = not dates[-1][2]
    flush()

    kept = []
    for e in out:
        places = [m.group(1) for t in e['tags'] for m in [re.match(r'오프라인\(([^)]+)\)', t)] if m]
        online = '온라인' in e['tags']
        where = next((p for p in places if p.split()[0] in SEOUL_AREA), None)
        if where:
            area, *rest = where.split()
            e['city'] = SEOUL_AREA[area] + (f' ({" ".join(rest)})' if rest else '')
            e['region'] = 'seoul'
            e['online'] = online
        elif online and not places:
            e['region'] = 'online'
            e['online'] = True
            e['audience'] = 'kr'
        else:
            continue  # somewhere else in Korea
        e['tags'] = [t for t in e['tags'] if not t.startswith(('오프라인', '온라인'))]
        kept.append(e)
    return kept


def key(url):
    return re.sub(r'^https?://(www\.)?', '', url).rstrip('/').lower()


def norm(title):
    return re.sub(r'[^0-9a-z가-힣]', '', title.lower())


def same_event(a, b):
    """One list's copy of another's event: a title inside the other's, within a week, in the same region."""
    x, y = norm(a['title']), norm(b['title'])
    if a['region'] != b['region'] or min(len(x), len(y)) < 8 or not (x in y or y in x):
        return False
    gap = datetime.datetime.fromisoformat(a['start']) - datetime.datetime.fromisoformat(b['start'])
    return abs(gap) <= datetime.timedelta(days=7)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dev-event', help='a saved copy of the Dev-Event README instead of fetching it')
    args = ap.parse_args()

    captured_at, events = captured()
    if args.dev_event:
        with open(args.dev_event, encoding='utf-8') as f:
            readme = f.read()
    else:
        with urllib.request.urlopen(DEV_EVENT, timeout=30) as r:
            readme = r.read().decode('utf-8')
    seen = {key(e['url']): e for e in events}
    added = 0
    for e in dev_event(readme):
        same = seen.get(key(e['url'])) or next((c for c in events if same_event(c, e)), None)
        if same:
            same['tags'] = e['tags']  # Dev-Event's kind and topic help classify it
            continue
        seen[key(e['url'])] = e
        events.append(e)
        added += 1

    today = datetime.date.fromisoformat(captured_at)
    kept = []
    for e in events:
        day = e['start'][:10]
        if (e.get('end') or e['start'])[:10] < today.isoformat():
            continue
        if e['region'] == 'seoul' and day > SEOUL_UNTIL:
            continue
        if e.get('audience') == 'kr' and day > SEOUL_UNTIL:
            continue
        kept.append({k: v for k, v in e.items() if v not in (None, '', [], False)})
    kept.sort(key=lambda e: datetime.datetime.fromisoformat(e['start']))
    for i, e in enumerate(kept):
        e['id'] = f'{i:03d}'

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump({
            'generatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'),
            'capturedAt': captured_at,
            'seoulUntil': SEOUL_UNTIL,
            'sources': ['Luma', 'Meetup', 'Eventbrite', 'Dev-Event (github.com/brave-people/Dev-Event)'],
            'events': kept,
        }, f, ensure_ascii=False, indent=0)
        f.write('\n')
    print(f'{len(kept)} events ({added} from Dev-Event) -> {os.path.relpath(OUT, ROOT)}', file=sys.stderr)


if __name__ == '__main__':
    main()
