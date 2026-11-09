const storageKey = 'commonplay-lens-v1';
const defaults = {enabled: true, distance: 18, transition: 24, strength: 80, tilt: 45};
const sliders = [
  ['distance', '近景清晰距离', 0, 100, ' 场景单位'],
  ['transition', '虚化过渡距离', 1, 100, ' 场景单位'],
  ['strength', '景深强度', 0, 200, '%'],
  ['tilt', '上下边缘虚化', 0, 150, '%']
];

export function bindLensSettings(container, film) {
  const lens = {...defaults};
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (typeof saved?.enabled === 'boolean') lens.enabled = saved.enabled;
    for (const [key, , min, max] of sliders) {
      if (Number.isFinite(saved?.[key])) lens[key] = Math.min(max, Math.max(min, Math.round(saved[key])));
    }
  } catch {}
  film.lens = lens;
  container.innerHTML = `<fieldset><legend>画面虚化</legend>
    <label>启用虚化<input type="checkbox" data-enabled></label>
    <p>从镜头算起，清晰距离内的角色和赛道保持清晰，超过后逐渐虚化。</p>
    ${sliders.map(([key, label, min, max]) => `<label for="lens-${key}">${label}<output for="lens-${key}"></output></label>
      <input id="lens-${key}" type="range" min="${min}" max="${max}">`).join('')}
    <button type="button" data-lens-reset>恢复虚化默认值</button></fieldset>`;
  const toggle = container.querySelector('[data-enabled]');
  const inputs = sliders.map(([key, , , , unit]) => {
    const input = container.querySelector('#lens-' + key);
    const output = container.querySelector('output[for="lens-' + key + '"]');
    input.oninput = () => { lens[key] = input.valueAsNumber; save(); };
    return () => {
      input.value = lens[key];
      input.disabled = !lens.enabled;
      output.value = lens[key] + unit;
    };
  });
  function sync() {
    toggle.checked = lens.enabled;
    inputs.forEach(update => update());
  }
  function save() {
    sync();
    try { localStorage.setItem(storageKey, JSON.stringify(lens)); } catch {}
  }
  const reset = () => { Object.assign(lens, defaults); save(); };
  toggle.onchange = () => { lens.enabled = toggle.checked; save(); };
  container.querySelector('[data-lens-reset]').onclick = reset;
  sync();
  return reset;
}
