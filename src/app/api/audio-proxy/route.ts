/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from 'next/server';
import { VISIONOS_UA } from '@/lib/innertube';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const streamUrl = searchParams.get('url');
  if (!streamUrl) return new Response("Missing url param", { status: 400 });

  // Use the UA of the InnerTube client that produced the URL (falls back to VISIONOS)
  const clientUa = searchParams.get('ua') || VISIONOS_UA;

  try {
    const rangeHeader = req.headers.get('range');
    const headers: Record<string, string> = {
      "User-Agent": clientUa,
      "Referer": "https://www.youtube.com/",
      "Origin": "https://www.youtube.com"
    };
    if (rangeHeader) {
      headers["Range"] = rangeHeader;
    }

    const audioRes = await fetch(streamUrl, { headers });
    if (!audioRes.ok && audioRes.status !== 206) {
      return new Response(`Upstream error ${audioRes.status}`, { status: audioRes.status });
    }

    const responseHeaders = new Headers();
    const forwardHeaders = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'expires', 'date', 'last-modified', 'etag'];
    forwardHeaders.forEach(h => {
      const val = audioRes.headers.get(h);
      if (val) responseHeaders.set(h, val);
    });
    responseHeaders.set('Cache-Control', 'public, max-age=1800');

    return new Response(audioRes.body, {
      status: audioRes.status,
      headers: responseHeaders
    });
  } catch (err: any) {
    console.error("Audio proxy error:", err);
    return new Response("Proxy streaming failed", { status: 500 });
  }
}