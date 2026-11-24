"""
Studio sets (S12): one wide panorama per set, split into seats by the studio so the room continues across tiles.
Writes public/sets/<id>-bg.jpg (wall, slightly out of focus like a real lens) and <id>-fg.png (the desk in front of
everyone, sharp, transparent above) plus <id>-preview.jpg. People sit at 1/6, 1/2 and 5/6 of the width, heads about
14% down, so decor lives at the seams (1/3, 2/3), the top band and the outer edges.

    python3 scripts/make-sets.py
"""
import math, os, random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from scipy.ndimage import gaussian_filter

W, H = 2880, 1440
DESK_Y = int(H * 0.80)
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'sets')
FONT = '/usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf'
SEAMS = [W // 3, 2 * W // 3]
rng = np.random.default_rng(7)


def noise(h, w, scale, sigma):
    return gaussian_filter(rng.standard_normal((h, w)), sigma) * scale


def light_pool(cx, cy, rx, ry, power=1.0):
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
    return np.exp(-d) * power


def apply_light(img, light, tint=(1.0, 0.82, 0.62)):
    t = np.array(tint, np.float32)
    return img * (0.35 + light[..., None] * t)


def glow_layer(draw_fn, blur_small=6, blur_big=28, color=(255, 120, 70), strength=1.6):
    """Neon-style glow: a sharp core plus two soft halos."""
    m = Image.new('L', (W, H), 0); draw_fn(ImageDraw.Draw(m))
    a = np.asarray(m, np.float32) / 255
    halo = gaussian_filter(a, blur_small) * 0.9 + gaussian_filter(a, blur_big) * 0.7
    c = np.array(color, np.float32) / 255
    core = np.clip(a * 1.2, 0, 1)[..., None] * (c * 0.4 + 0.6)  # hot, near-white core
    return core * 255, halo[..., None] * c * 255 * strength, a


def bokeh(img, n, y0, y1, colors, rmin=10, rmax=26, alpha=0.55):
    lay = np.zeros_like(img)
    for _ in range(n):
        x, y = rng.uniform(0, W), rng.uniform(y0, y1)
        if any(abs(x - s) < 120 for s in (W / 6, W / 2, 5 * W / 6)) and y > H * 0.12: continue  # keep heads clean
        r = rng.uniform(rmin, rmax); col = np.array(colors[rng.integers(len(colors))], np.float32)
        x0, x1, ya, yb = int(max(0, x - r - 2)), int(min(W, x + r + 2)), int(max(0, y - r - 2)), int(min(H, y + r + 2))
        yy, xx = np.mgrid[ya:yb, x0:x1]
        d = np.sqrt((xx - x) ** 2 + (yy - y) ** 2)
        disc = np.clip(r - d, 0, 1.5) / 1.5 * (0.7 + 0.3 * (d / r))  # brighter rim, like real bokeh
        lay[ya:yb, x0:x1] += disc[..., None] * col * alpha
    return img + gaussian_filter(lay, (1.2, 1.2, 0))


def neon_text(img, text, cx, cy, size, color):
    font = ImageFont.truetype(FONT, size)
    def draw(d):
        bb = d.textbbox((0, 0), text, font=font)
        d.text((cx - (bb[2] - bb[0]) / 2 - bb[0], cy - (bb[3] - bb[1]) / 2 - bb[1]), text, font=font, fill=255)
    core, halo, a = glow_layer(draw, 5, 34, color, 1.8)
    img = img * (1 - a[..., None] * 0.9) + core * a[..., None] + halo
    return img


def shelf_unit(img, cx, top, color_led=(255, 170, 90)):
    """Two floating shelves straddling a seam with books, a plant and a few objects, lit by an LED strip."""
    d_rgb = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)); d = ImageDraw.Draw(d_rgb)
    for k, sy in enumerate([top + 170, top + 380]):
        x0, x1 = cx - 230, cx + 230
        # objects on the shelf
        x = x0 + 14
        rs = random.Random(cx * 10 + k)
        while x < x1 - 40:
            kind = rs.random()
            if kind < 0.62:  # a run of books
                for _ in range(rs.randint(3, 7)):
                    bw, bh = rs.randint(14, 26), rs.randint(95, 140)
                    if x + bw > x1 - 20: break
                    col = rs.choice([(122, 46, 38), (40, 64, 92), (196, 160, 92), (58, 86, 60), (200, 190, 170), (150, 82, 40), (30, 30, 34)])
                    d.rectangle([x, sy - bh, x + bw, sy], fill=col)
                    d.rectangle([x + 2, sy - bh + 14, x + bw - 2, sy - bh + 19], fill=tuple(min(255, c + 50) for c in col))
                    x += bw + 1
                x += rs.randint(18, 40)
            elif kind < 0.82:  # small plant in a pot
                pw = 46; d.rounded_rectangle([x, sy - 52, x + pw, sy], 6, fill=(214, 206, 192))
                for _ in range(22):
                    ang = rs.uniform(-2.4, -0.7); ln = rs.uniform(30, 90)
                    sx, sy2 = x + pw / 2, sy - 50
                    d.line([sx, sy2, sx + math.cos(ang) * ln, sy2 + math.sin(ang) * ln], fill=rs.choice([(60, 110, 62), (82, 140, 70), (44, 92, 52)]), width=7)
                x += pw + 26
            else:  # a vase / object
                d.ellipse([x, sy - 90, x + 50, sy], fill=rs.choice([(30, 30, 34), (180, 92, 60), (226, 220, 210)]))
                x += 70
        # the shelf board and its shadow
        d.rectangle([x0, sy, x1, sy + 16], fill=(52, 34, 22))
        d.rectangle([x0, sy + 16, x1, sy + 20], fill=(30, 20, 14))
    arr = np.asarray(d_rgb, np.float32)
    # LED wash under each shelf
    for sy in [top + 170, top + 380]:
        wash = light_pool(cx, sy + 60, 260, 70, 0.55)
        arr = arr + wash[..., None] * np.array(color_led, np.float32) * 0.55
    return arr


def leaf(d, x, y, ang, length, width, col):
    pts_l, pts_r = [], []
    for i in range(13):
        t = i / 12; w = math.sin(t * math.pi) ** 0.8 * width
        bend = 0.25 * t * t
        a = ang + bend
        px, py = x + math.cos(a) * length * t, y + math.sin(a) * length * t
        nx, ny = -math.sin(a), math.cos(a)
        pts_l.append((px + nx * w, py + ny * w)); pts_r.append((px - nx * w, py - ny * w))
    d.polygon(pts_l + pts_r[::-1], fill=col)
    d.line([x, y, x + math.cos(ang) * length * 0.85, y + math.sin(ang) * length * 0.85], fill=tuple(max(0, c - 18) for c in col), width=3)


def plant(img, cx, base, height, spread):
    """A potted fiddle-leaf / rubber plant: woody stems with broad leaves."""
    im = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)); d = ImageDraw.Draw(im)
    rs = random.Random(cx)
    top = base - 170
    stems = []
    for _ in range(5):
        ang = rs.uniform(-math.pi * 0.72, -math.pi * 0.28); ln = rs.uniform(height * 0.55, height * 0.95)
        sx = cx + rs.uniform(-20, 20); ex, ey = sx + math.cos(ang) * ln * spread * 0.6, top + math.sin(ang) * ln
        d.line([sx, top, ex, ey], fill=(70, 52, 36), width=9); stems.append((sx, top, ex, ey))
    greens = [(46, 92, 50), (60, 112, 58), (38, 78, 44), (78, 128, 66), (52, 100, 54)]
    for sx, sy, ex, ey in stems:
        for k in range(9):
            t = 0.25 + 0.75 * k / 8; px, py = sx + (ex - sx) * t, sy + (ey - sy) * t
            side = -1 if k % 2 else 1
            ang = math.atan2(ey - sy, ex - sx) + side * rs.uniform(0.6, 1.2)
            leaf(d, px, py, ang, rs.uniform(90, 150), rs.uniform(28, 44), rs.choice(greens))
        leaf(d, ex, ey, math.atan2(ey - sy, ex - sx), 130, 40, rs.choice(greens))
    # pot drawn last so it sits in front of the stems
    d.polygon([(cx - 95, top), (cx + 95, top), (cx + 74, base), (cx - 74, base)], fill=(40, 38, 40))
    d.rectangle([cx - 100, top - 8, cx + 100, top + 10], fill=(52, 50, 52))
    arr = np.asarray(im, np.float32)
    return arr


def desk(wood=(92, 58, 36), led=(255, 122, 69), front=None):
    """Foreground desk spanning the whole room: top surface with grain and a highlight, darker front, LED edge glow."""
    fg = np.zeros((H, W, 4), np.float32)
    top_h = 96
    y = np.arange(H)[:, None].astype(np.float32)
    grain = noise(H, W, 10, (1.5, 40)) + noise(H, W, 5, (0.8, 8))
    base = np.array(wood, np.float32)
    surf = (y >= DESK_Y) & (y < DESK_Y + top_h)
    front_m = y >= DESK_Y + top_h
    lum = base.mean() / 255
    shade_top = (1.05 - 0.15 * lum) + (0.25 - 0.2 * lum) * ((y - DESK_Y) / top_h)  # brighter toward the front edge (less on pale wood)
    rgb = np.where(surf[..., None], base * shade_top[..., None] + grain[..., None], 0)
    fcol = np.array(front, np.float32) if front else base * 0.42
    rgb = np.where(front_m[..., None], fcol * (1 - (y - DESK_Y - top_h)[..., None] / H * 0.5) + grain[..., None] * (0.15 if front else 0.5) - (0 if front else 1) * (y - DESK_Y - top_h)[..., None] * 0.04, rgb)
    # specular strip along the front edge and the edge itself
    edge = np.exp(-((y - (DESK_Y + top_h - 6)) / 5) ** 2)
    rgb = rgb + edge[..., None] * (70 - 50 * lum)
    # LED strip under the lip
    if led:
        glow = np.exp(-np.clip(y - (DESK_Y + top_h + 8), 0, None) / 26) * (y >= DESK_Y + top_h + 8)
        rgb = rgb + glow[..., None] * np.array(led, np.float32) * 0.55
    else:  # no LED: a soft shadow under the lip instead
        rgb = rgb * (1 - 0.35 * np.exp(-np.clip(y - (DESK_Y + top_h), 0, None) / 18) * front_m)[..., None]
    # warm pools of light on the desk in front of each seat
    for cx in (W / 6, W / 2, 5 * W / 6):
        pool = light_pool(cx, DESK_Y + 30, 420, 60, 0.18)
        rgb = rgb + pool[..., None] * np.array([255, 210, 160], np.float32) * (surf[..., None])
    alpha = ((y >= DESK_Y).astype(np.float32) * np.ones((1, W)))
    # a soft contact shadow above the desk edge darkens whatever is right behind it (people's bellies, the wall)
    fg[..., :3] = np.clip(rgb, 0, 255)
    fg[..., 3] = alpha * 255
    shadow = np.clip(1 - (DESK_Y - y) / 26, 0, 1) * (y < DESK_Y) * 0.55
    fg[..., 3] = np.maximum(fg[..., 3], shadow * np.ones((1, W)) * 255)
    return fg


def finish(name, wall, fg, dof=2.2, vignette=0.38, grade=(1.0, 1.0, 1.0)):
    wall = gaussian_filter(wall, (dof, dof, 0))
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    v = 1 - vignette * (((x - W / 2) / (W / 2)) ** 2 * 0.5 + ((y - H * 0.45) / (H * 0.7)) ** 2)
    wall = wall * v[..., None] * np.array(grade, np.float32)
    wall = wall + rng.standard_normal(wall.shape[:2])[..., None] * 2.2  # a little film grain hides banding
    bg = np.clip(wall, 0, 255).astype(np.uint8)
    Image.fromarray(bg).save(os.path.join(OUT, f'{name}-bg.jpg'), quality=86, optimize=True, progressive=True)
    fgi = Image.fromarray(np.clip(fg, 0, 255).astype(np.uint8), 'RGBA')  # full height: desk props can stand tall
    fgi.save(os.path.join(OUT, f'{name}-fg.png'), optimize=True)
    comp = Image.fromarray(bg).convert('RGBA'); comp.alpha_composite(fgi)
    comp.convert('RGB').resize((960, 480), Image.LANCZOS).save(os.path.join(OUT, f'{name}-preview.jpg'), quality=82)
    print('wrote', name)


def set_studio():
    """Warm wood-slat studio: neon sign up top, shelves at the seams, plants at the edges."""
    x = np.arange(W)
    slat = 44
    pos = x % slat
    slat_id = x // slat
    tone = rng.uniform(0.85, 1.12, slat_id.max() + 1)[slat_id]
    gapmask = (pos < 7).astype(np.float32)
    base = np.array([96, 62, 40], np.float32)
    wall = np.ones((H, W, 3), np.float32) * base
    wall *= tone[None, :, None]
    wall += noise(H, W, 9, (60, 0.6))[..., None]  # vertical grain
    round_ = np.sin(np.clip((pos - 7) / (slat - 7), 0, 1) * math.pi) ** 0.6  # each slat is slightly rounded
    wall *= (0.75 + 0.3 * round_)[None, :, None]
    wall *= (1 - 0.82 * gapmask)[None, :, None]
    # lighting: wall washers at the seams and edges, darker behind people so they pop
    light = sum(light_pool(cx, 120, 300, 900, 0.95) for cx in [0, *SEAMS, W]) + light_pool(W / 2, 60, 900, 260, 0.5)
    light += 0.25
    wall = apply_light(wall, np.clip(light, 0, 1.5))
    for s in SEAMS: wall = shelf_unit(wall, s, 300)
    wall = plant(wall, 150, DESK_Y + 40, 520, 0.9); wall = plant(wall, W - 150, DESK_Y + 40, 520, 0.9)
    wall = bokeh(wall, 60, 20, 260, [(255, 190, 120), (255, 150, 90)], 8, 18, 0.5)
    wall = neon_text(wall, 'THE BOYS', W / 2, 118, 120, (255, 110, 64))
    finish('studio', wall, desk((96, 60, 36)), dof=2.0)


def set_brick():
    """Exposed-brick loft with pendant lamps and framed prints at the seams."""
    wall = np.zeros((H, W, 3), np.float32)
    bw, bh, mortar = 150, 52, 8
    for row in range(H // bh + 1):
        off = (bw // 2) * (row % 2)
        for col in range(-1, W // bw + 2):
            x0, y0 = col * bw + off, row * bh
            c = np.array([rng.normal(138, 10), rng.normal(78, 7), rng.normal(62, 6)], np.float32) * rng.uniform(0.86, 1.06)
            if rng.random() < 0.08: c *= 0.7
            xa, xb, ya, yb = max(0, x0 + mortar // 2), min(W, x0 + bw - mortar // 2), max(0, y0 + mortar // 2), min(H, y0 + bh - mortar // 2)
            if xa < xb and ya < yb: wall[ya:yb, xa:xb] = c
    mortar_mask = (wall.sum(-1) == 0)
    wall[mortar_mask] = [168, 156, 142]
    wall += noise(H, W, 8, 1.2)[..., None] + noise(H, W, 7, 6)[..., None]
    light = sum(light_pool(cx, 330, 330, 520, 1.0) for cx in [*SEAMS]) + light_pool(0, 300, 260, 700, 0.7) + light_pool(W, 300, 260, 700, 0.7) + 0.22
    wall = apply_light(wall, np.clip(light, 0, 1.5), (1.0, 0.84, 0.66))
    im = Image.fromarray(np.clip(wall, 0, 255).astype(np.uint8)); d = ImageDraw.Draw(im)
    # framed prints at the seams
    for i, s in enumerate(SEAMS):
        d.rectangle([s - 150, 360, s + 150, 760], fill=(22, 22, 24))
        d.rectangle([s - 132, 378, s + 132, 742], fill=[(232, 214, 186), (40, 70, 110)][i])
        d.ellipse([s - 80, 450, s + 80, 610], fill=[(220, 92, 60), (240, 190, 90)][i])
        d.rectangle([s - 132, 640, s + 132, 742], fill=[(40, 52, 70), (230, 220, 200)][i])
    # pendant lamps hanging above the seams
    for s in SEAMS:
        d.line([s, 0, s, 170], fill=(20, 20, 20), width=5)
        d.polygon([(s - 70, 250), (s + 70, 250), (s + 30, 170), (s - 30, 170)], fill=(26, 26, 28))
    wall = np.asarray(im, np.float32)
    for s in SEAMS:
        bulb = light_pool(s, 258, 40, 16, 1.0)
        wall += bulb[..., None] * np.array([255, 220, 160]) * 1.2
        wall += light_pool(s, 300, 190, 160, 0.35)[..., None] * np.array([255, 190, 120])
    wall = plant(wall, 160, DESK_Y + 40, 560, 0.95); wall = plant(wall, W - 160, DESK_Y + 40, 560, 0.95)
    wall = neon_text(wall, 'THE BOYS', W / 2, 118, 100, (80, 200, 255))
    finish('brick', wall, desk((70, 48, 34), (80, 200, 255)), dof=1.6)


def set_city():
    """Night city behind floor-to-ceiling windows; mullions at the seams and edges."""
    y = np.arange(H)[:, None, None].astype(np.float32)
    sky = np.array([10, 14, 34], np.float32) * (1 - y / H) + np.array([70, 40, 86], np.float32) * (y / H)
    wall = np.ones((H, W, 3), np.float32) * sky
    im = Image.fromarray(np.clip(wall, 0, 255).astype(np.uint8)); d = ImageDraw.Draw(im)
    rs = random.Random(3)
    for layer, (col, hmin, hmax, wmin, wmax, lit) in enumerate([((26, 24, 44), 260, 640, 90, 200, 0.15), ((16, 16, 28), 380, 900, 120, 260, 0.28)]):
        x = -50
        while x < W:
            bw = rs.randint(wmin, wmax); bh = rs.randint(hmin, hmax); top = DESK_Y - bh
            d.rectangle([x, top, x + bw, DESK_Y], fill=col)
            for wy in range(top + 18, DESK_Y - 10, 26):
                for wx in range(x + 12, x + bw - 12, 22):
                    if rs.random() < lit: d.rectangle([wx, wy, wx + 9, wy + 12], fill=rs.choice([(255, 210, 140), (255, 236, 200), (170, 200, 255)]))
            x += bw + rs.randint(4, 30)
    wall = np.asarray(im, np.float32)
    wall = gaussian_filter(wall, (7, 7, 0))  # far away: strongly out of focus
    wall = bokeh(wall, 55, H * 0.4, DESK_Y, [(255, 200, 120), (255, 150, 100), (150, 190, 255)], 22, 44, 0.32)
    # window frame: dark mullions at edges and seams, a transom bar up top, faint reflections on the glass
    im = Image.fromarray(np.clip(wall, 0, 255).astype(np.uint8)); d = ImageDraw.Draw(im)
    for s in [0, *SEAMS, W]: d.rectangle([s - 22, 0, s + 22, H], fill=(14, 14, 18))
    d.rectangle([0, 0, W, 34], fill=(14, 14, 18))
    wall = np.asarray(im, np.float32)
    wall += light_pool(W / 2, H * 0.1, W * 0.8, 200, 0.08)[..., None] * 255
    wall = neon_text(wall, 'THE BOYS', W / 2, 118, 96, (255, 90, 140))
    finish('city', wall, desk((54, 40, 34), (255, 90, 140)), dof=1.0, vignette=0.3)


# ---------- natural, bright sets: warm white walls, window light, pink/red accents ----------

def plaster(base=(238, 233, 228)):
    wall = np.ones((H, W, 3), np.float32) * np.array(base, np.float32)
    wall += noise(H, W, 5, 60)[..., None] + noise(H, W, 2.5, 3)[..., None] + noise(H, W, 1.2, 0.8)[..., None]
    return wall


def daylight(wall, from_left=True, beams=True):
    """Soft window light: a broad falloff across the room plus two slanted light patches with a mullion shadow."""
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    xn = x / W if from_left else 1 - x / W
    light = 1.06 - 0.22 * xn - 0.10 * ((y / H - 0.35) ** 2) * 4
    if beams:
        for x0, w in [(380, 520), (980, 420)]:
            sx = x - (y * 0.55) - (x0 if from_left else W - x0 - w)
            patch = ((sx > 0) & (sx < w) & (y > 120) & (y < DESK_Y)).astype(np.float32)
            mull = (np.abs(sx - w / 2) < 14).astype(np.float32)
            patch = gaussian_filter(patch * (1 - mull), 22)
            light += patch * 0.12
    wall = wall * light[..., None]
    return wall * np.array([1.0, 0.985, 0.965], np.float32)  # warm afternoon cast


def soft_shadow(wall, mask, dx=26, dy=30, blur=26, strength=0.22):
    sh = gaussian_filter(np.roll(np.roll(mask, dy, 0), dx, 1), blur)
    return wall * (1 - sh[..., None] * strength)


def shape_mask(draw_fn):
    m = Image.new('L', (W, H), 0); draw_fn(ImageDraw.Draw(m)); return np.asarray(m, np.float32) / 255


def paint(wall, mask, color, shade=None):
    col = np.array(color, np.float32)
    layer = col * (shade[..., None] if shade is not None else 1)
    return wall * (1 - mask[..., None]) + layer * mask[..., None]


def neon_on_light(wall, text, cx, cy, size, color):
    """Neon on a white wall: the tube reads as colour, the glow tints the wall rather than brightening it."""
    font = ImageFont.truetype(FONT, size)
    def draw(d):
        bb = d.textbbox((0, 0), text, font=font)
        d.text((cx - (bb[2] - bb[0]) / 2 - bb[0], cy - (bb[3] - bb[1]) / 2 - bb[1]), text, font=font, fill=255)
    a = shape_mask(draw)
    halo = np.clip(gaussian_filter(a, 10) * 1.1 + gaussian_filter(a, 40) * 0.6, 0, 1)
    c = np.array(color, np.float32)
    wall = wall * (1 - halo[..., None] * 0.45) + c * halo[..., None] * 0.45
    core = np.array([255, 235, 238], np.float32) * 0.55 + c * 0.45
    return wall * (1 - a[..., None]) + core * a[..., None]


def vase_flowers(d, cx, base, color=(214, 40, 60), vase=(236, 226, 220), seed=1, scale=1.0):
    rs = random.Random(seed)
    vw, vh = 70 * scale, 120 * scale
    for _ in range(14):  # stems + blooms
        ang = rs.uniform(-2.2, -0.95); ln = rs.uniform(120, 230) * scale
        ex, ey = cx + math.cos(ang) * ln, base - vh + math.sin(ang) * ln
        d.line([cx, base - vh + 10, ex, ey], fill=(70, 110, 70), width=int(5 * scale))
        r = rs.uniform(16, 26) * scale
        col = tuple(int(max(0, min(255, c + rs.uniform(-25, 25)))) for c in color)
        d.ellipse([ex - r, ey - r, ex + r, ey + r], fill=col)
        d.ellipse([ex - r * 0.45, ey - r * 0.45, ex + r * 0.45, ey + r * 0.45], fill=tuple(int(c * 0.8) for c in col))
    d.rounded_rectangle([cx - vw / 2, base - vh, cx + vw / 2, base], radius=int(26 * scale), fill=vase)


def set_blush():
    """White plaster in afternoon light, pink arched niches at the seams, a red neon, blush-pink desk front."""
    wall = daylight(plaster())
    for s_ in SEAMS:
        niche = shape_mask(lambda d, s_=s_: (d.rectangle([s_ - 150, 470, s_ + 150, 900], fill=255), d.ellipse([s_ - 150, 320, s_ + 150, 620], fill=255)))
        inner = shape_mask(lambda d, s_=s_: (d.rectangle([s_ - 150, 470, s_ + 150, 900], fill=255), d.ellipse([s_ - 150, 320, s_ + 150, 620], fill=255)))
        y = np.arange(H)[:, None].astype(np.float32)
        shade = np.clip(0.86 + (y - 320) / 1600, 0.8, 1.0) * np.ones((1, W))
        wall = paint(wall, niche, (234, 182, 186), shade)
        wall = wall * (1 - gaussian_filter(inner, 14)[..., None] * 0.08 * (1 - inner[..., None]))  # inner shadow lip
        im = Image.fromarray(np.clip(wall, 0, 255).astype(np.uint8)); d = ImageDraw.Draw(im)
        d.rectangle([s_ - 150, 690, s_ + 150, 706], fill=(240, 232, 226))  # little shelf
        vase_flowers(d, s_ - 40, 690, (204, 30, 52), (246, 240, 236), seed=s_, scale=0.75)
        d.ellipse([s_ + 40, 640, s_ + 110, 690], fill=(196, 44, 58))  # a red ceramic bowl
        d.rectangle([s_ - 120, 880, s_ + 120, 896], fill=(240, 232, 226))
        for k in range(5):
            d.rectangle([s_ - 110 + k * 30, 790, s_ - 86 + k * 30, 880], fill=[(232, 220, 210), (200, 60, 72), (246, 242, 238), (226, 150, 160), (160, 40, 52)][k])
        wall = np.asarray(im, np.float32)
    wall = plant(wall, 150, DESK_Y + 40, 500, 0.85); wall = plant(wall, W - 150, DESK_Y + 40, 500, 0.85)
    wall = neon_on_light(wall, 'the boys', W / 2, 150, 120, (232, 36, 74))
    finish('blush', wall, desk((222, 200, 174), None, (232, 186, 188)), dof=4.0, vignette=0.18)


def set_gallery():
    """Gallery-white wall with abstract pink/red prints under picture lights; light oak desk with a red edge."""
    wall = daylight(plaster((241, 238, 234)), from_left=False)
    prints = [(SEAMS[0], 300, 420, 'arch'), (SEAMS[1], 300, 420, 'circles'), (150, 360, 300, 'stripe'), (W - 150, 360, 300, 'blob')]
    for cx, top, h, kind in prints:
        w = h * 0.75; x0, x1, y0, y1 = cx - w / 2, cx + w / 2, top, top + h
        frame = shape_mask(lambda d: d.rectangle([x0 - 16, y0 - 16, x1 + 16, y1 + 16], fill=255))
        wall = soft_shadow(wall, frame, 18, 24, 18, 0.25)
        im = Image.fromarray(np.clip(wall, 0, 255).astype(np.uint8)); d = ImageDraw.Draw(im)
        d.rectangle([x0 - 16, y0 - 16, x1 + 16, y1 + 16], fill=(196, 168, 132))
        d.rectangle([x0, y0, x1, y1], fill=(246, 240, 234))
        if kind == 'arch':
            d.rectangle([x0 + 50, y0 + 160, x1 - 50, y1 - 40], fill=(226, 140, 150)); d.ellipse([x0 + 50, y0 + 60, x1 - 50, y0 + 260], fill=(226, 140, 150))
            d.ellipse([cx - 40, y1 - 150, cx + 40, y1 - 70], fill=(196, 34, 52))
        elif kind == 'circles':
            d.ellipse([x0 + 30, y0 + 50, x0 + 230, y0 + 250], fill=(206, 40, 58)); d.ellipse([x1 - 230, y1 - 240, x1 - 40, y1 - 50], fill=(240, 178, 184))
        elif kind == 'stripe':
            for k, col in enumerate([(240, 190, 194), (214, 72, 88), (246, 222, 214)]): d.rectangle([x0 + 20, y0 + 20 + k * 86, x1 - 20, y0 + 96 + k * 86], fill=col)
        else:
            d.ellipse([x0 + 20, y0 + 60, x1 - 10, y1 - 60], fill=(232, 160, 168)); d.ellipse([x0 + 70, y0 + 120, x1 - 80, y1 - 140], fill=(190, 36, 56))
        # brass picture light above
        d.rounded_rectangle([cx - 80, y0 - 70, cx + 80, y0 - 50], 10, fill=(176, 146, 92)); d.line([cx, y0 - 50, cx, y0 - 20], fill=(150, 124, 80), width=6)
        wall = np.asarray(im, np.float32)
        wall += light_pool(cx, y0 + 60, w * 0.75, h * 0.55, 0.12)[..., None] * np.array([255, 236, 210])
    wall = plant(wall, 90, DESK_Y + 40, 380, 0.7) if False else wall
    finish('gallery', wall, desk((214, 186, 150), None, (196, 46, 60)), dof=3.4, vignette=0.16)


def set_rose():
    """Parisian white panel mouldings, pink flowers and red mushroom lamps glowing on the desk at the seams."""
    wall = daylight(plaster((240, 236, 232)), beams=False)
    def moulding(x0, y0, x1, y1):
        m = shape_mask(lambda d: d.rectangle([x0, y0, x1, y1], outline=255, width=12))
        hi = shape_mask(lambda d: d.rectangle([x0 - 4, y0 - 4, x1 - 4, y1 - 4], outline=255, width=4))
        return m, hi
    panel_w = W / 6
    for i in range(6):
        x0 = i * panel_w + 46; x1 = (i + 1) * panel_w - 46
        for (y0, y1) in [(110, 1120)]:
            m, hi = moulding(x0, y0, x1, y1)
            wall = wall * (1 - gaussian_filter(m, 3)[..., None] * 0.13) + hi[..., None] * 10
    # soft pink wash low on the wall, like light bouncing off a rug
    yy = np.arange(H)[:, None].astype(np.float32)
    wash = np.clip((yy - 700) / 500, 0, 1) * 0.10
    wall = wall * (1 - wash[..., None]) + np.array([236, 170, 178], np.float32) * wash[..., None]
    wall = neon_on_light(wall, 'the boys', W / 2, 150, 110, (226, 60, 110))
    fg = desk((228, 222, 214), None, (238, 214, 214))
    # props on the desk at the seams: red mushroom lamps (lit) and a pink bouquet, drawn into the foreground layer
    im = Image.fromarray(np.clip(fg, 0, 255).astype(np.uint8), 'RGBA'); d = ImageDraw.Draw(im)
    for k, s_ in enumerate(SEAMS):
        base = DESK_Y + 40
        if k == 0:
            d.rounded_rectangle([s_ - 30, base - 230, s_ + 30, base], 14, fill=(196, 32, 48, 255))
            d.ellipse([s_ - 70, base - 20, s_ + 70, base + 6], fill=(186, 30, 46, 255))
            d.pieslice([s_ - 160, base - 400, s_ + 160, base - 80], 180, 360, fill=(216, 44, 62, 255))
            d.chord([s_ - 160, base - 260, s_ + 160, base - 220], 0, 180, fill=(255, 214, 190, 255))
        else:
            vase_flowers(d, s_, base, (232, 120, 150), (250, 246, 242), seed=9, scale=1.5)
    fg = np.asarray(im, np.float32)
    # warm glow from the lamp onto the wall behind it
    wall += light_pool(SEAMS[0], DESK_Y - 260, 380, 260, 0.35)[..., None] * np.array([255, 180, 150])
    finish('rose', wall, fg, dof=3.8, vignette=0.15)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    set_studio(); set_brick(); set_city(); set_blush(); set_gallery(); set_rose()
