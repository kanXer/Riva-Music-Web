/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import {
  MUSIC_BASE,
  WEB_UA,
  getVisitorData,
  musicRemixContext,
  textRuns,
  parseDurationToSeconds,
  upgradeThumbnail,
  isRealSong
} from '@/lib/innertube';

// InnerTubeClient.fetchMusicCollection — browse a MP/UC/VL/RD collection and
// extract playable tracks + header title.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawId = (searchParams.get('browseId') || "").trim();
  const fallbackTitle = (searchParams.get('title') || "YouTube Music").trim();
  if (!rawId) return NextResponse.json({ error: "Missing browseId" }, { status: 400 });

  // Keep valid prefixes, else assume VL playlist
  const valid = /^(VL|MP|UC|RD)/.test(rawId);
  const browseId = valid ? rawId : `VL${rawId}`;

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

    if (data?.error || data?.playabilityStatus?.status === "ERROR") {
      return NextResponse.json({ error: data?.error?.message || "Collection not found" }, { status: 404 });
    }

    // Header title: musicImmersiveHeaderRenderer -> musicVisualHeaderRenderer ->
    // musicDetailHeaderRenderer -> musicResponsiveHeaderRenderer -> musicEditablePlaylistDetailHeaderRenderer
    let title = fallbackTitle;
    const headerKeys = [
      "musicImmersiveHeaderRenderer",
      "musicVisualHeaderRenderer",
      "musicDetailHeaderRenderer",
      "musicResponsiveHeaderRenderer",
      "musicEditablePlaylistDetailHeaderRenderer"
    ];
    (function findHeader(node: any) {
      if (!node || typeof node !== 'object') return;
      for (const key of headerKeys) {
        const header = node[key];
        if (header) {
          const t = textRuns(header.title) || textRuns(header?.header?.musicDetailHeaderRenderer?.title);
          if (t && t.trim()) { title = t.trim(); return; }
        }
      }
      for (const k of Object.keys(node)) {
        findHeader(node[k]);
        if (title !== fallbackTitle) return;
      }
    })(data);

    // Subtitle: second run of detail header (e.g. "N songs")
    let subtitle = "";
    (function findSubtitle(node: any) {
      if (!node || typeof node !== 'object') return;
      for (const key of ["musicDetailHeaderRenderer", "musicImmersiveHeaderRenderer", "musicResponsiveHeaderRenderer"]) {
        const header = node[key];
        if (header?.subtitle?.runs && header.subtitle.runs.length > 1) {
          subtitle = header.subtitle.runs.map((r: any) => r.text || "").join("").trim();
          return;
        }
      }
      for (const k of Object.keys(node)) {
        findSubtitle(node[k]);
        if (subtitle) return;
      }
    })(data);

    const tracks: any[] = [];
    const seen = new Set<string>();

    const SKIP_FIRST_SEGMENTS = new Set(["episode", "podcast", "profile"]);
    const TYPE_WORDS = new Set(["song", "video", "album", "single", "ep", "artist", "playlist", "podcast", "episode", "profile"]);

    for (const node of walkAll(data, 'musicResponsiveListItemRenderer')) {
      const flex = node.flexColumns || [];
      const cols: string[] = flex.map((c: any) => textRuns(c?.musicResponsiveListItemFlexColumnRenderer?.text));
      const t = (cols[0] || "").trim();
      if (!t) continue;

      let videoId: string | null = node?.playlistItemData?.videoId || null;
      if (!videoId) {
        videoId = node?.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId || null;
      }
      if (!videoId) {
        for (const run of (flex[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [])) {
          const v = run?.navigationEndpoint?.watchEndpoint?.videoId;
          if (v) { videoId = v; break; }
        }
      }
      if (!videoId) continue;

      const segments = cols.slice(1).join(" • ").split("•").map((s: string) => s.trim()).filter(Boolean);
      if (segments[0] && SKIP_FIRST_SEGMENTS.has(segments[0].toLowerCase())) continue;

      let duration = 0;
      const fixedCols = (node.fixedColumns || []).map((c: any) => textRuns(c?.musicResponsiveListItemFixedColumnRenderer?.text));
      for (const fx of fixedCols) {
        if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(fx)) { duration = parseDurationToSeconds(fx); break; }
      }
      if (!duration) {
        for (const seg of segments) {
          if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(seg)) { duration = parseDurationToSeconds(seg); break; }
        }
      }
      if (!isRealSong(t, duration)) continue;

      if (seen.has(videoId)) continue;
      seen.add(videoId);

      const cleaned = segments.filter(s => {
        const lower = s.toLowerCase();
        return s.length < 120 && !TYPE_WORDS.has(lower) && !/^\d{1,2}:\d{2}(:\d{2})?$/.test(s) &&
          !["plays", "views", "subscribers", "songs", "episodes"].some(w => lower.includes(w));
      });

      const rawThumb = (node.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || node.thumbnail?.thumbnails || []).slice(-1)[0]?.url;

      tracks.push({
        id: videoId,
        videoId,
        title: t,
        artist: cleaned[0] || "YouTube Music",
        durationSeconds: duration,
        thumbnailUrl: upgradeThumbnail(rawThumb)
      });
      if (tracks.length >= 60) break;
    }

    if (tracks.length === 0) {
      return NextResponse.json({ error: "Is collection me koi playable song nahi mila" }, { status: 404 });
    }

    return NextResponse.json({
      title,
      subtitle: subtitle || `${tracks.length} tracks`,
      tracks
    });
  } catch (err: any) {
    console.error("Collection browse error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function walkAll(root: any, rendererKey: string): any[] {
  const out: any[] = [];
  (function visit(node: any) {
    if (!node || typeof node !== 'object') return;
    if (node[rendererKey]) out.push(node[rendererKey]);
    for (const k of Object.keys(node)) visit(node[k]);
  })(root);
  return out;
}