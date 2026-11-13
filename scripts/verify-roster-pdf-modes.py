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
(root / 'pdf-results.json').write_text(json.dumps(results, indent=2))
print(json.dumps(results))
