"""Check the actual AAPT2-compiled inset fraction, with no Android device APIs."""
import json
import math
from pathlib import Path
import struct
import sys
import zipfile

archive = Path(sys.argv[1])
with zipfile.ZipFile(archive) as package:
    data = package.read('res/drawable/crewcheck_splash_icon.xml')
kind, header, length = struct.unpack_from('<HHI', data)
assert kind == 3 and length == len(data), 'Expected compiled Android XML'
fractions = []
offset = header
while offset < length:
    kind, header_size, size = struct.unpack_from('<HHI', data, offset)
    assert size >= header_size >= 8 and offset + size <= length
    if kind == 0x0102:  # RES_XML_START_ELEMENT_TYPE
        start, attr_size, count = struct.unpack_from('<HHH', data, offset + header_size + 8)
        for index in range(count):
            attr = offset + header_size + start + index * attr_size
            value_size, _, value_type, raw = struct.unpack_from('<HBBI', data, attr + 12)
            assert value_size == 8
            if value_type == 6:  # TypedValue.TYPE_FRACTION
                assert raw & 15 == 0, 'Expected a fraction of drawable bounds'
                mantissa = raw & 0xffffff00
                if mantissa & 0x80000000:
                    mantissa -= 1 << 32
                radix = [2 ** -8, 2 ** -15, 2 ** -23, 2 ** -31][(raw >> 4) & 3]
                fractions.append(mantissa * radix)
    offset += size
assert len(fractions) == 1
inset = fractions[0]
assert abs(inset - .27) < .00001, 'Compiled fraction differs from the reviewed inset'
assert math.sqrt(2) * (1 - 2 * inset) < 2 / 3, 'Compiled square exceeds the safe circle'
print(json.dumps({'status': 'PASS', 'compiledInsetFraction': inset,
                  'compiledInsetPercent': inset * 100,
                  'scope': 'Actual compiled drawable in release resource archive; no runtime/device acceptance'}))
