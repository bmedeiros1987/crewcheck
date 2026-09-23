package com.crewcheck.life;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.Binder;
import android.os.Bundle;
import android.os.Process;

public final class LifeSummaryProvider extends ContentProvider {
    public static final Uri CURRENT =
            Uri.parse("content://com.crewcheck.life.summary/v1/current");

    private static final String TRUSTED_CREWCHECK_PACKAGE = "com.crewcheck.app";
    private static final String PLAY_STORE_PACKAGE = "com.android.vending";

    @Override
    public boolean onCreate() {
        return true;
    }

    private void enforceTrustedCaller() {
        Context context = getContext();
        if (context == null) {
            throw new SecurityException("CrewLife provider unavailable");
        }

        final int callingUid = Binder.getCallingUid();
        if (callingUid == Process.myUid()) {
            return;
        }

        PackageManager packageManager = context.getPackageManager();
        String[] packages = packageManager.getPackagesForUid(callingUid);
        boolean callerOwnsCrewCheckPackage = false;
        if (packages != null) {
            for (String packageName : packages) {
                if (TRUSTED_CREWCHECK_PACKAGE.equals(packageName)) {
                    callerOwnsCrewCheckPackage = true;
                    break;
                }
            }
        }
        if (!callerOwnsCrewCheckPackage) {
            throw new SecurityException("Caller is not CrewCheck");
        }

    }

    @Override
    public Cursor query(
            Uri uri,
            String[] projection,
            String selection,
            String[] selectionArgs,
            String sortOrder
    ) {
        enforceTrustedCaller();
        if (uri == null || !"/v1/current".equals(uri.getPath())) return null;
        MatrixCursor cursor = new MatrixCursor(new String[]{"json"});
        cursor.addRow(new Object[]{LifeSummaryStore.read(getContext())});
        return cursor;
    }

    @Override
    public Bundle call(String method, String arg, Bundle extras) {
        enforceTrustedCaller();
        if (!"refresh".equals(method)) {
            return super.call(method, arg, extras);
        }

        final Context context = getContext();
        if (context == null) {
            throw new IllegalStateException("CrewLife provider unavailable");
        }
        final Context app = context.getApplicationContext();

        new Thread(() -> {
            try {
                CrewLifeRefresh.refreshNow(app);
                RefreshScheduler.schedule(app);
            } catch (Throwable ignored) {
            }
        }, "crewlife-provider-refresh").start();

        Bundle result = new Bundle();
        result.putBoolean("accepted", true);
        return result;
    }

    @Override public String getType(Uri uri) { return "application/vnd.crewcheck.life.summary+json"; }
    @Override public Uri insert(Uri uri, ContentValues values) { throw new UnsupportedOperationException("read-only"); }
    @Override public int delete(Uri uri, String selection, String[] selectionArgs) { throw new UnsupportedOperationException("read-only"); }
    @Override public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) { throw new UnsupportedOperationException("read-only"); }
}
