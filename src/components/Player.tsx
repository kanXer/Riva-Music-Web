'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import Image from 'next/image';
import { useMusic } from '@/context/MusicContext';
import { Track, LyricLine } from '@/types';
import { DownloadButton } from '@/components/DownloadButton';
import { startDownload } from '@/lib/offlineStore';
import { useDownloadState, useDownloadedIds, useOfflineStatus } from '@/lib/offlineHooks';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Repeat,
  Repeat1,
  Shuffle,
  Heart,
  ChevronDown,
  ChevronUp,
  FileText,
  Clock,
  Share2,
  Maximize2,
  Minimize2,
  Radio,
  Sun as LightMode,
  Moon as DarkMode,
  Disc3,
  MicVocal,
  Download,
  Check,
  Loader2,
  AlertTriangle
} from 'lucide-react';

const NUDGE_COLORS = { ring: '#D4FF00', mid: '#10B981', blue: '#38BDF8' };

function formatTime(secs: number) {
  if (isNaN(secs) || secs < 0) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// App fallback: plain lines auto-paced by char-weight over duration
function autoPaceLyrics(lines: string[], durationSec: number): LyricLine[] {
  if (!lines.length || durationSec <= 0) return [];
  const totalChars = lines.reduce((a, l) => a + l.length + 1, 0);
  const intro = durationSec * 0.08;
  const outro = durationSec * 0.06;
  const usable = Math.max(durationSec - intro - outro, durationSec * 0.5);
  let t = intro;
  const out: LyricLine[] = [];
  for (const line of lines) {
    const weight = (line.length + 1) / totalChars;
    const dur = Math.min(10, Math.max(1.8, weight * usable));
    out.push({ startMs: Math.round(t * 1000), text: line });
    t += dur;
  }
  return out;
}

export function Player() {
  const {
    currentTrack,
    isPlaying,
    isLoadingAudio,
    currentTime,
    duration,
    togglePlay,
    seek,
    nextTrack,
    previousTrack,
    repeatMode,
    cycleRepeatMode,
    shuffle,
    toggleShuffle,
    isExpanded,
    setIsExpanded,
    lyrics,
    plainLyrics,
    lyricsSource,
    isLoadingLyrics,
    lyricOffsetMs,
    setLyricOffsetMs,
    isLiked,
    toggleLike,
    themeMode,
    cycleThemeMode,
    sleepTimerMinutes,
    sleepRemainingSeconds,
    setSleepTimerMinutes,
    playTrack
  } = useMusic();

  const [activeTab, setActiveTab] = useState<'disk' | 'lyrics'>('disk');
  const [isFullScreenMode, setIsFullScreenMode] = useState(false);
  const [scrubNotice, setScrubNotice] = useState<string | null>(null);
  const [showSimilar, setShowSimilar] = useState(false);
  const [similarTracks, setSimilarTracks] = useState<Track[]>([]);
  const [isLoadingSimilar, setIsLoadingSimilar] = useState(false);
  const [showSleepDialog, setShowSleepDialog] = useState(false);

  // Rotary Scratch / Vinyl Drag Refs
  const diskRef = useRef<HTMLDivElement | null>(null);
  const [diskRotation, setDiskRotation] = useState(0);
  const isDraggingRef = useRef(false);
  const lastAngleRef = useRef(0);
  const dragStartSeekRef = useRef(0);
  const scrubAccumulatorRef = useRef(0);
  const scrubTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Swipe Up / Down on Full Player
  const touchStartY = useRef<number | null>(null);
  const touchStartX = useRef<number | null>(null);

  // Download hooks must be called unconditionally before early return
  const currentTrackId = currentTrack ? (currentTrack.videoId || currentTrack.id) : null;
  const dlState = useDownloadState(currentTrackId);
  const downloadedIds = useDownloadedIds();
  const { isOnline } = useOfflineStatus();
  const isDownloaded = currentTrackId ? (dlState.status === 'downloaded' || downloadedIds.has(currentTrackId)) : false;

  // Reset view when track changes (render-time adjustment pattern)
  const [prevTrackId, setPrevTrackId] = useState<string | null>(currentTrack?.id ?? null);
  const currentId = currentTrack?.id ?? null;
  // Track-change swap animation: direction set by swipe gesture (pendingDir state),
  // default fade-in for button-driven changes
  const [swap, setSwap] = useState<{ key: number; dir: 'up' | 'down' | null }>({ key: 0, dir: null });
  const [pendingDir, setPendingDir] = useState<'up' | 'down' | null>(null);
  if (currentId !== prevTrackId) {
    setPrevTrackId(currentId);
    setDiskRotation(0);
    setActiveTab('disk');
    if (prevTrackId && currentId) {
      setSwap({ key: swap.key + 1, dir: pendingDir });
      setPendingDir(null);
    }
  }
  const swapClass = swap.dir === 'up' ? 'riva-swap-up' : swap.dir === 'down' ? 'riva-swap-down' : 'riva-swap-in';

  // Lock background scroll while any player surface is open
  useEffect(() => {
    const lock = () => {
      document.body.style.overflow = (isExpanded || isFullScreenMode) ? 'hidden' : '';
    };
    lock();
    return () => { document.body.style.overflow = ''; };
  }, [isExpanded, isFullScreenMode]);

  // Continuous spin during playback (18°/sec, like the app's 5s/rotation)
  useEffect(() => {
    if (!currentTrack) return;
    let animId: number;
    let lastTime = performance.now();
    const loop = (now: number) => {
      const delta = (now - lastTime) / 1000;
      lastTime = now;
      if (isPlaying && !isDraggingRef.current) {
        setDiskRotation(prev => (prev + delta * 18) % 360);
      }
      animId = requestAnimationFrame(loop);
    };
    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, currentTrack]);

  // Effective synced lines (native shelf lines get auto-paced)
  const effectiveLyrics = useMemo(() => {
    if (lyrics.length > 0) return lyrics;
    if (plainLyrics.length > 0) return autoPaceLyrics(plainLyrics, duration || currentTrack?.durationSeconds || 0);
    return [];
  }, [lyrics, plainLyrics, duration, currentTrack]);

  const currentMs = (currentTime * 1000) + lyricOffsetMs;
  const activeLyricIndex = effectiveLyrics.length
    ? effectiveLyrics.findIndex((_, i) => {
        const next = effectiveLyrics[i + 1];
        return currentMs >= effectiveLyrics[i].startMs && (!next || currentMs < next.startMs);
      })
    : -1;

  const lyricRefs = useRef<(HTMLParagraphElement | null)[]>([]);
  const lyricsContainerRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll: keep the active line vertically centered on the Y-axis
  useEffect(() => {
    if (activeTab !== 'lyrics') return;
    if (activeLyricIndex >= 0) {
      const activeEl = lyricRefs.current[activeLyricIndex];
      const containerEl = lyricsContainerRef.current;
      if (activeEl && containerEl) {
        // Calculate offset so the active element is exactly centered vertically inside the container
        const targetScrollTop =
          activeEl.offsetTop - (containerEl.clientHeight / 2) + (activeEl.clientHeight / 2);
        containerEl.scrollTo({
          top: Math.max(0, targetScrollTop),
          behavior: 'smooth'
        });
      } else if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [activeLyricIndex, activeTab]);

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  // ---- Load similar tracks (radio) ----
  const loadSimilar = async () => {
    if (!currentTrack) return;
    setShowSimilar(true);
    if (similarTracks.length > 0 && similarTracks[0].id === currentTrack.id) return;
    setIsLoadingSimilar(true);
    try {
      const res = await fetch(`/api/radio/${currentTrack.id}`);
      const data = await res.json();
      setSimilarTracks(data.tracks || []);
    } catch (_) {}
    finally { setIsLoadingSimilar(false); }
  };

  const playSimilar = (track: Track, index: number) => {
    playTrack(track, similarTracks.slice(index));
    setShowSimilar(false);
    setIsExpanded(false);
  };

  // ---- Rotary Scratch & Spin Pointer Handlers ----
  const handleDiskPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (!diskRef.current) return;
    const rect = diskRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const rad = Math.atan2(e.clientY - centerY, e.clientX - centerX);
    lastAngleRef.current = (rad * 180) / Math.PI;
    isDraggingRef.current = true;
    dragStartSeekRef.current = currentTime;
    scrubAccumulatorRef.current = 0;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleDiskPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || !diskRef.current) return;
    e.stopPropagation();
    const rect = diskRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const rad = Math.atan2(e.clientY - centerY, e.clientX - centerX);
    const curAngle = (rad * 180) / Math.PI;

    let delta = curAngle - lastAngleRef.current;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;

    setDiskRotation(prev => (prev + delta) % 360);
    scrubAccumulatorRef.current += delta;

    // 1.5x fast scrub: every 4 degrees rotated = 2.5 seconds (app formula)
    if (Math.abs(scrubAccumulatorRef.current) >= 4) {
      const steps = Math.trunc(scrubAccumulatorRef.current / 4);
      const secondsChange = steps * 2.5;
      const targetSec = Math.max(0, Math.min(currentTime + secondsChange, duration || 300));
      seek(targetSec);

      const offsetSec = Math.round(targetSec - dragStartSeekRef.current);
      const sign = offsetSec >= 0 ? "+" : "";
      setScrubNotice(`${sign}${offsetSec}s • ${formatTime(targetSec)}`);

      if (scrubTimerRef.current) clearTimeout(scrubTimerRef.current);
      scrubTimerRef.current = setTimeout(() => setScrubNotice(null), 1500);

      scrubAccumulatorRef.current -= steps * 4;
    }
    lastAngleRef.current = curAngle;
  };

  const handleDiskPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch (_) {}
    }
  };

  // ---- Swipe Up / Down to change song ----
  const handleSheetTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    // Never trigger song change gestures when touching inside lyrics card, disk scratch area, sliders or buttons
    if ((e.target as HTMLElement).closest('.disk-touch-area, .lyric-scroll, .lyrics-card, input, button')) return;
    touchStartY.current = e.touches[0].clientY;
    touchStartX.current = e.touches[0].clientX;
  };

  const handleSheetTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('.disk-touch-area, .lyric-scroll, .lyrics-card, input, button')) {
      touchStartY.current = null;
      touchStartX.current = null;
      return;
    }
    if (touchStartY.current === null || touchStartX.current === null) return;
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;

    if (Math.abs(deltaY) > 65 && Math.abs(deltaY) > Math.abs(deltaX) * 1.3) {
      if (deltaY < 0) {
        setPendingDir('up');
        nextTrack();
      } else if (touchStartY.current < 120) {
        setIsExpanded(false);
        setIsFullScreenMode(false);
      } else {
        setPendingDir('down');
        previousTrack();
      }
    }
    touchStartY.current = null;
    touchStartX.current = null;
  };

  const handleShare = () => {
    if (!currentTrack) return;
    const shareUrl = `https://music.youtube.com/watch?v=${currentTrack.videoId || currentTrack.id}`;
    if (navigator.share) {
      navigator.share({
        title: `${currentTrack.title} - ${currentTrack.artist}`,
        text: `Listen to "${currentTrack.title}" by ${currentTrack.artist} on Riva Music`,
        url: shareUrl
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(shareUrl);
    }
  };

  // Guests-free web: everything unlocked, but keep the guard shape
  if (!currentTrack) {
    return (
      <>
        {/* Mini player stays hidden with no track */}
        {isExpanded && (
          <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-b from-[#2B1210] via-[#1D0C0B] to-[var(--color-ink)] px-6" onClick={() => setIsExpanded(false)}>
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-text-faint)] mb-8">NOW PLAYING</span>
            <div className="w-64 h-64 sm:w-80 sm:h-80 rounded-[2rem] bg-[var(--color-panel)] border border-[var(--color-panel-border)] flex items-center justify-center">
              <div className="w-9 h-9 border-[3px] border-[var(--color-lime)] border-t-transparent rounded-full animate-spin" />
            </div>
            <h2 className="mt-8 text-xl font-black text-[var(--color-text-primary)]">Loading music...</h2>
            <p className="text-xs font-semibold text-[var(--color-text-secondary)] mt-1">Nexus Digital</p>
          </div>
        )}
      </>
    );
  }

  const liked = isLiked(currentTrack.id);

  const handleDownloadClick = () => {
    if (dlState.status === 'idle' && !isDownloaded && isOnline) {
      startDownload(currentTrack);
    }
  };

  /* ---------- Reusable glass button (AppleGlassButton) ---------- */
  const glassBtn = (onClick: () => void, children: React.ReactNode, opts?: { active?: boolean; badge?: string; size?: number; iconSize?: number; title?: string }) => (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={opts?.title}
      className={`relative rounded-full flex items-center justify-center border transition-colors ${opts?.active ? 'bg-[var(--color-lime)]/20 border-[var(--color-lime)]/60 text-[var(--color-lime)]' : 'bg-white/[0.08] border-white/[0.16] text-[var(--color-text-primary)] hover:bg-white/[0.14]'}`}
      style={{ width: opts?.size || 36, height: opts?.size || 36 }}
    >
      {React.cloneElement(children as React.ReactElement<{ size?: number }>, { size: opts?.iconSize || 18 })}
      {opts?.badge && (
        <span className="absolute -top-1 -right-2 px-1.5 py-px rounded-full bg-[var(--color-lime)] text-[var(--color-ink)] text-[9px] font-black leading-none">
          {opts.badge}
        </span>
      )}
    </button>
  );

  /* ---------- Vinyl disk (shared between sheet & fullscreen) ---------- */
  const vinylDisk = (sizeClass: string, artClass: string) => (
    <div
      ref={diskRef}
      onPointerDown={handleDiskPointerDown}
      onPointerMove={handleDiskPointerMove}
      onPointerUp={handleDiskPointerUp}
      onPointerCancel={handleDiskPointerUp}
      className={`relative ${sizeClass} rounded-full flex items-center justify-center cursor-grab active:cursor-grabbing touch-none select-none disk-touch-area`}
      style={{
        background: 'radial-gradient(circle at 35% 30%, #17171c 0%, #0d0d10 60%, #08080b 100%)',
        boxShadow: '0 22px 60px -12px rgba(255,107,82,0.35), inset 0 0 40px rgba(0,0,0,0.9)'
      }}
    >
      {/* Progress ring (SVG, sweep-gradient like the app) */}
      <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="47.5" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2.5" />
        {progressPercent > 0 && (
          <>
            <defs>
              <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={NUDGE_COLORS.ring} />
                <stop offset="40%" stopColor={NUDGE_COLORS.mid} />
                <stop offset="80%" stopColor={NUDGE_COLORS.blue} />
                <stop offset="100%" stopColor={NUDGE_COLORS.ring} />
              </linearGradient>
            </defs>
            <circle
              cx="50" cy="50" r="47.5" fill="none"
              stroke="url(#ringGrad)" strokeWidth="3" strokeLinecap="round"
              strokeDasharray={`${(progressPercent / 100) * 298.3} 298.3`}
            />
          </>
        )}
      </svg>

      {/* Rotating disc: grooves + artwork + spindle */}
      <div
        className="w-[88%] h-[88%] rounded-full flex items-center justify-center"
        style={{ transform: `rotate(${diskRotation}deg)`, willChange: 'transform' }}
      >
        {/* microgrooves */}
        <div className="absolute inset-[6%] rounded-full border border-white/[0.04] pointer-events-none" />
        <div className="absolute inset-[13%] rounded-full border border-white/[0.05] pointer-events-none" />
        <div className="absolute inset-[20%] rounded-full border border-white/[0.03] pointer-events-none" />
        <div className="absolute inset-[27%] rounded-full border border-white/[0.05] pointer-events-none" />
        <div className="absolute inset-[34%] rounded-full border border-[var(--color-lime)]/30 pointer-events-none" />

        {/* Album art */}
        <div className={`relative ${artClass} rounded-full overflow-hidden border-[3px] border-white/[0.28] bg-[var(--color-ink-soft)] pointer-events-none`}>
          {currentTrack.thumbnailUrl ? (
            <Image src={currentTrack.thumbnailUrl} alt={currentTrack.title} fill className="object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-3xl">🎵</div>
          )}
          {/* center spindle */}
          <div className="absolute inset-0 m-auto w-7 h-7 rounded-full bg-[#141416] border-2 border-[#E2E8F0]/60 flex items-center justify-center">
            <div className="w-2.5 h-2.5 rounded-full bg-[var(--color-ink)]" />
          </div>
        </div>
      </div>

      {/* Scrub notice pill */}
      {scrubNotice && (
        <div className="absolute -top-9 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-black/85 border-[1.5px] border-[var(--color-lime)] text-[var(--color-lime)] font-extrabold text-sm shadow-xl z-20 whitespace-nowrap">
          {scrubNotice}
        </div>
      )}
    </div>
  );

  /* ---------- Synced lyrics card ---------- */
  const lyricsCard = (heightClass: string) => (
    <div
      className={`lyrics-card w-full ${heightClass} rounded-3xl bg-white/[0.05] border border-white/[0.12] dark:bg-white/[0.05] p-4 flex flex-col overflow-hidden`}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between pb-2 shrink-0">
        <button
          onClick={() => setActiveTab('disk')}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.08] text-[10px] font-black uppercase tracking-wider text-[var(--color-text-primary)]"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-lime)]" />
          REALTIME LYRICS
        </button>
        <div className="flex items-center gap-1">
          {/* Sync nudge control (±0.5s) */}
          <div className="flex items-center gap-0.5 px-1 py-0.5 rounded-full bg-white/[0.06] text-[10px] font-bold text-[var(--color-text-secondary)]">
            <button onClick={() => setLyricOffsetMs(lyricOffsetMs - 500)} className="px-1.5 hover:text-[var(--color-lime)]">-0.5s</button>
            <button onClick={() => setLyricOffsetMs(0)} className="px-1.5 text-[var(--color-lime)] min-w-9">
              {lyricOffsetMs === 0 ? 'Sync' : `${lyricOffsetMs > 0 ? '+' : ''}${(lyricOffsetMs / 1000).toFixed(1)}s`}
            </button>
            <button onClick={() => setLyricOffsetMs(lyricOffsetMs + 500)} className="px-1.5 hover:text-[var(--color-lime)]">+0.5s</button>
          </div>
          <button onClick={() => setActiveTab('disk')} className="p-1.5 rounded-full text-[var(--color-text-faint)] hover:text-[var(--color-text-primary)]">
            <ChevronDown size={16} />
          </button>
        </div>
      </div>

      <div
        ref={lyricsContainerRef}
        className="flex-1 overflow-y-auto flex flex-col gap-1.5 text-center py-20 lyric-scroll scroll-smooth"
        style={{
          scrollPaddingTop: '50%',
          scrollPaddingBottom: '50%',
          maskImage: 'linear-gradient(to bottom, transparent 0%, black 18%, black 82%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 18%, black 82%, transparent 100%)',
        }}
      >
        {isLoadingLyrics ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-xs text-[var(--color-text-faint)]">
            <div className="w-7 h-7 border-2 border-[var(--color-lime)] border-t-transparent rounded-full animate-spin" />
            Searching realtime lyrics from BetterLyrics &amp; LRCLIB...
          </div>
        ) : effectiveLyrics.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6">
            <div className="w-16 h-16 rounded-full bg-white/[0.06] border border-white/[0.12] flex items-center justify-center">
              <MicVocal size={26} className="text-[var(--color-text-faint)]" />
            </div>
            <p className="text-sm font-bold text-[var(--color-text-primary)]">No Lyrics Available</p>
            <p className="text-[11px] text-[var(--color-text-faint)]">Enjoy the music, feel the rhythm &amp; vibe</p>
          </div>
        ) : (
          effectiveLyrics.map((line, idx) => {
            const isActive = idx === activeLyricIndex;
            const isPast = idx < activeLyricIndex;
            return (
              <p
                key={idx}
                ref={el => { lyricRefs.current[idx] = el; }}
                onClick={() => seek(Math.max(0, (line.startMs - lyricOffsetMs) / 1000))}
                className={`py-2 px-3 rounded-2xl cursor-pointer transition-all duration-300 leading-relaxed ${
                  isActive
                    ? 'text-lg sm:text-xl md:text-2xl font-black text-[var(--color-lime)] scale-[1.06] bg-[var(--color-lime)]/15 border border-[var(--color-lime)]/40 shadow-lg shadow-[var(--color-lime)]/10 my-1'
                    : isPast
                      ? 'text-sm sm:text-base font-semibold text-[var(--color-text-faint)] opacity-40 hover:opacity-75'
                      : 'text-sm sm:text-base font-semibold text-[var(--color-text-secondary)] opacity-70 hover:opacity-100'
                }`}
              >
                {line.text}
              </p>
            );
          })
        )}
      </div>
      {effectiveLyrics.length > 0 && lyricsSource && (
        <p className="text-[9px] font-bold uppercase tracking-wider text-center text-[var(--color-text-faint)] pb-1 shrink-0">
          {lyricsSource === 'YouTubeMusic' ? 'Auto-Paced Sync' : 'Realtime Synced'} • {lyricsSource}
        </p>
      )}
    </div>
  );

  /* ---------- Transport + sliders (shared) ---------- */
  const transportRow = (bigPlay: number) => (
    <div className="flex items-center justify-around">
      <button onClick={previousTrack} className="p-3 rounded-full hover:bg-white/[0.06] text-[var(--color-text-primary)] active:scale-90 transition-transform">
        <SkipBack size={26} className="fill-current" />
      </button>
      <button
        onClick={togglePlay}
        disabled={isLoadingAudio}
        className="rounded-full text-[var(--color-ink)] hover:scale-105 active:scale-95 shadow-xl shadow-[var(--color-lime)]/30 transition-transform flex items-center justify-center border-2 border-white/35"
        style={{
          width: bigPlay, height: bigPlay,
          background: 'radial-gradient(circle at 35% 30%, var(--color-lime), #94D82D)'
        }}
      >
        {isLoadingAudio ? (
          <div className="w-7 h-7 border-[3px] border-[var(--color-ink)] border-t-transparent rounded-full animate-spin" />
        ) : isPlaying ? (
          <Pause size={30} className="fill-[var(--color-ink)]" />
        ) : (
          <Play size={30} className="fill-[var(--color-ink)] ml-1" />
        )}
      </button>
      <button onClick={nextTrack} className="p-3 rounded-full hover:bg-white/[0.06] text-[var(--color-text-primary)] active:scale-90 transition-transform">
        <SkipForward size={26} className="fill-current" />
      </button>
    </div>
  );

  const seekSlider = () => (
    <div className="flex flex-col gap-1">
      <input
        type="range"
        min="0"
        max={duration || 100}
        step={0.1}
        value={currentTime}
        onChange={(e) => seek(parseFloat(e.target.value))}
        className="riva-slider w-full"
        style={{ '--fill': `${progressPercent}%` } as React.CSSProperties}
      />
      <div className="flex justify-between text-[11px] font-mono text-[var(--color-text-faint)]">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );

  const modePills = () => (
    <div className="flex items-center gap-1.5 justify-center flex-wrap">
      <button
        onClick={toggleShuffle}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all ${shuffle ? 'bg-[var(--color-lime)]/20 border-[var(--color-lime)]/45 text-[var(--color-lime)]' : 'bg-white/[0.05] border-white/[0.08] text-[var(--color-text-secondary)]'}`}
      >
        <Shuffle size={15} /> Shuffle
      </button>
      <button
        onClick={cycleRepeatMode}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all ${repeatMode !== 'OFF' ? 'bg-[var(--color-lime)]/20 border-[var(--color-lime)]/45 text-[var(--color-lime)]' : 'bg-white/[0.05] border-white/[0.08] text-[var(--color-text-secondary)]'}`}
      >
        {repeatMode === 'ONE' ? <Repeat1 size={15} /> : <Repeat size={15} />}
        {repeatMode === 'ONE' ? 'Repeat one' : repeatMode === 'ALL' ? 'Repeat all' : 'Repeat'}
      </button>
      <button
        onClick={() => setShowSleepDialog(true)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all ${sleepTimerMinutes ? 'bg-[var(--color-lime)]/20 border-[var(--color-lime)]/45 text-[var(--color-lime)]' : 'bg-white/[0.05] border-white/[0.08] text-[var(--color-text-secondary)]'}`}
      >
        <Clock size={15} />
        {sleepTimerMinutes ? `Sleep ${formatTime(sleepRemainingSeconds)}` : 'Sleep'}
      </button>
    </div>
  );

  return (
    <>
      {/* ============ 1. MINI PLAYER (sits directly above bottom nav) ============ */}
      <div
        className="fixed left-0 right-0 z-40 bg-[var(--color-panel-elevated)]/98 backdrop-blur-2xl border-t border-[var(--color-panel-border)] shadow-[0_-4px_16px_rgba(0,0,0,0.3)] transition-all"
        style={{
          bottom: 'calc(4rem + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {/* 2dp progress strip on the top edge */}
        <div
          className="absolute top-0 left-0 right-0 h-0.5 bg-[var(--color-panel-border)]/50 cursor-pointer"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            seek(((e.clientX - rect.left) / rect.width) * duration);
          }}
        >
          <div className="h-full bg-[var(--color-lime)] transition-[width]" style={{ width: `${progressPercent}%` }} />
        </div>

        <div className="max-w-7xl mx-auto flex items-center gap-3 px-3.5 py-2.5">
          <div
            className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
            onClick={() => setIsExpanded(true)}
          >
            <div className="relative w-11 h-11 rounded-[12px] overflow-hidden shrink-0 bg-[var(--color-panel)] border border-[var(--color-panel-border)]">
              {currentTrack.thumbnailUrl ? (
                <Image src={currentTrack.thumbnailUrl} alt={currentTrack.title} fill className="object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">🎵</div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="text-xs sm:text-sm font-bold truncate text-[var(--color-text-primary)] leading-snug">{currentTrack.title}</h4>
              <p className={`text-[11px] truncate leading-normal ${isLoadingAudio ? 'text-[var(--color-lime)] font-semibold' : 'text-[var(--color-text-secondary)]'}`}>
                {isLoadingAudio ? 'Connecting to stream...' : currentTrack.artist}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <DownloadButton track={currentTrack} size={18} />
            <button
              onClick={() => toggleLike(currentTrack)}
              className="p-2 rounded-full text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] active:scale-95 transition-transform"
              title="Like track"
            >
              <Heart size={18} className={liked ? 'fill-[var(--color-coral)] text-[var(--color-coral)]' : ''} />
            </button>
            {isLoadingAudio ? (
              <div className="w-6 h-6 mx-2 border-2 border-[var(--color-lime)] border-t-transparent rounded-full animate-spin" />
            ) : (
              <button
                onClick={togglePlay}
                className="w-9 h-9 rounded-full bg-[var(--color-lime)] text-[var(--color-ink)] flex items-center justify-center active:scale-90 transition-transform shadow-md"
                title={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? <Pause size={18} className="fill-current" /> : <Play size={18} className="fill-current ml-0.5" />}
              </button>
            )}
            <button
              onClick={nextTrack}
              className="p-2 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] active:scale-90 transition-transform"
              title="Next track"
            >
              <SkipForward size={20} className="fill-current" />
            </button>
          </div>
        </div>
      </div>

      {/* ============ 2. FULL PLAYER SHEET ============ */}
      {isExpanded && !isFullScreenMode && (
        <div
          onTouchStart={handleSheetTouchStart}
          onTouchEnd={handleSheetTouchEnd}
          className="fixed inset-0 z-50 flex flex-col overflow-hidden overscroll-none touch-none select-none"
          style={{ background: 'linear-gradient(180deg, var(--color-player-top, #2B1210) 0%, var(--color-player-mid, #1D0C0B) 30%, var(--color-ink) 75%)' }}
        >
          {/* Whole-content wrapper: keyed so the ENTIRE player slides on track change */}
          <div key={`sheet-${swap.key}`} className={`flex flex-col flex-1 min-h-0 w-full ${swapClass}`}>
          {/* Header */}
          <div className="flex items-center justify-between w-full max-w-lg mx-auto px-4 pt-4 pb-2 shrink-0 sticky top-0 z-10">
            <button
              onClick={() => setIsExpanded(false)}
              className="w-[42px] h-[42px] rounded-full bg-white/[0.08] border border-white/[0.16] text-[var(--color-text-primary)] flex items-center justify-center"
            >
              <ChevronDown size={22} />
            </button>
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-text-faint)]">NOW PLAYING</span>
            {glassBtn(() => setIsFullScreenMode(true), <Maximize2 />, { iconSize: 18 })}
          </div>

          {/* Center: disk or lyrics */}
          <div className="flex-1 flex flex-col items-center justify-center w-full max-w-lg mx-auto px-4 py-3 min-h-0">
            {activeTab === 'lyrics' ? lyricsCard('h-[380px] sm:h-[420px]') : (
              <div className="flex flex-col items-center w-full">
                {vinylDisk('w-[min(72vw,320px)] h-[min(72vw,320px)]', 'w-[55%] h-[55%]')}
                <button
                  onClick={() => setActiveTab('lyrics')}
                  className="mt-4 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.08] border border-white/[0.12] text-[10px] font-bold text-[var(--color-text-secondary)] hover:text-[var(--color-lime)]"
                >
                  <FileText size={12} /> Tap artwork for lyrics
                </button>
              </div>
            )}
          </div>

          {/* Bottom section */}
          <div className="w-full max-w-lg mx-auto px-4 pb-6 flex flex-col gap-3 shrink-0">
            <div className="text-center px-2">
              <h2 className="text-xl font-black text-[var(--color-text-primary)] truncate">{currentTrack.title}</h2>
              <p className="text-sm font-semibold text-[var(--color-text-secondary)] truncate mt-0.5">{currentTrack.artist}</p>
            </div>

            {/* Glassy action row */}
            <div className="flex items-center justify-evenly py-1.5 px-1 rounded-full bg-white/[0.06] border border-white/[0.12]">
              {glassBtn(loadSimilar, <Radio />, { badge: '50', title: 'Similar tracks', active: showSimilar })}
              {glassBtn(() => toggleLike(currentTrack), <Heart />, { active: liked, title: 'Like' })}
              {glassBtn(
                handleDownloadClick,
                dlState.status === 'downloading' ? (
                  <span className="relative flex items-center justify-center w-full h-full">
                    {(() => {
                      const pct = Math.max(0, Math.min(100, Math.round(dlState.progress * 100)));
                      const radius = 13;
                      const circumference = 2 * Math.PI * radius;
                      const offset = circumference - (pct / 100) * circumference;
                      return (
                        <>
                          <svg className="w-8 h-8 -rotate-90" viewBox="0 0 32 32">
                            <circle
                              cx="16" cy="16" r={radius}
                              fill="none" stroke="currentColor" strokeWidth="2.5"
                              className="text-white/20"
                            />
                            <circle
                              cx="16" cy="16" r={radius}
                              fill="none" stroke="currentColor" strokeWidth="2.5"
                              strokeDasharray={circumference}
                              strokeDashoffset={dlState.progress >= 0 ? offset : circumference * 0.75}
                              strokeLinecap="round"
                              className={`text-[var(--color-lime)] transition-all duration-200 ${dlState.progress < 0 ? 'animate-spin origin-center' : ''}`}
                            />
                          </svg>
                          <span className="absolute text-[8px] font-black text-[var(--color-lime)] font-mono">
                            {pct > 0 ? pct : ''}
                          </span>
                        </>
                      );
                    })()}
                  </span>
                ) : isDownloaded ? (
                  <Check className="text-[var(--color-lime)]" strokeWidth={3} />
                ) : (
                  <Download />
                ),
                {
                  active: isDownloaded,
                  title: isDownloaded
                    ? 'Saved for Offline'
                    : dlState.status === 'downloading'
                    ? `Downloading… ${dlState.progress >= 0 ? `${Math.round(dlState.progress * 100)}%` : ''}`
                    : 'Download Offline'
                }
              )}
              {glassBtn(handleShare, <Share2 />, { title: 'Share' })}
              {glassBtn(() => setActiveTab(activeTab === 'lyrics' ? 'disk' : 'lyrics'), <FileText />, { active: activeTab === 'lyrics', title: 'Lyrics' })}
              {glassBtn(cycleThemeMode, themeMode === 'DARK' ? <LightMode /> : <DarkMode />, { title: `Theme: ${themeMode}` })}
            </div>

            {/* Mode pills */}
            {modePills()}

            {/* Seek */}
            {seekSlider()}

            {/* Transport */}
            {transportRow(62)}

            <p className="text-center text-[10px] font-semibold text-[var(--color-violet)] mt-1">
              Riva Music by Nexus Digital
            </p>
          </div>
          </div>
        </div>
      )}

      {/* ============ 3. FULLSCREEN AMBIENT OVERLAY ============ */}
      {isFullScreenMode && (
        <div
          onTouchStart={handleSheetTouchStart}
          onTouchEnd={handleSheetTouchEnd}
          className="fixed inset-0 z-50 flex flex-col justify-between p-6 overflow-hidden overscroll-none touch-none select-none"
          style={{ background: 'radial-gradient(circle at 50% 42%, #261917 0%, #130A09 55%, #090404 100%)' }}
        >
          {/* Ambient glow */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="w-[340px] h-[340px] rounded-full bg-[var(--color-lime)]/[0.12] blur-3xl" />
          </div>

          {/* Whole-content wrapper: keyed so the ENTIRE player slides on track change */}
          <div key={`fs-${swap.key}`} className={`relative flex flex-col flex-1 min-h-0 w-full ${swapClass}`}>
          {/* Top glass bar */}
          <div className="flex items-center justify-between w-full max-w-4xl mx-auto z-10">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.06] border border-white/[0.14] backdrop-blur-md">
              <span className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-[var(--color-lime)]' : 'bg-[var(--color-coral)]'}`} />
              <span className="text-[11px] font-black uppercase text-white/80 tracking-[0.15em]">
                {activeTab === 'lyrics' ? 'REALTIME LYRICS' : 'NOW PLAYING'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {glassBtn(handleShare, <Share2 />, { size: 40, iconSize: 19, title: 'Share' })}
              {glassBtn(() => setIsFullScreenMode(false), <Minimize2 />, { size: 40, iconSize: 19, title: 'Exit fullscreen' })}
            </div>
          </div>

          {/* Center: tap toggles lyrics / artwork */}
          <div
            className="flex-1 flex flex-col items-center justify-center z-10 my-auto cursor-pointer"
            onClick={() => setActiveTab(activeTab === 'lyrics' ? 'disk' : 'lyrics')}
          >
            {activeTab === 'lyrics' ? (
              lyricsCard('h-[min(60vh,460px)] max-w-2xl')
            ) : (
              <>
                <div onClick={(e) => e.stopPropagation()}>
                  {vinylDisk('w-[min(72vw,340px)] h-[min(72vw,340px)]', 'w-[58%] h-[58%]')}
                </div>
                <div className="text-center mt-6">
                  <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight line-clamp-2">{currentTrack.title}</h2>
                  <p className="text-sm font-semibold text-[var(--color-text-secondary)] mt-1">{currentTrack.artist}</p>
                  <p className="text-[11px] font-semibold text-[var(--color-text-faint)] mt-3">💡 Tap screen to view Realtime Lyrics</p>
                </div>
              </>
            )}
          </div>

          {/* Floating transport bar */}
          <div className="w-full max-w-md mx-auto flex flex-col gap-2 z-10">
            {seekSlider()}
            <div className="mx-auto flex items-center gap-7 px-6 py-2.5 rounded-full bg-black/55 border border-white/[0.16]">
              <button onClick={previousTrack} className="p-2 text-white active:scale-90"><SkipBack size={26} className="fill-current" /></button>
              <button
                onClick={togglePlay}
                disabled={isLoadingAudio}
                className="w-14 h-14 rounded-full bg-[var(--color-lime)] text-[var(--color-ink)] flex items-center justify-center active:scale-95 shadow-xl"
              >
                {isLoadingAudio ? (
                  <div className="w-6 h-6 border-2 border-[var(--color-ink)] border-t-transparent rounded-full animate-spin" />
                ) : isPlaying ? (
                  <Pause size={26} className="fill-[var(--color-ink)]" />
                ) : (
                  <Play size={26} className="fill-[var(--color-ink)] ml-0.5" />
                )}
              </button>
              <button onClick={nextTrack} className="p-2 text-white active:scale-90"><SkipForward size={26} className="fill-current" /></button>
            </div>
          </div>
          </div>
        </div>
      )}

      {/* ============ 4. SIMILAR TRACKS SHEET ("50 SIMILAR") ============ */}
      {showSimilar && (
        <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm" onClick={() => setShowSimilar(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-0 left-0 right-0 h-[75%] rounded-t-3xl bg-[var(--color-panel)] border-t border-[var(--color-panel-border)] flex flex-col overflow-hidden"
          >
            <div className="flex justify-center pt-2.5 pb-1">
              <div className="w-9 h-1 rounded-full bg-[var(--color-panel-border)]" />
            </div>
            <div className="flex items-start justify-between px-5 pb-3">
              <div>
                <div className="flex items-center gap-1.5">
                  <Radio size={17} className="text-[var(--color-lime)]" />
                  <span className="text-[10px] font-black uppercase tracking-[0.15em] text-[var(--color-lime)]">50 SIMILAR TRACKS</span>
                </div>
                <h3 className="text-base font-bold text-[var(--color-text-primary)] mt-1">Vibe mix for {currentTrack.title}</h3>
              </div>
              <button onClick={() => setShowSimilar(false)} className="w-9 h-9 rounded-full bg-white/[0.1] flex items-center justify-center text-[var(--color-text-primary)]">
                <ChevronDown size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-6 flex flex-col gap-1.5">
              {isLoadingSimilar ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="w-8 h-8 border-2 border-[var(--color-lime)] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : similarTracks.length === 0 ? (
                <p className="text-center text-xs text-[var(--color-text-faint)] py-10">No similar tracks found</p>
              ) : (
                similarTracks.map((t, idx) => {
                  const isCurrent = currentTrack.id === t.id;
                  return (
                    <div
                      key={t.id}
                      onClick={() => playSimilar(t, idx)}
                      className={`flex items-center gap-3 p-2.5 rounded-2xl cursor-pointer border transition-all ${isCurrent ? 'bg-[var(--color-lime)]/15 border-[var(--color-lime)]/50' : 'bg-white/[0.04] border-transparent hover:bg-white/[0.08]'}`}
                    >
                      <span className={`w-7 text-center text-[11px] font-black ${isCurrent ? 'text-[var(--color-lime)]' : 'text-[var(--color-text-faint)]'}`}>#{idx + 1}</span>
                      <div className="relative w-11 h-11 rounded-[10px] overflow-hidden bg-[var(--color-ink-soft)] shrink-0">
                        {t.thumbnailUrl ? <Image src={t.thumbnailUrl} alt={t.title} fill className="object-cover" /> : <div className="w-full h-full flex items-center justify-center">🎵</div>}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className={`text-xs font-bold truncate ${isCurrent ? 'text-[var(--color-lime)]' : 'text-[var(--color-text-primary)]'}`}>{t.title}</h4>
                        <p className="text-[10px] text-[var(--color-text-faint)] truncate">{t.artist}</p>
                      </div>
                      {isCurrent
                        ? <Disc3 size={17} className="text-[var(--color-lime)] shrink-0" />
                        : <Play size={15} className="text-[var(--color-text-secondary)] fill-current shrink-0" />}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============ 5. SLEEP TIMER DIALOG ============ */}
      {showSleepDialog && (
        <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-5" onClick={() => setShowSleepDialog(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xs rounded-3xl bg-[var(--color-panel-elevated)] border border-[var(--color-panel-border)] p-5 flex flex-col gap-3"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-[var(--color-lime)]/15 flex items-center justify-center text-[var(--color-lime)]">
                <Clock size={20} />
              </div>
              <h3 className="text-base font-black text-[var(--color-text-primary)]">Sleep Timer</h3>
            </div>
            <div className="flex flex-col">
              {[5, 10, 15, 30, 45, 60].map(m => (
                <button
                  key={m}
                  onClick={() => { setSleepTimerMinutes(m); setShowSleepDialog(false); }}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${sleepTimerMinutes === m ? 'text-[var(--color-lime)] bg-[var(--color-lime)]/10' : 'text-[var(--color-text-primary)] hover:bg-white/[0.06]'}`}
                >
                  <Clock size={15} /> {m} minutes
                  {sleepTimerMinutes === m && <span className="ml-auto text-[10px] font-black">{formatTime(sleepRemainingSeconds)} left</span>}
                </button>
              ))}
              {sleepTimerMinutes && (
                <button
                  onClick={() => { setSleepTimerMinutes(null); setShowSleepDialog(false); }}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold text-[var(--color-coral)] hover:bg-[var(--color-coral)]/10 mt-1"
                >
                  <ChevronUp size={15} className="rotate-180" /> Turn off timer
                </button>
              )}
            </div>
            <button
              onClick={() => setShowSleepDialog(false)}
              className="py-2.5 rounded-xl bg-white/[0.06] text-xs font-bold text-[var(--color-text-secondary)]"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
