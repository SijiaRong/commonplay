"""Archive current component files without regenerating or overwriting designs."""
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parent
archive = ROOT.parent / "bubbleport-components-v2.zip"
with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as bundle:
    for file in sorted(ROOT.rglob("*")):
        if file.is_file() and "__pycache__" not in file.parts:
            bundle.write(file, Path(ROOT.name) / file.relative_to(ROOT))
print(archive)
print(f"{archive.stat().st_size / 1024 / 1024:.1f} MiB")
