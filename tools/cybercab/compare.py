"""Side-by-side comparison: reference photo (left) and render (right), same height, labelled."""
import sys
from PIL import Image, ImageDraw, ImageFont
def compare(ref, ren, out, label_l='reference', label_r='model', H=600, crop=None):
    a = Image.open(ref).convert('RGB')
    if crop:
        a = a.crop(crop)
    b = Image.open(ren).convert('RGB')
    if crop:
        sx = b.width / Image.open(ref).width
        b = b.crop(tuple(int(c * sx) for c in crop))
    a = a.resize((int(a.width * H / a.height), H))
    b = b.resize((int(b.width * H / b.height), H))
    s = Image.new('RGB', (a.width + b.width + 10, H + 34), 'white')
    s.paste(a, (0, 34)); s.paste(b, (a.width + 10, 34))
    d = ImageDraw.Draw(s)
    try:
        f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 20)
    except Exception:
        f = None
    d.text((8, 6), label_l, fill='black', font=f)
    d.text((a.width + 18, 6), label_r, fill='black', font=f)
    s.save(out, quality=88)
if __name__ == '__main__':
    compare(*sys.argv[1:4], *(sys.argv[4:6] if len(sys.argv) > 5 else []))
