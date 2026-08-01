"""Crop product photos and sample fabric colors from AA apparel source images."""
from __future__ import annotations

import json
import os
from collections import Counter
from pathlib import Path

from PIL import Image

ASSETS = Path(
    r"C:\Users\Hp\.cursor\projects\c-Users-Hp-Downloads-Clothing-Catalog-Cart-WhatsApp\assets"
)
OUT = Path(r"c:\Users\Hp\Downloads\Clothing_Catalog_Cart_WhatsApp\public\products")
OUT.mkdir(parents=True, exist_ok=True)


def find(substr: str) -> Path:
    matches = [p for p in ASSETS.iterdir() if substr in p.name]
    if not matches:
        raise FileNotFoundError(substr)
    return matches[0]


def save(im: Image.Image, name: str) -> str:
    path = OUT / name
    rgb = im.convert("RGB")
    rgb.save(path, "JPEG", quality=92, optimize=True)
    return f"/products/{name}"


def avg_hex(im: Image.Image, box: tuple[int, int, int, int]) -> str:
    crop = im.crop(box).convert("RGB").resize((24, 24), Image.Resampling.LANCZOS)
    pixels = list(crop.getdata())
    # Drop near-white / near-black extremes for trim-heavy areas
    filtered = [
        p
        for p in pixels
        if 25 < sum(p) / 3 < 240 and not (abs(p[0] - p[1]) < 8 and abs(p[1] - p[2]) < 8 and sum(p) / 3 > 200)
    ]
    use = filtered or pixels
    r = sum(p[0] for p in use) // len(use)
    g = sum(p[1] for p in use) // len(use)
    b = sum(p[2] for p in use) // len(use)
    return f"#{r:02X}{g:02X}{b:02X}"


def crop_left_panel(im: Image.Image, right_ratio: float = 0.62) -> Image.Image:
    w, h = im.size
    return im.crop((0, 0, int(w * right_ratio), h))


def main() -> None:
    report: dict = {"files": {}, "colors": {}}

    # ── 8-color ringer grid ──────────────────────────────────────────
    grid = Image.open(find("10.48.02_AM-f4d2e913"))
    gw, gh = grid.size
    # 2 rows x 4 cols
    cell_w, cell_h = gw // 4, gh // 2
    ringer_names = [
        "black",
        "navy",
        "charcoal",
        "forest",
        "burgundy",
        "beige",
        "white",
        "sky",
    ]
    ringer_paths = []
    ringer_hexes = []
    for i, name in enumerate(ringer_names):
        col, row = i % 4, i // 4
        # slight inset to avoid seams
        inset = 4
        box = (
            col * cell_w + inset,
            row * cell_h + inset,
            (col + 1) * cell_w - inset,
            (row + 1) * cell_h - inset,
        )
        cell = grid.crop(box)
        path = save(cell, f"ringer-{name}.jpg")
        ringer_paths.append(path)
        # sample mid torso
        cw, ch = cell.size
        hx = avg_hex(cell, (int(cw * 0.35), int(ch * 0.38), int(cw * 0.55), int(ch * 0.55)))
        ringer_hexes.append(hx)
        report["files"][f"ringer-{name}"] = path

    report["colors"]["ringer"] = dict(zip(ringer_names, ringer_hexes))

    # Prefer detail collage left panels for key colors when available
    detail_map = {
        "navy": "10.48.04_AM__1_-04948c6b",
        "black": "10.48.03_AM-3ec467a9",
        "charcoal": "10.48.04_AM-04be7fc6",
        "burgundy": "10.48.03_AM__1_-d2efc2af",
    }
    for name, key in detail_map.items():
        im = Image.open(find(key))
        panel = crop_left_panel(im, 0.58)
        path = save(panel, f"ringer-{name}.jpg")
        report["files"][f"ringer-{name}-detail"] = path
        # update path list index
        idx = ringer_names.index(name)
        ringer_paths[idx] = path
        cw, ch = panel.size
        ringer_hexes[idx] = avg_hex(
            panel, (int(cw * 0.38), int(ch * 0.40), int(cw * 0.58), int(ch * 0.58))
        )

    report["colors"]["ringer"] = dict(zip(ringer_names, ringer_hexes))
    report["ringer_paths"] = ringer_paths
    report["ringer_hexes"] = ringer_hexes

    # ── Mandarin: contrast collar (img 11.23.24) ─────────────────────
    m1 = Image.open(find("11.23.24_AM-ed1e82c6"))
    m1_main = crop_left_panel(m1, 0.58)
    m1_black = save(m1_main, "mandarin-contrast-black.jpg")
    w, h = m1_main.size
    m1_black_hex = avg_hex(m1_main, (int(w * 0.40), int(h * 0.42), int(w * 0.58), int(h * 0.58)))

    # Crop color stack inset (bottom-right) into strips for secondary colors
    # Right column is ~42% width; stack is bottom third of right column
    mw, mh = m1.size
    stack = m1.crop((int(mw * 0.60), int(mh * 0.66), mw - 8, mh - 8))
    sw, sh = stack.size
    # 5 folded shirts stacked — approximate equal bands
    contrast_names = ["heather-grey", "black", "dark-grey", "charcoal", "light-grey"]
    # From description top to bottom of stack varies; use main black for black
    # Sample hexes from stack bands for swatches; use main image for black,
    # and recolor for others via simple tinted composites of main crop.
    contrast_hexes = []
    contrast_paths = []
    band_h = sh // 5
    for i, name in enumerate(contrast_names):
        band = stack.crop((int(sw * 0.15), i * band_h + 4, int(sw * 0.85), (i + 1) * band_h - 4))
        bw, bh = band.size
        hx = avg_hex(band, (0, int(bh * 0.2), bw, int(bh * 0.8)))
        contrast_hexes.append(hx)
        if name == "black":
            contrast_paths.append(m1_black)
            contrast_hexes[-1] = m1_black_hex
        else:
            # Use stack band as color preview image (zoomed fabric) + we'll also
            # create a tinted full product for modal display
            tinted = tint_body(m1_main, hx)
            contrast_paths.append(save(tinted, f"mandarin-contrast-{name}.jpg"))

    report["colors"]["mandarin_contrast"] = dict(zip(contrast_names, contrast_hexes))
    report["mandarin_contrast_paths"] = contrast_paths
    report["mandarin_contrast_hexes"] = contrast_hexes

    # ── Mandarin: solid placket (11.23.00 / 11.28.17) ────────────────
    m2 = Image.open(find("11.23.00_AM-a54d8f95"))
    m2_main = crop_left_panel(m2, 0.58)
    m2_black = save(m2_main, "mandarin-placket-black.jpg")
    w, h = m2_main.size
    m2_black_hex = avg_hex(m2_main, (int(w * 0.40), int(h * 0.42), int(w * 0.58), int(h * 0.58)))

    # Colors from stack: Black, Dark Grey, Navy
    placket_names = ["black", "grey", "navy"]
    placket_targets = [m2_black_hex, "#5A5E62", "#2B2E3C"]
    placket_paths = [m2_black]
    for name, hx in zip(placket_names[1:], placket_targets[1:]):
        placket_paths.append(save(tint_body(m2_main, hx), f"mandarin-placket-{name}.jpg"))
    # refine grey/navy hex from second source if available
    m2b = Image.open(find("11.28.17_AM-2013a17c"))
    mw, mh = m2b.size
    stack2 = m2b.crop((int(mw * 0.60), int(mh * 0.66), mw - 8, mh - 8))
    sw, sh = stack2.size
    band_h = sh // 3
    refined = [m2_black_hex]
    for i in range(1, 3):
        band = stack2.crop((int(sw * 0.15), i * band_h + 4, int(sw * 0.85), (i + 1) * band_h - 4))
        bw, bh = band.size
        refined.append(avg_hex(band, (0, int(bh * 0.2), bw, int(bh * 0.8))))
    placket_hexes = refined
    # regenerate tinted with refined hexes
    placket_paths = [m2_black]
    for name, hx in zip(placket_names[1:], placket_hexes[1:]):
        placket_paths.append(save(tint_body(m2_main, hx), f"mandarin-placket-{name}.jpg"))

    report["colors"]["mandarin_placket"] = dict(zip(placket_names, placket_hexes))
    report["mandarin_placket_paths"] = placket_paths
    report["mandarin_placket_hexes"] = placket_hexes

    # ── Mandarin: piping (11.23.35) ──────────────────────────────────
    m3 = Image.open(find("11.23.35_AM-bf8383db"))
    m3_main = crop_left_panel(m3, 0.58)
    m3_indigo = save(m3_main, "mandarin-piping-indigo.jpg")
    w, h = m3_main.size
    m3_indigo_hex = avg_hex(m3_main, (int(w * 0.40), int(h * 0.42), int(w * 0.58), int(h * 0.58)))

    mw, mh = m3.size
    stack3 = m3.crop((int(mw * 0.60), int(mh * 0.55), int(mw * 0.98), int(mh * 0.82)))
    sw, sh = stack3.size
    piping_names = ["charcoal", "navy", "indigo", "teal", "light-grey"]
    band_h = max(sh // 5, 1)
    piping_hexes = []
    for i in range(5):
        band = stack3.crop((int(sw * 0.12), i * band_h + 2, int(sw * 0.88), (i + 1) * band_h - 2))
        bw, bh = band.size
        piping_hexes.append(avg_hex(band, (0, 0, bw, bh)))
    # Ensure indigo (featured, index 2 in stack? descriptions vary)
    # Stack top→bottom from description: charcoal, navy, indigo, teal, light-grey
    # Featured main is indigo — map index 2
    piping_hexes[2] = m3_indigo_hex
    piping_paths = []
    for i, name in enumerate(piping_names):
        if name == "indigo":
            piping_paths.append(m3_indigo)
        else:
            piping_paths.append(save(tint_body(m3_main, piping_hexes[i]), f"mandarin-piping-{name}.jpg"))

    report["colors"]["mandarin_piping"] = dict(zip(piping_names, piping_hexes))
    report["mandarin_piping_paths"] = piping_paths
    report["mandarin_piping_hexes"] = piping_hexes

    # ── Mandarin: soft tone (11.23.10) ───────────────────────────────
    m4 = Image.open(find("11.23.10_AM-67434d09"))
    m4_main = crop_left_panel(m4, 0.58)
    m4_sage = save(m4_main, "mandarin-soft-sage.jpg")
    w, h = m4_main.size
    m4_sage_hex = avg_hex(m4_main, (int(w * 0.40), int(h * 0.42), int(w * 0.58), int(h * 0.58)))

    mw, mh = m4.size
    stack4 = m4.crop((int(mw * 0.60), int(mh * 0.55), int(mw * 0.98), int(mh * 0.82)))
    sw, sh = stack4.size
    soft_names = ["lavender", "sky", "teal", "sage"]
    band_h = max(sh // 4, 1)
    soft_hexes = []
    for i in range(4):
        band = stack4.crop((int(sw * 0.12), i * band_h + 2, int(sw * 0.88), (i + 1) * band_h - 2))
        bw, bh = band.size
        soft_hexes.append(avg_hex(band, (0, 0, bw, bh)))
    soft_hexes[3] = m4_sage_hex
    soft_paths = []
    for i, name in enumerate(soft_names):
        if name == "sage":
            soft_paths.append(m4_sage)
        else:
            soft_paths.append(save(tint_body(m4_main, soft_hexes[i]), f"mandarin-soft-{name}.jpg"))

    report["colors"]["mandarin_soft"] = dict(zip(soft_names, soft_hexes))
    report["mandarin_soft_paths"] = soft_paths
    report["mandarin_soft_hexes"] = soft_hexes

    # Also keep navy+beige comparison for reference (optional hero)
    side = Image.open(find("10.48.02_AM__1_-0af07fb4"))
    save(side, "ringer-navy-beige-pair.jpg")

    (OUT / "manifest.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


def hex_to_rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def tint_body(im: Image.Image, target_hex: str) -> Image.Image:
    """Recolor dark/mid body fabric toward target while preserving light trim & logo."""
    src = im.convert("RGBA")
    tr, tg, tb = hex_to_rgb(target_hex)
    pixels = src.load()
    w, h = src.size
    out = Image.new("RGBA", (w, h))
    op = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            lum = (r + g + b) / 3
            # Keep near-white (trim, logo, hanger highlights) and background greys lightly
            if lum > 200:
                op[x, y] = (r, g, b, a)
                continue
            # Preserve wood hanger (brownish)
            if r > g + 15 and r > b + 15 and lum < 160:
                op[x, y] = (r, g, b, a)
                continue
            # Background medium grey: leave if low chroma and mid lum
            chroma = max(r, g, b) - min(r, g, b)
            if chroma < 18 and 90 < lum < 190:
                op[x, y] = (r, g, b, a)
                continue
            # Blend fabric toward target, keep shading via luminance
            shade = lum / 255.0
            # Slightly boost midtones so colors read clearly
            factor = 0.55 + 0.9 * shade
            nr = min(255, int(tr * factor))
            ng = min(255, int(tg * factor))
            nb = min(255, int(tb * factor))
            # Mix with original for texture
            mix = 0.72
            nr = int(nr * mix + r * (1 - mix))
            ng = int(ng * mix + g * (1 - mix))
            nb = int(nb * mix + b * (1 - mix))
            op[x, y] = (nr, ng, nb, a)
    return out.convert("RGB")


if __name__ == "__main__":
    main()
