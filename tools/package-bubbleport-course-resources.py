"""Validate and package the adopted Bubbleport course/material archive."""
from pathlib import Path
import hashlib
import json
import re
import zipfile

repo = Path(__file__).resolve().parent.parent
root = repo / 'assets/bubbleport-course-resources'
manifest = json.loads((root / 'manifest.json').read_text())
catalog = json.loads((root / 'catalog.json').read_text())
errors = []
broken_links = []
for item in manifest['files']:
    file = root / item['file']
    if not file.exists() or hashlib.sha256(file.read_bytes()).hexdigest() != item['sha256']:
        errors.append('File/hash mismatch: ' + item['file'])
        continue
    source = repo / item['source']
    if source.is_file() and not item.get('transformation') and source.read_bytes() != file.read_bytes():
        errors.append('Copied source mismatch: ' + item['file'])
for file in [root / item['file'] for item in manifest['files']]:
    if file.suffix == '.md':
        links = re.findall(r'\]\(([^)]+)\)', file.read_text())
    elif file.suffix == '.html':
        links = re.findall(r'(?:href|src)="([^"]+)"', file.read_text())
    else:
        continue
    for link in links:
        if link.startswith(('http:', 'https:', '#', 'data:')):
            continue
        if not (file.parent / link.split('#')[0]).exists():
            broken_links.append({'file': str(file.relative_to(root)), 'link': link})
images_match = all((root / t['image']).read_bytes() == (repo / t['source']).read_bytes() for t in catalog['tracks'])
if not images_match:
    errors.append('Adopted images do not match sources')
validation = {
    'adoptedTracks': len(catalog['tracks']), 'materials': len(catalog['materials']),
    'textures': catalog['textureCount'], 'fileCount': len(manifest['files']),
    'allHashesVerified': not errors, 'adoptedImagesMatchSources': images_match,
    'brokenLinks': broken_links, 'errors': errors,
}
(root / 'validation.json').write_text(json.dumps(validation, ensure_ascii=False, indent=2) + '\n')
if errors or broken_links:
    raise SystemExit(json.dumps(validation, ensure_ascii=False))
archive = root.parent / 'bubbleport-course-resources-v1.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as output:
    for relative in sorted([item['file'] for item in manifest['files']] + ['manifest.json', 'validation.json']):
        file = root / relative
        output.write(file, file.relative_to(root.parent))
with zipfile.ZipFile(archive) as output:
    failed = output.testzip()
    if failed:
        raise SystemExit('ZIP integrity failure: ' + failed)
    entries = len(output.namelist())
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
archive.with_suffix('.zip.sha256').write_text(digest + '  ' + archive.name + '\n')
print(json.dumps({'zip': str(archive.relative_to(repo)), 'entries': entries,
                  'MiB': round(archive.stat().st_size / 1024 ** 2, 2),
                  'hashesVerified': True, 'brokenLinks': len(broken_links)}, ensure_ascii=False))
