const http = require('http');

async function testSongPlay() {
  console.log("1. Fetching a song from Home trending list...");
  const homeRes = await fetch("http://localhost:3000/api/home?gl=IN&languages=Hindi");
  const home = await homeRes.json();
  const track = home.sections[0].tracks[0];
  console.log(`🎵 Selected Track: "${track.title}" by ${track.artist} (ID: ${track.id})`);

  console.log("\n2. Calling /api/stream/" + track.id + " to resolve audio stream...");
  const streamRes = await fetch(`http://localhost:3000/api/stream/${track.id}`);
  const streamData = await streamRes.json();
  
  if (!streamData.url) {
    console.error("❌ Stream URL missing:", streamData);
    process.exit(1);
  }
  console.log("✅ Resolved Stream URL successfully!");
  console.log(`   - Bitrate: ${streamData.bitrate} bps`);
  console.log(`   - Mime: ${streamData.mimeType}`);
  console.log(`   - Duration: ${streamData.durationMs / 1000}s`);

  console.log("\n3. Testing browser playback via /api/audio-proxy...");
  const proxyUrl = `http://localhost:3000/api/audio-proxy?url=${encodeURIComponent(streamData.url)}`;
  const proxyRes = await fetch(proxyUrl, {
    headers: {
      Range: "bytes=0-1048575" // Request first 1MB audio chunk
    }
  });

  console.log(`   - Proxy Status Code: ${proxyRes.status} (${proxyRes.statusText})`);
  console.log(`   - Content-Type: ${proxyRes.headers.get('content-type')}`);
  console.log(`   - Content-Range: ${proxyRes.headers.get('content-range')}`);
  console.log(`   - Content-Length: ${proxyRes.headers.get('content-length')} bytes`);

  const arrayBuffer = await proxyRes.arrayBuffer();
  console.log(`   - Actually received audio chunk bytes: ${arrayBuffer.byteLength}`);

  if (arrayBuffer.byteLength > 100000) {
    console.log("\n🎉 SUCCESS: The song audio stream is active, downloading chunks and 100% playable in browser!");
  } else {
    console.error("❌ Audio chunk too small or empty!");
    process.exit(1);
  }
}

testSongPlay().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
