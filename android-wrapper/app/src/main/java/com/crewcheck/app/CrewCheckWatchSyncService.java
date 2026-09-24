package com.crewcheck.app;

import com.google.android.gms.wearable.MessageEvent;
import com.google.android.gms.wearable.WearableListenerService;

/**
 * Lets the watch request the phone's last validated canonical projection even when the
 * CrewCheck Activity is not in the foreground.
 */
public final class CrewCheckWatchSyncService extends WearableListenerService {
    @Override
    public void onMessageReceived(MessageEvent messageEvent) {
        if (!CrewCheckWatchPublisher.REQUEST_SYNC_PATH.equals(messageEvent.getPath())) return;
        // Fast path: resend the last validated snapshot if one already exists.
        CrewCheckWatchPublisher.republishLast(this);

        // First-sync path: if the CrewCheck Activity is open, ask its WebView to
        // generate a fresh canonical projection immediately. This removes the
        // bootstrap dependency on a previously cached snapshot.
        android.content.Intent syncRequest =
                new android.content.Intent(MainActivity.ACTION_WATCH_SYNC_REQUEST)
                        .setPackage(getPackageName());
        sendBroadcast(syncRequest);
    }
}
