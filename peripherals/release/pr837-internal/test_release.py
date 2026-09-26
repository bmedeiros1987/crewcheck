"""Fail-closed publication tests; never authenticate or call a remote service."""
import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
import release as r


def policy():
    return {'versionName': '14.4.10', 'uploadCertificateSha256': r.CERT,
            'knownMaxVersionCode': {'com.crewcheck.app': 144141, 'com.crewcheck.watch.app': 144121},
            'artifacts': {
                'wear': {'package': 'com.crewcheck.app', 'versionCode': 144142, 'minSdk': 30, 'targetSdk': 36, 'track': 'wear:qa', 'watch': True},
                'watchface': {'package': 'com.crewcheck.watch.app', 'versionCode': 144122, 'minSdk': 33, 'targetSdk': 36, 'track': 'wear:qa', 'watch': True}}}


class PublicationTests(unittest.TestCase):
    def test_only_explicit_branch_context(self):
        env = {'GITHUB_REPOSITORY': r.REPO, 'GITHUB_REF': 'refs/heads/' + r.BRANCH, 'GITHUB_EVENT_NAME': 'push'}
        r.check_context(env)
        for key, value in [('GITHUB_REF', 'refs/heads/main'), ('GITHUB_REF', 'refs/pull/837/merge'),
                           ('GITHUB_REPOSITORY', 'attacker/crewcheck'), ('GITHUB_EVENT_NAME', 'pull_request')]:
            with self.subTest(value=value), self.assertRaises(ValueError): r.check_context(dict(env, **{key: value}))

    def test_package_sdk_track_signature_and_version(self):
        p = policy(); r.check_policy(p)
        for key, value in [('package', 'com.crewcheck.life'), ('track', 'production'), ('track', 'qa'),
                           ('watch', False), ('versionCode', 144141), ('versionCode', 2100000000),
                           ('versionCode', True), ('minSdk', 26), ('targetSdk', 35)]:
            bad = copy.deepcopy(p); bad['artifacts']['wear'][key] = value
            with self.subTest(key=key, value=value), self.assertRaises(ValueError): r.check_policy(bad)
        for key, value in [('versionName', 'wrong'), ('uploadCertificateSha256', '0' * 64)]:
            with self.subTest(key=key), self.assertRaises(ValueError): r.check_policy(dict(p, **{key: value}))

    def test_tracks_never_fallback(self):
        for name in ('wear:qa', 'wear:internal'):
            t = {'track': name, 'releases': [{'status': 'completed', 'versionCodes': ['12']}]}
            self.assertEqual(r.pick_track([t, {'track': 'production'}]), t)
            self.assertEqual(r.release_body(name, 13)['track'], name)
        for tracks in [[], [{'track': 'qa'}], [{'track': 'production'}],
                       [{'track': 'wear:qa'}, {'track': 'wear:internal'}]]:
            with self.subTest(tracks=tracks), self.assertRaises(ValueError): r.pick_track(tracks)
        for status in ('draft', 'inProgress', 'halted', 'unknown'):
            with self.subTest(status=status), self.assertRaises(ValueError):
                r.pick_track([{'track': 'wear:qa', 'releases': [{'status': status}]}])
        for name in ('qa', 'internal', 'production', 'wear:production', 'beta'):
            with self.subTest(name=name), self.assertRaises(ValueError): r.release_body(name, 1)

    def test_live_floor_covers_all_form_factors(self):
        self.assertEqual(r.max_code([{'releases': [{'versionCodes': ['777', '900']}]}], [{'versionCode': 950}], 800), 950)
        self.assertEqual(r.max_code([], [], 100), 100)

    def test_independent_ci_exact_source(self):
        runs = [{'id': index + 1, 'workflow_id': index + 1, 'name': name, 'head_sha': r.SOURCE,
                 'event': 'pull_request', 'status': 'completed', 'conclusion': 'success'}
                for index, name in enumerate(sorted(r.REQUIRED_CI))]
        r.independent_green(runs)
        with self.assertRaises(ValueError): r.independent_green(runs[:-1])
        for key, value in [('head_sha', 'other'), ('status', 'in_progress'), ('conclusion', 'failure'),
                           ('conclusion', 'skipped'), ('event', 'workflow_run')]:
            bad = copy.deepcopy(runs); bad[0][key] = value
            with self.subTest(key=key, value=value), self.assertRaises(ValueError): r.independent_green(bad)
        red = dict(runs[0], id=999, conclusion='failure')
        with self.assertRaises(ValueError): r.independent_green(runs + [red])
        older_red = dict(runs[0], id=0, conclusion='failure')
        r.independent_green([older_red] + runs)

    def test_report_strict_modules_and_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            out = Path(directory); p = policy(); report = []
            for module, spec in p['artifacts'].items():
                name = f'CrewCheck-{module}-{spec["versionCode"]}.aab'
                (out / name).write_bytes(module.encode())
                report.append(dict(spec, module=module, file=name, certificateSha256=r.CERT, sha256=r.digest(out / name)))
            meta = {'sourceSha': r.SOURCE, 'report': report}
            r.check_report(out, meta, p)
            for key, value in [('track', 'production'), ('file', '../outside.aab'),
                               ('sha256', '0' * 64), ('certificateSha256', '0' * 64),
                               ('versionCode', 1), ('package', 'com.crewcheck.life')]:
                bad = copy.deepcopy(meta); bad['report'][0][key] = value
                with self.subTest(key=key), self.assertRaises(ValueError): r.check_report(out, bad, p)
            with self.assertRaises(ValueError): r.check_report(out, dict(meta, sourceSha='other'), p)
            for bad_report in [report[:1], report + [dict(report[0], module='app')], [report[0], report[0]]]:
                with self.assertRaises(ValueError): r.check_report(out, dict(meta, report=bad_report), p)
            (out / report[0]['file']).write_bytes(b'tampered')
            with self.assertRaises(ValueError): r.check_report(out, meta, p)


if __name__ == '__main__': unittest.main(verbosity=2)
