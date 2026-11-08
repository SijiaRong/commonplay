// Dimensions are in simulation units. North is -Z in both the renderer and simulation.
export const titles = ['风港站台', '转运天桥', '云顶机房', '信标栈道', '日落总站'];
export function route(seed, stage) {
  const length = 120 + stage * 12;
  const width = 15 - stage;
  const phase = (seed % 37) / 6 + stage;
  const center = d => 6 * (Math.sin(d / 18 + phase) - Math.sin(phase));
  const parts = [];
  function box(kind, x, y, d, w, h, depth, extra = {}) {
    parts.push({kind, x, y, z: -d, w, h, depth, ...extra});
  }
  box('roof', 0, -2, -6, 21, 4, 16);
  for (let d = 0; d < length; d += 6) {
    const bridge = (d / 6) % 7 >= 4;
    const w = bridge ? width - 3 : width + 2;
    const x = center(d + 3);
    box(bridge ? 'bridge' : 'roof', x, bridge ? -.3 : -2, d + 3, w, bridge ? .6 : 4, 6.04);
    if (d % 24 === 12) box('vent', x + (d % 48 === 12 ? 1 : -1) * 3, .65, d + 3, 2, 1.3, 2);
    if (d % 36 === 18) box('rotor', x, .56, d + 3, w * .75, .36, .55, {speed: (d % 72 === 18 ? 1 : -1) * (1.1 + stage * .12)});
  }
  box('roof', center(length), -2, length + 6, 20, 4, 12.1);
  return {length, width, center, parts};
}
