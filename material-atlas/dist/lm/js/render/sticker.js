import * as THREE from 'three';
// Sticker and halo shader from Lost Marbles render/night.js.
export function stickerMaterial() {
  // Instances: aShape 0 a round dot, 1 a five-point star, 2 a crescent moon (glow-in-the-dark stickers, in the pale
  // green of phosphor paint, kept under the bloom threshold so they read as stickers, not lamps), 3 the soft halo of a
  // fairy bulb in its own color (aCol). Drawn additively, leaving the frame's alpha (the pools' albedo channel) alone.
  return new THREE.ShaderMaterial({
    uniforms: {},
    vertexShader: /* glsl */ `
      attribute float aShape; attribute vec3 aCol; varying vec2 vUv; varying float vShape; varying vec3 vCol;
      void main() { vUv = uv; vShape = aShape; vCol = aCol; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv; varying float vShape; varying vec3 vCol;
      // Signed distance to a five-point star (after Inigo Quilez).
      float star5(vec2 p, float r, float rf) {
        const vec2 k1 = vec2(0.809016994375, -0.587785252292);
        const vec2 k2 = vec2(-k1.x, k1.y);
        p.x = abs(p.x);
        p -= 2.0 * max(dot(k1, p), 0.0) * k1;
        p -= 2.0 * max(dot(k2, p), 0.0) * k2;
        p.x = abs(p.x);
        p.y -= r;
        vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);
        float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
        return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
      }
      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        if (vShape > 2.5) {
          float g = max(0.0, 1.0 - dot(p, p));
          gl_FragColor = vec4(vCol * g * g * g * 0.8, 0.0);
          return;
        }
        float d = vShape < 0.5 ? length(p) - 0.8 : vShape < 1.5 ? star5(p, 0.9, 0.45) : max(length(p) - 0.85, -(length(p - vec2(0.38, 0.22)) - 0.72));
        // Soft printed edge, a little brighter toward the middle.
        float px = fwidth(d) + 0.04;
        float a = 1.0 - smoothstep(-px, px, d);
        if (a < 0.01) discard;
        gl_FragColor = vec4(vCol * (0.8 + 0.3 * (1.0 - length(p))) * a, 0.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
}
