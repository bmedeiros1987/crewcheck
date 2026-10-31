package com.crewcheck.app;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

/** Compiled SDK receiver, disabled in manifest and by policy. */
public final class CrewCheckFirebaseMessagingService extends FirebaseMessagingService {
    @Override public void onNewToken(String token) {
        if (!NativePushPolicy.configured()) return;
        NativePushRuntime.rotated(this, token);
    }
    @Override public void onMessageReceived(RemoteMessage message) {
        // No local account hint/token ACK can authorize display. Authenticated
        // source/consent/epoch lease + durable claim/revoke barrier remain a release gate.
        // In particular do not display arbitrary notification/title/body payloads.
        if (!NativePushPolicy.configured()) return;
    }
}
