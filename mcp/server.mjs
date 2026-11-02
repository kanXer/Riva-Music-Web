#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const baseUrl = (process.env.RIVA_MUSIC_URL || 'http://localhost:3000').replace(/\/$/, '');
const server = new McpServer({ name: 'riva-music', version: '1.0.0' });

async function api(path, params = {}) {
  const url = new URL(`${baseUrl}/api/${path}`);
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Riva Music API returned ${response.status}`);
  return data;
}

function expose(name, description, schema, handler) {
  server.tool(name, description, schema, async (args) => {
    try {
      const data = await handler(args);
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }] };
    }
  });
}

expose('search_music', 'Search Riva Music for songs, albums, artists, or playlists.', {
  query: z.string().min(1), filter: z.enum(['songs','videos','albums','artists','playlists']).optional(), country: z.string().optional()
}, ({ query, filter, country }) => api('search', { q: query, filter, gl: country }));
expose('get_suggestions', 'Get search suggestions for a partial music query.', { query: z.string().min(1), country: z.string().optional() }, ({ query, country }) => api('suggestions', { q: query, gl: country }));
expose('get_home_feed', 'Get trending and language based music sections.', { languages: z.string().optional(), country: z.string().optional() }, ({ languages, country }) => api('home', { languages, gl: country }));
expose('get_lyrics', 'Find lyrics for a track using its title, artist, and optional duration.', {
  title: z.string().min(1), artist: z.string().optional(), duration_seconds: z.number().optional()
}, ({ title, artist, duration_seconds }) => api('lyrics', { title, artist, duration: duration_seconds }));
expose('get_playlist', 'Get tracks and title for a YouTube Music or YouTube playlist URL or ID.', { playlist_id_or_url: z.string().min(1) }, ({ playlist_id_or_url }) => api('playlist', { id: playlist_id_or_url }));
expose('get_collection', 'Get tracks from a YouTube Music collection or browse ID.', { browse_id: z.string().min(1), title: z.string().optional() }, ({ browse_id, title }) => api('collection', { browseId: browse_id, title }));
expose('get_radio', 'Get recommended tracks based on a YouTube video ID.', { video_id: z.string().min(1), country: z.string().optional() }, ({ video_id, country }) => api(`radio/${encodeURIComponent(video_id)}`, { gl: country }));

const transport = new StdioServerTransport();
await server.connect(transport);
