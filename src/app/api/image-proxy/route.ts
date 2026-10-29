/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from 'next/server';

/**
 * Same-origin proxy for cover art (Google hosts can block cross-origin blob
 * fetches). Allow-listed to known image CDNs only.
 */
function isAllowedHost(hostname: string): boolean {
  if (
    hostname.endsWith('.googleusercontent.com') ||
    hostname.endsWith('.ytimg.com') ||
    hostname.endsWith('.ggpht.com') ||
    hostname === 'img.youtube.com' ||
    hostname === 'music.youtube.com'
  ) {
    return true;
  }
  return false;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const target = searchParams.get('url');
    if (!target) return NextResponse.json({ error: 'Missing url' }, { status: 400 });

    let parsed: URL;
    try {
      parsed = new URL(target);
    } catch (_) {
      return NextResponse.json({ error: 'Invalid url' }, { status: 400 });
    }
    if (!isAllowedHost(parsed.hostname)) {
      return NextResponse.json({ error: 'Host not allowed' }, { status: 403 });
    }

    const upstream = await fetch(parsed.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: 'Upstream failed' }, { status: 502 });
    }

    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'image/jpeg',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (_) {
    return NextResponse.json({ error: 'Proxy failed' }, { status: 500 });
  }
}
