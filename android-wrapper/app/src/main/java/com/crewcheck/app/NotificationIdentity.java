package com.crewcheck.app;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/** Stable opaque PendingIntent identity. Extras are not part of Android identity. */
public final class NotificationIdentity {
    private NotificationIdentity() {}
    public static String key(String title, String body, long at) {
        try {
            // Length framing avoids ambiguous concatenations; no content is exposed in the URI.
            String t = title == null ? "" : title;
            String b = body == null ? "" : body;
            String framed = t.length() + ":" + t + b.length() + ":" + b + ":" + at;
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(framed.getBytes(StandardCharsets.UTF_8));
            StringBuilder out = new StringBuilder();
            for (byte value : digest) out.append(String.format(java.util.Locale.ROOT, "%02x", value & 255));
            return out.toString();
        } catch (java.security.NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }
}
