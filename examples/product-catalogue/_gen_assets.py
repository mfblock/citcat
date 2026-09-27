#!/usr/bin/env python3
"""Generate the product-catalogue example's image assets.

Committed as generated rather than as photographs so the example stays small
and anyone can reproduce it. Each product gets a flat plate in its own hue with
its initials, which is enough to prove the ImagePath binding resolves to a
different file per row.

    python3 examples/product-catalogue/_gen_assets.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
OUT = HERE / "images"

# file name -> (initials, plate colour)
PRODUCTS = {
    "x500.png": ("X5", (96, 106, 128)),
    "ecospin.png": ("ES", (86, 134, 118)),
    "turbopress.png": ("T8", (74, 104, 150)),
    "quickdry.png": ("QD", (92, 92, 104)),
    "foldmaster.png": ("FM", (140, 126, 106)),
}

SIZE = (480, 360)


def plate(initials, rgb):
    img = Image.new("RGB", SIZE, rgb)
    d = ImageDraw.Draw(img)

    # a lighter band, so a blur or desaturate filter has an edge to act on
    d.rectangle([0, SIZE[1] - 90, SIZE[0], SIZE[1]],
                fill=tuple(min(255, c + 26) for c in rgb))
    d.rectangle([18, 18, SIZE[0] - 18, SIZE[1] - 18], outline=(255, 255, 255), width=3)

    # initials, centred, drawn large via the default bitmap font scaled up
    tmp = Image.new("RGB", (60, 30), rgb)
    ImageDraw.Draw(tmp).text((6, 8), initials, fill=(255, 255, 255))
    tmp = tmp.resize((300, 150), Image.NEAREST)
    img.paste(tmp, ((SIZE[0] - 300) // 2, (SIZE[1] - 150) // 2 - 20))
    return img


def main():
    OUT.mkdir(exist_ok=True)
    for name, (initials, rgb) in PRODUCTS.items():
        plate(initials, rgb).save(OUT / name, optimize=True)
        print(f"  {name}")
    total = sum(f.stat().st_size for f in OUT.glob("*.png"))
    print(f"wrote {len(PRODUCTS)} images to {OUT} ({total / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
