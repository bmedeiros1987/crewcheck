"""CrewWatch WFF geometry/privacy checks for the Higgsfield-derived style system.

The official Google WFF v1 XSD is validated independently in CI. This regression adds
CrewCheck-specific contracts: stable complication providers, round-safe geometry, AOD
privacy, original logo fidelity, and the independent style + clock-mode selectors.
"""
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
FACE = RES / 'raw/watchface.xml'
LOGO = RES / 'drawable-nodpi/crewcheck_logo_neon.png'
PREFIX = 'com.crewcheck.app/com.crewcheck.watch.'

PROVIDERS = {
    1: ('primaryProvider', PREFIX + 'CrewCheckComplicationService'),
    2: ('primaryProvider', PREFIX + 'GateComplicationService'),
    3: ('primaryProvider', PREFIX + 'CrewLifeComplicationService'),
    4: ('primaryProvider', PREFIX + 'RoutineComplicationService'),
    5: ('defaultSystemProvider', 'WATCH_BATTERY'),
    6: ('defaultSystemProvider', 'STEP_COUNT'),
}
STYLES = {'0': 'masculine', '1': 'elegance', '2': 'balanced'}
MODES = {'0': ('44', 'BOLD'), '1': ('88', 'BOLD')}
PALETTES = {
    '0': '#FF22D3EE #5522D3EE',
    '1': '#FFA78BFA #55A78BFA',
    '2': '#FFF472B6 #55F472B6',
}
CALENDAR = ['[DAY_OF_WEEK_S]', '[DAY_Z]', '[MONTH_S]']

CAPTION_RULES = {
    1: [('CREWCHECK', 'AGORA'), ('CrewCheck', 'AGORA')],
    3: [('CREWLIFE', 'CrewLife')],
    4: [('ROTINA', 'Rotina')],
    5: [('Battery', 'BATERIA'), ('BATTERY', 'BATERIA')],
    6: [('Steps', 'PASSOS'), ('STEPS', 'PASSOS'),
        ('Step count', 'PASSOS'), ('Step Count', 'PASSOS')],
}


def display_expression(sid, field):
    import json
    ref = '[COMPLICATION.' + field + ']'
    rules = CAPTION_RULES.get(sid, []) if field == 'TITLE' else [('--', '—')]
    if field == 'TEXT' and sid == 1:
        rules = [('SEM ATIVIDADE', 'Sem atividade'), *rules]
    result = ref
    for before, after in reversed(rules):
        result = f'{ref} == {json.dumps(before, ensure_ascii=False)} ? {json.dumps(after, ensure_ascii=False)} : {result}'
    return result


def resolve_display(expression, title, value):
    rule = re.compile(r'^\[COMPLICATION\.(TITLE|TEXT)\] == "([^"\\]*)" \? "([^"\\]*)" : (.+)$')
    source, matched, selected = None, False, None
    remaining = expression
    while match := rule.fullmatch(remaining):
        field, before, after, remaining = match.groups()
        assert source in (None, field), 'mixed source fields'
        source = field
        current = title if field == 'TITLE' else value
        if not matched and current == before:
            selected, matched = after, True
    assert remaining in ('[COMPLICATION.TITLE]', '[COMPLICATION.TEXT]'), 'non-source fallback'
    field = remaining[14:-1]
    assert source in (None, field), 'fallback source changed'
    return selected if matched else (title if field == 'TITLE' else value)


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
    return any(
        v.get('mode') == 'AMBIENT'
        and v.get('target') == 'alpha'
        and v.get('value') == '0'
        for v in node.findall('Variant')
    )


def luminance(color):
    channels = [int(color[i:i + 2], 16) / 255 for i in (3, 5, 7)]
    channels = [v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in channels]
    return sum(v * weight for v, weight in zip(channels, (.2126, .7152, .0722)))


def config(root, config_id):
    found = [
        n for n in root.find('UserConfigurations')
        if n.tag == 'ListConfiguration' and n.get('id') == config_id
    ]
    assert len(found) == 1, f'missing/duplicate config {config_id}'
    return found[0]


def profile_group(option, allowed):
    assert len(option) == 1 and option[0].tag == 'Group', 'WFF ListOption requires one Group'
    group = option[0]
    assert box(group) == (0, 0, 450, 450), 'configuration Group must keep canvas coordinates'
    assert group.get('name'), 'configuration Group must be named'
    assert set(group.attrib) <= {'name', 'x', 'y', 'width', 'height'}
    assert all(n.tag in allowed for n in group), 'unsupported profile child'
    return group


def validate_config(root, labels):
    cfg = root.find('UserConfigurations')
    assert cfg is not None
    assert [n.tag for n in cfg] == ['ListConfiguration', 'ListConfiguration', 'ColorConfiguration']

    styles = config(root, 'crewcheck_style')
    modes = config(root, 'crewcheck_mode')
    palette = next(n for n in cfg if n.tag == 'ColorConfiguration')

    assert styles.get('defaultValue') == '0'
    assert modes.get('defaultValue') == '1', 'digital mode is the safe/default fast-glance face'
    assert palette.get('id') == 'crewcheck_palette' and palette.get('defaultValue') == '0'

    assert [n.get('id') for n in styles] == ['0', '1', '2']
    assert [n.get('icon') for n in styles] == [
        'crewcheck_preview_masculine',
        'crewcheck_preview_elegance',
        'crewcheck_preview_balanced',
    ]
    assert [n.get('id') for n in modes] == ['0', '1']
    assert [n.get('icon') for n in modes] == [
        'crewcheck_preview_hybrid',
        'crewcheck_preview_digital',
    ]
    assert [n.get('id') for n in palette] == ['0', '1', '2']
    assert {n.get('id'): n.get('colors') for n in palette} == PALETTES

    for n in root.iter():
        for attr in ('displayName', 'screenReaderText'):
            if attr in n.attrib:
                assert n.get(attr) in labels and labels[n.get(attr)], 'missing editor label'
    for selector in (styles, modes):
        assert selector.get('screenReaderText') == selector.get('displayName')
        for option in selector:
            assert option.get('screenReaderText') == option.get('displayName')

    for n in palette:
        accent = n.get('colors').split()[0]
        for bg in ('#FF000000', '#FF0C1726', '#FF050E18', '#DD07111F'):
            assert (luminance(accent) + .05) / (luminance(bg) + .05) >= 4.5

    for option in styles:
        group = profile_group(option, {'PartDraw'})
        assert len(group.findall('PartDraw')) >= 1
    for option in modes:
        group = profile_group(option, {'AnalogClock', 'DigitalClock', 'PartDraw'})
        assert len(group.findall('DigitalClock')) == 1
        if option.get('id') == '0':
            assert len(group.findall('AnalogClock')) == 1
        else:
            assert not group.findall('AnalogClock')

    scene = root.find('Scene')
    refs = scene.findall('ListConfiguration')
    assert [n.get('id') for n in refs] == ['crewcheck_style', 'crewcheck_mode']
    assert [n.get('id') for n in refs[0]] == ['0', '1', '2']
    assert [n.get('id') for n in refs[1]] == ['0', '1']
    assert len(root.findall('.//ComplicationSlot')) == len(scene.findall('ComplicationSlot')) == 6
    assert not root.findall('.//Flavors') and not root.findall('.//Launch')
    assert not root.findall('.//PartAnimatedImage')

    second = modes.find("ListOption[@id='0']/Group/AnalogClock/SecondHand")
    assert second is not None and hidden_in_ambient(second)
    sweep = second.find('Sweep')
    assert sweep is not None and sweep.get('frequency') == '15'

    for n in root.iter():
        for value in n.attrib.values():
            if 'CONFIGURATION.' in value:
                assert value in (
                    '[CONFIGURATION.crewcheck_palette.0]',
                    '[CONFIGURATION.crewcheck_palette.1]',
                ), 'unknown palette reference'


def resolve_profile(root, style, mode, palette):
    """Flatten the two identity Groups for deterministic geometry checks."""
    selected = deepcopy(root)
    scene = selected.find('Scene')
    for config_id, option_id in (('crewcheck_style', style), ('crewcheck_mode', mode)):
        selector = scene.find(f"ListConfiguration[@id='{config_id}']")
        assert selector is not None
        option = selector.find(f"ListOption[@id='{option_id}']")
        assert option is not None
        group = option[0]
        index = list(scene).index(selector)
        scene.remove(selector)
        for node in reversed(list(group)):
            scene.insert(index, deepcopy(node))

    colors = PALETTES[palette].split()
    for n in selected.iter():
        for key, value in list(n.attrib.items()):
            match = re.fullmatch(r'\[CONFIGURATION\.crewcheck_palette\.([01])\]', value)
            if match:
                n.set(key, colors[int(match.group(1))])
    return selected


def validate_physical_polish(root):
    date = root.find('Scene/PartText')
    loc = date.find('Localization')
    assert loc is not None and loc.attrib == {'locales': 'pt_BR'}
    assert date.find('Text/Font/Upper/Template').text == '%s · %s %s'

    battery = root.find("Scene/ComplicationSlot[@slotId='5']/Complication")
    condition = battery.find('Condition')
    assert condition is not None and [n.tag for n in condition] == ['Expressions', 'Compare']
    expr = condition.find('Expressions/Expression')
    assert expr is not None and expr.get('name') == 'battery_title_missing'
    assert expr.text == 'textLength([COMPLICATION.TITLE]) == 0'
    compare = condition.find('Compare')
    assert compare.get('expression') == expr.get('name') and len(compare) == 1
    icon = compare.find('Group/PartImage')
    assert icon is not None and icon.find('Image').get('resource') == '[COMPLICATION.MONOCHROMATIC_IMAGE]'
    assert hidden_in_ambient(icon)
    assert len(root.findall('.//Condition')) == 1

    assert root.find(
        "Scene/ComplicationSlot[@slotId='3']/Complication/PartText[@y='24']/Text/Font"
    ).get('color') == '#FFB7C7D9'

    for slot in root.findall('Scene/ComplicationSlot'):
        sid = int(slot.get('slotId'))
        for comp in slot.findall('Complication'):
            parts = comp.findall('PartText')
            for i, part in enumerate(parts):
                font = part.find('Text/Font')
                fields = ('TITLE', 'TEXT') if sid == 4 else (('TITLE',) if i == 0 else ('TEXT',))
                assert [n.get('expression') for n in font.findall('Template/Parameter')] == [
                    display_expression(sid, f) for f in fields
                ]
                if i == 0 or sid == 4:
                    assert font.get('weight') == 'NORMAL'

    checks = [
        (6, 'TITLE', 'Steps', '9332', 'PASSOS'),
        (6, 'TITLE', 'Weather', '22°', 'Weather'),
        (6, 'TITLE', '', '0', ''),
        (5, 'TITLE', '', '79%', ''),
        (5, 'TITLE', 'Battery', '79%', 'BATERIA'),
        (5, 'TITLE', 'Sono', '7h', 'Sono'),
        (1, 'TITLE', 'CREWCHECK', 'SEM ATIVIDADE', 'AGORA'),
        (1, 'TEXT', 'CREWCHECK', 'SEM ATIVIDADE', 'Sem atividade'),
        (3, 'TEXT', 'CrewLife', '--', '—'),
        (3, 'TEXT', 'CrewLife', '', ''),
        (3, 'TEXT', 'CrewLife', '0', '0'),
        (6, 'TEXT', 'Steps', '9,332', '9,332'),
        (6, 'TEXT', 'Passos', '9.332', '9.332'),
        (1, 'TEXT', 'Escala', 'Dados antigos', 'Dados antigos'),
        (1, 'TEXT', 'Portão', 'REMOTA', 'REMOTA'),
    ]
    for sid, field, title, value, expected in checks:
        assert resolve_display(display_expression(sid, field), title, value) == expected


def validate_hybrid(scene):
    analog = scene.findall('AnalogClock')
    assert len(analog) == 1
    clock = analog[0]
    hands = list(clock)
    assert [n.tag for n in hands] == ['HourHand', 'MinuteHand', 'SecondHand']
    expected = {
        'HourHand': ('crewcheck_hour_hand', (163, 135, 10, 27)),
        'MinuteHand': ('crewcheck_minute_hand', (165, 123, 6, 39)),
        'SecondHand': ('crewcheck_second_hand', (167, 123, 2, 39)),
    }
    centers = []
    for hand in hands:
        resource, bounds = expected[hand.tag]
        assert hand.get('resource') == resource
        assert box(hand) == bounds
        assert hidden_in_ambient(hand)
        x, y, w, h = bounds
        px = float(hand.get('pivotX')) * w
        py = float(hand.get('pivotY')) * h
        centers.append((round(x + px, 1), round(y + py, 1)))
        assert 0 <= float(hand.get('pivotX')) <= 1
        assert 0 <= float(hand.get('pivotY')) <= 1
    assert max(x for x, _ in centers) - min(x for x, _ in centers) <= .2
    assert max(y for _, y in centers) - min(y for _, y in centers) <= .2
    assert 167.9 <= centers[0][0] <= 168.1 and 159.8 <= centers[0][1] <= 160.2

    # The full analog sweep stays inside x=129..207 / y=121..199, clear of:
    # top live slots ending at y=114, date beginning at y=210, digital clock x>=214.
    sweep_box = (129, 121, 78, 78)
    for slot in scene.findall('ComplicationSlot'):
        assert not overlaps(sweep_box, box(slot)), 'hybrid hands can cover live complication data'
    date = scene.find('PartText')
    assert not overlaps(sweep_box, box(date))
    active = scene.find('DigitalClock/TimeText')
    assert not overlaps(sweep_box, box(active)), 'hybrid hands can cover digital time'

    second = clock.find('SecondHand')
    assert second.find('Sweep') is not None and second.find('Sweep').get('frequency') == '15'


def validate(root, style='0', mode='1'):
    assert root.tag == 'WatchFace' and root.get('width') == root.get('height') == '450'
    scene = root.find('Scene')
    assert scene is not None and scene.get('backgroundColor') == '#FF000000'
    validate_physical_polish(root)

    slots = scene.findall('ComplicationSlot')
    assert len(slots) == 6 and {int(s.get('slotId')) for s in slots} == set(PROVIDERS)
    for a, b in combinations(slots, 2):
        assert not overlaps(box(a), box(b)), 'complication slots overlap'

    for slot in slots:
        sid = int(slot.get('slotId'))
        assert slot.get('supportedTypes') == (
            'LONG_TEXT SHORT_TEXT EMPTY' if sid == 1 else 'SHORT_TEXT EMPTY'
        )
        bound = slot.find('BoundingRoundBox')
        assert bound is not None and box(bound) == (0, 0, box(slot)[2], box(slot)[3])
        round_safe(box(slot), float(bound.get('outlinePadding', '0')))
        key, expected = PROVIDERS[sid]
        policy = slot.find('DefaultProviderPolicy')
        assert policy is not None and policy.get(key) == expected, 'installed provider changed'
        provider_type = 'primaryProviderType' if key == 'primaryProvider' else 'defaultSystemProviderType'
        assert policy.get(provider_type) == ('LONG_TEXT' if sid == 1 else 'SHORT_TEXT')

        comps = slot.findall('Complication')
        assert [c.get('type') for c in comps] == (
            ['LONG_TEXT', 'SHORT_TEXT'] if sid == 1 else ['SHORT_TEXT']
        )
        for comp in comps:
            texts = comp.findall('PartText')
            assert len(texts) == (1 if sid == 4 else 2)
            for a, b in combinations(texts, 2):
                assert not overlaps(box(a), box(b)), 'title/value overlap'
            for part in texts:
                x, y, w, h = box(part)
                assert x >= 0 and y >= 0 and x + w <= box(slot)[2] and y + h <= box(slot)[3]
                text = part.find('Text')
                assert text is not None and text.get('ellipsis') == 'TRUE'
                assert set(text.attrib) <= {'align', 'ellipsis', 'maxLines'}
                assert text.get('maxLines') in ('1', '2')
                font = text.find('Font')
                assert font is not None and float(font.get('size')) >= 18
                expressions = [p.get('expression') for p in font.findall('.//Parameter')]
                assert expressions
                assert all(e in (
                    display_expression(sid, 'TITLE'),
                    display_expression(sid, 'TEXT'),
                ) for e in expressions)
                if sid in (3, 4, 5, 6):
                    assert hidden_in_ambient(part)

    hero = next(s for s in slots if s.get('slotId') == '1')
    assert hero.find("Complication[@type='LONG_TEXT']/PartText[@y='30']/Text").get('maxLines') == '2'

    clocks = scene.findall('DigitalClock')
    assert len(clocks) == 1
    times = clocks[0].findall('TimeText')
    assert len(times) == 2
    active, ambient = times
    for time in times:
        assert time.get('format') == 'hh:mm'
        assert time.get('hourFormat') == 'SYNC_TO_DEVICE'
        assert [n.tag for n in time] == ['Variant', 'Font']
    assert active.get('alpha') == '255' and hidden_in_ambient(active)
    assert ambient.get('alpha') == '0'
    assert ambient.find('Variant').attrib == {
        'mode': 'AMBIENT', 'target': 'alpha', 'value': '255'
    }
    assert (active.find('Font').get('size'), active.find('Font').get('weight')) == MODES[mode]
    assert ambient.find('Font').get('size') == '80'
    assert ambient.find('Font').get('weight') == 'THIN'
    assert ambient.find('Font').get('color') == '#FFDDE3EC'
    if mode == '0':
        assert box(active) == (214, 135, 145, 52)
        validate_hybrid(scene)
    else:
        assert box(active) == (52, 118, 346, 90)
        assert not scene.findall('AnalogClock')

    date = scene.find('PartText')
    assert date is not None
    font = date.find('Text/Font')
    assert float(font.get('size')) >= 20
    assert [p.get('expression') for p in font.findall('Upper/Template/Parameter')] == CALENDAR
    assert not hidden_in_ambient(date)

    for t in [*times, date]:
        round_safe(box(t))
        assert all(not overlaps(box(t), box(s)) for s in slots)
    assert not overlaps(box(active), box(date))

    images = scene.findall('PartImage')
    assert len(images) == 1
    assert images[0].find('Image').get('resource') == 'crewcheck_logo_neon'
    assert 'tintColor' not in images[0].attrib
    round_safe(box(images[0]))
    assert hidden_in_ambient(images[0])
    assert all(not overlaps(box(images[0]), box(s)) for s in slots)

    surfaces = scene.findall('PartDraw')
    assert surfaces, 'style surface missing'
    for surface in surfaces:
        round_safe(box(surface))
        assert hidden_in_ambient(surface), 'decorative surface must disappear in AOD'
        if box(surface) != box(hero):
            assert all(not overlaps(box(surface), box(s)) for s in slots)

    hero_surfaces = [s for s in surfaces if box(s) == box(hero)]
    assert len(hero_surfaces) == 1
    rect = hero_surfaces[0].find('RoundRectangle')
    radius = {'0': '14', '1': '28', '2': '22'}[style]
    fill = {'0': '#FF050E18', '1': '#FF0C1726', '2': '#DD07111F'}[style]
    assert rect.get('cornerRadiusX') == rect.get('cornerRadiusY') == radius
    assert rect.find('Fill').get('color') == fill


def validate_logo():
    data = LOGO.read_bytes()
    assert sha256(data).hexdigest() == 'b0394a5e1df898be1fbc2fc52b9e71e2d2a37c69ebeb6e8f689bffb39d351fdb'
    assert data[:8] == b'\x89PNG\r\n\x1a\n'
    offset, compressed, ended = 8, bytearray(), False
    while offset < len(data):
        n = struct.unpack('>I', data[offset:offset + 4])[0]
        kind = data[offset + 4:offset + 8]
        payload = data[offset + 8:offset + 8 + n]
        crc = struct.unpack('>I', data[offset + 8 + n:offset + 12 + n])[0]
        assert zlib.crc32(kind + payload) & 0xffffffff == crc
        if kind == b'IHDR':
            assert struct.unpack('>IIBBBBB', payload) == (64, 64, 8, 3, 0, 0, 0)
        if kind == b'IDAT':
            compressed.extend(payload)
        offset += n + 12
        if kind == b'IEND':
            ended = True
            break
    assert ended and offset == len(data)
    assert len(zlib.decompress(compressed)) == 64 * (1 + 64)


def run():
    root = ET.parse(FACE).getroot()
    labels = {n.get('name'): n.text for n in ET.parse(RES / 'values/strings.xml').getroot()}
    validate_config(root, labels)
    validate_logo()

    mutations = [
        (".//ComplicationSlot[@slotId='3']", {'x': '48', 'y': '342'}),
        (".//ComplicationSlot[@slotId='2']", {'x': '229'}),
        ('.//ComplicationSlot//Font', {'size': '10'}),
        (".//ComplicationSlot[@slotId='3']//Variant", {'value': '255'}),
        (".//ComplicationSlot[@slotId='2']/DefaultProviderPolicy",
         {'primaryProvider': PREFIX + 'RoutineComplicationService'}),
        ('.//ComplicationSlot//PartText', {'width': '999'}),
        ('.//DigitalClock/TimeText/Variant', {'value': '255'}),
        ('.//DigitalClock/TimeText', {'format': 'EEE dd MMM'}),
        ('Scene/PartText/Text/Font/Upper/Template/Parameter', {'expression': '[HOUR_0_23]'}),
        ('.//ComplicationSlot//Text', {'isAutoSize': 'TRUE'}),
        ('Scene/PartText/Localization', {'locales': 'en_US'}),
        ('Scene/PartText/Localization', {'timeZone': 'America/Sao_Paulo'}),
        (".//ComplicationSlot[@slotId='5']//Compare", {'expression': 'wrong_condition'}),
        (".//ComplicationSlot[@slotId='5']//Image", {'resource': 'fabricated_battery'}),
        (".//ComplicationSlot[@slotId='5']//PartImage/Variant", {'value': '255'}),
        (".//ComplicationSlot[@slotId='6']//Parameter", {'expression': '"PASSOS"'}),
        (".//ComplicationSlot[@slotId='3']//Parameter", {'expression': '"Conectado"'}),
    ]

    negative = 0
    for style, mode, palette in product(STYLES, MODES, PALETTES):
        resolved = resolve_profile(root, style, mode, palette)
        validate(resolved, style, mode)
        for selector, attrs in mutations:
            changed = deepcopy(resolved)
            target = changed.find(selector)
            assert target is not None, selector
            target.attrib.update(attrs)
            try:
                validate(changed, style, mode)
            except AssertionError:
                negative += 1
                continue
            raise AssertionError(f'mutation not caught: {selector}')

        changed = deepcopy(resolved)
        time = changed.find('.//DigitalClock/TimeText')
        variant = time.find('Variant')
        time.remove(variant)
        time.append(variant)
        try:
            validate(changed, style, mode)
        except AssertionError:
            negative += 1
        else:
            raise AssertionError('Variant-after-Font mutation not caught')

        if mode == '0':
            changed = deepcopy(resolved)
            changed.find('.//SecondHand/Variant').set('value', '255')
            try:
                validate(changed, style, mode)
            except AssertionError:
                negative += 1
            else:
                raise AssertionError('ambient second hand mutation not caught')

    config_mutations = [
        ("UserConfigurations/ListConfiguration[@id='crewcheck_style']", {'defaultValue': '99'}),
        ("UserConfigurations/ListConfiguration[@id='crewcheck_mode']", {'defaultValue': '99'}),
        ("UserConfigurations/ListConfiguration[@id='crewcheck_style']/ListOption", {'displayName': 'missing_label'}),
        ("UserConfigurations/ListConfiguration[@id='crewcheck_mode']/ListOption", {'displayName': 'missing_label'}),
        ("Scene/ListConfiguration[@id='crewcheck_style']", {'id': 'missing_config'}),
        ("Scene/ListConfiguration[@id='crewcheck_mode']", {'id': 'missing_config'}),
        ('UserConfigurations/ColorConfiguration/ColorOption', {'colors': '#FF000001 #55000001'}),
        ("Scene/ListConfiguration[@id='crewcheck_style']/ListOption/Group", {'x': '1'}),
        ("Scene/ListConfiguration[@id='crewcheck_mode']/ListOption/Group", {'x': '1'}),
    ]
    for selector, attrs in config_mutations:
        changed = deepcopy(root)
        target = changed.find(selector)
        assert target is not None, selector
        target.attrib.update(attrs)
        try:
            validate_config(changed, labels)
        except AssertionError:
            negative += 1
            continue
        raise AssertionError(f'configuration mutation not caught: {selector}')

    changed = deepcopy(root)
    option = changed.find("Scene/ListConfiguration[@id='crewcheck_style']/ListOption")
    group = option[0]
    option.remove(group)
    for child in group:
        option.append(child)
    try:
        validate_config(changed, labels)
    except AssertionError:
        negative += 1
    else:
        raise AssertionError('multiple ListOption children not caught')

    print(
        '[watchface-premium-layout] PASS: '
        '18 style/mode/palette combinations, hybrid hand clearance, WFF v1 text/calendar/groups, '
        'active/AOD privacy, six stable providers, original logo, 15 data-preservation cases; '
        f'{negative} negative cases'
    )


if __name__ == '__main__':
    run()
