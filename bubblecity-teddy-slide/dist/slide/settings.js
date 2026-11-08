import {bindBackgroundMusic} from './background-music.js';
import {bindEnvironment} from './environment-controls.js';
import {loadLostPack,applyTrackPack} from './lost-pack.js';
import {prefs, savePrefs, defaults, applyRoom} from './preferences.js';

export const settingsOpen = () => !!document.querySelector('#appearance')?.open;

export async function installSettings({scene,sun,renderer,fill}, materials, musicName) {
  const dialog=document.createElement('dialog');
  dialog.id='appearance';
  dialog.setAttribute('aria-labelledby','settings-title');
  dialog.innerHTML=`<div class="appearance-title"><h2 id="settings-title">场景设置</h2><button type="button" aria-label="关闭设置" data-close>×</button></div>
    <label for="background-music">背景音乐<input id="background-music" type="checkbox"></label>
    <div data-environment></div>
    ${materials ? '<label for="lamp-bright">航标灯亮度 <output></output></label><input id="lamp-bright" type="range" min="0" max="180"><fieldset><legend>赛道材质包</legend><button data-pack="city">泡泡星港</button> <button data-pack="lost">Lost Marbles</button></fieldset><p>随包切换：路面、支架、饰条和涂色护栏。</p><p>固定：工作室背景、角色、软胶与软垫、星港灯具和装饰、赛道标记、布局与碰撞。</p>' : '<p>自由练习使用工作室背景和角色；赛道材质可在闯关或经典滑梯中切换。</p>'}
    <label for="touch-size">触控按钮大小 <output></output></label><input id="touch-size" type="range" min="85" max="125">
    <p role="status"></p><button type="button" data-reset>恢复默认</button>`;
  document.body.append(dialog);
  const opener=document.createElement('button');
  opener.id='open-settings'; opener.type='button'; opener.textContent='设置';
  opener.setAttribute('aria-haspopup','dialog');
  document.querySelector('nav').append(opener);
  const pause=()=>window.dispatchEvent(new Event('scene-settings-change'));
  opener.onclick=()=>{ if(document.pointerLockElement) document.exitPointerLock();dialog.showModal();pause(); };
  dialog.querySelector('[data-close]').onclick=()=>dialog.close();
  dialog.onclose=pause;
  const status=dialog.querySelector('[role=status]');
  const choices=[...dialog.querySelectorAll('[data-pack]')];
  const ranges=[];
  function apply() {
    applyRoom(scene,sun,fill);
    document.documentElement.style.setProperty('--touch-scale',prefs.buttons/100);
  }
  function range(id,key) {
    const input=dialog.querySelector(id);
    if(!input) return;
    const output=input.previousElementSibling.querySelector('output');
    const sync=()=>{input.value=prefs[key];output.textContent=prefs[key]+'%';};
    input.oninput=()=>{prefs[key]=input.valueAsNumber;sync();apply();savePrefs();};
    ranges.push(sync);sync();
  }
  const resetMusic=bindBackgroundMusic(dialog.querySelector('#background-music'), musicName);
  const resetEnvironment=bindEnvironment(dialog.querySelector('[data-environment]'),apply);
  range('#lamp-bright','lamps');range('#touch-size','buttons');apply();
  const reset=dialog.querySelector('[data-reset]');
  const city={};
  if(materials) for(const key of ['road','resin','trim','paint']) city[key]=materials[key].clone();
  let lost;
  async function switchPack(pack) {
    for(const button of choices) button.disabled=true;
    reset.disabled=true;
    try {
      if(pack==='lost'&&!lost){
        status.textContent='正在载入木纹…';
        lost=await loadLostPack(renderer,matchMedia('(pointer: coarse)').matches);
      }
      const source=pack==='lost'?lost:city;
      applyTrackPack(materials,source);
      prefs.pack=pack;savePrefs();status.textContent='';
    } catch {
      prefs.pack='city';savePrefs();status.textContent='木纹载入失败，请再试一次。';
    } finally {
      for(const button of choices){button.disabled=false;button.setAttribute('aria-pressed',String(button.dataset.pack===prefs.pack));}
      reset.disabled=false;
    }
  }
  choices.forEach(button=>button.onclick=()=>switchPack(button.dataset.pack));
  reset.onclick=async()=>{resetMusic();resetEnvironment();prefs.buttons=defaults.buttons;if(materials)prefs.lamps=defaults.lamps;
    ranges.forEach(sync=>sync());apply();savePrefs();if(materials)await switchPack('city');};
  if(materials)await switchPack(prefs.pack);
}
