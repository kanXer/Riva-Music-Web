import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const baseUrl = (process.env.RIVA_MUSIC_URL || new URL(request.url).origin).replace(/\/$/, '');
  const api = async (path: string, params: Record<string, string | number | undefined> = {}) => {
    const url = new URL(`${baseUrl}/api/${path}`);
    for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Riva Music API returned ${response.status}`);
    return data;
  };

  const server = new McpServer({ name: 'riva-music', version: '1.0.0' });
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
