package com.crewcheck.app;

import org.json.JSONObject;

/** Prepared JSON endpoint, deliberately NOT exposed as JavascriptInterface or installed in MainActivity. A response
 * is returned only after the native API and durable journal complete, never
 * after posting an operation to the UI thread. No permission requests. */
public final class StayAlarmBridge {
    public static final String PROTOCOL="crewcheck-stay-alarm-v1";
    private final StayAlarmEngine engine;
    private final StayAlarmEngine.Owner owner;
    public StayAlarmBridge(StayAlarmEngine engine,StayAlarmEngine.Owner owner) {this.engine=engine;this.owner=owner;}
    public String capabilities() {
        JSONObject value=new JSONObject();
        try {value.put("protocol",PROTOCOL);value.put("featureEnabled",owner.enabled());
            value.put("atomicReplace",true);value.put("acknowledgedCancel",true);
            value.put("deliveryConfirmed",false);}
        catch(Exception ignored){}return value.toString();
    }
    private static String text(JSONObject value,String name) throws Exception {
        Object raw=value.get(name);if(!(raw instanceof String)||((String)raw).trim().isEmpty())throw new IllegalArgumentException(name);
        return (String)raw;
    }
    private static long revision(JSONObject value) throws Exception {
        Object raw=value.get("expectedRevision");
        if(!(raw instanceof Integer)&&!(raw instanceof Long))throw new IllegalArgumentException("revision");
        long revision=((Number)raw).longValue();if(revision<0||revision>=Long.MAX_VALUE-1)throw new IllegalArgumentException("revision");return revision;
    }
    public String transact(String payload) {
        JSONObject response=new JSONObject();String key="",operation="";
        try {
            if(payload==null||payload.length()>8192)throw new IllegalArgumentException("payload");
            JSONObject request=new JSONObject(payload);
            if(!PROTOCOL.equals(text(request,"protocol")))throw new IllegalArgumentException("protocol");
            key=text(request,"key");operation=text(request,"operationId");String account=text(request,"accountId");
            String event=text(request,"eventId"),action=text(request,"action");
            if(!StayAlarmEngine.identity(account,event).equals(key))throw new IllegalArgumentException("identity");
            if(!owner.enabled()||!account.equals(owner.activeOwner()))throw new SecurityException("owner unavailable");
            StayAlarmEngine.Result result;
            if("inspect".equals(action)) {
                StayAlarmEngine.Record r=engine.inspect(key,account);
                result=new StayAlarmEngine.Result(key,operation,r==null?"not-programmed":r.state,
                    "native-state-sampled",r==null?"":r.alarmAt,r==null?0:r.revision);
            } else if("cancel".equals(action)) {
                result=engine.cancel(key,account,event,operation,revision(request));
            } else if("replace".equals(action)) {
                String alarmAt=text(request,"alarmAt"),apzAt=text(request,"hotelReportAt");
                long alarm=StayAlarmEngine.instant(alarmAt);
                long apz=StayAlarmEngine.instant(apzAt);
                StayAlarmEngine.Record r=new StayAlarmEngine.Record(key,account,owner.epoch(),event,operation,1,
                    alarmAt,alarm,apz,text(request,"mode"),"pending-schedule");
                result=engine.replace(r,revision(request),Boolean.TRUE.equals(request.opt("confirmed")),Boolean.TRUE.equals(request.opt("apzConfirmed")));
            } else throw new IllegalArgumentException("action");
            response.put("state",result.state);response.put("reason",result.reason);response.put("revision",result.revision);
            response.put("alarmAt",result.alarmAt);
            if("native-api-and-journal-completed".equals(result.reason))response.put("acknowledgement","native-api-and-journal-completed");
        } catch(Exception error) {
            try {response.put("state","unknown");response.put("reason","native-request-rejected-or-incomplete");}catch(Exception ignored){}
        }
        try {response.put("protocol",PROTOCOL);response.put("key",key);response.put("operationId",operation);
            response.put("deliveryConfirmed",false);}
        catch(Exception ignored){}return response.toString();
    }
}
