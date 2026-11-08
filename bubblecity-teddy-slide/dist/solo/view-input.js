// Remove drift radially so a diagonal has the same maximum speed as an axis.
function stick(axes, index) {
  const x = axes[index] || 0, y = axes[index + 1] || 0;
  const length = Math.hypot(x, y);
  if (length <= .16) return [0, 0];
  const scale = (Math.min(1, length) - .16) / (.84 * length);
  return [x * scale, y * scale];
}

export function createViewInput(canvas, hint) {
  let yaw = 0, pitch = 0, wantsLock = false;
  const locked = () => document.pointerLockElement === canvas;
  function turn(horizontal, vertical) {
    yaw = (yaw - horizontal) % (2 * Math.PI);
    pitch = Math.max(-.36, Math.min(.85, pitch + vertical));
  }
  function unlock() {
    wantsLock = false;
    if (locked()) document.exitPointerLock();
  }
  document.addEventListener('pointerlockchange', () => {
    if (!locked()) wantsLock = false;
    else if (!wantsLock) unlock();
    hint.textContent = locked() ? 'Option / Alt 释放鼠标' : '点击场景控制视角';
  });
  document.addEventListener('mousemove', event => {
    if (locked()) turn(event.movementX * .0024, event.movementY * .0024);
  });
  window.addEventListener('keydown', event => {
    if (event.key === 'Alt' && (locked() || wantsLock)) {
      event.preventDefault();
      unlock();
    }
  });
  return {
    get yaw() { return yaw; },
    get pitch() { return pitch; },
    reset() { yaw = pitch = 0; unlock(); },
    unlock,
    capture(event) {
      if (event.pointerType && event.pointerType !== 'mouse') return;
      if (!canvas.requestPointerLock || locked()) return;
      wantsLock = true;
      canvas.requestPointerLock()?.catch(() => { wantsLock = false; });
    },
    readPad(dt) {
      let pads;
      try { pads = navigator.getGamepads?.(); } catch { return null; }
      for (const pad of pads || []) {
        if (!pad?.connected || pad.mapping !== 'standard') continue;
        const [x, y] = stick(pad.axes, 0);
        const [rx, ry] = stick(pad.axes, 2);
        const pressed = i => pad.buttons[i]?.pressed;
        if (!(x || y || rx || ry || pressed(0) || pressed(2) || pressed(3))) continue;
        turn(rx * 2.8 * dt, ry * 1.7 * dt);
        return {x, y, jump: pressed(0), skill: pressed(2), reset: pressed(3)};
      }
      return null;
    }
  };
}
