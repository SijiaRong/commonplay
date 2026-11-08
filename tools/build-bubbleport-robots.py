"""Rebuild Bubbleport desktop GLBs from their archived Hi3D originals.

Run from the repository root with numpy, scipy and Pillow installed.
Pass one or more character directory names, or omit them to rebuild all seven.
Landmarks and component selections refer to these specific source meshes.
"""

import io
import json
import struct
import sys
from copy import deepcopy
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
from scipy.spatial.transform import Rotation

ROOT = Path("assets/toy-town-personas")


def read(file):
    raw = file.read_bytes()
    size = struct.unpack_from("<I", raw, 12)[0]
    return json.loads(raw[20 : 20 + size]), raw[28 + size :]


def arr(g, data, idx):
    a = g["accessors"][idx]
    v = g["bufferViews"][a["bufferView"]]
    n = {"VEC3": 3, "VEC2": 2, "SCALAR": 1, "VEC4": 4, "MAT4": 16}[a["type"]]
    dt = {5126: "<f4", 5125: "<u4", 5123: "<u2", 5121: "u1"}[a["componentType"]]
    return np.frombuffer(
        data,
        dt,
        count=a["count"] * n,
        offset=v.get("byteOffset", 0) + a.get("byteOffset", 0),
    ).reshape(-1, n)


def geom(g, b):
    prim = g["meshes"][0]["primitives"][0]
    return arr(g, b, prim["attributes"]["POSITION"]), arr(
        g, b, prim["indices"]
    ).reshape(-1, 3)


def labels(p, i):
    _, u = np.unique(p.round(6), axis=0, return_inverse=True)
    faces = u[i]
    edges = coo_matrix(
        (
            np.ones(len(i) * 2, "B"),
            (np.r_[faces[:, 0], faces[:, 1]], np.r_[faces[:, 1], faces[:, 2]]),
        ),
        shape=(u.max() + 1,) * 2,
    ).tocsr()
    _, lab = connected_components(edges, directed=False)
    return lab[u]


def prepared(id):
    g, b = read(ROOT / id / "models/original.glb")
    p, i = geom(g, b)
    uv = arr(g, b, g["meshes"][0]["primitives"][0]["attributes"]["TEXCOORD_0"])
    keep = np.ones(len(p), bool)
    if id in ("rivet-press", "arc-keeper"):
        keep = np.abs(p[:, 2]) < (0.22 if id == "rivet-press" else 0.14)
    if id == "ratchet-goalie":
        keep = np.isin(labels(p, i), [0, 1])
    i = i[keep[i[:, 0]]]
    idx = np.unique(i)
    p = p[idx].copy()
    uv = uv[idx]
    i = np.searchsorted(idx, i).astype("<u4")
    if id == "ratchet-goalie":
        p = p[:, [2, 1, 0]]
        p[:, 0] *= -1
    h = np.ptp(p[:, 1])
    p = (p - (p.min(0) + p.max(0)) * 0.5) / h
    p[:, 1] += 0.5
    return g, b, p, i, uv


# Image landmarks (x, height; both in units of standing height), in frontal projection.
# Order: shoulder, elbow, wrist, hip, knee, ankle. Left/right here refer to image sides.
LANDMARKS = {
    "rivet-press": (
        [
            (-0.18, 0.68),
            (-0.29, 0.59),
            (-0.34, 0.68),
            (-0.10, 0.46),
            (-0.12, 0.24),
            (-0.12, 0.09),
        ],
        [
            (0.20, 0.68),
            (0.30, 0.56),
            (0.34, 0.50),
            (0.10, 0.46),
            (0.11, 0.24),
            (0.12, 0.09),
        ],
    ),
    "apex-pacer": (
        [
            (-0.12, 0.74),
            (-0.16, 0.64),
            (-0.16, 0.57),
            (-0.06, 0.47),
            (0.00, 0.32),
            (0.014, 0.07),
        ],
        [
            (0.14, 0.68),
            (0.15, 0.51),
            (0.046, 0.67),
            (0.085, 0.46),
            (0.10, 0.30),
            (0.10, 0.07),
        ],
    ),
    "echo-diver": (
        [
            (-0.14, 0.58),
            (-0.21, 0.49),
            (-0.28, 0.40),
            (-0.075, 0.40),
            (-0.085, 0.28),
            (-0.10, 0.13),
        ],
        [
            (0.14, 0.58),
            (0.21, 0.49),
            (0.28, 0.40),
            (0.075, 0.40),
            (0.085, 0.28),
            (0.10, 0.13),
        ],
    ),
    "signal-beetle": (
        [
            (-0.11, 0.63),
            (-0.15, 0.51),
            (-0.16, 0.41),
            (-0.057, 0.43),
            (-0.063, 0.27),
            (-0.067, 0.10),
        ],
        [
            (0.12, 0.63),
            (0.16, 0.50),
            (0.15, 0.38),
            (0.056, 0.43),
            (0.064, 0.27),
            (0.071, 0.10),
        ],
    ),
    "reel-climber": (
        [
            (-0.14, 0.76),
            (-0.246, 0.64),
            (-0.16, 0.53),
            (-0.077, 0.51),
            (-0.107, 0.32),
            (-0.163, 0.095),
        ],
        [
            (0.14, 0.75),
            (0.245, 0.64),
            (0.155, 0.53),
            (0.078, 0.51),
            (0.107, 0.32),
            (0.163, 0.095),
        ],
    ),
    "arc-keeper": (
        [
            (-0.16, 0.68),
            (-0.23, 0.54),
            (-0.28, 0.40),
            (-0.077, 0.44),
            (-0.08, 0.28),
            (-0.083, 0.13),
        ],
        [
            (0.16, 0.68),
            (0.23, 0.54),
            (0.28, 0.40),
            (0.077, 0.44),
            (0.08, 0.28),
            (0.083, 0.13),
        ],
    ),
    "ratchet-goalie": (
        [
            (-0.14, 0.71),
            (-0.21, 0.65),
            (-0.26, 0.64),
            (-0.138, 0.50),
            (-0.175, 0.31),
            (-0.178, 0.11),
        ],
        [
            (0.14, 0.72),
            (0.20, 0.60),
            (0.25, 0.51),
            (0.040, 0.50),
            (0.062, 0.355),
            (0.116, 0.118),
        ],
    ),
}
CLIPS = [
    "Idle",
    "Run",
    "Jump",
    "Slide",
    "SlideLeft",
    "SlideRight",
    "SitDown",
    "StandUp",
    "FinishWave",
]


def build(id):
    g, b, p, faces, uv = prepared(id)
    if id == "ratchet-goalie":
        # Reuse the generator's upholstered right pad on the exposed opposite knee.
        cc = p[faces].mean(1)
        patch = (
            (abs(cc[:, 0] + 0.174) < 0.077)
            & (abs(cc[:, 1] - 0.303) < 0.090)
            & (cc[:, 2] > -0.040)
        )
        ii, ff = np.unique(faces[patch], return_inverse=True)
        extra = p[ii].copy()
        extra[:, 0] = -0.112 - extra[:, 0]
        extra[:, 1] += 0.048
        extra[:, 2] -= 0.035
        faces = np.vstack([faces, ff.reshape(-1, 3)[:, ::-1] + len(p)]).astype("<u4")
        p = np.vstack([p, extra])
        uv = np.vstack([uv, uv[ii]])
    count = len(p)
    data = bytearray()
    doc = {
        "asset": {"version": "2.0", "generator": "Bubbleport desktop rig"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [
            {"name": "Robot", "children": [1, 2]},
            {"name": "Surface", "mesh": 0, "skin": 0},
        ],
        "accessors": [],
        "bufferViews": [],
        "materials": deepcopy(g["materials"]),
        "textures": g["textures"],
        "images": [],
    }
    if "samplers" in g:
        doc["samplers"] = g["samplers"]

    def view(raw, target=None):
        data.extend(bytes((-len(data)) % 4))
        v = {"buffer": 0, "byteOffset": len(data), "byteLength": len(raw)}
        if target:
            v["target"] = target
        data.extend(raw)
        doc["bufferViews"].append(v)
        return len(doc["bufferViews"]) - 1

    def acc(a, typ, target=None, bounds=False, norm=False):
        a = np.ascontiguousarray(a)
        v = view(a.tobytes(), target)
        r = {
            "bufferView": v,
            "componentType": {"f": 5126, "I": 5125, "B": 5121, "H": 5123}[a.dtype.char],
            "type": typ,
            "count": len(a),
        }
        if bounds:
            r.update(
                min=a.min(axis=0).reshape(-1).tolist(),
                max=a.max(axis=0).reshape(-1).tolist(),
            )
        if norm:
            r["normalized"] = True
        doc["accessors"].append(r)
        return len(doc["accessors"]) - 1

    for im in g["images"]:
        v = g["bufferViews"][im["bufferView"]]
        start = v.get("byteOffset", 0)
        doc["images"].append(
            dict(im, bufferView=view(b[start : start + v["byteLength"]]))
        )
    # Reconstruct area-weighted normals for the generator's unshaded mesh.
    normals = np.zeros_like(p)
    fn = np.cross(p[faces[:, 1]] - p[faces[:, 0]], p[faces[:, 2]] - p[faces[:, 0]])
    for ax in range(3):
        for corner in range(3):
            normals[:, ax] += np.bincount(faces[:, corner], fn[:, ax], minlength=count)
    normals /= np.maximum(np.linalg.norm(normals, axis=1, keepdims=True), 1e-20)
    x, y, z = p.T
    bones = {}
    pos = {}
    local = {}

    def bone(name, point, parent=None):
        point = np.array(point, float)
        pos[name] = point
        local[name] = point - (pos[parent] if parent else 0)
        idx = len(doc["nodes"])
        bones[name] = idx
        doc["nodes"].append({"name": name, "translation": local[name].tolist()})
        if parent:
            doc["nodes"][bones[parent]].setdefault("children", []).append(idx)
        return idx - 2

    def depth(x0, y0):
        mask = (abs(x - x0) < 0.025) & (abs(y - y0) < 0.025)
        return float(np.median(z[mask])) if mask.any() else 0

    bone("Body", (0, 0.47, 0))
    headH = {
        "rivet-press": 0.765,
        "apex-pacer": 0.745,
        "echo-diver": 0.655,
        "signal-beetle": 0.695,
        "reel-climber": 0.851,
        "arc-keeper": 0.757,
        "ratchet-goalie": 0.76,
    }[id]
    bone("Head", (0, headH, 0), "Body")
    segments = [
        ("Body", np.array([0, 0.42, 0]), np.array([0, headH - 0.03, 0]), 1.2),
        ("Head", np.array([0, headH + 0.06, 0]), np.array([0, 0.99, 0]), 1.45),
    ]
    for side, land in zip(("R", "L"), LANDMARKS[id]):
        pts = [np.array([a, c, depth(a, c)]) for a, c in land]
        if id == "apex-pacer":
            depths = (
                [-0.09, -0.21, -0.25, 0.01, 0.285, 0.225]
                if side == "R"
                else [0.13, 0.14, 0.37, -0.04, -0.13, -0.36]
            )
            for t, d in zip(pts, depths):
                t[2] = d
        for j, (name, parent, end) in enumerate(
            [
                ("Shoulder", "Body", 1),
                ("Elbow", "Shoulder" + side, 2),
                ("Wrist", "Elbow" + side, None),
                ("Hip", "Body", 4),
                ("Knee", "Hip" + side, 5),
                ("Ankle", "Knee" + side, None),
            ]
        ):
            name += side
            bone(name, pts[j], parent)
            dest = (
                pts[end]
                if end is not None
                else pts[j]
                + (
                    np.array([0, -0.055, 0.04])
                    if j == 2
                    else np.array([0, -0.065, 0.05])
                )
            )
            segments.append((name, pts[j], dest, 1))
    # Smooth deterministic binding at joint transitions. Keep the core and head rigid.
    scores = []
    for name, a, c, rad in segments:
        d = c - a
        delta = p - a.astype("f")
        t = np.clip((delta @ d.astype("f")) / (d @ d), 0, 1)
        dist = np.linalg.norm(delta - t[:, None] * d.astype("f"), axis=1) / rad
        scores.append(dist)
    scores = np.array(scores)
    order = np.argpartition(scores, 1, axis=0)[:2]
    dists = np.take_along_axis(scores, order, axis=0)
    w = np.exp(-(dists - dists.min(0)) / 0.012)
    w /= w.sum(0)
    lookup = np.array([bones[k] - 2 for k, *_ in segments], "B")
    joints = np.zeros((count, 4), "B")
    weights = np.zeros_like(joints)
    joints[:, :2] = lookup[order].T
    weights[:, 0] = np.round(w[0] * 255).astype("B")
    weights[:, 1] = 255 - weights[:, 0]

    def bind(mask, name):
        if not mask.any():
            raise ValueError("empty " + name)
        joints[mask] = 0
        weights[mask] = 0
        joints[mask, 0] = bones[name] - 2
        weights[mask, 0] = 255

    bind((y > headH + 0.02) & (abs(x) < (0.20 if id == "rivet-press" else 1)), "Head")
    controls = {}
    seams = []

    def actuator(name, mask, pivot, parent):
        bone(name, pivot, parent)
        bind(mask, name)
        controls[name] = int(mask.sum())
        seams.append((mask, name, parent))

    if id == "rivet-press":
        mask = (x < -0.305) & (y > 0.635) & (y < 0.709) & (z > 0.11)
        actuator("Punch", mask, (-0.346, 0.69, 0.18), "WristR")
    elif id == "apex-pacer":
        for side, x0, z0 in [("R", 0.014, 0.225), ("L", 0.10, -0.36)]:
            mask = (abs(x - x0) < 0.058) & (abs(z - z0) < 0.12) & (y < 0.102)
            actuator("Heel" + side, mask, (x0, 0.048, z0 + 0.055), "Ankle" + side)
            spring = mask & (y > 0.045) & (y < 0.097) & (z < z0 + 0.015)
            actuator("Spring" + side, spring, (x0, 0.045, z0), "Heel" + side)
    elif id == "echo-diver":
        for s, n in [(-1, "R"), (1, "L")]:
            actuator(
                "Dish" + n,
                (s * x > 0.152) & (y > 0.694) & (y < 0.894),
                (s * 0.149, 0.773, depth(s * 0.15, 0.773)),
                "Head",
            )
    elif id == "signal-beetle":
        for s, n in [(-1, "R"), (1, "L")]:
            mask = (
                (s * x > 0)
                & (y > 0.278)
                & (y < 0.675)
                & (z < (-0.061 + 0.12 * (y - 0.48)))
            )
            actuator("Shell" + n, mask, (s * 0.069, 0.65, -0.065), "Body")
    elif id == "reel-climber":
        mask = (x > 0.215) & (y > 0.721) & (y < 0.766)
        actuator("Tape", mask, (0.192, 0.746, -0.028), "Body")
    elif id == "ratchet-goalie":
        bind((x > 0.16) & (y < 0.645) & (y > 0.26), "WristL")
        mask = (x < -0.19) & (y > 0.48) & (y < 0.79)
        actuator("Catcher", mask, (-0.205, 0.60, depth(-0.20, 0.60)), "WristR")
    # Duplicate boundary vertices at rigid seams; adjacent triangles cannot pull the shell.
    for region, name, parent in seams:
        corner = np.pad(region, (0, len(p) - len(region)))[faces]
        mixed = corner.any(1) & ~corner.all(1)
        if not mixed.any():
            continue
        take = corner[mixed].sum(1) >= 2
        ff = faces[mixed].copy()
        for inside in (False, True):
            flip = (take[:, None] == inside) & (corner[mixed] != inside)
            ix, inv = np.unique(ff[flip], return_inverse=True)
            if not len(ix):
                continue
            ff[flip] = len(p) + inv
            p = np.vstack((p, p[ix]))
            uv = np.vstack((uv, uv[ix]))
            normals = np.vstack((normals, normals[ix]))
            jj = np.zeros((len(ix), 4), "B")
            ww = jj.copy()
            jj[:, 0] = bones[name if inside else parent] - 2
            ww[:, 0] = 255
            joints = np.vstack((joints, jj))
            weights = np.vstack((weights, ww))
        faces[mixed] = ff
    # A pair of opaque/unlit states shares the generated chest texture. Each cell's
    # surface has its own material so switching power does not brighten the face.
    attrs = {
        "POSITION": acc(p, "VEC3", 34962, True),
        "NORMAL": acc(normals, "VEC3", 34962),
        "TEXCOORD_0": acc(uv, "VEC2", 34962),
        "JOINTS_0": acc(joints, "VEC4", 34962),
        "WEIGHTS_0": acc(weights, "VEC4", 34962, norm=True),
    }

    def prim(tris, material):
        return {
            "attributes": attrs,
            "indices": acc(tris.ravel(), "SCALAR", 34963),
            "material": material,
        }

    primitives = []
    cellmats = []
    if id == "arc-keeper":
        centers = p[faces].mean(axis=1)
        xx, yy, zz = centers.T
        left = np.ones(len(faces), bool)
        for sign, tag in [(-1, "Left"), (1, "Right")]:
            use = (
                (abs(xx - sign * 0.044) < 0.032)
                & (abs(yy - 0.616) < 0.042)
                & (zz > 0.097)
            )
            assert use.sum() > 100
            m = {
                "name": "Cell" + tag,
                "pbrMetallicRoughness": {
                    "baseColorFactor": [0.07, 0.038, 0.012, 1],
                    "roughnessFactor": 0.42,
                    "metallicFactor": 0.4,
                },
                "emissiveFactor": ([1, 0.33, 0.016] if sign == -1 else [0, 0, 0]),
            }
            m["pbrMetallicRoughness"]["baseColorTexture"] = deepcopy(
                g["materials"][0]["pbrMetallicRoughness"]["baseColorTexture"]
            )
            m["emissiveTexture"] = deepcopy(
                m["pbrMetallicRoughness"]["baseColorTexture"]
            )
            mi = len(doc["materials"])
            doc["materials"].append(m)
            primitives.append(prim(faces[use], mi))
            cellmats.append(mi)
            left &= ~use
            controls["Cell" + tag] = int(use.sum())
        primitives.insert(0, prim(faces[left], 0))
    else:
        primitives = [prim(faces, 0)]
    doc["meshes"] = [{"name": id, "primitives": primitives}]
    if id == "reel-climber":
        # The hidden part of the strip slides out of the opaque spool. Its scale
        # stays at one, preserving the end-tab hole and engraved tick spacing.
        def ribbon_surface(name, rectangles, rgb):
            points = []
            indices = []
            for x0, x1, y0, y1, z0 in rectangles:
                n = len(points)
                points.extend([(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0)])
                indices.extend([n, n + 1, n + 2, n, n + 2, n + 3])
            points = np.array(points, "f") - pos["Tape"].astype("f")
            material = len(doc["materials"])
            doc["materials"].append(
                {
                    "name": name,
                    "doubleSided": True,
                    "pbrMetallicRoughness": {
                        "baseColorFactor": rgb + [1],
                        "metallicFactor": 0.2,
                        "roughnessFactor": 0.50,
                    },
                }
            )
            mesh_index = len(doc["meshes"])
            doc["meshes"].append(
                {
                    "name": name,
                    "primitives": [
                        {
                            "attributes": {
                                "POSITION": acc(points, "VEC3", 34962, True),
                                "NORMAL": acc(
                                    np.tile(np.array([0, 0, 1], "f"), (len(points), 1)),
                                    "VEC3",
                                    34962,
                                ),
                            },
                            "indices": acc(np.array(indices, "<u2"), "SCALAR", 34963),
                            "material": material,
                        }
                    ],
                }
            )
            doc["nodes"][bones["Tape"]].setdefault("children", []).append(
                len(doc["nodes"])
            )
            doc["nodes"].append({"name": name, "mesh": mesh_index})

        ribbon_surface(
            "Measuring strip",
            [(0.107, 0.226, 0.727, 0.756, -0.026)],
            [0.91, 0.61, 0.25],
        )
        ticks = []
        for index in range(16):
            left = 0.11 + index * 0.007
            ticks.append(
                (left, left + 0.0015, 0.747 if index % 5 else 0.738, 0.756, -0.0255)
            )
        ribbon_surface("Graduations", ticks, [0.07, 0.055, 0.04])
    if id == "signal-beetle":
        # The generated shell was joined to the torso. Give the newly exposed back
        # a solid mint maintenance cover, three vent ribs, and four brass fasteners.
        lat, lon = np.meshgrid(
            np.linspace(0, np.pi, 25), np.linspace(0, 2 * np.pi, 41), indexing="ij"
        )
        sphere = np.column_stack(
            [
                (np.sin(lat) * np.cos(lon)).ravel(),
                np.cos(lat).ravel(),
                (np.sin(lat) * np.sin(lon)).ravel(),
            ]
        ).astype("f")
        cells = np.arange(24 * 41).reshape(24, 41)[:, :40].ravel()
        sphereidx = np.stack(
            [cells, cells + 1, cells + 41, cells + 1, cells + 42, cells + 41], axis=1
        ).astype("<u2")

        def insert(name, center, size, color, metal):
            mat = len(doc["materials"])
            doc["materials"].append(
                {
                    "name": name,
                    "pbrMetallicRoughness": {
                        "baseColorFactor": color + [1],
                        "roughnessFactor": 0.54,
                        "metallicFactor": metal,
                    },
                    "doubleSided": True,
                }
            )
            mesh = len(doc["meshes"])
            doc["meshes"].append(
                {
                    "name": name,
                    "primitives": [
                        {
                            "indices": acc(sphereidx.ravel(), "SCALAR", 34963),
                            "attributes": {
                                "POSITION": acc(sphere, "VEC3", 34962, True),
                                "NORMAL": acc(sphere, "VEC3", 34962),
                            },
                            "material": mat,
                        }
                    ],
                }
            )
            parent = bones["Body"]
            doc["nodes"][parent].setdefault("children", []).append(len(doc["nodes"]))
            doc["nodes"].append(
                {
                    "name": name,
                    "mesh": mesh,
                    "scale": size,
                    "translation": (np.array(center) - pos["Body"]).tolist(),
                }
            )

        insert(
            "Back service cover",
            [0, 0.523, -0.049],
            [0.122, 0.176, 0.044],
            [0.32, 0.49, 0.40],
            0.32,
        )
        for n in range(3):
            insert(
                "Vent" + str(n),
                [0, 0.533 + n * 0.017, -0.091],
                [0.044, 0.003, 0.008],
                [0.10, 0.115, 0.09],
                0.50,
            )
        for n, (xx, yy) in enumerate(
            [(-0.07, 0.60), (0.07, 0.60), (-0.07, 0.47), (0.07, 0.47)]
        ):
            insert(
                "Fastener" + str(n),
                [xx, yy, -0.078],
                [0.007, 0.007, 0.006],
                [0.58, 0.35, 0.10],
                0.7,
            )
    if id == "ratchet-goalie":
        # The marble belongs to the catch demonstration, separate from the hand.
        lat, lon = np.meshgrid(
            np.linspace(0, np.pi, 17), np.linspace(0, 2 * np.pi, 33), indexing="ij"
        )
        sphere = np.column_stack(
            [
                (np.sin(lat) * np.cos(lon)).ravel(),
                np.cos(lat).ravel(),
                (np.sin(lat) * np.sin(lon)).ravel(),
            ]
        ).astype("f")
        cells = np.arange(16 * 33).reshape(16, 33)[:, :32].ravel()
        idx = np.stack(
            [cells, cells + 1, cells + 33, cells + 1, cells + 34, cells + 33], axis=1
        ).astype("<u2")
        mat = len(doc["materials"])
        doc["materials"].append(
            {
                "name": "Aqua marble",
                "doubleSided": True,
                "pbrMetallicRoughness": {
                    "baseColorFactor": [0.08, 0.75, 0.66, 1],
                    "roughnessFactor": 0.15,
                    "metallicFactor": 0.3,
                },
            }
        )
        doc["meshes"].append(
            {
                "name": "Marble",
                "primitives": [
                    {
                        "indices": acc(idx.ravel(), "SCALAR", 34963),
                        "attributes": {
                            "POSITION": acc(sphere * 0.024, "VEC3", 34962, True),
                            "NORMAL": acc(sphere, "VEC3", 34962),
                        },
                        "material": mat,
                    }
                ],
            }
        )
        ballidx = len(doc["nodes"])
        doc["nodes"].append({"name": "Marble", "mesh": 1, "scale": [0, 0, 0]})
        doc["nodes"][0]["children"].append(ballidx)
    ib = np.tile(np.eye(4, dtype="f"), (len(bones), 1, 1))
    ib[:, 3, :3] = -np.array(list(pos.values()))
    doc["skins"] = [
        {
            "name": "DesktopRig",
            "skeleton": 2,
            "joints": list(bones.values()),
            "inverseBindMatrices": acc(ib.reshape(-1, 16), "MAT4"),
        }
    ]
    animations = []
    teddy, _ = read(Path("teddy-playground/dist/teddy-bear-animated.glb"))
    durations = {
        a["name"]: max(teddy["accessors"][s["input"]]["max"][0] for s in a["samplers"])
        for a in teddy["animations"]
    }
    action = {
        "rivet-press": "Rivet",
        "apex-pacer": "HeelSpring",
        "echo-diver": "Listen",
        "signal-beetle": "Signal",
        "reel-climber": "Measure",
        "arc-keeper": "PowerTransfer",
        "ratchet-goalie": "Catch",
    }[id]
    for clip in CLIPS + [action]:
        duration = durations.get(clip, 2.4)
        t = np.linspace(0, 1, 17)
        wave = np.sin(t * 2 * np.pi)
        pulse = np.sin(t * np.pi) ** 2
        steps = np.array([0, 0.5, 1, 0.5, 0])
        phase = np.interp(t, np.linspace(0, 1, 5), steps)
        tm = acc((t * duration).astype("f"), "SCALAR", bounds=True)
        sam = []
        ch = []

        def track(node, path, arr):
            values = np.array(arr, "f")
            typ = {3: "VEC3", 4: "VEC4"}[values.shape[1]]
            sam.append(
                {"input": tm, "output": acc(values, typ), "interpolation": "LINEAR"}
            )
            ch.append(
                {"sampler": len(sam) - 1, "target": {"node": bones[node], "path": path}}
            )

        def rotate(node, axis, angles):
            track(
                node,
                "rotation",
                Rotation.from_rotvec(np.outer(angles, np.array(axis))).as_quat(),
            )

        def move(node, axis, dist):
            track(node, "translation", local[node] + np.outer(dist, axis))

        if clip == "Run":
            move("Body", (0, 1, 0), 0.013 * wave**2)
            for sign, side in [(-1, "R"), (1, "L")]:
                rotate("Hip" + side, (1, 0, 0), sign * 0.34 * wave)
                rotate("Knee" + side, (1, 0, 0), 0.29 * np.maximum(0, -sign * wave))
                rotate("Shoulder" + side, (1, 0, 0), -sign * 0.23 * wave)
        elif clip == "Jump":
            move("Body", (0, 1, 0), pulse * 0.055)
            for side in "RL":
                rotate("Hip" + side, (1, 0, 0), -0.18 * pulse)
                rotate("Knee" + side, (1, 0, 0), 0.33 * pulse)
        elif clip in ["SitDown", "StandUp", "Slide", "SlideLeft", "SlideRight"]:
            seat = (
                t
                if clip == "SitDown"
                else 1 - t
                if clip == "StandUp"
                else np.ones(len(t))
            )
            move("Body", (0, 1, 0), -0.09 * seat)
            rotate(
                "Body",
                (0, 0, 1),
                seat * {"SlideLeft": 0.14, "SlideRight": -0.14}.get(clip, 0),
            )
            for side in "RL":
                rotate("Hip" + side, (1, 0, 0), -0.65 * seat)
                rotate("Knee" + side, (1, 0, 0), 0.6 * seat)
        elif clip == "FinishWave":
            rotate("ShoulderL", (0, 0, 1), 0.45 * pulse)
            rotate("ElbowL", (1, 0, 0), 0.36 * wave)
        elif clip == "Idle":
            rotate("Head", (0, 1, 0), 0.033 * wave)
        elif id == "rivet-press":
            move("Punch", (0, -1, 0), phase * 0.022)
        elif id == "apex-pacer":
            for side in "RL":
                rotate("Heel" + side, (1, 0, 0), 0.16 * wave)
                rotate("Knee" + side, (1, 0, 0), 0.095 * pulse)
                track(
                    "Spring" + side,
                    "scale",
                    np.column_stack(
                        [np.ones_like(t), 1 - 0.10 * pulse, np.ones_like(t)]
                    ),
                )
        elif id == "echo-diver":
            for s, side in [(-1, "R"), (1, "L")]:
                rotate("Dish" + side, (0, 1, 0), s * phase * 0.99)
        elif id == "signal-beetle":
            for s, side in [(-1, "R"), (1, "L")]:
                rotate("Shell" + side, (0, 0, 1), s * phase * 0.58)
        elif id == "reel-climber":
            move("Tape", (1, 0, 0), 0.084 * phase)
        elif id == "arc-keeper":
            doc["extensionsUsed"] = ["KHR_animation_pointer"]
            for n, mi in enumerate(cellmats):
                v = np.interp(
                    t,
                    [0, 0.25, 0.5, 0.75, 1],
                    ([1, 1, 1, 0, 1] if n == 0 else [0, 1, 1, 1, 0]),
                )
                sam.append(
                    {
                        "input": tm,
                        "output": acc(
                            np.outer(v, [1, 0.33, 0.016]).astype("f"), "VEC3"
                        ),
                        "interpolation": "LINEAR",
                    }
                )
                ch.append(
                    {
                        "sampler": len(sam) - 1,
                        "target": {
                            "path": "pointer",
                            "extensions": {
                                "KHR_animation_pointer": {
                                    "pointer": f"/materials/{mi}/emissiveFactor"
                                }
                            },
                        },
                    }
                )
            rotate("Head", (0, 1, 0), 0.05 * wave)
        elif id == "ratchet-goalie":
            move("Body", (1, 0, 0), 0.065 * wave)
            rotate("ShoulderL", (0, 0, 1), 0.30 * pulse)
            rotate("ShoulderR", (0, 0, 1), -0.39 * pulse)
            rotate("Catcher", (1, 0, 0), -0.34 * pulse)
        if id == "ratchet-goalie" and clip == "Catch":
            for key, values in [
                (
                    "scale",
                    np.column_stack(
                        [np.interp(t, [0, 0.06, 0.9, 1], [0, 1, 1, 0])] * 3
                    ),
                ),
                (
                    "translation",
                    np.column_stack(
                        [
                            np.interp(t, [0, 0.32, 0.64, 1], axis)
                            for axis in [
                                [0.48, 0.32, -0.25, -0.29],
                                [0.38, 0.40, 0.72, 0.65],
                                [0.40, 0.16, 0.21, 0.175],
                            ]
                        ]
                    ),
                ),
            ]:
                sam.append(
                    {
                        "input": tm,
                        "output": acc(values.astype("f"), "VEC3"),
                        "interpolation": "LINEAR",
                    }
                )
                ch.append(
                    {"sampler": len(sam) - 1, "target": {"node": ballidx, "path": key}}
                )
        animations.append({"name": clip, "channels": ch, "samplers": sam})
    doc["animations"] = animations
    doc["buffers"] = [{"byteLength": len(data)}]
    j = json.dumps(doc, separators=(",", ":")).encode()
    j += b" " * ((-len(j)) % 4)
    data.extend(bytes((-len(data)) % 4))
    dest = ROOT / id / "models/desktop.glb"
    with dest.open("wb") as out:
        out.write(
            struct.pack(
                "<4sIIII", b"glTF", 2, 28 + len(j) + len(data), len(j), 0x4E4F534A
            )
        )
        out.write(j)
        out.write(struct.pack("<II", len(data), 0x004E4942))
        out.write(data)
    report = {
        "triangles": sum(
            doc["accessors"][pr["indices"]]["count"] // 3
            for mesh in doc["meshes"]
            for pr in mesh["primitives"]
        ),
        "vertices": len(p),
        "bytes": dest.stat().st_size,
        "clips": [a["name"] for a in animations],
        "controls": controls,
        "sourceTriangles": len(geom(g, b)[1]),
        "textureSizes": [],
    }
    for im in g["images"]:
        v = g["bufferViews"][im["bufferView"]]
        report["textureSizes"].append(
            Image.open(
                io.BytesIO(b[v["byteOffset"] : v["byteOffset"] + v["byteLength"]])
            ).size
        )
    (ROOT / id / "records/desktop.json").write_text(json.dumps(report, indent=2) + "\n")
    print(id, report, flush=True)


if __name__ == "__main__":
    for id in sys.argv[1:] or LANDMARKS:
        build(id)
