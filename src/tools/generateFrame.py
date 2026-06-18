#!/usr/bin/env python3
"""
Generate a 1080x1920 background frame for Empire OS faceless videos.
Usage: python3 generateFrame.py '{"hook": "...", "output": "path.png", "niche": "finance"}'
"""
import sys
import json
import textwrap
from PIL import Image, ImageDraw, ImageFont

ACCENT_COLORS = {
    "finance": (34, 197, 94),
    "crime":   (239, 68, 68),
    "tech":    (99, 102, 241),
    "fitness": (249, 115, 22),
    "default": (139, 92, 246),
}

def get_accent(niche=""):
    n = niche.lower()
    for k, v in ACCENT_COLORS.items():
        if k in n:
            return v
    return ACCENT_COLORS["default"]

def load_font(size):
    paths = [
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for p in paths:
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            continue
    return ImageFont.load_default()

def generate_frame(hook, output_path, niche=""):
    W, H = 1080, 1920
    accent = get_accent(niche)
    img = Image.new("RGB", (W, H), color=(10, 10, 20))
    draw = ImageDraw.Draw(img)

    # Accent bars
    draw.rectangle([0, 0, W, 14], fill=accent)
    draw.rectangle([0, H - 14, W, H], fill=accent)

    font_big = load_font(88)
    font_small = load_font(38)

    lines = textwrap.wrap(hook.upper(), width=13)
    if not lines:
        lines = [hook.upper()[:13]]

    line_h = 110
    total_h = len(lines) * line_h
    y0 = (H - total_h) // 2 - 40

    for i, line in enumerate(lines):
        bbox = draw.textbbox((0, 0), line, font=font_big)
        tw = bbox[2] - bbox[0]
        x = (W - tw) // 2
        y = y0 + i * line_h
        draw.text((x + 4, y + 4), line, font=font_big, fill=(0, 0, 0))
        draw.text((x, y), line, font=font_big, fill=(255, 255, 255))

    cta = "WATCH TILL THE END"
    bbox = draw.textbbox((0, 0), cta, font=font_small)
    cw = bbox[2] - bbox[0]
    draw.text(((W - cw) // 2, H - 100), cta, font=font_small, fill=accent)

    img.save(output_path, "PNG")
    print(f"[generateFrame] Saved: {output_path}", flush=True)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(1)
    args = json.loads(sys.argv[1])
    generate_frame(args["hook"], args["output"], args.get("niche", ""))
