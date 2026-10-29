'use client';

import React, { useState } from 'react';
import { useMusic, ALL_LANGUAGES, AVAILABLE_REGIONS } from '@/context/MusicContext';
import { X, Check, Languages } from 'lucide-react';

const NATIVE_NAMES: Record<string, string> = {
  Hindi: 'हिंदी',
  English: 'English',
  Punjabi: 'ਪੰਜਾਬੀ',
  Bhojpuri: 'भोजपुरी',
  Haryanvi: 'हरियाणवी',
  Tamil: 'தமிழ்',
  Telugu: 'తెలుగు',
  Malayalam: 'മലയാളം',
  Kannada: 'ಕನ್ನಡ',
  Bengali: 'বাংলা',
  Marathi: 'मराठी',
  Gujarati: 'ગુજરાતી',
  Rajasthani: 'राजस्थानी',
  Urdu: 'اردو'
};

interface LanguageModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// LanguageDialog.kt — Region & Music Languages (94% width, r28, PanelElevated)
export function LanguageModal({ isOpen, onClose }: LanguageModalProps) {
  const { selectedLanguages, setSelectedLanguages, selectedRegion, setSelectedRegion } = useMusic();
  const [draftLangs, setDraftLangs] = useState<string[]>(selectedLanguages);
  const [draftRegion, setDraftRegion] = useState(selectedRegion);

  if (!isOpen) return null;

  const toggleLanguage = (lang: string) => {
    setDraftLangs(prev => {
      if (prev.includes(lang)) {
        if (prev.length === 1) return prev; // min 1 language enforced
        return prev.filter(l => l !== lang);
      }
      return [...prev, lang];
    });
  };

  const apply = () => {
    setSelectedRegion(draftRegion);
    setSelectedLanguages(draftLangs);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xl flex items-center justify-center p-4">
      <div className="w-full max-w-md max-h-[88vh] overflow-y-auto bg-[var(--color-panel-elevated)] border border-[var(--color-panel-border)] rounded-[28px] p-5 shadow-2xl flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-[var(--color-lime)]/[0.16] flex items-center justify-center text-[var(--color-lime)] shrink-0">
              <Languages size={22} />
            </div>
            <div>
              <h3 className="text-lg font-black text-[var(--color-text-primary)] leading-tight">Region &amp; Music Languages</h3>
              <p className="text-[11px] text-[var(--color-text-faint)] mt-0.5">
                Apna country aur pasandida bhashayein chunein for trending &amp; personalized songs
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-full text-[var(--color-text-faint)] hover:text-[var(--color-text-primary)]">
            <X size={20} />
          </button>
        </div>

        {/* Region pills */}
        <div>
          <p className="text-[10px] font-black text-[var(--color-lime)] tracking-wide mb-2">
            COUNTRY / REGION
          </p>
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
            {AVAILABLE_REGIONS.map(r => {
              const selected = draftRegion === r.code;
              return (
                <button
                  key={r.code}
                  onClick={() => setDraftRegion(r.code)}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-[13px] text-[11px] font-bold shrink-0 border transition-all ${
                    selected
                      ? 'bg-[var(--color-lime)]/[0.22] border-[1.5px] border-[var(--color-lime)] text-[var(--color-lime)]'
                      : 'bg-[var(--color-panel)] border-[var(--color-panel-border)] text-[var(--color-text-secondary)]'
                  }`}
                >
                  {selected && <Check size={12} />}
                  {r.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Languages grid */}
        <div>
          <p className="text-[10px] font-black text-[var(--color-lime)] tracking-wide mb-2">
            PREFERRED LANGUAGES ({draftLangs.length} selected)
          </p>
          <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
            {ALL_LANGUAGES.map(lang => {
              const selected = draftLangs.includes(lang);
              return (
                <button
                  key={lang}
                  onClick={() => toggleLanguage(lang)}
                  className={`flex items-center justify-between p-2.5 rounded-[14px] text-xs font-bold border-[1.5px] transition-all ${
                    selected
                      ? 'bg-[var(--color-lime)]/[0.18] border-[var(--color-lime)] text-[var(--color-lime)]'
                      : 'bg-[var(--color-panel)] border-[var(--color-panel-border)]/70 text-[var(--color-text-primary)]'
                  }`}
                >
                  <span className="flex flex-col items-start leading-tight">
                    {lang}
                    <span className="text-[9px] font-medium opacity-70">{NATIVE_NAMES[lang]}</span>
                  </span>
                  <span className={`w-5 h-5 rounded-full border-[1.5px] flex items-center justify-center shrink-0 ${
                    selected ? 'bg-[var(--color-lime)] border-[var(--color-lime)]' : 'border-[var(--color-text-faint)]/50'
                  }`}>
                    {selected && <Check size={12} className="text-[var(--color-ink)]" />}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={onClose}
            className="px-4 py-3 rounded-[14px] text-xs font-bold text-[var(--color-text-secondary)]"
          >
            Later
          </button>
          <button
            onClick={apply}
            className="flex-1 py-3 rounded-[14px] bg-[var(--color-lime)] text-[var(--color-ink)] font-black text-sm active:scale-[0.98] transition-all shadow-lg shadow-[var(--color-lime)]/25"
          >
            Apply &amp; Explore
          </button>
        </div>
      </div>
    </div>
  );
}
