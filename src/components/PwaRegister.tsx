'use client';

import React, { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

type InstallPromptEvent = Event & {
  prompt: () => void;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const DISMISS_KEY = 'riva_install_dismissed';

/**
 * Registers the service worker (PWA installability) and shows an in-app
 * "Install App" pill when the browser fires beforeinstallprompt.
 * The native mini-infobar is unreliable; this custom pill guarantees visibility.
 */
export default function PwaRegister() {
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    // Service worker registration — production only.
    // In dev, service workers are bypassed so live reload works seamlessly.
    if ('serviceWorker' in navigator) {
      if (process.env.NODE_ENV === 'production') {
        const register = async () => {
          try {
            const reg = await navigator.serviceWorker.register('/sw.js');
            // Trigger automatic update check
            reg.update();

            // When new service worker is waiting, tell it to take control immediately
            if (reg.waiting) {
              reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            }

            reg.addEventListener('updatefound', () => {
              const installing = reg.installing;
              if (installing) {
                installing.addEventListener('statechange', () => {
                  if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                    installing.postMessage({ type: 'SKIP_WAITING' });
                  }
                });
              }
            });
          } catch (_) {}
        };

        if (document.readyState === 'complete') register();
        else window.addEventListener('load', register, { once: true });

        // Auto reload or refresh client when worker updates
        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (!refreshing) {
            refreshing = true;
            window.location.reload();
          }
        });
      } else {
        // In development: unregister any leftover service workers to avoid stale caches
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          for (const registration of registrations) {
            registration.unregister();
          }
        }).catch(() => undefined);
      }
    }

    // Respect a previous dismissal (per session)
    const checkDismissed = () => {
      try {
        if (sessionStorage.getItem(DISMISS_KEY) !== '1') setDismissed(false);
      } catch (_) {
        setDismissed(false);
      }
    };
    checkDismissed();

    // Capture the browser's install prompt
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as InstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    const onInstalled = () => {
      setInstallEvent(null);
      setDismissed(true);
    };
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
  };

  const dismiss = () => {
    setDismissed(true);
    try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch (_) {}
  };

  if (!installEvent || dismissed) return null;

  return (
    <div className="fixed bottom-20 right-3 z-30 flex items-center gap-2 pl-3 pr-1.5 py-1.5 rounded-full bg-[var(--color-panel-elevated)] border border-[var(--color-lime)]/40 shadow-xl backdrop-blur-xl animate-[rivaSwapUp_0.4s_cubic-bezier(0.22,1,0.36,1)_both]">
      <button onClick={install} className="flex items-center gap-2 text-xs font-bold text-[var(--color-text-primary)] active:scale-95 transition-transform">
        <Download size={15} className="text-[var(--color-lime)]" />
        Install App
      </button>
      <button onClick={dismiss} className="p-1.5 rounded-full text-[var(--color-text-faint)] hover:text-[var(--color-text-primary)]" title="Dismiss">
        <X size={13} />
      </button>
    </div>
  );
}
