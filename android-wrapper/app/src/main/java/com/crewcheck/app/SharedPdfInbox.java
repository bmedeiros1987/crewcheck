package com.crewcheck.app;

import android.content.ContentResolver;
import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.ByteArrayInputStream;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.Locale;
import java.util.UUID;
import java.security.MessageDigest;

/**
 * Durable private inbox for PDFs explicitly shared with CrewCheck.
 *
 * The file stays in app-private storage until the canonical roster importer
 * acknowledges success. Activity/WebView recreation therefore cannot consume
 * the only copy of a pending handoff.
 */
public final class SharedPdfInbox {
    private static final String PREFS = "crewcheck_shared_pdf_inbox_v1";
    private static final String KEY_ID = "pending_id";
    private static final String KEY_NAME = "pending_name";
    private static final String KEY_PATH = "pending_path";
    private static final String KEY_CREATED_AT = "pending_created_at";
    private static final String KEY_SOURCE = "source_hash";
    private static final String KEY_OWNER = "receipt_owner";
    private static final String KEY_PHASE = "receipt_phase";
    private static final String DIRECTORY = "shared-pdf-inbox";
    private static final long MAX_PENDING_AGE_MS = 7L * 24L * 60L * 60L * 1000L;

    private SharedPdfInbox() {}

    public static final class PendingPdf {
        public final String id;
        public final String fileName;
        public final File file;
        public final long createdAt;

        PendingPdf(String id, String fileName, File file, long createdAt) {
            this.id = id;
            this.fileName = fileName;
            this.file = file;
            this.createdAt = createdAt;
        }
    }

    public static synchronized PendingPdf capture(Context context, Uri uri, int maxBytes, String initialOwner) throws Exception {
        if (context == null || uri == null) throw new IllegalArgumentException("PDF compartilhado sem origem.");

        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String sourceHash = sourceHash(uri.toString());
        String legacy = prefs.getString("legacy_quarantine_id", "");
        if (legacy.isEmpty() && prefs.contains(KEY_ID) && !prefs.contains(KEY_SOURCE)) legacy = prefs.getString(KEY_ID, "");
        if (!legacy.isEmpty()) {
            if (!persist(context, prefs.edit().putString("source_" + sourceHash, legacy)
                    .putString(KEY_SOURCE, sourceHash).putString(KEY_PHASE, "blocked").putString(KEY_OWNER, "")
                    .remove("legacy_quarantine_id"))) throw new IllegalStateException("Não consegui preservar a quarentena do PDF antigo.");
            throw new IllegalStateException("PDF antigo sem proveniência. Use a seleção manual; o pendente foi preservado.");
        }
        PendingPdf retained = peek(context);
        if (retained != null && sourceHash.equals(prefs.getString(KEY_SOURCE, ""))) return retained;
        if (prefs.contains("source_" + sourceHash)) {
            throw new IllegalStateException("Este PDF já foi recebido. Use a seleção manual para uma nova importação.");
        }
        boolean signedOut = initialOwner == null || initialOwner.trim().isEmpty();
        if (signedOut && retained != null) {
            if (!persist(context, prefs.edit().putString("source_" + sourceHash, "blocked_" + UUID.randomUUID())))
                throw new IllegalStateException("Não consegui preservar a quarentena.");
            throw new IllegalStateException("Entre na conta correta e selecione o PDF manualmente. O pendente anterior foi preservado.");
        }
        File directory = new File(context.getFilesDir(), DIRECTORY);
        if (!directory.exists() && !directory.mkdirs()) {
            throw new IllegalStateException("Não consegui preparar a caixa de entrada do CrewCheck.");
        }

        String fileName = resolveDisplayName(context.getContentResolver(), uri);
        if (fileName == null || fileName.trim().isEmpty()) fileName = "CrewCheck-escala.pdf";
        fileName = sanitizeFileName(fileName);
        if (!fileName.toLowerCase(Locale.US).endsWith(".pdf")) fileName += ".pdf";

        String id = "share_" + UUID.randomUUID();
        File temporary = new File(directory, id + ".tmp");
        File destination = new File(directory, id + ".pdf");

        int total = 0;
        byte[] header = new byte[5];
        int headerLength = 0;
        try (InputStream input = signedOut ? new ByteArrayInputStream(new byte[0]) : context.getContentResolver().openInputStream(uri);
             FileOutputStream output = new FileOutputStream(temporary)) {
            if (input == null) throw new IllegalStateException("PDF compartilhado sem conteúdo.");
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1) {
                total += read;
                if (total > maxBytes) throw new IllegalStateException("PDF maior que " + (maxBytes / (1024 * 1024)) + " MB.");
                if (headerLength < header.length) {
                    int copy = Math.min(read, header.length - headerLength);
                    System.arraycopy(buffer, 0, header, headerLength, copy);
                    headerLength += copy;
                }
                output.write(buffer, 0, read);
            }
            output.flush();
            output.getFD().sync();
        } catch (Exception error) {
            //noinspection ResultOfMethodCallIgnored
            temporary.delete();
            throw error;
        }

        if (!signedOut && (total <= 0 || headerLength < 5
                || header[0] != '%' || header[1] != 'P' || header[2] != 'D' || header[3] != 'F' || header[4] != '-')) {
            //noinspection ResultOfMethodCallIgnored
            temporary.delete();
            throw new IllegalStateException("Arquivo recebido não parece ser um PDF válido.");
        }

        if (!temporary.renameTo(destination)) {
            try (FileInputStream input = new FileInputStream(temporary);
                 FileOutputStream output = new FileOutputStream(destination)) {
                byte[] buffer = new byte[8192];
                int read;
                while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
                output.flush();
                output.getFD().sync();
            }
            //noinspection ResultOfMethodCallIgnored
            temporary.delete();
        }

        PendingPdf previous = peek(context);
        long createdAt = System.currentTimeMillis();
        boolean saved = persist(context, context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putString(KEY_ID, id).putString(KEY_NAME, fileName)
                .putString(KEY_PATH, destination.getAbsolutePath()).putLong(KEY_CREATED_AT, createdAt)
                .putString(KEY_SOURCE, sourceHash).putString("source_" + sourceHash, id)
                .putString(KEY_OWNER, initialOwner == null ? "" : initialOwner)
                .putString(KEY_PHASE, initialOwner == null || initialOwner.trim().isEmpty() ? "blocked" : "unclaimed"));
        if (!saved) {
            destination.delete();
            throw new IllegalStateException("Não consegui preservar o PDF recebido. O pendente anterior foi mantido.");
        }
        if (previous != null && !previous.file.equals(destination)) previous.file.delete();

        return new PendingPdf(id, fileName, destination, createdAt);
    }

    public static synchronized PendingPdf peek(Context context) {
        if (context == null) return null;
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String id = prefs.getString(KEY_ID, "");
        String name = prefs.getString(KEY_NAME, "");
        String path = prefs.getString(KEY_PATH, "");
        long createdAt = prefs.getLong(KEY_CREATED_AT, 0L);
        if (id == null || id.trim().isEmpty() || path == null || path.trim().isEmpty()) return null;

        File file = new File(path);
        long now = System.currentTimeMillis();
        boolean expired = createdAt <= 0L || createdAt > now || now - createdAt > MAX_PENDING_AGE_MS;
        if (!file.isFile() || expired) {
            if (!prefs.contains(KEY_SOURCE) && !persist(context,prefs.edit().putString("legacy_quarantine_id",id))) return null;
            clear(context, id);
            return null;
        }
        return new PendingPdf(id, name == null || name.trim().isEmpty() ? "CrewCheck-escala.pdf" : name, file, createdAt);
    }

    public static synchronized byte[] readChunk(Context context, String expectedId, long offset, int requestedLength, int maxBytes) throws Exception {
        PendingPdf pending = peek(context);
        if (pending == null) throw new IllegalStateException("Nenhum PDF compartilhado pendente.");
        if (expectedId == null || expectedId.trim().isEmpty() || !pending.id.equals(expectedId.trim())) {
            throw new IllegalStateException("O PDF compartilhado pendente mudou.");
        }
        long length = pending.file.length();
        if (length <= 0L || length > maxBytes) throw new IllegalStateException("PDF compartilhado com tamanho inválido.");
        if (offset < 0L || offset > length) throw new IllegalArgumentException("Offset inválido.");
        int safeLength = Math.max(0, Math.min(requestedLength, 256 * 1024));
        safeLength = (int) Math.min((long) safeLength, length - offset);
        if (safeLength == 0) return new byte[0];

        byte[] buffer = new byte[safeLength];
        try (FileInputStream input = new FileInputStream(pending.file)) {
            long skipped = 0L;
            while (skipped < offset) {
                long step = input.skip(offset - skipped);
                if (step <= 0L) {
                    if (input.read() == -1) throw new IllegalStateException("Fim inesperado do PDF compartilhado.");
                    step = 1L;
                }
                skipped += step;
            }
            int readTotal = 0;
            while (readTotal < safeLength) {
                int read = input.read(buffer, readTotal, safeLength - readTotal);
                if (read < 0) break;
                readTotal += read;
            }
            if (readTotal == safeLength) return buffer;
            byte[] trimmed = new byte[readTotal];
            System.arraycopy(buffer, 0, trimmed, 0, readTotal);
            return trimmed;
        }
    }

    public static synchronized String owner(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_OWNER, "");
    }
    public static synchronized String phase(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_PHASE, "unclaimed");
    }
    private static boolean same(Context context, String id) {
        PendingPdf pending = peek(context);
        return pending != null && id != null && pending.id.equals(id.trim());
    }
    private static boolean owned(Context context, String id, String account) {
        return same(context, id) && account != null && !account.trim().isEmpty()
                && account.equals(owner(context)) && !"blocked".equals(phase(context));
    }
    public static synchronized boolean block(Context context, String id) {
        if (!same(context, id) || !owner(context).isEmpty()) return false;
        return persist(context, context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_PHASE, "blocked"));
    }
    public static synchronized boolean claim(Context context, String id, String account) {
        if (!same(context, id) || account == null || account.trim().isEmpty() || "blocked".equals(phase(context))) return false;
        String previous = owner(context);
        if (previous.isEmpty() || !previous.equals(account)) return false;
        if ("claimed".equals(phase(context))) return true;
        if (!"unclaimed".equals(phase(context))) return false;
        return persist(context, context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putString(KEY_OWNER, account).putString(KEY_PHASE, "claimed"));
    }
    public static synchronized boolean beginCommit(Context context, String id, String account) {
        if (!owned(context, id, account) || !"claimed".equals(phase(context))) return false;
        return persist(context, context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_PHASE, "committing"));
    }
    public static synchronized boolean confirmCommit(Context context, String id, String account) {
        if (!owned(context, id, account) || !"committing".equals(phase(context))) return false;
        return persist(context, context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_PHASE, "committed"));
    }
    public static synchronized byte[] readClaimedChunk(Context context, String id, String account, long offset, int length, int maxBytes) throws Exception {
        if (!owned(context, id, account) || !"claimed".equals(phase(context))) throw new IllegalStateException("PDF sem reivindicação válida.");
        return readChunk(context, id, offset, length, maxBytes);
    }
    public static synchronized boolean acknowledge(Context context, String id, String account) {
        if (!owned(context, id, account) || !"committed".equals(phase(context))) return false;
        return clear(context, id);
    }
    private static boolean clear(Context context, String expectedId) {
        if (context == null || expectedId == null || expectedId.trim().isEmpty()) return false;
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (!expectedId.equals(prefs.getString(KEY_ID, ""))) return false;
        String path = prefs.getString(KEY_PATH, "");
        boolean saved = persist(context, prefs.edit().remove(KEY_ID).remove(KEY_NAME).remove(KEY_PATH)
                .remove(KEY_CREATED_AT).remove(KEY_SOURCE).remove(KEY_OWNER).remove(KEY_PHASE));
        if (!saved) return false;
        if (path != null && !path.isEmpty()) new File(path).delete();
        return true;
    }
    private static boolean persist(Context context, SharedPreferences.Editor changes) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        java.util.Map<String, ?> before = new java.util.HashMap<>(prefs.getAll());
        try { if (changes.commit()) return true; }
        catch (RuntimeException ignored) { /* Restore the previous memory view below. */ }
        // Android updates its in-memory map even when disk commit fails.
        // Restore that map too, retaining the prior durable pointer and file.
        SharedPreferences.Editor rollback = prefs.edit().clear();
        for (java.util.Map.Entry<String, ?> item : before.entrySet()) {
            if (item.getValue() instanceof String) rollback.putString(item.getKey(), (String) item.getValue());
            else if (item.getValue() instanceof Long) rollback.putLong(item.getKey(), (Long) item.getValue());
        }
        try { rollback.commit(); } catch (RuntimeException ignored) { /* No file is removed on failure. */ }
        return false;
    }

    private static String sourceHash(String value) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes("UTF-8"));
        StringBuilder out = new StringBuilder();
        for (byte item : digest) out.append(String.format(Locale.US, "%02x", item & 255));
        return out.toString();
    }

    private static String resolveDisplayName(ContentResolver resolver, Uri uri) {
        if (resolver == null || uri == null) return null;
        try (Cursor cursor = resolver.query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (index >= 0) {
                    String value = cursor.getString(index);
                    if (value != null && !value.trim().isEmpty()) return value.trim();
                }
            }
        } catch (Exception ignored) {}
        String last = uri.getLastPathSegment();
        if (last == null || last.trim().isEmpty()) return null;
        int slash = Math.max(last.lastIndexOf('/'), last.lastIndexOf('\\'));
        return slash >= 0 ? last.substring(slash + 1) : last;
    }

    private static String sanitizeFileName(String value) {
        String safe = String.valueOf(value).replaceAll("[\\\\/:*?\"<>|]", "_").trim();
        if (safe.length() > 180) safe = safe.substring(safe.length() - 180);
        return safe.isEmpty() ? "CrewCheck-escala.pdf" : safe;
    }
}
