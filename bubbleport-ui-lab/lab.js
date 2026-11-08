const $ = id => document.getElementById(id);
const tabs = [...document.querySelectorAll('nav button')];
const runners = ['薄荷汽水', '蜜桃乌龙', '星尘苏打', '琥珀布丁'];
let frame, started, bonus, lastBoost, result;
function standings(seconds) {
  const distances = [seconds / 12 + bonus, seconds / 10.8 + .015, seconds / 11.5 + .008, seconds / 13];
  return runners.map((name, index) => ({ name, distance: distances[index] })).sort((a,b) => b.distance - a.distance);
}
function tick(now) {
  const seconds = (now - started) / 1000;
  const order = standings(seconds);
  const rank = order.findIndex(r => r.name === runners[0]) + 1;
  const progress = Math.min(100, (seconds / 12 + bonus) * 100);
  $('place').textContent = rank;
  const ranking = order.map(r => r.name).join(',');
  if ($('ranking').dataset.order !== ranking) {
    $('ranking').replaceChildren(...order.map(({name}) => {
      const item = document.createElement('li');
      item.textContent = name;
      item.classList.toggle('me', name === runners[0]);
      return item;
    }));
    $('ranking').dataset.order = ranking;
  }
  $('pct').textContent = Math.floor(progress) + '%';
  document.querySelector('progress').value = progress;
  $('boost').disabled = now - lastBoost < 900;
  $('boost').textContent = $('boost').disabled ? '加速中…' : '冲刺加速 ↑';
  if (progress >= 100) {
    result = {rank, seconds};
    show('finish');
  } else frame = requestAnimationFrame(tick);
}
function show(stage) {
  cancelAnimationFrame(frame);
  document.body.dataset.stage = stage;
  tabs.forEach(tab => {
    const selected = tab.dataset.stage === stage;
    tab.setAttribute('aria-pressed', selected);
    $(tab.dataset.stage).hidden = !selected;
  });
  if (stage === 'race') {
    started = performance.now();
    bonus = 0;
    lastBoost = -Infinity;
    tick(started);
  }
  if (stage === 'finish') {
    $('result').textContent = result ? result.rank + ' / 4' : '2 / 4';
    $('time').textContent = result ? result.seconds.toFixed(2) + ' s' : '11.20 s';
    document.querySelector('#finish .course').textContent = result ? '环港线完赛' : '环港线 · 结算预览';
  }
}
tabs.forEach(tab => tab.onclick = () => show(tab.dataset.stage));
$('start').onclick = $('again').onclick = () => show('race');
$('boost').onclick = () => {
  const now = performance.now();
  if (now - lastBoost >= 900) {
    lastBoost = now;
    bonus += .075;
  }
};
function settings(open) {
  $('settings').hidden = !open;
  $('tune').setAttribute('aria-expanded', open);
}
$('tune').onclick = () => settings($('settings').hidden);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !$('settings').hidden) {
    settings(false);
    $('tune').focus();
  }
});
$('glass').onchange = () => {
  document.body.classList.toggle('solid', !$('glass').checked);
  $('blur').disabled = !$('glass').checked;
};
$('blur').oninput = () => {
  document.documentElement.style.setProperty('--blur', $('blur').value + 'px');
  $('value').textContent = $('blur').value + ' px';
};
$('motion').checked = !matchMedia('(prefers-reduced-motion: reduce)').matches;
$('motion').onchange = () => document.body.classList.toggle('still', !$('motion').checked);
$('motion').onchange();
document.querySelectorAll('.glass').forEach(panel => {
  panel.addEventListener('pointermove', event => {
    if (!$('motion').checked || event.pointerType === 'touch') return;
    const bounds = panel.getBoundingClientRect();
    panel.style.setProperty('--shine-y', (event.clientY - bounds.top) / bounds.height * 100 + '%');
    panel.style.setProperty('--shine', (event.clientX - bounds.left) / bounds.width * 100 + '%');
  });
});
show('lobby');
