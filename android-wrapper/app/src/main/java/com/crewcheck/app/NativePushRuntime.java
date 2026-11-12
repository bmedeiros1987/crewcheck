package com.crewcheck.app;

import android.content.Context;
import android.content.SharedPreferences;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.messaging.FirebaseMessaging;
import java.util.UUID;
import org.json.JSONObject;

/** Dormant enrollment adapter. No automatic initialization, permission prompts or sender. */
public final class NativePushRuntime {
    private static final Object LOCK = new Object();
    private NativePushRuntime() {}
    private static NativePushSession session(Context context) {
        SharedPreferences prefs = context.getSharedPreferences("crewcheck-native-push-v1", Context.MODE_PRIVATE);
        return new NativePushSession(new NativePushSession.Store() {
            public NativePushSession.State read() {
                String id = prefs.getString("installation", "");
                if (id.isEmpty()) {
                    id = UUID.randomUUID().toString();
                    if (!prefs.edit().putString("installation", id).commit()) return null;
                }
                return new NativePushSession.State(id, prefs.getString("owner", ""), prefs.getString("token", ""), prefs.getLong("generation", 0), prefs.getLong("tokenRevision", 0));
            }
            public boolean commit(NativePushSession.State state) {
                return prefs.edit().putString("owner", state.ownerId).putString("token", state.token)
                    .putLong("generation", state.generation).putLong("tokenRevision", state.tokenRevision).commit();
            }
        }, NativePushPolicy.configured());
    }
    public static boolean scope(Context context, String owner) {
        if (!NativePushPolicy.configured()) return false;
        synchronized (LOCK) { return session(context).scope(owner); }
    }
    public static boolean requestToken(Context context) {
        if (!NativePushPolicy.configured() || !"com.crewcheck.app".equals(context.getPackageName())) return false;
        synchronized (LOCK) {
            NativePushSession.State captured = session(context).read();
            if (captured == null || captured.ownerId.isEmpty()) return false;
            FirebaseApp app;
            try { app = FirebaseApp.getInstance(); }
            catch (IllegalStateException absent) {
                app = FirebaseApp.initializeApp(context.getApplicationContext(), new FirebaseOptions.Builder()
                    .setProjectId(NativePushPolicy.PROJECT_ID).setGcmSenderId(NativePushPolicy.SENDER_ID)
                    .setApplicationId(NativePushPolicy.APP_ID).setApiKey(NativePushPolicy.PUBLIC_API_KEY).build());
            }
            if (app == null || !NativePushPolicy.PROJECT_ID.equals(app.getOptions().getProjectId())
                    || !NativePushPolicy.APP_ID.equals(app.getOptions().getApplicationId())) return false;
            // Auto-init stays false. Explicit enrollment alone may request a token after future review.
            FirebaseMessaging.getInstance().setAutoInitEnabled(false);
            FirebaseMessaging.getInstance().getToken().addOnSuccessListener(value -> {
                synchronized (LOCK) { session(context).requested(captured, value); }
            });
            return true; // Request accepted, not registered or delivered.
        }
    }
    public static void rotated(Context context, String value) {
        if (!NativePushPolicy.configured()) return;
        synchronized (LOCK) {
            NativePushSession state = session(context); NativePushSession.State current = state.read();
            if (current != null) state.token(current.generation, value);
        }
    }
    public static String snapshot(Context context) {
        try {
            JSONObject result = new JSONObject().put("enabled", NativePushPolicy.configured()).put("received", JSONObject.NULL);
            if (!NativePushPolicy.configured()) return result.toString();
            synchronized (LOCK) {
                NativePushSession.State state = session(context).read();
                if (state != null) result.put("installationId", state.installationId).put("ownerId", state.ownerId)
                    .put("generation", Long.toString(state.generation)).put("tokenRevision", Long.toString(state.tokenRevision)).put("token", state.token);
            }
            return result.toString();
        } catch (Exception ignored) { return "{\"enabled\":false,\"received\":null}"; }
    }
}
