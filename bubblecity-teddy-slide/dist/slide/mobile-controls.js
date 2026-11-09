// A stick belongs to its starting side until that finger lifts, even across the midpoint.
export function createMobileControls(canvas, actions, enabled) {
  const coarse = matchMedia('(any-pointer: coarse)');
  const hud = document.createElement('div');
  hud.className = 'mobile-controls';
  hud.hidden = true;
  const buttons = document.createElement('div');
  buttons.className = 'mobile-actions';
  hud.append(buttons);
  for (const [key, label] of actions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.key = key;
    button.textContent = label;
    button.hidden = key === 'KeyE';
    buttons.append(button);
  }
  function makeStick(label) {
    const base = document.createElement('div');
    base.className = 'floating-stick';
    base.dataset.stick = label;
    base.hidden = true;
    base.append(document.createElement('i'));
    hud.append(base);
    return {base, id: null, x: 0, y: 0, left: 0, top: 0};
  }
  const move = makeStick('move'), look = makeStick('look');
  document.body.append(hud);
  const style = document.createElement('link');
  style.rel = 'stylesheet';
  style.href = new URL('./mobile-controls.css', import.meta.url).href;
  document.head.append(style);
  function release(stick) {
    const id = stick.id;
    stick.id = null;
    stick.x = stick.y = 0;
    stick.base.hidden = true;
    if (id !== null && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  }
  function clear() {
    release(move);
    release(look);
  }
  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch' || !enabled()) return;
    const stick = e.clientX < innerWidth / 2 ? move : look;
    if (stick.id !== null) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    stick.id = e.pointerId;
    stick.left = e.clientX;
    stick.top = e.clientY;
    stick.base.style.left = e.clientX + 'px';
    stick.base.style.top = e.clientY + 'px';
    stick.base.firstChild.style.transform = '';
    stick.base.hidden = false;
  });
  canvas.addEventListener('pointermove', e => {
    const stick = move.id === e.pointerId ? move : look.id === e.pointerId ? look : null;
    if (!stick) return;
    const radius = stick.base.offsetWidth * .42;
    if (!radius) return;
    const dx = e.clientX - stick.left, dy = e.clientY - stick.top;
    const distance = Math.hypot(dx, dy);
    const scale = 1 / Math.max(radius, distance);
    stick.x = distance < 4 ? 0 : dx * scale;
    stick.y = distance < 4 ? 0 : dy * scale;
    stick.base.firstChild.style.transform = 'translate(' + stick.x * radius + 'px,' + stick.y * radius + 'px)';
  });
  function end(e) {
    for (const stick of [move, look]) if (stick.id === e.pointerId) release(stick);
  }
  for (const name of ['pointerup','pointercancel','lostpointercapture']) canvas.addEventListener(name, end);
  window.addEventListener('blur', clear);
  window.addEventListener('resize', clear);
  document.addEventListener('visibilitychange', clear);
  let yaw = 0, pitch = 0;
  return {
    move, buttons, clear,
    get yaw() { return yaw; }, get pitch() { return pitch; },
    update(dt) {
      const active = coarse.matches && enabled() && !document.hidden;
      hud.hidden = !active;
      if (!active) { clear(); yaw = pitch = 0; return; }
      yaw -= look.x * 2.7 * dt;
      pitch = Math.max(-.32, Math.min(.72, pitch + look.y * 1.5 * dt));
    }
  };
}
