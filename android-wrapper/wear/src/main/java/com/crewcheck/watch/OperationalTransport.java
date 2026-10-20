package com.crewcheck.watch;

import android.content.Context;
import com.google.android.gms.wearable.Wearable;
import com.google.android.gms.wearable.Node;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;

/** Operational-only adapter; never routes Health/CrewLife through this handshake. */
final class OperationalTransport {
    static final String ROOT="/crewcheck/watch/session/";
    static final String CHALLENGE_REQUEST=ROOT+"challenge-request/v1";
    static final String CHALLENGE=ROOT+"challenge/v1";
    static final String ADMIT=ROOT+"admit/v1";
    static final String ACK=ROOT+"ack/v1";
    static final String REVOKE=ROOT+"revoke/v1";
    static final String REVOKE_ACK=ROOT+"revoke-ack/v1";
    static final String ENVELOPE="transportEnvelopeJson";
    private static final Object LOCK=new Object();
    private static long topologyGeneration;
    private OperationalTransport() {}

    static void topologyChanged(Context c) {
        synchronized(LOCK) {
            topologyGeneration++;
            try {new SecureSnapshotStore(c).connectionChanged(Set.of());}catch(Exception ignored){}
        }
    }
    static boolean message(Context context,String node,String path,byte[] bytes) {
        if(REVOKE.equals(path)) {
            if(bytes==null || bytes.length==0 || bytes.length>1024) return true;
            try {
                String response=new SecureSnapshotStore(context).revoke(node,new String(bytes,StandardCharsets.UTF_8));
                if(response!=null) Wearable.getMessageClient(context).sendMessage(node,REVOKE_ACK,response.getBytes(StandardCharsets.UTF_8));
            }catch(Exception ignored){}
            return true;
        }
        if (!CHALLENGE_REQUEST.equals(path) && !ADMIT.equals(path)) return false;
        if (bytes==null || bytes.length==0 || bytes.length>1024) return true;
        final Context app=context.getApplicationContext();
        final long generation;
        synchronized(LOCK){generation=topologyGeneration;}
        // Requery immediately for every stage. A callback from a previous topology
        // cannot authorize a different node; the store independently checks the set.
        Wearable.getNodeClient(app).getConnectedNodes().addOnSuccessListener(nodes -> {
            Set<String> current=new HashSet<>();
            for(Node peer:nodes) current.add(peer.getId());
            synchronized(LOCK) {
                try {
                    if(generation!=topologyGeneration) return;
                    SecureSnapshotStore store=new SecureSnapshotStore(app);
                    store.connectionChanged(current);
                    String raw=new String(bytes,StandardCharsets.UTF_8);
                    String response=CHALLENGE_REQUEST.equals(path)
                            ?store.challenge(node,raw,current):store.admit(node,raw,current);
                    if(response!=null) Wearable.getMessageClient(app).sendMessage(node,
                            CHALLENGE_REQUEST.equals(path)?CHALLENGE:ACK,response.getBytes(StandardCharsets.UTF_8));
                } catch(Exception ignored) { /* No ACK before durable acceptance. */ }
            }
        }).addOnFailureListener(error -> {
            synchronized(LOCK) {
                try {new SecureSnapshotStore(app).connectionChanged(Set.of());}catch(Exception ignored){}
                topologyGeneration++;
            }
        });
        return true;
    }
}
