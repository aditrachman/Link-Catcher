"""Buat ikon PWA (192, 512, maskable 512). Jalankan sekali: python3 make-icons.py (butuh Pillow)."""
import os
from PIL import Image, ImageDraw

BG, FG = (20, 32, 27, 255), (242, 217, 78, 255)


def glyph(size, scale):
    big = 1024
    layer = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    w = 78
    d.rounded_rectangle((170, 392, 590, 632), radius=120, outline=FG, width=w)
    d.rounded_rectangle((434, 392, 854, 632), radius=120, outline=FG, width=w)
    layer = layer.rotate(45, resample=Image.BICUBIC)
    s = int(big * scale)
    layer = layer.resize((s, s), Image.LANCZOS)
    out = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    out.paste(layer, ((big - s) // 2, (big - s) // 2), layer)
    return out


def make(size, scale, rounded):
    big = 1024
    base = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(base)
    if rounded:
        d.rounded_rectangle((0, 0, big, big), radius=230, fill=BG)
    else:
        d.rectangle((0, 0, big, big), fill=BG)
    base.alpha_composite(glyph(size, scale))
    return base.resize((size, size), Image.LANCZOS)


os.makedirs("icons", exist_ok=True)
make(192, 1.0, True).save("icons/icon-192.png")
make(512, 1.0, True).save("icons/icon-512.png")
make(512, 0.74, False).save("icons/icon-maskable-512.png")
print("ok")
