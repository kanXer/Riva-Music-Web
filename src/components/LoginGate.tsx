'use client';

import React, { useEffect, useState } from 'react';
import { AudioLines, UserRound } from 'lucide-react';
import {
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth';
import { getFirebaseAuth, googleProvider, isFirebaseConfigured } from '@/lib/firebase';

/** Mirrors the Android app's UserProfile (AuthRepository.kt). */
export type RivaProfile = {
  uid: string;
  name: string;
  email?: string | null;
  photoUrl?: string | null;
  isGuest: boolean;
};

const GUEST_KEY = 'riva_guest_profile';
const AUTH_EVENT = 'riva-auth';

let currentProfile: RivaProfile | null = null;

function guestFromStorage(): RivaProfile | null {
  try {
    const raw = localStorage.getItem(GUEST_KEY);
    return raw ? (JSON.parse(raw) as RivaProfile) : null;
  } catch (_) {
    return null;
  }
}

/** Current signed-in profile (Firebase user takes precedence over guest). */
export function getSession(): RivaProfile | null {
  return currentProfile;
}

/** Sign out — clears guest data and Firebase session (mirrors AuthRepository.signOut). */
export async function clearSession() {
  try { localStorage.removeItem(GUEST_KEY); } catch (_) {}
  currentProfile = null;
  window.dispatchEvent(new Event(AUTH_EVENT));
  if (isFirebaseConfigured) {
    try { await fbSignOut(getFirebaseAuth()); } catch (_) {}
  }
}

function profileFromFirebase(u: User): RivaProfile {
  return {
    uid: u.uid,
    name: u.displayName?.trim() || u.email?.split('@')[0] || 'Google User',
    email: u.email,
    photoUrl: u.photoURL,
    isGuest: false,
  };
}

/**
 * Login gate — "Continue with Google" (Firebase) + "Continue as Guest",
 * same two paths as the Android app's AuthScreen.
 */
export function LoginGate({ children }: { children: React.ReactNode }) {
  // Start unknown so SSR and first client render match (children shown);
  // the gate covers the app until a profile is resolved.
  const [checking, setChecking] = useState(true);
  const [profile, setProfile] = useState<RivaProfile | null>(null);

  useEffect(() => {
    const apply = (p: RivaProfile | null) => {
      // Only broadcast when the identity actually changed — apply() is also
      // reached via the AUTH_EVENT listener below, and re-dispatching without
      // a change would loop forever (apply → event → refresh → apply …).
      const newUid = p?.uid ?? null;
      const oldUid = currentProfile?.uid ?? null;
      const changed = newUid !== oldUid;
      currentProfile = p;
      setProfile(p);
      if (changed) window.dispatchEvent(new Event(AUTH_EVENT));
    };
    // AUTH_EVENT: guest sign-in sets currentProfile directly; re-broadcast to state
    const refresh = () => apply(currentProfile ?? guestFromStorage());

    if (isFirebaseConfigured) {
      const unsub = onAuthStateChanged(getFirebaseAuth(), (u) => {
        if (u) {
          // Firebase user wins; drop any guest data (app clears KEY_IS_GUEST too)
          try { localStorage.removeItem(GUEST_KEY); } catch (_) {}
          apply(profileFromFirebase(u));
        } else {
          apply(guestFromStorage());
        }
        setChecking(false);
      });
      window.addEventListener(AUTH_EVENT, refresh);
      return () => {
        unsub();
        window.removeEventListener(AUTH_EVENT, refresh);
      };
    }

    // Firebase not configured yet — guests only
    const boot = () => {
      apply(guestFromStorage());
      setChecking(false);
    };
    boot();
    window.addEventListener(AUTH_EVENT, refresh);
    return () => window.removeEventListener(AUTH_EVENT, refresh);
  }, []);

  if (checking || profile) return <>{children}</>;
  return <LoginScreen />;
}

/* ================= Login screen (WelcomeAuthScreen.kt port) ================= */

function LoginScreen() {
  const [showGuestDialog, setShowGuestDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'google' | null>(null);

  const signInGoogle = async () => {
    setBusy('google');
    setError(null);
    try {
      await signInWithPopup(getFirebaseAuth(), googleProvider);
      // onAuthStateChanged handles the rest
    } catch (e) {
      const code = (e as { code?: string })?.code || '';
      if (code === 'auth/unauthorized-domain') {
        setError('This domain is not authorized. Add it in Firebase console → Authentication → Settings → Authorized domains.');
      } else if (code === 'auth/configuration-not-found' || code === 'auth/invalid-api-key' || code === 'auth/api-key-not-valid') {
        setError('Firebase config is missing or invalid — check the NEXT_PUBLIC_FIREBASE_* values in .env, then restart the server.');
      } else if (code === 'auth/popup-blocked' || code === 'auth/cancelled-popup-request') {
        setError('Popup blocked by the browser — allow popups and try again.');
      } else if (code === 'auth/operation-not-allowed') {
        setError('Google sign-in is disabled for this Firebase project. Enable it under Authentication → Sign-in method.');
      } else if (code !== 'auth/popup-closed-by-user') {
        setError('Google sign-in failed. Please try again.');
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col items-center justify-between px-6 py-10 sm:py-14 overflow-hidden relative"
      style={{
        background: 'radial-gradient(120% 80% at 50% -10%, rgba(232,80,58,0.25) 0%, rgba(20,10,10,0.85) 60%, #0d0606 100%)',
      }}
    >
      {/* Background ambient lighting/glows (Apple Music aesthetic) */}
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[380px] h-[380px] bg-gradient-to-tr from-[#FF3B30]/30 to-[#FF9500]/25 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute -bottom-32 left-1/2 -translate-x-1/2 w-[340px] h-[340px] bg-gradient-to-tr from-[#AF52DE]/20 to-[#FF2D55]/25 rounded-full blur-[90px] pointer-events-none" />

      {/* Branding */}
      <div className="w-full flex-1 flex flex-col items-center justify-center relative z-10 text-center">
        <div className="relative group">
          <div className="absolute -inset-1 rounded-[30px] bg-gradient-to-tr from-[#FA233B] via-[#FB5C74] to-[#FF8A00] opacity-75 blur-xl group-hover:opacity-100 transition duration-500 animate-pulse" />
          <div
            className="relative w-24 h-24 rounded-[26px] flex items-center justify-center shadow-2xl border border-white/20"
            style={{
              background: 'linear-gradient(145deg, #FA233B 0%, #FB5C74 50%, #FF8A00 100%)',
              boxShadow: '0 20px 40px -10px rgba(250, 35, 59, 0.45)',
            }}
          >
            <AudioLines size={46} className="text-white drop-shadow-md" />
          </div>
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight text-white mt-6 font-sans">
          Riva Music
        </h1>
        <p className="text-sm font-medium text-white/60 mt-2.5 max-w-[260px] tracking-wide">
          All your music. Offline &amp; lossless streaming.
        </p>
      </div>

      {/* Auth actions card - Apple Music frosted glass style */}
      <div className="w-full max-w-sm rounded-[32px] bg-white/[0.07] border border-white/15 p-6 sm:p-7 backdrop-blur-2xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] relative z-10 flex flex-col gap-4">
        <div className="text-center pb-1">
          <h2 className="text-lg font-bold text-white tracking-tight">Welcome</h2>
          <p className="text-xs font-normal text-white/55 mt-1">Sign in to sync your playlists and favorites across devices</p>
        </div>

        {/* Continue with Google - Premium Apple-like pill button */}
        <button
          onClick={signInGoogle}
          disabled={busy !== null}
          className="group relative w-full h-[54px] rounded-full bg-white text-black text-[15px] font-semibold flex items-center justify-center gap-3 shadow-[0_10px_25px_rgba(255,255,255,0.18)] hover:bg-white/95 active:scale-[0.98] transition-all duration-200 disabled:opacity-60 overflow-hidden cursor-pointer"
        >
          {busy === 'google' ? (
            <span className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
          ) : (
            <GoogleGlyph size={20} />
          )}
          <span className="tracking-tight font-medium">Continue with Google</span>
        </button>

        {/* Apple Music Style Or Divider */}
        <div className="flex items-center gap-3 my-0.5 opacity-60">
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/25 to-white/10" />
          <span className="text-[10px] font-semibold tracking-wider text-white/45 uppercase">or</span>
          <div className="flex-1 h-px bg-gradient-to-l from-transparent via-white/25 to-white/10" />
        </div>

        {/* Continue as Guest - Sleek iOS translucent pill button */}
        <button
          onClick={() => setShowGuestDialog(true)}
          disabled={busy !== null}
          className="group w-full h-[54px] rounded-full bg-white/[0.08] hover:bg-white/[0.14] text-white text-[15px] font-medium flex items-center justify-center gap-2.5 border border-white/15 hover:border-white/25 backdrop-blur-md active:scale-[0.98] transition-all duration-200 disabled:opacity-60 cursor-pointer shadow-sm shadow-black/30"
        >
          <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-white/20 transition-colors">
            <UserRound size={14} className="text-white/90" />
          </div>
          <span className="tracking-tight text-white/90 group-hover:text-white">Continue as Guest</span>
        </button>

        {error && (
          <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-[11px] font-medium text-red-300 text-center leading-relaxed">
            {error}
          </div>
        )}
      </div>

      <p className="text-[11px] font-normal text-white/40 text-center pt-6 relative z-10">
        By continuing, you agree to our Terms and Privacy Policy
      </p>

      {showGuestDialog && <GuestNameDialog onClose={() => setShowGuestDialog(false)} />}
    </div>
  );
}

/* ================= Guest name dialog (GuestNameInputDialog.kt port) ================= */

function GuestNameDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');

  const confirm = () => {
    const finalName = name.trim() || 'Guest';
    const guest: RivaProfile = {
      uid: `guest_${Date.now()}`,
      name: finalName,
      email: null,
      photoUrl: null,
      isGuest: true,
    };
    try { localStorage.setItem(GUEST_KEY, JSON.stringify(guest)); } catch (_) {}
    currentProfile = guest;
    window.dispatchEvent(new Event(AUTH_EVENT));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-md px-6 animate-fadeIn" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xs rounded-[32px] bg-[#1C1C1E]/90 border border-white/15 p-6 flex flex-col gap-4 shadow-2xl backdrop-blur-2xl"
      >
        <div className="text-center">
          <div className="w-14 h-14 mx-auto rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-[#FA233B] shadow-inner">
            <UserRound size={26} />
          </div>
          <h3 className="text-lg font-bold text-white mt-3.5 tracking-tight">Welcome Guest</h3>
          <p className="text-xs font-normal text-white/60 mt-1">Pick a name — you can sign in anytime later.</p>
        </div>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') confirm(); }}
          placeholder="Your name"
          maxLength={24}
          className="w-full bg-white/[0.07] border border-white/15 rounded-2xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#FA233B]/80 focus:ring-1 focus:ring-[#FA233B]/50 transition-all text-center"
        />
        <div className="flex gap-2.5 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-full bg-white/10 hover:bg-white/15 text-xs font-semibold text-white/80 active:scale-[0.98] transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={confirm}
            className="flex-1 py-3 rounded-full bg-gradient-to-r from-[#FA233B] to-[#FF5E62] hover:opacity-95 text-white text-xs font-bold active:scale-[0.98] transition-all shadow-[0_4px_15px_rgba(250,35,59,0.35)] cursor-pointer"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================= Google "G" glyph ================= */

function GoogleGlyph({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
