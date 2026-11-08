import {defaults, prefs, savePrefs} from './preferences.js';

export function bindBackgroundMusic(toggle, musicName) {
  const track = new Audio();
  track.preload = 'none';
  track.src = new URL(`../music/${musicName}.m4a`, import.meta.url).href;
  track.loop = true;
  track.volume = 0.55;
  let interacted = false;
  toggle.checked = prefs.music;

  function sync() {
    if (!prefs.music || document.hidden) {
      track.pause();
    } else if (interacted && track.paused) {
      // Some browsers require another gesture after an interrupted play request.
      track.play().catch(() => {});
    }
  }

  function onGesture() {
    interacted = true;
    if (track.paused) sync();
  }

  window.addEventListener('click', onGesture, true);
  window.addEventListener('pointerup', onGesture, true);
  window.addEventListener('keydown', onGesture, true);
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('pagehide', () => track.pause());
  window.addEventListener('pageshow', sync);
  toggle.onchange = () => {
    prefs.music = toggle.checked;
    sync();
    savePrefs();
  };
  sync();
  return () => {
    prefs.music = defaults.music;
    toggle.checked = prefs.music;
    sync();
  };
}
