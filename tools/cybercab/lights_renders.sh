#!/bin/bash
# light-state stills (overlay nodes toggled like the glb animations)
O=/workspace/cybercab-blender/renders/lights; S=/workspace/cybercab-blender/scripts; mkdir -p $O
cd /workspace/cybercab-blender
r() { blender -b cybercab.blend --python $S/render.py -- --engine cycles --samples ${SAMPLES:-64} --res ${RES:-1.0} --out $O "$@" 2>&1 | grep -E "RENDERED|rror" || true; }
r --views rear_high --suffix _tail --exposure -2.5
r --views rear_high --lamps brake --suffix _brake --exposure -2.5
r --views rear_high --lamps off,turn_l,turn_r --suffix _hazard --exposure -2.5
r --views rq --lamps turn_r --suffix _turn_right --exposure -2.0 --hdri_rot 70
r --views front_low --suffix _drl --exposure -2.5 --catcher 0
r --views front_low --lamps teal --suffix _pickup_teal --exposure -2.5 --catcher 0
r --views fq --lamps turn_r --suffix _turn_right --exposure -2.0 --hdri_rot 70
echo lights-done
