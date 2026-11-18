import importlib.util
import sys
import unittest
from pathlib import Path

# This test runs before checkout-cleanliness gates in disposable CI jobs.
# Import the helper without leaving a generated __pycache__ in the checkout.
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('mirror', Path(__file__).with_name('prefer-ubuntu-archive.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class MirrorTests(unittest.TestCase):
    def test_runner_fixture_prioritizes_https_archive_and_keeps_fallbacks(self):
        source = ('# Runner mirror list\n'
                  'http://azure.archive.ubuntu.com/ubuntu/\tpriority:1\n'
                  'http://us-east-2.ec2.archive.ubuntu.com/ubuntu/\tpriority:2\n'
                  'https://archive.ubuntu.com/ubuntu/\tpriority:3 suite:noble\n'
                  'https://security.ubuntu.com/ubuntu/\tpriority:4 suite:noble-security\n')
        expected = ('# Runner mirror list\n'
                    'http://us-east-2.ec2.archive.ubuntu.com/ubuntu/\tpriority:2\n'
                    'https://archive.ubuntu.com/ubuntu/\tpriority:0 suite:noble\n'
                    'https://security.ubuntu.com/ubuntu/\tpriority:4 suite:noble-security\n')
        result = module.prefer_ubuntu_archive(source)
        self.assertEqual(result, expected)
        self.assertEqual(module.prefer_ubuntu_archive(result), result)

    def test_normalizes_archive_metadata_separator_without_touching_comments(self):
        source = ('https://azure.archive.ubuntu.com/ubuntu priority:1\n'
                  'https://archive.ubuntu.com/ubuntu priority:2\n'
                  '# azure.archive.ubuntu.com historical comment\n')
        self.assertEqual(module.prefer_ubuntu_archive(source),
                         'https://archive.ubuntu.com/ubuntu\tpriority:0\n'
                         '# azure.archive.ubuntu.com historical comment\n')

    def test_no_fallback_ties_with_the_preferred_archive(self):
        source = ('http://us-east-2.ec2.archive.ubuntu.com/ubuntu/\tarch:amd64 priority:0\n'
                  'https://archive.ubuntu.com/ubuntu\n'
                  'https://security.ubuntu.com/ubuntu/\n')
        result = module.prefer_ubuntu_archive(source)
        self.assertEqual(result, 'http://us-east-2.ec2.archive.ubuntu.com/ubuntu/\tarch:amd64 priority:1\n'
                         'https://archive.ubuntu.com/ubuntu\tpriority:0\n'
                         'https://security.ubuntu.com/ubuntu/\n')
        self.assertEqual(module.prefer_ubuntu_archive(result), result)

    def test_missing_verified_fallback_fails_instead_of_inventing_source(self):
        with self.assertRaises(ValueError):
            module.prefer_ubuntu_archive('http://azure.archive.ubuntu.com/ubuntu/\n')
        with self.assertRaises(ValueError):
            module.prefer_ubuntu_archive('https://archive.ubuntu.com.attacker.invalid/ubuntu/\n')

if __name__ == '__main__':
    unittest.main()
