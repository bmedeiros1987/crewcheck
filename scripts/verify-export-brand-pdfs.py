import argparse, hashlib, io, json
from pathlib import Path
import fitz
from PIL import Image
p=argparse.ArgumentParser();p.add_argument('directory');p.add_argument('--baseline');args=p.parse_args();root=Path(args.directory)
source=Image.open('client/public/assets/brand/crewcheck-app-icon-2026.png').convert('RGB')
results=[]
for name in ['roster','premium','medical']:
 loaded=fitz.open(root/f'{name}-loaded.pdf');blocked=fitz.open(root/f'{name}-blocked.pdf')
 stalled=fitz.open(root/f'{name}-stalled.pdf');reader=fitz.open(root/f'{name}-reader-stalled.pdf')
 assert len(loaded)==len(blocked)==len(stalled)
 texts=[]
 for index,page in enumerate(loaded):
  assert page.rect.width>590 and page.rect.height>840
  assert page.get_images(),(name,index,'missing logo')
  for item in page.get_images():
   image=Image.open(io.BytesIO(loaded.extract_image(item[0])['image'])).convert('RGB')
   assert image.size==(512,512) and image.tobytes()==source.tobytes(),(name,index,'approved pixels changed')
   for rect in page.get_image_rects(item[0]):
    assert page.rect.contains(rect),(name,index,'clipped logo')
    assert abs(rect.width-rect.height)<.02,(name,index,'distorted logo')
    assert not any(rect.intersects(fitz.Rect(word[:4])) for word in page.get_text('words') if word[4].strip()),(name,index,'logo overlaps text')
    assert rect.x0>=11 and rect.y0>=10 and rect.x1<=page.rect.width-10 and rect.y1<=page.rect.height-10
  assert not blocked[index].get_images() and not stalled[index].get_images()
  assert page.get_text()==stalled[index].get_text()==reader[index].get_text()
  assert not reader[index].get_images()
  assert page.get_text()==blocked[index].get_text(),(name,index,'fallback changed document content')
  page.get_pixmap(matrix=fitz.Matrix(1.2,1.2)).save(root/f'{name}-page{index+1}.png')
  blocked[index].get_pixmap(matrix=fitz.Matrix(.7,.7)).save(root/f'{name}-fallback-page{index+1}.png')
  texts.append(page.get_text())
 text=''.join(texts)
 assert 'CrewCheck' in text
 if name=='roster':assert 'PESSOA SINTETICA' in text and '31/10/2032' in text
 if name=='premium':assert 'LINHA SINTETICA 109' in text and 'SYN123' in text
 if name=='medical':assert 'PACIENTE SINTETICO' in text and '000000000' in text and 'REGISTRO FICTICIO' in text
 if args.baseline:
  old=fitz.open(Path(args.baseline)/f'{name}-loaded.pdf');assert len(old)==len(loaded)
  assert ''.join(x.get_text() for x in old)==text,(name,'document data/text changed')
 results.append({'exporter':name,'pages':len(loaded),'approved_pixels':True,'proportions_margins':True,'fallback_text_unchanged':True,'baseline_text_unchanged':bool(args.baseline)})
(root/'pdf-validation.json').write_text(json.dumps(results,indent=2));print(json.dumps(results))
