#!/usr/bin/env python3
"""Gera laurinha.ico (tema Cerejinha) sem dependencias externas.

Uso: python3 tools/make_icon.py laurinha.ico

O desenho e feito em RGBA puro com supersampling 4x e gravado como
entradas BMP (16/24/32/48/64) mais uma entrada PNG de 256 px, que e o
formato aceito pelo Explorer do Windows Vista em diante.
"""
import math
import struct
import sys
import zlib

SS = 4  # fator de supersampling

# Paleta Cerejinha
BG_TOP = (0xFF, 0xFB, 0xFC)
BG_BOTTOM = (0xF6, 0xE7, 0xEB)
CHERRY = (0x9E, 0x2A, 0x40)
CHERRY_LIGHT = (0xC2, 0x45, 0x5E)
LEAF = (0x4C, 0x6B, 0x4F)
STEM = (0x6B, 0x4A, 0x3A)


def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def draw(size):
    """Desenha o icone em RGBA no tamanho pedido, com supersampling."""
    w = size * SS
    buf = bytearray(w * w * 4)

    r_corner = w * 0.22
    for y in range(w):
        row = lerp(BG_TOP, BG_BOTTOM, y / max(1, w - 1))
        for x in range(w):
            # cantos arredondados do "tile"
            dx = min(x, w - 1 - x)
            dy = min(y, w - 1 - y)
            inside = True
            if dx < r_corner and dy < r_corner:
                ddx = r_corner - dx
                ddy = r_corner - dy
                inside = (ddx * ddx + ddy * ddy) <= r_corner * r_corner
            if inside:
                o = (y * w + x) * 4
                buf[o] = row[0]
                buf[o + 1] = row[1]
                buf[o + 2] = row[2]
                buf[o + 3] = 255

    def disc(cx, cy, rad, color):
        x0 = max(0, int(cx - rad) - 1)
        x1 = min(w, int(cx + rad) + 2)
        y0 = max(0, int(cy - rad) - 1)
        y1 = min(w, int(cy + rad) + 2)
        r2 = rad * rad
        for y in range(y0, y1):
            for x in range(x0, x1):
                dx = x + 0.5 - cx
                dy = y + 0.5 - cy
                if dx * dx + dy * dy <= r2:
                    o = (y * w + x) * 4
                    if buf[o + 3] == 0:
                        continue
                    buf[o] = color[0]
                    buf[o + 1] = color[1]
                    buf[o + 2] = color[2]

    def stroke(pts, width, color):
        half = width / 2.0
        for i in range(len(pts) - 1):
            ax, ay = pts[i]
            bx, by = pts[i + 1]
            steps = max(2, int(math.hypot(bx - ax, by - ay)))
            for s in range(steps + 1):
                t = s / steps
                disc(ax + (bx - ax) * t, ay + (by - ay) * t, half, color)

    # duas cerejas com brilho, caule e folha
    c = w / 2.0
    rad = w * 0.17
    left = (c - w * 0.145, c + w * 0.175)
    right = (c + w * 0.155, c + w * 0.135)
    top = (c + w * 0.02, c - w * 0.30)

    stroke([left, (c - w * 0.09, c - w * 0.09), top], w * 0.05, STEM)
    stroke([right, (c + w * 0.10, c - w * 0.10), top], w * 0.05, STEM)
    stroke([top, (c + w * 0.20, c - w * 0.32), (c + w * 0.30, c - w * 0.19)],
           w * 0.085, LEAF)

    disc(left[0], left[1], rad, CHERRY)
    disc(right[0], right[1], rad * 0.92, CHERRY)
    disc(left[0] - rad * 0.30, left[1] - rad * 0.34, rad * 0.26, CHERRY_LIGHT)
    disc(right[0] - rad * 0.28, right[1] - rad * 0.32, rad * 0.22, CHERRY_LIGHT)

    # downsample box filter -> RGBA final
    out = bytearray(size * size * 4)
    area = SS * SS
    for y in range(size):
        for x in range(size):
            r = g = b = a = 0
            for j in range(SS):
                base = ((y * SS + j) * w + x * SS) * 4
                for i in range(SS):
                    o = base + i * 4
                    al = buf[o + 3]
                    r += buf[o] * al
                    g += buf[o + 1] * al
                    b += buf[o + 2] * al
                    a += al
            o = (y * size + x) * 4
            if a:
                out[o] = min(255, r // a)
                out[o + 1] = min(255, g // a)
                out[o + 2] = min(255, b // a)
            out[o + 3] = a // area
    return out


def to_png(rgba, size):
    raw = bytearray()
    stride = size * 4
    for y in range(size):
        raw.append(0)
        raw += rgba[y * stride:(y + 1) * stride]

    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data +
                struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    return (b"\x89PNG\r\n\x1a\n" +
            chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)) +
            chunk(b"IDAT", zlib.compress(bytes(raw), 9)) +
            chunk(b"IEND", b""))


def to_bmp(rgba, size):
    """BITMAPINFOHEADER 32bpp bottom-up + mascara AND (zerada)."""
    header = struct.pack("<IiiHHIIiiII", 40, size, size * 2, 1, 32, 0,
                         size * size * 4, 0, 0, 0, 0)
    body = bytearray()
    for y in range(size - 1, -1, -1):
        for x in range(size):
            o = (y * size + x) * 4
            body += bytes((rgba[o + 2], rgba[o + 1], rgba[o], rgba[o + 3]))
    mask_stride = ((size + 31) // 32) * 4
    return header + bytes(body) + bytes(mask_stride * size)


def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else "laurinha.ico"
    sizes = [16, 24, 32, 48, 64, 128, 256]
    entries = []
    for size in sizes:
        rgba = draw(size)
        entries.append((size, to_png(rgba, size) if size >= 128
                        else to_bmp(rgba, size)))

    offset = 6 + 16 * len(entries)
    header = struct.pack("<HHH", 0, 1, len(entries))
    dir_bytes = b""
    for size, payload in entries:
        dim = 0 if size >= 256 else size
        dir_bytes += struct.pack("<BBBBHHII", dim, dim, 0, 0, 1, 32,
                                 len(payload), offset)
        offset += len(payload)

    with open(out_path, "wb") as fh:
        fh.write(header + dir_bytes + b"".join(p for _, p in entries))
    print("gravado %s (%d entradas)" % (out_path, len(entries)))


if __name__ == "__main__":
    main()
