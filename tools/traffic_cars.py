#!/usr/bin/env python3
"""Original low-poly traffic cars. Nose is +Z, matching the Kenney kit's facing."""

import json
import math
import struct
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "public" / "models" / "cars"


def normalize(v):
    length = math.sqrt(sum(c * c for c in v)) or 1.0
    return tuple(c / length for c in v)


def add(a, b):
    return tuple(a[i] + b[i] for i in range(3))


def sub(a, b):
    return tuple(a[i] - b[i] for i in range(3))


def cross(a, b):
    return (
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    )


class Mesh:
    def __init__(self, name, origin=(0.0, 0.0, 0.0)):
        self.name = name
        self.origin = origin
        self.positions = []
        self.normals = []
        self.indices = []

    def face(self, a, b, c):
        n = normalize(cross(sub(b, a), sub(c, a)))
        start = len(self.positions)
        for p in (a, b, c):
            self.positions.append(p)
            self.normals.append(n)
        self.indices.extend((start, start + 1, start + 2))

    def quad(self, a, b, c, d):
        self.face(a, b, c)
        self.face(a, c, d)

    def box(self, cx, cy, cz, sx, sy, sz):
        hx, hy, hz = sx / 2, sy / 2, sz / 2
        p = [
            (cx - hx, cy - hy, cz - hz),
            (cx + hx, cy - hy, cz - hz),
            (cx + hx, cy + hy, cz - hz),
            (cx - hx, cy + hy, cz - hz),
            (cx - hx, cy - hy, cz + hz),
            (cx + hx, cy - hy, cz + hz),
            (cx + hx, cy + hy, cz + hz),
            (cx - hx, cy + hy, cz + hz),
        ]
        self.quad(p[0], p[1], p[2], p[3])
        self.quad(p[5], p[4], p[7], p[6])
        self.quad(p[4], p[0], p[3], p[7])
        self.quad(p[1], p[5], p[6], p[2])
        self.quad(p[3], p[2], p[6], p[7])
        self.quad(p[4], p[5], p[1], p[0])

    def profile(self, sections):
        rings = []
        for z, y0, y1, hx in sections:
            rings.append([
                (-hx, y0, z),
                (hx, y0, z),
                (hx, y1, z),
                (-hx, y1, z),
            ])
        for i in range(len(rings) - 1):
            a, b = rings[i], rings[i + 1]
            self.quad(a[0], b[0], b[1], a[1])
            self.quad(a[1], b[1], b[2], a[2])
            self.quad(a[2], b[2], b[3], a[3])
            self.quad(a[3], b[3], b[0], a[0])
        front, rear = rings[-1], rings[0]
        self.quad(front[0], front[1], front[2], front[3])
        self.quad(rear[1], rear[0], rear[3], rear[2])

    def smooth(self, tol=1e-3):
        buckets = {}
        for index, position in enumerate(self.positions):
            key = tuple(round(component / tol) for component in position)
            buckets.setdefault(key, []).append(index)
        for indices in buckets.values():
            total = (0.0, 0.0, 0.0)
            for index in indices:
                total = add(total, self.normals[index])
            averaged = normalize(total)
            for index in indices:
                self.normals[index] = averaged

    def cylinder_x(self, cx, cy, cz, radius, length, segments=16):
        rings = []
        for end, x in ((-1, cx - length / 2), (1, cx + length / 2)):
            ring = []
            for i in range(segments):
                a = i / segments * math.tau
                ring.append((x, cy + math.cos(a) * radius, cz + math.sin(a) * radius))
            rings.append(ring)
        a, b = rings
        for i in range(segments):
            j = (i + 1) % segments
            self.quad(a[i], a[j], b[j], b[i])
        for i in range(1, segments - 1):
            self.face(a[0], a[i + 1], a[i])
            self.face(b[0], b[i], b[i + 1])


def wheel_nodes(z_front, z_rear, radius, half_track):
    nodes = []
    for x in (-half_track, half_track):
        for z in (z_rear, z_front):
            mesh = Mesh("wheel", (x, radius, z))
            mesh.cylinder_x(0, 0, 0, radius, 0.24)
            nodes.append(mesh)
    return nodes


def sedan():
    body = Mesh("body")
    body.profile([
        (-2.15, 0.28, 0.62, 0.78),
        (-1.85, 0.28, 0.92, 0.86),
        (-1.15, 0.30, 1.12, 0.88),
        (-0.45, 0.32, 1.42, 0.82),
        (0.45, 0.32, 1.40, 0.80),
        (1.05, 0.30, 1.02, 0.86),
        (1.65, 0.28, 0.78, 0.88),
        (2.18, 0.28, 0.58, 0.80),
    ])
    glass = Mesh("glass")
    glass.profile([
        (-0.95, 0.78, 1.28, 0.74),
        (-0.40, 0.82, 1.34, 0.70),
        (0.40, 0.82, 1.32, 0.70),
        (0.95, 0.74, 1.08, 0.74),
    ])
    lamps = Mesh("headlamp")
    lamps.box(0.62, 0.52, 2.16, 0.34, 0.12, 0.06)
    lamps.box(-0.62, 0.52, 2.16, 0.34, 0.12, 0.06)
    tails = Mesh("taillight")
    tails.box(0.64, 0.58, -2.14, 0.36, 0.14, 0.05)
    tails.box(-0.64, 0.58, -2.14, 0.36, 0.14, 0.05)
    return [body, glass, *wheel_nodes(1.38, -1.38, 0.33, 0.84), lamps, tails]


def suv():
    body = Mesh("body")
    body.profile([
        (-2.25, 0.32, 0.78, 0.86),
        (-1.7, 0.32, 1.55, 0.92),
        (-0.4, 0.34, 1.72, 0.90),
        (0.7, 0.34, 1.68, 0.88),
        (1.35, 0.32, 1.15, 0.90),
        (2.05, 0.32, 0.82, 0.88),
        (2.28, 0.32, 0.64, 0.82),
    ])
    glass = Mesh("glass")
    glass.profile([
        (-1.35, 0.95, 1.58, 0.80),
        (0.15, 0.98, 1.62, 0.76),
        (1.15, 0.82, 1.28, 0.78),
    ])
    lamps = Mesh("headlamp")
    lamps.box(0.66, 0.62, 2.26, 0.36, 0.14, 0.06)
    lamps.box(-0.66, 0.62, 2.26, 0.36, 0.14, 0.06)
    tails = Mesh("taillight")
    tails.box(0.68, 0.78, -2.24, 0.38, 0.16, 0.05)
    tails.box(-0.68, 0.78, -2.24, 0.38, 0.16, 0.05)
    return [body, glass, *wheel_nodes(1.45, -1.45, 0.36, 0.90), lamps, tails]


def hatch():
    body = Mesh("body")
    body.profile([
        (-1.85, 0.26, 0.70, 0.78),
        (-1.35, 0.26, 1.28, 0.84),
        (-0.2, 0.28, 1.38, 0.82),
        (0.55, 0.28, 1.32, 0.80),
        (1.15, 0.26, 0.92, 0.84),
        (1.85, 0.26, 0.58, 0.78),
    ])
    glass = Mesh("glass")
    glass.profile([
        (-1.15, 0.78, 1.22, 0.72),
        (0.15, 0.80, 1.26, 0.68),
        (0.85, 0.70, 1.02, 0.70),
    ])
    lamps = Mesh("headlamp")
    lamps.box(0.58, 0.48, 1.84, 0.30, 0.11, 0.05)
    lamps.box(-0.58, 0.48, 1.84, 0.30, 0.11, 0.05)
    tails = Mesh("taillight")
    tails.box(0.60, 0.62, -1.84, 0.32, 0.12, 0.05)
    tails.box(-0.60, 0.62, -1.84, 0.32, 0.12, 0.05)
    return [body, glass, *wheel_nodes(1.15, -1.15, 0.31, 0.80), lamps, tails]


MATERIALS = {
    "body": {"pbrMetallicRoughness": {"baseColorFactor": [0.75, 0.75, 0.75, 1], "metallicFactor": 0.55, "roughnessFactor": 0.32}},
    "glass": {"pbrMetallicRoughness": {"baseColorFactor": [0.12, 0.16, 0.18, 1], "metallicFactor": 0.45, "roughnessFactor": 0.06}},
    "wheel": {"pbrMetallicRoughness": {"baseColorFactor": [0.04, 0.04, 0.04, 1], "metallicFactor": 0.0, "roughnessFactor": 0.92}},
    "headlamp": {
        "pbrMetallicRoughness": {"baseColorFactor": [1, 0.97, 0.9, 1], "metallicFactor": 0.0, "roughnessFactor": 0.2},
        "emissiveFactor": [1.0, 0.95, 0.82],
    },
    "taillight": {
        "pbrMetallicRoughness": {"baseColorFactor": [0.45, 0.02, 0.015, 1], "metallicFactor": 0.0, "roughnessFactor": 0.28},
        "emissiveFactor": [0.85, 0.04, 0.02],
    },
}


def pack(meshes):
    for mesh in meshes:
        if mesh.name in ('body', 'glass'):
            mesh.smooth()
    blob = bytearray()
    accessors = []
    buffer_views = []
    gltf_meshes = []
    nodes = []
    used = []

    def view(data, target):
        while len(blob) % 4:
            blob.append(0)
        offset = len(blob)
        blob.extend(data)
        buffer_views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(data), "target": target})
        return len(buffer_views) - 1

    def accessor(view_index, count, type_, component, mins=None, maxs=None):
        entry = {"bufferView": view_index, "componentType": component, "count": count, "type": type_}
        if mins is not None:
            entry["min"] = mins
            entry["max"] = maxs
        accessors.append(entry)
        return len(accessors) - 1

    mat_index = {}
    materials = []
    for mesh in meshes:
        if mesh.name not in mat_index:
            mat_index[mesh.name] = len(materials)
            materials.append({"name": mesh.name, **MATERIALS[mesh.name]})
        pos = b"".join(struct.pack("<3f", *p) for p in mesh.positions)
        nor = b"".join(struct.pack("<3f", *n) for n in mesh.normals)
        idx = b"".join(struct.pack("<H", i) for i in mesh.indices)
        xs = [p[0] for p in mesh.positions]
        ys = [p[1] for p in mesh.positions]
        zs = [p[2] for p in mesh.positions]
        pos_acc = accessor(view(pos, 34962), len(mesh.positions), "VEC3", 5126, [min(xs), min(ys), min(zs)], [max(xs), max(ys), max(zs)])
        nor_acc = accessor(view(nor, 34962), len(mesh.normals), "VEC3", 5126)
        idx_acc = accessor(view(idx, 34963), len(mesh.indices), "SCALAR", 5123)
        gltf_meshes.append({
            "name": mesh.name,
            "primitives": [{
                "attributes": {"POSITION": pos_acc, "NORMAL": nor_acc},
                "indices": idx_acc,
                "material": mat_index[mesh.name],
            }],
        })
        node = {"name": mesh.name, "mesh": len(gltf_meshes) - 1}
        if mesh.origin != (0.0, 0.0, 0.0):
            node["translation"] = list(mesh.origin)
        nodes.append(node)
        used.append(len(nodes) - 1)

    gltf = {
        "asset": {"version": "2.0", "generator": "tools/traffic_cars.py"},
        "scene": 0,
        "scenes": [{"nodes": used}],
        "nodes": nodes,
        "meshes": gltf_meshes,
        "materials": materials,
        "accessors": accessors,
        "bufferViews": buffer_views,
        "buffers": [{"byteLength": len(blob)}],
    }
    js = json.dumps(gltf, separators=(",", ":")).encode()
    while len(js) % 4:
        js += b" "
    while len(blob) % 4:
        blob.append(0)
    out = bytearray()
    out += struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(js) + 8 + len(blob))
    out += struct.pack("<I4s", len(js), b"JSON") + js
    out += struct.pack("<I4s", len(blob), b"BIN\0") + blob
    return out


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, builder in (("traffic-sedan", sedan), ("traffic-suv", suv), ("traffic-hatch", hatch)):
        data = pack(builder())
        path = OUT / f"{name}.glb"
        path.write_bytes(data)
        print(path.name, len(data))


if __name__ == "__main__":
    main()
