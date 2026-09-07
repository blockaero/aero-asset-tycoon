#!/usr/bin/env python3
"""
Process raw Gemini portrait downloads into shot-list assets.

Gemini wraps renders in a uniform mat border whose colour varies (pure white,
cream, off-grey). Rather than assume white, sample the actual corner colour and
trim rows/cols that are uniformly within tolerance of it.

Usage: python3 scripts/process-render.py <src> <shot-id> <w> <h>
"""

import sys
import os
import numpy as np
from PIL import Image

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GEN_DIR = os.path.join(REPO, "public", "assets", "gen")

TOLERANCE = 14   # per-channel deviation still counted as border
BUFFER = 3       # outward pixels kept to avoid clipping anti-aliased edges


def detect_content_box(arr, tolerance=TOLERANCE):
    """Bounding box of non-border content, using the corner colour as reference."""
    h, w = arr.shape[:2]
    # Average a small patch from each corner; use the median as border colour.
    patches = [
        arr[0:8, 0:8], arr[0:8, w - 8:w],
        arr[h - 8:h, 0:8], arr[h - 8:h, w - 8:w],
    ]
    corner_means = np.array([p.reshape(-1, 3).mean(axis=0) for p in patches])
    border_colour = np.median(corner_means, axis=0)

    deviation = np.abs(arr.astype(np.int16) - border_colour.astype(np.int16))
    is_content = np.any(deviation > tolerance, axis=2)

    rows = np.where(is_content.any(axis=1))[0]
    cols = np.where(is_content.any(axis=0))[0]
    if len(rows) == 0 or len(cols) == 0:
        raise ValueError("no content detected -- image may be uniform")
    return int(cols.min()), int(rows.min()), int(cols.max()), int(rows.max()), border_colour


def process(src, shot_id, target_w, target_h):
    im = Image.open(src).convert("RGB")
    arr = np.array(im)
    left, top, right, bottom, border_colour = detect_content_box(arr)

    left = max(0, left - BUFFER)
    top = max(0, top - BUFFER)
    right = min(arr.shape[1] - 1, right + BUFFER)
    bottom = min(arr.shape[0] - 1, bottom + BUFFER)

    width = right - left + 1
    height = bottom - top + 1
    target_aspect = target_w / target_h

    # Trim the longer dimension to hit the exact target aspect.
    wanted_h = round(width / target_aspect)
    if wanted_h <= height:
        trim = height - wanted_h
        # Favour trimming from the bottom so heads/hair stay intact.
        top += round(trim * 0.2)
        bottom = top + wanted_h - 1
    else:
        wanted_w = round(height * target_aspect)
        trim = width - wanted_w
        left += trim // 2
        right = left + wanted_w - 1

    crop = im.crop((left, top, right + 1, bottom + 1))
    final = crop.resize((target_w, target_h), Image.LANCZOS)
    out = os.path.join(GEN_DIR, f"{shot_id}.webp")
    final.save(out, "WEBP", quality=82)

    size_kb = os.path.getsize(out) / 1024
    print(f"{shot_id:24s} src {im.size[0]}x{im.size[1]}  "
          f"border rgb({int(border_colour[0])},{int(border_colour[1])},{int(border_colour[2])})  "
          f"crop {crop.size[0]}x{crop.size[1]} (ar {crop.size[0]/crop.size[1]:.4f})  "
          f"-> {target_w}x{target_h}  {size_kb:.0f} KB")


if __name__ == "__main__":
    if len(sys.argv) != 5:
        print(__doc__)
        sys.exit(1)
    process(sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]))
