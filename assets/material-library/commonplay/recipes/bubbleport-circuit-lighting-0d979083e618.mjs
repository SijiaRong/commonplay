import * as T from 'three';

const honey = new T.Color('#ffbd6a');
const seaGlass = new T.Color('#8df9df');

function softDisc() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 96;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(48, 48, 0, 48, 48, 48);
  for (const [stop, alpha] of [[0, 1], [.15, .64], [.42, .19], [.72, .045], [1, 0]]) {
    gradient.addColorStop(stop, `rgba(255,255,255,${alpha})`);
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 96, 96);
  return new T.CanvasTexture(canvas);
}

const glowMap = softDisc();
function glow(parent, position, diameter, color, opacity) {
  const sprite = new T.Sprite(new T.SpriteMaterial({
    map: glowMap, color, opacity, transparent: true,
    blending: T.AdditiveBlending, depthWrite: false
  }));
  sprite.scale.set(diameter, diameter, 1);
  sprite.position.copy(position);
  parent.add(sprite);
  return sprite;
}

export function lightBeacon(bulb, color = honey) {
  bulb.material = bulb.material.clone();
  bulb.material.emissive.copy(color);
  bulb.material.emissiveIntensity = 1.3;
  const radius = bulb.geometry.parameters.radius;
  glow(bulb, new T.Vector3(), radius * 7, color, .52);
}

export function lightPlatform(scene, x, y, z, arrival) {
  const color = arrival ? seaGlass : honey;
  // Recessed bulbs on both faces of the station fascia.
  const bulb = new T.SphereGeometry(.135, 10, 8);
  const lens = new T.MeshStandardMaterial({color, emissive: color, emissiveIntensity: 1.8});
  const studs = new T.InstancedMesh(bulb, lens, 24);
  let index = 0;
  for (const side of [-1, 1]) {
    for (let i = 0; i < 12; i++) {
      studs.setMatrixAt(index++, new T.Matrix4().makeTranslation(x - 8.8 + i * 1.6, y + 5.05, z + side * .34));
    }
  }
  scene.add(studs);
  const downlight = new T.PointLight(color, 52, 13);
  downlight.position.set(x, y + 4.6, z);
  scene.add(downlight);
}

export function lightStreetLamp(scene, lamp, bounds) {
  lamp.traverse(mesh => {
    if (!mesh.isMesh) return;
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox;
    const localCenter = box.getCenter(new T.Vector3());
    const localHeight = box.max.y - box.min.y;
    localCenter.y = box.min.y + .75 * localHeight;
    const material = mesh.material.clone();
    mesh.material = material;
    material.onBeforeCompile = shader => {
      shader.uniforms.bulbBounds = {value: new T.Vector4(...localCenter.toArray(), localHeight)};
      shader.vertexShader = 'varying vec3 bulbOffset;\nuniform vec4 bulbBounds;\n' +
        shader.vertexShader.replace('#include <begin_vertex>',
          '#include <begin_vertex>\nbulbOffset = (position - bulbBounds.xyz) / bulbBounds.w;');
      shader.fragmentShader = 'varying vec3 bulbOffset;\n' +
        shader.fragmentShader.replace('#include <emissivemap_fragment>', `
          #include <emissivemap_fragment>
          float bulb = 1.0 - smoothstep(.070,.087,length(bulbOffset));
          totalEmissiveRadiance += vec3(1.8,1.1,.38) * bulb;
        `);
    };
    material.customProgramCacheKey = () => 'street-lamp-filament-v1';
  });
  const center = bounds.getCenter(new T.Vector3());
  const height = bounds.max.y - bounds.min.y;
  center.y = bounds.min.y + height * .75;
  glow(scene, center, height * .65, honey, .8);

  const spill = new T.Mesh(new T.PlaneGeometry(height * 1.55, height * 1.55),
    new T.MeshBasicMaterial({map: glowMap, color: honey, opacity: .44, transparent: true,
      blending: T.AdditiveBlending, depthWrite: false}));
  spill.position.set(center.x, bounds.min.y + .035, center.z);
  spill.rotation.x = -Math.PI / 2;
  scene.add(spill);
}

// The original tower has one textured mesh. Select the warm panes by their
// painted colour and elevation so the narrow mullions retain their silhouettes.
export function lightObservatory(tower) {
  tower.traverse(mesh => {
    if (!mesh.isMesh) return;
    mesh.geometry.computeBoundingBox();
    const bounds = mesh.geometry.boundingBox;
    const material = mesh.material.clone();
    mesh.material = material;
    material.onBeforeCompile = shader => {
      shader.uniforms.towerVertical = {value: new T.Vector2(bounds.min.y, bounds.max.y - bounds.min.y)};
      shader.vertexShader = 'varying float towerHeight;\nuniform vec2 towerVertical;\n' +
        shader.vertexShader.replace('#include <begin_vertex>',
          '#include <begin_vertex>\ntowerHeight = (position.y - towerVertical.x) / towerVertical.y;');
      shader.fragmentShader = 'varying float towerHeight;\n' +
        shader.fragmentShader.replace('#include <emissivemap_fragment>', `
          #include <emissivemap_fragment>
          float lower = smoothstep(.10,.14,towerHeight) * (1.0-smoothstep(.43,.47,towerHeight));
          float upper = smoothstep(.54,.58,towerHeight) * (1.0-smoothstep(.73,.77,towerHeight));
          vec3 paint = diffuseColor.rgb;
          float saturation = (paint.r - paint.b) / max(paint.r,.001);
          float amber = smoothstep(.70,.89,saturation) * smoothstep(.08,.22,paint.r-paint.g)
                      * smoothstep(.12,.50,paint.r);
          totalEmissiveRadiance += vec3(1.0,.45,.105) * amber * (.70*lower + .90*upper);
          totalEmissiveRadiance += vec3(.95,.58,.18) * smoothstep(.926,.945,towerHeight) * .72;
        `);
    };
    material.customProgramCacheKey = () => 'observatory-window-light-v1';
  });
}
