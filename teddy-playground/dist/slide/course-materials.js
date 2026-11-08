import * as THREE from 'three';

// Verified against this baked track's GLTF primitive assignments and CourseView chunks.
const slot = { oak: 2, paint: 3, ash: 4, boost: 5, checker: 6 };

export function restoreCourseMaterials(course, renderer, {quality = 'high', lite = false} = {}) {
  const anisotropy = Math.min(lite ? 4 : 8, renderer.capabilities.getMaxAnisotropy());
  const meshes = [];
  course.scene.traverse(object => {
    if (object.isMesh) meshes.push(object);
  });
  const source = new Map(meshes.map(mesh => [
    course.parser.associations.get(mesh.material)?.materials, mesh.material,
  ]));
  const originals = new Set();
  const enamel = {roughness: 0.34, clearcoat: quality === 'low' ? 0.24 : 0.65, clearcoatRoughness: 0.22};
  const wood = new THREE.MeshPhysicalMaterial({...enamel, color: '#ffebce'});
  const posts = new THREE.MeshPhysicalMaterial({...enamel, color: '#e6a689'});
  const lacquer = new THREE.MeshPhysicalMaterial({...enamel, color: '#81bdad'});

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
