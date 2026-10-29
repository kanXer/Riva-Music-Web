/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import {
  MUSIC_BASE,

  WEB_UA,
  getVisitorData,
  musicRemixContext,
  parseMusicItem,
  walkTree,
  isRealSong,
  SEARCH_FILTER_PARAMS
} from '@/lib/innertube';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') || "").trim();
  const filter = searchParams.get('filter') || 'songs';
  const gl = searchParams.get('gl') || 'IN';

  if (!q) return NextResponse.json({ results: [] });

  try {
    const vd = await getVisitorData();
    const ctx = musicRemixContext(gl);
    if (vd) (ctx.client as any).visitorData = vd;

    const payload: any = {
      context: ctx,
      query: q
    };
    if (SEARCH_FILTER_PARAMS[filter]) {
      payload.params = SEARCH_FILTER_PARAMS[filter];
    }

    const resp = await fetch(`${MUSIC_BASE}/youtubei/v1/search?prettyPrint=false`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": WEB_UA,
        "Origin": "https://music.youtube.com",
        "Referer": "https://music.youtube.com/"
      },
      body: JSON.stringify(payload)
    });
    const data = await resp.json();
    const results: any[] = [];
    const seen = new Set<string>();

    for (const r of walkTree(data, 'musicResponsiveListItemRenderer')) {
      const item = parseMusicItem(r, filter);
      if (!item) continue;
      // Songs filter: apply isRealSong like the Android app
      if (item.type === 'song' || item.type === 'video') {
        if (!isRealSong(item.title, item.durationSeconds)) continue;
        if (!item.videoId) continue;
      }
      const key = `${item.type}:${item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(item);
      if (results.length >= 30) break;
    }
    return NextResponse.json({ results });
  } catch (err: any) {
    console.error("Search error:", err);
    return NextResponse.json({ error: err.message, results: [] }, { status: 500 });
  }
}