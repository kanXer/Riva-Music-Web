/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import {
  MUSIC_BASE,
  WEB_UA,
  getVisitorData,
  musicRemixContext,
  getLyricSearchQueries,
  isRecordLabel
} from '@/lib/innertube';

// LrcLibClient.kt parseLrc
function parseLrc(lrc: string) {
  const lines: { startMs: number; text: string }[] = [];
  const regex = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
  for (const rawLine of lrc.split("\n")) {
    regex.lastIndex = 0;
    let match;
    const stamps: number[] = [];
    while ((match = regex.exec(rawLine)) !== null) {
      const min = parseInt(match[1], 10);
      const sec = parseInt(match[2], 10);
      let ms = 0;
      if (match[3]) {
        const frac = match[3];
        if (frac.length === 1) ms = parseInt(frac, 10) * 100;
        else if (frac.length === 2) ms = parseInt(frac, 10) * 10;
        else ms = parseInt(frac.slice(0, 3), 10);
      }
      stamps.push((min * 60 + sec) * 1000 + ms);
    }
    if (stamps.length === 0) continue;
    const text = rawLine.replace(/\[[^\]]*\]/g, "").trim();
    if (!text) continue;
    for (const startMs of stamps) {
      lines.push({ startMs, text });
    }
  }
  return lines.sort((a, b) => a.startMs - b.startMs);
}

// BetterLyricsClient.kt TTML parsing
function parseTtml(ttml: string) {
  const lines: { startMs: number; text: string }[] = [];
  const pRegex = /<p\s+[^>]*begin="([^"]+)"[^>]*>([\s\S]*?)<\/p>/g;
  let match;
  while ((match = pRegex.exec(ttml)) !== null) {
    const begin = match[1].trim().replace(/s$/, "");
    const rawText = match[2].replace(/<[^>]+>/g, "").trim();
    if (!rawText) continue;
    let ms = 0;
    if (begin.includes(":")) {
      const parts = begin.split(":");
      if (parts.length === 3) {
        ms = (parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2])) * 1000;
      } else if (parts.length === 2) {
        ms = (parseFloat(parts[0]) * 60 + parseFloat(parts[1])) * 1000;
      }
    } else {
      ms = parseFloat(begin) * 1000;
    }
    if (!isNaN(ms)) {
      lines.push({ startMs: Math.round(ms), text: rawText });
    }
  }
  return lines.sort((a, b) => a.startMs - b.startMs);
}

// BetterLyricsClient.kt fetchSynced — 401 = stop immediately
async function betterLyrics(title: string, artist: string, durSec: number) {
  const attempts: string[] = [];
  if (durSec > 0) attempts.push(`https://api.betterlyrics.org/getLyrics?s=${encodeURIComponent(title)}&a=${encodeURIComponent(artist)}&d=${durSec}`);
  attempts.push(`https://api.betterlyrics.org/getLyrics?s=${encodeURIComponent(title)}&a=${encodeURIComponent(artist)}`);

  for (const url of attempts) {
    try {
      const resp = await fetch(url, {
        headers: { "User-Agent": WEB_UA, "Accept": "application/json" },
        signal: AbortSignal.timeout(4000)
      });
      if (resp.status === 401) return null;
      if (!resp.ok) continue;
      const data = await resp.json();
      if (data.ttml) {
        const lines = parseTtml(data.ttml);
        if (lines.length > 2) return lines;
      }
    } catch (_) {}
  }
  return null;
}

// LrcLibClient.kt — ranked queries, closest duration match; retries on 503 (server busy)
async function lrcSearch(q: string, durSec: number) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const resp = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`, {
        headers: { "User-Agent": "RivaMusic/1.0 (Web)" },
        signal: AbortSignal.timeout(5000)
      });
      if (resp.status === 503 && attempt === 0) {
        await new Promise(r => setTimeout(r, 900));
        continue;
      }
      if (!resp.ok) return null;
      const candidates = await resp.json();
      if (!Array.isArray(candidates)) return null;
      const withSynced = candidates.filter((c: any) => c.syncedLyrics);
      if (withSynced.length === 0) return null;
      const best = durSec > 0
        ? withSynced.reduce((prev: any, curr: any) =>
            Math.abs((curr.duration || 0) - durSec) < Math.abs((prev.duration || 0) - durSec) ? curr : prev)
        : withSynced[0];
      const lines = parseLrc(best.syncedLyrics);
      if (lines.length > 2) return lines;
      return null;
    } catch (_) {
      return null;
    }
  }
  return null;
}

// LrcLib /api/get fallback with exact track data
async function lrcGet(title: string, artist: string, durSec: number) {
  if (durSec <= 0 || !artist) return null;
  try {
    const resp = await fetch(`https://lrclib.net/api/get?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}&duration=${durSec}`, {
      headers: { "User-Agent": "RivaMusic/1.0 (Web)" },
      signal: AbortSignal.timeout(5000)
    });
    if (!resp.ok) return null;
    const best = await resp.json();
    if (best?.syncedLyrics) {
      const lines = parseLrc(best.syncedLyrics);
      if (lines.length > 2) return lines;
    }
  } catch (_) {}
  return null;
}

async function lrcLib(queries: string[], durSec: number) {
  for (const q of queries) {
    const lines = await lrcSearch(q, durSec);
    if (lines) return lines;
  }
  return null;
}

// InnerTubeClient.fetchLyrics — native YT Music description shelf (plain, unsynced)
async function nativeLyrics(videoId: string): Promise<string[]> {
  try {
    const vd = await getVisitorData();
    const ctx = musicRemixContext();
    if (vd) (ctx.client as any).visitorData = vd;
    const nextResp = await fetch(`${MUSIC_BASE}/youtubei/v1/next?prettyPrint=false`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": WEB_UA, "Origin": "https://music.youtube.com" },
      body: JSON.stringify({ context: ctx, videoId })
    });
    const nextData = await nextResp.json();

    // find any string value starting with "MPLYt" (lyrics browse id)
    let browseId: string | null = null;
    (function find(node: any) {
      if (browseId) return;
      if (typeof node === 'string') {
        if (node.startsWith("MPLYt")) browseId = node;
        return;
      }
      if (!node || typeof node !== 'object') return;
      for (const k of Object.keys(node)) find(node[k]);
    })(nextData);
    if (!browseId) return [];

    const browseResp = await fetch(`${MUSIC_BASE}/youtubei/v1/browse?prettyPrint=false`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": WEB_UA, "Origin": "https://music.youtube.com" },
      body: JSON.stringify({ context: ctx, browseId })
    });
    const browseData = await browseResp.json();

    // find first musicDescriptionShelfRenderer.description and collect all text strings
    let shelf: any = null;
    (function find(node: any) {
      if (shelf || !node || typeof node !== 'object') return;
      if (node.musicDescriptionShelfRenderer) { shelf = node.musicDescriptionShelfRenderer; return; }
      for (const k of Object.keys(node)) find(node[k]);
    })(browseData);
    if (!shelf?.description) return [];

    const texts: string[] = [];
    (function collect(node: any) {
      if (!node || typeof node !== 'object') return;
      if (typeof node.text === 'string') { texts.push(node.text); return; }
      for (const k of Object.keys(node)) collect(node[k]);
    })(shelf.description);

    return texts.join("").split("\n").map(l => l.trim()).filter(Boolean);
  } catch (_) {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const title = (searchParams.get('title') || '').trim();
  const artist = (searchParams.get('artist') || '').trim();
  const duration = parseInt(searchParams.get('duration') || '0', 10);
  const videoId = searchParams.get('videoId') || '';

  if (!title) return NextResponse.json({ lines: [], plainLines: [] });

  const durSec = duration > 0 ? duration : 0;
  const recordLabel = isRecordLabel(artist);
  const cleanTitle = title
    .replace(/\([^)]*\)/g, " ").replace(/\[[^\]]*\]/g, " ")
    .split(/[-–—|]/)[0].trim() || title.trim();
  const cleanArtist = recordLabel ? "" : artist.split(/[,&•]/)[0].trim();

  // MusicRepository.timedLyrics — BetterLyrics & LRCLIB raced concurrently, BetterLyrics wins
  const [bl, lrc] = await Promise.all([
    betterLyrics(cleanTitle, cleanArtist, durSec),
    lrcLib(getLyricSearchQueries(artist, title), durSec)
  ]);

  let synced = bl || lrc;
  if (!synced) {
    // last-ditch exact-match LRCLIB get
    synced = await lrcGet(cleanTitle, cleanArtist || artist, durSec);
  }
  if (synced) {
    return NextResponse.json({ lines: synced, source: bl ? "BetterLyrics" : "LRCLIB" });
  }

  // Fallback: native YT Music shelf (plain lines, client auto-paces)
  if (videoId) {
    const plain = await nativeLyrics(videoId);
    if (plain.length > 0) {
      return NextResponse.json({ lines: [], plainLines: plain, source: "YouTubeMusic" });
    }
  }

  return NextResponse.json({ lines: [], plainLines: [] });
}