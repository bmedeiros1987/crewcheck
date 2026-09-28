import base64
import json
import unittest

from credential import load_service_account_secret

FAKE = {
    'type': 'service_account',
    'client_email': 'play-publisher@example.iam.gserviceaccount.com',
    'private_key': '-----BEGIN PRIVATE KEY-----\\nFAKE\\n-----END PRIVATE KEY-----\\n',
    'token_uri': 'https://oauth2.googleapis.com/token',
}


class CredentialTests(unittest.TestCase):
    def test_raw_json(self):
        self.assertEqual(load_service_account_secret(json.dumps(FAKE))['client_email'], FAKE['client_email'])

    def test_env_assignment(self):
        value = 'PLAY_SERVICE_ACCOUNT_JSON=' + json.dumps(FAKE)
        self.assertEqual(load_service_account_secret(value)['type'], 'service_account')

    def test_escaped_json_string(self):
        value = json.dumps(json.dumps(FAKE))
        self.assertEqual(load_service_account_secret(value)['type'], 'service_account')

    def test_base64_and_prefix(self):
        encoded = base64.b64encode(json.dumps(FAKE).encode()).decode()
        self.assertEqual(load_service_account_secret(encoded)['type'], 'service_account')
        self.assertEqual(load_service_account_secret('base64:' + encoded)['type'], 'service_account')

    def test_rejects_incomplete_or_wrong_type(self):
        with self.assertRaises(ValueError):
            load_service_account_secret('{}')
        with self.assertRaises(ValueError):
            load_service_account_secret('not-a-credential')


if __name__ == '__main__':
    unittest.main()
