#!/usr/bin/env python3
"""
Generate a 1080x1920 background frame for Empire OS videos.

Styles:
  dark     - animated explainer cartoon visuals
  horror   - spooky cartoon scene visuals
  brainrot - chaotic meme cartoon visuals
  kids     - bright child-friendly cartoon visuals
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


def palette(niche="", style="dark"):
    lower = f"{niche} {style}".lower()
    if "finance" in lower or "money" in lower or "wealth" in lower:
        return {
            "sky": (24, 116, 92),
            "ground": (19, 83, 65),
            "accent": (250, 204, 21),
            "shirt": (34, 197, 94),
            "object": "money",
        }
    if "tech" in lower or "ai" in lower or "automation" in lower:
        return {
            "sky": (36, 74, 146),
            "ground": (21, 35, 80),
            "accent": (103, 232, 249),
            "shirt": (99, 102, 241),
            "object": "robot",
        }
    if "fitness" in lower or "gym" in lower:
        return {
            "sky": (165, 74, 34),
            "ground": (94, 45, 28),
            "accent": (251, 146, 60),
            "shirt": (239, 68, 68),
            "object": "dumbbell",
        }
    return {
        "sky": (64, 82, 150),
        "ground": (37, 49, 103),
        "accent": get_accent(niche),
        "shirt": (139, 92, 246),
        "object": "phone",
    }


def gradient(draw, top, bottom):
    for y in range(H):
        t = y / H
        fill = tuple(int(top[i] * (1 - t) + bottom[i] * t) for i in range(3))
        draw.line([(0, y), (W, y)], fill=fill)


def speech_bubble(draw, text, x=90, y=170, w=900, h=250, fill=(255, 255, 255), outline=(20, 20, 40)):
    draw.rounded_rectangle([x, y, x + w, y + h], radius=42, fill=fill, outline=outline, width=8)
    draw.polygon([(x + 160, y + h - 5), (x + 220, y + h + 75), (x + 280, y + h - 5)], fill=fill, outline=outline)
    centered_lines(draw, text, load_font(58), y + 50, 18, (18, 18, 28), None, 0, 3)


def draw_character(draw, x, y, scale=1.0, shirt=(139, 92, 246), mood="happy", pose=0):
    s = scale
    skin = (255, 205, 155)
    outline = (35, 24, 45)
    bob = math.sin(pose * math.pi * 2) * 18 * s
    arm_wave = math.sin(pose * math.pi * 2) * 72 * s
    leg_swing = math.sin(pose * math.pi * 2) * 34 * s
    y = y + bob
    # shadow
    draw.ellipse([x - 150*s, y + 470*s, x + 150*s, y + 525*s], fill=(0, 0, 0, 70))
    # legs
    draw.rounded_rectangle([x - 86*s - leg_swing, y + 285*s, x - 24*s - leg_swing, y + 505*s], radius=int(24*s), fill=(45, 55, 95), outline=outline, width=max(2, int(5*s)))
    draw.rounded_rectangle([x + 24*s + leg_swing, y + 285*s, x + 86*s + leg_swing, y + 505*s], radius=int(24*s), fill=(45, 55, 95), outline=outline, width=max(2, int(5*s)))
    # body
    draw.rounded_rectangle([x - 120*s, y + 105*s, x + 120*s, y + 330*s], radius=int(58*s), fill=shirt, outline=outline, width=max(2, int(7*s)))
    # arms
    draw.line([(x - 105*s, y + 155*s), (x - 205*s, y + 265*s - arm_wave)], fill=outline, width=max(5, int(28*s)))
    draw.line([(x + 105*s, y + 155*s), (x + 205*s, y + 245*s + arm_wave)], fill=outline, width=max(5, int(28*s)))
    draw.ellipse([x - 230*s, y + 245*s - arm_wave, x - 175*s, y + 300*s - arm_wave], fill=skin, outline=outline, width=max(2, int(5*s)))
    draw.ellipse([x + 180*s, y + 225*s + arm_wave, x + 235*s, y + 280*s + arm_wave], fill=skin, outline=outline, width=max(2, int(5*s)))
    # head and hair
    draw.ellipse([x - 105*s, y - 70*s, x + 105*s, y + 140*s], fill=skin, outline=outline, width=max(2, int(7*s)))
    draw.pieslice([x - 115*s, y - 95*s, x + 115*s, y + 95*s], 185, 355, fill=(38, 25, 36), outline=outline, width=max(2, int(5*s)))
    # eyes
    draw.ellipse([x - 48*s, y + 20*s, x - 20*s, y + 48*s], fill=outline)
    draw.ellipse([x + 20*s, y + 20*s, x + 48*s, y + 48*s], fill=outline)
    if mood == "scared":
        draw.ellipse([x - 28*s, y + 76*s, x + 28*s, y + 124*s], outline=outline, width=max(2, int(7*s)))
    elif mood == "shock":
        draw.ellipse([x - 22*s, y + 76*s, x + 22*s, y + 118*s], fill=(80, 30, 45))
    else:
        draw.arc([x - 45*s, y + 58*s, x + 45*s, y + 116*s], 10, 170, fill=outline, width=max(2, int(7*s)))


def draw_phone(draw, x, y, accent=(103, 232, 249), label="APP"):
    outline = (20, 20, 35)
    draw.rounded_rectangle([x, y, x + 230, y + 410], radius=36, fill=(18, 24, 42), outline=outline, width=7)
    draw.rounded_rectangle([x + 22, y + 58, x + 208, y + 360], radius=22, fill=(245, 248, 255))
    draw.rounded_rectangle([x + 48, y + 98, x + 182, y + 158], radius=18, fill=accent)
    draw.text((x + 58, y + 112), label[:8].upper(), font=load_font(30), fill=(15, 20, 35))
    for i in range(3):
        yy = y + 190 + i * 52
        draw.rounded_rectangle([x + 50, yy, x + 180, yy + 26], radius=13, fill=(210, 218, 236))


def draw_money_object(draw, x, y):
    outline = (24, 50, 35)
    for i in range(4):
        yy = y + i * 44
        draw.rounded_rectangle([x + i * 25, yy, x + 320 + i * 25, yy + 135], radius=18, fill=(74, 222, 128), outline=outline, width=5)
        draw.ellipse([x + 135 + i * 25, yy + 28, x + 210 + i * 25, yy + 103], outline=outline, width=5)
        draw.text((x + 35 + i * 25, yy + 44), "$", font=load_font(58), fill=outline)


def draw_robot(draw, x, y, accent=(103, 232, 249), pose=0):
    outline = (20, 24, 42)
    y = y + math.sin(pose * math.pi * 2) * 22
    eye_offset = math.sin(pose * math.pi * 2) * 8
    draw.rounded_rectangle([x, y, x + 300, y + 260], radius=42, fill=(235, 245, 255), outline=outline, width=8)
    draw.ellipse([x + 72 + eye_offset, y + 80, x + 122 + eye_offset, y + 130], fill=accent, outline=outline, width=5)
    draw.ellipse([x + 178 + eye_offset, y + 80, x + 228 + eye_offset, y + 130], fill=accent, outline=outline, width=5)
    draw.arc([x + 90, y + 125, x + 210, y + 205], 15, 165, fill=outline, width=8)
    draw.line([(x + 150, y), (x + 150, y - 70)], fill=outline, width=8)
    draw.ellipse([x + 125, y - 105, x + 175, y - 55], fill=accent, outline=outline, width=5)


def draw_dumbbell(draw, x, y):
    outline = (35, 24, 45)
    draw.line([(x, y), (x + 310, y)], fill=outline, width=28)
    for dx in [0, 40, 230, 270]:
        draw.rounded_rectangle([x + dx - 22, y - 70, x + dx + 22, y + 70], radius=14, fill=(90, 95, 115), outline=outline, width=5)


def draw_explainer_object(draw, kind, x, y, accent, pose=0):
    y = y + math.sin(pose * math.pi * 2) * 18
    if kind == "money":
        draw_money_object(draw, x, y)
    elif kind == "robot":
        draw_robot(draw, x + 30, y + 40, accent, pose)
    elif kind == "dumbbell":
        draw_dumbbell(draw, x + 20, y + 160)
    else:
        draw_phone(draw, x + 70, y, accent, "PLAN")


def draw_dark_scene(draw, hook, niche, scene_index, total_scenes, motion_phase=0):
    p = palette(niche, "dark")
    accent = p["accent"]
    gradient(draw, p["sky"], (180, 215, 255))
    draw.rectangle([0, 1320, W, H], fill=p["ground"])
    # moving clouds and rays make each scene feel like animation cel
    for i in range(5):
        cx = (120 + i * 250 + scene_index * 35 + int(motion_phase * 120)) % (W + 220) - 110
        cy = 170 + (i % 2) * 130
        for ox, oy, r in [(0, 0, 58), (55, -25, 72), (125, 0, 58)]:
            draw.ellipse([cx + ox - r, cy + oy - r, cx + ox + r, cy + oy + r], fill=(255, 255, 255))
    for i in range(8):
        x = 70 + i * 135
        draw.rounded_rectangle([x, 1285 - (i % 3) * 42, x + 70, 1385], radius=18, fill=(255, 255, 255, 80))

    speech_bubble(draw, hook)
    mood = "shock" if scene_index <= 2 else "happy"
    draw_character(draw, 265 + int(motion_phase * 95), 820, 1.05, p["shirt"], mood, motion_phase)
    draw_explainer_object(draw, p["object"], 600 + int(math.sin(motion_phase * math.pi * 2) * 45), 800, accent, motion_phase)
    # visual beat badges
    labels = keywords(hook)
    for i, label in enumerate(labels[:3]):
        yy = 1250 + i * 112
        draw.rounded_rectangle([620, yy, 990, yy + 82], radius=24, fill=(255, 255, 255), outline=(30, 35, 55), width=5)
        draw.ellipse([642, yy + 18, 690, yy + 66], fill=accent, outline=(30, 35, 55), width=4)
        draw.text((715, yy + 21), label[:14], font=load_font(38), fill=(30, 35, 55))


def draw_noise(draw, seed, density=1600):
    random.seed(seed)
    for _ in range(density):
        x = random.randint(0, W - 1)
        y = random.randint(0, H - 1)
        shade = random.randint(18, 90)
        draw.point((x, y), fill=(shade, shade, shade))


def draw_horror_scene(draw, hook, niche, scene_index, total_scenes, motion_phase=0):
    gradient(draw, (13, 17, 35), (45, 15, 38))
    moon = (235, 236, 208)
    red = (255, 64, 64)
    fog = (88, 101, 120)
    draw.ellipse([760, 100, 1010, 350], fill=moon)
    for i in range(7):
        y = 1120 + i * 72
        draw.ellipse([-120 + i * 80, y, W + 160, y + 210], fill=tuple(max(0, c - i * 6) for c in fog))
    # spooky house
    draw.polygon([(120, 980), (540, 620), (960, 980)], fill=(42, 34, 52), outline=(12, 10, 20))
    draw.rectangle([185, 980, 895, 1510], fill=(50, 40, 58), outline=(12, 10, 20), width=8)
    draw.rectangle([455, 1180, 625, 1510], fill=(16, 12, 24), outline=(12, 10, 20), width=7)
    draw.ellipse([578, 1330, 604, 1356], fill=red)
    for x in [265, 680]:
        draw.rounded_rectangle([x, 1060, x + 130, 1205], radius=14, fill=(255, 210, 85), outline=(12, 10, 20), width=6)
        draw.line([(x + 65, 1062), (x + 65, 1204)], fill=(12, 10, 20), width=4)
    # character in foreground
    draw_character(draw, 245 - int(motion_phase * 70), 1130, 0.85, (80, 88, 120), "scared", motion_phase)
    # shadow creature / clue changes by scene
    shift = (scene_index % 3) * 38 + int(motion_phase * 95)
    draw.ellipse([710 + shift, 970, 910 + shift, 1410], fill=(5, 5, 10))
    draw.ellipse([738 + shift, 850, 882 + shift, 1010], fill=(5, 5, 10))
    draw.ellipse([775 + shift, 910, 798 + shift, 935], fill=red)
    draw.ellipse([830 + shift, 910, 853 + shift, 935], fill=red)
    draw.line([(735 + shift, 1130), (640 + shift, 1285)], fill=(5, 5, 10), width=24)
    draw.line([(880 + shift, 1120), (965 + shift, 1280)], fill=(5, 5, 10), width=24)
    speech_bubble(draw, hook, 70, 155, 770, 245, fill=(255, 245, 220), outline=(20, 10, 20))
    draw.text((80, 55), f"CARTOON HORROR  {scene_index}/{total_scenes}", font=load_font(36), fill=(255, 220, 220))


def draw_brainrot_scene(draw, hook, scene_index=1, motion_phase=0):
    hot_pink = (255, 0, 110)
    blue = (58, 134, 255)
    yellow = (255, 230, 0)
    green = (0, 255, 120)
    black = (0, 0, 0)
    draw.rectangle([0, 0, W, H], fill=yellow)
    for i in range(-2, 10):
        x0 = i * 180 + (scene_index % 3) * 40 + int(motion_phase * 90)
        draw.polygon([(x0, 0), (x0 + 95, 0), (x0 - 180, H), (x0 - 275, H)], fill=hot_pink if i % 2 else blue)
    for i in range(18):
        cx = (80 + i * 115 + scene_index * 31 + int(motion_phase * 160)) % W
        cy = 140 + (i * 173) % 1500
        r = 34 + (i % 4) * 14
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=green if i % 2 else yellow, outline=black, width=5)
    draw_character(draw, 250 + int(motion_phase * 130), 910, 0.95, hot_pink, "shock", motion_phase)
    draw_robot(draw, 610 - int(motion_phase * 80), 900, blue, motion_phase)
    outlined(draw, 65, 395, "NEW LORE", load_font(78), yellow, black, 7)
    outlined(draw, 680, 1265, "PLOT TWIST", load_font(54), green, black, 6)
    speech_bubble(draw, hook, 80, 125, 880, 250, fill=(255, 255, 255), outline=black)
    centered_lines(draw, "WAIT FOR IT", load_font(48), H - 180, 22, green, black, 5, 1)


def draw_kids_scene(draw, hook, scene_index=1, motion_phase=0):
    white = (255, 255, 255)
    yellow = (255, 220, 40)
    coral = (255, 90, 70)
    purple = (175, 90, 255)
    sky = (80, 180, 255)
    black = (30, 10, 60)
    gradient(draw, (113, 205, 255), (194, 232, 255))
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
    draw.rectangle([0, 1260, W, H], fill=(91, 214, 108))
    # friendly animal/cartoon friend
    bx = 215 + (scene_index % 3) * 35 + int(motion_phase * 95)
    by = int(math.sin(motion_phase * math.pi * 2) * 20)
    draw.ellipse([bx - 145, 855 + by, bx + 145, 1145 + by], fill=(255, 180, 115), outline=black, width=7)
    draw.ellipse([bx - 118, 800 + by, bx - 40, 900 + by], fill=(255, 180, 115), outline=black, width=7)
    draw.ellipse([bx + 40, 800 + by, bx + 118, 900 + by], fill=(255, 180, 115), outline=black, width=7)
    draw.ellipse([bx - 58, 960 + by, bx - 25, 993 + by], fill=black)
    draw.ellipse([bx + 25, 960 + by, bx + 58, 993 + by], fill=black)
    draw.arc([bx - 55, 995 + by, bx + 55, 1070 + by], 10, 170, fill=black, width=8)
    draw_character(draw, 705 - int(motion_phase * 75), 910, 0.82, purple, "happy", motion_phase)
    for idx, color in enumerate([(255, 0, 0), (255, 140, 0), (255, 230, 0), (0, 190, 0), (0, 100, 255), (160, 0, 220)]):
        draw.rectangle([0, H - 280 + idx * 22, W, H - 258 + idx * 22], fill=color)
    speech_bubble(draw, hook, 65, 130, 840, 245, fill=(255, 255, 255), outline=black)
    centered_lines(draw, "WATCH MORE!", load_font(46), H - 185, 20, white, black, 5, 1)


def generate_frame(hook, output_path, niche="", style="dark", scene_index=1, total_scenes=1, motion_phase=0):
    style = (style or "dark").lower()
    img = Image.new("RGB", (W, H), color=(10, 10, 20))
    draw = ImageDraw.Draw(img)

    if style == "brainrot":
        draw_brainrot_scene(draw, hook, scene_index, motion_phase)
    elif style == "kids":
        draw_kids_scene(draw, hook, scene_index, motion_phase)
    elif style == "horror":
        draw_horror_scene(draw, hook, niche, scene_index, total_scenes, motion_phase)
    else:
        draw_dark_scene(draw, hook, niche, scene_index, total_scenes, motion_phase)

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
        float(args.get("motionPhase", 0)),
    )
