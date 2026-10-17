"""Entry functions fail before credentials/imported clients; no release activation."""
import os
import json
import tempfile
from pathlib import Path
from unittest.mock import patch
import allocate_versions as allocator
import crewwatch_internal as wear
import publish as joint
import mobile_internal as mobile
with tempfile.TemporaryDirectory() as tmp:
 root=Path(tmp);policy=json.loads(Path(__file__).with_name('release-policy.json').read_text())
 (root/'release-report.json').write_text('[]');(root/'resolved-release-policy.json').write_text(json.dumps(policy))
 with patch.dict(os.environ,{'GITHUB_REF':'refs/heads/main','GITHUB_EVENT_NAME':'workflow_dispatch','PUBLISH_MOBILE_INTERNAL':'true'}),patch.object(wear,'play_session',side_effect=AssertionError('session reached')):
  for fn in [lambda:allocator.main([]),wear.allocate,lambda:wear.publish('/nonexistent'),lambda:joint.main([str(root)]),mobile.allocate]:
   try:fn()
   except AssertionError as error:assert 'disabled' in str(error).lower() and 'session reached' not in str(error)
   else:raise AssertionError('Uncoordinated writer enabled')
wear.self_test()
print('PASS all shared-package legacy writer entrypoints fail OFF before credential/session/edit; Wear self-test and pure allocation helpers retained')
