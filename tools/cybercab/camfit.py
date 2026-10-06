"""Blender camera matched to reference photos. Values from sfcam.py."""
import math
from mathutils import Vector, Euler

# San Francisco June 2026 side photo: camera 15.88 m from centre plane, 0.921 m high, level, roll removed
SF = dict(loc=(15.88, 0.02, 0.921), rot=(math.radians(90), 0.0, math.radians(90)), lens=36 * 2908.0 / 1024, res=(1024, 683))
