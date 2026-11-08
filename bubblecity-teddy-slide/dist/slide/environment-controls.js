import {prefs, defaults, savePrefs} from './preferences.js';

export function bindEnvironment(container, apply) {
  container.innerHTML = `<label>天空盒<select id="sky-mode"><option value="workshop">工作室六面图</option><option value="neutral">中性灰背景</option></select></label>
    <label for="sky-angle">环境旋转 <output></output></label><input id="sky-angle" type="range" min="-180" max="180">
    <label for="room-bright">房间亮度 <output></output></label><input id="room-bright" type="range" min="15" max="100">`;
  const mode = container.querySelector('select');
  const sliders = [
    [container.querySelector('#sky-angle'), 'skyAngle', '°'],
    [container.querySelector('#room-bright'), 'room', '%']
  ];
  function sync() {
    mode.value = prefs.sky;
    for (const [input,key,unit] of sliders) {
      input.value = prefs[key];
      input.previousElementSibling.querySelector('output').value = prefs[key]+unit;
    }
    apply();
  }
  mode.onchange = ()=>{prefs.sky=mode.value;sync();savePrefs();};
  for (const [input,key] of sliders) input.oninput=()=>{prefs[key]=input.valueAsNumber;sync();savePrefs();};
  sync();
  return ()=>{for(const key of ['sky','skyAngle','room']) prefs[key]=defaults[key];sync();savePrefs();};
}
