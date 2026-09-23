"""Choose the Google Play edit commit mode without weakening unrelated failures."""

REVIEW_DEFER_REQUIRED = (
    'Changes cannot be sent for review automatically. '
    'Please set the query parameter changesNotSentForReview to true.'
)


def commit_for_review_mode(api, edit_url):
    """Commit normally; defer review only when Play explicitly requires it."""
    try:
        api('POST', edit_url + ':commit')
        return 'automatic'
    except RuntimeError as error:
        if REVIEW_DEFER_REQUIRED not in str(error):
            raise
        api(
            'POST',
            edit_url + ':commit',
            params={'changesNotSentForReview': 'true'},
        )
        return 'deferred'
