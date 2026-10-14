// What visitors' browsers do: fetch one published resume and log a view.
// Uses Firestore Lite (no realtime/offline) to keep the public page small.

import { addDoc, collection, doc, getDoc, getFirestore, serverTimestamp } from 'firebase/firestore/lite';
import { app } from '../firebase';
import type { PublicDoc } from '../model/types';
import { looksAutomated, visitorId } from './visit';

export const MAIN_SLUG = 'main';

const db = getFirestore(app);

/** Returns null when the doc is missing, disabled or expired (rules deny the read). */
export async function getPublic(slug: string): Promise<PublicDoc | null> {
  try {
    const snap = await getDoc(doc(db, 'public', slug));
    return snap.exists() ? (snap.data() as PublicDoc) : null;
  } catch {
    return null;
  }
}

export async function logView(slug: string): Promise<void> {
  try {
    await addDoc(collection(db, 'public', slug, 'views'), {
      at: serverTimestamp(),
      referrer: document.referrer.slice(0, 500),
      userAgent: navigator.userAgent.slice(0, 500),
      visitor: visitorId(),
      bot: looksAutomated(navigator.userAgent, navigator.webdriver),
    });
  } catch {
    // Visit logging must never break the page.
  }
}
