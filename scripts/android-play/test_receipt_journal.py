"""Remote durable store fake survives discarded runners; no live service calls."""
import copy
from receipt_journal import DurableJournal


class Backend:
    value = None
    def create_if_absent(self, key, value):
        assert self.value is None, 'Package already reserved'
        self.value = copy.deepcopy(value)
    def replace_owned(self, key, owner, value):
        assert self.value['journalOwner'] == owner
        self.value = copy.deepcopy(value)
    def read(self, key): return copy.deepcopy(self.value)


def rejects(call):
    try: call()
    except (AssertionError, TimeoutError): return
    raise AssertionError('Unsafe journal operation passed')


for crash_state in ('reserved', 'pending', 'acknowledged', 'reconciled'):
    remote = Backend()
    first = DurableJournal(remote, 'com.crewcheck.app', 'first-run')
    first.reserve({'versionCode': 144201})
    if crash_state != 'reserved':
        first.persist({'state': crash_state, 'editId': 'original'})
    del first  # Runner and all local files disappear.
    second = DurableJournal(remote, 'com.crewcheck.app', 'new-run')
    rejects(lambda: second.reserve({'versionCode': 144202}))
    rejects(lambda: second.persist({'state': 'pending'}))


class LostAcknowledgement(Backend):
    def create_if_absent(self, key, value):
        super().create_if_absent(key, value)
        raise TimeoutError('Write succeeded; response was lost')


remote = LostAcknowledgement()
rejects(lambda: DurableJournal(remote, 'package', 'run1').reserve({}))
rejects(lambda: DurableJournal(remote, 'package', 'run2').reserve({}))


class LostUpdate(Backend):
    def replace_owned(self, key, owner, value):
        super().replace_owned(key, owner, value)
        raise TimeoutError('Pending intent persisted; response lost')


remote = LostUpdate()
journal = DurableJournal(remote, 'package', 'run')
journal.reserve({})
rejects(lambda: journal.persist({'state': 'pending'}))
assert remote.value['state'] == 'pending'


class StaleRead(Backend):
    def read(self, key): return None


rejects(lambda: DurableJournal(StaleRead(), 'package', 'run').reserve({}))
rejects(lambda: DurableJournal(None, 'package', 'run'))
print('PASS: runner-loss reservation survives; uncertain writes/readbacks and competing owners block; no auto unlock')
