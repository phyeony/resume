import { initializeApp } from 'firebase/app';

// Web config is public by design; access is enforced by firestore.rules.
export const app = initializeApp({
  apiKey: 'AIzaSyAsSNv_ljWUlS0rU2hK_eNsj69jM323jKA',
  authDomain: 'hyeonyoung-park-resume.firebaseapp.com',
  projectId: 'hyeonyoung-park-resume',
  storageBucket: 'hyeonyoung-park-resume.firebasestorage.app',
  messagingSenderId: '623299528746',
  appId: '1:623299528746:web:40c24127d890f415539b53',
});

/** Must match the email in firestore.rules. */
export const OWNER_EMAIL = 'phyeony@gmail.com';

/**
 * Set on this device once I sign in to the editor, so my own visits to company links
 * aren't counted. Kept out of Firebase Auth to keep the public page's bundle small.
 */
const OWNER_DEVICE_KEY = 'resume-studio:owner-device';

export function markOwnerDevice() {
  try {
    localStorage.setItem(OWNER_DEVICE_KEY, '1');
  } catch {
    // storage unavailable (private mode): views from this device will count
  }
}

export function isOwnerDevice(): boolean {
  try {
    return localStorage.getItem(OWNER_DEVICE_KEY) === '1';
  } catch {
    return false;
  }
}
