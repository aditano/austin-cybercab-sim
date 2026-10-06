import sys
from PIL import Image
out = sys.argv[1]; files = sys.argv[2:]
ims = [Image.open(f).convert('RGB') for f in files]
W = 800
ims = [i.resize((W, int(W * i.height / i.width))) for i in ims]
cols = 2
rows = (len(ims) + 1) // 2
hs = [max(ims[r * 2 + c].height for c in range(cols) if r * 2 + c < len(ims)) for r in range(rows)]
s = Image.new('RGB', (W * cols, sum(hs)), 'white')
y = 0
for r in range(rows):
    for c in range(cols):
        k = r * 2 + c
        if k < len(ims):
            s.paste(ims[k], (c * W, y))
    y += hs[r]
s.save(out, quality=85)
