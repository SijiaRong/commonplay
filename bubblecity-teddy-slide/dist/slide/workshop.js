import * as THREE from 'three';

// The six orthogonal views were captured at the approved workshop's viewing point.
export async function loadWorkshop(scene) {
  const faces = ['px', 'nx', 'py', 'ny', 'pz', 'nz'].map(face =>
    new URL('./room/' + face + '.jpg', import.meta.url).href);
  const room = await new THREE.CubeTextureLoader().loadAsync(faces);
  room.colorSpace = THREE.SRGBColorSpace;
  scene.userData.neutralBackground = new THREE.Color();
  scene.background = room;
  scene.environment = room;
}
