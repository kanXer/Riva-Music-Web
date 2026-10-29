'use client';

import React from 'react';
import { Check, Download, AlertTriangle, WifiOff } from 'lucide-react';
import { startDownload, type StartDownloadTrack } from '@/lib/offlineStore';
import { useDownloadState, useDownloadedIds, useOfflineStatus } from '@/lib/offlineHooks';

/**
 * Download indicator/action for any playable track.
 * idle → tap to download · downloading → circular progress bar with % ·
 * downloaded → checkmark · error → retry icon (tooltip has the reason).
 */
export function DownloadButton({ track, size = 16 }: { track: StartDownloadTrack; size?: number }) {
  const id = track.videoId || track.id;
  const dl = useDownloadState(id);
  const downloadedIds = useDownloadedIds();
  const { isOnline } = useOfflineStatus();

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (dl.status === 'idle') startDownload(track);
  };

  const containerSize = size + 16;

  const isDownloaded = dl.status === 'downloaded' || downloadedIds.has(id);

  if (isDownloaded) {
    return (
      <span
        title={`Downloaded${track.title ? `: ${track.title}` : ''}`}
        className="flex items-center justify-center text-[var(--color-lime)]"
        style={{ width: containerSize, height: containerSize }}
      >
        <Check size={size} strokeWidth={3} />
      </span>
    );
  }

  if (dl.status === 'downloading') {
    const pct = Math.max(0, Math.min(100, Math.round(dl.progress * 100)));
    const strokeWidth = 2.5;
    const radius = (containerSize - strokeWidth * 2) / 2;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (pct / 100) * circumference;

    return (
      <span
        title={`Downloading… ${pct}%`}
        className="relative flex items-center justify-center select-none"
        style={{ width: containerSize, height: containerSize }}
      >
        <svg
          className="w-full h-full -rotate-90 transform"
          viewBox={`0 0 ${containerSize} ${containerSize}`}
        >
          {/* Background circle track */}
          <circle
            cx={containerSize / 2}
            cy={containerSize / 2}
            r={radius}
            fill="transparent"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-[var(--color-panel-border)]/60"
          />
          {/* Active progress arc */}
          <circle
            cx={containerSize / 2}
            cy={containerSize / 2}
            r={radius}
            fill="transparent"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={dl.progress >= 0 ? strokeDashoffset : circumference * 0.75}
            strokeLinecap="round"
            className={`text-[var(--color-lime)] transition-[stroke-dashoffset] duration-200 ${dl.progress < 0 ? 'animate-spin origin-center' : ''}`}
          />
        </svg>
        <span className="absolute text-[8px] font-black text-[var(--color-lime)] font-mono leading-none">
          {pct > 0 ? pct : ''}
        </span>
      </span>
    );
  }

  if (dl.status === 'error') {
    return (
      <button
        onClick={handleClick}
        title={dl.error || 'Download failed — tap to retry'}
        className="flex items-center justify-center rounded-full text-[var(--color-coral)] hover:bg-[var(--color-panel-border)]/30 transition-colors"
        style={{ width: containerSize, height: containerSize }}
      >
        <AlertTriangle size={size} />
      </button>
    );
  }

  // idle
  return (
    <button
      onClick={handleClick}
      disabled={!isOnline}
      title={isOnline ? `Download "${track.title}" for offline` : 'You are offline — connect to download'}
      className={`flex items-center justify-center rounded-full transition-colors ${isOnline ? 'text-[var(--color-text-secondary)] hover:text-[var(--color-lime)] hover:bg-[var(--color-panel-border)]/30' : 'text-[var(--color-text-faint)]'}`}
      style={{ width: containerSize, height: containerSize }}
    >
      {isOnline ? <Download size={size} /> : <WifiOff size={size} />}
    </button>
  );
}
