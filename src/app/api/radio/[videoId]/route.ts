/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import {
  MUSIC_BASE,
  REMIX_VERSION,
  WEB_UA,
  getVisitorData,
  musicRemixContext,
  parseDurationToSeconds,
  textRuns,
  upgradeThumbnail,
  isRealSong
} from '@/lib/innertube';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  const { videoId } = await params;
  if (!videoId) return NextResponse.json({ tracks: [] });

  try {
    const vd = await getVisitorData();
    const gl = (req.nextUrl.searchParams.get('gl') || 'IN');
    const ctx = musicRemixContext(gl);
    if (vd) (ctx.client as any).visitorData = vd;

    const resp = await fetch(`${MUSIC_BASE}/youtubei/v1/next?prettyPrint=false`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": WEB_UA,
        "Origin": "https://music.youtube.com",
        "Referer": "https://music.youtube.com/"
      },
      body: JSON.stringify({
        context: ctx,
        videoId: videoId,
        playlistId: `RDAMVM${videoId}`
      })
    });
    const data = await resp.json();
    const tracks: any[] = [];
    const seen = new Set<string>([videoId]);

    function walk(node: any) {
      if (!node) return;
      if (node.playlistPanelVideoRenderer) {
        const r = node.playlistPanelVideoRenderer;
        const vId = r.videoId;
        const title = textRuns(r.title);
        const artist = textRuns(r.longBylineText) || textRuns(r.shortBylineText) || "YouTube Music";
        const durationSeconds = parseDurationToSeconds(textRuns(r.lengthText));
        const thumbs = r.thumbnail?.thumbnails || [];
        const thumb = thumbs.length ? upgradeThumbnail(thumbs[thumbs.length - 1].url) : null;
        if (vId && title && !seen.has(vId) && isRealSong(title, durationSeconds)) {
          seen.add(vId);
          tracks.push({
            id: vId,
            videoId: vId,
            title,
            artist,
            thumbnailUrl: thumb,
            durationSeconds
          });
        }
      }
      if (typeof node === 'object') {
        for (const k of Object.keys(node)) walk(node[k]);
      }
    }
    walk(data);
    return NextResponse.json({ tracks: tracks.slice(0, 50) });
  } catch (err: any) {
    console.error("Radio error:", err);
    return NextResponse.json({ error: err.message, tracks: [] }, { status: 500 });
  }
}