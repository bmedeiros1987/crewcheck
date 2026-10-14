package com.crewcheck.app;

import java.net.URI;
import java.util.Set;

/** PDF-only authority. Caller fields never establish an account. */
final class SharedPdfChannelPolicy {
    static final Set<String> ORIGINS = java.util.Collections.unmodifiableSet(new java.util.HashSet<>(java.util.Arrays.asList("https://crewcheck.online", "https://www.crewcheck.online", "https://crewcheck.onrender.com")));
    private long epoch;
    private String document = "", origin = "", owner;
    private long validUntil;
    static boolean allowedOrigin(String raw) {
        try {
            URI uri = new URI(raw);
            return uri.getUserInfo() == null && (uri.getRawPath() == null || uri.getRawPath().isEmpty())
                && uri.getRawQuery() == null && uri.getRawFragment() == null && ORIGINS.contains(raw);
        } catch (Exception ignored) { return false; }
    }
    static long validationDeadline(long tokenExpiryMs, long wallNow, long elapsedNow) {
        if (wallNow < 0 || elapsedNow < 0 || tokenExpiryMs <= wallNow) return -1;
        long remaining = tokenExpiryMs - wallNow;
        if (remaining > 366L * 24 * 60 * 60 * 1000) return -1;
        long duration = Math.min(120000L, remaining);
        return elapsedNow <= Long.MAX_VALUE - duration ? elapsedNow + duration : -1;
    }
    synchronized long invalidate(String nextDocument, String nextOrigin) {
        epoch++; owner = null; validUntil = 0;
        document = nextDocument; origin = allowedOrigin(nextOrigin) ? nextOrigin : "";
        return epoch;
    }
    synchronized long begin(String sourceOrigin, boolean mainFrame, String suppliedDocument) {
        if (!acceptsDocument(sourceOrigin, mainFrame, suppliedDocument)) return -1;
        epoch++; owner = null; validUntil = 0; return epoch;
    }
    synchronized boolean acceptsDocument(String sourceOrigin, boolean mainFrame, String suppliedDocument) {
        return mainFrame && allowedOrigin(sourceOrigin) && sourceOrigin.equals(origin)
            && !document.isEmpty() && document.equals(suppliedDocument);
    }
    synchronized boolean validate(long expectedEpoch, String verifiedOwner, long deadline, long now) {
        if (expectedEpoch != epoch || verifiedOwner == null || verifiedOwner.trim().isEmpty() || deadline <= now) return false;
        owner = verifiedOwner; validUntil = deadline; return true;
    }
    synchronized String owner(long expectedEpoch, long now) {
        return expectedEpoch == epoch && now < validUntil ? owner : null;
    }
    synchronized long epoch() { return epoch; }
}
