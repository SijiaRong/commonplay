// A neutral displacement map leaves the center optically flat. Only the
// rounded lip samples adjacent scene pixels, like a shallow convex lens.
(() => {
  if (!CSS.supports('backdrop-filter', 'url(#lens)')) return;
  const ns = 'http://www.w3.org/2000/svg';
  const make = tag => document.createElementNS(ns, tag);
  const lenses = new WeakMap();
  const observer = new ResizeObserver(entries => {
    for (const {target} of entries) {
      const width = target.offsetWidth;
      const height = target.offsetHeight;
      if (!width || !height) continue;
      const radius = Math.min(parseFloat(getComputedStyle(target).borderTopLeftRadius), height / 2, width / 2);
      const lip = Math.min(9, radius * .52);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      const pixels = ctx.createImageData(width, height);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const dx = x + .5 - width / 2;
          const dy = y + .5 - height / 2;
          const qx = Math.abs(dx) - width / 2 + radius;
          const qy = Math.abs(dy) - height / 2 + radius;
          const corner = Math.hypot(Math.max(0, qx), Math.max(0, qy));
          const depth = radius - corner - Math.min(Math.max(qx, qy), 0);
          const bend = 116 * Math.pow(Math.max(0, 1 - Math.max(0, depth) / lip), 1.4);
          const nx = corner ? Math.max(qx, 0) / corner : Number(qx > qy);
          const ny = corner ? Math.max(qy, 0) / corner : Number(qy >= qx);
          const i = (y * width + x) * 4;
          pixels.data[i] = 128 - Math.sign(dx) * nx * bend;
          pixels.data[i + 1] = 128 - Math.sign(dy) * ny * bend;
          pixels.data[i + 3] = 255;
        }
      }
      ctx.putImageData(pixels, 0, 0);
      lenses.get(target).setAttribute('href', canvas.toDataURL());
    }
  });
  document.querySelectorAll('.glass').forEach((panel, i) => {
    const filter = make('filter');
    filter.id = 'lens-' + i;
    for (const [key, value] of Object.entries({x:0, y:0, width:'100%', height:'100%', 'color-interpolation-filters':'sRGB'})) filter.setAttribute(key, value);
    const image = make('feImage');
    image.setAttribute('preserveAspectRatio', 'none');
    image.setAttribute('result', 'surface');
    const bend = make('feDisplacementMap');
    for (const [key, value] of Object.entries({in:'SourceGraphic', in2:'surface', scale:20, xChannelSelector:'R', yChannelSelector:'G'})) bend.setAttribute(key, value);
    filter.append(image, bend);
    document.getElementById('lenses').append(filter);
    panel.style.setProperty('--lens', 'url(#' + filter.id + ')');
    lenses.set(panel, image);
    observer.observe(panel);
  });
})();
