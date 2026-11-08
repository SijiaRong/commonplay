#!/usr/bin/env node
// Renders the 小熊滑滑梯 promo frame by frame and encodes it with ffmpeg.
//
//   cd promo/render && npm install && npx playwright install chromium   (once)
//   node render.mjs --preview                 one frame per shot part -> out/preview/index.html (check framing)
//   node render.mjs                           full render, 1920x1080 @ 30 fps -> out/promo.mp4
//   node render.mjs --only 6,20 --fps 60      selected shots, 60 fps
//   node render.mjs --size 3840x2160          4K (renders at 1920x1080 CSS pixels, device scale 2)
//
// Other flags: --headed (show the browser; most reliable way to get GPU rendering on macOS),
// --chrome (use installed Google Chrome), --best (slower, better x264), --png (lossless frames),
// --keep-frames, --out <dir>. See promo/README.md.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {spawn, spawnSync, execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, copyFileSync, readdirSync, statSync} from 'node:fs';
import {join, dirname, extname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildCapture, repo} from '../tools/build-capture.mjs';
import {shots, SEED, BOTS} from './shots.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const helpers = readFileSync(join(repo, 'promo', 'tools', 'page-helpers.js'), 'utf8');

// ------------------------------------------------------------------ options
const argv = process.argv.slice(2);
const flag = n => argv.includes('--' + n);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const FPS = Number(opt('fps', 30));
if (60 % FPS) throw new Error('--fps must divide 60 (e.g. 30 or 60)');
const [OUT_W, OUT_H] = opt('size', '1920x1080').split('x').map(Number);
const SCALE = OUT_W / 1920;
const VIEW = {width: 1920, height: Math.round(OUT_H / SCALE)};
const PREVIEW = flag('preview');
const ONLY = opt('only') ? opt('only').split(',').map(Number) : null;
const OUT = resolve(opt('out', join(here, 'out')));
const EXT = flag('png') ? 'png' : 'jpg';
const PRESET = flag('best') ? 'slow' : 'veryfast';
const PORT = Number(opt('port', 8790)), PARTY_PORT = PORT + 1;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ------------------------------------------------------------------ static server
const roots = {
  '/teddy/': buildCapture(),
  '/bubbleport/': join(repo, 'bubbleport-demo', 'dist'),
  '/promo/': join(repo, 'promo'),
};
const types = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
  '.css': 'text/css', '.glb': 'model/gltf-binary', '.jpg': 'image/jpeg', '.png': 'image/png', '.hdr': 'application/octet-stream', '.svg': 'image/svg+xml'};
const server = createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const prefix = Object.keys(roots).find(p => url.startsWith(p));
  if (!prefix) { res.writeHead(404); return res.end(); }
  let file = join(roots[prefix], url.slice(prefix.length));
  if (!file.startsWith(roots[prefix])) { res.writeHead(403); return res.end(); }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, {'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store'});
  res.end(readFileSync(file));
});
await new Promise(r => server.listen(PORT, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${PORT}`;

// ------------------------------------------------------------------ browser
const browser = await chromium.launch({
  headless: !flag('headed'),
  channel: flag('chrome') ? 'chrome' : undefined,
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});

async function newPage({mobile = false} = {}) {
  const context = await browser.newContext(mobile
    ? {viewport: {width: 430, height: 932}, deviceScaleFactor: 3 * SCALE, isMobile: true, hasTouch: true}
    : {viewport: VIEW, deviceScaleFactor: SCALE});
  await context.addInitScript(helpers);
  const page = await context.newPage();
  page.on('pageerror', e => log('  page error:', String(e).slice(0, 300)));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) log('  console:', m.text().slice(0, 200)); });
  return page;
}

// Warn early if Chrome fell back to software rendering (hours instead of minutes).
{
  const page = await newPage();
  await page.goto(BASE + '/promo/render/endcard.html');
  const gpu = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return 'no WebGL2';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  });
  log('WebGL renderer:', gpu);
  if (/swiftshader|llvmpipe|software/i.test(gpu)) log('WARNING: software rendering. Try --headed or --chrome; a full render will be very slow.');
  await page.context().close();
}

// ------------------------------------------------------------------ camera (evaluated inside the page)
// u: 0..1 through the part (eased). Ranges [a,b] interpolate; vectors given as [[..],[..]] interpolate.
function camAt(spec, u, picked) {
  const lerp = (a, b, t) => a + (b - a) * t;
  const val = v => Array.isArray(v) && typeof v[0] === 'number' && v.length === 2 ? lerp(v[0], v[1], u) : v;
  const vec = v => Array.isArray(v[0]) ? v[0].map((x, i) => lerp(x, v[1][i], u)) : v;
  const fov = val(spec.fov ?? 45);
  const pathPoint = (p = {}) => {
    const a = PT(val(p.s ?? 0)), side = val(p.side ?? 0), back = val(p.back ?? 0), up = val(p.up ?? 0);
    const nx = a.tz, nz = -a.tx; // right-hand normal of the path
    return [a.x - a.tx * back + nx * side, a.y + up, a.z - a.tz * back + nz * side];
  };
  const runner = () => {
    const P = picked ?? 0;
    const id = P === 'mid' ? (() => { const rows = ROWS().filter(r => r[10] >= 0).sort((a, b) => b[10] - a[10]); return rows[rows.length >> 1][0]; })() : P;
    return RUN(id) || RUN(0);
  };
  switch (spec.type) {
    case 'game': return null;
    case 'free': return {eye: vec(spec.eye), at: vec(spec.at), fov};
    case 'path': return {eye: pathPoint(spec.eye), at: pathPoint(spec.at), fov};
    case 'orbit': {
      const c = spec.center, r = val(spec.radius), h = val(spec.height), a = val(spec.angle) * Math.PI / 180;
      return {eye: [c[0] + Math.cos(a) * r, c[1] + h, c[2] + Math.sin(a) * r], at: c, fov};
    }
    case 'runner': {
      const R = runner(), t = PT(R.s), d = val(spec.dist ?? 4), up = val(spec.up ?? 2), lift = val(spec.lift ?? 0.6);
      const at = [R.x, R.y + lift, R.z];
      if (spec.mode === 'front') return {eye: [R.x + t.tx * d, R.y + up, R.z + t.tz * d], at, fov, focus: at};
      if (spec.mode === 'above') return {eye: [R.x - t.tx * d, R.y + up, R.z - t.tz * d], at, fov, focus: at};
      return {eye: [R.x - t.tx * d, R.y + up, R.z - t.tz * d], at: [R.x + t.tx * 2, R.y + lift, R.z + t.tz * 2], fov, focus: at};
    }
    case 'runnerfixed': { const R = runner(); const at = [R.x, R.y + 0.5, R.z]; return {eye: spec.eye, at, fov, focus: at}; }
  }
  throw new Error('unknown camera ' + spec.type);
}

// One frame inside the page: run events, advance the simulation, place the camera, draw.
async function pageFrame({ticks, dt, cam, u, picked, title, titleAlpha, clean, events, cams}) {
  for (const e of events || []) {
    if (e.knock) await WEVAL(`(()=>{const b=session.show.players[${e.id}].body;const P=session.show.stage.path;` +
      `b.vx+=${e.knock.side}*${e.nx};b.vz+=${e.knock.side}*${e.nz};b.vy=Math.max(b.vy,${e.knock.vy});return 1})()`);
    if (e.teleport) { const t = e.teleport; await WEVAL(`(()=>{const b=session.show.players[${e.id}].body;b.x+=${t.dx};b.y+=${t.dy};b.z+=${t.dz};b.vx=${t.vx};b.vy=${t.vy};b.vz=${t.vz};return 1})()`); }
  }
  if (ticks > 0) {
    const want = __cap.state.tick + ticks;
    L({type: 'advance', ticks});
    for (let i = 0; i < 400 && __cap.state.tick < want; i++) await new Promise(r => setTimeout(r, 5));
  }
  CLEAN(clean); TITLE(title?.[0], titleAlpha, title?.[1]);
  const views = cams || [cam];
  for (let k = 0; k < views.length; k++) {
    window.__cam = views[k];
    __vt.tick(k === 0 ? dt * 1000 : 0);
  }
  return __cap.state.tick;
}

// ------------------------------------------------------------------ race sessions
const PHASES = ['intro', 'countdown', 'race', 'cut', 'draft', 'podium', 'over'];
async function openRace({mobile = false} = {}) {
  const page = await newPage({mobile});
  await page.goto(`${BASE}/teddy/?seed=${SEED}`);
  await page.waitForFunction(() => window.__cap && __cap.state && !document.querySelector('#go').disabled, null, {timeout: 120000});
  await page.evaluate(n => { [...document.querySelectorAll('button')].find(b => b.textContent.trim() === n + ' 个')?.click(); }, BOTS);
  await page.waitForTimeout(500);
  await page.click('#go');
  await page.evaluate(() => { L({type: 'freeze', value: true}); L({type: 'auto'}); window.__latest = true; __cap.film.autoQuality = false; __cap.film.setResScale(1); });
  await page.evaluate(async () => { for (let i = 0; i < 100 && __cap.state.phase === 'ready'; i++) { L({type: 'advance', ticks: 1}); await new Promise(r => setTimeout(r, 50)); } });
  return page;
}

async function fastForward(page, trig = {}) {
  if (!trig || !Object.keys(trig).length) return;
  await page.evaluate(() => { window.__norender = true; });
  const ok = await page.evaluate(async ({trig, PHASES}) => {
    const met = () => {
      const s = __cap.state;
      if (trig.stage != null && s.stage < trig.stage) return false;
      if (trig.phase && PHASES.indexOf(s.phase) < PHASES.indexOf(trig.phase)) return false;
      if (trig.stage != null && s.stage > trig.stage) return 'passed';
      for (const k of ['lead', 'mid', 'last']) if (trig[k] != null && PROGRESS(k) < trig[k]) return false;
      if (trig.runner) { const r = RUN(window.__picked); if (!r || r.s < trig.runner.s) return false; }
      if (trig.expr && !eval(trig.expr)) return false;
      return true;
    };
    for (let i = 0; i < 6000; i++) {
      if (trig.runner && window.__picked == null && __cap.state.stage === trig.stage && __cap.state.phase === 'race') {
        const p = trig.runner.pick, mine = p.char ? BY_CHAR(p.char) : null;
        window.__picked = mine ?? [...ROWS()].sort((a, b) => Math.abs(a[10] - p.near) - Math.abs(b[10] - p.near))[0][0];
      }
      const m = met();
      if (m === true) return true;
      if (m === 'passed') return 'passed ' + JSON.stringify({stage: __cap.state.stage, phase: __cap.state.phase});
      const near = trig.stage == null || __cap.state.stage === trig.stage;
      const before = __cap.state.tick;
      L({type: 'advance', ticks: near ? 6 : 60});
      for (let j = 0; j < 400 && __cap.state.tick === before; j++) await new Promise(r => setTimeout(r, 5));
    }
    return 'timeout ' + JSON.stringify({stage: __cap.state.stage, phase: __cap.state.phase, lead: PROGRESS('lead')});
  }, {trig, PHASES});
  await page.evaluate(() => { window.__norender = false; });
  if (ok !== true) throw new Error('trigger not reached: ' + JSON.stringify(trig) + ' -> ' + ok);
}

const ease = u => u * u * (3 - 2 * u);
const shotFile = (dir, i) => join(dir, String(i).padStart(5, '0') + '.' + EXT);
async function snap(page, file) {
  await page.screenshot({path: file, type: EXT === 'png' ? 'png' : 'jpeg', ...(EXT === 'png' ? {} : {quality: 94})});
}

// Frames for one race part. Returns number of frames written.
async function renderRacePart(page, part, dir, {split = false} = {}) {
  mkdirSync(dir, {recursive: true});
  if (part.trigger) await fastForward(page, part.trigger);
  if (part.settle) await page.evaluate(n => L({type: 'advance', ticks: n}), Math.round(part.settle * 60));
  await page.evaluate(() => __vt.enter());
  // Who the camera follows.
  const picked = await page.evaluate(p => {
    if (p == null || p === 'me') return 0;
    if (p === 'picked') return window.__picked ?? 0;
    if (p === 'mid') return 'mid';
    return p;
  }, part.cam?.pick);
  const total = Math.max(1, Math.round(part.dur * FPS));
  const frames = PREVIEW ? [Math.floor(total / 2)] : [...Array(total).keys()];
  const speed = part.speed ?? 1, perFrame = (60 / FPS) * speed;
  let acc = 0, written = 0, holdLeft = 0;
  const pendingEvents = (part.events || []).map(e => ({...e}));
  for (let f = 0; f < total; f++) {
    const t = f / FPS;
    if (holdLeft > 0) { holdLeft--; if (written > 0 && (!PREVIEW || frames.includes(f))) { copyFileSync(shotFile(dir, written - 1), shotFile(dir, written)); written++; } continue; }
    acc += part.hold ? 0 : perFrame;
    const ticks = Math.floor(acc); acc -= ticks;
    const events = [];
    for (const e of pendingEvents) {
      if (e.done || t < e.at) continue;
      if (e.hold) { holdLeft = Math.round(e.hold * FPS); e.done = true; continue; }
      const id = await page.evaluate(() => window.__picked ?? 0);
      const nrm = await page.evaluate(id => { const r = RUN(id), a = PT(r.s); return {nx: a.tz, nz: -a.tx}; }, id);
      events.push({...e, id, ...nrm});
      if (!e.for || t >= e.at + e.for) e.done = true;
    }
    const u = ease(f / Math.max(1, total - 1));
    const title = part.title, titleAlpha = title ? Math.min(1, t / 0.35, (part.dur - t) / 0.35) : 0;
    const countdownTitle = part.countdown ? [String(3 - Math.min(2, Math.floor(t))), ''] : null;
    const isTarget = frames.includes(f);
    if (split) {
      const cams = await page.evaluate(() => {
        const rows = ROWS().filter(r => r[10] >= 0);
        const me = RUN(0); const near = rows.filter(r => r[0] !== 0).sort((a, b) => Math.abs(a[10] - me.s) - Math.abs(b[10] - me.s)).slice(0, 3).map(r => r[0]);
        return [0, ...near];
      });
      const camList = await page.evaluate(({ids, camAtSrc}) => { const camAt = eval('(' + camAtSrc + ')'); return ids.map(id => camAt({type: 'runner', mode: 'behind', dist: 4.2, up: 2.2, lift: 0.6, fov: 50}, 0, id)); }, {ids: cams, camAtSrc: camAt.toString()});
      // first view advances time, the other three re-draw the same instant
      for (let k = 0; k < 4; k++) {
        await page.evaluate(pageFrameSrc => window.__pageFrame ??= eval('(' + pageFrameSrc + ')'), pageFrame.toString());
        await page.evaluate(a => window.__pageFrame(a), {ticks: k === 0 ? ticks : 0, dt: k === 0 ? speed / FPS : 0, cam: camList[k], clean: true, title: null, events: k === 0 ? events : []});
        if (isTarget) { mkdirSync(join(dir, 'v' + k), {recursive: true}); await snap(page, shotFile(join(dir, 'v' + k), written)); }
      }
      if (isTarget) written++;
      continue;
    }
    await page.evaluate(({pageFrameSrc, camAtSrc, spec, u, picked, args}) => {
      window.__pageFrame ??= eval('(' + pageFrameSrc + ')');
      const camAt = eval('(' + camAtSrc + ')');
      return window.__pageFrame({...args, cam: camAt(spec, u, picked)});
    }, {pageFrameSrc: pageFrame.toString(), camAtSrc: camAt.toString(), spec: part.cam || {type: 'game'}, u, picked,
      args: {ticks, dt: speed / FPS, clean: !part.hud, title: countdownTitle || title, titleAlpha: countdownTitle ? 1 : titleAlpha, events}});
    if (isTarget) { await snap(page, shotFile(dir, written)); written++; }
  }
  return written;
}

// A transparent PNG with just the title card, overlaid by ffmpeg on composed shots (split screen, phone).
async function titlePng(title, file) {
  const page = await newPage();
  await page.goto(`${BASE}/promo/render/endcard.html?blank=1`);
  await page.evaluate(t => { document.body.innerHTML = ''; document.documentElement.style.background = 'transparent'; document.body.style.background = 'transparent'; TITLE(t[0], 1, t[1]); }, title);
  await page.screenshot({path: file, omitBackground: true});
  await page.context().close();
}

// ------------------------------------------------------------------ other part kinds
async function renderStillFrames(page, part, dir) { // one screenshot, slow zoom added by ffmpeg
  mkdirSync(dir, {recursive: true});
  await snap(page, join(dir, 'still.' + EXT));
  return 'still';
}

let party = null;
async function ensureParty() {
  if (party) return;
  const serverDir = join(repo, 'teddy-playground', 'server');
  if (!existsSync(join(serverDir, 'node_modules', 'ws'))) {
    log('installing party server dependencies');
    execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--silent'], {cwd: serverDir, stdio: 'inherit'});
  }
  party = spawn(process.execPath, [join(serverDir, 'party-server.mjs')], {env: {...process.env, PORT: String(PARTY_PORT)}, stdio: 'ignore'});
  await new Promise(r => setTimeout(r, 1500));
}

async function renderLobby(part, dir) {
  await ensureParty();
  const WebSocket = createRequire(join(repo, 'teddy-playground', 'server', 'package.json'))('ws');
  const page = await newPage();
  await page.goto(`http://localhost:${PARTY_PORT}/`);
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent.trim() === '创建房间'), null, {timeout: 120000});
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '创建房间').click());
  await page.waitForFunction(() => /[A-Z0-9]{4}/.test(document.body.innerText.match(/房间码\s*([A-Z0-9]{4})/)?.[1] || ''), null, {timeout: 30000});
  const code = await page.evaluate(() => document.body.innerText.match(/房间码\s*([A-Z0-9]{4})/)[1]);
  mkdirSync(dir, {recursive: true});
  const total = Math.round(part.dur * FPS), sockets = [];
  const joiners = part.joiners.map(j => ({...j}));
  let written = 0;
  const targets = PREVIEW ? [total - 1] : [...Array(total).keys()];
  for (let f = 0; f < total; f++) {
    for (const j of joiners) if (!j.done && f / FPS >= j.at) {
      j.done = true;
      const ws = new WebSocket(`ws://localhost:${PARTY_PORT}/party`);
      ws.on('open', () => ws.send(JSON.stringify({type: 'join', room: code, name: j.name, character: j.character})));
      ws.on('error', () => {});
      sockets.push(ws);
    }
    await page.waitForTimeout(1000 / FPS); // lobby runs in real time
    if (targets.includes(f)) { await snap(page, shotFile(dir, written)); written++; }
  }
  sockets.forEach(s => s.close());
  await page.context().close();
  return written;
}

async function renderBubbleport(part, dir) {
  const page = await newPage();
  await page.goto(`${BASE}/bubbleport/`);
  await page.waitForSelector('#start', {timeout: 120000});
  await page.waitForTimeout(3000);
  await page.click('[data-course="hammers"]').catch(() => {});
  await page.click('#start').catch(() => {});
  await page.waitForTimeout(1500);
  await page.click('#view');
  await page.waitForTimeout(1500);
  await page.evaluate(() => __vt.enter());
  mkdirSync(dir, {recursive: true});
  const total = Math.round(part.dur * FPS), targets = PREVIEW ? [total >> 1] : [...Array(total).keys()];
  const cx = VIEW.width * 0.6, cy = VIEW.height * 0.45;
  await page.mouse.move(cx, cy); await page.mouse.down();
  let written = 0;
  for (let f = 0; f < total; f++) {
    await page.mouse.move(cx - f * (260 / total), cy);
    await page.evaluate(ms => __vt.tick(ms), 1000 / FPS);
    if (targets.includes(f)) { await snap(page, shotFile(dir, written)); written++; }
  }
  await page.mouse.up();
  await page.context().close();
  return written;
}

// ------------------------------------------------------------------ ffmpeg
const ffmpeg = (args, label) => {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {stdio: 'inherit'});
  if (r.status !== 0) throw new Error('ffmpeg failed: ' + label);
};
const x264 = ['-c:v', 'libx264', '-preset', PRESET, '-crf', '17', '-pix_fmt', 'yuv420p', '-r', String(FPS)];
const BG = '0xfcf2db';

function encodePart(kind, dir, dur, mp4, extra = {}) {
  const frames = Math.round(dur * FPS), size = `${OUT_W}x${OUT_H}`;
  if (kind === 'still') {
    const img = extra.image || join(dir, 'still.' + EXT);
    const [z0, z1] = extra.zoom || [1, 1.06];
    ffmpeg(['-loop', '1', '-i', img, '-vf',
      `scale=${OUT_W * 2}:${OUT_H * 2}:force_original_aspect_ratio=decrease,pad=${OUT_W * 2}:${OUT_H * 2}:(ow-iw)/2:(oh-ih)/2:color=${BG},` +
      `zoompan=z='${z0}+(${z1 - z0})*on/${frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${size}:fps=${FPS}`,
      '-frames:v', String(frames), ...x264, mp4], mp4);
  } else if (kind === 'split4') {
    const ins = [0, 1, 2, 3].flatMap(k => ['-framerate', String(FPS), '-i', join(dir, 'v' + k, `%05d.${EXT}`)]);
    const half = `${OUT_W / 2}:${OUT_H / 2}`;
    ffmpeg([...ins, '-filter_complex',
      `[0]scale=${half}[a];[1]scale=${half}[b];[2]scale=${half}[c];[3]scale=${half}[d];[a][b][c][d]xstack=inputs=4:layout=0_0|w0_0|0_h0|w0_h0[v]`,
      '-map', '[v]', ...x264, mp4], mp4);
  } else if (kind === 'mobile') {
    const h = Math.round(OUT_H * 0.92);
    ffmpeg(['-f', 'lavfi', '-i', `color=c=${BG}:s=${size}:r=${FPS}`, '-framerate', String(FPS), '-i', join(dir, `%05d.${EXT}`), '-filter_complex',
      `[1]scale=-2:${h}[p];[0][p]overlay=(W-w)/2:(H-h)/2:shortest=1[v]`, '-map', '[v]', ...x264, mp4], mp4);
  } else {
    ffmpeg(['-framerate', String(FPS), '-i', join(dir, `%05d.${EXT}`), '-vf', `scale=${OUT_W}:${OUT_H}`, ...x264, mp4], mp4);
  }
}

function overlayTitle(mp4, png, dur) {
  if (!existsSync(png)) return;
  const tmp = mp4.replace(/\.mp4$/, '.t.mp4');
  ffmpeg(['-i', mp4, '-loop', '1', '-i', png, '-filter_complex',
    `[1]scale=${OUT_W}:${OUT_H},format=rgba,fade=in:st=0:d=0.35:alpha=1,fade=out:st=${Math.max(0, dur - 0.35)}:d=0.35:alpha=1[t];[0][t]overlay=0:0:shortest=1[v]`,
    '-map', '[v]', ...x264, tmp], tmp);
  rmSync(mp4); copyFileSync(tmp, mp4); rmSync(tmp);
}

function concat(list, mp4) {
  const txt = mp4 + '.txt';
  writeFileSync(txt, list.map(f => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'));
  ffmpeg(['-f', 'concat', '-safe', '0', '-i', txt, ...x264, mp4], mp4);
  rmSync(txt);
}

// ------------------------------------------------------------------ main
const selected = shots.filter(s => !ONLY || ONLY.includes(s.id));
mkdirSync(OUT, {recursive: true});
const report = [];
const t0 = Date.now();
try {
  for (const shot of selected) {
    log(`shot ${shot.id}` + (shot.note ? `  (${shot.note})` : ''));
    const parts = shot.parts.map((p, i) => ({...p, index: i, place: p.place ?? i}));
    let racePage = null;
    const partFiles = [];
    for (const part of parts) {
      const dir = join(OUT, 'frames', `shot${String(shot.id).padStart(2, '0')}`, `part${part.index}`);
      rmSync(dir, {recursive: true, force: true});
      let kind = part.kind, written;
      try {
        if (kind === 'race' || kind === 'split4') {
          racePage ??= await openRace();
          written = await renderRacePart(racePage, part, dir, {split: kind === 'split4'});
        } else if (kind === 'mobile') {
          const page = await openRace({mobile: true});
          written = await renderRacePart(page, {...part, title: null, hud: true, cam: {type: 'game'}}, dir);
          await page.context().close();
        } else if (kind === 'picker') {
          const page = await newPage();
          await page.goto(`${BASE}/teddy/?seed=${SEED}`);
          await page.waitForFunction(() => window.__cap && !document.querySelector('#go').disabled, null, {timeout: 120000});
          await page.click('#choose-character');
          await page.waitForTimeout(1500);
          await page.evaluate(t => TITLE(t[0], 1, t[1]), part.title);
          written = await renderStillFrames(page, part, dir); kind = 'still';
          await page.context().close();
        } else if (kind === 'endcard') {
          const page = await newPage();
          await page.goto(`${BASE}/promo/render/endcard.html`);
          await page.waitForTimeout(800);
          written = await renderStillFrames(page, part, dir); kind = 'still';
          await page.context().close();
        } else if (kind === 'lobby') {
          written = await renderLobby(part, dir);
        } else if (kind === 'bubbleport') {
          written = await renderBubbleport(part, dir);
        } else if (kind === 'still') {
          mkdirSync(dir, {recursive: true}); written = 'still';
        }
        if ((kind === 'split4' || kind === 'mobile') && part.title) await titlePng(part.title, join(dir, 'title.png'));
        report.push({shot: shot.id, part: part.index, kind, ok: true, frames: written});
        log(`  part ${part.index} ${kind}: ${written}`);
        if (!PREVIEW) {
          const mp4 = join(dir, '..', `part${part.index}.mp4`);
          encodePart(kind, dir, part.dur, mp4, part.kind === 'still' ? {image: join(repo, part.image), zoom: part.zoom} : {});
          overlayTitle(mp4, join(dir, 'title.png'), part.dur);
          partFiles.push({place: part.place, mp4});
          if (!flag('keep-frames') && kind !== 'still') rmSync(dir, {recursive: true, force: true});
        } else {
          // preview: copy the frame we took to a flat folder
          mkdirSync(join(OUT, 'preview'), {recursive: true});
          const src = kind === 'still' ? (part.kind === 'still' ? join(repo, part.image) : join(dir, 'still.' + EXT))
            : kind === 'split4' ? join(dir, 'v0', '00000.' + EXT) : shotFile(dir, 0);
          copyFileSync(src, join(OUT, 'preview', `shot${String(shot.id).padStart(2, '0')}-${part.index}.${extname(src).slice(1)}`));
        }
      } catch (e) {
        log(`  part ${part.index} FAILED: ${e.message}`);
        report.push({shot: shot.id, part: part.index, kind, ok: false, error: e.message});
        if (racePage && (kind === 'race' || kind === 'split4')) { await racePage.context().close(); racePage = null; }
      }
    }
    if (racePage) await racePage.context().close();
    if (!PREVIEW && partFiles.length) {
      partFiles.sort((a, b) => a.place - b.place);
      concat(partFiles.map(p => p.mp4), join(OUT, `shot${String(shot.id).padStart(2, '0')}.mp4`));
    }
  }
  if (!PREVIEW && !ONLY) {
    const list = shots.map(s => join(OUT, `shot${String(s.id).padStart(2, '0')}.mp4`)).filter(existsSync);
    concat(list, join(OUT, 'promo.mp4'));
    log('wrote', join(OUT, 'promo.mp4'));
  }
  if (PREVIEW) {
    const imgs = readdirSync(join(OUT, 'preview')).filter(f => /\.(jpg|png)$/.test(f)).sort();
    writeFileSync(join(OUT, 'preview', 'index.html'), `<!doctype html><meta charset="utf-8"><title>promo preview</title>
<style>body{font:14px sans-serif;background:#f4efe3;margin:24px}div{display:inline-block;margin:8px;width:31%;vertical-align:top}img{width:100%;border-radius:6px}</style>
${imgs.map(f => `<div><img src="${f}"><br>${f}</div>`).join('\n')}`);
    log('preview:', join(OUT, 'preview', 'index.html'));
  }
} finally {
  writeFileSync(join(OUT, 'report.json'), JSON.stringify({fps: FPS, size: [OUT_W, OUT_H], preview: PREVIEW, seconds: Math.round((Date.now() - t0) / 1000), report}, null, 2));
  const failed = report.filter(r => !r.ok);
  log(`done in ${Math.round((Date.now() - t0) / 1000)}s; ${report.length - failed.length} parts ok, ${failed.length} failed` + (failed.length ? ' -> ' + failed.map(f => f.shot + '.' + f.part).join(' ') : ''));
  party?.kill();
  await browser.close();
  server.close();
  process.exitCode = failed.length ? 1 : 0;
}
