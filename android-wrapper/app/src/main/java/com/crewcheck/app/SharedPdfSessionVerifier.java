package com.crewcheck.app;

import java.net.HttpURLConnection;
import java.net.URL;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/** Read-only, first-party session confirmation. No redirects, cookies or logging. */
final class SharedPdfSessionVerifier {
    static final class Verified {
        final String owner; final long lifetimeMs;
        Verified(String owner, long lifetimeMs) { this.owner = owner; this.lifetimeMs = lifetimeMs; }
    }
    static Verified verify(String origin, String token) throws Exception {
        if (!SharedPdfChannelPolicy.allowedOrigin(origin) || token == null || token.isEmpty() || token.length() > 16384
                || token.indexOf('\r') >= 0 || token.indexOf('\n') >= 0) return null;
        HttpURLConnection connection = (HttpURLConnection) new URL(origin + "/api/auth/me").openConnection();
        try {
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(8000); connection.setReadTimeout(8000);
            connection.setRequestMethod("GET"); connection.setUseCaches(false);
            connection.setRequestProperty("Authorization", "Bearer " + token);
            connection.setRequestProperty("Accept", "application/json");
            if (connection.getResponseCode() != 200) return null;
            try (InputStream input = connection.getInputStream(); ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[4096]; int count;
                while ((count = input.read(buffer)) != -1) {
                    if (bytes.size() + count > 65536) return null;
                    bytes.write(buffer,0,count);
                }
                JSONObject payload = new JSONObject(bytes.toString(StandardCharsets.UTF_8.name()));
                if (!Boolean.TRUE.equals(payload.opt("ok")) || !Boolean.TRUE.equals(payload.opt("authenticated"))) return null;
                JSONObject user = payload.optJSONObject("user");
                if (user == null || Boolean.TRUE.equals(user.opt("mustChangePassword"))) return null;
                Object id = user.opt("id");
                if (!(id instanceof String) || ((String) id).trim().isEmpty()) return null;
                // Claims are used only AFTER server validation; never infer an owner from them.
                String[] parts = token.split("\\.");
                if (parts.length != 3) return null;
                JSONObject claims = new JSONObject(new String(android.util.Base64.decode(parts[1], android.util.Base64.URL_SAFE | android.util.Base64.NO_WRAP | android.util.Base64.NO_PADDING), StandardCharsets.UTF_8));
                Object exp = claims.opt("exp");
                if (!(exp instanceof Number)) return null;
                double expirySeconds = ((Number) exp).doubleValue();
                if (!Double.isFinite(expirySeconds) || expirySeconds <= 0 || expirySeconds > Long.MAX_VALUE / 1000L) return null;
                long remaining = (long) (expirySeconds * 1000) - System.currentTimeMillis();
                if (remaining <= 0 || remaining > 366L * 24 * 60 * 60 * 1000) return null;
                return new Verified((String) id, Math.min(120000L, remaining));
            }
        } finally { connection.disconnect(); }
    }
}
