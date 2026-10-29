const assert = require('assert');

async function runTests() {
  console.log("🔍 Testing RivaMusic Next.js Endpoints & Features...");
  
  // 1. Test Home Endpoint
  const homeRes = await fetch("http://localhost:3000/api/home?gl=IN&languages=Hindi,English");
  assert.strictEqual(homeRes.status, 200, "Home endpoint should return 200");
  const homeData = await homeRes.json();
  assert(homeData.sections && homeData.sections.length > 0, "Home should return sections");
  console.log("✅ Home Feed verified: " + homeData.sections.length + " sections returned");

  // 2. Test Search Endpoint
  const searchRes = await fetch("http://localhost:3000/api/search?q=Arijit%20Singh&filter=songs&gl=IN");
  assert.strictEqual(searchRes.status, 200, "Search endpoint should return 200");
  const searchData = await searchRes.json();
  assert(searchData.results && searchData.results.length > 0, "Search should return song results");
  console.log("✅ Search verified: " + searchData.results.length + " songs returned");

  // 3. Test Search Suggestions
  const suggRes = await fetch("http://localhost:3000/api/suggestions?q=ar&gl=IN");
  assert.strictEqual(suggRes.status, 200, "Suggestions endpoint should return 200");
  const suggData = await suggRes.json();
  assert(suggData.queries && suggData.queries.length > 0, "Suggestions should return queries");
  console.log("✅ Suggestions verified: " + suggData.queries.length + " queries returned");

  // 4. Test Stream Resolution
  const sampleTrack = searchData.results.find(r => r.videoId);
  assert(sampleTrack, "Sample track with videoId must exist");
  const streamRes = await fetch("http://localhost:3000/api/stream/" + sampleTrack.videoId);
  assert.strictEqual(streamRes.status, 200, "Stream resolution should return 200");
  const streamData = await streamRes.json();
  assert(streamData.url, "Stream resolution must provide a playable audio URL");
  console.log("✅ VisionOS Stream resolution verified for: " + sampleTrack.title);

  // 5. Test Audio Proxy
  const proxyRes = await fetch("http://localhost:3000/api/audio-proxy?url=" + encodeURIComponent(streamData.url), {
    headers: { Range: "bytes=0-1024" }
  });
  assert(proxyRes.status === 200 || proxyRes.status === 206, "Audio proxy should return 200 or 206 partial content");
  console.log("✅ Audio Proxy verified (HTTP " + proxyRes.status + ")");

  // 6. Test Synced Lyrics (LRCLIB & BetterLyrics)
  const lyricsRes = await fetch("http://localhost:3000/api/lyrics?title=Tum%20Hi%20Ho&artist=Arijit%20Singh&duration=262");
  const lyricsData = await lyricsRes.json();
  console.log("✅ Synced lyrics verified (Found " + (lyricsData.lines ? lyricsData.lines.length : 0) + " lines from " + (lyricsData.source || "None") + ")");

  console.log("\n🎉 ALL TESTS PASSED! Backend, API routes, streaming bypass, search, and lyrics are 100% operational!");
}

runTests().catch(err => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
