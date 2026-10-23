"""Synthetic HTTP envelopes only; existing Python planned transport validates records."""
import copy
from types import SimpleNamespace
from receipt_backend import snapshot_json, snapshot_digest
from journal_transport import ReviewedHttpJournalExchange, PlannedJournalTransport
p=dict(package='com.crewcheck.app',owner='mobile:123',producer='mobile',sourceSha='a'*40,controllerSha='b'*40,runId='123',modules=['app']);p['planSha256']=snapshot_digest(p)
b=dict(schema=2,generation=1,plan=p)
calls=[]
def issuer(audience):
 assert audience==ReviewedHttpJournalExchange.AUDIENCE
 return 'fictional.jwt.signature'
def request(**kwargs):
 calls.append(kwargs)
 assert kwargs['method']=='POST' and kwargs['url']==ReviewedHttpJournalExchange.ENDPOINT
 assert kwargs['allow_redirects'] is False and kwargs['retries']==0 and kwargs['timeout']==10
 import json
 f=json.loads(kwargs['data']);r=dict(schema=2,id=f['id'],status='ok',record=None,retryAllowed=False,storeAvailability='unknown')
 return SimpleNamespace(status_code=200,url=kwargs['url'],headers={'Content-Type':'application/json; charset=utf-8'},content=snapshot_json(r).encode())
off=ReviewedHttpJournalExchange(b,request=lambda **_:(_ for _ in ()).throw(AssertionError('OFF HTTP touched')),issue_token=lambda _:(_ for _ in ()).throw(AssertionError('OFF OIDC touched')))
try:off('{}')
except RuntimeError as e:assert str(e)=='Reviewed HTTP journal remains OFF'
else:raise AssertionError('OFF accepted')
e=ReviewedHttpJournalExchange(b,request,issuer,enabled=True);t=PlannedJournalTransport(e,b);assert t.request('read',{}) is None;assert len(calls)==1
frame=snapshot_json(dict(schema=2,id='direct',operation='read',binding=b,revision=0,input={}))
for scenario in ['403','503','redirect','wrong-url','html','oversize','utf8','timeout','missing-permission']:
 attempts=[]
 def bad_request(**kwargs):
  attempts.append(kwargs)
  if scenario=='timeout':raise TimeoutError('private token/provider diagnostic sentinel')
  r=request(**kwargs)
  if scenario in ['403','503','redirect']:r.status_code=int(scenario) if scenario!='redirect' else 302
  if scenario=='wrong-url':r.url='https://foreign.invalid/'
  if scenario=='html':r.headers['Content-Type']='text/html'
  if scenario=='oversize':r.content=b'x'*65537
  if scenario=='utf8':r.content=b'\xff'
  return r
 def denied(_):raise PermissionError('private OIDC sentinel')
 x=ReviewedHttpJournalExchange(b,bad_request,denied if scenario=='missing-permission' else issuer,enabled=True)
 try:x(frame)
 except RuntimeError as error:assert str(error)=='HTTP journal outcome unverified; preserve reservation, no retry'
 else:raise AssertionError(scenario+' accepted')
 assert x.blocked and len(attempts)==(0 if scenario=='missing-permission' else 1)
 try:x(frame)
 except RuntimeError:pass
 else:raise AssertionError('Uncertain HTTP retried')
 assert len(attempts)==(0 if scenario=='missing-permission' else 1)
for update in [dict(operation='rollover'),dict(operation='probe'),dict(binding={**b,'generation':2}),dict(approved=True)]:
 import json
 f=json.loads(frame);f.update(update);x=ReviewedHttpJournalExchange(b,request,issuer,enabled=True);n=len(calls)
 try:x(snapshot_json(f))
 except RuntimeError:pass
 else:raise AssertionError('Unreviewed operation/binding accepted')
 assert len(calls)==n
x=ReviewedHttpJournalExchange(b,request,issuer,enabled=True);x(frame);n=len(calls)
try:x(frame)
except RuntimeError:pass
else:raise AssertionError('Frame replay accepted')
assert len(calls)==n
print('PASS OFF-default existing Python transport HTTP bridge: fixed TLS endpoint/audience, permission denial, canonical binding/scope, redirects/type/size/UTF8, 403/503/timeout, sticky no-retry and replay; zero network/token issuance')
