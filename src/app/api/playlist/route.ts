import { NextRequest, NextResponse } from 'next/server';
import {
  MUSIC_BASE,
  YOUTUBE_BASE,
  WEB_KEY,
  WEB_UA,
  getVisitorData,
  musicRemixContext,
  parseMusicItem,
  textRuns,
  parseDurationToSeconds,
  upgradeThumbnail
} from '@/lib/innertube';

// InnerTubeClient.fetchPlaylist — accepts URL or bare ID, VL-prefixed browseId.
// Primary: WEB_REMIX browse on music.youtube.com; fallback: WEB browse.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const urlOrId = (searchParams.get('id') || "").trim();
  if (!urlOrId) return NextResponse.json({ error: "Missing playlist id" }, { status: 400 });

  // extractPlaylistId
  let playlistId = urlOrId;
  const urlMatch = urlOrId.match(/(?:list=|\/playlist\?list=)([a-zA-Z0-9_-]+)/);
  if (urlMatch) {
    playlistId = urlMatch[1];
  } else {
    const idx = urlOrId.indexOf("list=");
    if (idx >= 0) {
      const rest = urlOrId.slice(idx + 5);
      playlistId = rest.split("&")[0].split("#")[0];
    }
  }
  // VL prefix works for all playlist families on music browse (RD editorial, PL, OL…)
  const browseId = playlistId.startsWith("VL") ? playlistId : `VL${playlistId}`;

  // ---- Primary: WEB_REMIX browse ----
  try {
    const vd = await getVisitorData();
    const ctx = musicRemixContext();
    if (vd) (ctx.client as any).visitorData = vd;

    const resp = await fetch(`${MUSIC_BASE}/youtubei/v1/browse?prettyPrint=false`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": WEB_UA,
        "Origin": "https://music.youtube.com",
        "Referer": "https://music.youtube.com/"
      },
      body: JSON.stringify({ context: ctx, browseId })
    });
    const data = await resp.json();
    const parsed = parsePlaylistResponse(data, "YouTube Playlist");
    if (parsed) return NextResponse.json(parsed);
  } catch (err: any) {
    console.warn("Playlist music-base browse failed:", err?.message);
  }

  // ---- Fallback 1: raw id on music browse ----
  try {
    const vd = await getVisitorData();
    const ctx = musicRemixContext();
    if (vd) (ctx.client as any).visitorData = vd;
    if (browseId !== playlistId) {
      const resp = await fetch(`${MUSIC_BASE}/youtubei/v1/browse?prettyPrint=false`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": WEB_UA,
          "Origin": "https://music.youtube.com",
          "Referer": "https://music.youtube.com/"
        },
        body: JSON.stringify({ context: ctx, browseId: playlistId })
      });
      const data = await resp.json();
      const parsed = parsePlaylistResponse(data, "YouTube Playlist");
      if (parsed) return NextResponse.json(parsed);
    }
  } catch (err: any) {
    console.warn("Playlist raw-id browse failed:", err?.message);
  }

  // ---- Fallback 2: WEB browse (app's original path) ----
  try {
    const resp = await fetch(`${YOUTUBE_BASE}/youtubei/v1/browse?key=${WEB_KEY}&prettyPrint=false`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": WEB_UA,
        "Origin": "https://www.youtube.com",
        "X-Youtube-Client-Name": "1",
        "X-Youtube-Client-Version": "2.20260708.00.00"
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: "WEB",
            clientVersion: "2.20260708.00.00",
            browserName: "Chrome",
            browserVersion: "149.0.7827.232",
            hl: "en",
            gl: "US"
          }
        },
        browseId
      })
    });
    const data = await resp.json();
    const parsed = parsePlaylistResponse(data, "YouTube Playlist");
    if (parsed) return NextResponse.json(parsed);
  } catch (err: any) {
    console.error("Playlist web-base browse failed:", err?.message);
  }

  return NextResponse.json({ error: "Playlist me koi gaane nahi mile ya link galat hai" }, { status: 404 });
}

function parsePlaylistResponse(data: any, fallbackTitle: string) {
  // Title: playlistHeaderRenderer / pageHeaderRenderer / musicDetailHeaderRenderer recursively
  let title = fallbackTitle;
  (function findTitle(node: any) {
    if (!node || typeof node !== 'object') return;
    for (const key of ["playlistHeaderRenderer", "pageHeaderRenderer", "musicDetailHeaderRenderer", "musicResponsiveHeaderRenderer", "musicImmersiveHeaderRenderer", "musicEditablePlaylistDetailHeaderRenderer"]) {
      if (node[key]) {
        const h = node[key];
        const t = textRuns(h.title) || (typeof h.pageTitle === 'string' ? h.pageTitle : "");
        if (t && t.trim()) { title = t.trim(); return; }
      }
    }
    for (const k of Object.keys(node)) {
      findTitle(node[k]);
      if (title !== fallbackTitle) return;
    }
  })(data);

  const tracks: any[] = [];
  const seen = new Set<string>();

  (function walk(node: any) {
    if (!node) return;

    // WEB playlistVideoRenderer (no filtering, like the app)
    if (node.playlistVideoRenderer) {
      const r = node.playlistVideoRenderer;
      const vId = r.videoId;
      const t = textRuns(r.title);
      const artist = textRuns(r.shortBylineText) || textRuns(r.ownerText) || textRuns(r.longBylineText) || "YouTube";
      const dur = r.lengthSeconds ? parseInt(r.lengthSeconds, 10) : parseDurationToSeconds(textRuns(r.lengthText));
      const thumbs = r.thumbnail?.thumbnails || [];
      if (vId && t && !seen.has(vId)) {
        seen.add(vId);
        tracks.push({
          id: vId, videoId: vId, title: t, artist,
          durationSeconds: dur,
          thumbnailUrl: thumbs.length ? upgradeThumbnail(thumbs[thumbs.length - 1].url) : null
        });
      }
    }

    // YT Music musicResponsiveListItemRenderer rows
    if (node.musicResponsiveListItemRenderer) {
      const r = node.musicResponsiveListItemRenderer;
      const flex = r.flexColumns || [];
      const item = parseMusicItem(r);
      const vId = r.playlistItemData?.videoId || item?.videoId || null;
      const t = (flex[0] ? textRuns(flex[0]?.musicResponsiveListItemFlexColumnRenderer?.text) : "").trim();
      if (vId && t && !seen.has(vId)) {
        seen.add(vId);
        tracks.push({
          id: vId, videoId: vId, title: t,
          artist: (flex[1] ? textRuns(flex[1]?.musicResponsiveListItemFlexColumnRenderer?.text) : "") || "YouTube Music",
          durationSeconds: item?.durationSeconds || 0,
          thumbnailUrl: item?.thumbnailUrl || null
        });
      }
    }

    if (typeof node === 'object') {
      for (const k of Object.keys(node)) walk(node[k]);
    }
  })(data);

  if (tracks.length === 0) return null;
  return { title, tracks };
}
