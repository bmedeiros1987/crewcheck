"""Fail-closed durable receipt contract. No storage provisioning or credential client.

A backend must atomically reserve a package key and durably acknowledge writes.
No production backend is configured here: publication cannot use runner-local files
as its journal. The reservation remains locked even after reconciliation until an
independent operator reviews and resolves it; no automatic lease expiry.
"""
import copy


class DurableJournal:
    def __init__(self, backend, package, owner):
        assert backend is not None, 'Reviewed durable receipt backend required'
        assert package and owner, 'Package and immutable execution owner required'
        self.backend, self.package, self.owner = backend, package, owner

    def reserve(self, intent):
        value = dict(copy.deepcopy(intent), journalOwner=self.owner, state='reserved')
        # A failed/uncertain create is never retried or treated as ownership.
        self.backend.create_if_absent(self.package, value)
        self.verify(value)

    def persist(self, receipt):
        value = dict(copy.deepcopy(receipt), journalOwner=self.owner)
        self.backend.replace_owned(self.package, self.owner, value)
        self.verify(value)

    def verify(self, expected):
        assert self.backend.read(self.package) == expected, 'Durable receipt acknowledgement uncertain; stop'
