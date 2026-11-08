// Injected into every capture page before its own scripts (Playwright addInitScript).
// 1. Virtual time: once __vt.enter() is called, performance.now / Date.now / requestAnimationFrame stop
//    following the wall clock and only move when __vt.tick(ms) is called, so every frame is rendered with
//    an exact time step however slow the machine is.
// 2. Helpers for the 小熊滑滑梯 capture build (promo/.build/teddy): path lookups, cameras, worker control.
// 3. A title overlay drawn into the page so it is part of each screenshot.
(() => {
  const realNow = performance.now.bind(performance), realDate = Date.now;
  const realRAF = window.requestAnimationFrame.bind(window), realCAF = window.cancelAnimationFrame.bind(window);
  let manual = false, vnow = 0, dateBase = 0, nextId = 1;
  const queue = new Map();
  performance.now = () => manual ? vnow : realNow();
  Date.now = () => manual ? dateBase + vnow : realDate();
  window.requestAnimationFrame = cb => {
    if (manual) { const id = -(nextId++); queue.set(id, cb); return id; }
    // A frame requested before enter() but delivered after it joins the virtual queue.
    return realRAF(ts => { if (manual) queue.set(-(nextId++), cb); else cb(ts); });
  };
  window.cancelAnimationFrame = id => { if (id < 0) queue.delete(id); else realCAF(id); };
  window.__vt = {
    // Resolves after two real frames, by which time every pending callback sits in the virtual queue.
    enter() {
      if (manual) return Promise.resolve();
      vnow = realNow(); dateBase = realDate() - vnow; manual = true;
      return new Promise(res => realRAF(() => realRAF(res)));
    },
    tick(ms) {
      vnow += ms;
      const list = [...queue.values()]; queue.clear();
      for (const cb of list) { try { cb(vnow); } catch (e) { console.error(e); } }
      return vnow;
    },
    get manual() { return manual; },
  };

  // ---------------------------------------------------------------- 小熊滑滑梯 helpers
  const W = window;
  W.PT = s => { // centre-line point of the current stage at arc length s
    const P = W.__cap.course.stage.path; let i = 0;
    while (i < P.n - 1 && P.s[i + 1] < s) i++;
    return {i, x: P.x[i], y: P.y[i], z: P.z[i], tx: P.tx[i], tz: P.tz[i], hw: P.hw[i]};
  };
  W.L = m => { W.__cap.link.postMessage(m); return 1; };
  // Runner rows: [id,x,y,z,vx,vy,vz,tp,flags,sample,s,nx,ny,nz,r]
  W.ROWS = () => W.__cap.state.runners;
  W.RUN = id => { const r = W.__cap.state.runners.find(x => x[0] === id); return r && {id, x: r[1], y: r[2], z: r[3], vx: r[4], vy: r[5], vz: r[6], flags: r[8], s: r[10]}; };
  W.PROGRESS = (which = 'lead') => {
    const v = W.__cap.state.runners.map(r => r[10]).filter(x => x >= 0).sort((a, b) => b - a);
    if (!v.length) return -1;
    return which === 'lead' ? v[0] : which === 'last' ? v[v.length - 1] : v[v.length >> 1];
  };
  W.BY_CHAR = ch => { const e = (W.__cap.roster || []).find(p => p.character === ch); return e ? e.id : null; };
  W.WEVAL = async code => {
    W.__evalr = undefined; W.L({type: 'eval', code});
    for (let i = 0; i < 200 && W.__evalr === undefined; i++) await new Promise(r => setTimeout(r, 25));
    return W.__evalr;
  };
  W.CLEAN = (on = true) => {
    let st = document.getElementById('promo-clean');
    if (!st) { st = document.createElement('style'); st.id = 'promo-clean'; document.head.append(st); }
    // Hides the game HUD; runner name tags stay visible.
    st.textContent = on ? 'body>*:not(main):not(#promo-title){visibility:hidden!important}' : '';
    return on;
  };
  W.TITLE = (text, alpha = 1, sub = '') => {
    let el = document.getElementById('promo-title');
    if (!el) {
      el = document.createElement('div'); el.id = 'promo-title';
      el.style.cssText = 'position:fixed;left:50%;bottom:9vh;transform:translateX(-50%);z-index:99999;pointer-events:none;' +
        'background:rgba(255,249,236,.94);color:#1f4a3c;border-radius:2.2vh;padding:1.6vh 3.6vh;text-align:center;' +
        'box-shadow:0 1vh 4vh rgba(60,40,20,.18);font-family:"PingFang SC","Noto Sans CJK SC","Microsoft YaHei",sans-serif;visibility:visible!important';
      document.body.append(el);
    }
    if (!text) { el.style.display = 'none'; return 0; }
    el.style.display = 'block'; el.style.opacity = String(alpha);
    el.innerHTML = `<div style="font-size:4.6vh;font-weight:800;letter-spacing:.06em">${text}</div>` +
      (sub ? `<div style="font-size:2.2vh;font-weight:600;opacity:.7;margin-top:.4vh;letter-spacing:.08em">${sub}</div>` : '');
    return 1;
  };
})();
