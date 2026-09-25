"""Renderiza o mostrador WFF do CrewCheck em SVG — prévia do seletor e checagem visual.

Cobre o subconjunto que o watchface.xml usa: PartDraw com RoundRectangle/Ellipse
(Fill/Stroke), PartText com texto fixo ou Template, Upper, TimeText (PREVIEW_TIME),
ComplicationSlot com dados de exemplo por slotId e Variant AMBIENT de alpha. Não substitui o
renderizador do Wear OS: serve para gerar a miniatura e para ver a geometria.

Uso (a partir da raiz do repositório):

    python3 scripts/watchface/render_preview.py \
        android-wrapper/watchface/src/main/res/raw/watchface.xml active /tmp/face.svg [clip]

    # PNG 450x450 para res/drawable-nodpi/preview.png (Chromium headless shell):
    headless_shell --no-sandbox --hide-scrollbars --window-size=450,450 \
        --default-background-color=000000ff --screenshot=preview.png file:///tmp/face.svg

"ambient" no lugar de "active" aplica as Variants de ambiente. "clip" desenha a borda física
da tela redonda tracejada, para ver o que a moldura corta.
"""
import sys, re, html
import xml.etree.ElementTree as ET

src, mode, out = sys.argv[1], sys.argv[2], sys.argv[3]
ambient = mode == "ambient"
show_clip = len(sys.argv) > 4 and sys.argv[4] == "clip"

SAMPLE = {
    1: {"type": "LONG_TEXT", "TITLE": "APRESENTAÇÃO", "TEXT": "05:40 · GRU"},
    2: {"type": "SHORT_TEXT", "TITLE": "", "TEXT": "B12"},
    3: {"type": "SHORT_TEXT", "TITLE": "CrewLife", "TEXT": "82%"},
    4: {"type": "SHORT_TEXT", "TITLE": "Rotina", "TEXT": "7h sono"},
    5: {"type": "SHORT_TEXT", "TITLE": "", "TEXT": "86%"},
    6: {"type": "SHORT_TEXT", "TITLE": "Passos", "TEXT": "6.214"},
}
DATA = {"DAY_OF_WEEK_S": "sex", "DAY_Z": "25", "MONTH_S": "set"}
WEIGHT = {"THIN": 100, "ULTRA_LIGHT": 200, "EXTRA_LIGHT": 200, "LIGHT": 300, "NORMAL": 400,
          "MEDIUM": 500, "SEMI_BOLD": 600, "BOLD": 700, "ULTRA_BOLD": 800, "EXTRA_BOLD": 800,
          "BLACK": 900, "EXTRA_BLACK": 900}

root = ET.parse(src).getroot()
W, H = int(root.get("width")), int(root.get("height"))
preview = next(m.get("value") for m in root.iter("Metadata") if m.get("key") == "PREVIEW_TIME")
hh, mm = preview.split(":")[:2]

def argb(c):
    c = c.lstrip("#")
    if len(c) == 6: c = "FF" + c
    a, rgb = int(c[:2], 16) / 255, "#" + c[2:]
    return rgb, a

def alpha_of(el):
    a = float(el.get("alpha", 255))
    if ambient:
        for v in el.findall("Variant"):
            if v.get("mode") == "AMBIENT" and v.get("target") == "alpha":
                a = float(v.get("value"))
    return a / 255

def text_of(font, comp):
    parts = []
    def walk(node, upper=False):
        if node.tag == "Template":
            fmt = (node.text or "")
            vals = []
            for p in node.findall("Parameter"):
                expr = p.get("expression").strip("[]")
                if expr.startswith("COMPLICATION."):
                    vals.append(comp.get(expr.split(".", 1)[1], "") if comp else "")
                else:
                    vals.append(DATA.get(expr, "?"))
            s = fmt.replace("%s", "{}").format(*vals)
            parts.append(s.upper() if upper else s)
            return
        if node.tag == "Upper":
            for ch in node: walk(ch, True)
            return
    if font.text and font.text.strip(): parts.append(font.text.strip())
    for ch in font: walk(ch)
    return "".join(parts)

out_el = []
def emit_text(x, y, w, h, font, content, align, a):
    if a <= 0 or not content: return
    rgb, fa = argb(font.get("color", "#FFFFFFFF"))
    size = float(font.get("size"))
    anchor = {"CENTER": "middle", "START": "start", "END": "end"}.get(align, "middle")
    tx = x + w / 2 if anchor == "middle" else (x if anchor == "start" else x + w)
    ty = y + h / 2
    out_el.append(
        f'<text x="{tx}" y="{ty}" font-family="Roboto, \'Google Sans\', Inter, Helvetica, Arial, sans-serif" '
        f'font-size="{size}" font-weight="{WEIGHT.get(font.get("weight","NORMAL"),400)}" fill="{rgb}" '
        f'fill-opacity="{fa*a:.3f}" text-anchor="{anchor}" dominant-baseline="central" '
        f'style="font-variant-numeric: tabular-nums">{html.escape(content)}</text>')

def draw(el, ox, oy, comp=None, parent_a=1.0):
    tag = el.tag
    if tag == "PartDraw":
        a = alpha_of(el) * parent_a
        x, y = ox + float(el.get("x")), oy + float(el.get("y"))
        for shape in el:
            if shape.tag not in ("RoundRectangle", "Ellipse"): continue
            sx, sy = x + float(shape.get("x")), y + float(shape.get("y"))
            sw, sh = float(shape.get("width")), float(shape.get("height"))
            fill = shape.find("Fill"); stroke = shape.find("Stroke")
            fa = ""
            if fill is not None:
                rgb, fo = argb(fill.get("color")); fa = f'fill="{rgb}" fill-opacity="{fo*a:.3f}"'
            else: fa = 'fill="none"'
            st = ""
            if stroke is not None:
                rgb, so = argb(stroke.get("color"))
                st = f' stroke="{rgb}" stroke-opacity="{so*a:.3f}" stroke-width="{stroke.get("thickness")}"'
            if a <= 0: continue
            if shape.tag == "RoundRectangle":
                out_el.append(f'<rect x="{sx}" y="{sy}" width="{sw}" height="{sh}" rx="{shape.get("cornerRadiusX")}" ry="{shape.get("cornerRadiusY")}" {fa}{st}/>')
            else:
                out_el.append(f'<ellipse cx="{sx+sw/2}" cy="{sy+sh/2}" rx="{sw/2}" ry="{sh/2}" {fa}{st}/>')
    elif tag == "PartText":
        a = alpha_of(el) * parent_a
        x, y = ox + float(el.get("x")), oy + float(el.get("y"))
        t = el.find("Text"); font = t.find("Font")
        emit_text(x, y, float(el.get("width")), float(el.get("height")), font, text_of(font, comp), t.get("align", "CENTER"), a)
    elif tag == "DigitalClock":
        for tt in el.findall("TimeText"):
            a = alpha_of(tt)
            font = tt.find("Font")
            emit_text(float(tt.get("x")), float(tt.get("y")), float(tt.get("width")), float(tt.get("height")),
                      font, f"{hh}:{mm}", tt.get("align", "CENTER"), a)
    elif tag == "ComplicationSlot":
        sid = int(el.get("slotId")); data = SAMPLE.get(sid)
        x, y = float(el.get("x")), float(el.get("y"))
        for c in el.findall("Complication"):
            if data and c.get("type") == data["type"]:
                for ch in c: draw(ch, x, y, data)

for el in root.find("Scene"): draw(el, 0, 0)

clip = ""
if show_clip:
    clip = f'<circle cx="{W/2}" cy="{H/2}" r="{W/2-0.5}" fill="none" stroke="#FF3B30" stroke-width="1" stroke-dasharray="4 4"/>'
svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">'
       f'<defs><clipPath id="face"><circle cx="{W/2}" cy="{H/2}" r="{W/2}"/></clipPath></defs>'
       f'<rect width="{W}" height="{H}" fill="#000"/>'
       f'<g clip-path="url(#face)">{"".join(out_el)}</g>{clip}</svg>')
open(out, "w").write(svg)
print("wrote", out, len(out_el), "elements")
