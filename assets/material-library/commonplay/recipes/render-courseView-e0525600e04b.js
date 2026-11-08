// Turns a built stage (shared/course.js) into meshes: static blocks are merged per material into a few big
// geometries; moving obstacles are instanced in batches and posed every frame from the same physics colliders.
import * as THREE from 'three';
import { poseAt, dropWarning } from '../../shared/physics.js';
import { GeoBuilder, chamferBox, cylinder, lathe, helixLathe, rgb, IDENT, revolveRows } from './geometry.js';
import { bowlHeightAt, dishHeightAt } from '../../shared/course.js';
import { getMaterials, materialKey } from './materials.js';
import { textTexture } from './textures.js';
import { makeRng } from '../../shared/rng.js';

const BRIGHT = ['#d88365', '#efaa81', '#d5ae78', '#9ac9b3', '#65aea3', '#7eafb1', '#ae958d', '#eeae98'];
const warningColor=new THREE.Color('#ff990f'),tileColor=new THREE.Color();
const NATURAL = ['#ffffff', '#f6efe6', '#efe3d2', '#e6d3bd'];

export class CourseView {
  constructor(stage, quality, runway = null) {
    this.stage = stage;
    this.reduceMotion=matchMedia('(prefers-reduced-motion: reduce)');
    this.group = new THREE.Group();
    this.group.name = 'stage' + stage.index;
    this.kin = [];
    this.kinBatches = new Map();
    this.gate = null;
    this.gateDrop = 0;
    this.textures = [];
    this.quality = quality;
    const mats = getMaterials(quality);
    this.mats = mats;
    const rnd = makeRng(stage.index * 7919 + 13).next;
    this.rnd = rnd;
    // Static geometry is merged per material and per 48-unit chunk, so frustum culling still works for the
    // camera and the shadow pass.
    const chunks = new Map();
    const builderFor = (key, c) => {
      const k = `${key}:${Math.floor(c[0] / 48)}:${Math.floor(c[2] / 48)}`;
      let gb = chunks.get(k);
      if (!gb) {
        gb = new GeoBuilder();
        gb.key = key;
        chunks.set(k, gb);
      }
      return gb;
    };
    if (runway && stage.visuals.some(v => v.plushRunway)) {
      const piece = stage.pieces.find(p => p.name === 'runway');
      const floor = stage.colliders[piece.c0];
      const top = floor.c.map((x, i) => x + floor.hy * floor.R[i * 3 + 1]);
      runway.matrixAutoUpdate = false;
      setMatrix(runway, floor.R, top);
      this.group.add(runway);
      this.runway = runway;
    }
    for (const v of stage.visuals) {
      if (this.runway && v.plushRunway) continue;
      if (v.k === 'box') {
        const key = materialKey(v.m);
        const opts = { uOff: rnd() * 10, vOff: rnd() * 10 };
        if (key === 'boost') {
          opts.uvScale = 0.42;
          opts.uOff = 0;
          opts.vOff = 0.5;
          opts.bevel = 0.03;
        } else if (key === 'checker') {
          opts.uvScale = 0.31;
          opts.bevel = 0.02;
        }
        const col = key === 'boost' || key === 'checker' ? [1, 1, 1] : rgb(v.col, 0.05, rnd);
        chamferBox(builderFor(key, v.c), v.R, v.c, v.s[0], v.s[1], v.s[2], col, opts);
      } else if (v.k === 'cyl') {
        const key = materialKey(v.m);
        const col = rgb(v.col, 0.04, rnd);
        cylinder(builderFor(key, v.c), v.R, v.c, v.r, v.h, col, { bands: v.stripes ? Math.max(2, Math.round(v.h / 1.2)) : 1, alt: rgb('#f6ead2') });
      } else if (v.k === 'lathe') {
        const key = materialKey(v.m);
        lathe(builderFor(key, v.c), v.c, v.outline, v.a0, v.a1, rgb(v.col, 0.03, rnd), { segments: v.segments ? v.segments * 2.4 : 28 });
      } else if (v.k === 'helix') {
        const key = materialKey(v.m);
        helixLathe(builderFor(key, v.c), v.R || IDENT, v.c, v.outline, v.a0, v.a1, v.rise || 0, !!v.ease, rgb(v.col, 0.03, rnd), { segments: v.segments, lift: v.lift, blend: v.blend });
      } else if (v.k === 'saturnLamp') {
        const base = builderFor('brass', v.c);
        cylinder(base, IDENT, [v.c[0], v.c[1] + 0.18, v.c[2]], 1.35, 0.36, [1,1,1]);
        cylinder(base, IDENT, [v.c[0], v.c[1] + 0.56, v.c[2]], 0.52, 0.7, [1,1,1]);
        const center = [v.c[0], v.c[1] + 2.0, v.c[2]];
        // Revolve a peach enamel globe and tilt its brass orbit around the same center.
        const globe = [], orbit = [];
        for (let i = 0; i <= 24; i++) {
          const angle = i * Math.PI / 24;
          globe.push([1.36 * Math.sin(angle), 1.36 * Math.cos(angle)]);
        }
        for (let i = 0; i < 12; i++) {
          const angle = i * Math.PI / 6;
          orbit.push([2.02 + 0.23 * Math.cos(angle), 0.11 * Math.sin(angle)]);
        }
        helixLathe(builderFor('paint', center), IDENT, center, globe.reverse(), 0, 2*Math.PI, 0, false, rgb('#efaa81'), {segments:32});
        const tilt = 0.38, cs = Math.cos(tilt), sn = Math.sin(tilt);
        helixLathe(base, [cs,-sn,0,sn,cs,0,0,0,1], center, orbit, 0, 2*Math.PI, 0, false, [1,1,1], {segments:40});
      } else if (v.k === 'kin') {
        this.addKinematic(v);
      } else if (v.k === 'banner') {
        this.addBanner(v, builderFor('paint', v.c), builderFor('ash', v.c));
      } else if (v.k === 'sign') {
        this.addSign(v, builderFor('paint', v.c));
      } else if (v.k === 'bowl') {
        this.addBowl(v, builderFor('paint', v.c), builderFor('ash', v.c));
      }
    }
    for (const s of stage.supports) {
      const c = [s.x, 0, s.z];
      this.addSupport(s, { paint: builderFor('paint', c), wood: builderFor('ash', c) });
    }
    this.buildKinematics();
    for (const gb of chunks.values()) {
      const key = gb.key;
      const geo = gb.build();
      if (!geo) continue;
      const mesh = new THREE.Mesh(geo, mats[key]);
      mesh.castShadow = key !== 'boost' && key !== 'checker';
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
    }
  }

  // Moving pieces sharing a shape, size and material (piano keys, pusher rows) become one instanced mesh per
  // 48-unit chunk, so a stage full of them costs a handful of draw calls instead of one (plus a shadow) each.
  addKinematic(v) {
    const st = this.stage;
    const col = st.colliders[v.i];
    const color = rgb(v.col, 0.03, this.rnd);
    const key = materialKey(v.m);
    if (v.tag === 'gate') {
      const mesh = new THREE.Mesh(this.kinGeometry(v, color), this.mats[key]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
      this.gate = { col, mesh };
      setMatrix(mesh, col.R, col.c);
      return;
    }
    // Boxes take their color per instance; striped cylinders bake both colors, so they batch by color too.
    const dims = v.shape === 'box' ? v.s.map((x) => x.toFixed(3)).join(',') : v.shape === 'top' ? `${v.key},${v.col}` : `${v.r.toFixed(3)},${v.h.toFixed(3)},${!!v.stripes},${v.col}`;
    const bk = `${v.shape}:${dims}:${key}:${Math.floor(col.c[0] / 48)}:${Math.floor(col.c[2] / 48)}`;
    let b = this.kinBatches.get(bk);
    if (!b) {
      b = { v, key, items: [], tint: v.shape === 'box' };
      this.kinBatches.set(bk, b);
    }
    b.items.push({ col, color });
  }

  kinGeometry(v, color) {
    const gb = new GeoBuilder();
    if (v.tag === 'gate') {
      const [width,height,depth]=v.s;
      for (const fraction of [-.43,0,.43]) {
        chamferBox(gb, IDENT, [0,fraction*height,0], width,height*.14,depth,color,{bevel:.06});
      }
      for (const fraction of [-.48,0,.48]) {
        chamferBox(gb, IDENT, [fraction*width,0,0], .32,height,depth*.75,color,{bevel:.05});
      }
    } else if (v.shape === 'box') chamferBox(gb, IDENT, [0, 0, 0], v.s[0], v.s[1], v.s[2], color, { bevel: 0.14 });
    else if (v.shape === 'top') spinTop(gb, v.outline, color, rgb(v.alt || '#efe6d6'), this.quality === 'low' ? 20 : 28);
    else cylinder(gb, IDENT, [0, 0, 0], v.r, v.h, color, { stripes: !!v.stripes, segments: 18, alt: rgb('#f6ead2') });
    return gb.build();
  }

  buildKinematics() {
    const c3 = new THREE.Color();
    for (const b of this.kinBatches.values()) {
      const geo = this.kinGeometry(b.v, b.tint ? [1, 1, 1] : b.items[0].color);
      const mesh = new THREE.InstancedMesh(geo, this.mats[b.key], b.items.length);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      b.items.forEach((it, i) => {
        if (b.tint) mesh.setColorAt(i, c3.setRGB(it.color[0], it.color[1], it.color[2]));
        setInstance(mesh, i, it.col.R, it.col.c);
      });
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      // Culling bounds cover where the pieces start plus room to swing and slide.
      mesh.computeBoundingSphere();
      mesh.boundingSphere.radius += 10;
      this.group.add(mesh);
      this.kin.push({ mesh, items: b.items, moving: b.items.some((it) => it.col.motion) });
    }
    this.kinBatches = null;
  }

  addBanner(v, paint, ash) {
    const f = [Math.sin(v.h), 0, Math.cos(v.h)];
    const l = [Math.cos(v.h), 0, -Math.sin(v.h)];
    const R = [Math.cos(v.h), 0, Math.sin(v.h), 0, 1, 0, -Math.sin(v.h), 0, Math.cos(v.h)];
    const half = v.w / 2;
    const bh = (v.w - 0.4) * (150 / 1024);
    // Two turned posts and a crossbar, like a toy gantry.
    const postH = 10.5;
    for (const s of [1, -1]) {
      const c = [v.c[0] + l[0] * s * (half + 0.4), v.c[1] - postH / 2 + 2.2, v.c[2] + l[2] * s * (half + 0.4)];
      cylinder(ash, IDENT, c, 0.55, postH, rgb('#f2e6d6'), { segments: 18, bevel: 0.2 });
      cylinder(paint, IDENT, [c[0], c[1] + postH / 2 + 0.45, c[2]], 0.85, 0.9, rgb(v.col), { segments: 18, bevel: 0.3 });
    }
    chamferBox(ash, R, [v.c[0], v.c[1] + bh / 2 + 0.55, v.c[2]], v.w + 1.6, 0.7, 0.7, rgb('#f2e6d6'), { bevel: 0.2 });
    const text = textTexture(v.text, { bg: v.col, w: 1024, h: 150 });
    this.textures.push(text);
    const boardMat = new THREE.MeshPhysicalMaterial({ map: text, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.25 });
    boardMat.userData.sign = true; // lit faintly at night (render/night.js) so the route names still read
    const geo = new THREE.PlaneGeometry(v.w - 0.4, bh);
    for (const back of [false, true]) {
      const m = new THREE.Mesh(geo, boardMat);
      m.position.set(v.c[0] - f[0] * (back ? -0.09 : 0.09), v.c[1], v.c[2] - f[2] * (back ? -0.09 : 0.09));
      m.rotation.y = v.h + (back ? 0 : Math.PI);
      m.castShadow = !back;
      m.receiveShadow = true;
      this.group.add(m);
    }
    chamferBox(paint, R, [v.c[0], v.c[1], v.c[2]], v.w + 0.2, bh + 0.35, 0.14, rgb('#1d1b20'), { bevel: 0.05 });
  }

  addSign(v, paint) {
    const f = [Math.sin(v.h), 0, Math.cos(v.h)];
    const R = [Math.cos(v.h), 0, Math.sin(v.h), 0, 1, 0, -Math.sin(v.h), 0, Math.cos(v.h)];
    const w = Math.min(v.w, 6);
    const text = textTexture(v.text, { bg: v.col, w: 512, h: 160 });
    this.textures.push(text);
    const mat = new THREE.MeshStandardMaterial({ map: text, roughness: 0.5 });
    mat.userData.sign = true;
    const geo = new THREE.PlaneGeometry(w, w * (160 / 512));
    for (const back of [false, true]) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(v.c[0] - f[0] * (back ? -0.07 : 0.07), v.c[1], v.c[2] - f[2] * (back ? -0.07 : 0.07));
      m.rotation.y = v.h + (back ? 0 : Math.PI);
      this.group.add(m);
    }
    chamferBox(paint, R, v.c, w + 0.3, w * (160 / 512) + 0.3, 0.1, rgb('#ffffff'), { bevel: 0.04 });
  }

  // THE BOWL: lacquered concentric bands down a smooth coin-funnel surface, a dark ring and throat at the drain,
  // and a natural-wood underside. Built from the same height function as the physics, with analytic normals.
  addBowl(v, paint, ash) {
    const { R, Rd, thick, throat } = v;
    // THE WHIRLPOOL uses the same visual with its own (steeper) profile and fewer segments.
    const hAt = v.K ? (R_, r) => dishHeightAt(R_, r, v.A, v.K) : bowlHeightAt;
    const seg = Math.round((this.quality === 'low' ? 64 : 96) * (v.seg ? v.seg / 96 : 1));
    // Past the rim the physics floor is flat at 0, so the drawn ring is too (the profile curves up beyond R).
    const height = (r) => (r >= R ? 0 : hAt(R, r));
    const slope = (r) => (r >= R ? 0 : (hAt(R, r + 0.01) - hAt(R, r - 0.01)) / 0.02);
    // Surface rows from radius r0 down to r1, normal facing up (into the bowl).
    const surface = (r0, r1, yOff = 0, down = false, step = 0.7) => {
      const rows = [];
      let r = r0;
      while (true) {
        const f = slope(r), l = Math.hypot(f, 1);
        const y = height(r) - yOff * l;
        rows.push(down ? [r, y, f / l, -1 / l] : [r, y, -f / l, 1 / l]);
        if (r <= r1 + 1e-6) break;
        // Steps short enough to follow the curve: about `step` units of arc.
        r = Math.max(r1, r - step / l);
      }
      return rows;
    };
    // Band edges: a cream rim ring, even color bands, then a dark ring round the drain.
    const nb = v.bands.length - 2;
    const rTop = R - 1.4, rDark = Rd + 1.5;
    const edges = [R + 0.8, rTop];
    for (let i = 1; i <= nb; i++) edges.push(rTop - ((rTop - rDark) * i) / nb);
    edges.push(Rd);
    for (let i = 0; i < edges.length - 1; i++) {
      const col = rgb(v.bands[Math.min(i, v.bands.length - 1)], 0.02, this.rnd);
      revolveRows(paint, v.c, surface(edges[i], edges[i + 1]), col, { segments: seg });
    }
    // Drain throat (inside, facing the axis), its outer tube and bottom lip.
    const yd = hAt(R, Rd);
    const dark = rgb('#1d1b20');
    revolveRows(paint, v.c, [[Rd, yd, -1, 0], [Rd, yd - throat, -1, 0]], dark, { segments: seg >> 1 });
    const rt = Rd + 0.5;
    const under = surface(R + 1, rt, thick, true, 1.6);
    const yu = under[under.length - 1][1];
    const wood = rgb(v.under, 0.03, this.rnd);
    revolveRows(ash, v.c, under, wood, { segments: seg >> 1 });
    revolveRows(ash, v.c, [[rt, yu, 1, 0], [rt, yd - throat, 1, 0]], wood, { segments: seg >> 1 });
    revolveRows(paint, v.c, [[rt, yd - throat, 0, -1], [Rd, yd - throat, 0, -1]], dark, { segments: seg >> 1 });
  }

  // Support towers from under the course down to the room floor.
  addSupport(s, builders) {
    const top = s.y;
    if (top < 2.5) return;
    const rnd = makeRng(s.seed).next;
    const l = [Math.cos(s.h), 0, -Math.sin(s.h)];
    const R = [Math.cos(s.h), 0, Math.sin(s.h), 0, 1, 0, -Math.sin(s.h), 0, Math.cos(s.h)];
    const legs = s.hw > 4 ? [-1, 1] : [0];
    const style = top > 34 && s.style === 0 ? 1 : s.style;
    for (const side of legs) {
      const off = side * Math.max(0, s.hw - 0.4);
      const x = s.x + l[0] * off, z = s.z + l[2] * off;
      if (style === 0) {
        // Stack of chunky cubes, slightly askew.
        let y = 0;
        while (y < top - 0.1) {
          const size = Math.min(top - y, 2.6 + rnd() * 1.2);
          const yaw = s.h + (rnd() - 0.5) * 0.35;
          const Ry = [Math.cos(yaw), 0, Math.sin(yaw), 0, 1, 0, -Math.sin(yaw), 0, Math.cos(yaw)];
          chamferBox(builders.paint, Ry, [x, y + size / 2, z], 2.8, size, 2.8, rgb(BRIGHT[Math.floor(rnd() * BRIGHT.length)], 0.04, rnd), { bevel: 0.18, uOff: rnd() * 9, vOff: rnd() * 9 });
          y += size;
        }
      } else if (style === 1) {
        // Dowel with spools.
        cylinder(builders.wood, IDENT, [x, top / 2, z], 0.55, top, rgb(NATURAL[Math.floor(rnd() * NATURAL.length)], 0.04, rnd), { segments: 12 });
        for (let y = 2; y < top - 1; y += 9 + rnd() * 4) {
          cylinder(builders.paint, IDENT, [x, y, z], 1.25, 1.3, rgb(BRIGHT[Math.floor(rnd() * BRIGHT.length)], 0.04, rnd), { segments: 16 });
        }
        cylinder(builders.paint, IDENT, [x, top - 0.5, z], 1.4, 1.0, rgb('#f6ead2'), { segments: 16 });
        cylinder(builders.paint, IDENT, [x, 0.6, z], 1.6, 1.2, rgb(BRIGHT[Math.floor(rnd() * BRIGHT.length)]), { segments: 16 });
      } else if (style === 2) {
        // Square pillar of natural wood with colored caps.
        chamferBox(builders.wood, R, [x, top / 2, z], 1.6, top, 1.6, rgb(NATURAL[Math.floor(rnd() * NATURAL.length)], 0.04, rnd), { bevel: 0.15, uOff: rnd() * 9 });
        chamferBox(builders.paint, R, [x, top - 0.6, z], 2.4, 1.2, 2.4, rgb(BRIGHT[Math.floor(rnd() * BRIGHT.length)]), { bevel: 0.15 });
        chamferBox(builders.paint, R, [x, 0.7, z], 2.6, 1.4, 2.6, rgb(BRIGHT[Math.floor(rnd() * BRIGHT.length)]), { bevel: 0.15 });
      } else {
        // Alternating cylinders and blocks.
        let y = 0, k = 0;
        while (y < top - 0.1) {
          const h = Math.min(top - y, 3 + rnd() * 2.5);
          const col = rgb(BRIGHT[Math.floor(rnd() * BRIGHT.length)], 0.04, rnd);
          if (k % 2) chamferBox(builders.paint, R, [x, y + h / 2, z], 2.4, h, 2.4, col, { bevel: 0.16, uOff: rnd() * 9 });
          else cylinder(builders.paint, IDENT, [x, y + h / 2, z], 1.25, h, col, { segments: 16 });
          y += h;
          k++;
        }
      }
    }
    if (legs.length === 2 && top > 6) {
      // Cross brace between the legs.
      const a = -Math.max(0, s.hw - 0.4), b = -a;
      for (const yb of [top * 0.45, top * 0.85]) {
        const c = [s.x, yb, s.z];
        chamferBox(builders.wood, R, c, b - a, 0.8, 0.8, rgb(NATURAL[1], 0.04, rnd), { bevel: 0.1 });
      }
    }
  }

  // Poses moving obstacles at stage time t (seconds); drops the start gate once the race is on.
  update(t, dt, raceStarted) {
    const g = this.gate;
    if (g) {
      if (raceStarted) {
        this.gateDrop = Math.min(1, this.gateDrop + dt * 2.2);
        const c = g.col.c;
        setMatrix(g.mesh, g.col.R, [c[0], c[1] - this.gateDrop * this.gateDrop * 4.5, c[2]]);
        g.mesh.visible = this.gateDrop < 1;
      } else {
        this.gateDrop = 0;
        g.mesh.visible = true;
        setMatrix(g.mesh, g.col.R, g.col.c);
      }
    }
    for (const k of this.kin) {
      if (!k.moving) continue;
      for (let i = 0; i < k.items.length; i++) {
        const col = k.items[i].col;
        if (!col.motion) continue;
        poseAt(col, t);
        if(col.motion.type==='drop'){
          const warning=dropWarning(col.motion,t);
          tileColor.fromArray(k.items[i].color).lerp(warningColor,Math.sqrt(warning));
          k.mesh.setColorAt(i,tileColor);
          k.mesh.instanceColor.needsUpdate=true;
          const shake=this.reduceMotion.matches?0:Math.sin(warning*38)*.15*warning;
          setInstance(k.mesh,i,col.R,[col.c[0]+shake*col.R[0],col.c[1],col.c[2]+shake*col.R[6]]);
        }else setInstance(k.mesh, i, col.R, col.c);
      }
      k.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose() {
    // The loaded model is reused across resets.
    if (this.runway) this.group.remove(this.runway);
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material && !Object.values(this.mats).includes(o.material)) o.material.dispose();
    });
    for (const t of this.textures) t.dispose();
  }
}

// A turned, painted toy top: the outline [[r, y], ...] from the tip up to the knob, revolved with smooth normals. The
// wide rim is striped (so the spin reads), the shoulder is cream, the stem painted.
function spinTop(gb, outline, col, alt, seg) {
  const n = outline.length;
  const nrm = outline.map((p, i) => {
    let nr = 0, ny = 0;
    for (const [a, b] of [[i - 1, i], [i, i + 1]]) {
      if (a < 0 || b >= n) continue;
      const er = outline[b][0] - outline[a][0], ey = outline[b][1] - outline[a][1];
      const l = Math.hypot(er, ey) || 1;
      nr += ey / l;
      ny += -er / l;
    }
    const l = Math.hypot(nr, ny) || 1;
    return [nr / l, ny / l];
  });
  const rMax = Math.max(...outline.map((p) => p[0]));
  for (let e = 0; e + 1 < n; e++) {
    const [ra, ya] = outline[e], [rb, yb] = outline[e + 1];
    const rim = Math.min(ra, rb) > rMax * 0.8;
    const shoulder = !rim && ya > outline[0][1] + 0.5 && Math.max(ra, rb) > 0.9;
    for (let j = 0; j < seg; j++) {
      const c = rim ? (j % 4 < 2 ? col : alt) : shoulder ? alt : col;
      const p0 = (j / seg) * Math.PI * 2, p1 = ((j + 1) / seg) * Math.PI * 2;
      const i0 = gb.count;
      for (const [r, y, nn, ph] of [[ra, ya, nrm[e], p0], [rb, yb, nrm[e + 1], p0], [rb, yb, nrm[e + 1], p1], [ra, ya, nrm[e], p1]]) {
        const cx = Math.cos(ph), sz = Math.sin(ph);
        gb.vert(cx * r, y, sz * r, cx * nn[0], nn[1], sz * nn[0], ph * rMax * 0.11, y * 0.11, c[0], c[1], c[2]);
      }
      gb.idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
    }
  }
}

const m4 = new THREE.Matrix4();
function setMatrix(mesh, R, c) {
  m4.set(R[0], R[1], R[2], c[0], R[3], R[4], R[5], c[1], R[6], R[7], R[8], c[2], 0, 0, 0, 1);
  mesh.matrix.copy(m4);
  mesh.matrixWorldNeedsUpdate = true;
}

function setInstance(mesh, i, R, c) {
  m4.set(R[0], R[1], R[2], c[0], R[3], R[4], R[5], c[1], R[6], R[7], R[8], c[2], 0, 0, 0, 1);
  mesh.setMatrixAt(i, m4);
}
