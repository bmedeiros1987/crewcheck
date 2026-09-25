"""Watch Face visual contracts only. Standard library; no Android or extra dependencies."""
from copy import deepcopy
from hashlib import sha256
from itertools import combinations
from math import hypot
from pathlib import Path
import struct
import xml.etree.ElementTree as ET
import zlib

FACE = Path('android-wrapper/watchface/src/main/res/raw/watchface.xml')
LOGO = Path('android-wrapper/watchface/src/main/res/drawable-nodpi/crewcheck_logo_neon.png')
PREFIX = 'com.crewcheck.app/com.crewcheck.watch.'
PROVIDERS = {
    1: ('primaryProvider', PREFIX + 'CrewCheckComplicationService'),
    2: ('primaryProvider', PREFIX + 'GateComplicationService'),
    3: ('primaryProvider', PREFIX + 'CrewLifeComplicationService'),
    4: ('primaryProvider', PREFIX + 'RoutineComplicationService'),
    5: ('defaultSystemProvider', 'WATCH_BATTERY'),
    6: ('defaultSystemProvider', 'STEP_COUNT'),
}


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


def validate(root):
    assert root.tag == 'WatchFace' and root.get('width') == root.get('height') == '450'
    scene = root.find('Scene')
    assert scene is not None and scene.get('backgroundColor') == '#FF000000'
    slots = scene.findall('ComplicationSlot')
    assert len(slots) == 6 and {int(s.get('slotId')) for s in slots} == set(PROVIDERS)
    for a, b in combinations(slots, 2):
        assert not overlaps(box(a), box(b)), 'complication slots overlap'
    for slot in slots:
        sid = int(slot.get('slotId'))
        expected_types = 'LONG_TEXT SHORT_TEXT EMPTY' if sid == 1 else 'SHORT_TEXT EMPTY'
        assert slot.get('supportedTypes') == expected_types, 'installed types changed'
        bound = slot.find('BoundingRoundBox')
        assert bound is not None and box(bound) == (0, 0, box(slot)[2], box(slot)[3])
        round_safe(box(slot), float(bound.get('outlinePadding', '0')))
        policy = slot.find('DefaultProviderPolicy')
        key, expected = PROVIDERS[sid]
        assert policy is not None and policy.get(key) == expected, 'installed provider changed'
        kind = 'LONG_TEXT' if sid == 1 else 'SHORT_TEXT'
        assert policy.get('primaryProviderType' if key == 'primaryProvider' else 'defaultSystemProviderType') == kind
        for complication in slot.findall('Complication'):
            texts = complication.findall('PartText')
            assert texts, 'missing complication content'
            for a, b in combinations(texts, 2):
                assert not overlaps(box(a), box(b)), 'title/value overlap'
            for part in texts:
                x, y, w, h = box(part)
                assert x >= 0 and y >= 0 and x + w <= box(slot)[2] and y + h <= box(slot)[3], 'text leaves slot'
                text = part.find('Text')
                assert text is not None and text.get('isAutoSize') == 'TRUE' and text.get('ellipsis') == 'TRUE'
                assert text.get('maxLines') in ('1', '2'), 'explicit line budget required'
                font = text.find('Font')
                assert font is not None and float(font.get('size')) >= 18, 'tiny label reintroduced'
                assert font.find('Template') is not None, 'live values must come from provider'
                expressions = [p.get('expression') for p in font.findall('.//Parameter')]
                assert expressions and all(e in ('[COMPLICATION.TITLE]', '[COMPLICATION.TEXT]') for e in expressions)
                if sid in (3, 4, 5, 6):
                    assert hidden_in_ambient(part), 'health/routine/battery/steps must clear in ambient'
    hero = next(s for s in slots if s.get('slotId') == '1')
    assert hero.find("Complication[@type='LONG_TEXT']/PartText[@y='30']/Text").get('maxLines') == '2'
    clock = scene.find('DigitalClock')
    assert clock is not None
    times = clock.findall('TimeText')
    assert len(times) == 3
    active, ambient, date = times
    assert active.get('format') == ambient.get('format') == 'hh:mm'
    assert active.get('hourFormat') == ambient.get('hourFormat') == 'SYNC_TO_DEVICE'
    assert active.get('alpha') == '255' and hidden_in_ambient(active)
    assert ambient.get('alpha') == '0'
    assert ambient.find('Variant').attrib == {'mode': 'AMBIENT', 'target': 'alpha', 'value': '255'}
    assert active.find('Font').get('size') == '88' and active.find('Font').get('weight') == 'BOLD'
    assert ambient.find('Font').get('size') == '80' and ambient.find('Font').get('weight') == 'THIN'
    assert date.get('format') == 'EEE dd MMM' and float(date.find('Font').get('size')) >= 20
    for t in times:
        round_safe(box(t))
        assert all(not overlaps(box(t), box(s)) for s in slots), 'clock/date collide with live data'
    assert not overlaps(box(active), box(date)), 'clock/date collision'
    images = scene.findall('PartImage')
    assert len(images) == 1 and images[0].find('Image').get('resource') == 'crewcheck_logo_neon'
    round_safe(box(images[0]))
    assert hidden_in_ambient(images[0])
    assert all(not overlaps(box(images[0]), box(s)) for s in slots)
    surfaces = scene.findall('PartDraw')
    assert len(surfaces) == 1 and box(surfaces[0]) == box(hero), 'one quiet operational surface only'
    assert hidden_in_ambient(surfaces[0])
    assert surfaces[0].find('RoundRectangle/Fill').get('color') == '#FF0C1726'
    assert not root.findall('.//SecondHand') and not root.findall('.//AnimatedImage'), 'no ticking decoration'


def validate_logo():
    data = LOGO.read_bytes()
    assert sha256(data).hexdigest() == 'b0394a5e1df898be1fbc2fc52b9e71e2d2a37c69ebeb6e8f689bffb39d351fdb', 'logo bytes changed'
    assert data[:8] == b'\x89PNG\r\n\x1a\n'
    offset, compressed, ended = 8, bytearray(), False
    while offset < len(data):
        n = struct.unpack('>I', data[offset:offset + 4])[0]
        kind = data[offset + 4:offset + 8]
        payload = data[offset + 8:offset + 8 + n]
        expected_crc = struct.unpack('>I', data[offset + 8 + n:offset + 12 + n])[0]
        assert zlib.crc32(kind + payload) & 0xffffffff == expected_crc, 'PNG chunk CRC mismatch'
        if kind == b'IHDR':
            assert struct.unpack('>IIBBBBB', payload) == (64, 64, 8, 3, 0, 0, 0)
        if kind == b'IDAT':
            compressed.extend(payload)
        offset += n + 12
        if kind == b'IEND':
            ended = True
            break
    assert ended and offset == len(data), 'PNG truncated or has trailing bytes'
    assert len(zlib.decompress(compressed)) == 64 * (1 + 64), 'invalid PNG pixel payload'


if __name__ == '__main__':
    root = ET.parse(FACE).getroot()
    validate(root)
    validate_logo()
    # Negative tests make sure the checks reject actual regressions, not just a fixture.
    mutations = [
        (".//ComplicationSlot[@slotId='3']", {'x': '48', 'y': '342'}),
        (".//ComplicationSlot[@slotId='2']", {'x': '229'}),
        ('.//ComplicationSlot//Font', {'size': '10'}),
        (".//ComplicationSlot[@slotId='3']//Variant", {'value': '255'}),
        (".//ComplicationSlot[@slotId='2']/DefaultProviderPolicy", {'primaryProvider': PREFIX + 'RoutineComplicationService'}),
        ('.//ComplicationSlot//PartText', {'width': '999'}),
        ('.//DigitalClock/TimeText/Variant', {'value': '255'}),
    ]
    for selector, attrs in mutations:
        changed = deepcopy(root)
        changed.find(selector).attrib.update(attrs)
        try:
            validate(changed)
        except AssertionError:
            continue
        raise AssertionError(f'mutation not caught: {selector} {attrs}')
    print('[watchface-premium-layout] PASS: XML, six providers, circular bounds, readable hierarchy, ambient privacy, PNG integrity; 7 negative cases')
