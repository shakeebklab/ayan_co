"""Stronger body recolor for mandarin variants using numpy."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

OUT = Path(r"c:\Users\Hp\Downloads\Clothing_Catalog_Cart_WhatsApp\public\products")
MANIFEST = OUT / "manifest.json"


def hex_to_rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def recolor(im: Image.Image, target_hex: str) -> Image.Image:
    arr = np.asarray(im.convert("RGB"), dtype=np.float32)
    tr, tg, tb = hex_to_rgb(target_hex)
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    lum = (r + g + b) / 3.0
    chroma = np.maximum(np.maximum(r, g), b) - np.minimum(np.minimum(r, g), b)

    # Preserve near-whites (logo/labels) and warm wood hangers only.
    # Do NOT preserve mid greys — heathered fabric is low-chroma and must recolor.
    preserve = (lum > 210) | ((r > g + 22) & (r > b + 22) & (lum < 160) & (chroma > 18))

    # Map luminance into shaded target color
    shade = np.clip(lum / 255.0, 0.15, 1.0)
    # Keep fabric texture via local contrast
    local = (lum - lum.mean()) * 0.35
    nr = np.clip(tr * shade + local, 0, 255)
    ng = np.clip(tg * shade + local, 0, 255)
    nb = np.clip(tb * shade + local, 0, 255)

    out = arr.copy()
    mask = ~preserve
    # Almost full replace on fabric so color reads clearly
    mix = 0.88
    out[mask, 0] = nr[mask] * mix + r[mask] * (1 - mix)
    out[mask, 1] = ng[mask] * mix + g[mask] * (1 - mix)
    out[mask, 2] = nb[mask] * mix + b[mask] * (1 - mix)
    return Image.fromarray(out.astype(np.uint8), "RGB")


def save(im: Image.Image, name: str) -> str:
    path = OUT / name
    im.save(path, "JPEG", quality=92, optimize=True)
    return f"/products/{name}"


def main() -> None:
    # Curated hexes matching the source photos closely
    jobs = [
        # contrast collar kurta — featured black main
        ("mandarin-contrast-black.jpg", "heather-grey", "#6B6E72", "mandarin-contrast-heather-grey.jpg"),
        ("mandarin-contrast-black.jpg", "dark-grey", "#3A3A3E", "mandarin-contrast-dark-grey.jpg"),
        ("mandarin-contrast-black.jpg", "charcoal", "#4A4A4E", "mandarin-contrast-charcoal.jpg"),
        ("mandarin-contrast-black.jpg", "light-grey", "#B8B8B4", "mandarin-contrast-light-grey.jpg"),
        # placket shirt
        ("mandarin-placket-black.jpg", "grey", "#5A5E62", "mandarin-placket-grey.jpg"),
        ("mandarin-placket-black.jpg", "navy", "#2B2E3C", "mandarin-placket-navy.jpg"),
        # piping
        ("mandarin-piping-indigo.jpg", "charcoal", "#2C2C30", "mandarin-piping-charcoal.jpg"),
        ("mandarin-piping-indigo.jpg", "navy", "#1A2744", "mandarin-piping-navy.jpg"),
        ("mandarin-piping-indigo.jpg", "teal", "#2A5C58", "mandarin-piping-teal.jpg"),
        ("mandarin-piping-indigo.jpg", "light-grey", "#C8C8C4", "mandarin-piping-light-grey.jpg"),
        # soft tones
        ("mandarin-soft-sage.jpg", "lavender", "#A89BB0", "mandarin-soft-lavender.jpg"),
        ("mandarin-soft-sage.jpg", "sky", "#8FA4B8", "mandarin-soft-sky.jpg"),
        ("mandarin-soft-sage.jpg", "teal", "#5E8A8E", "mandarin-soft-teal.jpg"),
    ]

    colors = {
        "mandarin_contrast": {
            "heather-grey": "#6B6E72",
            "black": "#252328",
            "dark-grey": "#3A3A3E",
            "charcoal": "#4A4A4E",
            "light-grey": "#B8B8B4",
        },
        "mandarin_placket": {
            "black": "#1D1C1F",
            "grey": "#5A5E62",
            "navy": "#2B2E3C",
        },
        "mandarin_piping": {
            "charcoal": "#2C2C30",
            "navy": "#1A2744",
            "indigo": "#273145",
            "teal": "#2A5C58",
            "light-grey": "#C8C8C4",
        },
        "mandarin_soft": {
            "lavender": "#A89BB0",
            "sky": "#8FA4B8",
            "teal": "#5E8A8E",
            "sage": "#879583",
        },
        "ringer": {
            "black": "#19191A",
            "navy": "#14192B",
            "charcoal": "#353436",
            "forest": "#1C271E",
            "burgundy": "#4B1F33",
            "beige": "#C6A886",
            "white": "#F0F0F2",
            "sky": "#6483AC",
        },
    }

    for src_name, _label, hx, dest_name in jobs:
        src = Image.open(OUT / src_name)
        out = recolor(src, hx)
        save(out, dest_name)
        print("wrote", dest_name, hx)

    manifest = {}
    if MANIFEST.exists():
        manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    manifest["colors"] = colors
    MANIFEST.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps(colors, indent=2))


if __name__ == "__main__":
    main()
