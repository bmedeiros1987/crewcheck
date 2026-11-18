#!/usr/bin/env python3
"""Prefer the existing HTTPS Ubuntu archive and keep other Ubuntu fallbacks.

Only transforms the mirror list supplied as an argument; does not invoke APT,
change package verification, or write system files. The workflow installs the
validated result into its ephemeral runner before Playwright installs OS deps.
"""
import re
import sys
from pathlib import Path


def prefer_ubuntu_archive(content: str) -> str:
    result = []
    archive_present = False
    for line in content.splitlines(keepends=True):
        fields = line.split()
        if not fields or fields[0].startswith('#'):
            result.append(line)
            continue
        uri, *metadata = fields
        if uri.rstrip('/') in {'http://azure.archive.ubuntu.com/ubuntu', 'https://azure.archive.ubuntu.com/ubuntu'}:
            continue
        if uri.rstrip('/') == 'https://archive.ubuntu.com/ubuntu':
            # APT randomizes equal priorities. Its metadata separator is a tab.
            archive_present = True
            attributes = ['priority:0', *(value for value in metadata if not value.startswith('priority:'))]
            ending = line[len(line.rstrip('\r\n')):]
            result.append(uri + '\t' + ' '.join(attributes) + ending)
        elif '\t' in line:
            # Keep already eligible fallback mirrors and their metadata. Only a
            # competing zero rank would tie with the preferred archive.
            target, separator, attributes = line.partition('\t')
            attributes = re.sub(r'(?<!\S)priority:0+(?!\S)', 'priority:1', attributes)
            result.append(target + separator + attributes)
        else:
            result.append(line)
    if not archive_present:
        raise ValueError('Expected HTTPS Ubuntu archive fallback is missing; mirror list unchanged.')
    return ''.join(result)


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('Usage: prefer-ubuntu-archive.py MIRROR_LIST')
    sys.stdout.write(prefer_ubuntu_archive(Path(sys.argv[1]).read_text(encoding='utf-8')))
