// Course materials built on scanned wood (Poly Haven, CC0): oak veneer for the track boards, ash for
// blocks and posts. Painted blocks are a translucent stain over the real grain, with a lacquer clearcoat,
// like real children's blocks. Colors come from per-vertex tints baked into the merged geometry.
import * as THREE from 'three';
import { chevronTexture, checkerTexture } from './textures.js';

let cache = null;

// suffix: '' for the 1024 scans, '_512' for the phone-sized copies.
function loadSet(loader, name, maxAniso, rotate, suffix = '') {
  const set = {};
  const promises = [];
  for (const [key, file, srgb] of [['map', 'diff', true], ['normalMap', 'nor_gl', false], ['roughnessMap', 'rough', false]]) {
    promises.push(
      new Promise((resolve) => {
        const t = loader.load(`assets/${name}_${file}${suffix}.jpg`, () => resolve(), undefined, () => resolve());
        t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = maxAniso;
        if (rotate) {
          // Grain runs along V in this scan; geometry puts the long side of each face along U.
          t.center.set(0.5, 0.5);
          t.rotation = Math.PI / 2;
        }
        set[key] = t;
      }),
    );
  }
  set.ready = Promise.all(promises);
  return set;
}

// Paint: tint * grain contrast from the wood luminance, so the color reads as stain over wood.
function stain(mat, amount) {
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#ifdef USE_MAP
        vec4 texelColor = texture2D( map, vMapUv );
        // Grain contrast relative to the scan's mean brightness, so the stain shows the wood underneath.
        float wl = dot(texelColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        float grain = clamp(pow(wl / 0.24, 1.6), 0.35, 1.7);
        diffuseColor.rgb *= mix(1.0, grain, ${amount.toFixed(2)});
      #endif`,
    );
  };
  mat.customProgramCacheKey = () => 'stain' + amount;
}

// lite: phones load 512 copies of the wood scans (a quarter of the memory; at a phone's render size the 1024s
// mostly land in the smaller mip levels anyway) and filter them with less anisotropy.
export function getMaterials(quality = 'high', renderer = null, { lite = false } = {}) {
  if (cache) return cache;
  const loader = new THREE.TextureLoader();
  const aniso = renderer ? Math.min(lite ? 4 : 8, renderer.capabilities.getMaxAnisotropy()) : 8;
  const sfx = lite ? '_512' : '';
  const oak = loadSet(loader, 'oak_veneer_01', aniso, true, sfx);
  const ash = loadSet(loader, 'ash_veneer', aniso, false, sfx);
  const low = quality === 'low';
  // Track boards: natural oak, satin varnish.
  const woodMat = new THREE.MeshPhysicalMaterial({
    map: oak.map, normalMap: oak.normalMap, roughnessMap: oak.roughnessMap, normalScale: new THREE.Vector2(0.8, 0.8),
    roughness: 0.95, metalness: 0, vertexColors: true, clearcoat: low ? 0 : 0.35, clearcoatRoughness: 0.42, envMapIntensity: 1,
    specularIntensity: 0.6,
  });
  // Natural blocks and posts: ash.
  const ashMat = new THREE.MeshPhysicalMaterial({
    map: ash.map, normalMap: ash.normalMap, roughnessMap: ash.roughnessMap, normalScale: new THREE.Vector2(0.6, 0.6),
    roughness: 0.9, metalness: 0, vertexColors: true, clearcoat: low ? 0 : 0.25, clearcoatRoughness: 0.5, envMapIntensity: 1,
  });
  // Painted blocks: stain over ash grain under a glossy lacquer.
  const paintMat = new THREE.MeshPhysicalMaterial({
    map: ash.map, normalMap: ash.normalMap, normalScale: new THREE.Vector2(0.35, 0.35), roughnessMap: ash.roughnessMap,
    roughness: 0.7, metalness: 0, vertexColors: true, clearcoat: low ? 0.2 : 0.6, clearcoatRoughness: 0.22, envMapIntensity: 0.9,
  });
  stain(paintMat, 0.7);
  const rubberMat = new THREE.MeshPhysicalMaterial({ roughness: 0.55, metalness: 0, vertexColors: true, sheen: 0.4, sheenRoughness: 0.6, envMapIntensity: 0.9 });
  const chevron = chevronTexture();
  const checker = checkerTexture();
  const boostMat = new THREE.MeshPhysicalMaterial({
    map: chevron, emissive: new THREE.Color('#ff7a00'), emissiveMap: chevron, emissiveIntensity: 0.9, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.1,
  });
  const checkerMat = new THREE.MeshPhysicalMaterial({ map: checker, roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.2 });
  cache = {
    wood: woodMat, ash: ashMat, paint: paintMat, rubber: rubberMat, boost: boostMat, checker: checkerMat,
    textures: { oak, ash, chevron, checker },
    ready: Promise.all([oak.ready, ash.ready]),
  };
  return cache;
}

// Material for a visual's `m` key.
export function materialKey(m) {
  if (m === 'wood' || m === 'plank') return 'wood';
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
