"""Explicit OFF-default connection probe. No Play/DB credential or journal/Store mutation."""
import argparse
import json
import os
from pathlib import Path
import re
import urllib.parse
import urllib.request
from receipt_backend import snapshot_json
ENDPOINT='https://crewcheck.onrender.com/api/platform/release-journal'
AUDIENCE='crewcheck:release-journal:com.crewcheck.app'
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):raise RuntimeError('Redirect refused')

def probe(plan, token_request_url, token_request_token, exchange):
    url=urllib.parse.urlsplit(token_request_url)
    assert url.scheme=='https' and url.hostname and url.hostname.endswith('.actions.githubusercontent.com') and not url.username and not url.password and not url.fragment
    args=urllib.parse.parse_qsl(url.query,keep_blank_values=True);assert not any(k=='audience' for k,_ in args);args.append(('audience',AUDIENCE))
    oidc_url=urllib.parse.urlunsplit(url._replace(query=urllib.parse.urlencode(args)))
    issued=exchange('GET',oidc_url,{'Authorization':'Bearer '+token_request_token},None)
    token=issued['value'];assert isinstance(token,str) and re.fullmatch('[A-Za-z0-9_.-]+',token)
    frame=dict(schema=2,id='probe_'+plan['runId']+'_'+plan['runAttempt'],operation='probe',binding=plan['binding'],revision=0,input={})
    result=exchange('POST',ENDPOINT,{'Authorization':'Bearer '+token,'Content-Type':'application/json'},snapshot_json(frame).encode())
    assert result['schema']==2 and result['id']==frame['id'] and result['status']=='ok' and result['namespace']=='com.crewcheck.app' and result['connectionVerified'] is True and result['storeMutationAllowed'] is False and result['retryAllowed'] is False
    return result

def main():
    p=argparse.ArgumentParser();p.add_argument('--plan',required=True);p.add_argument('--enable-reviewed-probe',action='store_true');args=p.parse_args();assert args.enable_reviewed_probe, 'Connection probe remains OFF until independent review'
    plan=json.loads(Path(args.plan).read_text())
    def exchange(method,url,headers,data):
        req=urllib.request.Request(url,method=method,headers=headers,data=data)
        with urllib.request.build_opener(NoRedirect).open(req,timeout=10) as response:
            assert response.status==200 and response.geturl()==url;raw=response.read(262145);assert len(raw)<=262144;return json.loads(raw)
    probe(plan,os.environ['ACTIONS_ID_TOKEN_REQUEST_URL'],os.environ['ACTIONS_ID_TOKEN_REQUEST_TOKEN'],exchange)
    print('Journal connection verified; Store publication remains OFF')
if __name__=='__main__':
    try:main()
    except Exception:raise SystemExit('Journal connection unverified; no retry, token diagnostics or Store action')
