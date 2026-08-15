let player;
let songs = [];
let queue = [];
let currentIndex = 0;

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
  if (e.data === YT.PlayerState.ENDED) playNext();
  if (e.data === YT.PlayerState.PLAYING) els.playpause.textContent = '⏸';
  if (e.data === YT.PlayerState.PAUSED) els.playpause.textContent = '▶';
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
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function playIndex(i) {
  currentIndex = (i + queue.length) % queue.length;
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
  if (state === YT.PlayerState.PLAYING) player.pauseVideo();
  else player.playVideo();
});
