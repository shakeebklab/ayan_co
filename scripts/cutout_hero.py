from PIL import Image, ImageFilter
import numpy as np
from collections import deque

src = r"c:\Users\Hp\Downloads\Clothing_Catalog_Cart_WhatsApp\public\products\ringer-navy.jpg"
dst = r"c:\Users\Hp\Downloads\Clothing_Catalog_Cart_WhatsApp\public\products\hero-tee-navy.png"

base = Image.open(src).convert("RGBA")
bw, bh = base.size
# Aggressive top crop removes hanger; keep full width for sleeves
base = base.crop((0, int(bh * 0.20), bw, int(bh * 0.97)))
base = base.resize((base.width * 3, base.height * 3), Image.Resampling.LANCZOS)

arr = np.array(base)
h, w = arr.shape[:2]
rgb = arr[:, :, :3].astype(np.int16)
r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
mean = rgb.mean(axis=2)
chroma = np.ptp(rgb, axis=2)

is_white = mean > 175
is_navy = (b >= r) & (b >= g - 2) & (mean < 95)
is_neutral_bg = (chroma <= 12) & (mean >= 40) & (mean <= 170) & ~is_white & ~is_navy

visited = np.zeros((h, w), dtype=bool)
q = deque()
for x in range(w):
    for y in (0, h - 1):
        if is_neutral_bg[y, x] or (chroma[y, x] <= 14 and not is_navy[y, x] and not is_white[y, x]):
            visited[y, x] = True
            q.append((y, x))
for y in range(h):
    for x in (0, w - 1):
        if not visited[y, x] and (is_neutral_bg[y, x] or (chroma[y, x] <= 14 and not is_navy[y, x] and not is_white[y, x])):
            visited[y, x] = True
            q.append((y, x))

expand = (chroma <= 18) & ~is_navy & ~is_white
while q:
    y, x = q.popleft()
    for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
        if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx] and expand[ny, nx]:
            visited[ny, nx] = True
            q.append((ny, nx))

alpha = np.full((h, w), 255, dtype=np.uint8)
alpha[visited] = 0
alpha[is_navy | is_white] = 255

m = Image.fromarray(alpha, "L").filter(ImageFilter.GaussianBlur(1.0))
alpha = np.array(m)
alpha[is_navy | is_white] = 255
alpha[visited & ~is_navy & ~is_white] = 0
arr[:, :, 3] = alpha

# Crop to garment only (prefer navy+white cores for bounds to drop fringe)
core = (is_navy | is_white) & (alpha > 40)
ys, xs = np.where(core)
pad = 20
y0, y1 = max(0, ys.min() - pad), min(h, ys.max() + pad + 1)
x0, x1 = max(0, xs.min() - pad), min(w, xs.max() + pad + 1)
cropped = arr[y0:y1, x0:x1]

im = Image.fromarray(cropped, "RGBA")
scale = 1600 / max(im.size)
im = im.resize((int(im.width * scale), int(im.height * scale)), Image.Resampling.LANCZOS)
im.save(dst, "PNG", optimize=True)
print("saved", dst, im.size)
