"""Build scene LODs from the local Hi3D originals. Requires gltfpack and Pillow."""
import io, json, struct, subprocess, tempfile, os
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

here = Path(__file__).resolve().parent
def prepare(src):
    with tempfile.TemporaryDirectory() as tmp:
        lod = Path(tmp) / 'lod.glb'
        # Preserve the observatory's thin balcony rails, arch trim and texture seams.
        observatory = src.stem == '04-moon-observatory'
        simplify = ['-si', '0.08', '-se', '0.001'] if observatory else ['-si', '0.008', '-sa']
        texture_size = 2048 if observatory else 1024
        subprocess.run([os.environ.get('GLTFPACK', 'gltfpack'), '-i', src, '-o', lod,
                        *simplify, '-noq'], check=True)
        raw = lod.read_bytes()
        size, = struct.unpack_from('<I',raw,12)
        doc = json.loads(raw[20:20+size])
        blob = raw[28+size:]
        views = {i['bufferView']:i for i in doc['images']}
        buffer = bytearray()
        for idx,view in enumerate(doc['bufferViews']):
            offset = view.get('byteOffset',0)
            data = blob[offset:offset+view['byteLength']]
            if idx in views:
                im = Image.open(io.BytesIO(data)).convert('RGB')
                im.thumbnail((texture_size,texture_size),Image.Resampling.LANCZOS)
                out = io.BytesIO()
                im.save(out,'JPEG',quality=86,optimize=True)
                data = out.getvalue()
                views[idx]['mimeType'] = 'image/jpeg'
            view.update(byteOffset=len(buffer),byteLength=len(data))
            buffer.extend(data)
            buffer.extend(b'\0'*(-len(buffer)%4))
        doc['buffers'][0]['byteLength']=len(buffer)
        desc=json.dumps(doc,separators=(',',':')).encode()
        desc+=b' '*(-len(desc)%4)
        (here/'models'/src.name).write_bytes(struct.pack('<4sIIII',b'glTF',2,28+len(desc)+len(buffer),len(desc),0x4E4F534A)+desc+struct.pack('<I4s',len(buffer),b'BIN\0')+buffer)
if __name__=='__main__':
    with ThreadPoolExecutor(2) as pool:
        list(pool.map(prepare,sorted((here.parent/'.local/bubbleport-scenery').glob('*.glb'))))
