import sys, math
from PIL import Image, ImageChops
sys.path.insert(0, '/workspace/cybercab-blender/scripts')
import sfcam
photo = Image.open('/workspace/cybercab-ref/raw/Tesla_Cybercab_San_Francisco_June_2026.jpg').convert('RGB').resize((1024, 683))
# remove roll: rotate photo by +A degrees about centre so the wheel centres are level
photo = photo.rotate(math.degrees(sfcam.A), resample=Image.BICUBIC, center=(512, 341))
sil = Image.open(sys.argv[1]).convert('RGBA')
a = sil.split()[3]
edge = a.filter(__import__('PIL.ImageFilter', fromlist=['x']).FIND_EDGES)
over = photo.copy()
red = Image.new('RGB', photo.size, (255, 40, 40))
over = Image.composite(Image.blend(photo, red, 0.35), photo, a)
over.paste((0, 255, 255), mask=edge.point(lambda v: 255 if v > 60 else 0))
over.save(sys.argv[2], quality=90)
