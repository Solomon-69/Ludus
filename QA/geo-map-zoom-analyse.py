# Counts blank frames (the whole map box one flat colour) in the frames from QA/geo-map-zoom.js and builds a strip of frames.
# python3 QA/geo-map-zoom-analyse.py OUT_DIR [strip.png]
import sys, json, os, numpy as np
from PIL import Image
d = sys.argv[1]; m = json.load(open(os.path.join(d, 'meta.json'))); bx, by, bw, bh = [int(v) for v in m['box']]
flat = []; stds = []
for i in range(m['frames']):
    im = np.asarray(Image.open(os.path.join(d, '%04d.jpg' % i)).convert('RGB')).astype(float)[by + 8:by + bh - 8, bx + 8:bx + bw - 8]
    s = float(im.std(axis=(0, 1)).mean()); stds.append(s)
blank = [i for i, s in enumerate(stds) if s < 3.0]
print('frames', m['frames'], '| blank (flat colour) frames:', len(blank), blank[:20], '| lowest variation %.1f' % min(stds))
log = m['log']; dr = [l[2] for l in log if l[2] is not None]
print('animation frames', len(log), '| max anchor drift px: %.2f' % (max(dr) if dr else 0))
# smoothness: zoom change per animation frame never reverses direction inside a burst
zs = [l[1] for l in log]; steps = np.diff(zs); rev = 0
for a, b in zip(steps[:-1], steps[1:]):
    if abs(a) > 0.01 and abs(b) > 0.01 and a * b < 0: rev += 1
print('zoom direction reversals inside bursts:', rev)
if len(sys.argv) > 2:
    pick = np.linspace(0, m['frames'] - 1, 12).astype(int)
    tiles = [Image.open(os.path.join(d, '%04d.jpg' % i)).crop((bx, by, bx + bw, by + bh)).resize((bw // 2, bh // 2)) for i in pick]
    cols = 4; rows = 3; s = Image.new('RGB', (cols * tiles[0].width, rows * tiles[0].height))
    for k, t in enumerate(tiles): s.paste(t, ((k % cols) * t.width, (k // cols) * t.height))
    s.save(sys.argv[2])
