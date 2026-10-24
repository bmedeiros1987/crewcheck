package com.crewcheck.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.SystemClock;
import android.webkit.WebView;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import org.json.JSONObject;
import java.net.URL;
import javax.net.ssl.HttpsURLConnection;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Concrete opt-in host wiring. Hard OFF in every build in this change.
 * No permission UI, physical-approval writer, global JavascriptInterface or
 * credentials provisioned. Existing user's candidate token is verified server-side. */
public final class StayAlarmHostAndroid {
    public static final boolean PREPARED_HOST_ENABLED=false;
    public static final boolean PREPARED_OVERNIGHT_LEASE_ENABLED=false;
    static final long MAX_OVERNIGHT=18*3_600_000L;
    private static volatile StayAlarmSessionHost activeAuthority;
    public static StayAlarmEngine.Owner owner(){
        return new StayAlarmEngine.Owner(){public boolean enabled(){return activeAuthority!=null&&activeAuthority.enabled();}
            public String activeOwner(){return enabled()?activeAuthority.activeOwner():null;}public String epoch(){return enabled()?activeAuthority.epoch():null;}};
    }
    static boolean testHostEnabled(Context context){return context!=null&&context.getPackageName()!=null&&context.getPackageName().endsWith(".mcctest");}
    private static final String ORIGIN="https://crewcheck.online";
    private final WebView view;private final StayAlarmSessionHost session;private final StayAlarmDurableAuthority durable;private final StayAlarmEngine engine;
    private final StayAlarmBridge bridge;private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private StayAlarmHostAndroid(Context context,WebView view){
        this.view=view;SharedPreferences prefs=context.getSharedPreferences("crewcheck_stay_alarm_owner_v1",Context.MODE_PRIVATE);
        boolean enabled=PREPARED_HOST_ENABLED&&prefs.getBoolean("physicalValidationApproved",false)||testHostEnabled(context);
        session=new StayAlarmSessionHost(enabled,SystemClock::elapsedRealtime,
            (account,epoch,expiry)->{if(!prefs.edit().putString("verifiedOwnerId",account).putString("verifiedOwnerEpoch",epoch)
                .putLong("verifiedOwnerExpiresAt",expiry).commit())throw new IllegalStateException("lease commit failed");},PREPARED_OVERNIGHT_LEASE_ENABLED?MAX_OVERNIGHT:300_000);
        durable=StayAlarmDurableAuthorityAndroid.open(context.getApplicationContext());
        StayAlarmAndroid driver=new StayAlarmAndroid(context);
        engine=new StayAlarmEngine(driver,driver,new StayAlarmCompositeOwner(session,durable));
        bridge=new StayAlarmBridge(engine,session);
        activeAuthority=session;session.revoke();
        WebViewCompat.addWebMessageListener(view,"CrewCheckStayHost",Collections.singleton(ORIGIN),(web,message,source,main,reply)->{
            if(!admitted(main,source.toString(),web.getUrl()))return;
            try{
                if(message.getData()==null||message.getData().length()>16384)return;
                JSONObject request=new JSONObject(message.getData());String id=request.getString("id"),action=request.getString("action");
                if(id.length()>128||message.getData().length()>16384)return;
                if("suspend".equals(action)){session.revoke();worker.execute(this::recover);reply.postMessage(response(id,"suspended",null));return;}
                if("revoke".equals(action)){
                    String account=session.activeOwner(),epoch=session.epoch();
                    StayAlarmEngine.updateTrustedOwner(()->{durable.revoke(account,epoch);session.revoke();});
                    worker.execute(this::recover);reply.postMessage(response(id,"revoked",null));return;
                }
                if("authenticate".equals(action)){
                    if(!session.enabled()){reply.postMessage(response(id,"rejected",null));return;}
                    long generation=session.begin();String token=request.getString("token");
                    worker.execute(()->{try{
                        recover();long began=SystemClock.elapsedRealtime();Verified proof=verify(token);
                        long duration=Math.max(0,Math.min(proof.duration,PREPARED_OVERNIGHT_LEASE_ENABLED?MAX_OVERNIGHT:300_000)-(SystemClock.elapsedRealtime()-began));
                        long expiry=SystemClock.elapsedRealtime()+duration;String account=proof.account;
                        boolean accepted=session.verified(generation,account,UUID.randomUUID().toString(),expiry);
                        if(accepted)recover();
                        view.post(()->{if(accepted&&session.current(generation)&&allowed(view.getUrl())){
                            reply.postMessage(response(id,"verified",capabilities()));
                            view.postDelayed(()->{if(session.generation()==generation){session.revoke();worker.execute(this::recover);}},duration);
                        }else reply.postMessage(response(id,"rejected",null));});
                    }catch(Exception error){view.post(()->reply.postMessage(response(id,"rejected",null)));}});return;
                }
                long generation=session.generation();
                if(!session.current(generation)) {reply.postMessage(response(id,"rejected",null));return;}
                String payload=request.optString("payload","");
                worker.execute(()->{String value=null;
                    if(session.current(generation))value="capabilities".equals(action)?capabilities():"transact".equals(action)?transactOrRevoke(bridge,session,payload):null;
                    final String result=value;view.post(()->{if((session.current(generation)||(session.generation()==generation+1&&session.activeOwner()==null))&&allowed(view.getUrl()))reply.postMessage(response(id,result==null?"rejected":"ok",result));});});
            }catch(Exception ignored){} // malformed packets never acquire authority
        });
    }
    /** Cancellation failure revokes native authority BEFORE returning its
     * uncertain receipt, including journal failure before pending-cancel. */
    static String transactOrRevoke(StayAlarmBridge bridge,StayAlarmSessionHost session,String payload){
        long generation=session.generation();String result=bridge.transact(payload);
        try{JSONObject request=new JSONObject(payload);
            if("cancel".equals(request.optString("action"))&&!"cancelled".equals(new JSONObject(result).optString("state"))){
                String account=request.optString("accountId"),epoch=request.optString("ownerEpoch");
                StayAlarmEngine.updateTrustedOwner(()->{
                    if(session.generation()==generation&&account.equals(session.activeOwner())&&epoch.equals(session.epoch()))session.revoke();
                });
            }
        }catch(Exception ignored){/* malformed/stale packets do not revoke a newer owner */}
        return result;
    }
    static boolean admitted(boolean main,String source,String page){return main&&allowed(source)&&allowed(page);}
    static boolean allowed(String value){try{Uri uri=Uri.parse(value);return "https".equals(uri.getScheme())&&"crewcheck.online".equals(uri.getHost())
        &&(uri.getPort()==-1||uri.getPort()==443)&&uri.getUserInfo()==null;}catch(Exception error){return false;}}
    static String response(String id,String state,String payload){try{return new JSONObject().put("id",id).put("state",state)
        .put("payload",payload==null?JSONObject.NULL:payload).toString();}catch(Exception error){return "{}";}}
    static final class Verified{final String account;final long duration;Verified(String account,long duration){this.account=account;this.duration=duration;}}
    private String capabilities(){try{return new JSONObject(bridge.capabilities()).put("leaseRemainingMillis",session.remaining()).toString();}catch(Exception error){return "{}";}}
    static Verified verifiedResponse(JSONObject result)throws Exception{
        if(!Boolean.TRUE.equals(result.opt("ok"))||!Boolean.TRUE.equals(result.opt("authenticated")))throw new SecurityException("verification rejected");
        Object raw=result.getJSONObject("user").get("id");if(!(raw instanceof String)||((String)raw).trim().isEmpty())throw new SecurityException("verified ID missing");
        JSONObject lease=result.getJSONObject("stayAlarmLease");
        long now=lease.getLong("serverNow"),sessionExpiry=lease.getLong("sessionExpiresAt"),leaseExpiry=lease.getLong("stayLeaseExpiresAt");
        long duration=leaseExpiry-now;if(now<=0||duration<=0||duration>MAX_OVERNIGHT||leaseExpiry>sessionExpiry)throw new SecurityException("verified expiry unavailable");
        return new Verified((String)raw,duration);
    }
    private static Verified verify(String token)throws Exception{
        if(token==null||token.isEmpty()||token.length()>8192||token.contains("\r")||token.contains("\n"))throw new SecurityException("invalid candidate");
        HttpsURLConnection connection=(HttpsURLConnection)new URL(ORIGIN+"/api/auth/me").openConnection();
        try{connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(5000);connection.setReadTimeout(5000);
            connection.setRequestProperty("Authorization","Bearer "+token);
            if(connection.getResponseCode()!=200)throw new SecurityException("verification rejected");
            java.io.ByteArrayOutputStream bytes=new java.io.ByteArrayOutputStream();byte[] buffer=new byte[2048];int n;
            try(java.io.InputStream input=connection.getInputStream()){while((n=input.read(buffer))!=-1){bytes.write(buffer,0,n);if(bytes.size()>65536)throw new SecurityException("response limit");}}
            JSONObject result=new JSONObject(new String(bytes.toByteArray(),StandardCharsets.UTF_8));
            return verifiedResponse(result);
        }finally{connection.disconnect();}
    }
    public static StayAlarmHostAndroid install(Context context,WebView view){
        if(!(PREPARED_HOST_ENABLED||testHostEnabled(context))||!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER))return null;
        return new StayAlarmHostAndroid(context,view);
    }
    private void recover(){try{engine.recover(false);}catch(Exception ignored){/* no acknowledgement on incomplete recovery */}}
    public void navigationStarted(){session.revoke();worker.execute(this::recover);}
    public void close(){session.revoke();activeAuthority=null;WebViewCompat.removeWebMessageListener(view,"CrewCheckStayHost");worker.shutdown();}
}
