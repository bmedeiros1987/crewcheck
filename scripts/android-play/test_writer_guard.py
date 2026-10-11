"""Invoke legacy entries with poison credential/session/file seams; must stop first."""
import os
from unittest.mock import patch
import allocate_versions
import publish
import crewwatch_internal
os.environ['GITHUB_REF']='refs/heads/main'
for flag in ('PUBLISH_MOBILE_INTERNAL','PUBLISH_INTERNAL_DRAFTS','PUBLISH_WEAR_INTERNAL','CREWCHECK_COORDINATOR_ENABLED'):
    os.environ[flag]='true'

def forbidden(*args,**kwargs):raise AssertionError('Credential, file, session or API reached')
with patch('credential.load_service_account_secret',forbidden),patch.object(crewwatch_internal,'play_session',forbidden),patch.object(crewwatch_internal,'api',forbidden),patch.object(allocate_versions.Path,'read_text',forbidden):
    for entry in (allocate_versions.main,publish.main,crewwatch_internal.allocate,lambda:crewwatch_internal.publish('unused')):
        try:entry()
        except RuntimeError as error:assert 'coordinator is not configured' in str(error)
        else:raise AssertionError('Legacy writer activated')
print('PASS: joint/allocator/Wear CLI entries stop before credential/file/session/edit despite environment flags; companion unchanged')
