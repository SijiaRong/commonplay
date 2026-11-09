// Each part reports completed work (bytes for models, completed images for textures).
// No timer advances this bar. 100% is reserved for a usable first frame.
(() => {
  const weights = {engine: 12, character: 38, background: 10, materials: 12, runway: 10, course: 13, frame: 5};
  const parts = Object.fromEntries(Object.keys(weights).map(key => [key, 0]));
  const bar = document.querySelector('#loading-progress');
  const output = document.querySelector('#loading-percent');
  let resolveReady, last = 0;
  const ready = new Promise(resolve => { resolveReady = resolve; });
  const loading = {
    ready, done: false,
    set(part, fraction) {
      if (loading.done || !(part in parts) || !Number.isFinite(fraction)) return;
      parts[part] = Math.max(parts[part], Math.min(1, Math.max(0, fraction)));
      const value = Math.max(last, Math.min(99, Math.floor(Object.entries(weights).reduce((sum, [key, weight]) => sum + weight * parts[key], 0))));
      last = value;
      if (bar) { bar.max = 100; bar.value = value; }
      if (output) output.value = value + '%';
    },
    finish() {
      loading.done = true;
      if (bar) { bar.max = 100; bar.value = 100; }
      if (output) output.value = '100%';
      resolveReady();
    }
  };
  globalThis.gameLoading = loading;
})();
