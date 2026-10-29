'use client';

/**
 * React hooks over the offline store + connectivity status.
 * Keeps UI components tiny: rows just call useDownloadState(trackId) etc.
 */

import { useEffect, useState } from 'react';
import {
  getDownloadState,
  getAllDownloadedTracks,
  getCoverUrl,
  subscribeDownloads,
  type DownloadState,
  type OfflineTrackMeta,
} from './offlineStore';

/** Reactive online/offline status (navigator.onLine + events). */
export function useOfflineStatus(): { isOnline: boolean } {
  // SSR default: online (Node's navigator.onLine is always false — don't trust it).
  // The effect syncs the real value immediately after mount.
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const sync = () => setIsOnline(navigator.onLine);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  return { isOnline };
}

/** Live download state for one track (idle | downloading | downloaded | error). */
export function useDownloadState(id: string | null | undefined): DownloadState {
  const [state, setState] = useState<DownloadState>(() => getDownloadState(id));

  useEffect(() => {
    const sync = () => setState(getDownloadState(id));
    sync();
    return subscribeDownloads(sync);
  }, [id]);

  return state;
}

/** IDs of all downloaded tracks (for showing ✓ indicators anywhere). */
export function useDownloadedIds(): Set<string> {
  const [ids, setIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const list = await getAllDownloadedTracks();
      if (active) setIds(new Set(list.map((t) => t.id)));
    };
    refresh();
    window.addEventListener('riva-downloads', refresh);
    return () => {
      active = false;
      window.removeEventListener('riva-downloads', refresh);
    };
  }, []);

  return ids;
}

/** Full download list for the Library "Downloads" view. */
export function useDownloadedList(): { tracks: OfflineTrackMeta[]; covers: Map<string, string>; refresh: () => void } {
  const [tracks, setTracks] = useState<OfflineTrackMeta[]>([]);
  const [covers, setCovers] = useState<Map<string, string>>(new Map());

  const refresh = () => {
    getAllDownloadedTracks().then(async (list) => {
      setTracks(list);
      const entries = await Promise.all(
        list.map(async (t) => [t.id, await getCoverUrl(t.id)] as const)
      );
      setCovers(new Map(entries.filter((e): e is [string, string] => !!e[1])));
    });
  };

  useEffect(() => {
    refresh();
    window.addEventListener('riva-downloads', refresh);
    return () => window.removeEventListener('riva-downloads', refresh);
  }, []);

  return { tracks, covers, refresh };
}
