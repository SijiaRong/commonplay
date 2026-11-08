"""Collect the checkout's material inputs. Requires Python 3 and Pillow for thumbnails."""
import base64
import hashlib
import io
import json
import os
from pathlib import Path
import re
import struct
import subprocess
import zipfile

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
LIB = Path('assets/material-library')
WEB = Path('material-atlas/dist/library')
LM = 'lost-marbles'
CP = 'commonplay'
records = {}
textures = {}
model_count = 0


def project_files():
    names = subprocess.check_output(['git', 'ls-files', '-z', '-co', '--exclude-standard'])
    files = set()
    for raw in filter(None, names.split(b'\0')):
        path = Path(os.fsdecode(raw))
        if path == LIB or path == WEB or LIB in path.parents or WEB in path.parents:
            continue
        if path.is_file():
            files.add(path)
        elif path.is_symlink() and path.is_dir() and path.resolve().is_relative_to(ROOT):
            files.update(p for p in path.rglob('*') if p.is_file())
    return sorted(files)


def write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.is_symlink():
        path.unlink()
    if not path.exists() or path.read_bytes() != data:
        path.write_bytes(data)


def link(path, source):
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.symlink_to(os.path.relpath(source, path.parent))


def encoded(obj):
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()


def origin(path):
    s = path.as_posix()
    if ('/lm/' in s or '/lost-marbles/' in s or '/slide/wood/' in s or
        path.name.startswith(('ash_veneer', 'oak_veneer', 'room_bg', 'room_1k', 'room_512')) or
        path.name in {'wooden-chute.glb', 'lost-pack.js'} or '/models/classic' in s or
        s.endswith(('/shared/skins.js', '/shared/looks.js'))):
        return LM
    return CP


def note(path):
    s = str(path)
    if re.search(r'ash.veneer|oak.veneer|/slide/wood/|room_bg|room_(1k|512)\.hdr', s):
        return 'Lost Marbles 采用的 Poly Haven 扫描 / 房间环境，CC0。'
    if s == 'material-atlas/dist/stage.js':
        return 'Commonplay 标本室展示逻辑，含 Lost Marbles 道具与特效的材质取样。'
    if path.name == 'wooden-chute.glb' or '/models/classic' in s:
        return '由 Lost Marbles 赛道烘焙；包含原版程序印刷纹理与木材扫描。项目运行时另有材质覆盖。'
    if 'ash-trim' in s:
        return '项目饰条基于 Jenelle van Heerden 的 Ash Veneer（Poly Haven，CC0）；底色经过调色。'
    if origin(path) == LM:
        return 'Lost Marbles 来源或其烘焙／摘录版本。保留 Meticulai 与各素材作者署名。'
    if 'room' in s and path.suffix.lower() in {'.jpg', '.hdr'}:
        return '项目工作室场景使用；包含环境输入、拼接与捕获版本，按各原始资源的许可使用。'
    if path.suffix in {'.gltf', '.glb'}:
        return 'Commonplay 项目模型材质。Hi3D 原件、处理版本和运行版沿用各模型记录中的授权。'
    if 'acrylic.js' in s or '/solo/js/render/' in s or '/slide/course-materials' in s or '/slide/film/' in s:
        return '项目运行版本，含参考或改编自 Lost Marbles 的渲染方法；详见源文件注释。'
    return 'Commonplay 项目制作或整合；归档分组描述来源链，具体署名与授权沿用源文件。'


def add(kind, path, data, title, suffix, group=None):
    key = hashlib.sha256(data).hexdigest()
    ident = (kind, key)
    if ident not in records:
        group = group or origin(path)
        dest = Path(group, kind, re.sub(r'[^\w.-]+', '-', title)[:100] + '-' + key[:12] + suffix)
        records[ident] = dict(kind=kind, group=group, title=title, sha256=key, file=str(dest),
                              sources=[], notes=[], channels=[])
    row = records[ident]
    if str(path) not in row['sources']:
        row['sources'].append(str(path))
    credit = note(path)
    if credit not in row['notes']:
        row['notes'].append(credit)
    return row


def image_record(path, raw, suffix, title, channels):
    row = add('textures', path, raw, title, suffix)
    for name in channels:
        if name not in row['channels']:
            row['channels'].append(name)
    dest = LIB / row['file']
    if row['sha256'] not in textures:
        write(dest, raw)
        textures[row['sha256']] = row
        if suffix != '.hdr':
            with Image.open(io.BytesIO(raw)) as img:
                row['size'] = list(img.size)
                row['thumb'] = 'thumbs/' + row['sha256'][:16] + '.jpg'
                thumb = WEB / row['thumb']
                if not thumb.exists():
                    thumb.parent.mkdir(parents=True, exist_ok=True)
                    img.thumbnail((224, 136))
                    img.convert('RGB').save(thumb, quality=77)
        else:
            match = re.search(rb'-Y (\d+) \+X (\d+)', raw[:2048])
            if match:
                row['size'] = [int(match[2]), int(match[1])]
    return row


def loose(path):
    s = path.as_posix()
    return (path.suffix.lower() in {'.jpg', '.png', '.hdr', '.webp', '.jpeg'} and
            ('/surfaces/' in s or '/wood/' in s or '/textures/' in s or
             s.startswith('material-atlas/dist/assets/') or path.name.startswith('room_bg') or
             ('/room/' in s and path.stem != 'preview')))


def channel(path):
    n = path.stem.lower()
    for token, name in [('normal','法线'),('nor_gl','法线'),('rough','粗糙度'),('metallic','金属度'),
                        ('emissive','自发光'),('height','高度'),('brush','粗糙度 / 凹凸'),
                        ('basecolor','底色'),('diff','底色')]:
        if token in n:
            return name
    return '环境光' if path.suffix == '.hdr' else '底色' if n == 'oak' else '环境画面'


def slots(data):
    for key, val in data.items():
        if isinstance(val, dict):
            if key.endswith('Texture') and 'index' in val:
                yield key, val['index']
            else:
                yield from slots(val)


def model(path):
    global model_count
    model_count += 1
    blob = path.read_bytes()
    if path.suffix == '.glb':
        length = struct.unpack_from('<I', blob, 12)[0]
        doc = json.loads(blob[20:20+length])
        start = 28 + length
    else:
        doc = json.loads(blob)
    bindings = doc.get('textures', [])
    labels = {}
    for mat in doc.get('materials', []):
        for key, index in slots(mat):
            tex = bindings[index]
            idx = tex.get('source', tex.get('extensions', {}).get('KHR_texture_basisu', {}).get('source'))
            labels.setdefault(idx, set()).add(key)
    imgs = []
    for i, img in enumerate(doc.get('images', [])):
        uri = img.get('uri')
        if uri and not uri.startswith('data:'):
            source = path.parent / uri
            raw = source.read_bytes()
        elif uri:
            raw = base64.b64decode(uri.split(',', 1)[1])
        else:
            view = doc['bufferViews'][img['bufferView']]
            pos = start + view.get('byteOffset', 0)
            raw = blob[pos:pos + view['byteLength']]
        suffix = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }.get(img.get('mimeType')) or Path(uri).suffix
        title = model_name(path) + '-' + str(i)
        row = image_record(path, raw, suffix, title, sorted(labels.get(i, [])))
        if uri and not uri.startswith('data:') and str(source) not in row['sources']:
            row['sources'].append(str(source))
        imgs.append({'image': i, 'sha256': row['sha256'], 'file': row['file']})
    spec = {k: doc[k] for k in ['materials','textures','samplers','extensionsUsed'] if k in doc}
    spec['images'] = imgs
    spec['primitiveMaterialSlots'] = [[p.get('material') for p in m['primitives']] for m in doc.get('meshes', [])]
    raw = encoded(spec)
    row = add('model-materials', path, raw, model_name(path), '.json')
    write(LIB / row['file'], raw)
    row['slots'] = len(doc.get('materials', []))
    row['parameters'] = doc.get('materials', [])
    row['images'] = [i['sha256'] for i in imgs]
    if imgs and 'thumb' in textures[imgs[0]['sha256']]:
        row['thumb'] = textures[imgs[0]['sha256']]['thumb']


def model_name(path):
    return path.parents[1].name + '-' + path.stem if path.parent.name == 'models' and 'toy-town-personas' in path.parts else path.stem


def recipe(path):
    if path.suffix not in {'.js','.mjs','.py','.html','.json'}:
        return False
    s = str(path)
    if ('vendor' in path.parts or 'addons' in path.parts or path.name.startswith('three.') or
        path.name in {'GroundedSkybox.js', 'RoomEnvironment.js'} or s.startswith('assets/lost-marbles/') or
        '/review/' in s or path.name.startswith('verify')):
        return False
    if s.startswith('tools/'):
        return path.name in {'build-bubbleport-robots.py', 'toy-model-review.html', 'track-sample-review.html', 'lost-marbles-gallery.html', 'lost-marbles-modules.html'}
    if path.suffix == '.json':
        return path.name in {'presets.json','texture-workflow.json','lighting-presets.json'}
    if path.stat().st_size > 700000:
        return False
    code = path.read_text(errors='replace')
    return bool(re.search(r'new (?:THREE\.|T\.)?\w*(?:Material|CanvasTexture)\s*\(|\.materials\.new\(|makePeachAcrylic|def normal_map|export const (?:SKINS|FINISHES)|export function build\(k[,)]|createBubbleportMaterials', code))


def build():
    previous = json.loads((LIB/'manifest.json').read_text())['items'] if (LIB/'manifest.json').exists() else []
    files = project_files()
    # Reference inputs win the canonical location when an original project's material reuses identical bytes.
    files.sort(key=lambda p: (origin(p) != LM, str(p).startswith('material-atlas'), str(p)))
    for path in filter(loose, files):
        image_record(path, path.read_bytes(), path.suffix, path.parent.name+'-'+path.stem, [channel(path)])
    for path in files:
        if path.suffix in {'.glb','.gltf'}:
            model(path)
        elif recipe(path):
            raw = path.read_bytes()
            row = add('recipes', path, raw, path.parent.name+'-'+path.stem, path.suffix)
            write(LIB / row['file'], raw)
    rows = list(records.values())
    samples = json.loads(subprocess.check_output(['node', 'tools/material-library-samples.mjs']))
    data = {'schema':1, 'modelFiles':model_count, 'items':rows, 'samples':samples}
    current_paths = {row['file'] for row in rows}
    for row in previous:
        stale = Path(row['file'])
        if len(stale.parts) == 3 and stale.parts[0] in {LM, CP} and str(stale) not in current_paths:
            (LIB/stale).unlink(missing_ok=True)
    write(LIB/'manifest.json', encoded(data))
    write(WEB/'inventory.js', b'window.materialInventory='+encoded(data)+b';\n')
    for name in ['index.html','inventory.js','browse.js','library.css']:
        write(LIB/name, (WEB/name).read_bytes())
    link(LIB/'thumbs', WEB/'thumbs')
    notices = {'LICENSE-Commonplay.txt':Path('LICENSE'), 'LICENSE-Three.txt':Path('material-atlas/dist/vendor/LICENSE-three')}
    for name, source in notices.items():
        write(LIB/name, source.read_bytes())
    archive = ROOT/'.local/commonplay-material-library.zip'
    archive.parent.mkdir(exist_ok=True)
    temp = archive.with_suffix('.tmp')
    with zipfile.ZipFile(temp,'w',allowZip64=True) as out:
        for path in [LIB / row['file'] for row in rows] + [LIB/n for n in ['manifest.json','README.md','index.html','inventory.js','browse.js','library.css']] + sorted((LIB/'thumbs').glob('*.jpg')) + [LIB/name for name in notices]:
            out.write(path, str(path.relative_to(LIB)), compress_type=zipfile.ZIP_DEFLATED if path.suffix in {'.json','.js','.html','.css','.md','.mjs','.py'} else zipfile.ZIP_STORED)
    temp.replace(archive)
    print(f'{len(textures)} unique textures, {model_count} model files, {len(rows)} entries; {archive}')


if __name__ == '__main__':
    build()
