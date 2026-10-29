/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import {
  MUSIC_BASE,

  WEB_UA,
  getVisitorData,
  musicRemixContext,
  walkTree,
  isRealSong
} from '@/lib/innertube';

function getLanguageSpec(lang: string) {
  switch (lang.toLowerCase()) {
    case "hindi": return { id: "hindi", title: "Bollywood & Hindi Hits", subtitle: "Top Hindi chartbusters", query: "bollywood hindi top songs hits" };
    case "english": return { id: "english", title: "Global Pop Hits", subtitle: "Top international hits", query: "english pop songs global top hits" };
    case "punjabi": return { id: "punjabi", title: "Punjabi Bangers", subtitle: "Bhangra beats & high bass", query: "latest punjabi bangers top songs" };
    case "bhojpuri": return { id: "bhojpuri", title: "Bhojpuri Dhamaka", subtitle: "Desi vibes & festive party", query: "bhojpuri hits dance songs" };
    case "haryanvi": return { id: "haryanvi", title: "Haryanvi Hits", subtitle: "Desi swag & folk beats", query: "haryanvi top songs hits" };
    case "tamil": return { id: "tamil", title: "Tamil Blockbusters", subtitle: "Kollywood chartbusters", query: "tamil blockbuster hit songs" };
    case "telugu": return { id: "telugu", title: "Telugu Chartbusters", subtitle: "Tollywood sensations", query: "telugu hit songs top" };
    case "malayalam": return { id: "malayalam", title: "Malayalam Melodies", subtitle: "Soulful God's own sounds", query: "malayalam melody songs hits" };
    case "kannada": return { id: "kannada", title: "Kannada Hits", subtitle: "Sandalwood chartbusters", query: "kannada hit songs top" };
    case "bengali": return { id: "bengali", title: "Bengali Melodies", subtitle: "Sweet rhythms & modern hits", query: "bengali hits songs" };
    case "marathi": return { id: "marathi", title: "Marathi Dhamaal", subtitle: "Energetic & folk vibes", query: "marathi popular songs" };
    case "gujarati": return { id: "gujarati", title: "Gujarati Garba & Hits", subtitle: "Dhol beats & festive folk", query: "gujarati hits garba songs" };
    case "rajasthani": return { id: "rajasthani", title: "Rajasthani Rang", subtitle: "Folk, dhols & desi beats", query: "rajasthani hit songs folk" };
    case "urdu": return { id: "urdu", title: "Urdu Classics & Ghazals", subtitle: "Soulful poetry & melodies", query: "urdu ghazal classic songs" };
    default: return { id: lang.toLowerCase(), title: `${lang} Hits`, subtitle: `Top tracks in ${lang}`, query: `${lang} top hit songs` };
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const gl = searchParams.get('gl') || 'IN';
  const langsParam = searchParams.get('languages') || 'Hindi';
  // Hindi is force-ordered first (RivaViewModel)
  const languages = langsParam.split(',').map(l => l.trim()).filter(Boolean);
  const orderedLangs = ["Hindi", ...languages.filter(l => l.toLowerCase() !== "hindi")];

  try {
    const vd = await getVisitorData();

    async function fetchQuerySongs(query: string, limit = 20): Promise<any[]> {
      const ctx = musicRemixContext(gl);
      if (vd) (ctx.client as any).visitorData = vd;
      const resp = await fetch(`${MUSIC_BASE}/youtubei/v1/search?prettyPrint=false`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": WEB_UA,
          "Origin": "https://music.youtube.com",
          "Referer": "https://music.youtube.com/"
        },
        body: JSON.stringify({
          context: ctx,
          query: query,
          params: SEARCH_SONGS_PARAMS
        })
      });
      const data = await resp.json();
      const songs: any[] = [];
      const seen = new Set<string>();

      for (const r of walkTree(data, 'musicResponsiveListItemRenderer')) {
        const item = parseSong(r);
        if (!item) continue;
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        songs.push(item);
        if (songs.length >= limit) break;
      }
      return songs;
    }

    // 1. Trending + language sections + chill — all fetched in parallel for speed
    const trendingQuery = orderedLangs.length === 1
      ? `trending ${orderedLangs[0].toLowerCase()} songs top hits`
      : `${orderedLangs.slice(0, 3).join(" ")} trending songs top hits`;

    const langSpecs = orderedLangs.slice(0, 4).map(getLanguageSpec);

    const [trendingTracks, ...langResults] = await Promise.all([
      fetchQuerySongs(trendingQuery, 25),
      ...langSpecs.map(spec => fetchQuerySongs(spec.query, 20))
    ]);
    const chillTracks = await fetchQuerySongs(`${orderedLangs.slice(0, 2).join(" ")} lofi acoustic peaceful songs`, 15);

    const sections: any[] = [];
    if (trendingTracks.length > 0) {
      sections.push({
        id: "trending",
        title: orderedLangs.length === 1 ? `Trending ${orderedLangs[0]} Songs` : `Trending Hits (${orderedLangs.slice(0, 3).join(", ")})`,
        subtitle: `Top chartbusters in ${orderedLangs.slice(0, 3).join(", ")}`,
        tracks: trendingTracks
      });
    }

    for (let i = 0; i < langSpecs.length; i++) {
      const tracks = langResults[i];
      if (tracks.length > 0) {
        sections.push({
          id: langSpecs[i].id,
          title: langSpecs[i].title,
          subtitle: langSpecs[i].subtitle,
          tracks
        });
      }
    }

    if (chillTracks.length > 0) {
      sections.push({
        id: "chill",
        title: "Chill & Focus",
        subtitle: "Low-key beats & acoustic relaxing music",
        tracks: chillTracks
      });
    }

    return NextResponse.json({ sections });
  } catch (err: any) {
    console.error("Home feed error:", err);
    return NextResponse.json({ error: err.message, sections: [] }, { status: 500 });
  }
}

const SEARCH_SONGS_PARAMS = "EgWKAQIIAWoKEAkQBRAKEAMQBA==";

function parseSong(r: any) {
  const flex = r.flexColumns || [];
  const cols: string[] = flex.map((c: any) => textOf(c?.musicResponsiveListItemFlexColumnRenderer?.text));
  const title = (cols[0] || "").trim();
  if (!title) return null;

  let videoId: string | null =
    r?.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId || null;
  if (!videoId) {
    for (const run of (flex[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [])) {
      const v = run?.navigationEndpoint?.watchEndpoint?.videoId;
      if (v) { videoId = v; break; }
    }
  }
  if (!videoId) return null;

  const detailStr = cols.slice(1).join(" • ");
  const segments = detailStr.split("•").map((s: string) => s.trim()).filter(Boolean);

  let duration = 0;
  for (const seg of segments) {
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(seg)) {
      duration = parseDurationToSeconds(seg);
      break;
    }
  }
  if (!isRealSong(title, duration)) return null;

  const STAT_WORDS = ["plays", "views", "monthly audience", "subscribers", "songs", "episodes"];
  const meaningful = segments.filter(s => {
    const lower = s.toLowerCase();
    return s.length < 90 && !STAT_WORDS.some(w => lower.includes(w)) && !/^\d{1,2}:\d{2}(:\d{2})?$/.test(s);
  });

  const rawThumb = (r.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || r.thumbnail?.thumbnails || []).slice(-1)[0]?.url;

  return {
    id: videoId,
    videoId,
    title,
    artist: meaningful[0] || "YouTube Music",
    durationSeconds: duration,
    thumbnailUrl: upgradeThumb(rawThumb)
  };
}

function textOf(obj: any): string {
  if (!obj) return "";
  if (obj.simpleText) return obj.simpleText;
  if (Array.isArray(obj.runs)) return obj.runs.map((r: any) => r.text || "").join("");
  return "";
}

function parseDurationToSeconds(text: string): number {
  if (!text) return 0;
  const parts = text.split(":").map((x: string) => parseInt(x, 10));
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

function upgradeThumb(url: string | null | undefined): string | null {
  if (!url) return null;
  let clean = url;
  if (clean.includes("googleusercontent.com") || clean.includes("ggpht.com")) {
    clean = clean.replace(/=w\d+-h\d+[^&?]*/g, "=w800-h800-l90-rj").replace(/=s\d+[^&?]*/g, "=s800-l90-rj");
  }
  if (clean.includes("i.ytimg.com") || clean.includes("img.youtube.com")) {
    clean = clean.replace("/hqdefault.jpg", "/sddefault.jpg").replace("/mqdefault.jpg", "/sddefault.jpg").replace("/default.jpg", "/sddefault.jpg");
  }
  return clean;
}