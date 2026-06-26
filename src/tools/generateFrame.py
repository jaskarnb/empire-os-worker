#!/usr/bin/env python3
"""
Generate a 1080x1920 background frame for Empire OS videos.

Styles:
  dark     - sleek creator/business visuals
  horror   - CCTV, system logs, alerts, false routes
  brainrot - neon high-energy meme visuals
  kids     - bright child-friendly visuals
"""
import json
import math
import random
import sys
import textwrap
from PIL import Image, ImageDraw, ImageFont

W, H = 1080, 1920

ACCENT_COLORS = {
    "finance": (34, 197, 94),
    "crime": (239, 68, 68),
    "horror": (239, 68, 68),
    "tech": (99, 102, 241),
    "fitness": (249, 115, 22),
    "meme": (255, 0, 110),
    "kids": (255, 200, 0),
    "default": (139, 92, 246),
}


def get_accent(niche=""):
    lower = niche.lower()
    for key, value in ACCENT_COLORS.items():
        if key in lower:
            return value
    return ACCENT_COLORS["default"]


def load_font(size):
    paths = [
        "C:/Windows/Fonts/arialbd.ttf",
        "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/calibrib.ttf",
        "C:/Windows/Fonts/segoeuib.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for path in paths:
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            continue
    return ImageFont.load_default()


def clean(value, limit=240):
    return " ".join(str(value or "").replace("\n", " ").split())[:limit]


def outlined(draw, x, y, text, font, fill, outline=(0, 0, 0), width=5):
    for dx in range(-width, width + 1):
        for dy in range(-width, width + 1):
            if dx or dy:
                draw.text((x + dx, y + dy), text, font=font, fill=outline)
    draw.text((x, y), text, font=font, fill=fill)


def centered_lines(draw, text, font, y, max_chars, fill, outline=None, width=4, limit=4):
    lines = textwrap.wrap(clean(text).upper(), width=max_chars) or [clean(text).upper()[:max_chars]]
    for i, line in enumerate(lines[:limit]):
        bbox = draw.textbbox((0, 0), line, font=font)
        x = (W - (bbox[2] - bbox[0])) // 2
        yy = y + i * int(font.size * 1.12)
        if outline:
            outlined(draw, x, yy, line, font, fill, outline, width)
        else:
            draw.text((x, yy), line, font=font, fill=fill)


def keywords(text):
    stop = set("the a an and or to of in for with on your you this that is are can now just into from it as by be".split())
    words = [word.strip(".,!?;:()[]'\"").upper() for word in clean(text, 400).split()]
    words = [word for word in words if len(word) > 3 and word.lower() not in stop]
    return words[:5] or ["SMART", "SYSTEM"]


def draw_dark_scene(draw, hook, niche, scene_index, total_scenes):
    accent = get_accent(niche)
    for y in range(H):
        t = y / H
        draw.line([(0, y), (W, y)], fill=(int(7 + t * 14), int(10 + t * 10), int(22 + t * 24)))

    labels = keywords(hook)
    for i in range(11):
        angle = i * 0.8 + scene_index
        cx = int(W * (0.12 + (i % 4) * 0.25) + math.sin(angle) * 36)
        cy = int(H * (0.12 + (i // 4) * 0.28) + math.cos(angle) * 42)
        radius = 55 + (i % 3) * 24
        color = tuple(min(255, int(c * (0.2 + i * 0.018))) for c in accent)
        draw.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], outline=color, width=3)

    font_label = load_font(34)
    font_value = load_font(52)
    for i, (x, y) in enumerate([(72, 250), (648, 390), (86, 1370), (640, 1235)]):
        shift = int(math.sin(scene_index + i) * 18)
        draw.rounded_rectangle([x + shift, y, x + 360 + shift, y + 150], radius=26, fill=(20, 26, 42), outline=accent, width=3)
        draw.text((x + 28 + shift, y + 24), labels[i % len(labels)][:15], font=font_label, fill=(190, 200, 220))
        draw.text((x + 28 + shift, y + 74), ["AUTO", "2 MIN", "DONE", "+HOURS"][i % 4], font=font_value, fill=(255, 255, 255))

    draw.rounded_rectangle([350, 540, 730, 1280], radius=44, fill=(12, 16, 28), outline=(235, 235, 245), width=5)
    draw.rounded_rectangle([378, 610, 702, 1230], radius=28, fill=(24, 30, 46))
    for i, label in enumerate(labels[:4]):
        yy = 660 + i * 125
        draw.rounded_rectangle([405, yy, 675, yy + 74], radius=22, fill=accent if i == 0 else (54, 63, 88))
        draw.text((430, yy + 22), label[:18], font=load_font(26), fill=(255, 255, 255))

    centered_lines(draw, hook, load_font(72), 150, 13, (255, 255, 255), (0, 0, 0), 5, 3)
    progress_w = 760
    x = (W - progress_w) // 2
    y = H - 120
    draw.rounded_rectangle([x, y, x + progress_w, y + 18], radius=9, fill=(42, 48, 65))
    draw.rounded_rectangle([x, y, x + int(progress_w * scene_index / max(1, total_scenes)), y + 18], radius=9, fill=accent)
    draw.text((x, y - 48), f"SCENE {scene_index}/{total_scenes}", font=load_font(34), fill=(180, 190, 210))


def draw_noise(draw, seed, density=1600):
    random.seed(seed)
    for _ in range(density):
        x = random.randint(0, W - 1)
        y = random.randint(0, H - 1)
        shade = random.randint(18, 90)
        draw.point((x, y), fill=(shade, shade, shade))


def draw_horror_scene(draw, hook, niche, scene_index, total_scenes):
    green = (104, 255, 158)
    red = (255, 54, 54)
    amber = (255, 204, 92)
    for y in range(H):
        t = y / H
        draw.line([(0, y), (W, y)], fill=(int(5 + t * 12), int(12 + t * 17), int(12 + t * 10)))
    for y in range(0, H, 7):
        draw.line([(0, y), (W, y)], fill=(0, 0, 0), width=1)
    draw_noise(draw, f"{hook}-{scene_index}", 1900)

    font_small = load_font(32)
    font_med = load_font(52)
    font_big = load_font(78)
    draw.ellipse([56, 60, 82, 86], fill=red)
    draw.text((96, 53), f"REC 03:{16 + scene_index:02d}:{(scene_index * 7) % 60:02d}  CAM-{scene_index:02d}", font=font_small, fill=(235, 235, 220))
    draw.text((W - 235, 53), f"{scene_index}/{total_scenes}", font=font_small, fill=(180, 190, 180))

    mode = scene_index % 5
    if mode == 1:
        draw.rectangle([118, 350, 962, 1320], outline=(78, 112, 90), width=5)
        draw.rectangle([210, 440, 505, 1170], outline=green, width=6)
        draw.text((225, 390), "OBJECT DETECTED", font=font_small, fill=green)
        draw.line([(660, 500), (840, 620)], fill=(120, 145, 135), width=9)
        draw.line([(690, 710), (905, 790)], fill=(120, 145, 135), width=9)
        draw.rectangle([565, 520, 910, 1015], outline=red, width=5)
        draw.text((590, 1040), "NOT HUMAN", font=font_med, fill=red)
    elif mode == 2:
        draw.rounded_rectangle([90, 380, 990, 1180], radius=24, fill=(8, 16, 18), outline=green, width=4)
        route = [(160, 1030), (300, 845), (500, 880), (640, 640), (850, 560)]
        for a, b in zip(route, route[1:]):
            draw.line([a, b], fill=green, width=10)
        for x, y in route:
            draw.ellipse([x - 18, y - 18, x + 18, y + 18], fill=amber)
        draw.text((150, 430), "ROUTE RECALCULATING", font=font_med, fill=green)
        draw.text((150, 515), "DESTINATION: UNKNOWN", font=font_small, fill=red)
    elif mode == 3:
        draw.rounded_rectangle([105, 360, 975, 1300], radius=18, fill=(11, 12, 13), outline=(78, 78, 78), width=3)
        for i in range(10):
            y = 430 + i * 74
            level = "ERROR" if i % 3 == 0 else "WARN"
            draw.text((150, y), f"03:{17+i:02d}:0{i} [{level}] USER_{'NULL' if i == 7 else i}", font=font_small, fill=red if level == "ERROR" else amber)
        draw.text((150, 1210), "ENTRY HAS NO OWNER", font=font_med, fill=green)
    elif mode == 4:
        draw.rounded_rectangle([90, 320, 990, 1250], radius=28, fill=(40, 0, 0), outline=red, width=8)
        draw.text((160, 415), "EMERGENCY ALERT", font=font_big, fill=(255, 245, 235))
        draw.line([(145, 535), (935, 535)], fill=(255, 245, 235), width=6)
        draw.text((160, 650), "DO NOT ANSWER", font=font_med, fill=(255, 245, 235))
        draw.text((160, 735), "THE SECOND KNOCK", font=font_med, fill=(255, 245, 235))
        draw.text((160, 1035), "SOURCE: EMPIRE OS", font=font_small, fill=amber)
    else:
        draw.rounded_rectangle([135, 405, 945, 1225], radius=24, fill=(12, 14, 16), outline=(85, 100, 95), width=4)
        for x in range(180, 900, 90):
            draw.line([(x, 470), (x, 1130)], fill=(32, 55, 46), width=2)
        for y in range(520, 1130, 90):
            draw.line([(180, y), (900, y)], fill=(32, 55, 46), width=2)
        draw.ellipse([455, 720, 625, 890], outline=red, width=7)
        draw.text((300, 970), "FALSE ADDRESS FOUND", font=font_med, fill=green)

    draw.rounded_rectangle([70, 1370, 1010, 1750], radius=18, fill=(0, 0, 0), outline=(55, 70, 64), width=3)
    centered_lines(draw, hook, load_font(64), 1415, 18, (245, 245, 235), (0, 0, 0), 5, 4)


def draw_brainrot_scene(draw, hook):
    hot_pink = (255, 0, 110)
    blue = (58, 134, 255)
    yellow = (255, 230, 0)
    green = (0, 255, 120)
    black = (0, 0, 0)
    draw.rectangle([0, 0, W // 2, H], fill=hot_pink)
    draw.rectangle([W // 2, 0, W, H], fill=blue)
    draw.polygon([(W // 2 - 55, 0), (W // 2 + 55, 0), (W // 2 + 5, H), (W // 2 - 105, H)], fill=yellow)
    for i in range(7):
        draw.rectangle([0, i * 14, W, (i + 1) * 14], fill=black if i % 2 == 0 else yellow)
        draw.rectangle([0, H - (i + 1) * 14, W, H - i * 14], fill=black if i % 2 == 0 else yellow)
    for box in [(40, 130, 120, 210), (910, 180, 990, 260), (40, 1650, 120, 1730), (910, 1700, 990, 1780)]:
        draw.rectangle(box, fill=green, outline=black, width=4)
    outlined(draw, 35, 290, "!!", load_font(80), yellow, black, 5)
    outlined(draw, 900, 290, "!!", load_font(80), yellow, black, 5)
    centered_lines(draw, hook, load_font(96), 680, 10, yellow, black, 7, 5)
    centered_lines(draw, "STAY TIL THE END!!!", load_font(48), H - 200, 22, green, black, 5, 1)


def draw_kids_scene(draw, hook):
    white = (255, 255, 255)
    yellow = (255, 220, 40)
    coral = (255, 90, 70)
    purple = (175, 90, 255)
    sky = (80, 180, 255)
    black = (30, 10, 60)
    for i in range(40):
        t = i / 39
        y0 = i * (H // 40)
        draw.rectangle([0, y0, W, y0 + H // 40 + 1], fill=(int(120 - t * 40), int(195 - t * 30), int(255 - t * 20)))
    cx, cy, radius = 900, 220, 130
    for angle in range(0, 360, 30):
        rad = math.radians(angle)
        draw.line([(cx + int((radius + 10) * math.cos(rad)), cy + int((radius + 10) * math.sin(rad))),
                   (cx + int((radius + 60) * math.cos(rad)), cy + int((radius + 60) * math.sin(rad)))], fill=yellow, width=10)
    draw.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], fill=yellow, outline=(255, 180, 0), width=6)
    draw.text((cx - 30, cy - 32), ":)", font=load_font(60), fill=(200, 120, 0))
    for ccx, ccy, cr in [(140, 180, 75), (210, 150, 90), (295, 175, 75), (195, 200, 65)]:
        draw.ellipse([ccx - cr, ccy - cr, ccx + cr, ccy + cr], fill=white)
    for sx, sy in [(80, 380), (960, 330), (70, 860), (960, 800), (520, 180), (140, 1480), (920, 1530), (500, 1660)]:
        outlined(draw, sx, sy, "*", load_font(55), yellow, (200, 120, 0), 2)
    for idx, color in enumerate([(255, 0, 0), (255, 140, 0), (255, 230, 0), (0, 190, 0), (0, 100, 255), (160, 0, 220)]):
        draw.rectangle([0, H - 280 + idx * 22, W, H - 258 + idx * 22], fill=color)
    colors = [coral, purple, yellow, sky]
    lines = textwrap.wrap(clean(hook).upper(), width=12) or [clean(hook).upper()[:12]]
    y = (H - len(lines) * 112) // 2 - 30
    for i, line in enumerate(lines[:4]):
        bbox = draw.textbbox((0, 0), line, font=load_font(88))
        outlined(draw, (W - (bbox[2] - bbox[0])) // 2, y + i * 112, line, load_font(88), colors[i % len(colors)], black, 7)
    centered_lines(draw, "WATCH MORE!", load_font(46), H - 185, 20, white, black, 5, 1)


def generate_frame(hook, output_path, niche="", style="dark", scene_index=1, total_scenes=1):
    style = (style or "dark").lower()
    img = Image.new("RGB", (W, H), color=(10, 10, 20))
    draw = ImageDraw.Draw(img)

    if style == "brainrot":
        draw_brainrot_scene(draw, hook)
    elif style == "kids":
        draw_kids_scene(draw, hook)
    elif style == "horror":
        draw_horror_scene(draw, hook, niche, scene_index, total_scenes)
    else:
        draw_dark_scene(draw, hook, niche, scene_index, total_scenes)

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
