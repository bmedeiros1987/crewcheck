#!/usr/bin/env python3
"""Exclude the degraded Azure APT mirror while retaining signed Ubuntu archives.

Only transforms the mirror list supplied as an argument; does not invoke APT,
change package verification, or write system files. The workflow installs the
validated result into its ephemeral runner before Playwright installs OS deps.
"""
import re
import sys
from pathlib import Path


def prefer_ubuntu_archive(content: str) -> str:
    lines = content.splitlines(keepends=True)
    result = ''.join(line for line in lines if not re.match(
        r'^\s*https?://azure\.archive\.ubuntu\.com/ubuntu/?(?:\s|$)', line))
    if not any(re.match(r'^\s*https://archive\.ubuntu\.com/ubuntu/?(?:\s|$)', line)
               for line in result.splitlines()):
        raise ValueError('Expected HTTPS Ubuntu archive fallback is missing; mirror list unchanged.')
    return result


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('Usage: prefer-ubuntu-archive.py MIRROR_LIST')
    sys.stdout.write(prefer_ubuntu_archive(Path(sys.argv[1]).read_text(encoding='utf-8')))
