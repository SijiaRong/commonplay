"""Write a timed toy cannon thump for the 40-second edit."""
import array
import json
import math
import random
import sys
import wave
from pathlib import Path

event = json.loads(Path(sys.argv[1]).read_text())
rate = 48000
start = round(event["frame"] * rate / event["fps"])
samples = array.array("h", [0]) * (40 * rate)
noise = random.Random(47)
phase = 0.0
low = 0.0
for i in range(round(0.55 * rate)):
    t = i / rate
    phase += math.tau * (67 + 129 * math.exp(-t / 0.034)) / rate
    white = noise.uniform(-1, 1)
    low += 0.17 * (white - low)
    body = math.sin(phase) * math.exp(-t / 0.10)
    air = (0.37 * white + 1.45 * low) * math.exp(-t / 0.052)
    transient = math.sin(phase * 4.2) * math.exp(-t / 0.014)
    pop = (0.72 * body + 0.60 * air + 0.22 * transient) * min(1, t / 0.002)
    samples[start + i] = round(25000 * math.tanh(pop))

if sys.byteorder != "little":
    samples.byteswap()
with wave.open(sys.argv[2], "wb") as wav:
    wav.setparams((1, 2, rate, 0, "NONE", "not compressed"))
    wav.writeframes(samples.tobytes())
