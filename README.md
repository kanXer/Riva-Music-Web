# Riva Music

Riva Music is a Next.js music discovery app. Its API can also be accessed by AI clients through the included stdio MCP server.

## Run the app

```bash
npm install
npm run dev
```

## MCP server

The app and MCP server run together as one Next.js service. Locally, start both with the single command `npm run dev`; the Streamable HTTP MCP endpoint is `http://localhost:3000/api/mcp`. After deploying to Vercel, point your MCP client to `https://YOUR-DEPLOYMENT.vercel.app/api/mcp`—no separate server process is needed. Set `RIVA_MUSIC_URL` only when the internal API base URL differs from the current deployment URL.

Available tools: `search_music`, `get_suggestions`, `get_home_feed`, `get_lyrics`, `get_playlist`, `get_collection`, and `get_radio`. The `npm run mcp` stdio launcher is also available for clients that run MCP servers as local processes.
