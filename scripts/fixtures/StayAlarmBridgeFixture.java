import com.crewcheck.app.StayAlarmBridge;
import org.json.JSONObject;

/** Production bridge JSON, production engine, fake device/store/owner only. */
public final class StayAlarmBridgeFixture {
    static int checks=0;
    static void check(boolean value,String message){checks++;if(!value)throw new AssertionError(message);}
    static JSONObject request(StayAlarmEngineFixture.Fixture f,String action,String operation,long revision)throws Exception {
        return new JSONObject().put("protocol",StayAlarmBridge.PROTOCOL).put("key",f.key)
            .put("accountId","synthetic").put("eventId","stay-1").put("action",action)
            .put("operationId",operation).put("expectedRevision",revision).put("mode","absolute")
            .put("alarmAt",f.request("fixture",7_200_000,"absolute").alarmAt)
            .put("hotelReportAt",f.request("fixture",12_600_000,"absolute").alarmAt)
            .put("confirmed",true).put("apzConfirmed",true);
    }
    public static void main(String[] args)throws Exception {
        StayAlarmEngineFixture.Fixture f=new StayAlarmEngineFixture.Fixture();StayAlarmBridge bridge=new StayAlarmBridge(f.engine,f.owner);
        check(new JSONObject(bridge.capabilities()).getBoolean("featureEnabled"),"explicit native owner feature gate");
        JSONObject replace=request(f,"replace","replace-1",0),receipt=new JSONObject(bridge.transact(replace.toString()));
        check(receipt.getString("state").equals("scheduled"),"completed receipt");
        check(receipt.getString("acknowledgement").equals("native-api-and-journal-completed"),"ack API plus durable journal");
        check(!receipt.getBoolean("deliveryConfirmed"),"never physical delivery claim");
        check(receipt.getString("key").equals(f.key)&&receipt.getString("operationId").equals("replace-1"),"receipt correlated");
        check(receipt.getLong("revision")==1,"native revision");
        int count=f.device.replacements;
        JSONObject inspect=new JSONObject(bridge.transact(request(f,"inspect","inspect-1",0).toString()));
        check(inspect.getLong("revision")==1&&f.device.replacements==count,"inspect never schedules while preparing cancellation");
        check(new JSONObject(bridge.transact(request(f,"cancel","cancel-1",1).toString())).getString("state").equals("cancelled"),"cancel completed natively");
        check(f.device.jobs.isEmpty(),"cancel removed fake native identity");
        for(String field:new String[]{"expectedRevision","confirmed","apzConfirmed"}) {
            JSONObject bad=request(f,"replace","bad-"+field,2).put(field,field.equals("expectedRevision")?2.5:"true");
            check(!new JSONObject(bridge.transact(bad.toString())).getString("state").equals("scheduled"),"strict field "+field);
        }
        JSONObject bad=request(f,"replace","malformed",2).put("alarmAt","2030-02-30T07:00:00Z");
        check(new JSONObject(bridge.transact(bad.toString())).getString("state").equals("unknown"),"strict native date");
        bad=request(f,"replace","malformed",2).put("alarmAt","2030-10-11T07:00Z");
        check(new JSONObject(bridge.transact(bad.toString())).getString("state").equals("unknown"),"same strict instant boundary as web");
        bad=request(f,"replace","foreign",2).put("accountId","foreign");
        check(new JSONObject(bridge.transact(bad.toString())).getString("state").equals("unknown"),"foreign caller rejected");
        check(new JSONObject(bridge.transact("{")).getString("state").equals("unknown"),"corrupt JSON explicit unknown");
        f.owner.enabled=false;
        check(!new JSONObject(bridge.capabilities()).getBoolean("featureEnabled"),"native OFF capabilities");
        check(new JSONObject(bridge.transact(request(f,"replace","off",2).toString())).getString("state").equals("unknown"),"native OFF request rejected");
        check(f.device.jobs.isEmpty(),"no OFF native programming");
        android.content.Context context=new android.content.ContextWrapper(null) {
            @Override public String getPackageName(){return "com.crewcheck.synthetic";}
        };
        java.lang.reflect.Method envelope=com.crewcheck.app.StayAlarmAndroid.class.getDeclaredMethod("envelope",android.content.Context.class,String.class);
        envelope.setAccessible(true);
        android.content.Intent first=(android.content.Intent)envelope.invoke(null,context,f.key);
        android.content.Intent repeat=(android.content.Intent)envelope.invoke(null,context,f.key);
        android.content.Intent foreign=(android.content.Intent)envelope.invoke(null,context,com.crewcheck.app.StayAlarmEngine.identity("another","stay-1"));
        check(first.filterEquals(repeat),"actual Android Intent identity stable across edits without time extras");
        check(!first.filterEquals(foreign),"actual Android Intent identity isolates accounts");
        System.out.println("PASS production native JSON bridge: "+checks+" assertions, correlated API/journal receipts and malformed/foreign/OFF requests; fake device only");
    }
}
