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
        long identity = Binder.clearCallingIdentity();
        try {
            Context app = getContext();
            requestFreshProjection(app);
            String cached = app.getSharedPreferences("crewcheck_watch_sync", Context.MODE_PRIVATE)
                    .getString("last_snapshot", "");
            if (cached == null || cached.getBytes(StandardCharsets.UTF_8).length > 16 * 1024 || cached.trim().isEmpty()) return out;
            // This private cache is written by the existing native publisher. Rebuild a smaller allow-list.
            JSONObject source = new JSONObject(cached);
            if (source.optInt("schemaVersion", 0) != 1 || !"canonical-roster".equals(source.optString("source"))) return out;
            JSONObject minimal = new JSONObject();
            for (String key : new String[]{"schemaVersion", "source", "contextId", "generatedAtEpochMs",
                    "validUntilEpochMs", "state", "presentationPlace", "presentationTime", "currentFlight"}) {
                Object value = source.opt(key);
                if (value instanceof String) {
                    String clean = ((String) value).replaceAll("[\\p{Cntrl}\\p{Cf}]", " ").trim();
                    minimal.put(key, clean.substring(0, Math.min(clean.length(), 96)));
                } else if (value instanceof Number) minimal.put(key, value);
            }
            if ("OVERNIGHT".equals(source.optString("state"))) {
                Object hotel = source.opt("detail");
                if (hotel instanceof String) {
                    String clean = ((String) hotel).replaceAll("[\\p{Cntrl}\\p{Cf}]", " ").trim();
                    minimal.put("detail", clean.substring(0, Math.min(clean.length(), 96)));
                }
            }
            out.addRow(new Object[]{minimal.toString()});
        } catch (Exception ignored) {
            // Fail closed, without disclosing raw data or changing the canonical roster.
        } finally { Binder.restoreCallingIdentity(identity); }
        return out;
    }
    private synchronized void requestFreshProjection(Context app) {
        long now = SystemClock.elapsedRealtime();
        if (now - lastRefresh < 30_000L) return;
        lastRefresh = now;
        app.sendBroadcast(new Intent(MainActivity.ACTION_WATCH_SYNC_REQUEST).setPackage(app.getPackageName()));
    }
    @Override public String getType(Uri uri) { enforce(uri); return "vnd.android.cursor.item/vnd.crewcheck.drive.v1"; }
    @Override public Uri insert(Uri uri, ContentValues values) { throw new SecurityException("Somente leitura."); }
    @Override public int update(Uri uri, ContentValues values, String selection, String[] args) { throw new SecurityException("Somente leitura."); }
    @Override public int delete(Uri uri, String selection, String[] args) { throw new SecurityException("Somente leitura."); }
}
