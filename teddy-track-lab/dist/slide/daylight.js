import * as T from 'three';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';
import {GroundedSkybox} from '../vendor/GroundedSkybox.js';

// Daytime bedroom settings from Lost Marbles' env.js. Both images come from
// the same photographic exposure: the JPEG is the view, the HDR lights the toys.
export async function loadDaylight(film, lite) {
  const lowRes = film.quality === 'low' || film.renderer.capabilities.maxTextureSize < 8192;
  const panorama = lite ? './slide/room_bg_2k.jpg' : lowRes ? './slide/room/room_bg_4k.jpg' : './slide/room/room_bg.jpg';
  const [hdr, backdrop] = await Promise.all([
    new HDRLoader().loadAsync('./slide/room/' + (lite ? 'room_512.hdr' : 'room_1k.hdr')),
    new T.TextureLoader().loadAsync(panorama)
  ]);
  hdr.mapping = T.EquirectangularReflectionMapping;
  const pmrem = new T.PMREMGenerator(film.renderer);
  const environment = pmrem.fromEquirectangular(hdr);
  pmrem.dispose();
  hdr.dispose();
  film.scene.environment = environment.texture;
  film.scene.environmentIntensity = 1;

  backdrop.mapping = T.EquirectangularReflectionMapping;
  backdrop.colorSpace = T.SRGBColorSpace;
  backdrop.generateMipmaps = true;
  backdrop.minFilter = T.LinearMipmapLinearFilter;
  backdrop.anisotropy = lite ? 4 : 8;
  const sky = new GroundedSkybox(backdrop, 64, 520, lite || lowRes ? 64 : 96);
  sky.material.color.setScalar(1.05);
  sky.material.depthWrite = true;
  sky.position.y = 63.98;
  sky.renderOrder = -1;
  film.scene.add(sky);

  const floor = new T.Mesh(new T.CircleGeometry(494, 96),
    new T.ShadowMaterial({color:0x2a1f14, opacity:.42}));
  floor.rotation.x = -Math.PI/2;
  floor.position.y = .03;
  floor.receiveShadow = true;
  film.scene.add(floor);
}

// The original opaque-marble contact shadow, sized to the seated bear.
export function createContactShadow(radius) {
  const material = new T.ShaderMaterial({
    uniforms:{grounded:{value:1}},
    vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'varying vec2 vUv; uniform float grounded; void main(){float d=2.*length(vUv-.5);gl_FragColor=vec4(0.,0.,0.,pow(max(0.,1.-d),2.2)*grounded);}',
    transparent:true, depthWrite:false, polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-2
  });
  const diameter = 2.3*radius;
  const shadow = new T.Mesh(new T.PlaneGeometry(diameter,diameter).rotateX(-Math.PI/2),material);
  shadow.renderOrder = 2;
  return shadow;
}
