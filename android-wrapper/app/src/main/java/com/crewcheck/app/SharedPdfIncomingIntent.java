package com.crewcheck.app;

import android.content.ContentResolver;
import android.content.Intent;
import android.net.Uri;
import java.util.ArrayList;
import java.util.LinkedHashMap;

/** Metadata-only selection: never opens a stream or changes the current inbox. */
public final class SharedPdfIncomingIntent {
    private SharedPdfIncomingIntent() {}
    public static Uri uniquePdfUri(Intent intent, ContentResolver resolver) {
        if (intent == null) return null;
        String action = intent.getAction();
        LinkedHashMap<String, Uri> uris = new LinkedHashMap<>();
        if (Intent.ACTION_SEND.equals(action)) {
            Object stream = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (stream instanceof Uri) uris.put(stream.toString(), (Uri) stream);
        } else if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            ArrayList<Uri> streams = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (streams != null) for (Uri uri : streams) if (uri != null) uris.put(uri.toString(), uri);
        } else if (Intent.ACTION_VIEW.equals(action)) {
            Uri uri = intent.getData();
            if (uri != null) uris.put(uri.toString(), uri);
        } else return null;
        if (!Intent.ACTION_VIEW.equals(action) && intent.getData() != null) uris.put(intent.getData().toString(), intent.getData());
        if (!Intent.ACTION_VIEW.equals(action) && intent.getClipData() != null) {
            for (int index = 0; index < intent.getClipData().getItemCount(); index++) {
                Uri uri = intent.getClipData().getItemAt(index).getUri();
                if (uri != null) uris.put(uri.toString(), uri);
            }
        }
        if (uris.size() > 1) throw new IllegalArgumentException("Envie apenas um PDF por vez. O PDF pendente foi preservado.");
        if (uris.isEmpty()) throw new IllegalArgumentException("Nenhum PDF foi recebido. Use a seleção manual de arquivo.");
        Uri uri = uris.values().iterator().next();
        if (!"content".equals(uri.getScheme()) && !(Intent.ACTION_VIEW.equals(action) && "file".equals(uri.getScheme()))) throw new IllegalArgumentException("Origem de PDF não permitida.");
        String type = intent.getType();
        if (type == null || type.trim().isEmpty()) type = resolver.getType(uri);
        if (!"application/pdf".equals(type) && !"application/octet-stream".equals(type)) throw new IllegalArgumentException("Compartilhe um arquivo PDF.");
        return uri;
    }
}
