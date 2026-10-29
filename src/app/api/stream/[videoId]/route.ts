/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
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
  cookieHeader: string | null
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
    })
  });
  return resp.json();
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  const { videoId } = await params;
  if (!videoId) return NextResponse.json({ error: "Missing videoId" }, { status: 400 });

  try {
    let session = await getYouTubeSession(videoId);
    let lastData: any = null;
    const botMessages: string[] = [];
    const clientAttempts: Array<{ name: string; status?: string; reason?: string; formatsCount?: number }> = [];

    // Pass 1: full client chain in priority order
    for (const clientSpec of PLAYBACK_CLIENTS) {
      try {
        const data = await tryPlayer(videoId, clientSpec, session.visitorData, session.cookieHeader);
        lastData = data;
        const fmts = (data?.streamingData?.adaptiveFormats || []).concat(data?.streamingData?.formats || []).filter((f: any) => f.url);
        clientAttempts.push({
          name: clientSpec.name,
          status: data?.playabilityStatus?.status,
          reason: data?.playabilityStatus?.reason,
          formatsCount: fmts.length
        });

        if (data?.playabilityStatus?.status === "OK") {
          const resolved = selectStream(data, clientSpec.userAgent);
          if (resolved) return NextResponse.json(resolved);
        }
        const reason = data?.playabilityStatus?.reason || "";
        botMessages.push(reason);
      } catch (e: any) {
        botMessages.push(e?.message || "network error");
        clientAttempts.push({ name: clientSpec.name, reason: e?.message });
      }
    }

    // Pass 2: only if all failed and we saw bot block -> refresh session for this video
    if (isBotBlocked(botMessages)) {
      session = await getYouTubeSession(videoId, true);
      for (const clientSpec of PLAYBACK_CLIENTS) {
        try {
          const data = await tryPlayer(videoId, clientSpec, session.visitorData, session.cookieHeader);
          lastData = data;
          if (data?.playabilityStatus?.status === "OK") {
            const resolved = selectStream(data, clientSpec.userAgent);
            if (resolved) return NextResponse.json(resolved);
          }
        } catch (_) {}
      }
    }

    return NextResponse.json({
      error: "Stream resolution failed on all clients",
      attempts: clientAttempts,
      playability: lastData?.playabilityStatus?.status,
      reason: lastData?.playabilityStatus?.reason
    }, { status: 404 });
  } catch (err: any) {
    console.error("Stream resolution error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// selectStream from InnerTubeClient.kt — highest-bitrate audio-only, muxed fallback
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