import * as THREE from 'three';

// Verified against this baked track's GLTF primitive assignments and CourseView chunks.
const slot = { oak: 2, paint: 3, ash: 4, boost: 5, checker: 6 };

async function loadVeneer(loader, name, suffix, anisotropy, rotate) {
  const files = { map: 'diff', normalMap: 'nor_gl', roughnessMap: 'rough' };
  const maps = await Promise.all(Object.entries(files).map(async ([property, channel]) => {
    const url = new URL(`./wood/${name}_${channel}${suffix}.jpg`, import.meta.url);
    const texture = await loader.loadAsync(url.href);
    texture.colorSpace = property === 'map' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = anisotropy;
    if (rotate) {
      texture.center.set(0.5, 0.5);
      texture.rotation = Math.PI / 2;
    }
    return [property, texture];
  }));
  return Object.fromEntries(maps);
}

export async function restoreCourseMaterials(course, renderer, {quality = 'high', lite = false} = {}) {
  const loader = new THREE.TextureLoader();
  const anisotropy = Math.min(lite ? 4 : 8, renderer.capabilities.getMaxAnisotropy());
  const suffix = lite ? '_512' : '';
  const [oak, ash] = await Promise.all([
    loadVeneer(loader, 'oak_veneer_01', suffix, anisotropy, true),
    loadVeneer(loader, 'ash_veneer', suffix, anisotropy, false),
  ]);
  const low = quality === 'low';
  const meshes = [];
  course.scene.traverse(object => {
    if (object.isMesh) meshes.push(object);
  });
  const source = new Map(meshes.map(mesh => [
    course.parser.associations.get(mesh.material)?.materials, mesh.material,
  ]));
  const originals = new Set();
  const shared = {metalness: 0, vertexColors: true};
  const wood = new THREE.MeshPhysicalMaterial({
    ...shared, ...oak, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.95,
    clearcoat: low ? 0 : 0.35, clearcoatRoughness: 0.42, specularIntensity: 0.6,
  });
  const posts = new THREE.MeshPhysicalMaterial({
    ...shared, ...ash, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.9,
    clearcoat: low ? 0 : 0.25, clearcoatRoughness: 0.5,
  });
  const lacquer = new THREE.MeshPhysicalMaterial({
    ...shared, ...ash, normalScale: new THREE.Vector2(0.35, 0.35), roughness: 0.7,
    clearcoat: low ? 0.2 : 0.6, clearcoatRoughness: 0.22, envMapIntensity: 0.9,
  });
  // Lost Marbles materials.js uses ash luminance as the grain beneath a colored stain.
  lacquer.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
      #ifdef USE_MAP
        vec3 veneer = texture2D(map, vMapUv).rgb;
        float luminance = dot(veneer, vec3(0.2126, 0.7152, 0.0722));
        float grain = clamp(pow(luminance / 0.24, 1.6), 0.35, 1.7);
        diffuseColor.rgb *= mix(1.0, grain, 0.7);
      #endif
    `);
  };
  lacquer.customProgramCacheKey = () => 'ash-stain-0.7';

  // The bake preserved the original chevron and checker canvases in the GLB.
  const chevron = source.get(slot.boost).map;
  const checks = source.get(slot.checker).map;
  chevron.anisotropy = checks.anisotropy = anisotropy;
  const boost = new THREE.MeshPhysicalMaterial({
    map: chevron, emissiveMap: chevron, emissive: 0xff7a00, emissiveIntensity: 0.12,
    roughness: 0.83, specularIntensity: 0.22, clearcoat: 0.025, clearcoatRoughness: 0.72,
  });
  const checker = new THREE.MeshPhysicalMaterial({
    map: checks, roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.2,
  });
  const replacements = new Map([
    [slot.oak, wood], [slot.ash, posts], [slot.paint, lacquer],
    [slot.boost, boost], [slot.checker, checker],
  ]);
  for (const mesh of meshes) {
    const id = course.parser.associations.get(mesh.material)?.materials;
    const replacement = replacements.get(id);
    if (!replacement) continue; // Both printed banners already include their original clearcoat.
    originals.add(mesh.material);
    mesh.material = replacement;
    mesh.castShadow = id !== slot.boost && id !== slot.checker;
    mesh.receiveShadow = true;
  }
  for (const material of originals) material.dispose();
  source.get(slot.oak).map.dispose(); // The old oak and ash shared the baked diffuse scan.
}
