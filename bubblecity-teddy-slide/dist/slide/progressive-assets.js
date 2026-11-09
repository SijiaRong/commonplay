import {TextureLoader} from 'three';

const images = new Map();
const jobs = [];
let running = false;

// All refinement starts after the first playable frame, never during its download.
export function afterReady(job) {
  jobs.push(job);
  if (running) return;
  running = true;
  Promise.resolve(globalThis.gameLoading?.ready).then(() => {
    const drain = async () => {
      while (jobs.length) {
        try { await jobs.shift()(); }
        catch (error) { console.warn('保留轻量资源', error); }
      }
      running = false;
    };
    if ('requestIdleCallback' in globalThis) requestIdleCallback(drain, {timeout: 2000});
    else setTimeout(drain, 100);
  });
}

export function upgradeModelTextures(root, modelURL) {
  const seen = new Set();
  root.traverse(object => {
    for (const material of [object.material].flat().filter(Boolean)) {
      for (const texture of Object.values(material)) {
        if (!texture?.isTexture || !texture.userData.fullResolution || seen.has(texture)) continue;
        seen.add(texture);
        let disposed = false;
        texture.addEventListener('dispose', () => { disposed = true; }, {once: true});
        const url = new URL(texture.userData.fullResolution, new URL(modelURL, document.baseURI)).href;
        afterReady(async () => {
          if (disposed) return;
          if (!images.has(url)) images.set(url, new TextureLoader().loadAsync(url).then(full => {
            const image = full.image;
            full.dispose();
            return image;
          }).catch(error => { images.delete(url); throw error; }));
          const image = await images.get(url);
          if (!disposed) { texture.image = image; texture.needsUpdate = true; }
        });
      }
    }
  });
}

export async function loadProgressModel(loader, url, part, bytes) {
  const loading = globalThis.gameLoading;
  const gltf = await loader.loadAsync(url, event => {
    const total = bytes || event.total;
    if (total) loading?.set(part, Math.min(.98, event.loaded / total));
  });
  loading?.set(part, 1);
  return gltf;
}
