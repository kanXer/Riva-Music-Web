import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const baseUrl = (process.env.RIVA_MUSIC_URL || new URL(request.url).origin).replace(/\/$/, '');
  const playerResourceUri = 'ui://riva-music/player/v2.html';
  const api = async (path: string, params: Record<string, string | number | undefined> = {}) => {
    const url = new URL(`${baseUrl}/api/${path}`);
    for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Riva Music API returned ${response.status}`);
    return data;
  };

  const server = new McpServer({ name: 'riva-music', version: '1.0.0' });
  const escapedBaseUrl = JSON.stringify(baseUrl).replace(/</g, '\\u003c');
  const playerWidget = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="dark"><title>Riva Music Player</title>
<style>
  *{box-sizing:border-box}html{min-width:0}body{margin:0;min-width:0;padding:clamp(8px,2.8vw,16px);background:#10120f;color:#f4f5f2;font:14px/1.45 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
  .player{width:100%;max-width:760px;margin:0 auto;border:1px solid #30342b;border-radius:18px;padding:clamp(12px,3.2vw,18px);background:linear-gradient(135deg,#1b2116,#141612);overflow:hidden}
  .eyebrow{color:#b7ed5e;font-size:11px;font-weight:750;letter-spacing:.12em;text-transform:uppercase}
  .heading{display:flex;align-items:baseline;justify-content:space-between;gap:8px;flex-wrap:wrap}h2{font-size:clamp(17px,4vw,20px);line-height:1.25;margin:4px 0 14px}.count{color:#a7ab9f;font-size:12px}
  .now{font-size:15px;font-weight:700;overflow-wrap:anywhere}.artist{color:#b2b5ac;margin-top:3px;overflow-wrap:anywhere}
  audio{display:block;width:100%;max-width:100%;min-width:0;height:42px;margin-top:14px;accent-color:#b7ed5e}.list{display:grid;gap:8px;margin-top:14px;max-height:min(42vh,360px);overflow-y:auto;overscroll-behavior:contain;padding:1px}
  .track{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:10px;min-width:0;padding:10px 11px;border:1px solid #30342b;border-radius:12px;background:#171a15}
  .meta{min-width:0}.title{font-weight:650;overflow-wrap:anywhere;word-break:break-word}.sub{color:#b0b4aa;font-size:12px;margin-top:3px;overflow-wrap:anywhere;word-break:break-word}
  button{min-height:44px;min-width:72px;display:inline-flex;align-items:center;justify-content:center;gap:6px;border:0;border-radius:999px;background:#b7ed5e;color:#18200e;font:700 13px system-ui,-apple-system,sans-serif;padding:9px 13px;cursor:pointer;touch-action:manipulation}
  button:hover{background:#c9f77a}button:focus-visible{outline:3px solid #f4f5f2;outline-offset:2px}.play{flex:none}
  .status{min-height:20px;margin-top:8px;color:#c9f77a;font-size:13px;overflow-wrap:anywhere}.empty{padding:10px 2px;color:#b0b4aa}
  @media(max-width:420px){.player{border-radius:14px}.track{gap:8px;padding:9px}.play{min-width:64px;padding-inline:10px}.list{max-height:38vh}}
  @media(prefers-reduced-motion:no-preference){button{transition:background-color .15s ease,transform .15s ease}button:active{transform:scale(.97)}}
</style></head>
<body><main class="player" aria-label="Riva Music player"><div class="eyebrow">Riva Music</div><div class="heading"><h2>Listen in ChatGPT</h2><span id="count" class="count"></span></div><div id="current" class="now">Choose a track</div><div id="artist" class="artist">Audio plays here in the chat.</div><audio id="audio" controls preload="none" aria-label="Audio playback controls"></audio><div id="status" class="status" aria-live="polite"></div><div id="tracks" class="list" aria-label="Playable tracks"></div></main>
<script>
(() => {
  const base=${escapedBaseUrl};
  const root=document.getElementById('tracks'), audio=document.getElementById('audio');
  const status=document.getElementById('status'); let tracks=[];
  const output=window.openai&&window.openai.toolOutput;
  tracks=output&&(output.tracks||output.results)||[];
  if(!tracks.length){const empty=document.createElement('div');empty.className='empty';empty.textContent='No playable tracks were returned. Ask Riva Music to search for a song.';root.append(empty);return}
  document.getElementById('count').textContent=tracks.length+' tracks';
  const play=async (track) => {
    const id=track.videoId||track.id;
    document.getElementById('current').textContent=track.title||'Playing';
    document.getElementById('artist').textContent=track.artist||'Riva Music';
    status.textContent='Preparing audio…';
    try {
      const params=new URLSearchParams({title:track.title||'',artist:track.artist||''});
      const response=await fetch(base+'/api/stream/'+encodeURIComponent(id)+'?'+params);
      const stream=await response.json();
      if(!response.ok||!stream.url) throw new Error(stream.error||'Could not resolve this track');
      const proxy=new URL(base+'/api/audio-proxy'); proxy.searchParams.set('url',stream.url);
      if(stream.userAgent) proxy.searchParams.set('ua',stream.userAgent);
      audio.src=proxy.toString(); await audio.play(); status.textContent='';
    } catch(error) { status.textContent=error instanceof Error?error.message:'Playback failed'; }
  };
  tracks.slice(0,20).forEach(track=>{
    const row=document.createElement('div'); row.className='track';
    const meta=document.createElement('div'); meta.className='meta';
    const title=document.createElement('div'); title.className='title'; title.textContent=track.title||'Untitled track';
    const artist=document.createElement('div'); artist.className='sub'; artist.textContent=track.artist||'YouTube Music'; meta.append(title,artist);
    const button=document.createElement('button'); button.className='play'; button.type='button'; button.textContent='▶ Play'; button.setAttribute('aria-label','Play '+(track.title||'track'));
    button.addEventListener('click',()=>play(track)); row.append(meta,button); root.append(row);
  });
})();
</script></body></html>`;

  server.registerResource('riva-music-player', playerResourceUri, {}, async () => ({
    contents: [{
      uri: playerResourceUri,
      mimeType: 'text/html;profile=mcp-app',
      text: playerWidget,
      _meta: { ui: { prefersBorder: true, domain: baseUrl, csp: { connectDomains: [baseUrl], resourceDomains: [baseUrl] } } }
    }]
  }));
  // MCP tool schemas provide the concrete argument types for each handler.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const register = (name: string, description: string, schema: Record<string, z.ZodType>, handler: (args: any) => Promise<unknown>) => {
    server.tool(name, description, schema, async (args) => {
      try { return { content: [{ type: 'text', text: JSON.stringify(await handler(args)) }] }; }
      catch (error) { return { isError: true, content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }] }; }
    });
  };

  register('search_music', 'Search Riva Music for songs, albums, artists, or playlists.', { query: z.string().min(1), filter: z.enum(['songs','videos','albums','artists','playlists']).optional(), country: z.string().optional() }, ({ query, filter, country }) => api('search', { q: query, filter, gl: country }));
  register('get_suggestions', 'Get suggestions for a partial music query.', { query: z.string().min(1), country: z.string().optional() }, ({ query, country }) => api('suggestions', { q: query, gl: country }));
  register('get_home_feed', 'Get trending and language based music sections.', { languages: z.string().optional(), country: z.string().optional() }, ({ languages, country }) => api('home', { languages, gl: country }));
  register('get_lyrics', 'Get lyrics using track title, artist, and optional duration.', { title: z.string().min(1), artist: z.string().optional(), duration_seconds: z.number().optional(), video_id: z.string().optional() }, ({ title, artist, duration_seconds, video_id }) => api('lyrics', { title, artist, duration: duration_seconds, videoId: video_id }));
  register('get_playlist', 'Get tracks from a YouTube playlist URL or ID.', { playlist_id_or_url: z.string().min(1) }, ({ playlist_id_or_url }) => api('playlist', { id: playlist_id_or_url }));
  register('get_collection', 'Get tracks from a YouTube Music collection or browse ID.', { browse_id: z.string().min(1), title: z.string().optional() }, ({ browse_id, title }) => api('collection', { browseId: browse_id, title }));
  register('get_radio', 'Get recommended tracks based on a YouTube video ID.', { video_id: z.string().min(1), country: z.string().optional() }, ({ video_id, country }) => api(`radio/${encodeURIComponent(video_id)}`, { gl: country }));

  server.registerTool('play_music', {
    title: 'Play music in ChatGPT',
    description: 'Search for music and show playable tracks with an embedded player in ChatGPT. Use this when the user asks to play or listen to music. The user starts playback by pressing Play in the widget.',
    inputSchema: { query: z.string().min(1), country: z.string().optional() },
    _meta: { ui: { resourceUri: playerResourceUri }, 'openai/outputTemplate': playerResourceUri }
  }, async ({ query, country }) => {
    try {
      const data = await api('search', { q: query, filter: 'songs', gl: country });
      const tracks = (data.results || []).filter((track: { videoId?: string; id?: string }) => track.videoId || track.id).slice(0, 20);
      return {
        structuredContent: { tracks },
        content: [{ type: 'text', text: tracks.length ? `Found ${tracks.length} playable tracks for “${query}”. Use the embedded player to start playback.` : `No playable tracks found for “${query}”.` }]
      };
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }] };
    }
  });

  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(request);
}

export function GET() {
  return Response.json({ name: 'riva-music', transport: 'Streamable HTTP', endpoint: '/api/mcp' });
}

export function DELETE() {
  return new Response('Stateless MCP sessions do not need deletion.', { status: 405 });
}
