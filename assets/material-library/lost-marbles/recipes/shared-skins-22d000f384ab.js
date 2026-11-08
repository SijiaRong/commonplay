// Marble skins. `style` selects the interior pattern in the marble shader:
//   0 cat's eye vanes  1 swirl ribbons  2 galaxy  3 opaque agate  4 clearie with bubbles  5 steelie (chrome)
//   6 oil slick        7 onion skin     8 lava    9 planet
//  10 snow globe      11 firefly jar   12 crackle ice   13 aurora   14 disco ball (mirror)   15 googly eye
// a/b/c are the pattern colors, glass tints the shell. price 0 = owned from the start; level = unlock level.

export const SKINS = [
  { name: 'Cherry Eye', style: 0, a: '#ff2d55', b: '#ffd0d8', c: '#ff8fa3', glass: '#ffffff', price: 0 },
  { name: 'Ocean Eye', style: 0, a: '#1e88ff', b: '#bfe3ff', c: '#4dd0e1', glass: '#ffffff', price: 0 },
  { name: 'Lime Eye', style: 0, a: '#4cd137', b: '#eaffd0', c: '#a3e635', glass: '#ffffff', price: 0 },
  { name: 'Sunny Eye', style: 0, a: '#ffb300', b: '#fff3c4', c: '#ff7a00', glass: '#ffffff', price: 0 },
  { name: 'Grape Eye', style: 0, a: '#8e44ff', b: '#e6d4ff', c: '#d16bff', glass: '#ffffff', price: 0 },
  { name: 'Candy Swirl', style: 1, a: '#ff4fa3', b: '#ffffff', c: '#ffd166', glass: '#fff6fb', price: 0 },
  { name: 'Mint Swirl', style: 1, a: '#14c9a0', b: '#f0fff9', c: '#2b6fff', glass: '#f4fffb', price: 0 },
  { name: 'Tiger Swirl', style: 1, a: '#ff8c1a', b: '#1b1b1b', c: '#ffe08a', glass: '#fff8ee', price: 0 },
  { name: 'Ruby Agate', style: 3, a: '#b3122e', b: '#ff6b6b', c: '#3b0710', glass: '#ffffff', price: 0 },
  { name: 'Sea Glass', style: 4, a: '#7fe0c8', b: '#ffffff', c: '#bff3e6', glass: '#9ff0dc', price: 0 },
  { name: 'Teal Eye', style: 0, a: '#00b3b3', b: '#d6ffff', c: '#00e0a4', glass: '#ffffff', price: 0 },
  { name: 'Coral Swirl', style: 1, a: '#ff6f61', b: '#fff1e6', c: '#ffb86b', glass: '#fff8f3', price: 0 },
  { name: 'Onion Skin', style: 7, a: '#ff5e5e', b: '#ffd23f', c: '#3fa7ff', glass: '#fffef8', price: 150 },
  { name: 'Bumblebee', style: 1, a: '#ffd000', b: '#141414', c: '#ffef9a', glass: '#fffbe6', price: 150 },
  { name: 'Jade Agate', style: 3, a: '#0f8a5f', b: '#7be3b5', c: '#03331f', glass: '#ffffff', price: 200 },
  { name: 'Steelie', style: 5, a: '#d9dde3', b: '#8a929c', c: '#ffffff', glass: '#ffffff', price: 300 },
  { name: 'Oil Slick', style: 6, a: '#1a1033', b: '#3cf0ff', c: '#ff3cf0', glass: '#ffffff', price: 400 },
  { name: 'Galaxy', style: 2, a: '#2a0f5c', b: '#ff5ce1', c: '#5ce1ff', glass: '#e8e4ff', price: 500 },
  { name: 'Lava Lamp', style: 8, a: '#ff3d00', b: '#ffc400', c: '#360000', glass: '#ffe9dd', price: 600 },
  { name: 'Blue Planet', style: 9, a: '#1565ff', b: '#3ddc84', c: '#ffffff', glass: '#e6f4ff', price: 700 },
  { name: 'Golden Steelie', style: 5, a: '#ffd36b', b: '#a8741a', c: '#fff4c4', glass: '#ffffff', price: 900 },
  { name: 'Nebula', style: 2, a: '#05051a', b: '#ff8a3d', c: '#9b5cff', glass: '#fff0e6', price: 1000 },
  { name: 'Ghost Glass', style: 4, a: '#ffffff', b: '#dfe8ff', c: '#ffffff', glass: '#e9f0ff', price: 750 },
  { name: 'Champion', style: 8, a: '#ffcc00', b: '#ffffff', c: '#ff6a00', glass: '#fff7d6', price: 0, level: 15 },
  { name: 'Snow Globe', style: 10, a: '#ffffff', b: '#e3f4ff', c: '#7fb8ff', glass: '#eef8ff', price: 350 },
  { name: 'Firefly Jar', style: 11, a: '#ffd36b', b: '#fff0b8', c: '#1e2a12', glass: '#c9d9a6', price: 450 },
  { name: 'Ember Jar', style: 11, a: '#ff6a2b', b: '#ffd0a0', c: '#2a0c06', glass: '#ffd6c4', price: 450 },
  { name: 'Crackle Ice', style: 12, a: '#a8e2ff', b: '#ffffff', c: '#6fc3ff', glass: '#d6f0ff', price: 400 },
  { name: 'Aurora', style: 13, a: '#3dffb0', b: '#9b5cff', c: '#1fd1ff', glass: '#ecfff7', price: 650 },
  { name: 'Disco Ball', style: 14, a: '#eef1f6', b: '#9aa3ad', c: '#ffffff', glass: '#ffffff', price: 800 },
  { name: 'Googly Eye', style: 15, a: '#2f7dff', b: '#ffffff', c: '#111111', glass: '#ffffff', price: 550 },
];

// One line about each style, for the marble showroom.
export const STYLE_INFO = [
  "Cat's eye", 'Swirl', 'Galaxy', 'Agate', 'Clearie', 'Steelie', 'Oil slick', 'Onion skin', 'Lava lamp', 'Planet',
  'Snow globe', 'Firefly jar', 'Crackle glass', 'Aurora', 'Disco ball', 'Googly eye',
];

export const FREE_SKINS = SKINS.map((s, i) => (s.price === 0 && !s.level ? i : -1)).filter((i) => i >= 0);
