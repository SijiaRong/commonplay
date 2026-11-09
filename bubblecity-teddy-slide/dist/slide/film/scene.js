// Daylight post pipeline adapted from the locally captured Lost Marbles render/scene.js.
// Renderer, camera, sun and the post pipeline. The look is a macro photograph of a real toy:
//   scene (linear HDR, MSAA, depth) -> ground-truth ambient occlusion -> tilt-shift lens (depth of field focused
//   on the marble you follow, with the plane of focus tilted into a thin band across the frame) -> bloom ->
//   filmic grade (AgX, white balance, contrast, grain, vignette, lens fringing).
// Quality presets trade those passes off and the renderer steps down automatically when frames run long.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';

export const QUALITY = {
  // dof: largest blur (px at 1080p) and the spiral step; a bigger step means fewer taps (about max^2 / 2step).
  // half: blur at half resolution and blend it over the sharp frame by focus, a quarter of the cost.
  high: { pixelRatio: 1.5, shadow: 4096, shadowSpan: 50, msaa: 4, ao: true, dof: { max: 16, step: 2.2 }, bloom: true },
  medium: { pixelRatio: 1.25, shadow: 2048, shadowSpan: 50, msaa: 4, ao: false, dof: { max: 15, step: 2.4, half: true }, bloom: true },
  // shadowEvery: redraw the sun's shadow map every Nth frame (see render()).
  low: { pixelRatio: 1, shadow: 1024, shadowSpan: 42, shadowEvery: 2, msaa: 0, ao: false, dof: { max: 10, step: 2.8, half: true }, bloom: false },
};

const VERT = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// Single-pass gather bokeh (after Dennis Gustafsson): samples on a golden-angle spiral, each weighted by
// whether its own circle of confusion reaches the center pixel, so sharp foreground never smears.
//
// Tilt-shift: a shifted, tilted lens turns the plane of focus so it cuts the scene in a thin band, and the
// world reads as a miniature. Here the circle of confusion is the larger of the ordinary depth term and a
// tilt term that grows with screen distance from a band through the subject (wider ahead of the marble than
// below it, so the track you're heading into stays readable). Both feed the same occlusion-aware gather, so
// a sharp marble never bleeds and blurred foreground smears over the band the way a real lens does.
// Toward the corners the bokeh discs are clipped into cat's eyes (optical vignetting), as on a fast lens.
// Taps read a mip level matched to their spacing and the spiral is rotated per pixel, so even a wide blur
// with few taps comes out as smooth bokeh rather than stacked copies of the sharp image.
// Lowest dynamic-resolution scale (of the quality's pixel ratio).
const RES_MIN = 0.65;
const DOF_FRAG = /* glsl */ `
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform vec2 uTexel;
  uniform float uFocus;
  uniform vec2 uClearRange;
  uniform float uAperture;
  uniform float uFgK;      // foreground blur relative to background (gentler in the chase view)
  uniform float uMaxBlur;
  uniform float uNear;
  uniform float uFar;
  uniform float uRadScale;
  uniform vec4 uTilt;      // band center (ndc y), sharp half-width, tilt blur (px), band roll (radians)
  uniform vec2 uTiltSpan;  // ramp length above / below the band (ndc)
  uniform float uAspect;
  uniform float uCatEye;
  uniform float uLod;
  varying vec2 vUv;
  float linDepth(float d) {
    float z = d * 2.0 - 1.0;
    return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear));
  }
  float tiltCoc(vec2 uv) {
    vec2 p = uv * 2.0 - 1.0;
    // Distance across the band, measured perpendicular to its (slightly rolled) axis.
    float d = (p.y - uTilt.x) * cos(uTilt.w) - p.x * uAspect * sin(uTilt.w);
    float t = d > 0.0 ? (d - uTilt.y) / uTiltSpan.x : (-d - uTilt.y) / uTiltSpan.y;
    t = clamp(t, 0.0, 1.0);
    return uTilt.z * t * t * (3.0 - 2.0 * t);
  }
  float coc(float z, vec2 uv) {
    // Foreground blur is kept gentler than background blur so walls brushing past the lens don't smear the view.
    float k = z < uFocus ? uFgK : 1.0;
    float c = uAperture * k * abs(1.0 / uFocus - 1.0 / z);
    float fade = smoothstep(uClearRange.x, uClearRange.y, z);
    return fade * clamp(max(c, tiltCoc(uv)), 0.0, uMaxBlur);
  }
  void main() {
    float cz = linDepth(texture2D(tDepth, vUv).x);
    float cs = coc(cz, vUv);
    vec3 col = textureLod(tColor, vUv, 0.0).rgb;
    if (cz <= uClearRange.x) { gl_FragColor = vec4(col, 0.0); return; }
    float tot = 1.0;
    // Interleaved gradient noise: a different spiral rotation and start radius for every pixel.
    float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    float radius = uRadScale * (0.5 + n);
    float ang = n * 6.2831853;
    vec2 cat = (vUv - 0.5) * vec2(uAspect, 1.0) * uCatEye;
    for (int i = 0; i < 160; i++) {
      if (radius >= uMaxBlur) break;
      vec2 dir = vec2(cos(ang), sin(ang));
      vec2 tc = vUv + dir * uTexel * radius;
      vec3 sc = textureLod(tColor, tc, uLod).rgb;
      float sz = linDepth(texture2D(tDepth, tc).x);
      float ss = coc(sz, tc);
      if (sz > cz) ss = clamp(ss, 0.0, cs * 2.0);
      float m = smoothstep(radius - 0.5, radius + 0.5, ss);
      // Cat's-eye bokeh: the sample's disc is the overlap of two circles, the second pushed toward the edge.
      m *= 1.0 - smoothstep(ss - 0.5, ss + 0.5, length(dir * radius + cat * ss));
      col += mix(col / tot, sc, m);
      tot += 1.0;
      radius += uRadScale / radius;
      ang += 2.39996323;
    }
    // Alpha: how far this pixel is out of focus, used to blend a half-resolution blur over the sharp frame. It ramps
    // in only once the blur is a few pixels wide, where the half-resolution image no longer shows its own pixels.
    gl_FragColor = vec4(col / tot, clamp((cs - 1.0) / 2.5, 0.0, 1.0));
  }`;

const GRADE_FRAG = /* glsl */ `
  #include <common>
  #include <tonemapping_pars_fragment>
  uniform sampler2D tColor;
  uniform sampler2D tBlur;
  uniform sampler2D tDepth;
  uniform float uClearDepth;
  uniform float uHalf;
  uniform vec2 uBlurTexel;
  uniform float uTime;
  uniform float uVignette;
  uniform float uGrain;
  uniform float uFringe;
  uniform float uMini;
  uniform vec2 uRes;
  varying vec2 vUv;
  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  vec3 srgb(vec3 c) {
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  }
  void main() {
    vec2 d = vUv - 0.5;
    // Lateral chromatic aberration toward the frame edges, like a real lens.
    vec2 off = d * dot(d, d) * uFringe;
    vec3 c;
    c.r = texture2D(tColor, vUv - off).r;
    c.g = texture2D(tColor, vUv).g;
    c.b = texture2D(tColor, vUv + off).b;
    if (uHalf > 0.5 && texture2D(tDepth, vUv).x > uClearDepth) {
      // Four bilinear taps (a tent filter) so the half-resolution blur upsamples smoothly instead of in blocks.
      vec2 h = uBlurTexel * 0.5;
      vec4 b = 0.25 * (texture2D(tBlur, vUv + vec2(-h.x, -h.y)) + texture2D(tBlur, vUv + vec2(h.x, -h.y))
        + texture2D(tBlur, vUv + vec2(-h.x, h.y)) + texture2D(tBlur, vUv + vec2(h.x, h.y)));
      c = mix(c, b.rgb, b.a);
    }
    // Warm afternoon white balance before the film curve.
    c *= vec3(1.04, 1.0, 0.95);
    c = AgXToneMapping(c);
    // Gentle S-curve and a touch of saturation back (AgX is neutral by design).
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    // Miniature photographs read as toys partly through richer color and contrast; uMini follows the tilt.
    c = mix(vec3(l), c, 1.12 + 0.1 * uMini);
    c = clamp(c, 0.0, 1.0);
    c = c * c * (3.0 - 2.0 * c) * (0.32 + 0.1 * uMini) + c * (0.68 - 0.1 * uMini);
    // Optical vignette.
    float v = smoothstep(1.05, 0.25, length(d * vec2(uRes.x / uRes.y, 1.0) * 0.82));
    c *= mix(1.0, v, uVignette);
    vec3 o = srgb(clamp(c, 0.0, 1.0));
    // Film grain in display space, strongest in the mids.
    float g = hash12(vUv * uRes + fract(uTime * 37.0) * 97.0) - 0.5;
    o += g * uGrain * (1.0 - abs(o - 0.5) * 1.2);
    gl_FragColor = vec4(o, 1.0);
  }`;

export class Scene3D {
  constructor(canvas, quality = 'high') {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, depth: true });
    const r = this.renderer;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NoToneMapping;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#d9d2c6');
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.3, 2400);
    this.camera.position.set(0, 120, 200);

    // Window sun, matched to the bright window of the room photograph (see env.js).
    this.sunDir = new THREE.Vector3(0.62, 0.62, 0.48).normalize();
    this.sun = new THREE.DirectionalLight('#fff1dc', 2.12);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.00025;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.focus = new THREE.Vector3();
    this.focusDist = 10;
    this.focusTarget = 10;
    this.aperture = 1;
    // Tilt-shift band: current and target values, eased like a lens being adjusted.
    this.tilt = { y: -0.2, core: 0.2, amt: 0, roll: 0, yT: -0.2, coreT: 0.2, amtT: 0, rollT: 0, up: 0.85, down: 0.5 };
    this.tiltPref = 1; // user setting: 0 off, 1 on, 1.4 strong
    this.quality = null;
    this.resScale = 1;
    this.time = 0;
    this.exposure = 1.0;
    this.fsq = new FullScreenQuad(null);
    this.dofMat = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: null }, tDepth: { value: null }, uTexel: { value: new THREE.Vector2() }, uFocus: { value: 10 },
        uClearRange: { value: new THREE.Vector2() }, uAperture: { value: 100 }, uFgK: { value: 0.45 }, uMaxBlur: { value: 14 }, uNear: { value: 0.3 }, uFar: { value: 2400 }, uRadScale: { value: 2 },
        uTilt: { value: new THREE.Vector4(-0.2, 0.2, 0, 0) }, uTiltSpan: { value: new THREE.Vector2(0.85, 0.5) }, uAspect: { value: 1 },
        uCatEye: { value: 0.55 }, uLod: { value: 1 },
      },
      vertexShader: VERT, fragmentShader: DOF_FRAG, depthTest: false, depthWrite: false,
    });
    this.gradeMat = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: null }, tBlur: { value: null }, tDepth: { value: null }, uClearDepth: { value: -1 }, uHalf: { value: 0 }, uBlurTexel: { value: new THREE.Vector2(1, 1) }, toneMappingExposure: { value: 1 }, uTime: { value: 0 }, uVignette: { value: 0.55 },
        uGrain: { value: 0.035 }, uFringe: { value: 0.006 }, uMini: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) },
      },
      vertexShader: VERT, fragmentShader: GRADE_FRAG, depthTest: false, depthWrite: false,
    });
    this.setQuality(quality);
    window.addEventListener('resize', () => this.resize());
    this.frameTimes = [];
    this.lastResChange = performance.now();
    this.upWait = 4000;
    this.adaptive = true;
    this.lastDowngrade = performance.now();
    this.onQualityChange = null;
    this.autoQuality = true;
    // Frame budget the dynamic resolution aims for (seconds; 1/30 when the frame rate is capped at 30).
    this.frameBudget = 1 / 60;
    // Called once when even the lowest preset at the lowest resolution stays slow (main.js may cap at 30 fps).
    this.onSustainedSlow = null;
    this.slowStrikes = 0;
    // null: per preset; 1 forces a shadow redraw every frame (?shadow=full).
    this.shadowEveryOverride = null;
    this.frameNo = 0;
    this.shadowFocus = new THREE.Vector3(Infinity, 0, 0);
    this._v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  }

  get Q() {
    return QUALITY[this.quality];
  }

  setQuality(q) {
    if (!QUALITY[q]) q = 'medium';
    if (q === this.quality) return;
    this.quality = q;
    // The shadow map is recreated below: force a redraw on the next frame, whatever its parity.
    if (this.shadowFocus) this.shadowFocus.set(Infinity, 0, 0);
    const Q = QUALITY[q];
    const r = this.renderer;
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.pixelRatio) * this.resScale);
    const s = this.sun.shadow;
    if (s.map) {
      s.map.dispose();
      s.map = null;
    }
    s.mapSize.set(Q.shadow, Q.shadow);
    const span = Q.shadowSpan;
    Object.assign(s.camera, { left: -span, right: span, top: span, bottom: -span, near: 1, far: 700 });
    s.camera.updateProjectionMatrix();
    s.radius = q === 'low' ? 1 : 2.5;
    this.buildTargets();
  }

  buildTargets() {
    const Q = this.Q;
    for (const t of [this.sceneRT, this.rtA, this.rtB, this.rtDof]) if (t) t.dispose();
    if (this.gtao) this.gtao.dispose();
    if (this.bloom) this.bloom.dispose();
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const w = Math.max(1, size.x), h = Math.max(1, size.y);
    const depth = new THREE.DepthTexture(w, h);
    depth.type = THREE.UnsignedIntType;
    // The depth-of-field source (the scene, or the AO output) keeps mips for the wide bokeh taps.
    const mips = { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter };
    this.sceneRT = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: Q.msaa, depthTexture: depth, ...(Q.ao ? {} : mips) });
    this.rtA = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false, ...(Q.ao ? mips : {}) });
    this.rtB = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false });
    this.rtDof = Q.dof && Q.dof.half ? new THREE.WebGLRenderTarget(Math.ceil(w / 2), Math.ceil(h / 2), { type: THREE.HalfFloatType, depthBuffer: false }) : null;
    this.gtao = null;
    if (Q.ao) {
      const g = new GTAOPass(this.scene, this.camera, Math.ceil(w / 2), Math.ceil(h / 2));
      // Reuse the scene depth: no second geometry pass (normals are rebuilt from depth).
      g.setGBuffer(this.sceneRT.depthTexture);
      g.updateGtaoMaterial({ radius: 1.4, distanceExponent: 1.4, thickness: 1.5, scale: 1.15, samples: 16, distanceFallOff: 1, screenSpaceRadius: false });
      g.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
      g.blendIntensity = 0.9;
      this.gtao = g;
    }
    this.bloom = Q.bloom ? new UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), 0.12, 0.5, 2.2) : null;
    this.resize();
  }

  resize() {
    const w = Math.max(1, this.canvas.clientWidth), h = Math.max(1, this.canvas.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const W = Math.max(1, size.x), H = Math.max(1, size.y);
    if (this.sceneRT && (this.sceneRT.width !== W || this.sceneRT.height !== H)) {
      this.sceneRT.setSize(W, H);
      this.rtA.setSize(W, H);
      this.rtB.setSize(W, H);
      if (this.rtDof) this.rtDof.setSize(Math.ceil(W / 2), Math.ceil(H / 2));
      if (this.gtao) this.gtao.setSize(Math.ceil(W / 2), Math.ceil(H / 2));
      if (this.bloom) this.bloom.setSize(W / 2, H / 2);
    }
    this.dofMat.uniforms.uTexel.value.set(1 / W, 1 / H);
    this.dofMat.uniforms.uAspect.value = W / H;
    this.gradeMat.uniforms.uRes.value.set(W, H);
  }

  // Keeps the shadow frustum centered on what the camera looks at, snapped to texels to avoid shimmer.
  setFocus(x, y, z) {
    this.focus.set(x, y, z);
    const s = this.sun.shadow;
    const span = s.camera.right;
    const texel = (span * 2) / s.mapSize.x;
    const d = this.sunDir;
    const [up, right, up2, snapped] = this._v;
    if (Math.abs(d.y) > 0.99) up.set(1, 0, 0);
    else up.set(0, 1, 0);
    right.crossVectors(up, d).normalize();
    up2.crossVectors(d, right).normalize();
    const f = this.focus;
    const lr = Math.round(f.dot(right) / texel) * texel - f.dot(right);
    const lu = Math.round(f.dot(up2) / texel) * texel - f.dot(up2);
    snapped.copy(f).addScaledVector(right, lr).addScaledVector(up2, lu);
    this.sun.target.position.copy(snapped);
    this.sun.position.copy(snapped).addScaledVector(d, 350);
    this.sun.target.updateMatrixWorld();
  }

  // Focus distance (world units from the camera) for the depth of field; smoothed like a focus puller.
  setFocusDistance(d, aperture = 1, fgK = 0.45) {
    this.fgK = fgK;
    this.focusTarget = Math.max(1, d);
    this.aperture = aperture;
  }

  // Tilt-shift band. y: band center in NDC (-1 bottom .. 1 top), core: half-width kept sharp (NDC),
  // amount: 0 none, 1 race, ~1.6 cinematic; roll tilts the band; up/down: ramp lengths ahead of / below it.
  setTiltShift(y, core, amount, { roll = 0, up = 0.85, down = 0.5 } = {}) {
    const t = this.tilt;
    t.yT = Math.max(-0.95, Math.min(0.95, y));
    t.coreT = core;
    t.amtT = amount;
    t.rollT = roll;
    t.up = up;
    t.down = down;
  }

  // Reproducible stills use the same settled lens and disable temporal grain.
  setFrozen(on) {
    this.frozen = !!on;
  }

  render(dt) {
    if (this.frozen) dt = 0;
    this.time += dt;
    const r = this.renderer;
    const Q = this.Q;
    this.focusDist += (this.focusTarget - this.focusDist) * (1 - Math.exp(-dt * 6));
    const t = this.tilt, kt = 1 - Math.exp(-dt * 5);
    // A big jump (cut to a new shot) snaps the band rather than sweeping it across the frame.
    if (Math.abs(t.yT - t.y) > 0.5) t.y = t.yT;
    t.y += (t.yT - t.y) * kt;
    t.core += (t.coreT - t.core) * kt;
    t.amt += (t.amtT * this.tiltPref - t.amt) * (1 - Math.exp(-dt * 2.5));
    t.roll += (t.rollT - t.roll) * kt;
    this.frameNo++;
    // The sun's shadow map is a second render of the course. On low it is redrawn every other frame: the receivers
    // keep using the matrix it was drawn with, so static shadows stay exactly in place and only moving pieces' shadows
    // trail by a frame (marbles also have contact-shadow decals). A jump of the shadow frustum (a camera cut) redraws
    // at once so no area is ever left without shadows.
    // At a 30 fps cap every frame already counts double, so redraw it every frame there.
    const every = this.shadowEveryOverride || (this.frameBudget > 1 / 45 ? 1 : Q.shadowEvery || 1);
    const sm = r.shadowMap;
    if (every > 1) {
      sm.autoUpdate = false;
      const tp = this.sun.target.position;
      if (this.frameNo % every === 0 || this.shadowFocus.distanceToSquared(tp) > 16) {
        sm.needsUpdate = true;
        this.shadowFocus.copy(tp);
      }
    } else sm.autoUpdate = true;
    const camera = this.camera;
    r.setRenderTarget(this.sceneRT);
    r.clear(true, true, false);
    r.render(this.scene, camera);
    let src = this.sceneRT;
    if (this.gtao) {
      this.gtao.render(r, this.rtA, this.sceneRT);
      src = this.rtA;
    }
    const lens = this.lens;
    const dofActive = Q.dof && (!lens || (lens.enabled && (lens.strength > 0 || lens.tilt > 0)));
    if (dofActive) {
      const u = this.dofMat.uniforms;
      const H = this.sceneRT.height;
      u.tColor.value = src.texture;
      u.tDepth.value = this.sceneRT.depthTexture;
      u.uFocus.value = this.focusDist;
      const clear = lens?.distance ?? 0;
      u.uClearRange.value.set(clear, clear + (lens?.transition ?? 0.01));
      // Blur scales with resolution so the look is the same at any size.
      const px = H / 1080;
      u.uMaxBlur.value = Q.dof.max * px;
      u.uAperture.value = 125 * this.aperture * px * ((lens?.strength ?? 100) / 100);
      u.uFgK.value = this.fgK ?? 0.45;
      u.uRadScale.value = Q.dof.step * Math.max(1, px);
      // Each tap covers about 2*pi*step square pixels of the disc; read the mip whose texel matches that spacing.
      u.uLod.value = Math.max(0, Math.log2(Math.sqrt(2 * Math.PI * u.uRadScale.value)) - 0.5);
      u.uTilt.value.set(t.y, t.core, Math.min(Q.dof.max, 11 * t.amt * ((lens?.tilt ?? 100) / 100)) * px, t.roll);
      u.uTiltSpan.value.set(t.up, t.down);
      u.uNear.value = camera.near;
      u.uFar.value = camera.far;
      const dst = this.rtDof || (src === this.rtA ? this.rtB : this.rtA);
      this.fsq.material = this.dofMat;
      r.setRenderTarget(dst);
      this.fsq.render(r);
      if (!this.rtDof) src = dst;
    }
    if (this.bloom) this.bloom.render(r, null, src, dt, false);
    const g = this.gradeMat.uniforms;
    g.tColor.value = src.texture;
    g.tBlur.value = dofActive && this.rtDof ? this.rtDof.texture : null;
    g.uHalf.value = dofActive && this.rtDof ? 1 : 0;
    if (dofActive && this.rtDof) {
      // Test the original depth when upsampling so a distant blurred pixel cannot cover a nearby silhouette.
      const clear = lens?.distance ?? 0;
      g.tDepth.value = this.sceneRT.depthTexture;
      g.uClearDepth.value = clear > 0 ? camera.far * (clear - camera.near) / (clear * (camera.far - camera.near)) : -1;
      g.uBlurTexel.value.set(1 / this.rtDof.width, 1 / this.rtDof.height);
    }
    g.toneMappingExposure.value = this.exposure;
    g.uTime.value = this.time;
    g.uMini.value = dofActive ? Math.min(1, t.amt * ((lens?.tilt ?? 100) / 100)) : 0;
    g.uGrain.value = this.frozen ? 0 : this.quality === 'low' ? 0.02 : 0.032;
    this.fsq.material = this.gradeMat;
    r.setRenderTarget(null);
    this.fsq.render(r);
    this.trackPerf(dt);
  }

  // Dynamic resolution: when frames run long (a heavy view, a warm phone throttling its GPU), render fewer pixels,
  // and creep back up once there is headroom. Only at the lowest scale does auto quality drop a whole level.
  trackPerf(dt) {
    if (!this.adaptive) return;
    const ft = this.frameTimes;
    ft.push(Math.min(dt, 0.1));
    if (ft.length > 90) ft.shift();
    const now = performance.now();
    if (ft.length < 90 || now - this.lastResChange < 1500) return;
    // Ignore the slowest tenth (shader compiles, uploads, tab switches): they are hitches, not load.
    const sorted = ft.slice().sort((a, b) => a - b);
    let sum = 0;
    for (let i = 0; i < 81; i++) sum += sorted[i];
    const avg = sum / 81;
    const B = this.frameBudget;
    if (avg <= B * 1.33) this.slowStrikes = 0;
    if (avg > B * 1.2) {
      if (this.resScale > RES_MIN + 0.01) {
        this.setResScale(Math.max(RES_MIN, this.resScale * 0.87));
        this.upWait = Math.min(30000, this.upWait * 2);
      } else if (this.autoQuality && this.quality !== 'low' && now - this.lastDowngrade > 8000) {
        const next = this.quality === 'high' ? 'medium' : 'low';
        this.lastDowngrade = now;
        this.resScale = 0.87;
        this.setQuality(next);
        this.lastResChange = now;
        ft.length = 0;
        if (this.onQualityChange) this.onQualityChange(next);
      } else if (this.onSustainedSlow && (this.quality === 'low' || !this.autoQuality) && avg > B * 1.33) {
        // Nothing left to turn down and still under ~45 fps: two checks in a row and main.js may lock to 30 fps,
        // which paces evenly and runs the phone cooler than an uneven 35-45.
        this.lastResChange = now;
        if (++this.slowStrikes >= 2) {
          const fn = this.onSustainedSlow;
          this.onSustainedSlow = null;
          fn();
        }
      }
    } else if (avg < B * 1.05 && this.resScale < 1 && now - this.lastResChange > this.upWait) {
      this.setResScale(Math.min(1, this.resScale / 0.87));
      this.upWait = Math.max(4000, this.upWait / 2);
    }
  }

  // The frame time the dynamic resolution aims for. adapt false holds the resolution where it is (the throttled
  // menu backdrop says nothing about how a race will run).
  setFrameBudget(seconds, adapt = true) {
    if (seconds !== this.frameBudget || adapt !== this.adaptive) {
      this.frameBudget = seconds;
      this.adaptive = adapt;
      this.frameTimes.length = 0;
      this.lastResChange = performance.now();
    }
  }

  setResScale(k) {
    this.resScale = k;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.Q.pixelRatio) * k);
    this.resize();
    this.lastResChange = performance.now();
    this.frameTimes.length = 0;
  }
}

// Shared scene setup for the slide game and its material editor.
export function createSlideFilm(canvas) {
  const lite = matchMedia('(pointer: coarse)').matches;
  const quality = lite ? 'low' : 'high';
  const film = new Scene3D(canvas, quality);
  film.camera.fov = 49;
  film.camera.updateProjectionMatrix();
  return {film, lite, quality};
}

// Chase-camera lens of game.js:updateCamera/updateTiltShift, with the driver's
// world-space half-height in place of the original 0.55-unit marble radius.
const projectedRider = new THREE.Vector3();
export function focusRider(film, point, radius, mode, snap = false) {
  const camera = film.camera;
  camera.updateMatrixWorld();
  projectedRider.copy(point).project(camera);
  const distance = camera.position.distanceTo(point);
  const projectedRadius = radius / Math.max(1, distance * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  film.setFocus(point.x, point.y, point.z);
  film.setFocusDistance(distance, mode === 'finish' ? 0.55 : 1);
  if (mode === 'finish') {
    film.setTiltShift(projectedRider.y, 0.16, 1.5, { roll: -0.06, up: 0.6, down: 0.45 });
  } else if (mode === 'ready') {
    film.setTiltShift(projectedRider.y, projectedRadius * 1.5 + 0.22, 0.85, { up: 0.8, down: 0.7 });
  } else {
    film.setTiltShift(projectedRider.y, projectedRadius * 1.5 + 0.06, 1, { up: 0.9, down: 0.5 });
  }
  if (snap) {
    film.focusDist = film.focusTarget;
    const tilt = film.tilt;
    tilt.y = tilt.yT;
    tilt.core = tilt.coreT;
    tilt.roll = tilt.rollT;
    tilt.amt = tilt.amtT * film.tiltPref;
  }
}
