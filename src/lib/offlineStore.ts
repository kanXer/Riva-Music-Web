'use client';

/**
 * Offline Music Storage — IndexedDB layer.
 *
 * Schema (DB "riva-offline", store "tracks", keyPath "id"):
 *   OfflineTrackRecord = {
 *     id, title, artist, album?, duration,      // metadata
 *     coverArtBlob: Blob | null,                // artwork
 *     audioBlob: Blob,                          // full audio file
 *     downloadedAt: number, fileSize: number,   // bookkeeping
 *   }
 *
 * Never use localStorage for audio. Object URLs handed out for playback are
 * tracked and revoked so switching tracks never leaks memory.
 */

import { openDB, type IDBPDatabase } from 'idb';

export interface OfflineTrackMeta {
  id: string;
  title: string;
  artist: string;
  album?: string;
  /** duration in seconds */
  duration: number;
  /** epoch ms */
  downloadedAt: number;
  /** audio bytes on disk */
  fileSize: number;
  coverSize: number;
}

interface OfflineTrackRecord extends OfflineTrackMeta {
  coverArtBlob: Blob | null;
  audioBlob: Blob;
}

const DB_NAME = 'riva-offline';
const DB_VERSION = 1;
const STORE = 'tracks';
const GUEST_LIMIT_BYTES = 0; // unused; kept for future per-user quotas

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

/* ================= Download progress store ================= */

export type DownloadStatus = 'idle' | 'downloading' | 'downloaded' | 'error';

export interface DownloadState {
  status: DownloadStatus;
  /** 0..1, -1 when indeterminate (no content-length) */
  progress: number;
  error?: string;
}

const downloadStates = new Map<string, DownloadState>();
const downloadListeners = new Set<() => void>();
const DOWNLOADS_EVENT = 'riva-downloads';

function setDownloadState(id: string, state: DownloadState) {
  downloadStates.set(id, state);
  downloadListeners.forEach((l) => l());
}

/** Subscribe to any download-state change (for useSyncExternalStore / effects). */
export function subscribeDownloads(listener: () => void): () => void {
  downloadListeners.add(listener);
  return () => downloadListeners.delete(listener);
}

export function getDownloadState(id: string | null | undefined): DownloadState {
  if (!id) return { status: 'idle', progress: 0 };
  return downloadStates.get(id) ?? { status: 'idle', progress: 0 };
}

function announceListChange() {
  window.dispatchEvent(new Event(DOWNLOADS_EVENT));
}

/* ================= Core CRUD ================= */

/** Request persistent storage so the browser won't evict tracks under pressure. */
async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) {
      const already = await navigator.storage.persisted();
      if (already) return true;
      return await navigator.storage.persist();
    }
  } catch (_) { /* not fatal */ }
  return false;
}

/** Throws with a clear message if the remaining quota can't fit `neededBytes`. */
async function assertQuota(neededBytes: number) {
  try {
    if (!navigator.storage?.estimate) return;
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    if (!quota) return;
    const free = quota - usage;
    if (neededBytes > free) {
      const needMb = Math.ceil(neededBytes / (1024 * 1024));
      const freeMb = Math.max(0, Math.floor(free / (1024 * 1024)));
      throw new Error(`Not enough storage: need ~${needMb} MB, only ~${freeMb} MB free. Free up downloads and retry.`);
    }
  } catch (err) {
    // rethrow our own quota error, swallow inspection failures
    if (err instanceof Error && err.message.startsWith('Not enough storage')) throw err;
  }
}

/** Total bytes used by offline tracks + browser-reported quota info. */
export async function getStorageInfo(): Promise<{ usage: number; quota: number; tracksBytes: number }> {
  let tracksBytes = 0;
  try {
    const db = await getDb();
    const all: OfflineTrackRecord[] = await db.getAll(STORE);
    tracksBytes = all.reduce((sum, r) => sum + r.fileSize + r.coverSize, 0);
  } catch (_) { /* ignore */ }
  try {
    const { usage = 0, quota = 0 } = await navigator.storage?.estimate?.() ?? {};
    return { usage, quota, tracksBytes };
  } catch (_) {
    return { usage: 0, quota: 0, tracksBytes };
  }
}

/** Fetch a URL as a Blob while reporting progress through `onProgress`.
 * Uses chunked range requests so long YouTube streams don't get throttled or cut off.
 */
async function fetchBlobWithProgress(
  url: string,
  onProgress: (received: number, total: number) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  // First check if server supports Range and get total size with a 1-byte probe
  let total = 0;
  let supportsRange = false;
  let contentType = 'audio/webm';

  try {
    const probeRes = await fetch(url, {
      headers: { Range: 'bytes=0-0' },
      signal,
    });
    if (probeRes.status === 206) {
      supportsRange = true;
      contentType = probeRes.headers.get('content-type') || contentType;
      const contentRange = probeRes.headers.get('content-range') || '';
      const match = contentRange.match(/\/(\d+)$/);
      if (match) {
        total = parseInt(match[1], 10);
      }
    } else if (probeRes.ok) {
      total = Number(probeRes.headers.get('content-length')) || 0;
      contentType = probeRes.headers.get('content-type') || contentType;
    }
  } catch (_) {
    // Probe failed, fallback to direct fetch
  }

  // If range chunking is supported and total size is known, download in 512KB chunks
  if (supportsRange && total > 0) {
    const CHUNK_SIZE = 512 * 1024;
    const chunks: BlobPart[] = [];
    let received = 0;

    while (received < total) {
      if (signal?.aborted) throw new Error('Download aborted');
      const end = Math.min(total - 1, received + CHUNK_SIZE - 1);
      const chunkRes = await fetch(url, {
        headers: { Range: `bytes=${received}-${end}` },
        signal,
      });

      if (!chunkRes.ok && chunkRes.status !== 206) {
        throw new Error(`Chunk fetch failed (${chunkRes.status})`);
      }

      const buf = await chunkRes.arrayBuffer();
      chunks.push(buf);
      received += buf.byteLength;
      onProgress(received, total);
    }

    return new Blob(chunks, { type: contentType });
  }

  // Fallback: standard streaming fetch
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Fetch failed (${res.status})`);

  const streamTotal = Number(res.headers.get('content-length')) || total;

  if (!res.body || typeof res.body.getReader !== 'function') {
    const blob = await res.blob();
    onProgress(blob.size, blob.size);
    return blob;
  }

  const reader = res.body.getReader();
  const chunks: BlobPart[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.byteLength;
      onProgress(received, streamTotal);
    }
  }
  return new Blob(chunks, { type: res.headers.get('content-type') || contentType });
}

/** Fetch cover art; tries direct, falls back to our same-origin image proxy (CORS). */
async function fetchCover(coverUrl: string): Promise<Blob | null> {
  const attempts = [
    coverUrl,
    `/api/image-proxy?url=${encodeURIComponent(coverUrl)}`,
  ];
  for (const url of attempts) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const blob = await res.blob();
      if (blob.size > 0 && blob.size < 10 * 1024 * 1024) return blob;
    } catch (_) { /* try next */ }
  }
  return null;
}

export interface StartDownloadTrack {
  id: string;
  videoId?: string;
  title: string;
  artist: string;
  album?: string;
  durationSeconds: number;
  thumbnailUrl: string | null;
}

/**
 * Resolve the stream for a track, download audio + cover as Blobs and store
 * them in IndexedDB. Progress is reported via subscribeDownloads().
 * Network drops mid-download reject and leave no partial record behind.
 */
export async function startDownload(track: StartDownloadTrack): Promise<void> {
  const id = track.videoId || track.id;
  if (downloadStates.get(id)?.status === 'downloading') return;

  setDownloadState(id, { status: 'downloading', progress: -1 });
  try {
    await requestPersistence();
    await assertQuota(15 * 1024 * 1024); // sanity floor: refuse early when nearly full

    // 1. Resolve the current stream URL for this video (pass title & artist for fast resolution)
    const queryParams = new URLSearchParams();
    if (track.title) queryParams.set('title', track.title);
    if (track.artist) queryParams.set('artist', track.artist);
    const qs = queryParams.toString();
    const streamRes = await fetch(`/api/stream/${id}${qs ? `?${qs}` : ''}`);
    if (!streamRes.ok) throw new Error('Could not resolve the stream (is this track playable?)');
    const streamData = await streamRes.json();
    if (!streamData.url) throw new Error('No audio URL available for this track');

    // If stream URL is direct CORS CDN (e.g. JioSaavn), download directly for speed & stability;
    // otherwise use our server audio-proxy.
    const isDirect = streamData.url.includes('saavncdn.com');
    const audioDownloadUrl = isDirect
      ? streamData.url
      : `/api/audio-proxy?url=${encodeURIComponent(streamData.url)}&ua=${encodeURIComponent(streamData.userAgent || '')}`;

    // 2. Download audio with progress
    const audioBlob = await fetchBlobWithProgress(audioDownloadUrl, (received, total) => {
      setDownloadState(id, {
        status: 'downloading',
        progress: total > 0 ? received / total : -1,
      });
    });

    if (audioBlob.size < 1024) throw new Error('Downloaded audio looks empty');
    await assertQuota(audioBlob.size);

    // 3. Cover art (best-effort)
    const coverBlob = track.thumbnailUrl ? await fetchCover(track.thumbnailUrl) : null;

    // 4. Store — single transaction, so a failure leaves no partial record
    const record: OfflineTrackRecord = {
      id,
      title: track.title,
      artist: track.artist,
      album: track.album,
      duration: track.durationSeconds,
      coverArtBlob: coverBlob,
      audioBlob,
      downloadedAt: Date.now(),
      fileSize: audioBlob.size,
      coverSize: coverBlob?.size ?? 0,
    };
    const db = await getDb();
    await db.put(STORE, record);

    setDownloadState(id, { status: 'downloaded', progress: 1 });
    announceListChange();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Download failed';
    setDownloadState(id, { status: 'error', progress: 0, error: message });
    // No partial record: we only put() after both blobs are fully in memory.
  }
}

export async function deleteTrack(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE, id);
  // Revoke cached object URLs so blob memory is freed
  const audioUrl = audioUrlCache.get(id);
  if (audioUrl) { URL.revokeObjectURL(audioUrl); audioUrlCache.delete(id); }
  const coverUrl = coverUrlCache.get(id);
  if (coverUrl) { URL.revokeObjectURL(coverUrl); coverUrlCache.delete(id); }
  setDownloadState(id, { status: 'idle', progress: 0 });
  announceListChange();
}

export async function deleteAllTracks(): Promise<void> {
  const db = await getDb();
  const keys = await db.getAllKeys(STORE);
  await Promise.all(Array.from(keys).map((k) => deleteTrack(String(k))));
}

/** List downloaded tracks (metadata only — blobs stay in IndexedDB). */
export async function getAllDownloadedTracks(): Promise<OfflineTrackMeta[]> {
  try {
    const db = await getDb();
    const all: OfflineTrackRecord[] = await db.getAll(STORE);
    return all
      .map(({ coverArtBlob: _c, audioBlob: _a, ...meta }) => meta)
      .sort((a, b) => b.downloadedAt - a.downloadedAt);
  } catch (_) {
    return [];
  }
}

export async function getTrackAudioBlob(id: string): Promise<Blob | null> {
  try {
    const db = await getDb();
    const rec = (await db.get(STORE, id)) as OfflineTrackRecord | undefined;
    return rec?.audioBlob ?? null;
  } catch (_) {
    return null;
  }
}

export async function isTrackDownloaded(id: string): Promise<boolean> {
  try {
    const db = await getDb();
    const keys = await db.getAllKeys(STORE);
    return keys.includes(id);
  } catch (_) {
    return false;
  }
}

/* ================= Object URL management ================= */

const audioUrlCache = new Map<string, string>();
const coverUrlCache = new Map<string, string>();

/** Stable object URL for a downloaded track's cover art. */
export async function getCoverUrl(id: string): Promise<string | null> {
  const cached = coverUrlCache.get(id);
  if (cached) return cached;
  try {
    const db = await getDb();
    const rec = (await db.get(STORE, id)) as OfflineTrackRecord | undefined;
    if (!rec?.coverArtBlob) return null;
    const url = URL.createObjectURL(rec.coverArtBlob);
    coverUrlCache.set(id, url);
    return url;
  } catch (_) {
    return null;
  }
}

let lastPlaybackUrl: string | null = null;

/**
 * Object URL for offline playback. The previously handed-out URL is revoked
 * here, so exactly one live audio blob URL exists at a time (no leaks when
 * the user skips around the queue).
 */
export async function getPlaybackUrl(id: string): Promise<string | null> {
  const blob = await getTrackAudioBlob(id);
  if (!blob) return null;
  if (lastPlaybackUrl) {
    URL.revokeObjectURL(lastPlaybackUrl);
    lastPlaybackUrl = null;
  }
  lastPlaybackUrl = URL.createObjectURL(blob);
  return lastPlaybackUrl;
}
