"""Open the actual synthetic output, validate content/geometry and render it."""
import json
import sys
from pathlib import Path
import fitz

root = Path(sys.argv[1] if len(sys.argv) > 1 else 'artifacts/pdf-modes')
results = []
for mode in ['regular', 'fridge']:
    doc = fitz.open(root / f'{mode}.pdf')
    assert len(doc) > 0
    text = '\n'.join(page.get_text() for page in doc)
    assert 'PESSOA SINTETICA' in text
    assert 'PRIVATE RAW MUST NOT EXPORT' not in text
    assert 'THIRD PARTY NAME MUST NOT EXPORT' not in text
    if mode == 'fridge':
        assert doc[0].rect.width > doc[0].rect.height
        assert '10/2032' in text and 'VC' in text and 'Sem registro' not in text
        assert 'voo(s) no anexo' in text
        assert 'QA9900 · OP ·' in text and 'QA9901 · PS ·' in text
        assert 'QA9902 · Função não informada ·' in text
        assert 'QA9903 · Função a confirmar (OP informado) ·' in text
        assert 'APZ 05:00' in text and 'Fim 21:00' in text
        for n in range(12):
            assert f'QA{9900+n}' in text, f'flight lost: {n}'
        assert len(doc) >= 2, 'overflow must remain in a readable appendix'
    else:
        assert doc[0].rect.height > doc[0].rect.width
    for index, page in enumerate(doc):
        for block in page.get_text('dict')['blocks']:
            for line in block.get('lines', []):
                for span in line['spans']:
                    x0, y0, x1, y1 = span['bbox']
                    assert 0 <= x0 < x1 <= page.rect.width + 1
                    assert 0 <= y0 < y1 <= page.rect.height + 1
        page.get_pixmap(matrix=fitz.Matrix(1, 1)).save(root / f'{mode}-page-{index+1}.png')
    results.append({'mode': mode, 'pages': len(doc), 'opened': True, 'rendered': True, 'contentAndBounds': True})
dense = fitz.open(root / 'dense.pdf')
first = dense[0].get_text()
assert first.count('QA7001') == 31 and first.count('QA7002') == 31, 'ordinary two-leg days must show both flights on the monthly page'
for code in ['QA7001', 'QA7002']:
    assert code in '\n'.join(p.get_text() for p in dense[1:]), 'full leg clocks remain in the appendix'
dense[0].get_pixmap().save(root / 'dense-page-1.png')
standby = '\n'.join(p.get_text() for p in fitz.open(root / 'standby.pdf'))
assert 'Início 22:00' in standby and 'APZ 22:00' not in standby and 'Fim 02:00 (+1)' in standby
estimated = '\n'.join(p.get_text() for p in fitz.open(root / 'estimated.pdf'))
assert 'Início não confirmado' in estimated and 'Fim não confirmado' in estimated
assert '22:00' not in estimated and '02:00' not in estimated
long_name = fitz.open(root / 'long-name.pdf')
import re
assert ('NOMESINTETICO' * 15) in re.sub(r'\s+', '', long_name[0].get_text()), 'complete long name must survive wrapping'
for file in ['dense.pdf', 'standby.pdf', 'estimated.pdf', 'long-name.pdf']:
    for page in fitz.open(root / file):
        for block in page.get_text('dict')['blocks']:
            for line in block.get('lines', []):
                for span in line['spans']:
                    x0, y0, x1, y1 = span['bbox']
                    assert 0 <= x0 < x1 <= page.rect.width + 1, file
                    assert 0 <= y0 < y1 <= page.rect.height + 1, file
long_name[0].get_pixmap().save(root / 'long-name-page-1.png')
results.append({'denseCalendarFlights': 62, 'standbyLabels': True, 'estimatedClockWithheld': True, 'unsupportedUnicodeRejected': 'checked by browser'})
(root / 'pdf-results.json').write_text(json.dumps(results, indent=2))
print(json.dumps(results))

for count in [4, 6]:
    doc = fitz.open(root / f'six-weeks-{count}.pdf')
    first = doc[0].get_text()
    full = '\n'.join(p.get_text() for p in doc)
    assert 'MARIA D’AVILA – TESTE' in first, 'WinAnsi typography must survive exactly'
    assert 'SIM – A320' in first
    import re
    shown = sum(first.count(f'QA{7001+n}') for n in range(count))
    omitted = sum(int(n) for n in re.findall(r'\+(\d+) voo\(s\) no anexo', first))
    assert shown + omitted == 31 * count, (count, shown, omitted)
    assert omitted > 0
    assert 'não representam status ao vivo' in first
    for n in range(count): assert full.count(f'QA{7001+n}') >= 31
    for page in doc:
        for word in page.get_text('words'):
            assert 0 <= word[0] < word[2] <= page.rect.width + 1
            assert 0 <= word[1] < word[3] <= page.rect.height + 1
    doc[0].get_pixmap().save(root / f'six-weeks-{count}.png')
print('PASS 6-week 4/6-leg omission accounting, complete appendix, exact WinAnsi typography and live-status disclaimer')

doc = fitz.open(root / 'long-leg-nfd.pdf')
first = doc[0].get_text()
assert 'JOÃO SINTETICO' in first, 'NFD input must produce canonically equivalent composed glyphs'
assert 'QA1' in first and 'QA2' in first and 'QA4' not in first
assert '+2 voo(s) no anexo' in first, 'after truncation keep a prefix, not a later leg out of order'
assert 'QA4' in '\n'.join(p.get_text() for p in doc[1:])
for page in doc:
    footer=[w for w in page.get_text('words') if w[1] > 550]
    assert all(w[3] <= page.rect.height-18 for w in footer), 'footer must leave printable bottom margin'
print('PASS ordered overflow, NFC equivalence and safer footer geometry')

for file in ['fridge.pdf','dense.pdf','six-weeks-4.pdf','six-weeks-6.pdf','long-leg-nfd.pdf']:
    for page in fitz.open(root / file):
        lines=[line for block in page.get_text('dict')['blocks'] for line in block.get('lines',[])]
        footer=[line for line in lines if any(span['text'].startswith('CrewCheck · ') for span in line['spans'])]
        assert len(footer)==1
        footer_top=footer[0]['bbox'][1]
        content=[line for line in lines if line['bbox'][1] < footer_top-0.1]
        assert all(line['bbox'][3] <= footer_top-2 for line in content), (file,page.number,'content/footer collision')
print('PASS calendar and multi-page appendix content/footer separation')
