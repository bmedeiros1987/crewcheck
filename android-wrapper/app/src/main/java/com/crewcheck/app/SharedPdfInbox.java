package com.crewcheck.app;

import android.content.ContentResolver;
import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.Locale;

/**
 * Durable private inbox for PDFs shared with CrewCheck.
 *
 * The shared file is copied into app-private storage and remains there until the
 * canonical roster import explicitly acknowledges success. This makes the
 * handoff resilient to Activity/WebView recreation and is also reusable by a
 * future native/offline UI that does not use WebView.
 */
public final class SharedPdfInbox {
    private static final String PREFS = "crewcheck_shared_pdf_inbox_v1";
    private static final String KEY_ID = "pending_id";
    private static final String KEY_NAME = "pending_name";
    private static final String KEY_PATH = "pending_path";
    private static final String KEY_CREATED_AT = "pending_created_at";
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

    public static synchronized PendingPdf capture(Context context, Uri uri, int maxBytes) throws Exception {
        if (context == null || uri == null) throw new IllegalArgumentException("PDF compartilhado sem origem.");

        File directory = new File(context.getFilesDir(), DIRECTORY);
        if (!directory.exists() && !directory.mkdirs()) {
            throw new IllegalStateException("Não consegui preparar a caixa de entrada do CrewCheck.");
        }

        String fileName = resolveDisplayName(context.getContentResolver(), uri);
        if (fileName == null || fileName.trim().isEmpty()) fileName = "CrewCheck-escala.pdf";
        fileName = sanitizeFileName(fileName);
        if (!fileName.toLowerCase(Locale.US).endsWith(".pdf")) fileName += ".pdf";

        String id = "share_" + System.currentTimeMillis() + "_" + Integer.toHexString(uri.toString().hashCode());
        File temporary = new File(directory, id + ".tmp");
        File destination = new File(directory, id + ".pdf");

        int total = 0;
        byte[] header = new byte[5];
        int headerLength = 0;
        try (InputStream input = context.getContentResolver().openInputStream(uri);
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

        if (total <= 0 || headerLength < 5
                || header[0] != '%' || header[1] != 'P' || header[2] != 'D' || header[3] != 'F' || header[4] != '-') {
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
        if (previous != null && !previous.file.equals(destination)) {
            // A newest explicit share supersedes the previously pending share.
            //noinspection ResultOfMethodCallIgnored
            previous.file.delete();
        }

        long createdAt = System.currentTimeMillis();
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_ID, id)
                .putString(KEY_NAME, fileName)
                .putString(KEY_PATH, destination.getAbsolutePath())
                .putLong(KEY_CREATED_AT, createdAt)
                .apply();

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
        boolean expired = createdAt > 0L && System.currentTimeMillis() - createdAt > MAX_PENDING_AGE_MS;
        if (!file.isFile() || expired) {
            clear(context, id);
            return null;
        }
        return new PendingPdf(id, name == null || name.trim().isEmpty() ? "CrewCheck-escala.pdf" : name, file, createdAt);
    }

    public static synchronized byte[] readBytes(Context context, String expectedId, int maxBytes) throws Exception {
        PendingPdf pending = peek(context);
        if (pending == null) throw new IllegalStateException("Nenhum PDF compartilhado pendente.");
        if (expectedId != null && !expectedId.trim().isEmpty() && !pending.id.equals(expectedId.trim())) {
            throw new IllegalStateException("O PDF compartilhado pendente mudou.");
        }
        if (pending.file.length() <= 0L || pending.file.length() > maxBytes) {
            throw new IllegalStateException("PDF compartilhado com tamanho inválido.");
        }

        try (FileInputStream input = new FileInputStream(pending.file);
             ByteArrayOutputStream output = new ByteArrayOutputStream((int) Math.min(pending.file.length(), maxBytes))) {
            byte[] buffer = new byte[8192];
            int read;
            int total = 0;
            while ((read = input.read(buffer)) != -1) {
                total += read;
                if (total > maxBytes) throw new IllegalStateException("PDF compartilhado excedeu o limite.");
                output.write(buffer, 0, read);
            }
            byte[] bytes = output.toByteArray();
            if (bytes.length < 5 || bytes[0] != '%' || bytes[1] != 'P' || bytes[2] != 'D' || bytes[3] != 'F' || bytes[4] != '-') {
                throw new IllegalStateException("PDF compartilhado inválido.");
            }
            return bytes;
        }
    }

    public static synchronized long size(Context context, String expectedId) {
        PendingPdf pending = peek(context);
        if (pending == null) return 0L;
        if (expectedId != null && !expectedId.trim().isEmpty() && !pending.id.equals(expectedId.trim())) return 0L;
        return pending.file.length();
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

    public static synchronized boolean acknowledge(Context context, String shareId) {
        PendingPdf pending = peek(context);
        if (pending == null) return true;
        String received = shareId == null ? "" : shareId.trim();
        if (received.isEmpty() || !pending.id.equals(received)) return false;
        clear(context, pending.id);
        return true;
    }

    private static void clear(Context context, String expectedId) {
        if (context == null) return;
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String id = prefs.getString(KEY_ID, "");
        if (expectedId != null && !expectedId.isEmpty() && id != null && !id.isEmpty() && !expectedId.equals(id)) return;
        String path = prefs.getString(KEY_PATH, "");
        if (path != null && !path.isEmpty()) {
            try {
                //noinspection ResultOfMethodCallIgnored
                new File(path).delete();
            } catch (Exception ignored) {}
        }
        prefs.edit()
                .remove(KEY_ID)
                .remove(KEY_NAME)
                .remove(KEY_PATH)
                .remove(KEY_CREATED_AT)
                .apply();
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
