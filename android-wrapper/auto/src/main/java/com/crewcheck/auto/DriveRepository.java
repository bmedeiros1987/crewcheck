package com.crewcheck.auto;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.LongSupplier;

/** Private local destinations plus an opt-in, same-signature, read-only lab bridge. */
public final class DriveRepository {
    static final String PHONE_PACKAGE = "com.crewcheck.app.drivelab";
    static final Uri SNAPSHOT_URI = Uri.parse("content://" + PHONE_PACKAGE + ".drive/v1/snapshot");
    private static DriveRepository instance;
    public static synchronized DriveRepository get(Context context) {
        if (instance == null) instance = new DriveRepository(context.getApplicationContext());
        return instance;
    }
    private final Context app;
    private final SharedPreferences prefs;
    private final LongSupplier clock;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final Set<Runnable> listeners = new LinkedHashSet<>();
    private DriveSnapshot snapshot;
    private String safeJson = "", status = "Sincronização desativada";
    private boolean inFlight;
    private long generation;
    private boolean wasFresh;
    private final Runnable expiry = this::onSnapshotExpiry;
    // A short grace period bridges Home -> Detail lifecycle handoff without losing the target.
    private final Runnable clearSession = () -> {
        if (!listeners.isEmpty()) return;
        generation++;
        snapshot = null;
        safeJson = "";
        wasFresh = false;
        handler.removeCallbacks(expiry);
        status = enabled() ? "Aguardando nova sincronização com o Phone Lab" : "Sincronização desativada";
    };
    private final Runnable tick = new Runnable() {
        @Override public void run() {
            if (listeners.isEmpty()) return;
            boolean fresh = snapshot != null && snapshot.isFresh(clock.getAsLong());
            if (fresh != wasFresh) { wasFresh = fresh; changed(); }
            scheduleExpiry();
            refresh();
            handler.postDelayed(this, 30_000L);
        }
    };

    private DriveRepository(Context context) {
        this(context, System::currentTimeMillis);
    }

    /** Clock seam for deterministic Android tests; normal instances use wall-clock epoch time. */
    DriveRepository(Context context, LongSupplier clock) {
        app = context;
        this.clock = Objects.requireNonNull(clock);
        prefs = app.getSharedPreferences("crewcheck_drive_lab", Context.MODE_PRIVATE);
        if (enabled()) status = "Conectando ao CrewCheck Phone Lab";
    }

    public boolean enabled() { return prefs.getBoolean("sync_enabled", false); }
    public void setEnabled(boolean enabled) {
        generation++;
        prefs.edit().putBoolean("sync_enabled", enabled).apply();
        snapshot = null;
        safeJson = "";
        wasFresh = false;
        handler.removeCallbacks(expiry);
        status = enabled ? "Conectando ao CrewCheck Phone Lab" : "Sincronização desativada";
        changed();
        if (enabled) refresh();
    }
    public void start(Runnable listener) {
        handler.removeCallbacks(clearSession);
        listeners.add(listener);
        listener.run();
        handler.removeCallbacks(tick);
        handler.post(tick);
    }
    public void stop(Runnable listener) {
        listeners.remove(listener);
        if (listeners.isEmpty()) {
            handler.removeCallbacks(tick);
            handler.removeCallbacks(expiry);
            handler.removeCallbacks(clearSession);
            handler.postDelayed(clearSession, 1000L);
        }
    }
    public String status() {
        if (snapshot != null && !snapshot.isFresh(clock.getAsLong())) {
            return "Dados desatualizados. Atualize a escala no Phone Lab.";
        }
        return status;
    }
    public DriveSnapshot snapshot() { return snapshot; }

    // Expiry is a local UI event, not another provider query. Never extends source validity.
    private void scheduleExpiry() {
        handler.removeCallbacks(expiry);
        long now = clock.getAsLong();
        if (listeners.isEmpty() || snapshot == null || !snapshot.isFresh(now)) return;
        long deadline = Math.min(snapshot.validUntil, snapshot.generatedAt + DriveSnapshot.MAX_AGE_MS);
        handler.postDelayed(expiry, Math.max(1L, deadline - now));
    }
    private void onSnapshotExpiry() {
        if (listeners.isEmpty()) return;
        boolean fresh = snapshot != null && snapshot.isFresh(clock.getAsLong());
        if (fresh != wasFresh) { wasFresh = fresh; changed(); }
        // The wall clock may have changed while the callback was waiting.
        scheduleExpiry();
    }

    public void refresh() {
        if (!enabled() || inFlight || listeners.isEmpty()) return;
        inFlight = true;
        final long requestGeneration = generation;
        io.execute(() -> {
            DriveSnapshot next = null;
            String nextJson = "";
            String message;
            try {
                PackageManager pm = app.getPackageManager();
                if (pm.checkSignatures(app.getPackageName(), PHONE_PACKAGE) != PackageManager.SIGNATURE_MATCH) {
                    message = "Instale os dois APKs de laboratório do mesmo build.";
                } else {
                    try (Cursor cursor = app.getContentResolver().query(SNAPSHOT_URI,
                            new String[]{"snapshotJson"}, null, null, null)) {
                        if (cursor == null || !cursor.moveToFirst() || cursor.isNull(0)) {
                            message = "Abra a escala no CrewCheck Phone Lab para sincronizar.";
                        } else {
                            next = DriveSnapshot.parse(cursor.getString(0), clock.getAsLong());
                            nextJson = next.toSafeJson();
                            message = "Escala recebida em modo somente leitura";
                        }
                    }
                }
            } catch (SecurityException error) {
                message = "Conexão não autorizada. Use o par de APKs do mesmo build.";
            } catch (Exception error) {
                message = "Não foi possível ler a escala. Abra o Phone Lab.";
            }
            final DriveSnapshot result = next;
            final String normalized = nextJson;
            final String resultStatus = message;
            handler.post(() -> {
                inFlight = false;
                if (requestGeneration != generation || !enabled() || listeners.isEmpty()) return;
                boolean fresh = result != null && result.isFresh(clock.getAsLong());
                boolean different = !normalized.equals(safeJson) || !resultStatus.equals(status) || fresh != wasFresh;
                snapshot = result;
                safeJson = normalized;
                status = resultStatus;
                wasFresh = fresh;
                scheduleExpiry();
                if (different) changed();
            });
        });
    }

    public List<DriveSnapshot.Destination> destinations() {
        List<DriveSnapshot.Destination> values = new ArrayList<>();
        if (snapshot != null) values.addAll(snapshot.destinations(clock.getAsLong()));
        values.addAll(manual());
        return values;
    }
    public boolean mayNavigate(DriveSnapshot.Destination target) {
        for (DriveSnapshot.Destination current : destinations()) if (current.sameTarget(target)) return true;
        return false;
    }
    public List<DriveSnapshot.Destination> manual() {
        List<DriveSnapshot.Destination> values = new ArrayList<>();
        try {
            JSONArray array = new JSONArray(prefs.getString("manual", "[]"));
            for (int i = 0; i < Math.min(array.length(), 4); i++) {
                JSONObject item = array.getJSONObject(i);
                values.add(new DriveSnapshot.Destination(item.getString("id"), item.getString("title"),
                        item.getString("query"), "Destino salvo no celular", false));
            }
        } catch (Exception ignored) { values.clear(); }
        return values;
    }
    public void addManual(String title, String query) throws Exception {
        List<DriveSnapshot.Destination> values = manual();
        if (values.size() >= 4) throw new IllegalArgumentException("Limite de quatro destinos salvos.");
        values.add(new DriveSnapshot.Destination(UUID.randomUUID().toString(), title, query,
                "Destino salvo no celular", false));
        JSONArray out = new JSONArray();
        for (DriveSnapshot.Destination value : values) out.put(new JSONObject().put("id", value.id)
                .put("title", value.title).put("query", value.query));
        prefs.edit().putString("manual", out.toString()).apply();
        changed();
    }
    public void clearManual() { prefs.edit().remove("manual").apply(); changed(); }
    private void changed() { for (Runnable listener : new ArrayList<>(listeners)) listener.run(); }
}
