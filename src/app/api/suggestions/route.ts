/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import {
  MUSIC_BASE,
  WEB_UA,
  getVisitorData,
  musicRemixContext,
  parseMusicItem,
  textRuns
} from '@/lib/innertube';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') || "").trim();
  const gl = searchParams.get('gl') || 'IN';

  if (!q) return NextResponse.json({ queries: [], items: [] });

  try {
    const vd = await getVisitorData();
    const ctx = musicRemixContext(gl);
    if (vd) (ctx.client as any).visitorData = vd;

    const r = await fetch(`${MUSIC_BASE}/youtubei/v1/music/get_search_suggestions?prettyPrint=false`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": WEB_UA,
        "Origin": "https://music.youtube.com",
        "Referer": "https://music.youtube.com/"
      },
      body: JSON.stringify({
        context: ctx,
        input: q
      })
    });
    const data = await r.json();
    const queries: string[] = [];
    const items: any[] = [];

    function walk(node: any) {
      if (!node) return;
      if (node.searchSuggestionRenderer) {
        const text = textRuns(node.searchSuggestionRenderer.suggestion);
        if (text && !queries.includes(text)) queries.push(text);
      }
      if (node.musicResponsiveListItemRenderer) {
        const item = parseMusicItem(node.musicResponsiveListItemRenderer);
        if (item) items.push(item);
      }
      if (typeof node === 'object') {
        for (const k of Object.keys(node)) walk(node[k]);
      }
    }
    walk(data);
    return NextResponse.json({ queries: queries.slice(0, 8), items: items.slice(0, 6) });
  } catch (err: any) {
    console.error("Suggestions error:", err);
    return NextResponse.json({ queries: [], items: [] });
  }
}