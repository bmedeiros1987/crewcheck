package com.crewcheck.app;

/** Activity-local work tickets. An ACK can continue one original read once, never create work. */
final class CrewLifeSyncWork {
    private long current;
    private boolean continuation;
    private boolean closed;
    synchronized long start() { if (closed) return 0; current++; continuation = true; return current; }
    synchronized long claim() {
        if (closed || !continuation) return 0;
        continuation = false;
        return current;
    }
    synchronized long current() { return current; }
    synchronized boolean isCurrent(long ticket) { return ticket > 0 && ticket == current; }
    synchronized void complete(long ticket) { if (ticket == current) continuation = false; }
    synchronized void close() { closed = true; invalidate(); }
    synchronized void invalidate() { current++; continuation = false; }
}
