package com.crewcheck.watch;
import android.net.Uri;
import com.google.android.gms.wearable.DataItem;
import com.google.android.gms.wearable.DataItemAsset;
import com.google.android.gms.wearable.DataMap;
import java.util.Map;
import java.util.Set;
import java.security.MessageDigest;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;
final class OperationalTestIngress {
    static String hex(byte[] bytes) {
        StringBuilder out=new StringBuilder();for(byte b:bytes)out.append(String.format("%02x",b&255));return out.toString();
    }
    static String nonce(){byte[] bytes=new byte[32];new java.security.SecureRandom().nextBytes(bytes);return hex(bytes);}
    static JSONObject admit(SecureSnapshotStore store,String node) throws Exception {
        JSONObject request=new JSONObject().put("transportVersion",1).put("operation","admit")
                .put("requestId",nonce()).put("leaseId",nonce());
        String challenge=store.challenge(node,request.toString(),Set.of(node));
        if(store.admit(node,challenge,Set.of(node))==null) throw new AssertionError("admission failed");
        return new JSONObject(challenge);
    }
    static String envelope(String raw,String lease,long revision) throws Exception {
        return new JSONObject().put("transportVersion",1).put("leaseId",lease).put("revision",Long.toString(revision))
                .put("snapshotSha256",hex(MessageDigest.getInstance("SHA-256").digest(raw.getBytes(StandardCharsets.UTF_8)))).toString();
    }
    static DataItem item(String node,String raw,String envelope) {
        DataMap map=new DataMap();map.putString(WatchContract.DATA_KEY_SNAPSHOT_JSON,raw);map.putString(OperationalTransport.ENVELOPE,envelope);
        final byte[] bytes=map.toByteArray();
        return new DataItem(){
            public Uri getUri(){return Uri.parse("wear://"+node+WatchContract.SNAPSHOT_PATH);}
            public byte[] getData(){return bytes;}
            public DataItem setData(byte[] ignored){throw new UnsupportedOperationException();}
            public Map<String,DataItemAsset> getAssets(){return Map.of();}
            public DataItem freeze(){return this;}
            public boolean isDataValid(){return true;}
        };
    }
    static void deliver(CrewCheckDataLayerService service,String raw) throws Exception {
        String node="synthetic-phone";
        JSONObject admission=admit(new SecureSnapshotStore(service),node);
        service.processOperationalData(item(node,raw,envelope(raw,admission.getString("leaseId"),1)));
    }
}
