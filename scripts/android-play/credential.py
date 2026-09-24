import base64
import json


def load_service_account_secret(raw):
    """Parse a GitHub secret without ever logging its contents."""
    value = str(raw or '').strip().lstrip('\ufeff')
    if not value:
        raise ValueError('PLAY_SERVICE_ACCOUNT_JSON is empty')

    for prefix in ('PLAY_SERVICE_ACCOUNT_JSON=', 'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON='):
        if value.startswith(prefix):
            value = value[len(prefix):].strip()
            break

    def parse_json(candidate):
        parsed = json.loads(candidate)
        if isinstance(parsed, str):
            parsed = json.loads(parsed)
        return parsed

    account = None
    try:
        account = parse_json(value)
    except Exception:
        encoded = value[7:].strip() if value.lower().startswith('base64:') else value
        try:
            decoded = base64.b64decode(encoded, validate=True).decode('utf-8')
            account = parse_json(decoded.strip().lstrip('\ufeff'))
        except Exception as error:
            raise ValueError(
                'PLAY_SERVICE_ACCOUNT_JSON is not valid service-account JSON '
                '(raw, escaped JSON, env assignment, or Base64)'
            ) from error

    if not isinstance(account, dict) or account.get('type') != 'service_account':
        raise ValueError('Expected a Google service_account credential')

    required = ('client_email', 'private_key', 'token_uri')
    missing = [key for key in required if not str(account.get(key) or '').strip()]
    if missing:
        raise ValueError('Service-account credential is missing required fields')

    return account
