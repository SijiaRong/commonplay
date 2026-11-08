import * as THREE from 'three';

async function loadScan(loader, name, lite, anisotropy, rotate) {
  const maps = {};
  await Promise.all([['map','diff'],['normalMap','nor_gl'],['roughnessMap','rough']].map(async ([slot, channel]) => {
    const file = name + '_' + channel + (lite ? '_512' : '') + '.jpg';
    const texture = await loader.loadAsync(new URL('./surfaces/lost-marbles/' + file, import.meta.url).href);
    texture.colorSpace = slot === 'map' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = anisotropy;
    if (rotate) { texture.center.set(.5,.5); texture.rotation = Math.PI / 2; }
    maps[slot] = texture;
  }));
  return maps;
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

export async function loadLostPack(renderer, lite) {
  const loader = new THREE.TextureLoader();
  const anisotropy = Math.min(lite ? 4 : 8, renderer.capabilities.getMaxAnisotropy());
  const [oak,ash] = await Promise.all([loadScan(loader,'oak_veneer_01',lite,anisotropy,true),loadScan(loader,'ash_veneer',lite,anisotropy,false)]);
  const low = lite;
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
  return {road: woodMat, resin: paintMat, trim: ashMat, paint: paintMat};
}

export function applyTrackPack(materials, source) {
  for (const [key, preset] of Object.entries(source)) {
    const mat = materials[key];
    mat.copy(preset);
    mat.onBeforeCompile = preset.onBeforeCompile;
    mat.customProgramCacheKey = preset.customProgramCacheKey;
    mat.needsUpdate = true;
  }
}
