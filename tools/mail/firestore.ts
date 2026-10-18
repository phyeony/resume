// Firestore over REST from Apps Script, signed in as a service account (bypasses the owner-only rules,
// so the key stays in Script Properties and nowhere else).

type Value =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { stringValue: string }
  | { arrayValue: { values?: Value[] } }
  | { mapValue: { fields?: Record<string, Value> } };

export type Fields = Record<string, Value>;

export function toValue(x: unknown): Value {
  if (x === null || x === undefined) return { nullValue: null };
  if (typeof x === 'boolean') return { booleanValue: x };
  if (typeof x === 'number') return Number.isInteger(x) ? { integerValue: String(x) } : { doubleValue: x };
  if (typeof x === 'string') return { stringValue: x };
  if (Array.isArray(x)) return { arrayValue: { values: x.map(toValue) } };
  return { mapValue: { fields: toFields(x as Record<string, unknown>) } };
}

/** Undefined fields are left out, like the web SDK does. */
export function toFields(o: Record<string, unknown>): Fields {
  const out: Fields = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = toValue(v);
  return out;
}

export function fromValue(v: Value): unknown {
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('stringValue' in v) return v.stringValue;
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(fromValue);
  if ('mapValue' in v) return fromFields(v.mapValue.fields ?? {});
  return null; // timestamps, references: not used by these collections
}

export function fromFields(f: Fields): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(f)) out[k] = fromValue(v);
  return out;
}

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

export interface Doc<T> {
  data: T;
  updateTime: string;
}

export type Write =
  | { update: { name: string; fields: Fields }; updateMask?: { fieldPaths: string[] }; currentDocument?: { exists?: boolean; updateTime?: string } };

export class Firestore {
  private readonly base: string;
  readonly root: string;

  constructor(private readonly sa: ServiceAccount) {
    this.root = `projects/${sa.project_id}/databases/(default)/documents`;
    this.base = `https://firestore.googleapis.com/v1/${this.root}`;
  }

  private token(): string {
    const cache = CacheService.getScriptCache();
    const cached = cache.get('fs-token');
    if (cached) return cached;
    const now = Math.floor(Date.now() / 1000);
    const b64 = (s: string | number[]) => Utilities.base64EncodeWebSafe(s).replace(/=+$/, '');
    const head = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = b64(
      JSON.stringify({ iss: this.sa.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }),
    );
    const sig = b64(Utilities.computeRsaSha256Signature(`${head}.${claims}`, this.sa.private_key));
    const res = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
      method: 'post',
      payload: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claims}.${sig}` },
      muteHttpExceptions: true,
    });
    if (res.getResponseCode() !== 200) throw new Error(`Service account sign-in failed: ${res.getContentText()}`);
    const token = (JSON.parse(res.getContentText()) as { access_token: string }).access_token;
    cache.put('fs-token', token, 3000);
    return token;
  }

  private call<T>(method: 'get' | 'post', path: string, body?: unknown): T {
    const res = UrlFetchApp.fetch(`${this.base}${path}`, {
      method,
      contentType: 'application/json',
      headers: { Authorization: `Bearer ${this.token()}` },
      ...(body ? { payload: JSON.stringify(body) } : {}),
      muteHttpExceptions: true,
    });
    if (res.getResponseCode() >= 300) throw new Error(`Firestore ${method} ${path}: ${res.getResponseCode()} ${res.getContentText()}`);
    return JSON.parse(res.getContentText() || '{}') as T;
  }

  name = (collection: string, id: string) => `${this.root}/${collection}/${id}`;

  list<T>(collection: string): Doc<T>[] {
    const out: Doc<T>[] = [];
    let pageToken = '';
    do {
      const r = this.call<{ documents?: { fields?: Fields; updateTime: string }[]; nextPageToken?: string }>(
        'get',
        `/${collection}?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`,
      );
      for (const d of r.documents ?? []) out.push({ data: fromFields(d.fields ?? {}) as T, updateTime: d.updateTime });
      pageToken = r.nextPageToken ?? '';
    } while (pageToken);
    return out;
  }

  /** Which of these ids already exist. */
  existing(collection: string, ids: string[]): Set<string> {
    const found = new Set<string>();
    for (let i = 0; i < ids.length; i += 100) {
      const r = this.call<{ found?: { name: string } }[]>('post', ':batchGet', { documents: ids.slice(i, i + 100).map((id) => this.name(collection, id)) });
      for (const x of r) if (x.found) found.add(x.found.name.split('/').pop()!);
    }
    return found;
  }

  /** All or nothing; returns each write's new update time. */
  commit(writes: Write[]): string[] {
    const r = this.call<{ writeResults?: { updateTime?: string }[] }>('post', ':commit', { writes });
    return (r.writeResults ?? []).map((w) => w.updateTime ?? '');
  }
}
