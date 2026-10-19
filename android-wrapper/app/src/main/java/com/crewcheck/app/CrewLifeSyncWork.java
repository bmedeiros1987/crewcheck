package com.crewcheck.app;

/** Activity-local operation tickets; fresh quorum proof may resume bounded pending work. */
final class CrewLifeSyncWork {
    private static final int MAX_CONTINUATIONS = 4;
    private long current;
    private long attempt;
    private boolean continuation;
    private boolean closed;
    private boolean active;
    private int attempts;
    synchronized long start() { if (closed) return 0; current++; attempt++; attempts = 0; active = true; continuation = true; return current; }
    synchronized long claim() {
        if (closed || !active || !continuation || attempts >= MAX_CONTINUATIONS) return 0;
        continuation = false; attempts++; attempt++;
        return current;
    }
    synchronized void defer(long ticket, long candidate) {
        if (isAttempt(ticket, candidate) && attempts < MAX_CONTINUATIONS) continuation = true;
    }
    synchronized boolean canResume(long ticket, long candidate) { return isAttempt(ticket, candidate) && continuation && attempts < MAX_CONTINUATIONS; }
    synchronized long attempt() { return attempt; }
    synchronized boolean isAttempt(long ticket, long candidate) { return isCurrent(ticket) && candidate == attempt; }
    synchronized long current() { return current; }
    synchronized boolean isCurrent(long ticket) { return !closed && active && ticket > 0 && ticket == current; }
    synchronized void complete(long ticket, long candidate) { if (isAttempt(ticket, candidate)) { active = false; continuation = false; } }
    synchronized void close() { closed = true; invalidate(); }
    synchronized void invalidate() { current++; attempt++; active = false; continuation = false; attempts = 0; }
}
