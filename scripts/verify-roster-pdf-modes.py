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
        assert 'Ver detalhes no anexo' in text
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
