import re


_URL_RE = re.compile(r'https?://\S+', re.IGNORECASE)


def _clean(value, limit=240):
    text = str(value or '').replace('\r', ' ').replace('\n', ' ').strip()
    text = _URL_RE.sub('[url removed]', text)
    text = re.sub(r'\s+', ' ', text)
    return text[:limit].rstrip()


def safe_play_error(response):
    """Return bounded Play API diagnostics without headers, URLs, tokens or raw payloads."""
    status = getattr(response, 'status_code', 'unknown')
    base = f'Play API HTTP {status}'
    try:
        payload = response.json()
    except Exception:
        return base

    error = payload.get('error') if isinstance(payload, dict) else None
    if not isinstance(error, dict):
        return base

    parts = [base]
    message = _clean(error.get('message'))
    if message:
        parts.append(message)

    reasons = []
    errors = error.get('errors')
    if isinstance(errors, list):
        for item in errors:
            if not isinstance(item, dict):
                continue
            reason = _clean(item.get('reason'), 80)
            if reason and reason not in reasons:
                reasons.append(reason)
    if reasons:
        parts.append('reasons=' + ','.join(reasons[:6]))

    return _clean(' | '.join(parts), 420)
