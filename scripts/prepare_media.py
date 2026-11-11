"""Builds every web-ready media file for the Morrow site.

Sources (never edited):
  media/flow/     Google Flow clips, exactly as downloaded
  media/concept/  ChatGPT stills

Output (rebuilt from scratch each run, never edit by hand):
  public/media/hero/   the opening as one continuous film, played forwards and reversed, in two
                       sizes; film.json with the frame of every stop; a still of every stop
  public/media/stills/ section photos
  public/media/fx/     textures used by the code effects

Needs ffmpeg on the PATH, and Python with numpy. Run with:  npm run media
"""

import json
import shutil
import subprocess
import tempfile
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
FLOW = ROOT / "media" / "flow"
CONCEPT = ROOT / "media" / "concept"
OUT = ROOT / "public" / "media"

FPS = 24
W, H = 1920, 1080
# Flow stamps "Veo" in the same bottom-right spot on every clip.
DELOGO = "delogo=x=1858:y=1034:w=46:h=28"
# Brings the brighter door clips down to the blue-hour look of the street clip before them.
DOOR_GRADE = "eq=brightness=-0.06:contrast=1.1:saturation=1.12:gamma=0.82,colortemperature=temperature=5600:mix=0.35"

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

# C3 shows a second "MORROW" sign above the door that the rest of the film doesn't have.
# Where it sits over time: seconds, then left, right, top and bottom in the 1920x1080 frame.
SECOND_SIGN = [
    (1.6, 1032, 1248, 380, 428), (2.2, 992, 1240, 344, 400), (2.8, 964, 1210, 300, 364),
    (3.4, 928, 1212, 256, 316), (4.0, 874, 1220, 180, 256), (4.6, 810, 1240, 74, 166),
    (5.0, 786, 1254, 6, 110), (5.4, 740, 1280, -40, 24), (5.7, 720, 1300, -90, -10),
]

# width, height, quality (lower is better), bitrate ceiling, extra filters
SIZES = {
    "": (1920, 1080, 20, "8M", "unsharp=5:5:0.45:5:5:0"),
    "-sm": (1280, 720, 23, "3M", None),
}


def ffmpeg(*args, **kwargs):
    return subprocess.run(["ffmpeg", "-v", "error", "-y", *map(str, args)], check=True, **kwargs)


def count(video):
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-count_packets",
         "-show_entries", "stream=nb_read_packets", "-of", "csv=p=0", str(video)],
        check=True, capture_output=True, text=True,
    )
    return int(result.stdout.strip())


class Builder:
    def __init__(self, work):
        self.work = Path(work)
        self.n = 0

    def tmp(self, ext="mp4"):
        self.n += 1
        return self.work / f"part{self.n:03d}.{ext}"

    def lossless(self, out):
        return ["-an", "-c:v", "libx264", "-crf", "8", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-r", FPS, out]

    def segment(self, clip, start=0, end=None, grade=None):
        """A cleaned piece of a Flow clip, from frame `start` to frame `end`."""
        out = self.tmp()
        filters = [DELOGO] + ([grade] if grade else []) + ["setpts=PTS-STARTPTS"]
        args = ["-ss", f"{start / FPS:.4f}"] if start else []
        args += ["-i", FLOW / CLIPS[clip]]
        if end is not None:
            args += ["-frames:v", end - start + 1]
        ffmpeg(*args, "-vf", ",".join(filters), *self.lossless(out))
        return out

    def frame(self, video, index=None):
        """One frame as a PNG: the last frame, or frame number `index`."""
        out = self.tmp("png")
        if index is None:
            ffmpeg("-sseof", "-0.3", "-i", video, "-update", 1, out)
        else:
            ffmpeg("-i", video, "-vf", f"select=eq(n\\,{index})", "-frames:v", 1, "-fps_mode", "passthrough", out)
        return out

    def hold(self, image, frames):
        out = self.tmp()
        ffmpeg("-loop", 1, "-i", image, "-frames:v", frames, "-vf", "format=yuv420p", *self.lossless(out))
        return out

    def colour(self, hexcolour, frames):
        out = self.tmp()
        ffmpeg("-f", "lavfi", "-i", f"color=c={hexcolour}:s={W}x{H}:r={FPS}", "-frames:v", frames, *self.lossless(out))
        return out

    def push_in(self, image, frames, zoom, centre_from, centre_to):
        """A slow push toward a point of a still. Kept gentle so the picture stays sharp."""
        out = self.tmp()
        ease = f"((1-cos(PI*on/{frames - 1}))/2)"
        up = 4  # upscale first so the moving crop does not jitter
        cx = f"({centre_from[0]}+({centre_to[0] - centre_from[0]})*{ease})*{up}"
        cy = f"({centre_from[1]}+({centre_to[1] - centre_from[1]})*{ease})*{up}"
        zoompan = (
            f"zoompan=z='pow({zoom},{ease})'"
            f":x='max(0,min(iw-iw/zoom,{cx}-iw/zoom/2))'"
            f":y='max(0,min(ih-ih/zoom,{cy}-ih/zoom/2))'"
            f":d={frames}:s={W}x{H}:fps={FPS}"
        )
        ffmpeg("-i", image, "-vf", f"scale={W * up}:-1,{zoompan},format=yuv420p", "-frames:v", frames, *self.lossless(out))
        return out

    def crossfade(self, first, second, frames, offset, kind="fade"):
        """Dissolves `first` into `second`; the result lasts `offset` + len(second) frames."""
        out = self.tmp()
        ffmpeg(
            "-i", first, "-i", second,
            "-filter_complex", f"[0][1]xfade=transition={kind}:duration={frames / FPS:.4f}:offset={offset / FPS:.4f},format=yuv420p",
            *self.lossless(out),
        )
        return out

    def join(self, *videos):
        out = self.tmp()
        inputs = [arg for video in videos for arg in ("-i", video)]
        ffmpeg(*inputs, "-filter_complex", f"concat=n={len(videos)}:v=1:a=0,format=yuv420p", *self.lossless(out))
        return out

    def blend_from_still(self, still, video, frames=6):
        """Starts exactly on `still`, then dissolves into `video` over a few frames."""
        return self.crossfade(self.hold(still, frames), video, frames, 0)

    def paint_out(self, clip, start, end, keys, grade=None):
        """Removes a sign that moves with the camera, frame by frame. The hole is filled by
        blending the colours just above and below it, so it reads as a plain panel."""
        out = self.tmp()
        filters = ",".join([DELOGO] + ([grade] if grade else []))
        decode = subprocess.Popen(
            ["ffmpeg", "-v", "error", "-ss", f"{start / FPS:.4f}", "-i", str(FLOW / CLIPS[clip]),
             "-frames:v", str(end - start + 1), "-vf", filters, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
            stdout=subprocess.PIPE,
        )
        encode = subprocess.Popen(
            ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS),
             "-i", "-", *map(str, self.lossless(out))],
            stdin=subprocess.PIPE,
        )
        times = [k[0] for k in keys]
        size = W * H * 3
        index = 0
        while True:
            raw = decode.stdout.read(size)
            if len(raw) < size:
                break
            image = np.frombuffer(raw, np.uint8).reshape(H, W, 3).astype(np.float32)
            t = (start + index) / FPS
            left, right, top, bottom = (float(np.interp(t, times, [k[i] for k in keys])) for i in range(1, 5))
            pad_x, pad_y = 10 + 0.03 * (right - left), 8 + 0.14 * (bottom - top)
            x0, x1 = int(max(0, left - pad_x)), int(min(W, right + pad_x))
            y0, y1 = int(max(1, top - pad_y)), int(min(H - 1, bottom + pad_y))
            if x1 > x0 and y1 > y0:
                above = image[y0 - 1, x0:x1]
                below = image[y1, x0:x1]
                steps = np.linspace(0, 1, y1 - y0)[:, None, None]
                fill = above[None] * (1 - steps) + below[None] * steps
                # Soften the left and right edges so the panel melts into the frame around it.
                edge = min(14, (x1 - x0) // 4)
                alpha = np.ones(x1 - x0, np.float32)
                if edge > 0:
                    ramp = np.linspace(0, 1, edge + 2)[1:-1]
                    alpha[:edge], alpha[-edge:] = ramp, ramp[::-1]
                alpha = alpha[None, :, None]
                region = image[y0:y1, x0:x1]
                image[y0:y1, x0:x1] = fill * alpha + region * (1 - alpha)
            encode.stdin.write(np.clip(image, 0, 255).astype(np.uint8).tobytes())
            index += 1
        encode.stdin.close()
        encode.wait()
        decode.wait()
        return out


class Film:
    """Grows the opening film piece by piece, remembering the frame of every stop."""

    def __init__(self, builder, first):
        self.b = builder
        self.video = first
        self.length = count(first)
        self.marks = {}

    def mark(self, name, frame=None):
        self.marks[name] = self.length - 1 if frame is None else frame

    def append(self, video):
        self.video = self.b.join(self.video, video)
        self.length = count(self.video)

    def dissolve(self, video, frames, kind="fade"):
        """Dissolves the end of the film into `video` over its last `frames` frames."""
        self.video = self.b.crossfade(self.video, video, frames, self.length - frames, kind)
        self.length = count(self.video)


def build_film(b):
    film = Film(b, b.segment("c1"))
    film.mark("sky", 0)
    film.mark("corner")

    # Through a bank of cloud from the first aerial shot to the second.
    cloud = b.segment("c1", 43, 72, "crop=iw/1.4:ih/1.4,scale=1920:1080,eq=brightness=0.07:contrast=0.9:saturation=0.6,gblur=sigma=2")
    corner = b.frame(film.video)
    film.append(b.hold(corner, 12))
    film.dissolve(cloud, 12 + 1)
    film.dissolve(b.segment("c2"), 17)
    film.mark("front")

    # A gentle push from the street into the real walk to the door (C3), with its second
    # sign painted out, then into the door clip's still opening frames.
    street = b.frame(film.video)
    walk = b.crossfade(
        b.push_in(street, 30, 1.15, (960, 540), (1040, 600)),
        b.paint_out("c3", 38, 132, SECOND_SIGN, DOOR_GRADE),
        16, 30 - 16,
    )
    walk = b.crossfade(walk, b.segment("c4", 0, 12, DOOR_GRADE), 10, count(walk) - 10)
    film.append(walk)
    film.mark("door")

    # The door clip's sleeve enters at frame 15 and leaves by 80, so cut from the closed doors
    # straight to the doors opening. Stop at the bloom, before a ghost of the interior fades in,
    # and pass through warm light into the doorway.
    door = b.frame(film.video)
    film.append(b.blend_from_still(door, b.segment("c4", 84, 141, DOOR_GRADE)))
    film.dissolve(b.colour("0xFFE3BD", 14), 10)
    inside = b.segment("c5")
    doorway = b.frame(inside, 0)
    film.dissolve(b.join(b.hold(doorway, 14), inside), 14)
    film.mark("inside", film.length - count(inside))
    film.mark("host")

    film.append(b.blend_from_still(b.frame(film.video), b.segment("c6")))
    film.mark("book")
    film.append(b.segment("c8"))  # the page turn hides this cut
    film.mark("turn", film.marks["book"] + 1)
    film.mark("table")
    film.append(b.blend_from_still(b.frame(film.video), b.segment("c9")))
    film.mark("menu")
    film.marks["joins"] = {"cloud": film.marks["corner"] + 14, "light": film.marks["inside"] - 12}
    return film


def reverse(b, master, length, chunk=72):
    """Reverses the film three seconds at a time. Reversing holds every frame in memory, so
    each piece is cut short at the input, before the reverse filter ever sees the rest."""
    pieces = []
    for start in range(0, length, chunk):
        frames = min(chunk, length - start)
        piece = b.tmp()
        ffmpeg("-ss", f"{start / FPS:.4f}", "-t", f"{frames / FPS:.4f}", "-i", master,
               "-frames:v", frames, "-vf", "reverse", *b.lossless(piece))
        pieces.append(piece)
    return b.join(*reversed(pieces))


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


def build_hero(b, hero_dir):
    film = build_film(b)
    print(f"  film: {film.length} frames")
    publish(film.video, reverse(b, film.video, film.length), hero_dir)

    stops = ["sky", "corner", "front", "door", "inside", "host", "book", "table", "menu"]
    for index, name in enumerate(stops):
        frame = b.frame(film.video, film.marks[name])
        still(frame, hero_dir / f"rest-{index}.webp", 1920, 82)
        still(frame, hero_dir / f"rest-{index}-sm.webp", 1280, 80)
    turn = b.frame(film.video, film.marks["turn"])
    still(turn, hero_dir / "turn-next.webp", 1920, 82)
    still(turn, hero_dir / "turn-next-sm.webp", 1280, 80)

    (hero_dir / "film.json").write_text(json.dumps({
        "fps": FPS,
        "frames": film.length,
        "stops": [film.marks[name] for name in stops],
        "turn": film.marks["turn"],
        "joins": film.marks["joins"],
    }, indent=2))


def build_fx(b, fx_dir):
    # The thickest cloud in the descent becomes the mist that drifts past the lens.
    cloud = b.tmp("png")
    ffmpeg("-ss", "2.4", "-i", FLOW / CLIPS["c1"], "-frames:v", 1,
           "-vf", f"{DELOGO},hue=s=0.55,eq=brightness=0.08:contrast=1.15,gblur=sigma=4", cloud)
    still(cloud, fx_dir / "cloud.webp", 1600, 70)


def build_stills(stills_dir):
    for name in ["m1-exterior", "m2-interior", "m3-detail", "07-book", "09-table", "06-reception"]:
        still(CONCEPT / f"{name}.png", stills_dir / f"{name}.webp", 1536)
        still(CONCEPT / f"{name}.png", stills_dir / f"{name}-sm.webp", 900, 78)


def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    hero_dir, stills_dir, fx_dir = OUT / "hero", OUT / "stills", OUT / "fx"
    for folder in (hero_dir, stills_dir, fx_dir):
        folder.mkdir(parents=True)

    with tempfile.TemporaryDirectory() as work:
        b = Builder(work)
        print("Hero film")
        build_hero(b, hero_dir)
        print("Effects")
        build_fx(b, fx_dir)
    print("Stills")
    build_stills(stills_dir)
    print("Done")


if __name__ == "__main__":
    main()
