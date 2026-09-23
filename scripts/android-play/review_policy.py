"""Google Play edit finalization policy for changes that require Console review."""


def commit_without_sending_for_review(api, edit_url):
    """Commit an edit without asking Play to submit its changes for review."""
    return api(
        'POST',
        edit_url + ':commit',
        params={'changesNotSentForReview': 'true'},
    )
