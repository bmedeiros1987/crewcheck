"""Prepare a copy-ready manual approval, never approve/issue OIDC/access Store or DB."""
import argparse
import datetime
import json
import os
from pathlib import Path
import re
import urllib.request
from receipt_backend import snapshot_digest, snapshot_json
REPO='bmedeiros1987/crewcheck'
REPO_ID='1254349963'
OWNER_ID='214496369'
API='https://api.github.com/repos/'+REPO
PREFIX='CrewCheck approval/v1\n'

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise RuntimeError('Redirect refused')


def public_get(url):
    assert url.startswith(API+'/')
    request=urllib.request.Request(url,headers={'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'})
    with urllib.request.build_opener(NoRedirect).open(request,timeout=10) as response:
        assert response.status==200 and response.geturl()==url
        raw=response.read(262145);assert len(raw)<=262144
        return json.loads(raw)


def prepare(meta, env):
    assert env['GITHUB_REPOSITORY']==REPO and env['GITHUB_REF']=='refs/heads/main' and env['GITHUB_EVENT_NAME']=='workflow_dispatch'
    run,attempt=env['GITHUB_RUN_ID'],env['GITHUB_RUN_ATTEMPT']
    assert re.fullmatch('[1-9][0-9]*',run) and re.fullmatch('[1-9][0-9]*',attempt)
    sha,wsha=env['GITHUB_SHA'],env['GITHUB_WORKFLOW_SHA']
    assert re.fullmatch('[0-9a-f]{40}',sha) and re.fullmatch('[0-9a-f]{40}',wsha)
    assert env['REVIEWED_SOURCE_SHA']==sha, 'Connection plan must use exact reviewed workflow source'
    assert str(meta['id'])==run and str(meta['run_attempt'])==attempt
    assert str(meta['repository']['id'])==REPO_ID and str(meta['repository']['owner']['id'])==OWNER_ID
    assert meta['repository']['full_name']==REPO and meta['head_sha']==sha and meta['head_branch']=='main' and meta['event']=='workflow_dispatch'
    assert str(meta['actor']['id'])==env['GITHUB_ACTOR_ID']
    stamp=meta['run_started_at'];date=datetime.datetime.strptime(stamp,'%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=datetime.timezone.utc)
    assert date.strftime('%Y-%m-%dT%H:%M:%SZ')==stamp
    issued=int(date.timestamp())
    p=dict(package='com.crewcheck.app',owner='mobile:'+run+':'+attempt,producer='mobile',sourceSha=sha,controllerSha=sha,runId=run,modules=['app']);p['planSha256']=snapshot_digest(p)
    return dict(schema=1,repositoryId=REPO_ID,ownerId=OWNER_ID,runId=run,runAttempt=attempt,actorId=env['GITHUB_ACTOR_ID'],workflowRef=REPO+'/.github/workflows/mobile-only-internal.yml@refs/heads/main',workflowSha=wsha,codeSha=sha,binding=dict(schema=2,generation=1,plan=p),operations=['probe'],issuedAt=issued,expiresAt=issued+7200,recoveryUntil=issued+8100)


def comment(approval, artifact_id, archive_digest):
    assert re.fullmatch('[1-9][0-9]*',artifact_id)
    assert re.fullmatch('[0-9a-f]{64}',archive_digest)
    doc=dict(schema=1,approval=approval,approvalSha256=snapshot_digest(approval),artifactId=artifact_id,artifactArchiveSha256=archive_digest)
    return PREFIX+snapshot_json(doc)


def main(argv=None):
    parser=argparse.ArgumentParser();parser.add_argument('command',choices=['prepare','comment']);parser.add_argument('--output',required=True);parser.add_argument('--artifact-id');parser.add_argument('--archive-digest');args=parser.parse_args(argv)
    out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
    if args.command=='prepare':
        run,attempt=os.environ['GITHUB_RUN_ID'],os.environ['GITHUB_RUN_ATTEMPT']
        assert re.fullmatch('[1-9][0-9]*',run) and re.fullmatch('[1-9][0-9]*',attempt)
        meta=public_get(API+'/actions/runs/'+run+'/attempts/'+attempt)
        approval=prepare(meta,os.environ)
        (out/'approval-plan.json').write_text(snapshot_json(approval)+'\n',encoding='utf-8')
        return
    approval=json.loads((out/'approval-plan.json').read_text())
    block=comment(approval,args.artifact_id,args.archive_digest)
    (out/'approval-comment.txt').write_text(block+'\n')
    short='CC-'+snapshot_digest(approval)[:12].upper()
    summary=f'''### CrewCheck — verificar conexão do journal\n\nReferência: **{short}**. Pacote `com.crewcheck.app`, somente teste de conexão; nenhuma versão será publicada.\n\nFonte: `{approval['codeSha']}`. [Execução e tentativa](https://github.com/{REPO}/actions/runs/{approval['runId']}/attempts/{approval['runAttempt']}).\n\nRevise este resumo, copie o bloco completo abaixo no comentário de **Review deployments** e aprove o ambiente **861**. Os identificadores já estão preenchidos. A referência curta sozinha não autoriza operações.\n\n```text\n{block}\n```\n'''
    Path(os.environ['GITHUB_STEP_SUMMARY']).write_text(summary,encoding='utf-8')

if __name__=='__main__':
    try:main()
    except Exception:raise SystemExit('Journal approval preparation failed; no approval or provider action occurred')
