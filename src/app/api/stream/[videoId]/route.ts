/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import CryptoJS from 'crypto-js';
import {
  getYouTubeSession
} from '@/lib/innertube';

// Playback clients for stream extraction — exact order and configuration from RivaMusic InnerTubeClient.kt
const PLAYBACK_CLIENTS = [
  {
    name: "VISIONOS",
    client: {
      clientName: "VISIONOS",
      clientVersion: "1.02",
      deviceMake: "Apple",
      deviceModel: "RealityDevice17,1",
      platform: "MOBILE",
      osName: "visionOS",
      osVersion: "26.5.23O471",
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
      hl: "en",
      timeZone: "UTC",
      utcOffsetMinutes: 0
    },
    clientNameHeader: "101",
    versionHeader: "1.02",
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
    url: "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
    needsVisitorData: true,
    key: null as string | null
  },
  {
    name: "ANDROID_VR",
    client: {
      clientName: "ANDROID_VR",
      clientVersion: "1.61.29",
      userAgent: "com.google.android.apps.youtube.vr.oculus/1.61.29 (Linux; U; Android 7.1.1; eureka-user Build/N2G512) gzip",
      osName: "Android",
      osVersion: "7.1.1",
      hl: "en",
      timeZone: "UTC",
      utcOffsetMinutes: 0
    },
    clientNameHeader: "28",
    versionHeader: "1.61.29",
    userAgent: "com.google.android.apps.youtube.vr.oculus/1.61.29 (Linux; U; Android 7.1.1; eureka-user Build/N2G512) gzip",
    url: "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
    needsVisitorData: true,
    key: null
  },
  {
    name: "IOS",
    client: {
      clientName: "IOS",
      clientVersion: "21.26.4",
      deviceMake: "Apple",
      deviceModel: "iPhone16,2",
      userAgent: "com.google.ios.youtube/21.26.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)",
      hl: "en",
      platform: "MOBILE",
      osName: "IOS",
      osVersion: "18.3.2.22D82",
      timeZone: "UTC",
      gl: "US",
      utcOffsetMinutes: 0
    },
    clientNameHeader: "5",
    versionHeader: "21.26.4",
    userAgent: "com.google.ios.youtube/21.26.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)",
    url: "https://www.youtube.com/youtubei/v1/player?key=AIzaSyB-63vPrdThhKuerbB2N_l7Kwwcxj6yUAc&prettyPrint=false",
    needsVisitorData: true,
    key: "AIzaSyB-63vPrdThhKuerbB2N_l7Kwwcxj6yUAc"
  },
  {
    name: "ANDROID",
    client: {
      clientName: "ANDROID",
      clientVersion: "21.26.364",
      androidSdkVersion: 30,
      userAgent: "com.google.android.youtube/21.26.364 (Linux; U; Android 11) gzip",
      hl: "en",
      timeZone: "UTC",
      utcOffsetMinutes: 0,
      osName: "Android",
      osVersion: "11"
    },
    clientNameHeader: "3",
    versionHeader: "21.26.364",
    userAgent: "com.google.android.youtube/21.26.364 (Linux; U; Android 11) gzip",
    url: "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
    needsVisitorData: false,
    key: null
  }
];

function isBotBlocked(messages: string[]): boolean {
  return messages.some(m => m.toLowerCase().includes("confirm you") || m.toLowerCase().includes("not a bot"));
}

async function tryPlayer(
  videoId: string,
  clientSpec: typeof PLAYBACK_CLIENTS[number],
  vd: string | null,
  cookieHeader: string | null,
  timeoutMs = 5000
) {
  const context: any = { client: { ...clientSpec.client } };
  if (clientSpec.needsVisitorData && vd) context.client.visitorData = vd;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": clientSpec.userAgent,
    "Origin": "https://www.youtube.com",
    "X-Youtube-Client-Name": clientSpec.clientNameHeader,
    "X-Youtube-Client-Version": clientSpec.versionHeader
  };
  if (clientSpec.needsVisitorData && vd) headers["X-Goog-Visitor-Id"] = vd;

  // Use primed session cookies (from watch page response) or YOUTUBE_COOKIE env override
  const effectiveCookie = process.env.YOUTUBE_COOKIE || cookieHeader;
  if (effectiveCookie) {
    headers["Cookie"] = effectiveCookie;
  }

  const resp = await fetch(clientSpec.url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      context,
      videoId,
      contentCheckOk: true,
      racyCheckOk: true
    }),
    signal: AbortSignal.timeout(timeoutMs)
  });
  return resp.json();
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// In-memory stream cache to avoid re-resolving repeatedly
const streamCache = new Map<string, { data: any; expiry: number }>();

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  const { videoId } = await params;
  if (!videoId) return NextResponse.json({ error: "Missing videoId" }, { status: 400 });

  // 1. Check in-memory cache
  const cached = streamCache.get(videoId);
  if (cached && Date.now() < cached.expiry) {
    return NextResponse.json(cached.data, {
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
      }
    });
  }

  const { searchParams } = new URL(req.url);
  const qTitle = searchParams.get('title') || '';
  const qArtist = searchParams.get('artist') || '';
  const initialQuery = `${qTitle} ${qArtist}`.trim();

  try {
    // 2. Race: Direct Clean Music Resolver vs Parallel Fast YouTube Clients
    const directPromise = resolveDirectAudio(videoId, initialQuery);

    const ytPromise = (async () => {
      let session;
      try {
        session = await getYouTubeSession(videoId);
      } catch (_) {
        return null;
      }

      // Query top playback clients in parallel with a tight 2s timeout
      const attempts = PLAYBACK_CLIENTS.map(async (clientSpec) => {
        try {
          const data = await tryPlayer(videoId, clientSpec, session.visitorData, session.cookieHeader, 2000);
          if (data?.playabilityStatus?.status === "OK") {
            const resolved = selectStream(data, clientSpec.userAgent);
            if (resolved) return resolved;
          }
        } catch (_) {}
        return null;
      });

      const results = await Promise.allSettled(attempts);
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) return r.value;
      }
      return null;
    })();

    // Run both in parallel; if direct or yt finishes first with a valid stream, use it
    let streamResult: any = null;

    try {
      const firstValid = await Promise.any([
        directPromise.then(res => {
          if (!res?.url) throw new Error("No direct stream");
          return {
            url: res.url,
            mimeType: "audio/mp4",
            itag: 140,
            bitrate: 320000,
            durationMs: (parseInt(res.duration || "0", 10) || 180) * 1000,
            title: res.title,
            author: res.artist,
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
          };
        }),
        ytPromise.then(res => {
          if (!res) throw new Error("No YT stream");
          return res;
        })
      ]);
      streamResult = firstValid;
    } catch (_) {
      // If Promise.any rejected (both threw fast), wait for direct promise fallback
      const fallback = await directPromise;
      if (fallback?.url) {
        streamResult = {
          url: fallback.url,
          mimeType: "audio/mp4",
          itag: 140,
          bitrate: 320000,
          durationMs: (parseInt(fallback.duration || "0", 10) || 180) * 1000,
          title: fallback.title,
          author: fallback.artist,
          userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        };
      }
    }

    if (streamResult) {
      // Cache stream for 2 hours
      streamCache.set(videoId, {
        data: streamResult,
        expiry: Date.now() + 2 * 60 * 60 * 1000
      });

      return NextResponse.json(streamResult, {
        headers: {
          'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
        }
      });
    }

    return NextResponse.json({
      error: "Stream resolution failed on all clients",
      playability: "NOT_FOUND"
    }, { status: 404 });
  } catch (err: any) {
    console.error("Stream resolution error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Direct clean audio resolver for guaranteed stream delivery on datacenter/cloud IPs
async function resolveDirectAudio(videoId: string, fallbackTitle?: string) {
  let query = fallbackTitle || "";

  if (!query) {
    try {
      const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`, {
        signal: AbortSignal.timeout(2500)
      });
      if (oembedRes.ok) {
        const oembedData = await oembedRes.json();
        query = (oembedData.title || "").replace(/\[.*?\]|\(.*?\)/g, "").trim();
      }
    } catch (_) {}
  }

  if (!query) query = videoId;

  const searchUrl = `https://www.jiosaavn.com/api.php?__call=autocomplete.get&_marker=0&query=${encodeURIComponent(query)}&ctx=web6dot0&_format=json`;
  const res = await fetch(searchUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    signal: AbortSignal.timeout(3500)
  });
  if (!res.ok) return null;

  const data = await res.json();
  const song = data?.songs?.data?.[0];
  if (!song?.id) return null;

  const songUrl = `https://www.jiosaavn.com/api.php?__call=song.getDetails&pids=${song.id}&_marker=0&ctx=web6dot0&_format=json`;
  const sRes = await fetch(songUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    signal: AbortSignal.timeout(3500)
  });
  if (!sRes.ok) return null;

  const sData = await sRes.json();
  const encUrl = sData?.songs?.[0]?.encrypted_media_url;
  if (!encUrl) return null;

  const key = CryptoJS.enc.Utf8.parse("38346591");
  const cipherParams = CryptoJS.lib.CipherParams.create({
    ciphertext: CryptoJS.enc.Base64.parse(encUrl)
  });
  const decrypted = CryptoJS.DES.decrypt(
    cipherParams,
    key,
    { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 }
  ).toString(CryptoJS.enc.Utf8);

  if (!decrypted || !decrypted.startsWith("http")) return null;

  const audioUrl = decrypted.replace("_96.mp4", "_320.mp4").replace("_160.mp4", "_320.mp4");
  return {
    url: audioUrl,
    title: song.title || sData?.songs?.[0]?.song,
    artist: song.music || sData?.songs?.[0]?.primary_artists,
    duration: sData?.songs?.[0]?.duration
  };
}
function selectStream(data: any, clientUserAgent: string) {
  const formats = (data?.streamingData?.adaptiveFormats || []).concat(data?.streamingData?.formats || []);

  const audioOnly = formats.filter((f: any) =>
    f.mimeType?.startsWith("audio/") && f.url
  );
  const muxed = formats.filter((f: any) => {
    const m = f.mimeType || "";
    return f.url && (m.startsWith("audio/") || m.includes("mp4a") || m.includes("opus"));
  });

  const preferred = [...audioOnly, ...muxed].sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0))[0];
  if (!preferred) return null;

  return {
    url: preferred.url,
    mimeType: preferred.mimeType || "audio/mp4",
    itag: preferred.itag,
    bitrate: preferred.bitrate,
    durationMs: parseInt(data?.videoDetails?.lengthSeconds || "0", 10) * 1000,
    title: data?.videoDetails?.title,
    author: data?.videoDetails?.author,
    userAgent: clientUserAgent
  };
}