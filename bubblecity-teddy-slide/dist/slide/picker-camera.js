import {Vector3, MathUtils} from 'three';

// Blend the normal shot with a front three-quarter view in the space beside the drawer.
export function createPickerCamera(camera, elevation = .13) {
  const panel = document.querySelector('#character-picker');
  const bottomDock = matchMedia('(max-width: 680px) and (orientation: portrait)');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const center = new Vector3(), previewEye = new Vector3(), previewLook = new Vector3();
  let blend = 0, freeWidth = 1, freeHeight = 1;
  function measure() {
    if (!panel.open) return;
    const rect = panel.getBoundingClientRect();
    freeWidth = bottomDock.matches ? 1 : rect.left / innerWidth;
    freeHeight = bottomDock.matches ? rect.top / innerHeight : 1;
  }
  new ResizeObserver(measure).observe(panel);
  window.addEventListener('resize', measure);

  return (eye, look, rider, dt) => {
    const goal = Number(panel.open);
    if (!goal && blend < .001) { blend = 0; return; }
    if (goal && !blend) measure();
    blend = MathUtils.lerp(blend, goal, reducedMotion.matches ? 1 : 1 - Math.exp(-10 * dt));
    const {model, previewSize} = rider;
    model.getWorldPosition(center);
    center.y += previewSize.y * .5;
    const yaw = model.parent.rotation.y + model.rotation.y + .28;
    const tan = Math.tan(MathUtils.degToRad(camera.fov * .5));
    const width = Math.hypot(previewSize.x, previewSize.z);
    const distance = Math.max(previewSize.y / (.68 * freeHeight), width / (.8 * freeWidth * camera.aspect)) / (2 * tan) + width * .32;
    previewLook.copy(center);
    previewEye.copy(center);
    previewEye.x += Math.sin(yaw) * distance;
    previewEye.z += Math.cos(yaw) * distance;
    previewEye.y += distance * elevation;
    const halfHeight = distance * tan;
    const shift = (1 - freeWidth) * camera.aspect * halfHeight;
    previewLook.x += Math.cos(yaw) * shift;
    previewLook.z -= Math.sin(yaw) * shift;
    previewLook.y -= (1 - freeHeight) * halfHeight;
    previewEye.add(previewLook).sub(center);
    eye.lerp(previewEye, blend);
    look.lerp(previewLook, blend);
  };
}
