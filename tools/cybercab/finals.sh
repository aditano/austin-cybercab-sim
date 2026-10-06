#!/bin/bash
# one short Blender call per final view; usage: finals.sh
O=/workspace/cybercab-blender/renders; S=/workspace/cybercab-blender/scripts; mkdir -p $O
cd /workspace/cybercab-blender
r() { blender -b cybercab.blend --python $S/render.py -- --engine cycles --samples ${SAMPLES:-96} --res ${RES:-1.4} --out $O "$@" 2>&1 | grep -E "RENDERED|rror" || true; }
r --views fq --hdri_rot 70
r --views fit_i280
r --views rq --hdri_rot 70
r --views side --hdri_rot 150 --catcher 0
r --views doors --open 1.0 --hdri_rot 70
r --views interior --open 1.0 --hdri_rot 70
r --views wheel --hdri_rot 70
r --views top34 --hdri_rot 70
r --views front_low --catcher 0
r --views rear_high
echo finals-done
