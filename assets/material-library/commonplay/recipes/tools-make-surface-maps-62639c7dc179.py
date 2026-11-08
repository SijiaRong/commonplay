"""Rebuild the tileable Bubble City coatings with numpy and Pillow."""
from pathlib import Path

import numpy as np
from PIL import Image

SIZE = 1024
OUTPUT = Path(__file__).resolve().parents[1] / "dist/slide/surfaces"
FREQUENCY = np.fft.fftfreq(SIZE)
FX, FY = np.meshgrid(FREQUENCY, FREQUENCY)


def periodic_field(rng, radius_x, radius_y=None):
    """Smooth a toroidal field with a Gaussian; keep unit RMS at each scale."""
    if radius_y is None:
        radius_y = radius_x
    spectrum = np.fft.fft2(rng.standard_normal((SIZE, SIZE)))
    kernel = np.exp(-2 * np.pi**2 * ((FX * radius_x)**2 + (FY * radius_y)**2))
    field = np.fft.ifft2(spectrum * kernel).real
    return np.clip((field - field.mean()) / field.std(), -3, 3)


def normal_map(height):
    # Texture row indices point down, whereas OpenGL tangent-space V points up.
    dx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) / 2
    dy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) / 2
    normal = np.stack([-dx, dy, np.ones_like(dx)], axis=2)
    return normal / np.linalg.norm(normal, axis=2, keepdims=True)


def encode(pixels):
    return np.clip(np.rint(pixels), 0, 255).astype('uint8')


def make_coating(name, seed, pigment, roughness, is_enamel):
    rng = np.random.default_rng(seed)
    # Pigment dispersion, fine orange peel, powder grains and scattered inclusions.
    cloudy = periodic_field(rng, 28)
    peel = periodic_field(rng, 4.8)
    grain = periodic_field(rng, 1.35)
    specks = np.clip((periodic_field(rng, 1.8) - 1.7) / 1.25, 0, 1)
    # Gentle tooling/surface polish affects roughness more strongly than hue.
    polish = periodic_field(rng, 12, 1.8)
    if is_enamel:
        luminance = .95 * cloudy + 1.8 * peel + 1.4 * grain - 7.0 * specks
        height = .46 * peel + .12 * grain + .23 * specks
        microsurface = roughness + .018 * cloudy + .026 * peel + .018 * grain + .045 * specks
    else:
        luminance = 1.15 * cloudy + .85 * peel + .65 * grain - 3.2 * specks
        height = .21 * peel + .045 * grain + .056 * polish
        microsurface = roughness + .014 * cloudy + .015 * peel + .012 * polish + .018 * specks

    color = np.asarray(pigment) + luminance[:, :, None]
    normal = normal_map(height)
    dest = OUTPUT / name
    dest.mkdir(parents=True, exist_ok=True)
    for resolution in (SIZE, SIZE // 2):
        suffix = '' if resolution == SIZE else '-512'
        rgb = Image.fromarray(encode(color))
        rough = Image.fromarray(encode(microsurface * 255))
        n = normal
        if resolution != SIZE:
            rgb = rgb.resize((resolution, resolution), Image.Resampling.BOX)
            rough = rough.resize((resolution, resolution), Image.Resampling.BOX)
            # Average then renormalize normal vectors for the mobile texture.
            n = n.reshape(resolution, 2, resolution, 2, 3).mean(axis=(1, 3))
            n = n / np.linalg.norm(n, axis=2, keepdims=True)
        rgb.save(dest / f'basecolor{suffix}.jpg', quality=100, subsampling=0, optimize=True)
        rough.save(dest / f'roughness{suffix}.png', optimize=True)
        Image.fromarray(encode((n + 1) * 127.5)).save(dest / f'normal{suffix}.png', optimize=True)


if __name__ == '__main__':
    make_coating('ivory-enamel', 6417, [238, 226, 200], .48, True)
    make_coating('mint-resin', 3401, [141, 199, 173], .29, False)
