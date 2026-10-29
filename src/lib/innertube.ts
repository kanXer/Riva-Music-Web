/* eslint-disable @typescript-eslint/no-explicit-any */
// InnerTube and YouTube API helpers for RivaMusic
// Ported 1:1 from the Android app's InnerTubeClient.kt / Models.kt
const YOUTUBE_BASE = "https://www.youtube.com";
const MUSIC_BASE = "https://music.youtube.com";
const WEB_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
const IOS_KEY = "AIzaSyB-63vPrdThhKuerbB2N_l7Kwwcxj6yUAc";
const REMIX_VERSION = "1.20260708.01.00";
const VISIONOS_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";
const WEB_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";

// Exact search-filter params from SearchModels.kt
const SEARCH_FILTER_PARAMS: Record<string, string> = {
  songs: "EgWKAQIIAWoKEAkQBRAKEAMQBA==",
  albums: "EgWKAQIYAWoKEAkQChAFEAMQBA==",
  artists: "EgWKAQIgAWoKEAkQChAFEAMQBA==",
  playlists: "EgeKAQQoADgBagwQDhAKEAMQBRAJEAQ="
};

const DURATION_REGEX = /^\d{1,2}:\d{2}(?::\d{2})?$/;

export function upgradeThumbnail(url: string | null | undefined): string | null {
  if (!url) return null;
  let clean = url;
  if (clean.includes("googleusercontent.com") || clean.includes("ggpht.com")) {
    // These URLs are sensitive to size rewrites: asking for any size other than
    // the original (w800-h800-l90-rj, s0, s512…) makes Google return a non-image
    // response that browsers block (net::ERR_BLOCKED_BY_ORB). Stripping the
    // "=..." suffix always serves the original full-resolution artwork.
    clean = clean.replace(/=[whs]\d+[^/]*$/, "");
  }
  if (clean.includes("i.ytimg.com") || clean.includes("img.youtube.com")) {
    clean = clean.replace("/hqdefault.jpg", "/sddefault.jpg")
                 .replace("/mqdefault.jpg", "/sddefault.jpg")
                 .replace("/default.jpg", "/sddefault.jpg")
                 .replace(/=w\d+-h\d+[^&?]*/g, "=w800-h800")
                 .replace(/=s\d+[^&?]*/g, "=s800");
  }
  return clean;
}

let cachedVisitorData: string | null = null;
let cachedCookies: string | null = null;
let visitorDataPrimedAt = 0;
const SESSION_TTL = 30 * 60 * 1000;

export interface YouTubeSessionData {
  visitorData: string | null;
  cookieHeader: string | null;
}

export async function getYouTubeSession(videoId = "kJQP7kiw5Fk", force = false): Promise<YouTubeSessionData> {
  const now = Date.now();
  if (!force && cachedVisitorData && (now - visitorDataPrimedAt < SESSION_TTL)) {
    return {
      visitorData: cachedVisitorData,
      cookieHeader: cachedCookies
    };
  }

  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
      headers: {
        "User-Agent": WEB_UA,
        "Accept-Language": "en-US,en;q=0.9",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });

    // Capture response cookies (VISITOR_INFO1_LIVE, YSC, __Secure-YNID, etc.)
    const rawCookies: string[] = typeof (res.headers as any).getSetCookie === 'function'
      ? (res.headers as any).getSetCookie()
      : [res.headers.get("set-cookie") || ""];

    const cookieHeader = rawCookies
      .map(c => (c || "").split(";")[0].trim())
      .filter(Boolean)
      .join("; ");

    const html = await res.text();
    const match =
      html.match(/"INNERTUBE_CONTEXT_VISITOR_DATA":"([^"]+)"/) ||
      html.match(/"visitorData":"([^"]+)"/) ||
      html.match(/"VISITOR_DATA":"([^"]+)"/);

    if (match && match[1]) {
      cachedVisitorData = match[1];
      cachedCookies = cookieHeader || null;
      visitorDataPrimedAt = now;
      return { visitorData: cachedVisitorData, cookieHeader: cachedCookies };
    }
    if (cookieHeader) {
      cachedCookies = cookieHeader;
    }
  } catch (err) {
    console.error("Error fetching YouTube session:", err);
  }

  return {
    visitorData: cachedVisitorData,
    cookieHeader: cachedCookies
  };
}

export async function getVisitorData(force = false): Promise<string | null> {
  const session = await getYouTubeSession("kJQP7kiw5Fk", force);
  return session.visitorData;
}

export function musicRemixContext(gl = "IN") {
  return {
    client: {
      clientName: "WEB_REMIX",
      clientVersion: REMIX_VERSION,
      hl: "en",
      gl: gl === "WW" ? "US" : gl,
      timeZone: "UTC",
      utcOffsetMinutes: 0
    }
  };
}

export function textRuns(obj: any): string {
  if (!obj) return "";
  if (obj.simpleText) return obj.simpleText;
  if (Array.isArray(obj.runs)) return obj.runs.map((r: any) => r.text || "").join("");
  return "";
}

export function parseDurationToSeconds(text: string): number {
  if (!text) return 0;
  const parts = text.split(":").map(x => parseInt(x, 10));
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return (parts[0] * 60) + parts[1];
  if (parts.length === 3) return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
  return 0;
}

// Models.kt isRealSong() — drops shorts/jukeboxes/mashups/megamixes etc.
const BLOCKED_TITLE_WORDS = [
  "jukebox", "mashup", "non stop", "nonstop", "non-stop", "full album",
  "full audio songs", "all songs", "audio jukebox", "video jukebox",
  "hours", "hour", "1 hr", "2 hr", "3 hr", "4 hr", "5 hr", "6 hr", "7 hr",
  "8 hr", "mega mix", "megamix", "compilation"
];

export function isRealSong(title: string, durationSeconds: number): boolean {
  if (durationSeconds >= 1 && durationSeconds <= 25) return false;
  if (durationSeconds > 720) return false;
  const lower = (title || "").toLowerCase();
  return !BLOCKED_TITLE_WORDS.some(w => lower.includes(w));
}

// Models.kt cleanSongTitle — used for lyrics search queries
export function cleanSongTitle(title: string): string {
  let t = (title || "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ");
  for (const sep of ["|", "feat.", "ft."]) {
    const idx = t.toLowerCase().indexOf(sep);
    if (idx > 0) t = t.slice(0, idx);
  }
  t = t.replace(/\b(official|lyrics|video|audio|full song|hd|4k|mv|teaser|trailer|remix video|music video)\b/gi, " ");
  t = t.replace(/\s+/g, " ").trim();
  return t || (title || "").trim();
}

// Models.kt cleanArtistName
export function cleanArtistName(artist: string): string {
  let a = (artist || "").replace(/\([^)]*\)/g, " ").replace(/\[[^\]]*\]/g, " ");
  for (const sep of [",", "&", "feat.", "ft."]) {
    const idx = a.indexOf(sep);
    if (idx > 0) a = a.slice(0, idx);
  }
  a = a.replace(/\b(topic|vevo|official)\b/gi, " ");
  a = a.replace(/\s+/g, " ").trim();
  return a || (artist || "").trim();
}

export function isRecordLabel(artist: string): boolean {
  const labels = [
    "t-series", "tseries", "zee music", "sony music", "sonymusic", "tips official",
    "tips music", "yrf", "saregama", "speed records", "geet mp3", "white hill",
    "desi melodies", "aditya music", "lahari music", "times music", "eros now",
    "svf", "bongo", "speed punjabi", "single track studios", "jass records",
    "vevo", "official channel", "records", "music company"
  ];
  const lower = (artist || "").toLowerCase();
  return labels.some(l => lower.includes(l));
}

// getLyricSearchQueries from Models.kt — ranked queries for lyrics providers
export function getLyricSearchQueries(artist: string, title: string): string[] {
  const a = cleanArtistName(artist);
  const t = cleanSongTitle(title);
  const queries: string[] = [];
  const push = (q: string) => {
    const norm = q.replace(/\s+/g, " ").trim();
    if (norm && !queries.some(x => x.toLowerCase() === norm.toLowerCase())) queries.push(norm);
  };
  if (!isRecordLabel(artist) && a && t) {
    push(`${a} ${t}`);
    for (const part of t.split(/[-–—]/).map(p => p.trim()).filter(Boolean)) {
      push(`${a} ${part}`);
    }
  }
  if (t) push(t);
  for (const part of t.split(/[-–—]/).map(p => p.trim()).filter(Boolean)) {
    push(part);
  }
  return queries;
}

export type SearchItemType = 'song' | 'video' | 'album' | 'artist' | 'playlist';

export interface ParsedMusicItem {
  id: string;
  videoId: string | null;
  browseId: string | null;
  playlistId: string | null;
  type: SearchItemType;
  title: string;
  artist: string;
  album: string;
  durationSeconds: number;
  thumbnailUrl: string | null;
}

// InnerTubeClient.toSearchItem() — parses musicResponsiveListItemRenderer
export function parseMusicItem(r: any, filter?: string | null): ParsedMusicItem | null {
  const flex = r.flexColumns || [];
  const cols: string[] = flex.map((c: any) => textRuns(c?.musicResponsiveListItemFlexColumnRenderer?.text));
  const title = (cols[0] || "").trim();
  if (!title) return null;

  // videoId: play button endpoint -> first flex column run nav endpoint
  let videoId: string | null =
    r?.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId || null;
  if (!videoId) {
    for (const run of (flex[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [])) {
      const v = run?.navigationEndpoint?.watchEndpoint?.videoId;
      if (v) { videoId = v; break; }
    }
  }

  const browseId: string | null = r?.navigationEndpoint?.browseEndpoint?.browseId || null;

  // playlistId from menu (watchPlaylistEndpoint)
  let playlistId: string | null = null;
  const menuItems = r?.menu?.menuRenderer?.items || [];
  for (const m of menuItems) {
    const pid = m?.menuNavigationItemRenderer?.navigationEndpoint?.watchPlaylistEndpoint?.playlistId;
    if (pid) { playlistId = pid; break; }
  }

  const rawThumb = (r.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || r.thumbnail?.thumbnails || []).slice(-1)[0]?.url;
  const thumbnail = upgradeThumbnail(rawThumb);

  // detail segments: columns 1..n joined with " • " then split on "•"
  const detailStr = cols.slice(1).join(" • ");
  const segments = detailStr.split("•").map((s: string) => s.trim()).filter(Boolean);

  // Duration from fixed columns first, then matching segment
  let duration = 0;
  const fixedCols = (r.fixedColumns || []).map((c: any) => textRuns(c?.musicResponsiveListItemFixedColumnRenderer?.text));
  for (const fx of fixedCols) {
    if (DURATION_REGEX.test(fx)) { duration = parseDurationToSeconds(fx); break; }
  }
  if (!duration) {
    for (const p of segments) {
      if (DURATION_REGEX.test(p)) { duration = parseDurationToSeconds(p); break; }
    }
  }

  // Type detection (first segment lowercased), Kotlin rules
  const STAT_WORDS = ["plays", "views", "monthly audience", "subscribers", "songs", "episodes"];
  const firstSeg = (segments[0] || "").toLowerCase();
  let type: SearchItemType | null = null;
  if (firstSeg === "song") type = "song";
  else if (firstSeg === "video") type = "video";
  else if (["album", "single", "ep"].includes(firstSeg)) type = "album";
  else if (firstSeg === "artist") type = "artist";
  else if (["playlist", "podcast"].includes(firstSeg)) type = "playlist";

  // Inference fallback (suggestions omit prefix)
  if (!type) {
    if (browseId?.startsWith("UC")) type = "artist";
    else if (browseId?.startsWith("MP")) type = "album";
    else if (browseId?.startsWith("VL") || playlistId) type = "playlist";
    else if (videoId) type = "song";
    else return null;
  }

  // Filter override (search filter chips)
  if (filter === 'songs') {
    type = type === 'video' ? 'video' : 'song';
  } else if (filter === 'albums') {
    type = 'album';
  } else if (filter === 'artists') {
    type = 'artist';
  } else if (filter === 'playlists') {
    type = 'playlist';
  }

  // Final id per type
  let id: string;
  if (type === 'song' || type === 'video') {
    if (!videoId) return null;
    id = videoId;
  } else if (type === 'album' || type === 'artist') {
    if (!browseId) return null;
    id = browseId;
  } else {
    id = browseId || (playlistId ? `VL${playlistId}` : "");
    if (!id) return null;
  }

  // Subtitle building: strip stat words & durations
  const meaningful = segments.filter(s => {
    const lower = s.toLowerCase();
    return (
      s.length < 90 &&
      !STAT_WORDS.some(w => lower.includes(w)) &&
      !DURATION_REGEX.test(s)
    );
  });

  let artist: string;
  let album = "";
  if (type === 'song' || type === 'video') {
    artist = meaningful[0] || segments[0]?.slice(0, 90) || "YouTube Music";
    album = (meaningful[1] && meaningful[1] !== artist) ? meaningful[1] : "";
  } else if (type === 'album') {
    artist = meaningful[0] || "YouTube Music";
  } else if (type === 'artist') {
    artist = title;
  } else {
    artist = meaningful[0] || "YouTube Music";
  }

  return {
    id,
    videoId: (type === 'song' || type === 'video') ? videoId : videoId,
    browseId,
    playlistId,
    type,
    title,
    artist,
    album,
    durationSeconds: duration,
    thumbnailUrl: thumbnail
  };
}

// Walk the whole JSON tree collecting renderer nodes
export function walkTree(root: any, rendererKey: string): any[] {
  const out: any[] = [];
  function visit(node: any) {
    if (!node || typeof node !== 'object') return;
    if (node[rendererKey]) out.push(node[rendererKey]);
    for (const k of Object.keys(node)) visit(node[k]);
  }
  visit(root);
  return out;
}

export { YOUTUBE_BASE, MUSIC_BASE, WEB_KEY, IOS_KEY, REMIX_VERSION, VISIONOS_UA, WEB_UA, SEARCH_FILTER_PARAMS, DURATION_REGEX };