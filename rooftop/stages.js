import { route } from './public/course.js';
import { makeCollider } from '../teddy-playground/dist/solo/shared/physics.js';

export function buildStages(seed) {
  return Array.from({length: 5}, (_, index) => {
    const {length, width, center, parts} = route(seed, index);
    const colliders = parts.map(p => makeCollider('box', {
      c: [p.x, p.y, p.z], hx: p.w / 2, hy: p.h / 2, hz: p.depth / 2,
      motion: p.speed ? {type: 'spin', axis: [0,1,0], speed: p.speed, phase: 0} : null,
      mat: {bounce: p.speed ? .7 : .08, friction: .12}
    }));
    const gate = colliders.length;
    colliders.push(makeCollider('box', {c:[0,1,.3], hx:11, hy:2, hz:.15}));
    const path = {length, finishS:length, sMin:-12, bucketSize:8, buckets:[]};
    for (const key of ['x','y','z','s','hw','tx','tz','br','fk','fl']) path[key] = [];
    for (let s = -12; s <= length + 8; s++) {
      const point = d => center(Math.max(0, Math.min(length, d)));
      const dx = point(s + 1) - point(s);
      const mag = Math.hypot(dx, 1);
      const values = {x:point(s), y:0, z:-s, s, hw:(width-3)/2, tx:dx/mag, tz:-1/mag, br:0, fk:-1, fl:1};
      const i = path.s.length;
      for (const [key,value] of Object.entries(values)) path[key].push(value);
      (path.buckets[Math.floor((s+12)/8)] ??= []).push(i);
    }
    return { final:index === 4, index, colliders, gate, path, forks:[], killY:-10,
      grid:Array.from({length:50}, (_, i) => [(i%10-4.5)*1.65,.6,2+Math.floor(i/10)*1.8]),
      penCenter:[center(length),0,-length-4], penHeading:Math.PI,
      finish:makeCollider('box',{c:[center(length),2,-length],hx:10,hy:6,hz:1}) };
  });
}
