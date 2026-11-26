#!/usr/bin/env python3
"""Generate icons (PNG) and the native alarm sound (WAV). Requires Pillow: pip install pillow."""
import math, struct, wave, os
from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(__file__), "..")

def draw_icon(size, maskable=False, foreground_only=False):
    s = size
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    u = s / 512
    if not foreground_only:
        if maskable:
            d.rectangle([0, 0, s, s], fill="#0f766e")
        else:
            d.rounded_rectangle([0, 0, s - 1, s - 1], radius=112 * u, fill="#0f766e")
    k = 0.72 if (maskable or foreground_only) else 1.0
    def P(x, y):
        return (s / 2 + (x - 256) * u * k, s / 2 + (y - 256) * u * k)
    def circle(cx, cy, r, **kw):
        a = P(cx - r, cy - r); b = P(cx + r, cy + r)
        d.ellipse([a, b], **kw)
    circle(132, 140, 52, fill="#f59e0b")
    circle(380, 140, 52, fill="#f59e0b")
    circle(256, 282, 148, fill="#134e4a")
    circle(256, 282, 132, fill="#f8fafc")
    w = max(2, int(22 * u * k))
    pts = [P(256, 190), P(256, 286), P(318, 326)]
    d.line(pts, fill="#0f172a", width=w, joint="curve")
    for p in (pts[0], pts[2]):
        d.ellipse([p[0] - w / 2, p[1] - w / 2, p[0] + w / 2, p[1] + w / 2], fill="#0f172a")
    return img

def write_icons():
    out = os.path.join(ROOT, "www", "icons")
    os.makedirs(out, exist_ok=True)
    draw_icon(192).save(os.path.join(out, "icon-192.png"))
    draw_icon(512).save(os.path.join(out, "icon-512.png"))
    draw_icon(512, maskable=True).save(os.path.join(out, "icon-maskable-512.png"))
    res = os.path.join(ROOT, "android", "app", "src", "main", "res")
    sizes = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
    for dens, px in sizes.items():
        folder = os.path.join(res, f"mipmap-{dens}")
        if not os.path.isdir(folder):
            continue
        draw_icon(px).save(os.path.join(folder, "ic_launcher.png"))
        draw_icon(px).save(os.path.join(folder, "ic_launcher_round.png"))
        fg = draw_icon(int(px * 108 / 48), foreground_only=True)
        fg.save(os.path.join(folder, "ic_launcher_foreground.png"))

def write_alarm_wav():
    rate = 22050
    samples = []
    def tone(freq, dur, vol=0.95):
        n = int(rate * dur)
        for i in range(n):
            t = i / rate
            env = min(1.0, i / (rate * 0.004), (n - i) / (rate * 0.006))
            v = math.copysign(1.0, math.sin(2 * math.pi * freq * t)) * 0.55 + math.copysign(1.0, math.sin(2 * math.pi * freq * 1.26 * t)) * 0.45
            samples.append(int(max(-1, min(1, v * vol * env)) * 32000))
    def silence(dur):
        samples.extend([0] * int(rate * dur))
    for _ in range(4):
        tone(1568, 0.13)
        silence(0.07)
    silence(0.1)
    for _ in range(4):
        tone(1568, 0.13)
        silence(0.07)
    silence(0.9)
    path = os.path.join(ROOT, "android", "app", "src", "main", "res", "raw")
    os.makedirs(path, exist_ok=True)
    with wave.open(os.path.join(path, "alarm_loop.wav"), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate)
        w.writeframes(b"".join(struct.pack("<h", s) for s in samples))

if __name__ == "__main__":
    write_icons()
    write_alarm_wav()
    print("ok")
