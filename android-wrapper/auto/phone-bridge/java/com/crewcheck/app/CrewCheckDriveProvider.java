package com.crewcheck.app;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.Binder;
import android.os.SystemClock;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;

/** Included ONLY by the explicit driveLab variant. No provider in production/debug builds. */
public final class CrewCheckDriveProvider extends ContentProvider {
    private static final String CALLER = "com.crewcheck.auto.prototype";
    private long lastRefresh = -30_000L;
    @Override public boolean onCreate() { return true; }
    private void enforce(Uri uri) {
        Context app = getContext();
        if (app == null || !"/v1/snapshot".equals(uri.getPath())
                || !(app.getPackageName() + ".drive").equals(uri.getAuthority())) {
            throw new IllegalArgumentException("URI inválida.");
        }
        if (!CALLER.equals(getCallingPackage()) || app.getPackageManager()
                .checkSignatures(Binder.getCallingUid(), app.getApplicationInfo().uid) != PackageManager.SIGNATURE_MATCH) {
            throw new SecurityException("Cliente de laboratório não autorizado.");
        }
    }
    @Override public Cursor query(Uri uri, String[] projection, String selection, String[] args, String order) {
        enforce(uri);
        if (selection != null || args != null || order != null
                || (projection != null && (projection.length != 1 || !"snapshotJson".equals(projection[0])))) {
            throw new IllegalArgumentException("Consulta não suportada.");
        }
        MatrixCursor out = new MatrixCursor(new String[]{"snapshotJson"});
        Context app = getContext();
        requestFreshProjection(app);
        String cached = app.getSharedPreferences("crewcheck_watch_sync", Context.MODE_PRIVATE)
                .getString("last_snapshot", "");
        try {
            if (cached == null || cached.getBytes(StandardCharsets.UTF_8).length > 16 * 1024 || cached.isBlank()) return out;
            JSONObject source = new JSONObject(CrewCheckWatchPublisher.sanitize(cached));
            JSONObject minimal = new JSONObject();
            for (String key : new String[]{"schemaVersion", "source", "contextId", "generatedAtEpochMs",
                    "validUntilEpochMs", "state", "presentationPlace", "presentationTime", "currentFlight"}) {
                if (source.has(key)) minimal.put(key, source.get(key));
            }
            if ("OVERNIGHT".equals(source.optString("state"))) minimal.put("detail", source.optString("detail", ""));
            out.addRow(new Object[]{minimal.toString()});
        } catch (Exception ignored) {
            // Fail closed, without disclosing raw data or changing the canonical roster.
        }
        return out;
    }
    private synchronized void requestFreshProjection(Context app) {
        long now = SystemClock.elapsedRealtime();
        if (now - lastRefresh < 30_000L) return;
        lastRefresh = now;
        // Uses the existing in-process projection path only when its Activity is alive.
        app.sendBroadcast(new Intent(MainActivity.ACTION_WATCH_SYNC_REQUEST).setPackage(app.getPackageName()));
    }
    @Override public String getType(Uri uri) { enforce(uri); return "vnd.android.cursor.item/vnd.crewcheck.drive.v1"; }
    @Override public Uri insert(Uri uri, ContentValues values) { throw new SecurityException("Somente leitura."); }
    @Override public int update(Uri uri, ContentValues values, String selection, String[] args) { throw new SecurityException("Somente leitura."); }
    @Override public int delete(Uri uri, String selection, String[] args) { throw new SecurityException("Somente leitura."); }
}
