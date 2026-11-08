// Names for the bot marbles that fill each show up to fifty.

const SOLO = [
  'Clink', 'Rollo', 'Pebbles', 'Bonk', 'Ziggy', 'Marbella', 'Swirly', 'Pip', 'Gumball', 'Comet', 'Agate Annie',
  'Glassbeard', 'Sir Spinsalot', 'Mr. Rolly', 'Shiny Pete', 'Blue Moon', 'Clearie', 'Bumblebee', 'Lil Bouncer',
  'Taw', 'Steelie', 'Mibs', 'Bonker', 'Plink', 'Wobbles', 'Dot', 'Jellybean', 'Biscuit', 'Nugget', 'Pickle',
  'Waffles', 'Noodle', 'Sprout', 'Tater', 'Bean', 'Momo', 'Kiwi', 'Mango', 'Pumpkin', 'Snickerdoodle', 'Muffin',
  'Turbo Tom', 'Speedy Sue', 'Roll Model', 'Glass Act', 'Spin Doctor', 'Bowl Cut', 'Round Robin', 'Ball Gown',
  'Rolling Stone', 'Sphere Pressure', 'Orbit', 'Nova', 'Pluto', 'Saturn', 'Luna', 'Cosmo', 'Quasar', 'Nebula',
  'Bubbles', 'Fizz', 'Pop', 'Zoom', 'Whiz', 'Zippy', 'Dash', 'Blitz', 'Rocket', 'Skipper', 'Scooter', 'Hopper',
  'Glimmer', 'Sparkle', 'Prism', 'Opal', 'Jade', 'Ruby', 'Amber', 'Onyx', 'Pearl', 'Topaz', 'Sapphire', 'Jasper',
  'Captain Clack', 'Duke of Roll', 'Lady Marblelot', 'Baron Bounce', 'Count Rollula', 'Sergeant Spin',
  'Gravity Gus', 'Downhill Dan', 'Slippy', 'Tumbles', 'Rumble', 'Clatter', 'Tinker', 'Domino', 'Boing',
];
const ADJ = ['Tiny', 'Speedy', 'Wobbly', 'Shiny', 'Sneaky', 'Lucky', 'Grumpy', 'Jolly', 'Swift', 'Dizzy', 'Cosmic', 'Glassy', 'Bouncy', 'Mighty', 'Sleepy', 'Fuzzy'];
const NOUN = ['Marble', 'Pebble', 'Comet', 'Bean', 'Orb', 'Bubble', 'Button', 'Gumdrop', 'Pellet', 'Bauble', 'Drop', 'Moon'];

export function botName(rng) {
  if (rng.next() < 0.7) return rng.pick(SOLO);
  return rng.pick(ADJ) + ' ' + rng.pick(NOUN);
}

// Display names: printable, trimmed, at most 16 characters.
export function cleanName(raw) {
  const s = String(raw || '')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 16);
  return s;
}
