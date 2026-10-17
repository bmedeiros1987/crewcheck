"""Adversarial reference gate fixtures, no credential/client/workflow execution."""
from pathlib import Path
from tempfile import TemporaryDirectory
from check_mobile_workflow_scripts import references, validate
with TemporaryDirectory() as tmp:
    root = Path(tmp); (root/'scripts').mkdir(); p = 'scripts/check.mjs'; (root/p).write_text('fixture')
    workflow = "steps:\n  - run: |\n      node scripts/check.mjs\n      python3 ../control/scripts/check.py\n  - run: node 'scripts/check.mjs'\n"
    (root/'scripts/check.py').write_text('fixture')
    tracked = {p, 'scripts/check.py'}
    assert references(workflow) == tracked
    assert validate(workflow, tracked, root, required=tracked) == tracked
    for text, index in [(workflow, {p}), (workflow.replace('check.mjs','missing.mjs'), tracked), (workflow.replace('node scripts/check.mjs','echo skipped').replace("node 'scripts/check.mjs'",'echo skipped'), tracked)]:
        try: validate(text, index, root, required=tracked)
        except ValueError: pass
        else: raise AssertionError('Missing/untracked/removed required command accepted')
    (root/p).unlink()
    try: validate(workflow, tracked, root, required=tracked)
    except ValueError: pass
    else: raise AssertionError('Tracked but absent file accepted')
print('PASS workflow reference gate refuses nonexistent/untracked files and deleted required checks; source/control paths normalized')
