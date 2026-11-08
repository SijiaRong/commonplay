import {prefs} from './preferences.js';
import * as T from 'three';

const amber = new T.Color('#ffbd6a');
const jade = new T.Color('#8df9df');

export function makeBeaconBase() {
  return new T.MeshStandardMaterial({color: '#bda16c', metalness: .72, roughness: .32});
}

export function makeBeaconLens(color) {
  return new T.MeshStandardMaterial({color, emissive: color, emissiveIntensity: 3, roughness: .22});
}

export const beaconColors = {amber, jade};

// Seat each beacon on the actual rendered edge, skipping gaps and unsupported samples.
export function addHarborLights(course, samples, movingGate = null, separate = () => false) {
  const group = new T.Group();
  group.name = '星港航标灯';
  const sites = [];
  const ray = new T.Raycaster(undefined, new T.Vector3(0,-1,0), 0, 8);
  course.updateWorldMatrix(true, true);
  const deck = [];
  course.traverse(o => { if (o.isMesh && !o.isInstancedMesh && o !== movingGate) deck.push(o); });
  let next = -Infinity;
  for (const p of samples) {
    if (p.s < next) continue;
    next = p.s + (p.spacing ?? 16);
    for (const side of [-1, 1]) {
      const x = p.x + side * p.tz * p.edge;
      const z = p.z - side * p.tx * p.edge;
      ray.ray.origin.set(x, p.y + 4.5, z);
      const hit = ray.intersectObjects(deck, false)[0];
      if (!hit) continue;
      sites.push({base: hit.point, side, id: sites.length, s:p.s});
    }
  }
  const brass = makeBeaconBase();
  const transform = new T.Object3D();
  function instances(geometry, material, locations, height, tilt = 0) {
    if (!locations.length) { geometry.dispose(); return; }
    const batch = [];
    for (const site of locations) {
      const component = 'beacon'+site.id;
      if (separate(component)) {
        const part = new T.Mesh(geometry,material);
        part.position.copy(site.base); part.position.y += height; part.rotation.x=tilt;
        part.name = tilt ? '航标灯环' : height < .4 ? '航标灯座' : '航标灯芯';
        part.userData.component=component+'/'+geometry.type;
        part.userData.routeDistance=site.s;
        group.add(part);
      } else batch.push(site);
    }
    if (!batch.length) return;
    const mesh = new T.InstancedMesh(geometry, material, batch.length);
    batch.forEach(({base}, i) => {
      transform.position.copy(base); transform.position.y += height;
      transform.rotation.set(tilt,0,0); transform.updateMatrix();
      mesh.setMatrixAt(i,transform.matrix);
    });
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  instances(new T.CylinderGeometry(.26,.34,.46,12), brass, sites,.21);
  instances(new T.TorusGeometry(.40,.048,6,20), brass, sites,.65,Math.PI*.38);
  const lights = [];
  for (const side of [-1,1]) {
    const color = side === -1 ? amber : jade;
    const locations = sites.filter(site => site.side === side);
    const lens = makeBeaconLens(color);
    instances(new T.SphereGeometry(.31,14,10),lens,locations,.62);
    // Reuse a local light on each side. Fade between fixtures outside their useful radius.
    const light = new T.PointLight(color,0,10,2);
    group.add(light);
    lights.push({light,locations,lens});
  }
  course.add(group);
  return function illuminate(position,visibleSites=null) {
    for (const {light,locations,lens} of lights) {
      lens.emissiveIntensity = 3 * prefs.lamps / 100;
      let closest, distance = Infinity;
      for (const {base,id} of locations) {
        if (visibleSites && !visibleSites.has(id)) continue;
        const d = base.distanceToSquared(position);
        if (d < distance) { distance = d; closest = base; }
      }
      if (!closest) { light.intensity=0; continue; }
      light.position.copy(closest); light.position.y += 1;
      light.intensity = 23 * prefs.lamps / 100 * (1 - T.MathUtils.smoothstep(Math.sqrt(distance), 9, 16));
    }
  };
}
