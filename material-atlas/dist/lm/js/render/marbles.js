// All fifty marbles in one instanced draw call. The surface is three's physical material (so reflections,
// sun highlights and shadows are real) with an injected interior: each pixel refracts the view ray into the
// sphere and ray-marches a procedural pattern (cat's-eye vanes, swirls, galaxies, bubbles...) in the marble's
// own rotating frame, then shows the room through the glass behind it, upside down like a real marble.
import * as THREE from 'three';
import { SKINS } from '../../shared/skins.js';
import { lookedSkin, STYLE_SLOTS, GLOW_FINISH } from '../../shared/looks.js';

const MAX = 64;
// Core brightness of a Glow-finish marble by day, and the extra it gets at night over everyone's glow.
const GLOW_FINISH_DAY = 0.3;
const GLOW_FINISH_NIGHT = 0.45;
// Light pools: disc diameter in marble radii, and brightness.
const POOL_SIZE = 8;
// Pool slots from here on belong to the night props (night.js), not to marbles.
const EXTRA0 = 50;
const POOL_GAIN = 3;

const PATTERN_GLSL = /* glsl */ `
uniform float uTime;
uniform float uSteps;
varying vec3 vWP;
varying vec4 vCR;
varying vec4 vQuat;
varying vec4 vA;
varying vec4 vB;
varying vec4 vC;
varying vec4 vG;
varying vec4 vF;

vec3 qrotInv(vec4 q, vec3 v) {
  vec3 u = -q.xyz;
  return v + 2.0 * cross(u, cross(u, v) + q.w * v);
}
vec3 qrot(vec4 q, vec3 v) {
  return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
}
float h31(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h31(i + vec3(0, 0, 0)), h31(i + vec3(1, 0, 0)), f.x), mix(h31(i + vec3(0, 1, 0)), h31(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(h31(i + vec3(0, 0, 1)), h31(i + vec3(1, 0, 1)), f.x), mix(h31(i + vec3(0, 1, 1)), h31(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm3(vec3 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { v += a * vnoise(p); p = p * 2.07 + 11.3; a *= 0.5; }
  return v;
}
// Interior pattern at object-space point p (|p| <= 1): rgb color, a = density.
vec4 marblePattern(vec3 p, float style, float seed) {
  float L = length(p);
  vec3 A = vA.rgb, B = vB.rgb, C = vC.rgb;
  if (style < 0.5) {
    // Cat's eye: three twisted vanes through the middle.
    float ang = p.y * 2.4 + seed * 6.28;
    float cs = cos(ang), sn = sin(ang);
    vec2 q = vec2(cs * p.x - sn * p.z, sn * p.x + cs * p.z);
    float d = min(abs(q.y), min(abs(dot(q, vec2(0.8660, 0.5))), abs(dot(q, vec2(0.8660, -0.5)))));
    float w = 0.085 * (1.15 - L);
    float dens = smoothstep(w, w * 0.25, d) * smoothstep(0.9, 0.62, L);
    vec3 col = mix(A, C, smoothstep(0.1, 0.75, abs(p.y)));
    col = mix(col, B, smoothstep(0.35, 0.0, L) * 0.6);
    return vec4(col * 1.25, dens * 34.0);
  } else if (style < 1.5) {
    // Swirl ribbons.
    float r = length(p.xz);
    float a = atan(p.z, p.x);
    float f = sin(a * 2.0 + p.y * 3.6 + r * 4.2 + seed * 6.28);
    float b1 = smoothstep(0.6, 0.9, f);
    float b2 = smoothstep(0.6, 0.9, -f) * 0.85;
    float fade = smoothstep(0.93, 0.66, L);
    vec3 col = b1 > b2 ? A : B;
    col = mix(col, C, smoothstep(0.55, 0.8, vnoise(p * 4.0 + seed * 9.0)) * 0.6);
    return vec4(col * 1.15, (b1 + b2) * fade * 22.0);
  } else if (style < 2.5) {
    // Galaxy: nebula fog and stars.
    float n = fbm3(p * 2.6 + seed * 13.0);
    vec3 col = mix(A, B, smoothstep(0.35, 0.75, n));
    col = mix(col, C, smoothstep(0.55, 0.8, fbm3(p * 3.4 - seed * 7.0)));
    float stars = step(0.985, h31(floor(p * 18.0) + seed * 31.0));
    col += vec3(stars) * 3.0;
    return vec4(col * 1.3, (0.9 + n * 2.6 + stars * 20.0) * smoothstep(0.98, 0.8, L));
  } else if (style < 4.5) {
    // Clearie: tinted glass with tiny bubbles.
    float dens = 0.0;
    for (int i = 0; i < 6; i++) {
      float fi = float(i);
      vec3 c = (vec3(h31(vec3(fi, seed, 1.0)), h31(vec3(fi, seed, 2.0)), h31(vec3(fi, seed, 3.0))) - 0.5) * 1.1;
      float r = 0.05 + 0.06 * h31(vec3(fi, seed, 4.0));
      float d = abs(length(p - c) - r);
      dens += smoothstep(0.03, 0.0, d);
    }
    return vec4(mix(B, vec3(1.0), 0.6) * 1.6, dens * 16.0 + 0.25);
  } else if (style < 6.5) {
    // Oil slick: deep dark glass.
    float n = fbm3(p * 3.0 + seed * 5.0);
    return vec4(A * (0.6 + n), 3.0);
  } else if (style < 7.5) {
    // Onion skin: a striped core.
    float a = atan(p.z, p.x);
    float k = fract(a * 0.954 + p.y * 0.4 + seed);
    vec3 col = k < 0.33 ? A : k < 0.66 ? B : C;
    float shell = smoothstep(0.85, 0.75, L) * smoothstep(0.2, 0.45, L);
    return vec4(col * 1.1, shell * 30.0);
  } else if (style < 8.5) {
    // Lava: glowing churning blobs.
    float n = fbm3(p * 2.4 + vec3(0.0, uTime * 0.35, seed * 9.0));
    float blob = smoothstep(0.45, 0.62, n);
    vec3 col = mix(C, mix(A, B, smoothstep(0.55, 0.75, n)), blob);
    return vec4(col * (1.0 + blob * 2.2), (0.6 + blob * 14.0) * smoothstep(0.95, 0.75, L));
  } else if (style < 10.5) {
    // Snow globe: clear water over a drift of snow (the falling flakes are particles, see marbleParticles).
    float pile = smoothstep(-0.48, -0.62, p.y + (vnoise(p * 5.0 + seed) - 0.5) * 0.14);
    return vec4(mix(B, A, pile) * 1.3, pile * 30.0 + 0.1);
  } else if (style < 11.5) {
    // Firefly jar: faintly smoky glass (the fireflies are particles, see marbleParticles).
    return vec4(C * (0.8 + 0.6 * vnoise(p * 3.0 + seed * 5.0)), 1.1);
  } else if (style < 12.5) {
    // Crackle ice: faintly tinted clear glass (the fractures are drawn exactly, see marbleCracks).
    return vec4(A, 0.12);
  } else {
    // Aurora: glowing curtains rippling round the core.
    float a = atan(p.z, p.x);
    float wave = sin(a * 3.0 + vnoise(p * 2.5 + vec3(0.0, uTime * 0.3, seed * 7.0)) * 5.0 + uTime * 0.4);
    float curtain = smoothstep(0.72, 0.98, wave) * smoothstep(0.8, 0.25, abs(p.y + 0.1));
    curtain *= smoothstep(0.25, 0.5, length(p.xz)) * smoothstep(0.92, 0.7, L);
    vec3 col = mix(A, B, smoothstep(-0.3, 0.6, p.y));
    col = mix(col, C, smoothstep(0.6, 0.9, vnoise(p * 3.0 + seed)));
    return vec4(col * (1.0 + curtain * 1.2), curtain * 9.0 + 0.05);
  }
}

// Snowflakes and fireflies: a handful of particles drawn exactly (each one's nearest approach to the view ray),
// since dots this small slip between the march's steps and sparkle. Returns premultiplied color and coverage.
vec4 marbleParticles(vec3 ro, vec3 rd, float tEnd, float style, float seed) {
  vec3 rgb = vec3(0.0);
  float a = 0.0;
  bool snow = style < 10.5;
  for (int i = 0; i < 14; i++) {
    float fi = float(i);
    float h1 = h31(vec3(fi, seed, 1.0)), h2 = h31(vec3(fi, seed, 2.0)), h3 = h31(vec3(fi, seed, 3.0)), h4 = h31(vec3(fi, seed, 4.0));
    vec3 c;
    if (snow) {
      // Falling, drifting side to side, starting again at the top.
      float y = 0.7 - mod(uTime * (0.09 + 0.06 * h4) + h2 * 1.4, 1.4);
      c = vec3((h1 - 0.5) * 1.1 + 0.07 * sin(uTime * 0.8 + fi), y, (h3 - 0.5) * 1.1 + 0.05 * cos(uTime * 0.7 + fi));
    } else {
      // Wandering slowly round the jar.
      c = (vec3(h1, h2, h3) - 0.5) * 1.15 + 0.14 * vec3(sin(uTime * (0.35 + h4 * 0.4) + fi), sin(uTime * (0.45 + h1 * 0.3) + fi * 2.0), cos(uTime * (0.4 + h2 * 0.3) + fi));
    }
    if (dot(c, c) > 0.75) continue;
    float t = clamp(dot(c - ro, rd), 0.0, tEnd);
    float d = length(ro + rd * t - c);
    if (snow) {
      float r = 0.035 + 0.035 * h4;
      float k = smoothstep(r, r * 0.4, d) * (1.0 - a);
      rgb += vB.rgb * 1.5 * k;
      a += k;
    } else {
      float pulse = 0.25 + 0.75 * pow(0.5 + 0.5 * sin(uTime * (1.1 + h4 * 1.6) + fi * 2.3), 3.0);
      float g = exp(-d * d / 0.0014) + 0.12 * exp(-d * d / 0.012);
      rgb += vA.rgb * 3.0 * g * pulse;
    }
  }
  return vec4(rgb, clamp(a, 0.0, 1.0));
}

// Crackle: fracture lines where the view ray crosses three nested shells inside the marble, each line the border
// between cells of a 3D Voronoi pattern. Exact points, so the cracks stay crisp at any size.
vec4 marbleCracks(vec3 ro, vec3 rd, float tEnd, float seed) {
  vec3 rgb = vec3(0.0);
  float a = 0.0;
  float b = dot(ro, rd), c0 = dot(ro, ro);
  for (int s = 0; s < 3; s++) {
    float rad = 0.86 - float(s) * 0.24;
    float disc = b * b - (c0 - rad * rad);
    if (disc <= 0.0) continue;
    float sq = sqrt(disc);
    for (int h = 0; h < 2; h++) {
      float t = h == 0 ? -b - sq : -b + sq;
      if (t < 0.0 || t > tEnd) continue;
      vec3 q = (ro + rd * t) * 2.4 + seed * 7.0 + float(s) * 3.1;
      vec3 cell = floor(q);
      float d1 = 9.0, d2 = 9.0;
      for (int x = -1; x <= 1; x++) {
        for (int y = -1; y <= 1; y++) {
          for (int z = -1; z <= 1; z++) {
            vec3 cc = cell + vec3(float(x), float(y), float(z));
            float d = length(q - cc - vec3(h31(cc + 1.7), h31(cc + 4.3), h31(cc + 9.1)));
            if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
          }
        }
      }
      float line = smoothstep(0.09, 0.015, d2 - d1) * (1.0 - float(s) * 0.25) * (1.0 - a);
      rgb += mix(vB.rgb, vC.rgb, float(s) * 0.4) * 1.2 * line;
      a += line * 0.7;
    }
  }
  return vec4(rgb, clamp(a, 0.0, 1.0));
}

// Glitter finish: one layer of tiny mirror flakes at object-space point p (a lattice of cells, about half holding
// a flake with its own tilt). Returns (coverage, world-space flake normal); the caller looks the reflection up in
// the room, so a flake only flashes when it catches the window or a lamp, and twinkles as the marble rolls.
// Flakes smaller than a pixel would shimmer, so they fade to their average as the marble gets small on screen.
vec4 marbleFlake(vec3 p, float px) {
  const float FREQ = 17.0;
  vec3 q = p * FREQ;
  vec3 cell = floor(q);
  float h = h31(cell + 3.7);
  vec3 o = vec3(h31(cell + 1.3), h31(cell + 5.9), h31(cell + 8.1));
  float d = length(fract(q) - 0.25 - o * 0.5);
  float sharp = smoothstep(1.2, 2.6, (1.0 / FREQ) / max(px, 1e-5));
  float cov = smoothstep(0.26, 0.12, d) * step(0.3, h);
  cov = mix(0.1, cov, sharp);
  vec3 n = normalize(o * 2.0 - 1.0 + vec3(0.0, 0.0, 0.001));
  return vec4(cov, qrot(vQuat, n));
}
`;

// LIGHTS OUT glow: what the lit core adds, per finish (glass marbles) and per style (opaque ones). vF.yzw is the
// marble's glow color (see glowColor()); the caller scales it by mGlowK.
const GLOW_GLSL = /* glsl */ `
#ifdef MARBLE_GLOW
uniform float uGlowNight;
uniform float uGlowFinish;
vec3 marbleGlowInside(vec3 g, float trans, float cosV, bool frost, bool pearl, bool glit, vec3 irid, vec3 ro, vec3 rd, float tEnd, float px) {
  vec3 c = vF.yzw;
  // The glass itself carries a little of the light, most where the view crosses the middle; the rim stays dark glass.
  vec3 o = g + c * 0.1 * cosV * cosV;
  if (frost) {
    // Frosted: the sand-blasted skin scatters the core into an even, milky lamp.
    o = mix(o, c * 0.5 + g * 0.4, 0.6);
  } else if (pearl) {
    // Pearl: the glow gathers at the rim in shifting pastels.
    o += irid * c * 0.4 * pow(1.0 - cosV, 2.0);
  } else if (glit) {
    // Glitter: flakes in the glass catch the core light.
    for (int k = 0; k < 2; k++) {
      vec4 fl = marbleFlake(ro + rd * (tEnd * (k == 0 ? 0.3 : 0.62)), px * 1.15);
      o += mix(vec3(1.0), c, 0.5) * fl.x * 0.8;
    }
  }
  return o;
}
// Opaque marbles glow like luminous paint; a steelie's metal only faintly; the disco ball shines through its grout.
vec3 marbleGlowOpaque(vec3 diff, float style, float metal, vec3 n, vec3 v) {
  vec3 c = vF.yzw;
  float facing = 0.45 + 0.55 * clamp(dot(n, v), 0.0, 1.0);
  // A steelie's metal doesn't glow through, but it is lit warmly by the light around it (it shouldn't look switched off).
  if (style > 4.5 && style < 5.5) return mix(vec3(1.0, 0.85, 0.7), c, 0.4) * 0.26 * facing;
  if (style > 13.5 && style < 14.5) return c * (1.0 - metal) * 1.4 + c * metal * 0.06;
  // Dark skins (smoke, brown, navy) still glow: at least a share of their glow color.
  return max(mix(diff, c, 0.35) * 0.5, c * 0.2) * facing;
}
#endif
`;

// The color a marble glows (and lights the course with): the most saturated color its style actually draws,
// at full brightness with a touch of white-hot; pale or grey marbles glow a warm white. Linear RGB.
const WARM_WHITE = new THREE.Color('#ffe0b8');
const UP = new THREE.Vector3(0, 1, 0);
const _gc = new THREE.Color();
export function glowColor(s, out = new THREE.Color()) {
  const info = STYLE_SLOTS[s.style] || STYLE_SLOTS[0];
  let best = null, score = -1;
  const keys = info.slots.map(([k]) => k);
  if (info.glass) keys.push('glass');
  for (const k of keys) {
    _gc.set(s[k]);
    const mx = Math.max(_gc.r, _gc.g, _gc.b), mn = Math.min(_gc.r, _gc.g, _gc.b);
    const sat = mx > 1e-4 ? (mx - mn) / mx : 0;
    const sc = sat * (0.35 + Math.min(1, mx * 3)) - (k === 'glass' ? 0.25 : 0);
    if (sc > score) {
      score = sc;
      best = s[k];
    }
  }
  if (score < 0.2) return out.copy(WARM_WHITE);
  out.set(best);
  const mx = Math.max(out.r, out.g, out.b, 1e-4);
  out.multiplyScalar(1 / mx);
  return out.lerp(WARM_WHITE, 0.15);
}

// Light off one glitter flake (a tiny mirror with world normal n, seen along ray dir): the room reflected in it plus
// a hard glint when it lines up with the sun, capped so a flake never blooms. Declared after three's light uniforms.
const FLAKE_LIGHT_GLSL = /* glsl */ `
vec3 mFlakeLight(vec3 dir, vec3 n, float rough) {
  vec3 r = reflect(dir, n);
  vec3 c = vec3(0.35);
  #ifdef ENVMAP_TYPE_CUBE_UV
    c = textureCubeUV(envMap, envMapRotation * r, rough).rgb * envMapIntensity * 1.4;
  #endif
  #if NUM_DIR_LIGHTS > 0
    vec3 rv = normalize((viewMatrix * vec4(r, 0.0)).xyz);
    c += directionalLights[0].color * pow(max(dot(rv, directionalLights[0].direction), 0.0), 90.0) * 0.6;
  #endif
  return min(c, vec3(3.0));
}
`;

// Fake light (LIGHTS OUT): a soft disc on the surface under a light. At night the course materials write how light
// their surface is (albedo luminance) into the frame's alpha channel (materials.js, setNightAlbedo); the pool adds
// light * that alpha, so it lights pale oak more than dark paint, and overlapping pools add up as light does instead
// of multiplying. The alpha channel itself is left as it is. Instances carry aCol (light color) and aAlpha (strength).
export function poolMaterial(gain) {
  return new THREE.ShaderMaterial({
    uniforms: { uGain: { value: gain } },
    vertexShader: /* glsl */ `
      attribute float aAlpha; attribute vec3 aCol; varying vec2 vUv; varying float vA; varying vec3 vCol;
      void main() { vUv = uv; vA = aAlpha; vCol = aCol; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uGain; varying vec2 vUv; varying float vA; varying vec3 vCol;
      void main() {
        // Inverse-square-like falloff from the point under the light, faded to zero at the disc's edge.
        float d2 = dot(vUv - 0.5, vUv - 0.5) * 4.0;
        float f = max(0.0, 1.0 - d2);
        f = f * f / (1.0 + d2 * 30.0);
        gl_FragColor = vec4(vCol * (f * vA * uGain), 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.DstAlphaFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
  });
}

export class MarbleView {
  constructor(scene, quality) {
    this.scene = scene;
    this.quality = quality;
    const seg = quality === 'low' ? 24 : 40;
    const geo = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.7));
    this.aA = new Float32Array(MAX * 4);
    this.aB = new Float32Array(MAX * 4);
    this.aC = new Float32Array(MAX * 4);
    this.aG = new Float32Array(MAX * 4);
    this.aQ = new Float32Array(MAX * 4);
    this.aF = new Float32Array(MAX * 4); // x = workshop finish
    const ib = (arr) => new THREE.InstancedBufferAttribute(arr, 4).setUsage(THREE.DynamicDrawUsage);
    this.attrA = ib(this.aA);
    this.attrB = ib(this.aB);
    this.attrC = ib(this.aC);
    this.attrG = ib(this.aG);
    this.attrQ = ib(this.aQ);
    this.attrF = ib(this.aF);
    geo.setAttribute('aA', this.attrA);
    geo.setAttribute('aB', this.attrB);
    geo.setAttribute('aC', this.attrC);
    geo.setAttribute('aG', this.attrG);
    geo.setAttribute('aQ', this.attrQ);
    geo.setAttribute('aF', this.attrF);
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, roughness: 0.06, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.25,
      specularIntensity: 1, ior: 1.5,
    });
    // uScene: last frame's rendered image (see Scene3D.render), seen through the glass. Using it instead of three's
    // transmission saves a second render of the whole scene every frame.
    this.uniforms = { uTime: { value: 0 }, uSteps: { value: quality === 'low' ? 6 : quality === 'medium' ? 9 : 12 }, uScene: { value: null }, uSceneOn: { value: 0 } };
    // Glow (LIGHTS OUT): how brightly every marble's core burns (night shows), and the extra a Glow-finish marble gets.
    // Only compiled in when needed (the MARBLE_GLOW define), so a day show without a Glow marble runs the old program.
    this.glowUniforms = { uGlowNight: { value: 0 }, uGlowFinish: { value: GLOW_FINISH_DAY } };
    this.mat = mat;
    this.night = false;
    this.glowCount = 0;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms, this.glowUniforms);
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
attribute vec4 aA; attribute vec4 aB; attribute vec4 aC; attribute vec4 aG; attribute vec4 aQ; attribute vec4 aF;
varying vec3 vWP; varying vec4 vCR; varying vec4 vQuat; varying vec4 vA; varying vec4 vB; varying vec4 vC; varying vec4 vG; varying vec4 vF;`,
        )
        .replace(
          '#include <worldpos_vertex>',
          `#include <worldpos_vertex>
  vec4 wpM = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
  vWP = wpM.xyz;
  vec4 cM = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vCR = vec4(cM.xyz, length(instanceMatrix[0].xyz));
  vQuat = aQ; vA = aA; vB = aB; vC = aC; vG = aG; vF = aF;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', `${FLAKE_LIGHT_GLSL}\nvoid main() {`)
        .replace('#include <common>', `#include <common>\nuniform sampler2D uScene;\nuniform float uSceneOn;\nuniform mat4 projectionMatrix;\n${PATTERN_GLSL}\n${GLOW_GLSL}`)
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
  float mStyle = vA.w;
  float mSeed = vB.w;
  vec3 mN = normalize(vWP - vCR.xyz);
  vec3 mObj = qrotInv(vQuat, mN);
  bool mOpaque = (mStyle > 2.5 && mStyle < 3.5) || (mStyle > 4.5 && mStyle < 5.5) || (mStyle > 8.5 && mStyle < 9.5) || mStyle > 13.5;
  float mMetal = 0.0, mSpark = 0.0;
  // Workshop finish: 0 glossy, 1 frosted, 2 pearl, 3 glitter.
  float mFin = vF.x;
  bool mFrost = mFin > 0.5 && mFin < 1.5, mPearl = mFin > 1.5 && mFin < 2.5, mGlit = mFin > 2.5;
  #ifdef MARBLE_GLOW
  // Finish 4 is Glow (glossy glass with a brighter core), not glitter.
  if (mFin > 3.5) mGlit = false;
  float mGlowK = uGlowNight + (mFin > 3.5 ? uGlowFinish : 0.0);
  // A ghosted marble (see-through cutout) glows less, so its cutout doesn't flicker bright against the dark.
  if (vC.w > 0.5) mGlowK *= 0.35;
  #endif
  if (vC.w > 0.5 && mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0) < 1.0) discard;
  if (mStyle > 2.5 && mStyle < 3.5) {
    float t = fbm3(mObj * 2.2 + mSeed * 17.0) * 3.2 + mObj.y * 1.7;
    float band = fract(t);
    vec3 c = mix(vA.rgb, vB.rgb, smoothstep(0.2, 0.5, band));
    c = mix(c, vC.rgb, smoothstep(0.75, 0.95, band));
    diffuseColor.rgb = c;
  } else if (mStyle > 4.5 && mStyle < 5.5) {
    diffuseColor.rgb = vA.rgb;
  } else if (mStyle > 13.5 && mStyle < 14.5) {
    // Disco ball: rings of mirror tiles, each a slightly different shade, in dark grout.
    float lat = asin(clamp(mObj.y, -1.0, 1.0)) / 3.14159 + 0.5;
    float ri = floor(lat * 18.0);
    float cols = max(6.0, floor(36.0 * sin((ri + 0.5) / 18.0 * 3.14159)));
    float lon = atan(mObj.z, mObj.x) / 6.28318 + 0.5;
    float ci = floor(lon * cols);
    vec2 fr = vec2(fract(lat * 18.0), fract(lon * cols));
    float tile = step(0.1, fr.x) * step(fr.x, 0.9) * step(0.08, fr.y) * step(fr.y, 0.92);
    float h = h31(vec3(ri, ci, mSeed * 10.0));
    diffuseColor.rgb = mix(vB.rgb * 0.08, vA.rgb * (0.78 + 0.22 * h), tile);
    mMetal = tile;
    mSpark = tile * step(0.93, fract(h * 17.0 + uTime * 0.35));
  } else if (mStyle > 14.5) {
    // Googly eye: a white ball with a colored iris and a black pupil.
    float d = acos(clamp(mObj.z, -1.0, 1.0));
    vec3 c = mix(vA.rgb * (0.65 + 0.5 * fbm3(mObj * 14.0 + mSeed)), vB.rgb, smoothstep(0.5, 0.54, d));
    diffuseColor.rgb = mix(vC.rgb, c, smoothstep(0.22, 0.25, d));
  } else if (mStyle > 8.5 && mStyle < 9.5) {
    float land = smoothstep(0.5, 0.56, fbm3(mObj * 2.6 + mSeed * 5.0));
    vec3 c = mix(vA.rgb, vB.rgb, land);
    float ice = smoothstep(0.78, 0.86, abs(mObj.y));
    c = mix(c, vec3(1.0), ice);
    float cloud = smoothstep(0.58, 0.72, fbm3(mObj * 4.0 + vec3(uTime * 0.05, 0.0, mSeed)));
    diffuseColor.rgb = mix(c, vC.rgb, cloud * 0.85);
  } else {
    diffuseColor.rgb = vec3(0.0);
  }`,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
  if (mStyle > 4.5 && mStyle < 5.5) roughnessFactor = 0.13;
  else if (mStyle > 13.5 && mStyle < 14.5) roughnessFactor = mix(0.6, 0.06, mMetal);
  else if (mStyle > 14.5) roughnessFactor = 0.2;
  else if (mOpaque) roughnessFactor = 0.32;
  // Frosted: a sand-blasted skin scatters every highlight into a soft glow. Pearl: a satin polish.
  if (mFrost) roughnessFactor = max(roughnessFactor, 0.55);
  else if (mPearl) roughnessFactor = max(roughnessFactor, 0.2);`,
        )
        .replace(
          '#include <metalnessmap_fragment>',
          `#include <metalnessmap_fragment>
  if (mStyle > 4.5 && mStyle < 5.5) metalnessFactor = 1.0;
  if (mMetal > 0.0) metalnessFactor = mMetal;`,
        )
        .replace(
          '#include <lights_physical_fragment>',
          `#include <lights_physical_fragment>
  #ifdef USE_CLEARCOAT
  if (mFrost) { material.clearcoat = 0.35; material.clearcoatRoughness = max(material.clearcoatRoughness, 0.5); }
  else if (mPearl) material.clearcoatRoughness = max(material.clearcoatRoughness, 0.14);
  #endif`,
        )
        .replace(
          '#include <lights_fragment_end>',
          `#include <lights_fragment_end>
  // Pearl: the reflections themselves shift through soft pastel colors with the viewing angle, like nacre.
  vec3 mIrid = vec3(1.0);
  if (mPearl) {
    float ft = 1.0 - clamp(dot(geometryNormal, geometryViewDir), 0.0, 1.0);
    mIrid = 0.5 + 0.5 * cos(6.28318 * (vec3(0.0, 0.33, 0.67) + ft * 1.15 + dot(mObj, vec3(0.35, 0.5, 0.25)) * 0.5 + mSeed));
    mIrid = mix(vec3(1.0), mIrid * 1.2, mStyle > 4.5 && mStyle < 5.5 ? 0.3 : 0.42);
    reflectedLight.indirectSpecular *= mIrid;
    reflectedLight.directSpecular *= mIrid;
    #ifdef USE_CLEARCOAT
    clearcoatSpecularIndirect *= mIrid;
    clearcoatSpecularDirect *= mIrid;
    #endif
  }`,
        )
        .replace(
          '#include <opaque_fragment>',
          `
  // Disco tiles that catch the light for a moment.
  outgoingLight += vec3(mSpark * 3.0);
  float mPx = length(fwidth(mObj));
  #ifdef MARBLE_GLOW
  // Far away (a few pixels across, the diorama on a phone) a marble's glow eases off, so it stays a small glass ball
  // rather than a firefly.
  mGlowK *= 1.0 - 0.4 * smoothstep(0.12, 0.3, mPx);
  #endif
  vec3 mI = normalize(vWP - cameraPosition);
  vec3 mFlakeTint = mix(vec3(1.0), vA.rgb, 0.35);
  if (mGlit) {
    // Glitter on the surface layer (and, for clear marbles, two more layers deep in the glass below).
    vec4 fl = marbleFlake(mObj * 0.985, mPx);
    outgoingLight += mFlakeLight(mI, fl.yzw, 0.08) * mFlakeTint * fl.x * (mOpaque ? 0.7 : 0.85);
  }
  if (!mOpaque) {
    // Refract into the sphere, march the pattern, then see the room through the far side.
    vec3 C0 = vCR.xyz; float R0 = vCR.w;
    vec3 P0 = vWP;
    vec3 I0 = normalize(P0 - cameraPosition);
    vec3 d1 = refract(I0, mN, 0.667);
    float tExit = max(0.0, -2.0 * dot(P0 - C0, d1));
    vec3 roO = mObj;
    vec3 rdO = qrotInv(vQuat, d1);
    float tO = tExit / R0;
    vec3 acc = vec3(0.0);
    float trans = 1.0;
    float dt = tO / uSteps;
    #ifdef MARBLE_GLOW
    // The lit core: light emitted around the middle of the ball and the pattern lit by it, seen through whatever
    // pattern lies in front, so vanes and ribbons stand out against it in their own colors.
    vec3 accG = vec3(0.0);
    vec3 mCoreLit = mix(vec3(1.0), vF.yzw, 0.7);
    #endif
    for (int i = 0; i < 16; i++) {
      if (float(i) >= uSteps || trans < 0.02) break;
      vec3 p = roO + rdO * (dt * (float(i) + 0.5));
      vec4 s = marblePattern(p, mStyle, mSeed);
      float a = 1.0 - exp(-s.a * dt * 0.5);
      acc += trans * a * s.rgb;
      #ifdef MARBLE_GLOW
      // Per marble, so the branch is coherent: by day only Glow-finish marbles pay for it.
      if (mGlowK > 0.001) {
        float pr2 = dot(p, p);
        // The pattern lit by the core, the hot core itself, and a soft glow filling the glass (so a clear or pale
        // marble with little pattern still has a lit middle).
        accG += trans * (a * s.rgb * mCoreLit * 1.8 * exp(-pr2 * 2.0) + dt * vF.yzw * (2.4 * exp(-pr2 * 7.0) + 0.05 * exp(-pr2 * 3.0)));
      }
      #endif
      trans *= 1.0 - a;
    }
    if (mStyle > 9.5 && mStyle < 12.5) {
      vec4 pt = mStyle < 11.5 ? marbleParticles(roO, rdO, tO, mStyle, mSeed) : marbleCracks(roO, rdO, tO, mSeed);
      acc = acc * (1.0 - pt.a) + pt.rgb;
      #ifdef MARBLE_GLOW
      accG = accG * (1.0 - pt.a) + pt.rgb * mCoreLit * 1.1;
      #endif
      trans *= 1.0 - pt.a;
    }
    vec3 Pexit = P0 + d1 * tExit;
    vec3 N2 = normalize(Pexit - C0);
    vec3 d2 = refract(d1, -N2, 1.5);
    if (dot(d2, d2) < 0.01) d2 = reflect(d1, -N2);
    vec3 bg = vec3(0.6, 0.55, 0.5);
    #ifdef ENVMAP_TYPE_CUBE_UV
      bg = textureCubeUV(envMap, envMapRotation * d2, mFrost ? 0.6 : 0.05).rgb * envMapIntensity;
    #endif
    if (uSceneOn > 0.5) {
      // The rendered scene seen through the ball: follow the exit ray a little way and look it up on screen.
      // A solid glass sphere flips the image, exactly as here.
      vec3 Pfar = Pexit + d2 * (1.5 + R0 * 6.0);
      vec4 clip = projectionMatrix * viewMatrix * vec4(Pfar, 1.0);
      vec2 suv = clip.xy / max(clip.w, 1e-3) * 0.5 + 0.5;
      // The image is last frame's and includes this marble, so keep the lookup outside its own disc on screen.
      vec4 cc = projectionMatrix * viewMatrix * vec4(C0, 1.0);
      float cw = max(cc.w, 1e-3);
      vec2 cuv = cc.xy / cw * 0.5 + 0.5;
      vec2 rad = vec2(projectionMatrix[0][0], projectionMatrix[1][1]) * R0 * 0.5 / cw;
      vec2 e = (suv - cuv) / rad;
      float el = length(e);
      if (el < 1.3) suv = cuv + (el > 1e-4 ? e / el : vec2(0.0, -1.0)) * 1.3 * rad;
      float inScreen = step(0.0, clip.w) * step(0.001, suv.x) * step(suv.x, 0.999) * step(0.001, suv.y) * step(suv.y, 0.999);
      vec3 scr = textureLod(uScene, clamp(suv, 0.001, 0.999), mFrost ? 4.5 : 1.0).rgb;
      // Frosted glass blurs the room behind it; without mips the sharp image would show through, so mostly env.
      bg = mix(bg, scr, inScreen * (mFrost ? (uSceneOn > 1.5 ? 0.65 : 0.15) : 0.9));
    }
    float cosV = clamp(dot(-I0, mN), 0.0, 1.0);
    float F = 0.04 + 0.96 * pow(1.0 - cosV, 5.0);
    // Light the interior pattern by the light actually reaching this marble.
    vec3 lit = clamp(iblIrradiance * RECIPROCAL_PI * 0.95, vec3(0.2), vec3(1.6));
    vec3 inside = acc * lit + trans * bg * vG.rgb * 0.94;
    if (mFrost) {
      // Frosted: light scatters in the roughened skin, so the room behind blurs away and the inside turns milky.
      inside = mix(inside, (acc * 0.6 + vG.rgb * 0.45) * lit, 0.26);
    } else if (mPearl) {
      // Pearl: a faint opalescent glow in the glass, strongest toward the rim.
      inside += mIrid * lit * vG.rgb * (0.07 + 0.24 * pow(1.0 - cosV, 2.0));
    } else if (mGlit) {
      // Flakes suspended deeper in the glass, seen through the pattern in front of them.
      for (int k = 0; k < 2; k++) {
        if (k == 1 && uSteps < 7.0) break;
        float depth = k == 0 ? 0.3 : 0.62;
        vec4 fl = marbleFlake(roO + rdO * (tO * depth), mPx * 1.15);
        inside += mFlakeLight(d1, fl.yzw, 0.1) * mFlakeTint * fl.x * mix(1.0, trans, 0.6) * (0.65 - 0.2 * float(k));
      }
    }
    if (mStyle > 5.5 && mStyle < 6.5) {
      // Thin-film rainbow on the oil slick.
      vec3 film = 0.5 + 0.5 * cos(6.28318 * (vec3(0.0, 0.33, 0.67) + (1.0 - cosV) * 1.6 + mSeed));
      inside += film * 0.55 * (1.0 - cosV * 0.5);
    }
    #ifdef MARBLE_GLOW
    if (mGlowK > 0.001) inside += marbleGlowInside(accG, trans, cosV, mFrost, mPearl, mGlit, mIrid, roO, rdO, tO, mPx) * mGlowK;
    #endif
    outgoingLight += inside * (1.0 - F) * (1.0 + vG.w);
  }
  #ifdef MARBLE_GLOW
  else if (mGlowK > 0.001) outgoingLight += marbleGlowOpaque(diffuseColor.rgb, mStyle, mMetal, geometryNormal, geometryViewDir) * mGlowK;
  #endif
  #include <opaque_fragment>`,
        );
    };
    mat.customProgramCacheKey = () => 'marble-v10';
    mat.defines = mat.defines || {};
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = false;
    this.mesh.count = MAX;
    scene.add(this.mesh);
    this.items = new Array(MAX).fill(null).map(() => ({ q: new THREE.Quaternion(), skin: -1, style: 0, visible: false }));
    this.glowFin = new Uint8Array(MAX);
    this.pools = null;
    // At night the followed marble carries a real light (night.js), so it casts no fake pool.
    this.poolSkip = -1;
    this.poolBoost = -1;
    this.m4 = new THREE.Matrix4();
    this.dq = new THREE.Quaternion();
    this.v3 = new THREE.Vector3();
    this.s3 = new THREE.Vector3();
    this.zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < MAX; i++) this.mesh.setMatrixAt(i, this.zero);
    this.buildDecals(scene);
  }

  // Under every marble: a soft contact shadow, and for glass marbles the bright caustic a glass ball focuses
  // into the middle of its own shadow.
  buildDecals(scene) {
    const plane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.dAlpha = new Float32Array(MAX);
    this.dColor = new Float32Array(MAX * 3);
    const mk = (attrName, arr, size) => new THREE.InstancedBufferAttribute(arr, size).setUsage(THREE.DynamicDrawUsage);
    const shadowGeo = plane.clone();
    this.attrDA = mk('aAlpha', this.dAlpha, 1);
    shadowGeo.setAttribute('aAlpha', this.attrDA);
    const vert = /* glsl */ `
      attribute float aAlpha; attribute vec3 aCol; varying vec2 vUv; varying float vA; varying vec3 vCol;
      void main() { vUv = uv; vA = aAlpha; vCol = aCol; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`;
    const shadowMat = new THREE.ShaderMaterial({
      vertexShader: vert.replace('vCol = aCol;', 'vCol = vec3(0.0);').replace('attribute vec3 aCol;', ''),
      fragmentShader: /* glsl */ `varying vec2 vUv; varying float vA;
        void main() { float d = length(vUv - 0.5) * 2.0; float a = pow(max(0.0, 1.0 - d), 2.2) * vA; gl_FragColor = vec4(0.0, 0.0, 0.0, a); }`,
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.shadowDecals = new THREE.InstancedMesh(shadowGeo, shadowMat, MAX);
    this.shadowDecals.frustumCulled = false;
    this.shadowDecals.renderOrder = 2;
    const causticGeo = plane.clone();
    this.attrDC = mk('aCol', this.dColor, 3);
    causticGeo.setAttribute('aCol', this.attrDC);
    causticGeo.setAttribute('aAlpha', this.attrDA);
    const causticMat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: /* glsl */ `varying vec2 vUv; varying float vA; varying vec3 vCol;
        void main() {
          vec2 p = (vUv - 0.5) * 2.0;
          float d = length(p * vec2(1.0, 1.35));
          float core = exp(-d * d * 14.0);
          float ring = exp(-pow((d - 0.5) * 7.0, 2.0)) * 0.12;
          gl_FragColor = vec4(vCol * (core * 0.9 + ring) * vA, 1.0);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    });
    this.causticDecals = new THREE.InstancedMesh(causticGeo, causticMat, MAX);
    this.causticDecals.frustumCulled = false;
    this.causticDecals.renderOrder = 3;
    for (let i = 0; i < MAX; i++) {
      this.shadowDecals.setMatrixAt(i, this.zero);
      this.causticDecals.setMatrixAt(i, this.zero);
    }
    scene.add(this.shadowDecals);
    scene.add(this.causticDecals);
    this.decalAlpha = new Float32Array(MAX);
    this.dq2 = new THREE.Quaternion();
    this.dm = new THREE.Matrix4();
    this.dv = new THREE.Vector3();
    this.ds = new THREE.Vector3();
    this.pv = new THREE.Vector3();
  }

  // grounded: 0..1. sun: THREE.Vector3 toward the sun.
  // n: optional floor normal [x, y, z] for the night light pool.
  placeDecal(i, x, y, z, r, grounded, sun, dt, n = null) {
    const k = 1 - Math.exp(-dt * 14);
    this.decalAlpha[i] += (grounded - this.decalAlpha[i]) * k;
    const a = this.decalAlpha[i];
    if (this.pools && this.night) this.placePool(i, x, y - r + 0.03, z, r, i === this.poolSkip ? 0 : a, n, i === this.poolBoost);
    if (a < 0.02) {
      this.shadowDecals.setMatrixAt(i, this.zero);
      this.causticDecals.setMatrixAt(i, this.zero);
      return;
    }
    const gy = y - r + 0.03;
    this.dalpha(i, a);
    this.ds.set(r * 2.3, 1, r * 2.3);
    this.dv.set(x, gy, z);
    this.dq2.identity();
    this.dm.compose(this.dv, this.dq2, this.ds);
    this.shadowDecals.setMatrixAt(i, this.dm);
    const it = this.items[i];
    const opaque = it.style === 3 || it.style === 5 || it.style === 9;
    if (opaque || sun.y < 0.05) {
      this.causticDecals.setMatrixAt(i, this.zero);
      return;
    }
    // The ball's shadow center lies away from the sun; the caustic sits inside it, stretched along the light.
    const off = r / Math.max(0.3, sun.y);
    const hx = -sun.x, hz = -sun.z;
    const hl = Math.hypot(hx, hz) || 1;
    this.dv.set(x + (hx / hl) * off * Math.hypot(sun.x, sun.z) * 0.95, gy + 0.005, z + (hz / hl) * off * Math.hypot(sun.x, sun.z) * 0.95);
    this.dq2.setFromAxisAngle(this.upAxis || (this.upAxis = new THREE.Vector3(0, 1, 0)), Math.atan2(hx, hz));
    this.ds.set(r * 0.85, 1, r * 0.85 * (1 + 0.5 * (1 - sun.y)));
    this.dm.compose(this.dv, this.dq2, this.ds);
    this.causticDecals.setMatrixAt(i, this.dm);
  }

  dalpha(i, a) {
    this.dAlpha[i] = a * 0.55;
  }

  hideDecal(i) {
    this.decalAlpha[i] = 0;
    this.shadowDecals.setMatrixAt(i, this.zero);
    this.causticDecals.setMatrixAt(i, this.zero);
    if (this.pools) {
      this.pools.setMatrixAt(i, this.zero);
      if (i < EXTRA0) this.pBase[i] = this.pA[i] = 0;
    }
  }

  // ---------------------------------------------------------------- LIGHTS OUT

  // Marble i's glow color (linear RGB).
  glowOf(i, out) {
    return out.setRGB(this.aF[i * 4 + 1], this.aF[i * 4 + 2], this.aF[i * 4 + 3]);
  }

  // MARBLE_GLOW is compiled in only at night or while a Glow-finish marble is on show.
  updateGlowDefine() {
    const want = this.night || this.glowCount > 0;
    const has = 'MARBLE_GLOW' in this.mat.defines;
    if (want === has) return;
    if (want) this.mat.defines.MARBLE_GLOW = '';
    else delete this.mat.defines.MARBLE_GLOW;
    this.mat.needsUpdate = true;
  }

  // Night: every marble glows from inside; the caustics (a sun effect) give way to light pools.
  setNight(on) {
    on = !!on;
    if (on === this.night) return;
    this.night = on;
    this.glowUniforms.uGlowNight.value = on ? 1 : 0;
    this.glowUniforms.uGlowFinish.value = on ? GLOW_FINISH_NIGHT : GLOW_FINISH_DAY;
    this.updateGlowDefine();
    this.causticDecals.visible = !on;
    if (on && !this.pools) this.buildPools();
    if (this.pools) {
      this.pools.visible = on;
      if (!on) for (let i = 0; i < MAX; i++) this.pools.setMatrixAt(i, this.zero);
      this.pools.instanceMatrix.needsUpdate = true;
    }
  }

  // Cheap light from the other marbles: a soft disc on the surface under each one, added in proportion to how light
  // that surface is (poolMaterial), in one instanced draw call that replaces the caustics at night.
  buildPools() {
    // A 12-sided disc (radius 0.5, like the quad it replaces) so no fill is spent on the corners.
    const geo = new THREE.CircleGeometry(0.5, 12).rotateX(-Math.PI / 2);
    this.pCol = new Float32Array(MAX * 3);
    this.pA = new Float32Array(MAX);
    this.pBase = new Float32Array(MAX);
    this.pPos = new Float32Array(MAX * 3);
    for (let i = 0; i < EXTRA0; i++) this.poolColor(i);
    this.attrPC = new THREE.InstancedBufferAttribute(this.pCol, 3).setUsage(THREE.DynamicDrawUsage);
    this.attrPA = new THREE.InstancedBufferAttribute(this.pA, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aCol', this.attrPC);
    geo.setAttribute('aAlpha', this.attrPA);
    const mat = poolMaterial(POOL_GAIN);
    this.pools = new THREE.InstancedMesh(geo, mat, MAX);
    this.pools.frustumCulled = false;
    this.pools.renderOrder = 3;
    this.pools.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < MAX; i++) this.pools.setMatrixAt(i, this.zero);
    this.scene.add(this.pools);
  }

  // A marble's pool: its glow color, warmed a little toward white (light on a surface reads less saturated than the
  // glass it shines through).
  poolColor(i) {
    _gc.setRGB(this.aF[i * 4 + 1], this.aF[i * 4 + 2], this.aF[i * 4 + 3]).lerp(WARM_WHITE, 0.3);
    this.pCol[i * 3] = _gc.r;
    this.pCol[i * 3 + 1] = _gc.g;
    this.pCol[i * 3 + 2] = _gc.b;
  }

  // Pools for the night props (lamp on `low`, fairy lights), in the slots after the 50 marbles: same draw call.
  // list: [{ x, y, z, w, col: THREE.Color, k }].
  setExtraPools(list) {
    if (!this.pools) {
      if (!list.length) return;
      this.buildPools();
    }
    for (let j = 0; j < MAX - EXTRA0; j++) {
      const i = EXTRA0 + j, pl = list[j];
      if (!pl) {
        this.pools.setMatrixAt(i, this.zero);
        this.pA[i] = 0;
        continue;
      }
      this.ds.set(pl.w, 1, pl.w);
      this.dv.set(pl.x, pl.y + 0.02, pl.z);
      this.dq2.identity();
      this.dm.compose(this.dv, this.dq2, this.ds);
      this.pools.setMatrixAt(i, this.dm);
      this.pCol[i * 3] = pl.col.r * pl.k;
      this.pCol[i * 3 + 1] = pl.col.g * pl.k;
      this.pCol[i * 3 + 2] = pl.col.b * pl.k;
      this.pA[i] = 1;
    }
    this.attrPC.needsUpdate = true;
    this.attrPA.needsUpdate = true;
    this.pools.instanceMatrix.needsUpdate = true;
  }

  extraPoolAlpha(j, a) {
    if (this.pools && EXTRA0 + j < MAX) this.pA[EXTRA0 + j] = a;
  }

  // n: the floor normal under the marble (or null for flat): the disc lies on slopes, bowls and banks instead of
  // cutting through them.
  // boost: the followed marble on `low`, which has no real light: a pool half as big again and brighter.
  placePool(i, x, gy, z, r, a, n, boost = false) {
    if (boost) a *= 1.8;
    this.pBase[i] = a;
    if (a < 0.02) {
      this.pA[i] = 0;
      this.pools.setMatrixAt(i, this.zero);
      return;
    }
    // A flat disc can only lie on a flat floor: on a slope, a bank or a bowl (almost always curved here) it would cut
    // into the surface along a hard line, so it shrinks there to what the curve can hold.
    const w = r * POOL_SIZE * (n && n[1] < 0.95 ? 0.3 : n && n[1] < 0.985 ? 0.5 : 1) * (boost ? 1.5 : 1);
    this.ds.set(w, 1, w);
    this.dv.set(x, gy + 0.008, z);
    if (n) {
      this.pv.set(n[0], n[1], n[2]);
      this.dq2.setFromUnitVectors(UP, this.pv);
      // The disc's center sits on the contact point under the marble, below its center along the normal.
      const rr = r - 0.03;
      this.dv.set(x - n[0] * rr, gy + r - 0.03 - n[1] * rr + 0.008, z - n[2] * rr);
    } else this.dq2.identity();
    this.dm.compose(this.dv, this.dq2, this.ds);
    this.pools.setMatrixAt(i, this.dm);
    this.pPos[i * 3] = x;
    this.pPos[i * 3 + 1] = gy;
    this.pPos[i * 3 + 2] = z;
  }

  // In a pack the pools overlap many deep: scale each by 1/sqrt(1 + 0.35 * neighbors) so a crowd lights the floor
  // more than one marble does, without washing it out.
  packPools() {
    const P = this.pPos, B = this.pBase;
    for (let i = 0; i < EXTRA0; i++) {
      if (B[i] < 0.02) continue;
      let n = 0;
      for (let j = 0; j < EXTRA0; j++) {
        if (j === i || B[j] < 0.02) continue;
        const dx = P[j * 3] - P[i * 3], dy = P[j * 3 + 1] - P[i * 3 + 1], dz = P[j * 3 + 2] - P[i * 3 + 2];
        if (dx * dx + dy * dy + dz * dz < 6.25) n++;
      }
      this.pA[i] = B[i] / Math.sqrt(1 + 0.35 * n);
    }
  }

  // look: an optional workshop look (shared/looks.js) recoloring the skin and setting its finish.
  setSkin(i, skinIndex, seed = i * 0.137, look = null) {
    const it = this.items[i];
    const s = lookedSkin(SKINS[skinIndex] || SKINS[0], look);
    it.skin = skinIndex;
    it.style = s.style;
    const c = new THREE.Color();
    const put = (arr, hex, w) => {
      c.set(hex);
      arr[i * 4] = c.r;
      arr[i * 4 + 1] = c.g;
      arr[i * 4 + 2] = c.b;
      arr[i * 4 + 3] = w;
    };
    put(this.aA, s.a, s.style);
    put(this.aB, s.b, (seed * 0.618) % 1);
    put(this.aC, s.c, 0);
    put(this.aG, s.glass, 0);
    this.aF[i * 4] = s.finish;
    const gc = glowColor(s, c);
    this.aF[i * 4 + 1] = gc.r;
    this.aF[i * 4 + 2] = gc.g;
    this.aF[i * 4 + 3] = gc.b;
    this.attrF.needsUpdate = true;
    const glowFin = s.finish === GLOW_FINISH;
    if (glowFin !== !!this.glowFin[i]) {
      this.glowFin[i] = glowFin ? 1 : 0;
      this.glowCount += glowFin ? 1 : -1;
      this.updateGlowDefine();
    }
    if (this.pools && i < EXTRA0) {
      this.poolColor(i);
      this.attrPC.needsUpdate = true;
    }
    if (this.dColor) {
      // Caustic tint: mostly the glass, a little of the pattern color. Frosted glass scatters most of it away.
      const g = new THREE.Color(s.glass).lerp(new THREE.Color(s.a), 0.35);
      const k = s.finish === 1 ? 0.8 : 1.8;
      this.dColor[i * 3] = g.r * k;
      this.dColor[i * 3 + 1] = g.g * k;
      this.dColor[i * 3 + 2] = g.b * k;
      this.attrDC.needsUpdate = true;
    }
    this.attrA.needsUpdate = this.attrB.needsUpdate = this.attrC.needsUpdate = this.attrG.needsUpdate = true;
  }

  setGhost(i, on) {
    const v = on ? 1 : 0;
    if (this.aC[i * 4 + 3] !== v) {
      this.aC[i * 4 + 3] = v;
      this.attrC.needsUpdate = true;
    }
  }

  setGlow(i, g) {
    if (Math.abs(this.aG[i * 4 + 3] - g) > 0.01) {
      this.aG[i * 4 + 3] = g;
      this.attrG.needsUpdate = true;
    }
  }

  // Rolls marble i along velocity (vx, vz) over dt and places it at (x, y, z) with radius r.
  place(i, x, y, z, r, vx, vy, vz, dt, rolling) {
    const it = this.items[i];
    if (rolling) {
      const sp = Math.hypot(vx, vz);
      if (sp > 0.01) {
        const ang = (sp * dt) / r;
        this.v3.set(vz / sp, 0, -vx / sp);
        this.dq.setFromAxisAngle(this.v3, ang);
        it.q.premultiply(this.dq).normalize();
      }
    }
    this.s3.set(r, r, r);
    this.v3.set(x, y, z);
    this.m4.compose(this.v3, it.q, this.s3);
    this.mesh.setMatrixAt(i, this.m4);
    this.aQ[i * 4] = it.q.x;
    this.aQ[i * 4 + 1] = it.q.y;
    this.aQ[i * 4 + 2] = it.q.z;
    this.aQ[i * 4 + 3] = it.q.w;
    it.visible = true;
  }

  hide(i) {
    const it = this.items[i];
    if (!it.visible) return;
    it.visible = false;
    this.mesh.setMatrixAt(i, this.zero);
    this.hideDecal(i);
  }

  commit(time) {
    this.uniforms.uTime.value = time;
    if (this.pools && this.night) {
      this.packPools();
      this.pools.instanceMatrix.needsUpdate = true;
      this.attrPA.needsUpdate = true;
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.shadowDecals.instanceMatrix.needsUpdate = true;
    this.causticDecals.instanceMatrix.needsUpdate = true;
    this.attrDA.needsUpdate = true;
    this.attrQ.needsUpdate = true;
  }
}
