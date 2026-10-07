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

    def loft(self, sections, bevel=0.07):
        rings = []
        for z, y0, y1, hx in sections:
            span = max(0.04, y1 - y0)
            chamfer = min(bevel, hx * 0.28, span * 0.22)
            rings.append([
                (-hx + chamfer, y0, z),
                (hx - chamfer, y0, z),
                (hx, y0 + chamfer, z),
                (hx, y1 - chamfer, z),
                (hx - chamfer, y1, z),
                (-hx + chamfer, y1, z),
                (-hx, y1 - chamfer, z),
                (-hx, y0 + chamfer, z),
            ])
        for i in range(len(rings) - 1):
            a, b = rings[i], rings[i + 1]
            count = len(a)
            for k in range(count):
                j = (k + 1) % count
                self.quad(a[k], b[k], b[j], a[j])
        self._cap(rings[-1], (0.0, 0.0, 1.0))
        self._cap(rings[0], (0.0, 0.0, -1.0))

    def _cap(self, ring, outward):
        a, b, c = ring[0], ring[1], ring[2]
        normal = normalize(cross(sub(b, a), sub(c, a)))
        if sum(normal[i] * outward[i] for i in range(3)) < 0:
            ring = list(reversed(ring))
        for k in range(1, len(ring) - 1):
            self.face(ring[0], ring[k], ring[k + 1])

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
            tire = Mesh("wheel", (x, radius, z))
            tire.cylinder_x(0, 0, 0, radius, 0.22, 20)
            rim = Mesh("wheel-rim", (x, radius, z))
            rim.cylinder_x(0, 0, 0, radius * 0.58, 0.24, 14)
            nodes.extend((tire, rim))
    return nodes


def mirrors(body, z, y, hx):
    body.box(hx + 0.08, y, z, 0.16, 0.08, 0.22)
    body.box(-(hx + 0.08), y, z, 0.16, 0.08, 0.22)


def sedan():
    body = Mesh("body")
    body.loft([
        (-2.22, 0.32, 0.58, 0.72),
        (-2.02, 0.30, 0.82, 0.86),
        (-1.70, 0.52, 0.98, 0.84),
        (-1.38, 0.30, 1.08, 0.90),
        (-0.70, 0.30, 1.22, 0.90),
        (-0.15, 0.32, 1.42, 0.82),
        (0.55, 0.32, 1.38, 0.82),
        (1.05, 0.30, 1.05, 0.88),
        (1.40, 0.52, 0.90, 0.84),
        (1.78, 0.28, 0.74, 0.88),
        (2.12, 0.28, 0.58, 0.80),
        (2.28, 0.30, 0.48, 0.70),
    ], 0.075)
    mirrors(body, 0.35, 0.92, 0.82)
    glass = Mesh("glass")
    glass.loft([
        (-0.95, 0.82, 1.30, 0.72),
        (-0.25, 0.86, 1.38, 0.68),
        (0.45, 0.84, 1.32, 0.68),
        (0.95, 0.74, 1.05, 0.72),
    ], 0.05)
    lamps = Mesh("headlamp")
    lamps.box(0.58, 0.50, 2.24, 0.38, 0.12, 0.05)
    lamps.box(-0.58, 0.50, 2.24, 0.38, 0.12, 0.05)
    tails = Mesh("taillight")
    tails.box(0.60, 0.58, -2.20, 0.40, 0.12, 0.04)
    tails.box(-0.60, 0.58, -2.20, 0.40, 0.12, 0.04)
    return [body, glass, *wheel_nodes(1.42, -1.42, 0.33, 0.86), lamps, tails]


def suv():
    body = Mesh("body")
    body.loft([
        (-2.32, 0.36, 0.72, 0.80),
        (-2.05, 0.34, 1.35, 0.92),
        (-1.62, 0.58, 1.55, 0.90),
        (-1.15, 0.34, 1.68, 0.94),
        (-0.2, 0.36, 1.74, 0.92),
        (0.75, 0.36, 1.66, 0.90),
        (1.28, 0.58, 1.22, 0.88),
        (1.72, 0.34, 0.92, 0.92),
        (2.15, 0.34, 0.70, 0.86),
        (2.34, 0.36, 0.58, 0.76),
    ], 0.08)
    mirrors(body, 0.55, 1.15, 0.90)
    glass = Mesh("glass")
    glass.loft([
        (-1.35, 1.05, 1.58, 0.78),
        (0.05, 1.08, 1.64, 0.74),
        (1.05, 0.88, 1.22, 0.76),
    ], 0.05)
    lamps = Mesh("headlamp")
    lamps.box(0.64, 0.62, 2.30, 0.40, 0.14, 0.05)
    lamps.box(-0.64, 0.62, 2.30, 0.40, 0.14, 0.05)
    tails = Mesh("taillight")
    tails.box(0.66, 0.82, -2.28, 0.42, 0.16, 0.04)
    tails.box(-0.66, 0.82, -2.28, 0.42, 0.16, 0.04)
    return [body, glass, *wheel_nodes(1.48, -1.48, 0.36, 0.92), lamps, tails]


def hatch():
    body = Mesh("body")
    body.loft([
        (-1.92, 0.30, 0.62, 0.72),
        (-1.62, 0.28, 1.15, 0.84),
        (-1.22, 0.50, 1.28, 0.82),
        (-0.55, 0.28, 1.40, 0.86),
        (0.35, 0.28, 1.34, 0.82),
        (0.85, 0.50, 1.02, 0.80),
        (1.28, 0.26, 0.78, 0.84),
        (1.78, 0.26, 0.55, 0.78),
        (1.94, 0.28, 0.46, 0.68),
    ], 0.065)
    mirrors(body, 0.25, 0.88, 0.80)
    glass = Mesh("glass")
    glass.loft([
        (-1.15, 0.82, 1.24, 0.70),
        (0.05, 0.86, 1.30, 0.66),
        (0.75, 0.72, 1.02, 0.68),
    ], 0.045)
    lamps = Mesh("headlamp")
    lamps.box(0.54, 0.48, 1.90, 0.32, 0.11, 0.04)
    lamps.box(-0.54, 0.48, 1.90, 0.32, 0.11, 0.04)
    tails = Mesh("taillight")
    tails.box(0.56, 0.64, -1.90, 0.34, 0.12, 0.04)
    tails.box(-0.56, 0.64, -1.90, 0.34, 0.12, 0.04)
    return [body, glass, *wheel_nodes(1.18, -1.18, 0.31, 0.82), lamps, tails]


MATERIALS = {
    "body": {
        "pbrMetallicRoughness": {"baseColorFactor": [0.75, 0.75, 0.75, 1], "metallicFactor": 0.65, "roughnessFactor": 0.24},
        "extensions": {"KHR_materials_clearcoat": {"clearcoatFactor": 0.88, "clearcoatRoughnessFactor": 0.14}},
    },
    "glass": {"pbrMetallicRoughness": {"baseColorFactor": [0.12, 0.16, 0.18, 1], "metallicFactor": 0.45, "roughnessFactor": 0.06}},
    "wheel": {"pbrMetallicRoughness": {"baseColorFactor": [0.04, 0.04, 0.04, 1], "metallicFactor": 0.0, "roughnessFactor": 0.92}},
    "wheel-rim": {"pbrMetallicRoughness": {"baseColorFactor": [0.62, 0.64, 0.66, 1], "metallicFactor": 0.9, "roughnessFactor": 0.22}},
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
        "extensionsUsed": ["KHR_materials_clearcoat"],
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
