import runpy
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

gate = runpy.run_path(str(Path(__file__).with_name('assert-stay-qa-manifest.py')))
verify = gate['verify']
ANDROID = gate['ANDROID']
PACKAGE = 'com.crewcheck.app.stayaccept999999999r1'


def merged_manifest():
    """Synthetic merged output from the real workflow overlay's declarations."""
    workflow = Path(__file__).resolve().parents[2] / '.github/workflows/stay-alarm-durable-offline.yml'
    block = workflow.read_text().split("<<'XML'\n", 1)[1].split('\n          XML', 1)[0]
    root = ET.fromstring(block.lstrip())
    root.set('package', PACKAGE)
    tools_node = '{http://schemas.android.com/tools}node'
    for parent in (root, root.find('application')):
        for child in list(parent):
            if child.get(tools_node) == 'removeAll':
                parent.remove(child)
    return root


class ManifestGateTest(unittest.TestCase):
    def test_offline_fixture(self):
        verify(merged_manifest(), PACKAGE)

    def test_additional_permission(self):
        for tag in ('uses-permission', 'uses-permission-sdk-23'):
            with self.subTest(tag=tag):
                root = merged_manifest()
                ET.SubElement(root, tag, {ANDROID + 'name': 'android.permission.INTERNET'})
                with self.assertRaises(ValueError):
                    verify(root, PACKAGE)

    def test_extra_component_or_open_receiver(self):
        for tag in ('activity', 'activity-alias', 'receiver', 'service', 'provider'):
            with self.subTest(tag=tag):
                root = merged_manifest()
                ET.SubElement(root.find('application'), tag, {ANDROID + 'name': 'synthetic.Extra'})
                with self.assertRaises(ValueError):
                    verify(root, PACKAGE)
        root = merged_manifest()
        root.find('application/receiver').set(ANDROID + 'exported', 'true')
        with self.assertRaises(ValueError):
            verify(root, PACKAGE)

    def test_bootstrap_or_backup_must_not_escape_fixture(self):
        for attr, value in (('name', 'synthetic.App'), ('appComponentFactory', 'synthetic.Factory'),
                            ('backupAgent', 'synthetic.Backup'), ('allowBackup', 'true')):
            with self.subTest(attribute=attr):
                root = merged_manifest()
                root.find('application').set(ANDROID + attr, value)
                with self.assertRaises(ValueError):
                    verify(root, PACKAGE)
        root = merged_manifest()
        root.find('application').set(ANDROID + 'appComponentFactory', 'androidx.core.app.CoreComponentFactory')
        verify(root, PACKAGE)

    def test_production_package_or_unexpected_boot_action(self):
        with self.assertRaises(ValueError):
            verify(merged_manifest(), 'com.crewcheck.app')
        root = merged_manifest()
        ET.SubElement(root.find('application/receiver/intent-filter'), 'action',
                      {ANDROID + 'name': 'synthetic.UNEXPECTED'})
        with self.assertRaises(ValueError):
            verify(root, PACKAGE)

    def test_direct_boot_is_private_and_only_for_the_receiver(self):
        for path, attr, value in (
            ('application', 'directBootAware', 'true'),
            ('application', 'defaultToDeviceProtectedStorage', 'true'),
            ('application', 'process', ':untrusted_split'),
            ('application/activity', 'process', ':untrusted_split'),
            ('application/receiver', 'process', ':untrusted_split'),
            ('application/activity', 'directBootAware', 'true'),
            ('application/receiver', 'directBootAware', 'false'),
        ):
            with self.subTest(path=path, attribute=attr):
                root = merged_manifest()
                root.find(path).set(ANDROID + attr, value)
                with self.assertRaises(ValueError):
                    verify(root, PACKAGE)
        root = merged_manifest()
        filters = root.find('application/receiver/intent-filter')
        for action in list(filters):
            if action.get(ANDROID + 'name') == 'android.intent.action.LOCKED_BOOT_COMPLETED':
                filters.remove(action)
        with self.assertRaises(ValueError):
            verify(root, PACKAGE)


if __name__ == '__main__':
    unittest.main()
