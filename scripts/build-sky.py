"""Build KURO's real sky assets from the d3-celestial catalogue (BSD-3, Olaf Frohn; Hipparcos/Yale BSC data).

  python scripts/build-sky.py <dir with stars.8.json and mw.json>

Writes public/data/stars.bin   Int16 × 5 per star: unit vector x,y,z (ICRF/J2000) × 32767, V mag × 1000, B−V × 1000
       public/data/milkyway.png equirectangular Milky Way brightness, u = (RA + 180°) / 360°, v = (90° − Dec) / 180°
"""
import json, math, struct, sys, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

src = sys.argv[1]
out = os.path.join(os.path.dirname(__file__), '..', 'public', 'data')
stars = json.load(open(os.path.join(src, 'stars.8.json')))['features']
buf = bytearray()
n = 0
for f in sorted(stars, key=lambda f: f['properties']['mag']):
    ra, dec = f['geometry']['coordinates']
    mag = float(f['properties']['mag'])
    try: bv = float(f['properties']['bv'])
    except (TypeError, ValueError): bv = 0.6
    a, d = math.radians(ra), math.radians(dec)
    v = (math.cos(d) * math.cos(a), math.cos(d) * math.sin(a), math.sin(d))
    buf += struct.pack('<5h', *(round(c * 32767) for c in v), round(mag * 1000), round(max(-0.5, min(2.5, bv)) * 1000))
    n += 1
open(os.path.join(out, 'stars.bin'), 'wb').write(buf)

W, H = 4096, 2048
acc = np.zeros((H, W), np.float32)
mw = json.load(open(os.path.join(src, 'mw.json')))['features']
def ring_mask(ring):
    """Mask of one ring: longitudes unwrapped and drawn at three offsets; sky-encircling rings closed via the north pole."""
    ras = [ring[0][0]]
    for ra, _ in ring[1:]:
        p = ras[-1]
        ras.append(ra + 360 * round((p - ra) / 360))
    pts = [((ra + 180) / 360 * W, (90 - dec) / 180 * H) for ra, (_, dec) in zip(ras, ring)]
    wind = ras[-1] - ras[0]
    if abs(wind) > 180:  # circles the sky (the two edges of a band): close both via the north pole so XOR leaves the band
        pts += [(pts[-1][0], 0), (pts[0][0], 0)]
    m = Image.new('L', (W, H), 0)
    dr = ImageDraw.Draw(m)
    for off in (-W, 0, W):
        dr.polygon([(x + off, y) for x, y in pts], fill=255)
    return np.asarray(m) > 0

for f in mw:
    level = np.zeros((H, W), bool)
    for poly in f['geometry']['coordinates']:
        for ring in poly:
            level ^= ring_mask(ring)
    acc += level  # the five outlines nest: brighter levels inside fainter ones
a = acc / len(mw)
img = Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(6)).resize((2048, 1024), Image.LANCZOS)
img.save(os.path.join(out, 'milkyway.png'), optimize=True)
print(n, 'stars;', os.path.getsize(os.path.join(out, 'stars.bin')), 'bytes; milkyway', os.path.getsize(os.path.join(out, 'milkyway.png')), 'bytes')
