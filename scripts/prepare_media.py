"""Builds every web-ready media file for the Morrow site.

Sources (never edited):
  media/flow/     Google Flow clips, exactly as downloaded
  media/concept/  ChatGPT stills

Output (rebuilt from scratch each run, never edit by hand):
  public/media/hero/   the opening as one continuous film, played forwards and reversed, in two
                       sizes; film.json with the frame of every stop; a still of every stop
  public/media/stills/ section photos
  public/media/fx/     textures used by the code effects

Needs ffmpeg on the PATH, and Python with numpy, Pillow, scipy and scikit-image.
Run with:  npm run media
To check the edit quickly at half size without publishing:  python scripts/prepare_media.py --preview <folder>

How the opening is cut
----------------------
The Flow clips were made one at a time, so each starts from its own camera position. The film
is rendered frame by frame so that every join can hide that:

- Down through the cloud: the first aerial shot is left while still inside the cloud, and the
  second emerges from it, so the descent happens once.
- Morph dissolves: where one shot hands over to the next, the outgoing shot is first zoomed and
  shifted, frame by frame, to sit on top of the incoming one (measured alignments below). The
  remaining differences (a turned head, a table seen from a little higher) are then tracked pixel
  by pixel with optical flow and slid into place while the shots blend, like a morph cut, so there
  is never a double image. Where the alignment leaves an edge of the outgoing picture empty, the
  incoming picture fills it.
- Through the light: the camera pushes into the open doorway as warm light floods the lens, and
  comes out of it already inside.
- Holds where a shot slowed to a stop are trimmed, and the brighter door clips are graded to the
  same blue-hour colour as the street.
"""

import json
import math
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy.ndimage import gaussian_filter, map_coordinates
from skimage.registration import optical_flow_tvl1

ROOT = Path(__file__).resolve().parent.parent
FLOW = ROOT / "media" / "flow"
CONCEPT = ROOT / "media" / "concept"
OUT = ROOT / "public" / "media"

FPS = 24
FULL_W, FULL_H = 1920, 1080
W, H = FULL_W, FULL_H  # changed for previews
SCALE = 1.0

CLIPS = {
    "c1": "C1 Through the clouds.mp4",
    "c2": "C2 Down to the street.mp4",
    "c3": "C3 Across to the door.mp4",
    "c4": "C4 The door opens.mp4",
    "c5": "C5 The host arrives.mp4",
    "c6": "C6 She opens the book.mp4",
    "c8": "C8 To the table..mp4",
    "c9": "C9 Above the table..mp4",
}

# Flow stamps "Veo" in the same bottom-right spot on every clip.
DELOGO = "delogo=x=1858:y=1034:w=46:h=28"

# C3 shows a second "MORROW" sign above the door that the rest of the film doesn't have.
# Where it sits over time: seconds, then left, right, top and bottom in the 1920x1080 frame.
SECOND_SIGN = [
    (1.6, 1032, 1248, 380, 428), (2.2, 992, 1240, 344, 400), (2.8, 964, 1210, 300, 364),
    (3.4, 928, 1212, 256, 316), (4.0, 874, 1220, 180, 256), (4.6, 810, 1240, 74, 166),
    (5.0, 786, 1254, 6, 110), (5.4, 740, 1280, -40, 24), (5.7, 720, 1300, -90, -10),
]

# ---------------------------------------------------------------------------------------------
# The edit. Frame numbers are frames of the Flow clip named.
# Alignments are (zoom, shift x, shift y) in 1920x1080 pixels that place the first shot's frame
# exactly over the second's, measured on the frames given.
# ---------------------------------------------------------------------------------------------

C1_OUT = 58          # C1 is left while still inside the cloud...
CLOUD = 42           # ...the camera spends this many frames in the cloud...
C2_IN = 8            # ...and C2 comes out of it above the rooftops.
C2_CORNER = 56       # the café's corner seen from above (a stop)
C2_FRONT = 124       # level with the shopfront (a stop)

# From the shopfront, the camera keeps gliding forward into C3's walk to the door.
STREET_RAMP = 20     # frames for the camera to ease from rest into C3's walking pace
STREET_MIX = 16      # frames of dissolve
STREET_SOFTEN = 11   # the two streets beside the café differ, so the sides of the frame are
                     # briefly defocused (up to this many pixels) while they dissolve
C3_IN = 60
STREET_TO_WALK = [   # C2@132 -> C3@frame
    (48, 1.010, +66, -50), (52, 1.035, +56, -58), (56, 1.075, +46, -64), (60, 1.110, +38, -68),
    (64, 1.145, +27, -76), (68, 1.185, +14, -84), (72, 1.230, +3, -91), (76, 1.280, -6, -102),
    (80, 1.330, -14, -112),
]

# The walk settles at the doors, which match C4's doors at about C3 frame 127.
WALK_SETTLE = (108, 127)   # C3 frames over which the camera eases onto C4's framing
WALK_MIX = 10              # the last frames of that, dissolving into C4 frames 3-12
WALK_TO_DOOR = [   # C3@frame -> C4@12
    (100, 1.445, -108, -114), (104, 1.370, -94, -104), (108, 1.295, -77, -92), (112, 1.225, -62, -88),
    (116, 1.160, -55, -80), (120, 1.095, -50, -70), (124, 1.040, -46, -64), (128, 0.990, -42, -56),
    (132, 0.950, -39, -53),
]
DOOR_STILL = 12      # the closed doors (a stop); C4's hand reaches in after this...
DOOR_OPEN = 86       # ...and is gone by here, where the doors are opening
DOOR_RAMP, DOOR_MIX = 8, 12
DOOR_CREEP = (1.045, +9, +2)   # C4@12 -> C4@86: the camera crept forward meanwhile

LIGHT_POINT = (0.5, 0.43)   # the bright doorway, as fractions of the frame
LIGHT_PUSH = 30             # frames of pushing into the light
LIGHT_FLOOD = 18            # frames for the light to fill the lens
C4_PEAK = 124               # C4 frame where the light peaks
LIGHT_CROSS = 5             # frames where outside and inside meet inside the glow
C5_IN = 56                  # C5 picks up just inside, after its doorframe has passed
LIGHT_FADE = 22             # frames for the eyes to adjust to the room

C5_HOST = 120               # the host at her stand (a stop); C5 keeps gliding towards her
HOST_RAMP, HOST_MIX = 15, 12
C6_IN = 28                  # C6 picks up just before she looks down to the book
HOST_TO_BOOK = [   # C5@frame -> C6@(frame - 108): the two cameras moving together
    (132, 1.060, -16, +18), (136, 1.065, -20, +21), (140, 1.075, -28, +24), (144, 1.085, -36, +24),
    (148, 1.095, -46, +23), (152, 1.115, -58, +22),
]

C8_SETTLE = (102, 115)      # C8 frames over which the camera settles onto C9's opening framing
TABLE_MIX = 10
TABLE_TO_RISE = [  # C8@frame -> C9@0 (C9 holds still for its first half second)
    (84, 1.030, -117, -173), (92, 1.005, -78, -140), (100, 1.000, -46, -114), (108, 0.995, -22, -96),
    (118, 1.000, -6, -82),
]

# width, height, quality (lower is better), bitrate ceiling, extra filters
SIZES = {
    "": (1920, 1080, 20, "8M", "unsharp=5:5:0.45:5:5:0"),
    "-sm": (1280, 720, 23, "3M", None),
}

IDENTITY = (1.0, 0.0, 0.0)


# ---------------------------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------------------------

def ffmpeg(*args, **kwargs):
    return subprocess.run(["ffmpeg", "-v", "error", "-y", *map(str, args)], check=True, **kwargs)


def count(video):
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-count_packets",
         "-show_entries", "stream=nb_read_packets", "-of", "csv=p=0", str(video)],
        check=True, capture_output=True, text=True,
    )
    return int(result.stdout.strip())


def smooth(t):
    t = min(1.0, max(0.0, t))
    return t * t * (3 - 2 * t)


def ease_in(t):
    t = min(1.0, max(0.0, t))
    return t * t


def ease_into(t, slope):
    """Starts from rest and arrives moving at `slope` (1 is the average pace of the whole ramp),
    so a camera move can hand over to a shot that is already moving."""
    t = min(1.0, max(0.0, t))
    return (3 - slope) * t * t + (slope - 2) * t * t * t


def lerp(a, b, t):
    return a + (b - a) * t


def blend_transform(a, b, t):
    """From transform a to b; zoom moves evenly in log space."""
    return (math.exp(lerp(math.log(a[0]), math.log(b[0]), t)), lerp(a[1], b[1], t), lerp(a[2], b[2], t))


def track(keys, n):
    """The measured alignment at frame n, interpolated (and extended) between keys."""
    keys = sorted(keys)
    if len(keys) == 1:
        return keys[0][1:]
    i = 1
    while i < len(keys) - 1 and n > keys[i][0]:
        i += 1
    (n0, *a), (n1, *b) = keys[i - 1], keys[i]
    t = (n - n0) / (n1 - n0)
    return (math.exp(lerp(math.log(a[0]), math.log(b[0]), t)), lerp(a[1], b[1], t), lerp(a[2], b[2], t))


def about(point, zoom):
    """A zoom by `zoom` that keeps `point` (fractions of the frame) where it is."""
    px, py = point[0] * FULL_W - FULL_W / 2, point[1] * FULL_H - FULL_H / 2
    return (zoom, (1 - zoom) * px, (1 - zoom) * py)


# ---------------------------------------------------------------------------------------------
# Colour: match the door clips to the street's blue-hour grade with a 3D LUT
# ---------------------------------------------------------------------------------------------

_RGB_TO_XYZ = np.array([[0.4124564, 0.3575761, 0.1804375],
                        [0.2126729, 0.7151522, 0.0721750],
                        [0.0193339, 0.1191920, 0.9503041]])
_WHITE = np.array([0.95047, 1.0, 1.08883])
LUT_SIZE = 33


def srgb_to_lab(rgb):
    lin = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    xyz = lin @ _RGB_TO_XYZ.T / _WHITE
    f = np.where(xyz > (6 / 29) ** 3, np.cbrt(xyz), xyz / (3 * (6 / 29) ** 2) + 4 / 29)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def lab_to_srgb(lab):
    fy = (lab[..., 0] + 16) / 116
    f = np.stack([fy + lab[..., 1] / 500, fy, fy - lab[..., 2] / 200], -1)
    xyz = np.where(f > 6 / 29, f ** 3, 3 * (6 / 29) ** 2 * (f - 4 / 29)) * _WHITE
    lin = np.clip(xyz @ np.linalg.inv(_RGB_TO_XYZ).T, 0, None)
    return np.clip(np.where(lin <= 0.0031308, 12.92 * lin, 1.055 * lin ** (1 / 2.4) - 0.055), 0, 1)


def sample(clip, frames, table=None):
    """Small copies of a few frames, for measuring colour."""
    images = []
    for n in frames:
        raw = ffmpeg("-i", FLOW / CLIPS[clip], "-vf", f"{DELOGO},select=eq(n\\,{n}),scale=480:270",
                     "-frames:v", 1, "-fps_mode", "passthrough", "-f", "rawvideo", "-pix_fmt", "rgb24", "-",
                     capture_output=True).stdout
        image = np.frombuffer(raw, np.uint8).reshape(270, 480, 3)
        images.append(apply_lut(table, image) if table is not None else image)
    return images


def lab_stats(images):
    lab = np.concatenate([srgb_to_lab(im / 255.0).reshape(-1, 3) for im in images])
    return lab.mean(0), lab.std(0)


def grade_lut(source, reference, strength=0.8, contrast=0.5):
    """Moves the colour of `source` frames towards `reference` frames (Reinhard transfer in Lab):
    averages are matched fully, spread only partly, so contrast stays natural."""
    (ms, ss), (mr, sr) = lab_stats(source), lab_stats(reference)
    grid = np.linspace(0, 1, LUT_SIZE)
    b, g, r = np.meshgrid(grid, grid, grid, indexing="ij")
    lab = srgb_to_lab(np.stack([r, g, b], -1))
    matched = (lab - ms) * (1 + (sr / ss - 1) * contrast) + mr
    return lab_to_srgb(lab + (matched - lab) * strength)  # [b][g][r] -> rgb


def apply_lut(table, image):
    x = image.astype(np.float32) / 255 * (LUT_SIZE - 1)
    i0 = np.clip(np.floor(x).astype(int), 0, LUT_SIZE - 2)
    t = x - i0
    out = np.zeros_like(x)
    for dr in (0, 1):
        for dg in (0, 1):
            for db in (0, 1):
                w = ((t[..., 0] if dr else 1 - t[..., 0]) * (t[..., 1] if dg else 1 - t[..., 1])
                     * (t[..., 2] if db else 1 - t[..., 2]))
                out += w[..., None] * table[i0[..., 2] + db, i0[..., 1] + dg, i0[..., 0] + dr]
    return (np.clip(out, 0, 1) * 255).astype(np.uint8)


def write_cube(table, path):
    with open(path, "w") as f:
        f.write(f"LUT_3D_SIZE {LUT_SIZE}\n")
        for row in table.reshape(-1, 3):
            f.write(f"{row[0]:.6f} {row[1]:.6f} {row[2]:.6f}\n")
    return path.name


def build_grades(work):
    street = sample("c2", [112, 124, 136])
    walk = grade_lut(sample("c3", [60, 68, 76]), street)
    door = grade_lut(sample("c4", [0, 6, 12]), sample("c3", [120, 124, 127], walk))
    return {"c3": write_cube(walk, work / "c3.cube"), "c4": write_cube(door, work / "c4.cube")}


# ---------------------------------------------------------------------------------------------
# Reading, reshaping and writing frames
# ---------------------------------------------------------------------------------------------

class Reader:
    """Plays one Flow clip forwards from a given frame, cleaned and graded, as RGB arrays."""

    def __init__(self, clip, start, work, lut=None, fix=None):
        filters = [DELOGO] + ([f"lut3d=file={lut}"] if lut else [])
        if (W, H) != (FULL_W, FULL_H):
            filters.append(f"scale={W}:{H}:flags=lanczos")
        self.proc = subprocess.Popen(
            ["ffmpeg", "-v", "error", "-ss", f"{max(0.0, (start - 0.25) / FPS):.4f}", "-i", str(FLOW / CLIPS[clip]),
             "-vf", ",".join(filters), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
            stdout=subprocess.PIPE, cwd=work,
        )
        self.clip = clip
        self.next = start
        self.index = None
        self.frame = None
        self.fix = fix

    def at(self, n):
        if n == self.index:
            return self.frame
        if self.index is not None and n < self.index:
            raise ValueError(f"{self.clip}: frame {n} is behind frame {self.index}")
        size = W * H * 3
        while self.next <= n:
            raw = self.proc.stdout.read(size)
            if len(raw) < size:
                raise EOFError(f"{self.clip} ended before frame {n}")
            current = self.next
            self.next += 1
            if current == n:
                frame = np.frombuffer(raw, np.uint8).reshape(H, W, 3)
                self.frame = self.fix(frame.copy(), n) if self.fix else frame
                self.index = n
        return self.frame

    def close(self):
        self.proc.stdout.close()
        self.proc.kill()
        self.proc.wait()


def paint_out_sign(image, index):
    """Removes C3's second sign. The hole is filled by blending the rows just above and below it,
    so it reads as a plain panel over the door."""
    t = index / FPS
    keys = SECOND_SIGN
    if t < keys[0][0] - 0.3 or t > keys[-1][0]:
        return image
    times = [k[0] for k in keys]
    left, right, top, bottom = (float(np.interp(t, times, [k[i] for k in keys])) * SCALE for i in range(1, 5))
    pad_x, pad_y = (10 * SCALE) + 0.03 * (right - left), (8 * SCALE) + 0.14 * (bottom - top)
    x0, x1 = int(max(0, left - pad_x)), int(min(W, right + pad_x))
    y0, y1 = int(max(1, top - pad_y)), int(min(H - 1, bottom + pad_y))
    if x1 <= x0 or y1 <= y0:
        return image
    work = image.astype(np.float32)
    above, below = work[y0 - 1, x0:x1], work[y1, x0:x1]
    steps = np.linspace(0, 1, y1 - y0)[:, None, None]
    fill = above[None] * (1 - steps) + below[None] * steps
    edge = min(int(14 * SCALE) + 1, (x1 - x0) // 4)
    alpha = np.ones(x1 - x0, np.float32)
    if edge > 0:
        ramp = np.linspace(0, 1, edge + 2)[1:-1]
        alpha[:edge], alpha[-edge:] = ramp, ramp[::-1]
    alpha = alpha[None, :, None]
    work[y0:y1, x0:x1] = fill * alpha + work[y0:y1, x0:x1] * (1 - alpha)
    return np.clip(work, 0, 255).astype(np.uint8)


def warp(image, transform):
    """Zooms about the frame's centre, then shifts (1920x1080 pixels). Returns the picture and how
    much of each output pixel it really covers (0 at empty edges, 1 inside, feathered)."""
    s, dx, dy = transform
    if abs(s - 1) < 1e-4 and abs(dx) < 0.05 and abs(dy) < 0.05:
        return image, None
    dx, dy = dx * SCALE, dy * SCALE
    cx, cy = W / 2, H / 2
    data = (1 / s, 0, cx - (cx + dx) / s, 0, 1 / s, cy - (cy + dy) / s)
    picture = Image.fromarray(image).transform((W, H), Image.AFFINE, data, resample=Image.BICUBIC)
    if s > 1.02:  # restore crispness lost to enlarging
        picture = picture.filter(ImageFilter.UnsharpMask(radius=1.1, percent=int(min(80, 260 * (s - 1))), threshold=2))
    left, right = cx + dx - s * cx, cx + dx + s * (W - cx)
    top, bottom = cy + dy - s * cy, cy + dy + s * (H - cy)
    cover = None
    if left > -0.5 or top > -0.5 or right < W + 0.5 or bottom < H + 0.5:
        feather = 18 * SCALE
        xs, ys = np.arange(W) + 0.5, np.arange(H) + 0.5
        cx_ = np.clip((xs - left) / feather, 0, 1) * np.clip((right - xs) / feather, 0, 1)
        cy_ = np.clip((ys - top) / feather, 0, 1) * np.clip((bottom - ys) / feather, 0, 1)
        cover = (cy_[:, None] * cx_[None, :]).astype(np.float32)
    return np.asarray(picture), cover


def soften(image, radius):
    if radius * SCALE < 0.3:
        return image
    return np.asarray(Image.fromarray(image).filter(ImageFilter.GaussianBlur(float(radius * SCALE))))


def soft_sides(image, radius):
    """Defocuses the left and right of the frame, most at the far edges and not at all in the
    middle third, the way a wide-open lens softens everything but its subject."""
    if radius * SCALE < 0.3:
        return image
    blurred = soften(image, radius).astype(np.float32)
    x = np.abs(np.linspace(-1, 1, W, dtype=np.float32))
    weight = (np.clip((x - 0.25) / 0.55, 0, 1) ** 1.5)[None, :, None]
    out = image.astype(np.float32)
    out += (blurred - out) * weight
    return np.clip(out, 0, 255).astype(np.uint8)


def mix(outgoing, incoming, amount, cover=None):
    """Shows `amount` (0 to 1) of the incoming shot over the outgoing one. Where the outgoing
    picture has no pixels (`cover` < 1), the incoming fills in."""
    if amount >= 1 and cover is None:
        return incoming
    a = (1 - amount) if cover is None else (1 - amount) * cover[..., None]
    if cover is None and a >= 1:
        return outgoing
    out = incoming.astype(np.float32)
    out += (outgoing.astype(np.float32) - out) * a
    return np.clip(out, 0, 255).astype(np.uint8)


class Film:
    """Writes the opening frame by frame and remembers where each stop falls."""

    def __init__(self, path):
        self.proc = subprocess.Popen(
            ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
             "-r", str(FPS), "-i", "-", "-an", "-c:v", "libx264", "-crf", "8", "-preset", "veryfast",
             "-pix_fmt", "yuv420p", str(path)],
            stdin=subprocess.PIPE,
        )
        self.length = 0
        self.marks = {}

    def emit(self, image):
        self.proc.stdin.write(np.ascontiguousarray(image, dtype=np.uint8).tobytes())
        self.length += 1

    def mark(self, name):
        """Names the frame just written."""
        self.marks[name] = self.length - 1

    def close(self):
        self.proc.stdin.close()
        if self.proc.wait():
            raise RuntimeError("encoding the film failed")


# ---------------------------------------------------------------------------------------------
# The cut
# ---------------------------------------------------------------------------------------------

FLOW_SIZE = (480, 270)
_GRID = {}


def flow_between(a, b):
    """Optical flow f on a's grid such that a(p) matches b(p + f(p)), in output pixels."""
    def small(image):
        return np.asarray(Image.fromarray(image).convert("L").resize(FLOW_SIZE, Image.BILINEAR), np.float32) / 255

    v, u = optical_flow_tvl1(small(a), small(b), attachment=10, tightness=0.3, num_warp=5, num_iter=30)
    v, u = gaussian_filter(v, 2), gaussian_filter(u, 2)

    def grow(f, factor):
        return np.asarray(Image.fromarray((f * factor).astype(np.float32)).resize((W, H), Image.BILINEAR))

    return grow(v, H / FLOW_SIZE[1]), grow(u, W / FLOW_SIZE[0])


def _sample(image, rows, cols):
    out = np.empty(image.shape, np.float32)
    for ch in range(3):
        out[..., ch] = map_coordinates(image[..., ch], [rows, cols], order=1, mode="nearest")
    return out


def morph(a, b, t):
    """Dissolves a into b by t (0 to 1), sliding matching details into place as it goes, so a
    face or a lamp that sits slightly differently in each shot never shows twice."""
    if t <= 0:
        return a
    if t >= 1:
        return b
    fv, fu = flow_between(a, b)
    if (H, W) not in _GRID:
        _GRID[(H, W)] = np.mgrid[0:H, 0:W].astype(np.float32)
    rows, cols = _GRID[(H, W)]
    moved_a = _sample(a.astype(np.float32), rows - t * fv, cols - t * fu)
    moved_b = _sample(b.astype(np.float32), rows + (1 - t) * fv, cols + (1 - t) * fu)
    return np.clip(moved_a * (1 - t) + moved_b * t, 0, 255).astype(np.uint8)


def match(outgoing, shape, incoming, amount):
    """Places the outgoing frame over the incoming one by `shape`, then morph-dissolves `amount`
    of the way to the incoming. Where the placed picture leaves an edge empty, the incoming fills it."""
    placed, cover = warp(outgoing, shape)
    if cover is not None:
        placed = mix(placed, incoming, 0.0, cover)
    return morph(placed, incoming, amount)


def fog(image):
    """Turns a frame of cloud into soft blue-grey fog, and how thick it is at each pixel."""
    f = soften(image, 4).astype(np.float32) / 255
    lum = f.mean(-1, keepdims=True)
    tint = np.array([0.94, 0.98, 1.04], np.float32)
    fogged = (0.2 + 0.72 * (lum * 0.6 + f * 0.4)) * tint
    dens = np.clip((lum[..., 0] - 0.15) / 0.5, 0, 1)
    return np.clip(fogged * 255, 0, 255).astype(np.uint8), dens


def bloom(image, k):
    """Warm light flooding the lens: 0 is the picture as shot; near 1 the room glows through it.
    Light spreads from the bright parts of the picture across the frame, as glare does in a real
    lens, so the picture stays readable until the peak and dark windows soften rather than
    standing out as hard shapes."""
    if k <= 0.001:
        return image
    f = (image.astype(np.float32) / 255) ** 2.2
    near = (soften(image, 14 + 30 * k).astype(np.float32) / 255) ** 2.2
    wide = (soften(image, 90 + 220 * k).astype(np.float32) / 255) ** 2.2
    warm = np.array([1.0, 0.82, 0.6], np.float32)
    lit = f * (1 + 2.6 * k) + near * warm * (1.2 * k) + wide * warm * (3.0 * k * k)
    lit = 1 - np.exp(-lit * 1.4)  # gentle highlight roll-off
    cream = np.array([1.0, 0.91, 0.78], np.float32) ** 2.2
    lit = lit + (cream - lit) * (0.72 * k ** 2.4)  # never a flat white-out
    return (np.clip(lit, 0, 1) ** (1 / 2.2) * 255).astype(np.uint8)


def into_light(frame, n):
    """C4 frame n, pushing into the open doorway as the warm light grows."""
    push = ease_in((n - (C4_PEAK - LIGHT_PUSH)) / LIGHT_PUSH)
    zoom = 1 + 0.4 * push + 0.02 * max(0, n - C4_PEAK)
    if zoom > 1.0001:
        frame, _ = warp(frame, about(LIGHT_POINT, zoom))
    return bloom(frame, 0.95 * smooth((n - (C4_PEAK - LIGHT_FLOOD)) / LIGHT_FLOOD))


def cut(film, work, luts):
    r = lambda clip, start, **kw: Reader(clip, start, work, **kw)  # noqa: E731

    # 1. Above the evening, down into the cloud.
    c1 = r("c1", 0)
    for n in range(0, C1_OUT + 1):
        film.emit(c1.at(n))
        if n == 0:
            film.mark("sky")

    # 2. Through the cloud: real cloud from C1, pushed past the lens, covers the change to C2.
    mist = r("c1", 34)
    c2 = r("c2", C2_IN)
    cross = int(CLOUD * 0.45)  # the change of shot happens at the cloud's thickest
    for k in range(CLOUD):
        t = k / (CLOUD - 1)
        scene = (c1.at(C1_OUT + 1 + k) if k < cross else c2.at(C2_IN + k - cross)).astype(np.float32)
        cloud, _ = warp(mist.at(34 + k), about((0.5, 0.52), 2.0 + 0.9 * t))
        # Thickens smoothly, then thins steadily so the rooftops emerge gradually.
        thickness = smooth(t / 0.4) if t < 0.4 else (1.0 if t < 0.5 else 1 - (t - 0.5) / 0.5)
        layer, dens = fog(cloud)
        # Wisps arrive first where the cloud is densest, and clear last there.
        alpha = np.clip((thickness - 0.35 * (1 - dens)) / 0.65, 0, 1)[..., None]
        film.emit(np.clip(scene + (layer.astype(np.float32) - scene) * alpha, 0, 255).astype(np.uint8))
        if k == cross:
            film.mark("cloud")
    c1.close()
    mist.close()

    # 3. Down over the rooftops to the shopfront.
    for n in range(C2_IN + CLOUD - cross, C2_FRONT + 1):
        film.emit(c2.at(n))
        if n == C2_CORNER:
            film.mark("corner")
    film.mark("front")

    # 4. The camera eases forward from the shopfront into C3's walk (match dissolve).
    c3 = r("c3", C3_IN, lut=luts["c3"], fix=paint_out_sign)
    start = track(STREET_TO_WALK, C3_IN)
    pace = (math.log(track(STREET_TO_WALK, C3_IN + 4)[0]) - math.log(start[0])) / 4
    slope = pace * STREET_RAMP / math.log(start[0])  # arrive at C3's walking pace
    for k in range(STREET_RAMP + STREET_MIX):
        if k < STREET_RAMP:
            shape = blend_transform(IDENTITY, start, ease_into((k + 1) / STREET_RAMP, slope))
            incoming, amount = c3.at(C3_IN), 0.0
        else:
            m = C3_IN + k - STREET_RAMP
            shape = track(STREET_TO_WALK, m)
            incoming, amount = c3.at(m), smooth((k - STREET_RAMP + 1) / STREET_MIX)
        frame = match(c2.at(C2_FRONT + 1 + k), shape, incoming, amount)
        film.emit(soft_sides(frame, STREET_SOFTEN * math.sin(math.pi * amount)))
    c2.close()

    # 5. The walk to the door, settling onto C4's closed doors (match dissolve).
    first, last = WALK_SETTLE
    for n in range(C3_IN + STREET_MIX, first):
        film.emit(c3.at(n))
    c4 = r("c4", 0, lut=luts["c4"])
    for n in range(first, last + 1):
        u = smooth((n - first + 1) / (last - first + 1))
        shape = blend_transform(IDENTITY, track(WALK_TO_DOOR, n), u)
        mix_from = last - WALK_MIX + 1
        door_frame = DOOR_STILL - (last - n) if n >= mix_from else DOOR_STILL - WALK_MIX + 1
        amount = smooth((n - mix_from + 1) / WALK_MIX) if n >= mix_from else 0.0
        film.emit(match(c3.at(n), shape, c4.at(door_frame), amount))
    c3.close()
    film.mark("door")

    # 6. The doors open. C4's hand is cut out: the closed doors morph into them opening.
    held = c4.at(DOOR_STILL).copy()
    opening = r("c4", DOOR_OPEN, lut=luts["c4"])
    for k in range(DOOR_RAMP + DOOR_MIX):
        shape = blend_transform(IDENTITY, DOOR_CREEP, smooth((k + 1) / (DOOR_RAMP + DOOR_MIX)))
        if k < DOOR_RAMP:
            film.emit(match(held, shape, opening.at(DOOR_OPEN), 0.0))
        else:
            j = k - DOOR_RAMP
            film.emit(match(held, shape, opening.at(DOOR_OPEN + j), smooth((j + 1) / DOOR_MIX)))
    c4.close()

    # 7. Into the light, and out of it inside: outside and inside meet within the glow.
    for n in range(DOOR_OPEN + DOOR_MIX, C4_PEAK + 1):
        film.emit(into_light(opening.at(n), n))
    c5 = r("c5", C5_IN)
    for j in range(LIGHT_CROSS):
        outside = into_light(opening.at(C4_PEAK + 1 + j), C4_PEAK + 1 + j)
        inside = bloom(c5.at(C5_IN + j), 0.95 - 0.05 * (j + 1) / LIGHT_CROSS)
        film.emit(mix(outside, inside, smooth((j + 1) / LIGHT_CROSS)))
        if j == LIGHT_CROSS // 2:
            film.mark("light")
    opening.close()
    for n in range(C5_IN + LIGHT_CROSS, C5_HOST + 1):
        k = n - C5_IN - LIGHT_CROSS
        film.emit(bloom(c5.at(n), 0.9 * (1 - smooth((k + 1) / LIGHT_FADE))) if k < LIGHT_FADE else c5.at(n))
        if k == LIGHT_FADE:
            film.mark("inside")
    film.mark("host")

    # 8. Closer to the host as she looks down to the book (match dissolve into C6).
    c6 = r("c6", C6_IN)
    meet = C5_HOST + 1 + HOST_RAMP  # the C5 frame that lines up with C6_IN
    start = track(HOST_TO_BOOK, meet)
    pace = (math.log(track(HOST_TO_BOOK, meet + 4)[0]) - math.log(start[0])) / 4
    slope = pace * HOST_RAMP / math.log(start[0])
    for k in range(HOST_RAMP + HOST_MIX):
        n = C5_HOST + 1 + k
        if k < HOST_RAMP:
            shape = blend_transform(IDENTITY, start, ease_into((k + 1) / HOST_RAMP, slope))
            incoming, amount = c6.at(C6_IN), 0.0
        else:
            j = k - HOST_RAMP
            shape, incoming, amount = track(HOST_TO_BOOK, n), c6.at(C6_IN + j), smooth((j + 1) / HOST_MIX)
        film.emit(match(c5.at(n), shape, incoming, amount))
    c5.close()
    for n in range(C6_IN + HOST_MIX, 188):
        film.emit(c6.at(n))
    c6.close()
    film.mark("book")

    # 9. The page turn (made on the site) hides the cut to C8.
    c8 = r("c8", 0)
    first, last = C8_SETTLE
    for n in range(0, first):
        film.emit(c8.at(n))
        if n == 0:
            film.mark("turn")

    # 10. The camera settles over the table onto C9's opening framing (match dissolve).
    c9 = r("c9", 0)
    for n in range(first, last + 1):
        k = n - first
        u = smooth((k + 1) / (last - first + 1))
        shape = blend_transform(IDENTITY, track(TABLE_TO_RISE, n), u)
        mix_from = last - TABLE_MIX + 1
        amount = smooth((n - mix_from + 1) / TABLE_MIX) if n >= mix_from else 0.0
        film.emit(match(c8.at(n), shape, c9.at(k), amount))
    c8.close()
    film.mark("table")

    # 11. Rising above the table to the menu.
    for n in range(last - first + 1, 188):
        film.emit(c9.at(n))
    c9.close()
    film.mark("menu")


def build_film(work, path):
    luts = build_grades(work)
    film = Film(path)
    cut(film, work, luts)
    film.close()
    return film


# ---------------------------------------------------------------------------------------------
# Publishing
# ---------------------------------------------------------------------------------------------

def lossless(out):
    return ["-an", "-c:v", "libx264", "-crf", "8", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-r", FPS, out]


def reverse(work, master, length, chunk=72):
    """Reverses the film three seconds at a time. Reversing holds every frame in memory, so
    each piece is cut short at the input, before the reverse filter ever sees the rest."""
    pieces = []
    for start in range(0, length, chunk):
        frames = min(chunk, length - start)
        piece = work / f"rev{start:05d}.mp4"
        ffmpeg("-ss", f"{start / FPS:.4f}", "-t", f"{frames / FPS:.4f}", "-i", master,
               "-frames:v", frames, "-vf", "reverse", *lossless(piece))
        pieces.append(piece)
    out = work / "film-rev.mp4"
    inputs = [arg for piece in reversed(pieces) for arg in ("-i", piece)]
    ffmpeg(*inputs, "-filter_complex", f"concat=n={len(pieces)}:v=1:a=0,format=yuv420p", *lossless(out))
    return out


def publish(master, reversed_master, hero_dir):
    for suffix, (width, height, crf, ceiling, extra) in SIZES.items():
        filters = ",".join(filter(None, [extra, f"scale={width}:{height}:flags=lanczos"]))
        common = [
            "-an", "-c:v", "libx264", "-crf", crf, "-maxrate", ceiling, "-bufsize", ceiling, "-preset", "slow",
            "-x264-params", "keyint=12:min-keyint=12:scenecut=0", "-pix_fmt", "yuv420p", "-profile:v", "high",
            "-movflags", "+faststart",
        ]
        ffmpeg("-i", master, "-vf", filters, *common, hero_dir / f"film{suffix}.mp4")
        ffmpeg("-i", reversed_master, "-vf", filters, *common, hero_dir / f"film{suffix}-rev.mp4")


def still(source, target, width, quality=82):
    ffmpeg("-i", source, "-vf", f"scale={width}:-2", "-c:v", "libwebp", "-quality", quality, target)


def frame_of(work, video, index):
    out = work / f"frame{index:05d}.png"
    ffmpeg("-i", video, "-vf", f"select=eq(n\\,{index})", "-frames:v", 1, "-fps_mode", "passthrough", out)
    return out


STOPS = ["sky", "corner", "front", "door", "inside", "host", "book", "table", "menu"]


def build_hero(work, hero_dir):
    master = work / "film.mp4"
    film = build_film(work, master)
    print(f"  film: {film.length} frames, stops {[film.marks[s] for s in STOPS]}")
    publish(master, reverse(work, master, film.length), hero_dir)

    for index, name in enumerate(STOPS):
        frame = frame_of(work, master, film.marks[name])
        still(frame, hero_dir / f"rest-{index}.webp", 1920, 82)
        still(frame, hero_dir / f"rest-{index}-sm.webp", 1280, 80)
    turn = frame_of(work, master, film.marks["turn"])
    still(turn, hero_dir / "turn-next.webp", 1920, 82)
    still(turn, hero_dir / "turn-next-sm.webp", 1280, 80)

    (hero_dir / "film.json").write_text(json.dumps({
        "fps": FPS,
        "frames": film.length,
        "stops": [film.marks[name] for name in STOPS],
        "turn": film.marks["turn"],
        "joins": {"cloud": film.marks["cloud"], "light": film.marks["light"]},
    }, indent=2))


def build_fx(fx_dir):
    # The thickest cloud in the descent becomes the mist that drifts past the lens.
    cloud = fx_dir / "cloud.png"
    ffmpeg("-ss", "2.4", "-i", FLOW / CLIPS["c1"], "-frames:v", 1,
           "-vf", f"{DELOGO},hue=s=0.55,eq=brightness=0.08:contrast=1.15,gblur=sigma=4", cloud)
    still(cloud, fx_dir / "cloud.webp", 1600, 70)
    cloud.unlink()


def build_stills(stills_dir):
    for name in ["m1-exterior", "m2-interior", "m3-detail", "07-book", "09-table", "06-reception"]:
        still(CONCEPT / f"{name}.png", stills_dir / f"{name}.webp", 1536)
        still(CONCEPT / f"{name}.png", stills_dir / f"{name}-sm.webp", 900, 78)


def preview(folder):
    """Renders the film at half size into `folder`, for checking the edit."""
    global W, H, SCALE
    SCALE, W, H = 0.5, FULL_W // 2, FULL_H // 2
    folder = Path(folder)
    folder.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as work:
        film = build_film(Path(work), folder / "film.mp4")
    (folder / "marks.json").write_text(json.dumps(film.marks, indent=2))
    print(f"preview: {film.length} frames, marks {film.marks}")


def main():
    if len(sys.argv) > 2 and sys.argv[1] == "--preview":
        preview(sys.argv[2])
        return
    if OUT.exists():
        shutil.rmtree(OUT)
    hero_dir, stills_dir, fx_dir = OUT / "hero", OUT / "stills", OUT / "fx"
    for folder in (hero_dir, stills_dir, fx_dir):
        folder.mkdir(parents=True)

    with tempfile.TemporaryDirectory() as work:
        print("Hero film")
        build_hero(Path(work), hero_dir)
    print("Effects")
    build_fx(fx_dir)
    print("Stills")
    build_stills(stills_dir)
    print("Done")


if __name__ == "__main__":
    main()
