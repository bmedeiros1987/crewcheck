"""WFF visual/geometry/privacy checks. Official XSD validation runs separately in CI."""
from copy import deepcopy
from hashlib import sha256
from itertools import combinations, product
from math import hypot
from pathlib import Path
import re
import struct
import xml.etree.ElementTree as ET
import zlib

RES = Path('android-wrapper/watchface/src/main/res')
FACE, LOGO = RES / 'raw/watchface.xml', RES / 'drawable-nodpi/crewcheck_logo_neon.png'
PREFIX = 'com.crewcheck.app/com.crewcheck.watch.'
PROVIDERS = {
    1: ('primaryProvider', PREFIX + 'CrewCheckComplicationService'),
    2: ('primaryProvider', PREFIX + 'GateComplicationService'),
    3: ('primaryProvider', PREFIX + 'CrewLifeComplicationService'),
    4: ('primaryProvider', PREFIX + 'RoutineComplicationService'),
    5: ('defaultSystemProvider', 'WATCH_BATTERY'),
    6: ('defaultSystemProvider', 'STEP_COUNT'),
}
CLOCKS = {'0': ('88', 'BOLD'), '1': ('84', 'BOLD'), '2': ('88', 'THIN')}
PALETTES = {'0': '#FF22D3EE #5522D3EE', '1': '#FFA78BFA #55A78BFA', '2': '#FFF472B6 #55F472B6'}
CALENDAR = ['[DAY_OF_WEEK_S]', '[DAY_Z]', '[MONTH_S]']


def box(node):
    return tuple(float(node.attrib[key]) for key in ('x', 'y', 'width', 'height'))


def overlaps(a, b):
    x, y, w, h = a
    u, v, p, q = b
    return x < u + p and u < x + w and y < v + q and v < y + h


def round_safe(bounds, padding=0):
    x, y, w, h = bounds
    assert w > 0 and h > 0, 'non-positive bounds'
    for u in (x - padding, x + w + padding):
        for v in (y - padding, y + h + padding):
            assert hypot(u - 225, v - 225) <= 213, f'outside circular safe area: {bounds}'


def hidden_in_ambient(node):
    return any(v.get('mode') == 'AMBIENT' and v.get('target') == 'alpha'
               and v.get('value') == '0' for v in node.findall('Variant'))


def luminance(color):
    channels = [int(color[i:i + 2], 16) / 255 for i in (3, 5, 7)]
    channels = [v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in channels]
    return sum(v * weight for v, weight in zip(channels, (.2126, .7152, .0722)))


def profile_children(option):
    assert len(option) == 1 and option[0].tag == 'Group', 'WFF ListOption requires one child'
    group = option[0]
    assert box(group) == (0, 0, 450, 450) and group.get('name'), 'group must not shift its children'
    assert not (set(group.attrib) - {'name', 'x', 'y', 'width', 'height'}), 'no hidden group transforms'
    assert all(n.tag in ('DigitalClock', 'PartDraw') for n in group)
    assert len(group.findall('DigitalClock')) == 1
    return list(group)


def validate_config(root, labels):
    cfg = root.find('UserConfigurations')
    assert cfg is not None and [n.tag for n in cfg] == ['ListConfiguration', 'ColorConfiguration']
    choice, palette = cfg
    assert choice.get('id') == 'crewcheck_style' and palette.get('id') == 'crewcheck_palette'
    assert choice.get('defaultValue') == palette.get('defaultValue') == '0'
    assert [n.get('id') for n in choice] == [n.get('id') for n in palette] == ['0', '1', '2']
    assert all(n.tag == 'ListOption' for n in choice)
    assert all(n.tag == 'ColorOption' for n in palette)
    assert {n.get('id'): n.get('colors') for n in palette} == PALETTES
    for n in root.iter():
        for attr in ('displayName', 'screenReaderText'):
            if attr in n.attrib:
                assert n.get(attr) in labels and labels[n.get(attr)], 'missing editor label'
    for n in [choice, *choice]:
        assert n.get('screenReaderText') == n.get('displayName'), 'editor accessibility missing'
    for n in palette:
        accent = n.get('colors').split()[0]
        for bg in ('#FF000000', '#FF0C1726', '#FF050E18'):
            assert (luminance(accent) + .05) / (luminance(bg) + .05) >= 4.5, 'accent text contrast'
    scene = root.find('Scene')
    refs = scene.findall('ListConfiguration')
    assert len(refs) == 1 and refs[0].get('id') == choice.get('id'), 'unbound style selector'
    assert [n.get('id') for n in refs[0]] == ['0', '1', '2']
    for option in refs[0]: profile_children(option)
    assert len(root.findall('.//ComplicationSlot')) == len(scene.findall('ComplicationSlot')) == 6
    assert not root.findall('.//Flavors') and not root.findall('.//Launch')
    assert not root.findall('.//SecondHand') and not root.findall('.//PartAnimatedImage')
    for n in root.iter():
        for value in n.attrib.values():
            if 'CONFIGURATION.' in value:
                assert value in ('[CONFIGURATION.crewcheck_palette.0]', '[CONFIGURATION.crewcheck_palette.1]'), 'unknown palette reference'


def resolve_profile(root, style, palette):
    """Flatten only an identity Group for geometry checks; not a WFF renderer."""
    selected = deepcopy(root)
    scene = selected.find('Scene')
    config = scene.find('ListConfiguration')
    option = config.find(f"ListOption[@id='{style}']")
    assert option is not None, 'unknown profile'
    children = profile_children(option)
    index = list(scene).index(config)
    scene.remove(config)
    for n in reversed(children): scene.insert(index, deepcopy(n))
    colors = PALETTES[palette].split()
    for n in selected.iter():
        for key, value in list(n.attrib.items()):
            match = re.fullmatch(r'\[CONFIGURATION\.crewcheck_palette\.([01])\]', value)
            if match: n.set(key, colors[int(match[1])])
    return selected


def validate(root, style='0'):
    assert root.tag == 'WatchFace' and root.get('width') == root.get('height') == '450'
    scene = root.find('Scene')
    assert scene is not None and scene.get('backgroundColor') == '#FF000000'
    slots = scene.findall('ComplicationSlot')
    assert len(slots) == 6 and {int(s.get('slotId')) for s in slots} == set(PROVIDERS)
    for a, b in combinations(slots, 2): assert not overlaps(box(a), box(b)), 'complication slots overlap'
    for slot in slots:
        sid = int(slot.get('slotId'))
        assert slot.get('supportedTypes') == ('LONG_TEXT SHORT_TEXT EMPTY' if sid == 1 else 'SHORT_TEXT EMPTY')
        bound = slot.find('BoundingRoundBox')
        assert bound is not None and box(bound) == (0, 0, box(slot)[2], box(slot)[3])
        round_safe(box(slot), float(bound.get('outlinePadding', '0')))
        key, expected = PROVIDERS[sid]
        policy = slot.find('DefaultProviderPolicy')
        assert policy is not None and policy.get(key) == expected, 'installed provider changed'
        assert policy.get('primaryProviderType' if key == 'primaryProvider' else 'defaultSystemProviderType') == ('LONG_TEXT' if sid == 1 else 'SHORT_TEXT')
        comps = slot.findall('Complication')
        assert [c.get('type') for c in comps] == (['LONG_TEXT', 'SHORT_TEXT'] if sid == 1 else ['SHORT_TEXT'])
        for comp in comps:
            texts = comp.findall('PartText')
            assert len(texts) == (1 if sid == 4 else 2), 'missing complication content'
            for a, b in combinations(texts, 2): assert not overlaps(box(a), box(b)), 'title/value overlap'
            for part in texts:
                x, y, w, h = box(part)
                assert x >= 0 and y >= 0 and x + w <= box(slot)[2] and y + h <= box(slot)[3], 'text leaves slot'
                text = part.find('Text')
                assert text is not None and text.get('isAutoSize') == 'TRUE' and text.get('ellipsis') == 'TRUE'
                assert text.get('maxLines') in ('1', '2')
                font = text.find('Font')
                assert font is not None and float(font.get('size')) >= 18, 'tiny label reintroduced'
                assert font.find('Template') is not None, 'provider values missing'
                expressions = [p.get('expression') for p in font.findall('.//Parameter')]
                assert expressions and all(e in ('[COMPLICATION.TITLE]', '[COMPLICATION.TEXT]') for e in expressions)
                if sid in (3, 4, 5, 6): assert hidden_in_ambient(part), 'health/routine/battery/steps must clear in ambient'
    hero = next(s for s in slots if s.get('slotId') == '1')
    assert hero.find("Complication[@type='LONG_TEXT']/PartText[@y='30']/Text").get('maxLines') == '2'
    clocks = scene.findall('DigitalClock')
    assert len(clocks) == 1, 'profiles must never stack their clocks'
    times = clocks[0].findall('TimeText')
    assert len(times) == 2, 'Calendar must not be TimeText'
    active, ambient = times
    for time in times:
        assert time.get('format') == 'hh:mm', 'TimeText formats time, never calendar'
        assert time.get('hourFormat') == 'SYNC_TO_DEVICE'
        assert [n.tag for n in time] == ['Variant', 'Font'], 'WFF sequence: Variant before Font'
    assert active.get('alpha') == '255' and hidden_in_ambient(active)
    assert ambient.get('alpha') == '0'
    assert ambient.find('Variant').attrib == {'mode': 'AMBIENT', 'target': 'alpha', 'value': '255'}
    assert (active.find('Font').get('size'), active.find('Font').get('weight')) == CLOCKS[style]
    assert ambient.find('Font').get('size') == '80' and ambient.find('Font').get('weight') == 'THIN'
    assert ambient.find('Font').get('color') == '#FFDDE3EC'
    dates = scene.findall('PartText')
    assert len(dates) == 1, 'One calendar shared by all profiles'
    date = dates[0]; font = date.find('Text/Font')
    assert font is not None and float(font.get('size')) >= 20
    assert [p.get('expression') for p in font.findall('Upper/Template/Parameter')] == CALENDAR
    assert not hidden_in_ambient(date), 'Calendar remains readable in AOD'
    for t in [*times, date]:
        round_safe(box(t))
        assert all(not overlaps(box(t), box(s)) for s in slots), 'clock/date collide with live data'
    assert not overlaps(box(active), box(date))
    images = scene.findall('PartImage')
    assert len(images) == 1 and images[0].find('Image').get('resource') == 'crewcheck_logo_neon'
    assert 'tintColor' not in images[0].attrib, 'do not recolor the original logo'
    round_safe(box(images[0])); assert hidden_in_ambient(images[0])
    assert all(not overlaps(box(images[0]), box(s)) for s in slots)
    surfaces = scene.findall('PartDraw')
    assert len(surfaces) == (0 if style == '2' else 1)
    for surface in surfaces:
        assert box(surface) == box(hero) and hidden_in_ambient(surface)
        rect = surface.find('RoundRectangle')
        assert rect.get('cornerRadiusX') == rect.get('cornerRadiusY') == ('26' if style == '0' else '14')
        assert rect.find('Fill').get('color') == ('#FF0C1726' if style == '0' else '#FF050E18')


def validate_logo():
    data = LOGO.read_bytes()
    assert sha256(data).hexdigest() == 'b0394a5e1df898be1fbc2fc52b9e71e2d2a37c69ebeb6e8f689bffb39d351fdb'
    assert data[:8] == b'\x89PNG\r\n\x1a\n'
    offset, compressed, ended = 8, bytearray(), False
    while offset < len(data):
        n = struct.unpack('>I', data[offset:offset + 4])[0]
        kind, payload = data[offset + 4:offset + 8], data[offset + 8:offset + 8 + n]
        crc = struct.unpack('>I', data[offset + 8 + n:offset + 12 + n])[0]
        assert zlib.crc32(kind + payload) & 0xffffffff == crc
        if kind == b'IHDR': assert struct.unpack('>IIBBBBB', payload) == (64, 64, 8, 3, 0, 0, 0)
        if kind == b'IDAT': compressed.extend(payload)
        offset += n + 12
        if kind == b'IEND': ended = True; break
    assert ended and offset == len(data)
    assert len(zlib.decompress(compressed)) == 64 * (1 + 64)


def run():
    root = ET.parse(FACE).getroot()
    labels = {n.get('name'): n.text for n in ET.parse(RES / 'values/strings.xml').getroot()}
    validate_config(root, labels); validate_logo()
    mutations = [
        (".//ComplicationSlot[@slotId='3']", {'x': '48', 'y': '342'}),
        (".//ComplicationSlot[@slotId='2']", {'x': '229'}),
        ('.//ComplicationSlot//Font', {'size': '10'}),
        (".//ComplicationSlot[@slotId='3']//Variant", {'value': '255'}),
        (".//ComplicationSlot[@slotId='2']/DefaultProviderPolicy", {'primaryProvider': PREFIX + 'RoutineComplicationService'}),
        ('.//ComplicationSlot//PartText', {'width': '999'}),
        ('.//DigitalClock/TimeText/Variant', {'value': '255'}),
        ('.//DigitalClock/TimeText', {'format': 'EEE dd MMM'}),
        ('Scene/PartText/Text/Font/Upper/Template/Parameter', {'expression': '[HOUR_0_23]'}),
    ]
    negative = 0
    for style, palette in product(CLOCKS, PALETTES):
        resolved = resolve_profile(root, style, palette); validate(resolved, style)
        for selector, attrs in mutations:
            changed = deepcopy(resolved); changed.find(selector).attrib.update(attrs)
            try: validate(changed, style)
            except AssertionError: negative += 1; continue
            raise AssertionError(f'mutation not caught: {selector}')
        changed = deepcopy(resolved); time = changed.find('.//DigitalClock/TimeText')
        variant = time.find('Variant'); time.remove(variant); time.append(variant)
        try: validate(changed, style)
        except AssertionError: negative += 1
        else: raise AssertionError('Variant-after-Font mutation not caught')
    for selector, attrs in [
        ('UserConfigurations/ListConfiguration', {'defaultValue': '99'}),
        ('UserConfigurations/ListConfiguration/ListOption', {'displayName': 'missing_label'}),
        ('Scene/ListConfiguration', {'id': 'missing_config'}),
        ('Scene/ListConfiguration/ListOption', {'id': '99'}),
        ('UserConfigurations/ColorConfiguration/ColorOption', {'colors': '#FF000001 #55000001'}),
        ('Scene/ListConfiguration/ListOption/Group', {'x': '1'}),
    ]:
        changed = deepcopy(root); changed.find(selector).attrib.update(attrs)
        try: validate_config(changed, labels)
        except AssertionError: negative += 1; continue
        raise AssertionError(f'configuration mutation not caught: {selector}')
    changed = deepcopy(root); option = changed.find('Scene/ListConfiguration/ListOption')
    group = option[0]; option.remove(group)
    for child in group: option.append(child)
    try: validate_config(changed, labels)
    except AssertionError: negative += 1
    else: raise AssertionError('multiple ListOption children not caught')
    print(f'[watchface-premium-layout] PASS: 9 combinations, calendar/order/groups, active/AOD, six stable slots, original logo; {negative} negative cases')


if __name__ == '__main__': run()
