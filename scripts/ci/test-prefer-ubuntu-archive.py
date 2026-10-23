import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('mirror', Path(__file__).with_name('prefer-ubuntu-archive.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class MirrorTests(unittest.TestCase):
    def test_runner_fixture_preserves_fallbacks_and_metadata(self):
        source = ('# Runner mirror list\n'
                  'http://azure.archive.ubuntu.com/ubuntu/\tpriority:1\n'
                  'https://archive.ubuntu.com/ubuntu/\tpriority:2\n'
                  'https://security.ubuntu.com/ubuntu/\tpriority:3\n')
        result = module.prefer_ubuntu_archive(source)
        self.assertEqual(result, source.replace('http://azure.archive.ubuntu.com/ubuntu/\tpriority:1\n', ''))
        self.assertEqual(module.prefer_ubuntu_archive(result), result)

    def test_https_azure_also_excluded_without_touching_other_sources(self):
        source = ('https://azure.archive.ubuntu.com/ubuntu priority:1\n'
                  'https://archive.ubuntu.com/ubuntu priority:2\n'
                  '# azure.archive.ubuntu.com historical comment\n')
        self.assertEqual(module.prefer_ubuntu_archive(source), source.split('\n', 1)[1])

    def test_missing_verified_fallback_fails_instead_of_inventing_source(self):
        with self.assertRaises(ValueError):
            module.prefer_ubuntu_archive('http://azure.archive.ubuntu.com/ubuntu/\n')
        with self.assertRaises(ValueError):
            module.prefer_ubuntu_archive('https://archive.ubuntu.com.attacker.invalid/ubuntu/\n')

if __name__ == '__main__':
    unittest.main()
