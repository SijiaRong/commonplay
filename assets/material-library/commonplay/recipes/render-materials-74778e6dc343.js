import {makePeachAcrylic} from './acrylic.js';
import * as THREE from 'three';
import { chevronTexture, checkerTexture } from './textures.js';

let cache = null;

async function loadSurface(loader, name, lite, anisotropy) {
  const files = {map: ['basecolor', 'jpg'], normalMap: ['normal', 'png'], roughnessMap: ['roughness', 'png']};
  const entries = await Promise.all(Object.entries(files).map(async ([slot, [layer, extension]]) => {
    const file = layer + (lite ? '-512' : '') + '.' + extension;
    const texture = await loader.loadAsync(new URL('../../../slide/surfaces/' + name + '/' + file, import.meta.url).href);
    texture.colorSpace = slot === 'map' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = anisotropy;
    return [slot, texture];
  }));
  return Object.fromEntries(entries);
}

export function getMaterials(quality = 'high', renderer, {lite = false} = {}) {
  if (cache) return cache;
  const loader = new THREE.TextureLoader();
  const anisotropy = Math.min(lite ? 4 : 8, renderer?.capabilities.getMaxAnisotropy() ?? 8);
  const enamel = new THREE.MeshPhysicalMaterial({name: '象牙涂层', normalScale: new THREE.Vector2(.85,.85), roughness: 1, clearcoat: .28, clearcoatRoughness: .32});
  const resin = new THREE.MeshPhysicalMaterial({name: '薄荷树脂', normalScale: new THREE.Vector2(.8,.8), roughness: 1, clearcoat: .48, clearcoatRoughness: .22});
  const paintMat = new THREE.MeshPhysicalMaterial({vertexColors: true, roughness: .29, clearcoat: .48, clearcoatRoughness: .22});
  const rubberMat = new THREE.MeshPhysicalMaterial({vertexColors: true, roughness: .62, clearcoat: .08, clearcoatRoughness: .60});
  const brass = new THREE.MeshPhysicalMaterial({color: '#d1ac68', metalness: 1, roughness: .26, clearcoat: .08, bumpScale: .003});
  const lamp = new THREE.MeshPhysicalMaterial({color: '#ffe3a1', emissive: '#ffbb52', emissiveIntensity: 4, roughness: .22});
  const trim = new THREE.MeshPhysicalMaterial({name: '白蜡木饰条', normalScale: new THREE.Vector2(.6,.6), roughness: .9, clearcoat: .25, clearcoatRoughness: .5});
  const chevron = chevronTexture();
  const checker = checkerTexture();
  const boostMat = new THREE.MeshPhysicalMaterial({
    map: chevron, emissive: new THREE.Color('#ff7a00'), emissiveMap: chevron, emissiveIntensity: 0.12, roughness: 0.83, specularIntensity: 0.22, clearcoat: 0.025, clearcoatRoughness: 0.72,
  });
  const checkerMat = new THREE.MeshPhysicalMaterial({ map: checker, roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.2 });
  cache = {
    acrylic: makePeachAcrylic(), trim, resin, paint: paintMat, rubber: rubberMat, boost: boostMat, checker: checkerMat,
    road: enamel, brass, lamp, textures: { chevron, checker },
  };
  const micro = name => loader.loadAsync(new URL('../../../slide/surfaces/' + name + '.png', import.meta.url).href);
  cache.ready = Promise.all([
    loadSurface(loader, 'ash-trim', lite, anisotropy).then(maps => Object.assign(trim, maps)),
    loadSurface(loader, 'ivory-enamel', lite, anisotropy).then(maps => Object.assign(enamel, maps)),
    loadSurface(loader, 'mint-resin', lite, anisotropy).then(maps => {
      Object.assign(resin, maps);
      // Coloured shells carry their pigment in vertex colours, but share the moulded finish.
      paintMat.normalMap = maps.normalMap;
      paintMat.normalScale.copy(resin.normalScale);
      paintMat.roughnessMap = maps.roughnessMap;
      paintMat.roughness = 1;
    }),
    micro('metal-brush-microstructure').then(map => {
      map.wrapS = map.wrapT = THREE.RepeatWrapping; map.repeat.set(1,2);
      brass.roughnessMap = brass.bumpMap = map;
    })
  ]);
  return cache;
}

// Material for a visual's `m` key.
export function materialKey(m) {
  if (m === 'wood' || m === 'plank' || m === 'road') return 'road';
  if (m === 'brass' || m === 'lamp') return m;
  if (m === 'ash') return 'resin';
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
