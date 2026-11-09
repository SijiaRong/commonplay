"""Build progressive startup assets. Meshes, skins and animation bytes are preserved.
Requires Pillow with WebP support. Run from the repository root.
"""
import gzip
import io
import json
import os
import struct
from pathlib import Path
from PIL import Image

ROOT = Path('bubblecity-teddy-slide/dist')
FULL = ROOT / 'startup/full'
FULL.mkdir(parents=True, exist_ok=True)
report = {}

def webp(image, path, size=None):
    if size:
        image = image.copy()
        image.thumbnail((size, size), Image.Resampling.LANCZOS)
    image.save(path, 'WEBP', lossless=True, method=6)

def model(source, target, name, size=512):
    data = source.read_bytes()
    length = struct.unpack_from('<I', data, 12)[0]
    doc = json.loads(data[20:20 + length])
    binary = data[28 + length:]
    images = {image['bufferView']: (i, image) for i, image in enumerate(doc['images'])}
    packed = bytearray()
    for index, view in enumerate(doc['bufferViews']):
        start = view.get('byteOffset', 0)
        chunk = binary[start:start + view['byteLength']]
        if index in images:
            i, definition = images[index]
            image = Image.open(io.BytesIO(chunk))
            full = FULL / f'{name}-{i}.webp'
            webp(image, full)
            definition.setdefault('extras', {})['fullResolution'] = os.path.relpath(full, target.parent)
            small = image.copy()
            small.thumbnail((size, size), Image.Resampling.LANCZOS)
            output = io.BytesIO()
            small.save(output, 'WEBP', lossless=True, method=6)
            chunk = output.getvalue()
            definition['mimeType'] = 'image/webp'
        packed.extend(b'\0' * (-len(packed) % 4))
        view['byteOffset'], view['byteLength'] = len(packed), len(chunk)
        packed.extend(chunk)
    for texture in doc['textures']:
        texture.setdefault('extensions', {})['EXT_texture_webp'] = {'source': texture.pop('source')}
    for key in ['extensionsUsed', 'extensionsRequired']:
        if 'EXT_texture_webp' not in doc.setdefault(key, []):
            doc[key].append('EXT_texture_webp')
    doc['buffers'][0]['byteLength'] = len(packed)
    packed.extend(b'\0' * (-len(packed) % 4))
    text = json.dumps(doc, separators=(',', ':')).encode()
    text += b' ' * (-len(text) % 4)
    result = struct.pack('<III', 0x46546C67, 2, 28 + len(text) + len(packed))
    result += struct.pack('<II', len(text), 0x4E4F534A) + text
    result += struct.pack('<II', len(packed), 0x004E4942) + packed
    target.write_bytes(result)
    report[str(target.relative_to(ROOT))] = {'bytes': len(result), 'gzipBytes': len(gzip.compress(result, compresslevel=5))}

model(ROOT/'teddy-bear-animated.glb', ROOT/'teddy-bear-startup.glb', 'teddy', 512)
model(ROOT/'solo/models/quilted-runway.glb', ROOT/'solo/models/quilted-runway-startup.glb', 'runway', 256)
for folder in ['coral-enamel', 'ash-trim', 'ivory-enamel', 'mint-resin']:
    for layer, ext in [('basecolor', 'jpg'), ('normal', 'png'), ('roughness', 'png')]:
        webp(Image.open(ROOT/f'slide/surfaces/{folder}/{layer}-512.{ext}'), ROOT/f'slide/surfaces/{folder}/{layer}-startup.webp', 256)
webp(Image.open(ROOT/'slide/surfaces/metal-brush-microstructure.png'), ROOT/'slide/surfaces/metal-brush-startup.webp', 128)
for face in ['px', 'nx', 'py', 'ny', 'pz', 'nz']:
    image = Image.open(ROOT/f'slide/room/{face}.jpg')
    image.thumbnail((256, 256), Image.Resampling.LANCZOS)
    image.save(ROOT/f'slide/room/{face}-startup.jpg', quality=86, optimize=True)
logo = Image.open(ROOT/'bubble-city-logo.png')
logo.thumbnail((96, 96), Image.Resampling.LANCZOS)
logo.save(ROOT/'bubble-city-logo-small.png', optimize=True)
# Keep the loading screen's original high-resolution image unchanged.
characters = ROOT/'slide/characters.json'
catalog = json.loads(characters.read_text())
teddy = next(c for c in catalog['characters'] if c['id'] == 'teddy')
teddy.update(model='./teddy-bear-startup.glb', fallbackModel='./teddy-bear-fast.glb', modelBytes=report['teddy-bear-startup.glb']['bytes'])
characters.write_text(json.dumps(catalog, ensure_ascii=False, indent=2)+'\n')
(ROOT/'startup/sizes.json').write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps(report, indent=2))
