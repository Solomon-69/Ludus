# Counts captured frames where the Geo Guess map box is (almost) one flat water-blue colour = an empty map flash.
# python3 QA/geo-frames-analyse.py OUT_DIR [strip.png]
import sys, json, os, numpy as np
from PIL import Image
d = sys.argv[1]; m = json.load(open(os.path.join(d, 'meta.json'))); bx, by, bw, bh = [int(v) for v in m['box']]
blank = []; prev = None; flips = 0
for i in range(m['frames']):
    im = np.asarray(Image.open(os.path.join(d, '%04d.jpg' % i)).convert('RGB')).astype(int)[by + 8:by + bh - 8, bx + 8:bx + bw - 8]
    # water blue (126,169,246) fills the box when the tiles vanish for a frame
    f = float(((abs(im[:, :, 0] - 126) < 14) & (abs(im[:, :, 1] - 169) < 14) & (abs(im[:, :, 2] - 246) < 14)).mean())
    blank.append(f)
bad = [i for i, f in enumerate(blank) if f > 0.9]
print('frames', m['frames'], 'blank frames (>90% flat blue):', len(bad), bad[:20], 'max flat-blue share %.2f' % max(blank))
if len(sys.argv) > 2 and bad:
    pick = []
    for i in bad[:2]: pick += [max(0, i - 1), i, min(m['frames'] - 1, i + 1)]
    tiles = [Image.open(os.path.join(d, '%04d.jpg' % i)).crop((bx, by, bx + bw, by + bh)) for i in pick]
    W = sum(t.width for t in tiles); s = Image.new('RGB', (W, tiles[0].height)); x = 0
    for t in tiles: s.paste(t, (x, 0)); x += t.width
    s.save(sys.argv[2])
