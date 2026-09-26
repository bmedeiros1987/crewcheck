package com.crewcheck.app;

import com.google.android.gms.wearable.MessageEvent;
import com.google.android.gms.wearable.WearableListenerService;

/**
 * Phone-side Wear Data Layer entry point. The service owns only transport/cache behavior:
 * operational truth still comes from the canonical CrewCheck runtime, never from the watch.
 */
public final class CrewCheckWatchSyncService extends WearableListenerService {
    @Override
    public void onMessageReceived(MessageEvent messageEvent) {
        String path = messageEvent.getPath();

        if (CrewCheckWatchDeviceTelemetry.STATUS_RESPONSE_PATH.equals(path)) {
            CrewCheckWatchDeviceTelemetry.saveStatus(
                    this,
                    messageEvent.getSourceNodeId(),
                    messageEvent.getData()
            );
            return;
        }

        if (!CrewCheckWatchPublisher.REQUEST_SYNC_PATH.equals(path)) return;
        // Fast path: resend the last validated snapshot if one already exists. Its original
        // validUntilEpochMs is preserved, so an offline/stale snapshot never becomes fresh.
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
