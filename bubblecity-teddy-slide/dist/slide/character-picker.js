import {TextureLoader, SRGBColorSpace} from 'three';
import {createRider} from './rider.js?v=dock';

const storageKey = 'bubblecity-rider';

export async function loadRoster(loader, scale) {
  const response = await fetch('./slide/characters.json?v=robots-1', {cache: 'no-store'});
  if (!response.ok) throw Error('角色列表读取失败');
  const {characters} = await response.json();
  const teddy = characters.find(character => character.id === 'teddy' && character.ready);
  if (!teddy) throw Error('默认角色缺失');
  let saved;
  try { saved = localStorage.getItem(storageKey); } catch {}
  let selected = characters.find(character => character.id === saved && character.ready) || teddy;
  async function load(character) {
    const gltf = await loader.loadAsync(character.model);
    const rider = createRider(gltf, {...character, scale: scale ?? character.scale});
    rider.reset();
    return rider;
  }
  let rider;
  try { rider = await load(selected); }
  catch (error) {
    if (selected === teddy) throw error;
    selected = teddy;
    rider = await load(teddy);
  }
  return {characters, selected, rider, load};
}

export function installCharacterPicker(roster, {player, renderer, camera, scene, replace, onOpen}) {
  const dialog = document.querySelector('#character-picker');
  const trigger = document.querySelector('#choose-character');
  const choices = dialog.querySelector('#character-options');
  const status = dialog.querySelector('#character-status');
  const close = dialog.querySelector('#close-character-picker');
  let selected = roster.selected;
  let busy = false;

  let stationTexture, previousBackground;
  const hiddenScenery = [];
  function frameStation() {
    if (!dialog.open || !stationTexture?.image) return;
    const image = stationTexture.image;
    const aspect = (innerWidth / innerHeight) / (image.width / image.height);
    stationTexture.repeat.set(Math.min(1, aspect), Math.min(1, 1 / aspect));
    stationTexture.offset.set((1 - stationTexture.repeat.x) / 2, (1 - stationTexture.repeat.y) / 2);
    scene.background = stationTexture;
  }
  window.addEventListener('resize', frameStation);

  function refresh() {
    trigger.querySelector('img').src = selected.preview;
    trigger.querySelector('#character-name').textContent = selected.name;
    for (const button of choices.children) {
      const active = button.dataset.character === selected.id;
      button.setAttribute('aria-pressed', String(active));
      button.querySelector('.character-state').textContent = active ? '✓' : '';
      button.disabled = busy;
    }
    close.disabled = busy;
  }

  for (const character of roster.characters.filter(character => character.ready)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'character-card';
    button.dataset.character = character.id;
    button.innerHTML = '<img alt=""><strong></strong><span class="character-state" aria-hidden="true"></span>';
    button.querySelector('img').src = character.preview;
    button.querySelector('strong').textContent = character.name;
    button.title = character.tagline;
    choices.append(button);
    button.onclick = async () => {
      if (busy) return;
      if (character.id === selected.id) return;
      busy = true;
      refresh();
      status.textContent = '正在加载' + character.name + '…';
      let candidate;
      try {
        candidate = await roster.load(character);
        await renderer.compileAsync(candidate.model, camera, scene);
        replace(candidate,character);
        candidate = null;
        selected = character;
        try { localStorage.setItem(storageKey, selected.id); } catch {}
        status.textContent = '';
      } catch (error) {
        candidate?.dispose();
        console.error('角色切换失败', error);
        status.textContent = '角色加载失败，请重试或选择其他角色。';
      } finally {
        busy = false;
        refresh();
        if (dialog.open) button.focus();
      }
    };
  }
  refresh();
  trigger.disabled = false;
  trigger.onclick = () => {
    onOpen();
    status.textContent = '';
    previousBackground = scene.background;
    dialog.showModal();
    for (const object of scene.children) {
      if (object.visible && object !== player && !object.isLight) {
        hiddenScenery.push(object);
        object.visible = false;
      }
    }
    if (!stationTexture) {
      stationTexture = new TextureLoader().load('./slide/party-station.jpg', frameStation);
      stationTexture.colorSpace = SRGBColorSpace;
    }
    frameStation();
    choices.querySelector('[aria-pressed="true"]').focus();
  };
  close.onclick = () => dialog.close();
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  dialog.addEventListener('close', () => {
    scene.background = previousBackground;
    for (const object of hiddenScenery.splice(0)) object.visible = true;
    trigger.focus();
  });
  return () => dialog.open || busy;
}
