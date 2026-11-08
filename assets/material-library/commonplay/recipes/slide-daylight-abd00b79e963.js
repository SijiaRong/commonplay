import * as T from 'three';
import {loadWorkshop} from './workshop.js';

export async function loadDaylight(film) {
  await loadWorkshop(film.scene);
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
