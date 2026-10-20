"""Rasterise packaging/linux/rrd-analyzer.svg into the bitmaps each platform needs.

The SVG stays the single source of truth for the mark: it is what the .deb installs into the
hicolor theme. None of the three places that draw the icon can take it, though. GTK wants a
pixbuf for the window icon, the Windows resource compiler wants an .ico, and the browser tab
wants a favicon, so the same geometry is drawn here for all of them. Run `make icon` after
changing the SVG.

The mark is the three-column one at every size. Four columns held more of the shape of a chart
but closed up into a smear by 24 pixels, which is the size a taskbar and a browser tab actually
draw, so the icon read as a blue square exactly where it had to be recognised.
"""

import io
import os
import struct
from PIL import Image, ImageDraw

REPOSITORY_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
WINDOW_ICON = os.path.join(REPOSITORY_ROOT, "packages", "daemon", "cmd", "rrd-analyzer", "desktop", "appicon.png")
EXECUTABLE_ICON = os.path.join(REPOSITORY_ROOT, "packaging", "windows", "rrd-analyzer.ico")
FAVICON = os.path.join(REPOSITORY_ROOT, "packages", "web", "public", "favicon.ico")

GRID = 128
SUPERSAMPLE = 8
CORNER_RADIUS = 28
TILE_TOP = (0x0A, 0x7B, 0xB0)
TILE_BASE = (0x00, 0x4A, 0x72)
TILE_FROM = (0.329 * GRID, 0.0)
TILE_TO = (0.671 * GRID, float(GRID))
COLUMN_INK = "#FFFFFA"
PEAK_INK = "#FFD200"

COLUMNS = [
    (20, 62, 22, 40, 9, COLUMN_INK),
    (53, 26, 22, 76, 9, PEAK_INK),
    (86, 47, 22, 55, 9, COLUMN_INK),
]

WINDOW_ICON_SIZE = 256
EXECUTABLE_ICON_SIZES = [16, 24, 32, 48, 64, 128, 256]
FAVICON_SIZES = [16, 24, 32, 48]


def gradient_tile(size):
    origin_x, origin_y = TILE_FROM
    span_x, span_y = TILE_TO[0] - origin_x, TILE_TO[1] - origin_y
    squared_span = span_x * span_x + span_y * span_y
    step = GRID / size
    ramp = [
        bytes(round(top + (base - top) * level / 255) for top, base in zip(TILE_TOP, TILE_BASE))
        for level in range(256)
    ]

    pixels = bytearray()
    for row in range(size):
        grid_y = (row + 0.5) * step
        along_y = (grid_y - origin_y) * span_y
        for column in range(size):
            grid_x = (column + 0.5) * step
            fraction = ((grid_x - origin_x) * span_x + along_y) / squared_span
            pixels += ramp[min(255, max(0, round(fraction * 255)))]

    return Image.frombytes("RGB", (size, size), bytes(pixels)).convert("RGBA")


def rounded_columns(canvas, columns, scale):
    pen = ImageDraw.Draw(canvas)
    for left, top, width, height, radius, ink in columns:
        pen.rounded_rectangle(
            [left * scale, top * scale, (left + width) * scale - 1, (top + height) * scale - 1],
            radius=radius * scale,
            fill=ink,
        )


def render_mark(columns):
    side = GRID * SUPERSAMPLE
    tile = gradient_tile(side)

    corners = Image.new("L", (side, side), 0)
    ImageDraw.Draw(corners).rounded_rectangle([0, 0, side - 1, side - 1], radius=CORNER_RADIUS * SUPERSAMPLE, fill=255)
    tile.putalpha(corners)

    rounded_columns(tile, columns, SUPERSAMPLE)

    return tile


def frames_by_size(sizes, mark):
    return {size: mark.resize((size, size), Image.LANCZOS) for size in sizes}


def write_icon(path, frames):
    encoded = []
    for size in sorted(frames):
        blob = io.BytesIO()
        frames[size].save(blob, "PNG")
        encoded.append((size, blob.getvalue()))

    offset = 6 + 16 * len(encoded)
    directory = b""
    for size, blob in encoded:
        directory += struct.pack("<BBBBHHII", size % 256, size % 256, 0, 0, 1, 32, len(blob), offset)
        offset += len(blob)

    with open(path, "wb") as handle:
        handle.write(struct.pack("<HHH", 0, 1, len(encoded)) + directory + b"".join(blob for _, blob in encoded))


def render():
    mark = render_mark(COLUMNS)

    mark.resize((WINDOW_ICON_SIZE, WINDOW_ICON_SIZE), Image.LANCZOS).save(WINDOW_ICON, "PNG")
    write_icon(EXECUTABLE_ICON, frames_by_size(EXECUTABLE_ICON_SIZES, mark))
    write_icon(FAVICON, frames_by_size(FAVICON_SIZES, mark))

    for written in (WINDOW_ICON, EXECUTABLE_ICON, FAVICON):
        print(f"wrote {os.path.relpath(written, REPOSITORY_ROOT)}")


render()
