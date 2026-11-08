export const meta = {
  id: 'slide',
  name: '苏打云瀑',
  tagline: '沿奶油色宽槽下滑，在两枚错位泡泡间换线，滑进薄荷减速港。',
  reference: 'Lost Marbles · plunge 陡降滑槽 / halfpipe 半管道：提取蓄势、下滑、承接的节奏。',
  dimensions: '净宽 19.2 · 长 88 · 落差 16 · 最大纵坡约 24.2°',
  beats: ['0–8 准备平台：看见完整下滑路线', '8–64 连续滑槽：24 / 42 处两枚错位浮标', '64–80 平滑减速：中央快线、两侧缓冲带', '80–88 平直接口：可继续拼接下一段'],
  controls: ['滑行中左右换线', '靠两侧薄荷减速带稳住出槽', '所有路段连续着地，无强制腾空']
};

// The cosine profile has zero slope at both joins; no jump lip or invisible bridge.
export function heightAt(z) {
  if (z <= 8) return 24;
  if (z >= 64) return 8;
  return 16 + 8 * Math.cos(Math.PI * (z - 8) / 56);
}
export const centerline = Array.from({length: 177}, (_, i) => [0, heightAt(i / 2), i / 2]);

export function build(k) {
  const root = k.group();
  root.name = 'soda-cloudfall';
  root.userData.animations = [];
  const mint = '#92d9c9', cream = '#fff0d8', peach = '#f4b5a6', brass = '#c99b63', deep = '#537e83';
  k.road(root, centerline, 19.2, {color: cream, railColor: mint, railHeight: 1.65, wallHeight: 1.45, thickness: .8});

  // Raised rolled rims and outer shell ribs give the wide slide a toy trough silhouette.
  for (const side of [-1, 1]) {
    for (let i = 0; i < centerline.length - 1; i++) {
      const a = centerline[i], b = centerline[i + 1];
      k.beam(root, [side * 9.9, a[1] + 1.65, a[2]], [side * 9.9, b[1] + 1.65, b[2]], .28, peach);
    }
    for (let z = 10; z <= 62; z += 8) {
      const y = heightAt(z);
      k.beam(root, [side * 9.75, y + .8, z], [side * 11.15, y - .85, z], .24, mint);
      k.beam(root, [side * 11.15, y - .85, z], [side * 8.6, y - 1.4, z], .24, mint);
    }
  }

  // Portal arch sits just outside the deck. The left and right opening stays full width.
  for (const x of [-11.3, 11.3]) {
    k.cylinder(root, [x, 25.9, 5], .62, 3.8, mint);
    k.sphere(root, [x, 28, 5], .8, peach);
  }
  k.beam(root, [-11.3, 28.2, 5], [11.3, 28.2, 5], .45, cream);
  k.sphere(root, [0, 29, 5], 1.1, mint);
  k.torus(root, [0, 29, 5], 1.6, .16, brass, [Math.PI / 2.4, 0, .25]);

  // Two offset buoys teach a gentle S exchange, leaving an uninterrupted safe corridor.
  for (const [x, z, color] of [[-3.4, 24, peach], [3.4, 42, mint]]) {
    const y = heightAt(z);
    k.cylinder(root, [x, y + .14, z], 1.65, .28, brass);
    k.sphere(root, [x, y + 1.15, z], 1.25, color);
    k.sphere(root, [x - .3, y + 1.58, z - .72], .23, cream);
    k.torus(root, [x, y + .34, z], 1.8, .1, color, [Math.PI / 2, 0, 0]);
  }

  // Discrete flush lane markings, not raised speed bumps. Center path remains open.
  for (let z = 12; z <= 58; z += 4) {
    const x = z < 30 ? 2.5 : -2.5;
    k.box(root, [x, heightAt(z) + .028, z], [1.25, .035, .45], peach);
  }
  for (const side of [-1, 1]) {
    k.box(root, [side * 6.3, 8.025, 72], [4, .035, 14], mint);
    for (let z = 66; z <= 78; z += 2) k.box(root, [side * 6.3, 8.05, z], [3.7, .018, .12], cream);
  }
  for (let z = 82; z <= 84; z += 2) {
    for (let x = -8; x <= 8; x += 2) k.box(root, [x, 8.03, z], [1, .04, .5], mint);
  }

  // Freestanding harbor piers and feet under the slide; none occupy the riding width.
  for (const z of [3, 17, 33, 49, 67, 84]) {
    const y = heightAt(z) - .8;
    for (const x of [-7.5, 7.5]) {
      k.cylinder(root, [x, y / 2, z], .65, y, mint);
      k.cylinder(root, [x, .35, z], 1.55, .7, cream);
      k.torus(root, [x, Math.min(y - .3, 3), z], .82, .14, brass, [Math.PI / 2, 0, 0]);
    }
    k.beam(root, [-8.5, y - .3, z], [8.5, y - .3, z], .4, deep);
  }

  // Exterior soda reservoirs: world-building with clear silhouette and no collision claim.
  for (const [x, z, h] of [[-15.5, 15, 8], [15.5, 59, 5.5]]) {
    k.cylinder(root, [x, h / 2 + .7, z], 2.2, h, cream);
    k.cylinder(root, [x, h + .8, z], 2.35, .45, mint);
    k.sphere(root, [x, h + 2, z], 1, peach);
    k.beam(root, [x, h + .9, z], [x + 1.3, h + 3, z], .23, brass);
    for (let j = 0; j < 3; j++) k.sphere(root, [x - .7 + j * .7, h * .5 + j * .8, z - 2.05], .35 + .08 * j, mint);
  }
  return root;
}
