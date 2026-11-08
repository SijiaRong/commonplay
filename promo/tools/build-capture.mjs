// Builds a capture-only copy of teddy-playground/dist with camera / simulation hooks for the promo.
// The game in teddy-playground/ is never modified: the copy goes to promo/.build/teddy (git-ignored).
//
//   node promo/tools/build-capture.mjs            -> promo/.build/teddy
//
// Hooks added to the copy:
//   window.__cap      scene, camera, film, course, state, roster, link (worker port)
//   window.__cam      {eye:[x,y,z], at:[x,y,z], fov, r, focus?} overrides the game camera while set
//   window.__latest   true -> draw the newest simulation state (no network interpolation)
//   window.__norender true -> skip drawing entirely (fast-forward)
//   worker messages   freeze / advance / auto / stage / eval (see authority.js patch below)
import {cpSync, readFileSync, writeFileSync, rmSync, mkdirSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const repo = join(here, '..', '..');
export const buildDir = join(repo, 'promo', '.build', 'teddy');

function patch(file, pairs) {
  let s = readFileSync(file, 'utf8');
  for (const [from, to] of pairs) {
    const n = s.split(from).length - 1;
    if (n !== 1) throw new Error(`build-capture: expected exactly one "${from.slice(0, 60)}" in ${file}, found ${n}. The game code changed; update the patch.`);
    s = s.replace(from, to);
  }
  writeFileSync(file, s);
}

export function buildCapture() {
  rmSync(buildDir, {recursive: true, force: true});
  mkdirSync(dirname(buildDir), {recursive: true});
  cpSync(join(repo, 'teddy-playground', 'dist'), buildDir, {recursive: true});

  const focus = "focusRider(film,focus,seatedHeight*.5,ready?'ready':finished?'finish':'riding',snap);snap=false;";
  patch(join(buildDir, 'solo', 'play.js'), [
    // Free camera override.
    [focus, "const O=window.__cam;if(O){camera.position.set(...O.eye);camera.fov=O.fov||50;camera.updateProjectionMatrix();camera.lookAt(...O.at);focus.set(...(O.focus||O.at));focusRider(film,focus,O.r||1,O.mode||'riding',true);}else{" + focus + "}snap=false;"],
    // Draw the newest state instead of interpolating against wall-clock time.
    ["const t=now/1000-clockOffset-delay;", "const t=window.__latest?Infinity:now/1000-clockOffset-delay;"],
    // Hold the full resolution while capturing (no dynamic resolution).
    ["film.setFrameBudget(1/60,racing)", "film.setFrameBudget(1/60,racing&&!window.__latest)"],
    // Expose internals, allow skipping frames while fast-forwarding.
    ["renderer.setAnimationLoop(now=>{", "window.__cap={film,scene,camera,get course(){return course},get state(){return state},sampled,remotes,get you(){return you},get roster(){return roster},get link(){return link},host};renderer.setAnimationLoop(now=>{if(window.__norender){last=now;return}"],
    // Results of worker-side eval.
    ["if(m.type==='roster'){", "if(m.type==='evalr'){window.__evalr=m.r;return}if(m.type==='roster'){"],
  ]);

  patch(join(buildDir, 'solo', 'authority.js'), [
    ["    if(m.type==='pause')",
     `    if(m.type==='freeze'){paused=m.value;last=performance.now();balance=0}
    if(m.type==='advance'){for(let i=0;i<(m.ticks|0);i++)session.step();publish()}
    if(m.type==='auto'){session.disconnect(0)}
    if(m.type==='stage'){session.show.startStage(m.k);publish()}
    if(m.type==='eval'){try{send({type:'evalr',r:JSON.stringify(eval(m.code))})}catch(e){send({type:'evalr',r:String(e)})}}
    if(m.type==='pause')`],
  ]);
  return buildDir;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log('capture build:', buildCapture());
}
