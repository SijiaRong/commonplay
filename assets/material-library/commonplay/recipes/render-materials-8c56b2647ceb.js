import * as THREE from 'three';
import { chevronTexture, checkerTexture } from './textures.js';

let cache = null;

// The stage schema retains its original material slots for both generated and baked tracks.
export function getMaterials(quality = 'high') {
  if (cache) return cache;
  const enamel = { vertexColors: true, roughness: 0.33, clearcoat: quality === 'low' ? 0.24 : 0.65,
    clearcoatRoughness: 0.22, envMapIntensity: 0.82 };
  const woodMat = new THREE.MeshPhysicalMaterial({ ...enamel, color: '#fff0d9', roughness: 0.4 });
  const ashMat = new THREE.MeshPhysicalMaterial({ ...enamel, color: '#8cc7b6' });
  const paintMat = new THREE.MeshPhysicalMaterial(enamel);
  const brass = new THREE.MeshStandardMaterial({ color: '#e0ac69', metalness: 0.78, roughness: 0.30 });
  const lamp = new THREE.MeshStandardMaterial({
    color: '#fff1cf', emissive: '#ffc074', emissiveIntensity: 1.4, roughness: 0.28,
  });
  const rubberMat = new THREE.MeshPhysicalMaterial({ roughness: 0.55, metalness: 0, vertexColors: true, sheen: 0.4, sheenRoughness: 0.6, envMapIntensity: 0.9 });
  const chevron = chevronTexture();
  const checker = checkerTexture();
  const boostMat = new THREE.MeshPhysicalMaterial({
    map: chevron, emissive: new THREE.Color('#ff7a00'), emissiveMap: chevron, emissiveIntensity: 0.12, roughness: 0.83, specularIntensity: 0.22, clearcoat: 0.025, clearcoatRoughness: 0.72,
  });
  const checkerMat = new THREE.MeshPhysicalMaterial({ map: checker, roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.2 });
  cache = {
    wood: woodMat, ash: ashMat, paint: paintMat, rubber: rubberMat, boost: boostMat, checker: checkerMat,
    brass, lamp, textures: { chevron, checker },
  };
  return cache;
}

// Material for a visual's `m` key.
export function materialKey(m) {
  if (m === 'wood' || m === 'plank') return 'wood';
  if (m === 'brass' || m === 'lamp') return m;
  if (m === 'ash') return 'ash';
  if (m === 'rubber') return 'rubber';
  if (m === 'boost') return 'boost';
  if (m === 'checker') return 'checker';
  return 'paint';
}

// LIGHTS OUT: at night a material writes its surface's lightness (albedo luminance) into the frame's alpha channel,
// which the fake light pools read (marbles.js, poolMaterial). Only the night variant (the NIGHT_ALBEDO define) has the
// extra line, so day programs are unchanged. `fixed` writes a constant instead (the room photo).
export function setNightAlbedo(mat, on, fixed = null) {
  if (!mat.userData.nightHook) {
    mat.userData.nightHook = true;
    const prev = mat.onBeforeCompile;
    // The day cache key as it was before the hook (the default key is the hook's own source, which changes now).
    const dayKey = mat.customProgramCacheKey();
    mat.onBeforeCompile = (shader, renderer) => {
      if (prev) prev.call(mat, shader, renderer);
      if (!mat.defines || !('NIGHT_ALBEDO' in mat.defines)) return;
      const a = fixed === null ? 'dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722))' : fixed.toFixed(3);
      shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `#include <opaque_fragment>\n  gl_FragColor.a = ${a};`);
    };
    // Keep the day cache key exactly as it was (the define tells the variants apart).
    mat.customProgramCacheKey = () => dayKey;
  }
  mat.defines = mat.defines || {};
  const has = 'NIGHT_ALBEDO' in mat.defines;
  if (!!on === has) return;
  if (on) mat.defines.NIGHT_ALBEDO = '';
  else delete mat.defines.NIGHT_ALBEDO;
  mat.needsUpdate = true;
}
