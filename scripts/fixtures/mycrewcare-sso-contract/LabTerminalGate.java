package lab.mcc;

/** Lab result latch, not a production login/session implementation. */
final class LabTerminalGate {
    enum State { ACTIVE, PASSED, CANCELLED, TIMED_OUT, FAILED }
    private final long deadline;
    private State state = State.ACTIVE;
    private boolean browserComplete;
    private boolean cleanupComplete;

    LabTerminalGate(long deadline) { this.deadline = deadline; }
    synchronized void cancel() { if (state == State.ACTIVE) state = State.CANCELLED; }
    synchronized void fail() { if (state == State.ACTIVE) state = State.FAILED; }
    synchronized void browserComplete(long now) { if (active(now)) browserComplete = true; }
    synchronized void cleanupComplete(long now, boolean success) {
        if (!active(now)) return;
        if (!success) state = State.FAILED;
        else cleanupComplete = true;
    }
    synchronized boolean publish(long now) {
        if (!active(now) || !browserComplete || !cleanupComplete) return false;
        state = State.PASSED;
        return true;
    }
    synchronized State state() { return state; }
    private boolean active(long now) {
        if (state == State.ACTIVE && now >= deadline) state = State.TIMED_OUT;
        return state == State.ACTIVE;
    }
}
