const key = 'bubblecity-appearance-v1';
export const defaults = {music: true, room: 42, sky: 'workshop', skyAngle: 0, lamps: 100, buttons: 100, pack: 'city'};
let saved;
try { saved = JSON.parse(localStorage.getItem(key)); } catch {}
const valid = (v,min,max,fallback) => Number.isFinite(v) ? Math.min(max,Math.max(min,v)) : fallback;
export const prefs = {
  music: saved?.music !== false,
  sky: saved?.sky === 'neutral' ? 'neutral' : defaults.sky,
  skyAngle: valid(saved?.skyAngle,-180,180,defaults.skyAngle),
  room: valid(saved?.room,15,100,defaults.room),
  lamps: valid(saved?.lamps,0,180,defaults.lamps),
  buttons: valid(saved?.buttons,85,125,defaults.buttons),
  pack: saved?.pack === 'lost' ? 'lost' : 'city'
};
export function savePrefs() { try { localStorage.setItem(key,JSON.stringify(prefs)); } catch {} }
export function applyRoom(scene,sun,fill) {
  const strength=prefs.room/100;
  if (scene.environment?.isCubeTexture) {
    scene.background = prefs.sky === 'workshop' ? scene.environment : scene.userData.neutralBackground;
    scene.backgroundRotation.y = scene.environmentRotation.y = prefs.skyAngle*Math.PI/180;
    if (prefs.sky === 'neutral') scene.background.setRGB(strength*.38,strength*.38,strength*.38);
  }
  scene.backgroundIntensity=strength;
  scene.environmentIntensity=.35+.65*strength;
  sun.intensity=1.05+1.45*strength;
  if(fill) fill.intensity=.7+strength;
}
