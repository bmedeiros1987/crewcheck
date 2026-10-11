"""Legacy shared-package writer fence. No coordinator is configured or inferred."""


def require_coordinator(producer, action):
    # This CLI path deliberately has no environment flag, credential or transport
    # loader. Adoption needs separately reviewed explicit executor injection.
    assert producer in {'joint', 'allocator', 'wear'}
    assert action in {'allocate', 'publish'}
    raise RuntimeError('Shared-package writer disabled: reviewed durable coordinator is not configured')
