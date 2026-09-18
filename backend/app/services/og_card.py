"""Server-side OG card rendering (Pillow). Produces a 1200x630 PNG for link
previews and shareable images without touching the LeetCode sync."""

import io
from dataclasses import dataclass

from PIL import Image, ImageDraw, ImageFont


@dataclass
class OgCardData:
    title: str = "MATCH COMPLETE"
    name: str = "MapCode"
    accent: str = "#ffa116"
    points: int = 0
    provinces: int = 0


_FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "C:\\Windows\\Fonts\\arialbd.ttf",
    "C:\\Windows\\Fonts\\arial.ttf",
    "Arial.ttf",
    "DejaVuSans-Bold.ttf",
]


def _font(size: int) -> ImageFont.ImageFont:
    for candidate in _FONT_CANDIDATES:
        try:
            return ImageFont.truetype(candidate, size)
        except Exception:
            continue
    return ImageFont.load_default()


def _hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    value = hex_color.lstrip("#")
    if len(value) != 6:
        return (255, 161, 22)
    return (int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16))


def _blend(color: tuple[int, int, int], base: tuple[int, int, int], weight: float) -> tuple[int, int, int]:
    return tuple(round(c * weight + b * (1 - weight)) for c, b in zip(color, base))


def render_og_card(data: OgCardData) -> bytes:
    width, height = 1200, 630
    base = (13, 14, 16)
    img = Image.new("RGB", (width, height), base)
    draw = ImageDraw.Draw(img)

    accent = _hex_to_rgb(data.accent)

    # Accent glow behind the title.
    glow = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gx, gy = width // 2, 210
    for radius in range(260, 0, -8):
        alpha = int(34 * (1 - radius / 260))
        gd.ellipse([gx - radius, gy - radius, gx + radius, gy + radius], fill=accent + (alpha,))
    img = Image.alpha_composite(img.convert("RGBA"), glow).convert("RGB")
    draw = ImageDraw.Draw(img)

    draw.text((width // 2, 92), "MapCode", font=_font(40), fill=(255, 161, 22), anchor="mm")
    draw.text((width // 2, 200), data.title, font=_font(96), fill=(255, 255, 255), anchor="mm")
    draw.text((width // 2, 286), data.name, font=_font(52), fill=accent, anchor="mm")

    # Stats panel
    panel = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    pd = ImageDraw.Draw(panel)
    pd.rounded_rectangle([250, 360, 950, 540], radius=24, fill=(18, 19, 23, 235), outline=accent + (90,), width=3)
    panel = Image.alpha_composite(img.convert("RGBA"), panel).convert("RGB")
    draw = ImageDraw.Draw(panel)

    cells = [
        ("PROVINCES", str(data.provinces), (127, 232, 255)),
        ("POINTS", str(data.points), (255, 161, 22)),
    ]
    cell_w = 700 / len(cells)
    for index, (label, value, color) in enumerate(cells):
        cx = 250 + cell_w * index + cell_w / 2
        draw.text((cx, 404), label, font=_font(26), fill=(138, 138, 138), anchor="mm")
        draw.text((cx, 474), value, font=_font(64), fill=color, anchor="mm")

    draw.text((width // 2, 586), "solve · capture · keep the streak", font=_font(26), fill=(106, 106, 106), anchor="mm")

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()
