let player;
let songs = [];
let queue = [];
let currentIndex = 0;
let userInitiatedPause = false;
let autoResumeAttempts = 0;
let wakeLock = null;

const els = {
  title: document.getElementById('song-title'),
  playlist: document.getElementById('playlist-name'),
  counter: document.getElementById('counter'),
  nextUp: document.getElementById('next-up'),
  playpause: document.getElementById('playpause'),
  prev: document.getElementById('prev'),
  next: document.getElementById('next'),
  reshuffle: document.getElementById('reshuffle'),
};

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function loadSongs() {
  const res = await fetch('data/songs.json');
  songs = await res.json();
  queue = shuffle(songs);
  currentIndex = 0;
}

// Called automatically by the YouTube IFrame API script once it loads.
window.onYouTubeIframeAPIReady = function () {
  loadSongs().then(() => {
    if (!queue.length) {
      els.title.textContent = 'No songs found in data/songs.json';
      return;
    }
    player = new YT.Player('player', {
      videoId: queue[0].id,
      playerVars: { autoplay: 1, playsinline: 1 },
      events: {
        onReady: updateInfo,
        onStateChange: onPlayerStateChange,
        onError: onPlayerError,
      },
    });
  });
};

function onPlayerStateChange(e) {
  if (e.data === YT.PlayerState.ENDED) {
    autoResumeAttempts = 0;
    playNext();
  }

  if (e.data === YT.PlayerState.PLAYING) {
    els.playpause.textContent = '⏸';
    autoResumeAttempts = 0;
    updateMediaSessionPlaybackState('playing');
    requestWakeLock();
  }

  if (e.data === YT.PlayerState.PAUSED) {
    els.playpause.textContent = '▶';
    updateMediaSessionPlaybackState('paused');
    releaseWakeLock();

    // If the pause wasn't you tapping the button, the OS/browser likely
    // paused it on its own (backgrounding, audio route change, network
    // hiccup). Try to recover automatically, but cap retries so a genuine
    // pause doesn't get fought forever.
    if (!userInitiatedPause && autoResumeAttempts < 3) {
      autoResumeAttempts++;
      setTimeout(() => {
        if (player && player.getPlayerState() === YT.PlayerState.PAUSED) {
          player.playVideo();
        }
      }, 600);
    }
  }
}

// YouTube error codes: 2 = invalid id, 5 = HTML5 player error,
// 100 = video not found/removed, 101/150 = embedding disabled/blocked.
// In every case the fix is the same: skip it and move on.
let skipping = false;
function onPlayerError(e) {
  const song = queue[currentIndex];
  console.warn(`Skipping unplayable video: ${song?.title} (${song?.id}), error ${e.data}`);

  if (skipping) return; // guard against rapid repeated error events
  skipping = true;
  setTimeout(() => { skipping = false; }, 300);

  playNext();
}

function updateInfo() {
  const song = queue[currentIndex];
  const upNext = queue[(currentIndex + 1) % queue.length];

  els.title.textContent = song.title;
  els.playlist.textContent = song.playlist;
  els.counter.textContent = `${currentIndex + 1} / ${queue.length}`;
  els.nextUp.innerHTML = `Next: <span>${escapeHtml(upNext.title)}</span>`;

  updateMediaSessionMetadata(song);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function playIndex(i) {
  currentIndex = (i + queue.length) % queue.length;
  autoResumeAttempts = 0;
  player.loadVideoById(queue[currentIndex].id);
  updateInfo();
}

function playNext() { playIndex(currentIndex + 1); }
function playPrev() { playIndex(currentIndex - 1); }

els.next.addEventListener('click', playNext);
els.prev.addEventListener('click', playPrev);

els.reshuffle.addEventListener('click', () => {
  const current = queue[currentIndex];
  queue = shuffle(songs);
  currentIndex = 0;
  queue[0] = current; // keep the currently playing song in place
  updateInfo();
});

els.playpause.addEventListener('click', () => {
  if (!player) return;
  const state = player.getPlayerState();
  if (state === YT.PlayerState.PLAYING) {
    userInitiatedPause = true;
    player.pauseVideo();
  } else {
    userInitiatedPause = false;
    player.playVideo();
  }
});

// When you come back to the tab/app, check if playback silently stopped
// while backgrounded and try to recover it. Also re-acquire the wake
// lock, since browsers auto-release it whenever the tab is hidden.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (!player) return;

  if (player.getPlayerState() === YT.PlayerState.PLAYING) {
    requestWakeLock();
  } else if (!userInitiatedPause && player.getPlayerState() === YT.PlayerState.PAUSED) {
    player.playVideo();
  }
});

// --- Media Session metadata only (not controls — those don't work
// reliably with an embedded cross-origin player). Setting metadata and
// playback state can still help some mobile browsers treat this as
// legitimate active media and be less aggressive about pausing it. ---

function updateMediaSessionMetadata(song) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: song.title,
    artist: song.playlist,
  });
}

function updateMediaSessionPlaybackState(state) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.playbackState = state;
}

// --- Screen Wake Lock: keeps the screen from dimming/locking while
// a song is actively playing. Browsers release it automatically when
// the tab is hidden or the video pauses, so we re-request it whenever
// playback resumes. ---

async function requestWakeLock() {
  if (!('wakeLock' in navigator) || wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => {
      wakeLock = null;
    });
  } catch (err) {
    console.warn('Wake lock request failed:', err);
  }
}

function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release();
    wakeLock = null;
  }
}