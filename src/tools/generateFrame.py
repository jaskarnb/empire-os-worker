#!/usr/bin/env python3
"""
Generate a 1080x1920 background frame for Empire OS faceless videos.
Supports three visual styles:
  dark     — sleek dark + niche accent (adult channels)
  brainrot — cont chaos (Gen Z / meme channels)
  kids     — bright sky, sun, stars (children's channels)

Usage:
  python3 generateFrame.py '{"hook":"...","output":"path.png","niche":"finance","style":"dark"}'
"""
import sys
import json
import math
import textwrap
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
