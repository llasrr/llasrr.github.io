// fetch-playlists.js
//
// Run this LOCALLY (not on GitHub Pages) to build data/songs.json.
// It never gets committed with your API key in it — the key is only
// used here, on your machine, to generate a plain JSON file.
//
// Requires Node 18+ (uses the built-in fetch).
//
// Usage:
//   YT_API_KEY=xxxx YT_CHANNEL_ID=UCxxxxxxxx node fetch-playlists.js

import fs from 'fs';

const API_KEY = process.env.YT_API_KEY;
const CHANNEL_ID = process.env.YT_CHANNEL_ID;

if (!API_KEY || !CHANNEL_ID) {
  console.error('Missing env vars. Usage:');
  console.error('  YT_API_KEY=xxx YT_CHANNEL_ID=xxx node fetch-playlists.js');
  process.exit(1);
}

const BASE = 'https://www.googleapis.com/youtube/v3';

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

async function getAllPlaylists(channelId) {
  const playlists = [];
  let pageToken = '';
  do {
    const url = `${BASE}/playlists?part=snippet&channelId=${channelId}&maxResults=50&key=${API_KEY}` +
      (pageToken ? `&pageToken=${pageToken}` : '');
    const data = await getJSON(url);
    for (const item of data.items) {
      playlists.push({ id: item.id, title: item.snippet.title });
    }
    pageToken = data.nextPageToken;
  } while (pageToken);
  return playlists;
}

async function getPlaylistVideos(playlistId) {
  const videos = [];
  let pageToken = '';
  do {
    const url = `${BASE}/playlistItems?part=snippet&playlistId=${playlistId}&maxResults=50&key=${API_KEY}` +
      (pageToken ? `&pageToken=${pageToken}` : '');
    const data = await getJSON(url);
    for (const item of data.items) {
      const title = item.snippet?.title;
      if (!title || title === 'Deleted video' || title === 'Private video') continue;
      const videoId = item.snippet?.resourceId?.videoId;
      if (!videoId) continue;
      videos.push({ id: videoId, title });
    }
    pageToken = data.nextPageToken;
  } while (pageToken);
  return videos;
}

async function main() {
  console.log('Fetching playlists for channel', CHANNEL_ID, '...');
  const playlists = await getAllPlaylists(CHANNEL_ID);
  console.log(`Found ${playlists.length} playlists.\n`);

  const songs = [];
  for (const [i, pl] of playlists.entries()) {
    process.stdout.write(`(${i + 1}/${playlists.length}) ${pl.title} ... `);
    try {
      const videos = await getPlaylistVideos(pl.id);
      console.log(`${videos.length} songs`);
      for (const v of videos) {
        songs.push({ id: v.id, title: v.title, playlist: pl.title });
      }
    } catch (e) {
      console.log(`FAILED (${e.message})`);
    }
  }

  fs.mkdirSync('data', { recursive: true });
  fs.writeFileSync('data/songs.json', JSON.stringify(songs));
  console.log(`\nDone. Wrote ${songs.length} songs total to data/songs.json`);
  console.log('Commit and push data/songs.json to update your site.');
}

main().catch(e => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});
