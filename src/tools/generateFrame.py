#!/usr/bin/env python3
"""
Generate a 1080x1920 background frame for Empire OS faceless videos.
Supports three visual styles:
  dark     — sleek dark + niche accent (adult channels)
  brainrot — neon split chaos (Gen Z / meme channels)
  kids     — bright sky, sun, stars (children's channels)

Usage:
  python3 generateFrame.py '{"hook":"...","output":"path.png","niche":"finance","style":"dark"}'
"""
import sys
import json
import math
import textwrap
import random
from PIL import Image, ImageDraw, ImageFont

# ── Accent colours for dark style ─────────────────────────────────────────────
ACCENT_COLORS = {
    "finance": (34, 197, 94),    # green
    "crime":   (239, 68, 68),    # red
    "tech":    (99, 102, 241),   # indigo
    "fitness": (249, 115, 22),   # orange
    "meme":    (255, 0, 110),    # hot pink
    "kids":    (255, 200, 0),    # yellow
    "default": (139, 92, 246),   # purple
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

def draw_outlined_text(draw, x, y, text, font, fill, outline, width=5):
    """Draw text with a thick outline — used by brainrot & kids styles."""
    for dx in range(-width, width + 1):
        for dy in range(-width, width + 1):
            if dx != 0 or dy != 0:
                draw.text((x + dx, y + dy), text, font=font, fill=outline)
    draw.text((x, y), text, font=font, fill=fill)

# ── DARK style — adult channels ────────────────────────────────────────────────
def keywords(text):
    stop = set("the a an and or to of in for with on your you this that is are can now just into from it as by be".split())
    words = [w.strip(".,!?;:()[]'\"").upper() for w in text.split()]
    words = [w for w in words if len(w) > 3 and w.lower() not in stop]
    return words[:5] or ["SMART", "SYSTEM"]

def draw_phone_mock(draw, x, y, w, h, accent, labels):
    draw.rounded_rectangle([x, y, x + w, y + h], radius=44, fill=(12, 16, 28), outline=(235, 235, 245), width=5)
    draw.rounded_rectangle([x + 28, y + 70, x + w - 28, y + h - 50], radius=28, fill=(24, 30, 46))
    for i, label in enumerate(labels[:4]):
        yy = y + 115 + i * 125
        color = accent if i == 0 else (54, 63, 88)
        draw.rounded_rectangle([x + 55, yy, x + w - 55, yy + 74], radius=22, fill=color)
        font = load_font(26)
        draw.text((x + 82, yy + 22), label[:18], font=font, fill=(255, 255, 255))

def draw_data_cards(draw, W, H, accent, labels, scene_index):
    font_label = load_font(34)
    font_value = load_font(52)
    card_w, card_h = 360, 150
    starts = [(72, 230), (648, 360), (86, 1390), (640, 1260)]
    for i, (x, y) in enumerate(starts):
        shift = int(math.sin(scene_index + i) * 18)
        draw.rounded_rectangle([x + shift, y, x + card_w + shift, y + card_h], radius=26, fill=(20, 26, 42), outline=accent, width=3)
        draw.text((x + 28 + shift, y + 24), labels[i % len(labels)][:15], font=font_label, fill=(190, 200, 220))
        value = ["AUTO", "2 MIN", "DONE", "+HOURS"][i % 4]
        draw.text((x + 28 + shift, y + 74), value, font=font_value, fill=(255, 255, 255))

def draw_visual_scene(draw, W, H, hook, niche, accent, scene_index, total_scenes):
    labels = keywords(hook)
    draw_data_cards(draw, W, H, accent, labels, scene_index)
    draw_phone_mock(draw, 350, 520, 380, 760, accent, labels)

    # Flow lines that make the image feel generated for the specific text.
    for i in range(7):
        y = 455 + i * 115
        phase = scene_index * 0.8 + i
        x1 = 85 + int(math.sin(phase) * 24)
        x2 = 995 + int(math.cos(phase) * 24)
        line_color = tuple(max(0, min(255, int(c * 0.55))) for c in accent)
        draw.line([(x1, y), (x2, y + 56)], fill=line_color, width=3)
        draw.ellipse([x1 - 7, y - 7, x1 + 7, y + 7], fill=accent)

    font_step = load_font(34)
    progress_w = 760
    progress_x = (W - progress_w) // 2
    progress_y = H - 120
    draw.rounded_rectangle([progress_x, progress_y, progress_x + progress_w, progress_y + 18], radius=9, fill=(42, 48, 65))
    fill_w = int(progress_w * scene_index / max(1, total_scenes))
    draw.rounded_rectangle([progress_x, progress_y, progress_x + fill_w, progress_y + 18], radius=9, fill=accent)
    draw.text((progress_x, progress_y - 48), f"SCENE {scene_index}/{total_scenes}", font=font_step, fill=(180, 190, 210))

def render_dark(draw, W, H, hook, niche, scene_index=1, total_scenes=1):
    accent = get_accent(niche)

    for y in range(H):
        t = y / H
        bg = (
            int(7 + t * 14 + scene_index * 2),
            int(10 + t * 10),
            int(22 + t * 24),
        )
        draw.line([(0, y), (W, y)], fill=bg)

    for i in range(11):
        angle = (i * 0.8) + scene_index
        cx = int(W * (0.12 + (i % 4) * 0.25) + math.sin(angle) * 36)
        cy = int(H * (0.12 + (i // 4) * 0.28) + math.cos(angle) * 42)
        radius = 55 + (i % 3) * 24
        color = tuple(min(255, int(c * (0.22 + i * 0.015))) for c in accent)
        draw.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], outline=color, width=3)

    draw_visual_scene(draw, W, H, hook, niche, accent, scene_index, total_scenes)

    font_big = load_font(72)

    lines = textwrap.wrap(hook.upper(), width=13) or [hook.upper()[:13]]
    lines = lines[:3]
    line_h = 86
    y0 = 150

    for i, line in enumerate(lines):
        bbox = draw.textbbox((0, 0), line, font=font_big)
        tw = bbox[2] - bbox[0]
        x = (W - tw) // 2
        y = y0 + i * line_h
        draw.text((x + 5, y + 5), line, font=font_big, fill=(0, 0, 0))
        draw.text((x, y),          line, font=font_big, fill=(255, 255, 255))


# ── BRAINROT style — Gen Z / meme channels ────────────────────────────────────
def render_brainrot(draw, W, H, hook, niche):
    HOT_PINK   = (255, 0, 110)
    ELEC_BLUE  = (58, 134, 255)
    NEON_YELLOW = (255, 230, 0)
    NEON_GREEN  = (0, 255, 120)
    BLACK       = (0, 0, 0)

    # Split background: left pink, right blue
    draw.rectangle([0, 0, W // 2, H], fill=HOT_PINK)
    draw.rectangle([W // 2, 0, W, H], fill=ELEC_BLUE)

    # Yellow diagonal slash dividing the two halves
    draw.polygon(
        [(W // 2 - 55, 0), (W // 2 + 55, 0),
         (W // 2 + 5, H),  (W // 2 - 105, H)],
        fill=NEON_YELLOW
    )

    # Zebra bars — top
    bar_h = 14
    for i in range(7):
        c = BLACK if i % 2 == 0 else NEON_YELLOW
        draw.rectangle([0, i * bar_h, W, (i + 1) * bar_h], fill=c)
    # Zebra bars — bottom
    for i in range(7):
        c = BLACK if i % 2 == 0 else NEON_YELLOW
        draw.rectangle([0, H - (i + 1) * bar_h, W, H - i * bar_h], fill=c)

    # Decorative neon boxes (deterministic positions)
    boxes = [(40, 130, 120, 210), (910, 180, 990, 260),
             (40, 1650, 120, 1730), (910, 1700, 990, 1780)]
    for b in boxes:
        draw.rectangle(b, fill=NEON_GREEN, outline=BLACK, width=4)

    # "!!" corner accents
    font_deco = load_font(80)
    draw_outlined_text(draw, 35,  290, "!!", font_deco, NEON_YELLOW, BLACK, width=5)
    draw_outlined_text(draw, 900, 290, "!!", font_deco, NEON_YELLOW, BLACK, width=5)

    # Main hook — huge, neon-yellow, thick black outline
    font_big   = load_font(96)
    font_small = load_font(48)

    lines = textwrap.wrap(hook.upper(), width=10) or [hook.upper()[:10]]
    line_h = 125
    y0 = (H - len(lines) * line_h) // 2 - 70

    for i, line in enumerate(lines):
        bbox = draw.textbbox((0, 0), line, font=font_big)
        tw = bbox[2] - bbox[0]
        x = (W - tw) // 2
        y = y0 + i * line_h
        draw_outlined_text(draw, x, y, line, font_big, NEON_YELLOW, BLACK, width=7)

    # CTA
    cta = "STAY TIL THE END!!!"
    bbox = draw.textbbox((0, 0), cta, font=font_small)
    cw = bbox[2] - bbox[0]
    draw_outlined_text(draw, (W - cw) // 2, H - 200, cta, font_small, NEON_GREEN, BLACK, width=5)


# ── KIDS style — children's channels ─────────────────────────────────────────
def render_kids(draw, W, H, hook, niche):
    WHITE   = (255, 255, 255)
    YELLOW  = (255, 220, 40)
    CORAL   = (255, 90, 70)
    PURPLE  = (175, 90, 255)
    SKY     = (80, 180, 255)
    BLACK   = (30, 10, 60)

    # Sky gradient (fake with horizontal strips)
    steps = 40
    for i in range(steps):
        t = i / (steps - 1)
        r = int(120 - t * 40)
        g = int(195 - t * 30)
        b = int(255 - t * 20)
        y_top = i * (H // steps)
        y_bot = (i + 1) * (H // steps) + 1
        draw.rectangle([0, y_top, W, y_bot], fill=(r, g, b))

    # Big sun (top-right)
    sun_cx, sun_cy, sun_r = 900, 220, 130
    # Rays
    for angle in range(0, 360, 30):
        rad = math.radians(angle)
        x1 = sun_cx + int((sun_r + 10) * math.cos(rad))
        y1 = sun_cy + int((sun_r + 10) * math.sin(rad))
        x2 = sun_cx + int((sun_r + 60) * math.cos(rad))
        y2 = sun_cy + int((sun_r + 60) * math.sin(rad))
        draw.line([(x1, y1), (x2, y2)], fill=YELLOW, width=10)
    draw.ellipse(
        [sun_cx - sun_r, sun_cy - sun_r, sun_cx + sun_r, sun_cy + sun_r],
        fill=YELLOW, outline=(255, 180, 0), width=6
    )
    # Sun face (simple)
    font_face = load_font(60)
    draw.text((sun_cx - 30, sun_cy - 32), ":)", font=font_face, fill=(200, 120, 0))

    # Fluffy cloud (top-left)
    cloud_circles = [(140, 180, 75), (210, 150, 90), (295, 175, 75), (195, 200, 65)]
    for cx, cy, cr in cloud_circles:
        draw.ellipse([cx - cr, cy - cr, cx + cr, cy + cr], fill=WHITE)

    # Scattered stars
    font_star = load_font(55)
    star_pos = [(80, 380), (960, 330), (70, 860), (960, 800),
                (520, 180), (140, 1480), (920, 1530), (500, 1660)]
    for sx, sy in star_pos:
        draw_outlined_text(draw, sx, sy, "*", font_star, YELLOW, (200, 120, 0), width=2)

    # Rainbow stripe banner near bottom
    rainbow = [(255, 0, 0), (255, 140, 0), (255, 230, 0),
               (0, 190, 0), (0, 100, 255), (160, 0, 220)]
    stripe = 22
    for idx, color in enumerate(rainbow):
        y_top = H - 280 + idx * stripe
        draw.rectangle([0, y_top, W, y_top + stripe], fill=color)

    # Main hook — bubbly, colourful, thick dark outline
    font_big   = load_font(88)
    font_small = load_font(46)

    lines = textwrap.wrap(hook.upper(), width=12) or [hook.upper()[:12]]
    line_h = 112
    y0 = (H - len(lines) * line_h) // 2 - 30

    text_colors = [CORAL, PURPLE, YELLOW, SKY]
    for i, line in enumerate(lines):
        bbox = draw.textbbox((0, 0), line, font=font_big)
        tw = bbox[2] - bbox[0]
        x = (W - tw) // 2
        y = y0 + i * line_h
        draw_outlined_text(draw, x, y, line, font_big, text_colors[i % len(text_colors)], BLACK, width=7)

    # CTA
    cta = "WATCH MORE!"
    bbox = draw.textbbox((0, 0), cta, font=font_small)
    cw = bbox[2] - bbox[0]
    draw_outlined_text(draw, (W - cw) // 2, H - 185, cta, font_small, WHITE, BLACK, width=5)


# ── Main dispatcher ────────────────────────────────────────────────────────────
def generate_frame(hook, output_path, niche="", style="dark", scene_index=1, total_scenes=1):
    W, H = 1080, 1920

    # Base background colour (overwritten by render functions for brainrot/kids)
    bg = (10, 10, 20) if style == "dark" else (120, 195, 255)
    img  = Image.new("RGB", (W, H), color=bg)
    draw = ImageDraw.Draw(img)

    if style == "brainrot":
        render_brainrot(draw, W, H, hook, niche)
    elif style == "kids":
        render_kids(draw, W, H, hook, niche)
    else:
        render_dark(draw, W, H, hook, niche, scene_index, total_scenes)

    img.save(output_path, "PNG")
    print(f"[generateFrame] Saved: {output_path} (style={style})", flush=True)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print('Usage: python3 generateFrame.py \'{"hook":"...","output":"...","niche":"...","style":"dark"}\'')
        sys.exit(1)
    args = json.loads(sys.argv[1])
    generate_frame(
        args["hook"],
        args["output"],
        args.get("niche", ""),
        args.get("style", "dark"),
        int(args.get("sceneIndex", 1)),
        int(args.get("totalScenes", 1)),
    )
