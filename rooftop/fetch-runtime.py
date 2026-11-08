"""Fetch the pinned third-party modules used by the rooftop research prototype."""
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile

project = Path(__file__).resolve().parent
destination = project.parent / ".local/lost-marbles/public"
base_url = "https://meticulai.com/games/lost-marbles/"
for name, expected in json.loads((project / "runtime-files.json").read_text()).items():
    target = destination / name
    if target.is_file() and hashlib.sha256(target.read_bytes()).hexdigest() == expected:
        continue
    if target.exists():
        raise SystemExit(f"Existing runtime file differs from pinned version: {target}")
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=target.parent, delete=False) as scratch:
        temporary = Path(scratch.name)
    try:
        subprocess.run(["curl", "-fsSL", "--max-time", "45", "--retry", "2",
                        base_url + name, "-o", str(temporary)], check=True)
        if hashlib.sha256(temporary.read_bytes()).hexdigest() != expected:
            raise SystemExit(f"Upstream version differs from the recorded SHA-256: {name}")
        temporary.replace(target)
    finally:
        temporary.unlink(missing_ok=True)
print("Rooftop runtime verified.")
