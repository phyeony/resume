// LinkedIn job alerts read straight from Gmail by the Leads page's import, with a read-only token from
// signing in again (see gmailToken in pages/admin/auth.ts).

import type { FeedJob } from './feeds';
import { parseLinkedInAlert } from './linkedin';
import type { MailMessage } from './mail';

const API = 'https://gmail.googleapis.com/gmail/v1/users/me/messages';
const SENDERS = ['jobalerts-noreply@linkedin.com', 'jobs-listings@linkedin.com', 'jobs-noreply@linkedin.com'];

export class GmailAuthExpired extends Error {}

/** The part of Gmail's message resource that's read here. */
export interface GmailPart {
  mimeType?: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string };
  parts?: GmailPart[];
}

export interface GmailMessage {
  id: string;
  internalDate: string;
  payload: GmailPart;
}

/** Base64url (Gmail's encoding) to UTF-8 text. */
export function decodeBase64Url(data: string): string {
  const bin = atob(data.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

function plainPart(p: GmailPart): string | undefined {
  if (p.mimeType === 'text/plain' && p.body?.data) return decodeBase64Url(p.body.data);
  for (const child of p.parts ?? []) {
    const text = plainPart(child);
    if (text !== undefined) return text;
  }
  return undefined;
}

/** As the mail rules read emails; the body is the plain-text part, empty when the email has none. */
export function toMailMessage(m: GmailMessage): MailMessage {
  const header = (name: string) => m.payload.headers?.find((h) => h.name.toLowerCase() === name)?.value ?? '';
  return { id: m.id, from: header('from'), to: header('to'), subject: header('subject'), body: plainPart(m.payload) ?? '', date: Number(m.internalDate) };
}

async function call<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) throw new GmailAuthExpired('Gmail sign-in expired. Click Import again to renew it.');
  if (!res.ok) {
    const detail = ((await res.json().catch(() => null)) as { error?: { message?: string } } | null)?.error?.message;
    throw new Error(`Gmail: ${res.status} ${detail ?? res.statusText}`);
  }
  return (await res.json()) as T;
}

/** Jobs in the LinkedIn alerts of the last `days` days. */
export async function fetchLinkedInAlerts(token: string, days: number): Promise<FeedJob[]> {
  const q = encodeURIComponent(`from:(${SENDERS.join(' OR ')}) newer_than:${Math.max(1, Math.ceil(days))}d`);
  const ids: string[] = [];
  let page = '';
  do {
    const r = await call<{ messages?: { id: string }[]; nextPageToken?: string }>(token, `?q=${q}&maxResults=100${page ? `&pageToken=${page}` : ''}`);
    ids.push(...(r.messages ?? []).map((m) => m.id));
    page = r.nextPageToken ?? '';
  } while (page && ids.length < 300);

  const messages: MailMessage[] = [];
  for (let i = 0; i < ids.length; i += 10) {
    const batch = await Promise.all(ids.slice(i, i + 10).map((id) => call<GmailMessage>(token, `/${id}?format=full`)));
    messages.push(...batch.map(toMailMessage));
  }
  if (messages.length && messages.every((m) => !m.body.trim())) throw new Error(`Found ${messages.length} LinkedIn alerts, but none has a plain-text version to read.`);
  return messages.flatMap(parseLinkedInAlert);
}
