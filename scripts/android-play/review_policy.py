"""Package-aware Google Play edit finalization for Internal Testing only."""

MUST_NOT_DEFER_REVIEW = 'changesNotSentForReview must not be set'


def commit_internal_edit(api, edit_url):
    """Commit an Internal Testing edit using the review mode required by that app.

    Some Play apps require ``changesNotSentForReview=true`` while others reject that
    parameter because review submission is automatic. Try the privacy/safety-preserving
    deferred-review mode first and fall back only for Play's explicit "must not be set"
    response. Any other API failure remains fatal.
    """
    try:
        result = api(
            'POST',
            edit_url + ':commit',
            params={'changesNotSentForReview': 'true'},
        )
        return result, 'deferred-review'
    except RuntimeError as error:
        if MUST_NOT_DEFER_REVIEW not in str(error):
            raise
        result = api('POST', edit_url + ':commit')
        return result, 'automatic-review'
