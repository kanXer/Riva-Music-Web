'use client';

import React from 'react';
import Image from 'next/image';
import { useMusic, AVAILABLE_REGIONS } from '@/context/MusicContext';
import { RivaProfile, clearSession } from '@/components/LoginGate';
import { getFirebaseAuth, googleProvider, isFirebaseConfigured } from '@/lib/firebase';
import { signInWithPopup } from 'firebase/auth';
import {
  X,
  CheckCircle,
  CloudCheck,
  Sun,
  Moon,
  Laptop,
  Languages,
  LogOut,
  Sparkles,
  UserRound
} from 'lucide-react';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: RivaProfile | null;
  onOpenLanguages: () => void;
}

export function ProfileModal({ isOpen, onClose, profile, onOpenLanguages }: ProfileModalProps) {
  const {
    themeMode,
    setThemeMode,
    selectedRegion,
    selectedLanguages
  } = useMusic();

  if (!isOpen) return null;

  const isGuest = profile?.isGuest ?? true;
  const displayName = profile?.name || 'Guest User';
  const email = profile?.email;
  const photoUrl = profile?.photoUrl;

  const currentRegionObj = AVAILABLE_REGIONS.find(r => r.code === selectedRegion);

  const handleGoogleSignIn = async () => {
    if (!isFirebaseConfigured) {
      alert('Firebase is not configured yet.');
      return;
    }
    try {
      await signInWithPopup(getFirebaseAuth(), googleProvider);
      onClose();
    } catch (e) {
      console.error('Sign in failed:', e);
    }
  };

  const handleSignOut = () => {
    clearSession();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-[fadeIn_0.2s_ease-out]"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-[var(--color-panel-elevated)] border-t sm:border border-[var(--color-panel-border)] rounded-t-[32px] sm:rounded-[32px] p-6 max-h-[90vh] overflow-y-auto no-scrollbar shadow-2xl flex flex-col gap-4 animate-[slideUp_0.25s_cubic-bezier(0.16,1,0.3,1)]"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-[var(--color-text-primary)]">My Profile</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/[0.08] hover:bg-white/[0.15] flex items-center justify-center text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* User Card */}
        <div className="rounded-2xl bg-[var(--color-panel)] border border-[var(--color-panel-border)] p-4 flex flex-col items-center text-center">
          <div className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-[var(--color-lime)] bg-[var(--color-panel-elevated)] flex items-center justify-center mb-3 shadow-inner">
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrl}
                alt={displayName}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="text-2xl font-black text-[var(--color-lime)]">
                {displayName.charAt(0).toUpperCase()}
              </span>
            )}
          </div>

          <h3 className="text-base font-bold text-[var(--color-text-primary)] max-w-full truncate">
            {displayName}
          </h3>
          {email && (
            <p className="text-xs text-[var(--color-text-secondary)] max-w-full truncate mt-0.5">
              {email}
            </p>
          )}

          {/* Account Badge */}
          <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-white/[0.06] border border-white/[0.1]">
            {!isGuest ? (
              <>
                <CheckCircle size={13} className="text-[var(--color-lime)]" />
                <span className="text-[var(--color-lime)]">Google Account • Cloud Synced</span>
              </>
            ) : (
              <>
                <UserRound size={13} className="text-[var(--color-text-secondary)]" />
                <span className="text-[var(--color-text-secondary)]">Guest Mode</span>
              </>
            )}
          </div>
        </div>

        {/* Guest Upgrade / Cloud Synced Banner */}
        {isGuest ? (
          <button
            onClick={handleGoogleSignIn}
            className="w-full p-3.5 rounded-2xl bg-[var(--color-lime)]/10 border border-[var(--color-lime)]/30 hover:bg-[var(--color-lime)]/15 transition-colors flex items-center gap-3 text-left"
          >
            <div className="w-10 h-10 rounded-xl bg-[var(--color-lime)]/20 text-[var(--color-lime)] flex items-center justify-center shrink-0">
              <Sparkles size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-bold text-[var(--color-text-primary)]">Sign in with Google</h4>
              <p className="text-[10px] text-[var(--color-text-secondary)] truncate">
                Sync offline songs & playlists across your devices
              </p>
            </div>
          </button>
        ) : (
          <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-[var(--color-panel-border)] flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--color-lime)]/15 text-[var(--color-lime)] flex items-center justify-center shrink-0">
              <CloudCheck size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-bold text-[var(--color-text-primary)]">Cloud Synced</h4>
              <p className="text-[10px] text-[var(--color-text-secondary)] leading-snug">
                Your playlists, likes, and settings sync automatically.
              </p>
            </div>
          </div>
        )}

        {/* Appearance Settings (Theme Selector) */}
        <div className="rounded-2xl bg-[var(--color-panel)] border border-[var(--color-panel-border)] p-3.5 flex flex-col gap-2.5">
          <div className="flex items-center gap-2 text-xs font-bold text-[var(--color-text-primary)]">
            <Sun size={15} className="text-[var(--color-lime)]" />
            <span>Appearance Theme</span>
          </div>
          <div className="grid grid-cols-3 gap-2 bg-white/[0.04] p-1 rounded-xl">
            {[
              { id: 'SYSTEM' as const, label: 'System', icon: <Laptop size={14} /> },
              { id: 'LIGHT' as const, label: 'Light', icon: <Sun size={14} /> },
              { id: 'DARK' as const, label: 'Dark', icon: <Moon size={14} /> }
            ].map(tab => {
              const active = themeMode === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setThemeMode(tab.id)}
                  className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    active
                      ? 'bg-[var(--color-lime)] text-[var(--color-ink)] shadow-sm'
                      : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Language & Region Action */}
        <button
          onClick={() => {
            onClose();
            onOpenLanguages();
          }}
          className="w-full rounded-2xl bg-[var(--color-panel)] border border-[var(--color-panel-border)] p-3.5 hover:bg-white/[0.04] transition-colors flex items-center gap-3 text-left"
        >
          <div className="w-10 h-10 rounded-xl bg-white/[0.06] text-[var(--color-lime)] flex items-center justify-center shrink-0">
            <Languages size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-xs font-bold text-[var(--color-text-primary)]">Languages & Region</h4>
            <p className="text-[10px] text-[var(--color-text-secondary)] truncate">
              {currentRegionObj?.name || 'India'} • {selectedLanguages.slice(0, 3).join(', ')}
            </p>
          </div>
        </button>

        {/* Sign Out / Switch Account */}
        <button
          onClick={handleSignOut}
          className="w-full mt-2 py-3 rounded-xl bg-[var(--color-coral)]/15 border border-[var(--color-coral)]/30 text-[var(--color-coral)] hover:bg-[var(--color-coral)]/25 text-xs font-bold flex items-center justify-center gap-2 transition-colors active:scale-98"
        >
          <LogOut size={16} />
          <span>{isGuest ? 'Switch Account / Sign In' : 'Sign Out'}</span>
        </button>
      </div>
    </div>
  );
}
