import * as THREE from 'three';
import {afterReady} from './progressive-assets.js';

// Keep the same six approved views; refine their pixels after the first frame.
export async function loadWorkshop(scene) {
  const names = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];
  const loader = new THREE.CubeTextureLoader();
  let complete = 0;
  const images = await Promise.all(names.map(async face => {
    const image = await new THREE.ImageLoader().loadAsync(new URL('./room/' + face + '-startup.jpg', import.meta.url).href);
    globalThis.gameLoading?.set('background', ++complete / names.length);
    return image;
  }));
  const room = new THREE.CubeTexture(images);
  room.needsUpdate = true;
  room.colorSpace = THREE.SRGBColorSpace;
  scene.userData.neutralBackground = new THREE.Color();
  scene.background = room;
  scene.environment = room;
  afterReady(async () => {
    const full = await loader.loadAsync(names.map(face => new URL('./room/' + face + '.jpg', import.meta.url).href));
    room.images = full.images;
    room.needsUpdate = true;
    full.dispose();
  });
}
