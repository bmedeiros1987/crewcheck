"""Build-time APK audit; release is strictly resource-only, debug permits only AGP R classes."""
import argparse
import hashlib
import json
import os
import re
import struct
import subprocess
import zipfile
from pathlib import Path
from xml.etree import ElementTree


def dex_classes(data):
    assert data[:4] == b'dex\n' and len(data) >= 112, 'Unexpected DEX header'
    u32 = lambda offset: struct.unpack_from('<I', data, offset)[0]
    strings_offset, types_offset = u32(60), u32(68)
    count, offset = u32(96), u32(100)
    result = []
    for index in range(count):
        type_index = u32(offset + 32 * index)
        string_index = u32(types_offset + 4 * type_index)
        start = u32(strings_offset + 4 * string_index)
        while data[start] & 128:
            start += 1
        start += 1
        result.append(data[start:data.index(b'\x00', start)].decode('utf-8'))
    return result


def verify(apk_path, out, debug=False):
    out.mkdir(parents=True, exist_ok=True)
    sdk = os.environ.get('ANDROID_HOME') or os.environ['ANDROID_SDK_ROOT']
    aapt2 = Path(sdk) / 'build-tools/35.0.0/aapt2'

    def dump(*args):
        return subprocess.check_output([str(aapt2), 'dump', *args, str(apk_path)], text=True)

    table = dump('resources')
    (out / 'resources.txt').write_text(table)
    manifest = dump('xmltree', '--file', 'AndroidManifest.xml')
    (out / 'manifest.txt').write_text(manifest)
    assert re.search(r'android:hasCode[^\n]*(?:false|0x0(?:\s|$))', manifest), 'Face must declare hasCode=false'

    def resource(kind, name):
        pattern = r'(?m)^\s*resource\s+(0x[0-9a-fA-F]+)\s+(?:[^\s:]+:)?' + re.escape(kind + '/' + name) + r'(?=\s|$)'
        match = re.search(pattern, table)
        assert match, 'Missing compiled resource ' + kind + '/' + name
        tail = table[match.end():]
        next_resource = re.search(r'(?m)^\s*resource\s+0x', tail)
        block = tail[:next_resource.start()] if next_resource else tail
        file_match = re.search(r'(?:\(file\)\s+)?(res/[^\s\"\)]+)', block)
        assert file_match, 'Missing file for ' + name
        return match.group(1), file_match.group(1)

    previews = {}
    with zipfile.ZipFile(apk_path) as apk:
        names = apk.namelist()
        executable = [n for n in names if n.endswith(('.dex', '.class', '.java', '.so'))]
        generated_classes = [name for entry in names if entry.endswith('.dex') for name in dex_classes(apk.read(entry))]
        (out / 'code-inventory.json').write_text(json.dumps({'files': executable, 'classes': generated_classes}, indent=2))
        print('Executable inventory:', executable, generated_classes)
        if debug:
            # AGP can include generated resource-id holders in the unminified debug
            # APK. This is not a distribution artifact and never proves WFF compliance.
            assert all(n.endswith('.dex') for n in executable), 'Non-DEX executable file in debug face'
            assert all(re.fullmatch(r'Lcom/crewcheck/face/R(?:\$[A-Za-z0-9_]+)?;', name) for name in generated_classes), 'Custom executable class in debug face'
        else:
            assert not executable, 'Release WFF must contain zero executable files'
        _, info_path = resource('xml', 'watch_face_info')
        assert info_path in names
        info = dump('xmltree', '--file', info_path)
        (out / 'packaged-metadata.txt').write_text(info)
        assert 'Editable' in info and 'MultipleInstancesAllowed' in info
        _, face_path = resource('raw', 'watchface')
        face = ElementTree.fromstring(apk.read(face_path))
        options = face.find('UserConfigurations/ListConfiguration[@id="crewcheck_style"]')
        assert options is not None and options.attrib['defaultValue'] == '0'
        assert len(options) == 3
        for index, style in enumerate(('signature', 'flightdeck', 'minimal')):
            expected_icon = 'crewcheck_preview_' + style
            assert options[index].attrib['id'] == str(index)
            assert options[index].attrib['icon'] == expected_icon
            resource_id, file_path = resource('drawable', expected_icon)
            data = apk.read(file_path)
            assert data[:8] == b'\x89PNG\r\n\x1a\n'
            assert struct.unpack('>II', data[16:24]) == (360, 360)
            if style == 'signature':
                preview_block = re.search(r'(?s)E: Preview.*?(?=\n\s*E:|\Z)', info)
                assert preview_block and resource_id.lower() in preview_block.group().lower(), 'Picker must reference Signature drawable'
            previews[style] = {'resource_id': resource_id, 'path': file_path, 'sha256': hashlib.sha256(data).hexdigest()}
        assert len({v['sha256'] for v in previews.values()}) == 3, 'Distinct style previews required'
    report = {
        'artifact_kind': 'debug-resource-test-only' if debug else 'release',
        'apk_sha256': hashlib.sha256(apk_path.read_bytes()).hexdigest(),
        'executable_files': executable,
        'generated_debug_classes': generated_classes,
        'previews': previews,
    }
    (out / 'packaging.json').write_text(json.dumps(report, indent=2))
    print('PASS: compiled preview/editor references and three 360px PNGs;' + (' debug contains only generated R classes' if debug else ' release is strictly resource-only'))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('apk', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--debug', action='store_true', help='Development APK only; never use this mode for a release')
    args = parser.parse_args()
    verify(args.apk, args.output, args.debug)
