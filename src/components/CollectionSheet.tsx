'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { useMusic } from '@/context/MusicContext';
import { Track } from '@/types';
import {
  Play,
  Shuffle,
  ChevronDown,

  Music,
  User,
  Disc3,
  ListMusic,
  CheckCircle2,
  Loader2
} from 'lucide-react';

interface CollectionSheetProps {
  browseId: string;
  fallbackTitle?: string;
  onClose: () => void;
}

// Playlists.kt CollectionSheet — Ink background sheet, header + pill row + track list
export function CollectionSheet({ browseId, fallbackTitle, onClose }: CollectionSheetProps) {
  const { playTrack, currentTrack, toggleLike, isLiked } = useMusic();
  const [title, setTitle] = useState(fallbackTitle || 'Loading...');
  const [subtitle, setSubtitle] = useState('Opening on YouTube Music...');
  const [tracks, setTracks] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/collection?browseId=${encodeURIComponent(browseId)}&title=${encodeURIComponent(fallbackTitle || '')}`);
        const data = await res.json();
        if (!active) return;
        if (!res.ok) {
          setError(data.error || 'Kuch galat ho gaya');
        } else {
          setTitle(data.title || fallbackTitle || 'Collection');
          setSubtitle(data.subtitle || `${data.tracks?.length || 0} tracks`);
          setTracks(data.tracks || []);
        }
      } catch (err: unknown) {
        if (active) setError(err instanceof Error ? err.message : 'Kuch galat ho gaya');
      } finally {
        if (active) setIsLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [browseId, fallbackTitle]);

  const iconFor = () => {
    if (browseId.startsWith('UC')) return <User size={22} />;
    if (browseId.startsWith('MP')) return <Disc3 size={22} />;
    return <ListMusic size={22} />;
  };

  return (
    <div className="fixed inset-0 z-[55] bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="absolute bottom-0 left-0 right-0 h-[89%] bg-[var(--color-ink)] rounded-t-3xl border-t border-[var(--color-panel-border)] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-2 shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-14 h-14 rounded-2xl bg-[var(--color-panel-elevated)] border border-[var(--color-panel-border)] flex items-center justify-center text-[var(--color-lime)] shrink-0 overflow-hidden">
              {tracks[0]?.thumbnailUrl ? (
                <Image src={tracks[0].thumbnailUrl} alt={title} width={56} height={56} className="object-cover" />
              ) : (
                iconFor()
              )}
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-black text-[var(--color-text-primary)] line-clamp-2">{title}</h2>
              <p className="text-[11px] font-bold text-[var(--color-lime)] mt-0.5">{isLoading ? subtitle : (subtitle || `${tracks.length} tracks`)}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-[var(--color-panel)] border border-[var(--color-panel-border)] text-[var(--color-text-primary)] flex items-center justify-center shrink-0">
            <ChevronDown size={18} />
          </button>
        </div>

        {/* Pill action row: Play / Shuffle */}
        <div className="flex gap-2 px-5 py-2 shrink-0">
          <button
            disabled={tracks.length === 0}
            onClick={() => { playTrack(tracks[0], tracks, false); }}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-full bg-[var(--color-lime)] text-[var(--color-ink)] text-xs font-black disabled:bg-[var(--color-panel)] disabled:text-[var(--color-text-faint)] active:scale-[0.98] transition-all"
          >
            <Play size={14} className="fill-current" /> Play
          </button>
          <button
            disabled={tracks.length === 0}
            onClick={() => {
              const first = tracks[Math.floor(Math.random() * tracks.length)];
              playTrack(first, tracks, true);
            }}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-full bg-[var(--color-lime)] text-[var(--color-ink)] text-xs font-black disabled:bg-[var(--color-panel)] disabled:text-[var(--color-text-faint)] active:scale-[0.98] transition-all"
          >
            <Shuffle size={14} /> Shuffle
          </button>
        </div>

        {/* Track list */}
        <div className="flex-1 overflow-y-auto px-3 pb-6 flex flex-col gap-1">
          {isLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16 text-xs text-[var(--color-text-faint)]">
              <Loader2 size={22} className="animate-spin text-[var(--color-lime)]" />
              Opening on YouTube Music...
            </div>
          ) : error ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 py-16 px-8 text-center">
              <Music size={26} className="text-[var(--color-coral)]" />
              <p className="text-sm font-bold text-[var(--color-text-primary)]">{error}</p>
            </div>
          ) : tracks.length === 0 ? (
            <p className="text-center text-xs text-[var(--color-text-faint)] py-16">Kuch add nahi hua</p>
          ) : (
            tracks.map((t) => {
              const isCurrent = currentTrack?.id === t.id;
              const liked = isLiked(t.id);
              return (
                <div
                  key={t.id}
                  onClick={() => playTrack(t, tracks)}
                  className={`flex items-center gap-3 p-2 pr-3 rounded-2xl cursor-pointer border transition-all ${isCurrent ? 'bg-[var(--color-lime)]/12 border-[var(--color-lime)]/40' : 'border-transparent hover:bg-[var(--color-panel)]'}`}
                >
                  <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-[var(--color-ink-soft)] shrink-0">
                    {t.thumbnailUrl ? (
                      <Image src={t.thumbnailUrl} alt={t.title} fill className="object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">🎵</div>
                    )}
                    {isCurrent && (
                      <div className="absolute inset-0 bg-[var(--color-ink)]/40 flex items-center justify-center">
                        <Disc3 size={20} className="text-[var(--color-lime)]" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className={`text-xs font-bold truncate ${isCurrent ? 'text-[var(--color-lime)]' : 'text-[var(--color-text-primary)]'}`}>{t.title}</h4>
                    <p className="text-[10px] text-[var(--color-text-secondary)] truncate">
                      {t.artist}{t.durationSeconds ? ` • ${Math.floor(t.durationSeconds / 60)}:${String(t.durationSeconds % 60).padStart(2, '0')}` : ''}
                    </p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleLike(t); }}
                    className="p-2 rounded-full text-[var(--color-text-secondary)] shrink-0"
                  >
                    {liked
                      ? <CheckCircle2 size={18} className="text-[var(--color-lime)]" />
                      : <Play size={16} className="fill-current" />}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
