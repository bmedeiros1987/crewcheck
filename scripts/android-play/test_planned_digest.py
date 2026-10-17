"""Reuse the receipt canonicalizer; compare hashes with the existing Node implementation."""
import json
from pathlib import Path
import subprocess
from planned_mobile import digest
from receipt_backend import snapshot_digest
assert digest is snapshot_digest, 'No separate planned canonicalizer'
snapshots = [
 {'track':'internal','releases':[{'status':'completed','versionCodes':['144156'],'releaseNotes':[{'language':'pt-BR','text':'Correções de navegação ✈️'}]}]},
 {'other': {'production': {'notes':'ação é ü 中文 🚀\u2028\n"\\'}, 'wear:internal': {'version':144155}}},
 {'values':[None,True,False,0,1,-1,9007199254740991,-9007199254740991]},
 {'z':[], 'a':{'nested':['✈️',{'note':'Correções'}]}}
]
root=Path(__file__).resolve().parents[2]
code="import fs from 'node:fs';import {snapshotDigest} from './scripts/android-play/reconcile_journal.mjs';const v=JSON.parse(fs.readFileSync(0,'utf8'));console.log(JSON.stringify(v.map(snapshotDigest)));"
result=subprocess.run(['node','--input-type=module','-e',code],cwd=root,input=json.dumps(snapshots,ensure_ascii=False,allow_nan=False),text=True,capture_output=True,check=True,timeout=30)
assert json.loads(result.stdout)==[snapshot_digest(v) for v in snapshots]
for bad in [1.5,9007199254740992,float('nan'),{'não-ASCII':'key'},'\ud800']:
 try:digest(bad)
 except (ValueError,UnicodeError):pass
 else:raise AssertionError('Unsupported canonical value accepted')
print('PASS shared receipt digest equals Node for Unicode/emoji/escaping/safe integers; incompatible numbers/keys/surrogates rejected')
