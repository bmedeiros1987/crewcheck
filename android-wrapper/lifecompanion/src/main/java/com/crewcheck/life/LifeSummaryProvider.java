package com.crewcheck.life;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;

public final class LifeSummaryProvider extends ContentProvider {
    public static final Uri CURRENT =
            Uri.parse("content://com.crewcheck.life.summary/v1/current");

    @Override
    public boolean onCreate() {
        return true;
    }

    @Override
    public Cursor query(
            Uri uri,
            String[] projection,
            String selection,
            String[] selectionArgs,
            String sortOrder
    ) {
        if (uri == null || !"/v1/current".equals(uri.getPath())) return null;
        MatrixCursor cursor = new MatrixCursor(new String[]{"json"});
        cursor.addRow(new Object[]{LifeSummaryStore.read(getContext())});
        return cursor;
    }

    @Override public String getType(Uri uri) { return "application/vnd.crewcheck.life.summary+json"; }
    @Override public Uri insert(Uri uri, ContentValues values) { throw new UnsupportedOperationException("read-only"); }
    @Override public int delete(Uri uri, String selection, String[] selectionArgs) { throw new UnsupportedOperationException("read-only"); }
    @Override public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) { throw new UnsupportedOperationException("read-only"); }
}
