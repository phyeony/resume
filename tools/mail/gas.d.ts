// The slice of the Apps Script runtime the mail job uses.

declare namespace GoogleAppsScript {
  interface GmailMessage {
    getId(): string;
    getFrom(): string;
    getTo(): string;
    getSubject(): string;
    getPlainBody(): string;
    getDate(): Date;
  }
  interface GmailThread {
    getMessages(): GmailMessage[];
  }
  interface HTTPResponse {
    getResponseCode(): number;
    getContentText(): string;
  }
}

declare const GmailApp: { search(query: string, start: number, max: number): GoogleAppsScript.GmailThread[] };
declare const MailApp: { sendEmail(m: { to: string; subject: string; htmlBody: string; body: string }): void };
declare const Session: { getEffectiveUser(): { getEmail(): string } };
declare const PropertiesService: { getScriptProperties(): { getProperty(k: string): string | null } };
declare const CacheService: { getScriptCache(): { get(k: string): string | null; put(k: string, v: string, seconds: number): void } };
declare const UrlFetchApp: {
  fetch(
    url: string,
    opts: { method?: 'get' | 'post' | 'patch'; contentType?: string; payload?: string | Record<string, string>; headers?: Record<string, string>; muteHttpExceptions?: boolean },
  ): GoogleAppsScript.HTTPResponse;
};
declare const Utilities: {
  computeRsaSha256Signature(input: string, key: string): number[];
  base64EncodeWebSafe(data: string | number[]): string;
};
declare const ScriptApp: {
  getProjectTriggers(): { getHandlerFunction(): string }[];
  deleteTrigger(t: unknown): void;
  newTrigger(fn: string): { timeBased(): { everyDays(n: number): { atHour(h: number): { create(): void } } } };
};
