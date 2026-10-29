import type { FirebaseOptions } from 'firebase/app';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

/**
 * Firebase config — same project as the Android app (AuthRepository.kt uses
 * FirebaseAuth for Google sign-in). Fill these in .env:
 *   NEXT_PUBLIC_FIREBASE_API_KEY / AUTH_DOMAIN / PROJECT_ID /
 *   STORAGE_BUCKET / MESSAGING_SENDER_ID / APP_ID
 * The values are the web-specific ones from Firebase console → Project settings.
 */
export const firebaseConfig: FirebaseOptions | null =
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
  process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN &&
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
  process.env.NEXT_PUBLIC_FIREBASE_APP_ID
    ? {
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
      }
    : null;

export const isFirebaseConfigured = firebaseConfig !== null;

let authInstance: ReturnType<typeof getAuth> | null = null;

export function getFirebaseAuth() {
  if (!firebaseConfig) throw new Error('Firebase is not configured (.env missing NEXT_PUBLIC_FIREBASE_* values)');
  if (!authInstance) {
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    authInstance = getAuth(app);
  }
  return authInstance;
}

export const googleProvider = new GoogleAuthProvider();
