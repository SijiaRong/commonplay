"""Repack embedded PNGs as lossless WebP without changing geometry or animations.
Usage: python optimize-character-textures.py source.glb output.glb
Requires Pillow with WebP support. The source GLB remains the compatibility fallback.
"""
import io
import json
import struct
import sys
from pathlib import Path
from PIL import Image

source, target = map(Path, sys.argv[1:])
data = source.read_bytes()
length = struct.unpack_from('<I', data, 12)[0]
document = json.loads(data[20:20 + length])
binary = data[28 + length:]
images = {image['bufferView']: image for image in document['images']}
packed = bytearray()
for index, view in enumerate(document['bufferViews']):
    start = view.get('byteOffset', 0)
    chunk = binary[start:start + view['byteLength']]
    if index in images:
        image = Image.open(io.BytesIO(chunk))
        output = io.BytesIO()
        image.save(output, 'WEBP', lossless=True, method=6)
        chunk = output.getvalue()
        images[index]['mimeType'] = 'image/webp'
    packed.extend(b'\0' * (-len(packed) % 4))
    view['byteOffset'] = len(packed)
    view['byteLength'] = len(chunk)
    packed.extend(chunk)
for texture in document['textures']:
    texture.setdefault('extensions', {})['EXT_texture_webp'] = {'source': texture.pop('source')}
for key in ['extensionsUsed', 'extensionsRequired']:
    document.setdefault(key, []).append('EXT_texture_webp')
document['buffers'][0]['byteLength'] = len(packed)
packed.extend(b'\0' * (-len(packed) % 4))
text = json.dumps(document, separators=(',', ':')).encode()
text += b' ' * (-len(text) % 4)
result = struct.pack('<III', 0x46546C67, 2, 28 + len(text) + len(packed))
result += struct.pack('<II', len(text), 0x4E4F534A) + text
result += struct.pack('<II', len(packed), 0x004E4942) + packed
target.write_bytes(result)
print(f'{source}: {len(data)} -> {len(result)} bytes (lossless textures)')
