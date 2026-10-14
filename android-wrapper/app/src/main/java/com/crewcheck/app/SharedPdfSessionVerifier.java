package com.crewcheck.app;

import java.net.HttpURLConnection;
import java.net.URL;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/** Read-only first-party confirmation with a cancellable absolute total deadline. */
final class SharedPdfSessionVerifier {
    interface Clock { long elapsed(); long wall(); }
    interface Connections { HttpURLConnection open(String origin) throws Exception; }
    static final Clock CLOCK = new Clock() {
        public long elapsed() { return android.os.SystemClock.elapsedRealtime(); }
        public long wall() { return System.currentTimeMillis(); }
    };
    static final class Verified {
        final String owner; final long deadlineElapsedMs;
        Verified(String owner, long deadlineElapsedMs) { this.owner = owner; this.deadlineElapsedMs = deadlineElapsedMs; }
    }
    static final class Attempt {
        private final String origin, token;
        private final Clock clock;
        private final Connections connections;
        final long deadlineElapsedMs;
        private volatile boolean cancelled;
        private volatile HttpURLConnection connection;
        Attempt(String origin, String token) {
            this(origin, token, CLOCK, value -> (HttpURLConnection) new URL(value + "/api/auth/me").openConnection());
        }
        Attempt(String origin, String token, Clock clock, Connections connections) {
            this.origin=origin; this.token=token; this.clock=clock; this.connections=connections;
            long start=clock.elapsed();
            deadlineElapsedMs=start>=0 && start<=Long.MAX_VALUE-8000 ? start+8000 : -1;
        }
        boolean active() { return !cancelled && !Thread.currentThread().isInterrupted() && clock.elapsed()<deadlineElapsedMs; }
        private int remainingTimeout() throws java.io.IOException {
            if (!active()) throw new java.io.IOException("PDF session validation expired");
            return (int)Math.max(1,Math.min(8000,deadlineElapsedMs-clock.elapsed()));
        }
        void cancel() {
            cancelled=true;
            HttpURLConnection current=connection;
            if(current!=null)current.disconnect();
        }
        Verified verify() throws Exception {
            if (!active() || !SharedPdfChannelPolicy.allowedOrigin(origin) || token==null || token.isEmpty() || token.length()>16384
                    || token.indexOf('\r')>=0 || token.indexOf('\n')>=0) return null;
            HttpURLConnection current=connections.open(origin);
            connection=current;
            try {
                if (!active()) return null;
                current.setInstanceFollowRedirects(false);
                current.setConnectTimeout(remainingTimeout()); current.setReadTimeout(remainingTimeout());
                current.setRequestMethod("GET"); current.setUseCaches(false);
                current.setRequestProperty("Authorization","Bearer "+token);
                current.setRequestProperty("Accept","application/json");
                if (current.getResponseCode()!=200 || !active()) return null;
                try(InputStream input=current.getInputStream();ByteArrayOutputStream bytes=new ByteArrayOutputStream()) {
                    byte[] buffer=new byte[4096];int count;
                    while(true) {
                        current.setReadTimeout(remainingTimeout());
                        count=input.read(buffer);
                        if(!active())return null;
                        if(count==-1)break;
                        if(bytes.size()+count>65536)return null;
                        bytes.write(buffer,0,count);
                    }
                    JSONObject payload=new JSONObject(bytes.toString(StandardCharsets.UTF_8.name()));
                    if(!Boolean.TRUE.equals(payload.opt("ok"))||!Boolean.TRUE.equals(payload.opt("authenticated")))return null;
                    JSONObject user=payload.optJSONObject("user");
                    if(user==null||Boolean.TRUE.equals(user.opt("mustChangePassword")))return null;
                    Object id=user.opt("id");
                    if(!(id instanceof String)||((String)id).trim().isEmpty())return null;
                    // Expiry is interpreted only after server authentication; owner is never inferred from claims.
                    String[] parts=token.split("\\.");if(parts.length!=3)return null;
                    JSONObject claims=new JSONObject(new String(android.util.Base64.decode(parts[1],android.util.Base64.URL_SAFE|android.util.Base64.NO_WRAP|android.util.Base64.NO_PADDING),StandardCharsets.UTF_8));
                    Object exp=claims.opt("exp");if(!(exp instanceof Number))return null;
                    double seconds=((Number)exp).doubleValue();
                    if(!Double.isFinite(seconds)||seconds<=0||seconds>Long.MAX_VALUE/1000L||!active())return null;
                    long validatedAt=clock.elapsed();
                    long deadline=SharedPdfChannelPolicy.validationDeadline((long)(seconds*1000),clock.wall(),validatedAt);
                    if(!active()||deadline<=clock.elapsed())return null;
                    return new Verified((String)id,deadline);
                }
            } finally { current.disconnect();connection=null; }
        }
    }
}
