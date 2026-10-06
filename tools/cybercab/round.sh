#!/bin/bash
# usage: round.sh N  -> renders comparison views into /workspace/cybercab-blender/rounds/rN
set -e
N=$1; R=/workspace/cybercab-blender/rounds/r$N; REF=/workspace/cybercab-ref/raw; S=/workspace/cybercab-blender/scripts
mkdir -p $R
cd /workspace/cybercab-blender
blender -b cybercab.blend --python $S/render.py -- --views side_sf,fit_i280,fit_jul25,front_low,rear_high,top_fl --engine cycles ${EXTRA} --samples ${SAMPLES:-40} --res ${RES:-0.8} --out $R 2>&1 | grep -E "RENDERED|rror" || true
blender -b cybercab.blend --python $S/render.py -- --views side_l --open 1.0 --engine cycles ${EXTRA} --samples ${SAMPLES:-40} --res ${RES:-0.8} --out $R 2>&1 | grep -E "RENDERED|rror" || true
python3 - <<PY
import sys, math
sys.path.insert(0, '$S')
from compare import compare
from PIL import Image
import sfcam
R='$R'; REF='$REF'
# un-rolled SF photo
p = Image.open(REF + '/Tesla_Cybercab_San_Francisco_June_2026.jpg').convert('RGB').resize((1024, 683)).rotate(math.degrees(sfcam.A), resample=Image.BICUBIC, center=(512, 341))
p.save(R + '/ref_sf_unrolled.jpg')
pairs = [('ref_sf_unrolled.jpg', 'side_sf.png', 'side', None),
         (REF + '/Tesla_Cybercab_on_Interstate_280_near_Palo_Alto_dllu.jpg', 'fit_i280.png', 'front34', None),
         (REF + '/Tesla_Cybercab_July_2025_54693064262.jpg', 'fit_jul25.png', 'rear34', None),
         (REF + '/Front_of_the_Tesla_Cybercab.jpg', 'front_low.png', 'front', None),
         (REF + '/Rear_of_the_Tesla_Cybercab.jpg', 'rear_high.png', 'rear', None),
         (REF + '/Tesla_Cybercab_003.jpg', 'top_fl.png', 'top', None),
         (REF + '/Tesla_Cybercab_at_Santana_Row_side_view_dllu.jpg', 'side_l_open.png', 'doors', None)]
for ref, ren, tag, crop in pairs:
    ref = ref if ref.startswith('/') else R + '/' + ref
    compare(ref, R + '/' + ren, R + '/cmp_' + tag + '.jpg', 'reference', 'model (round $N)', H=520)
print('ok')
PY
