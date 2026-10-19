package com.crewcheck.app;

/** Activity-local operation tickets; fresh quorum proof may resume bounded pending work. */
final class CrewLifeSyncWork {
    private static final int MAX_CONTINUATIONS = 4;
    private long current;
    private boolean continuation;
    private boolean closed;
    private boolean active;
    private int attempts;
    synchronized long start() { if (closed) return 0; current++; attempts = 0; active = true; continuation = true; return current; }
    synchronized long claim() {
        if (closed || !active || !continuation || attempts >= MAX_CONTINUATIONS) return 0;
        continuation = false; attempts++;
        return current;
    }
    synchronized void defer(long ticket) {
        if (!closed && active && ticket == current && attempts < MAX_CONTINUATIONS) continuation = true;
    }
    synchronized boolean canResume(long ticket) { return !closed && active && ticket == current && continuation && attempts < MAX_CONTINUATIONS; }
    synchronized long current() { return current; }
    synchronized boolean isCurrent(long ticket) { return !closed && active && ticket > 0 && ticket == current; }
    synchronized void complete(long ticket) { if (ticket == current) { active = false; continuation = false; } }
    synchronized void close() { closed = true; invalidate(); }
    synchronized void invalidate() { current++; active = false; continuation = false; attempts = 0; }
}
