package com.crewcheck.app;

import android.Manifest;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationManager;
import android.app.NotificationChannel;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import org.json.JSONObject;
import java.security.MessageDigest;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/** Real API driver compiled separately from the mock engine fixture. Runtime
 * remains off: this PR does not install a bridge or issue a verified owner lease. */
public final class StayAlarmAndroid implements StayAlarmEngine.Store,StayAlarmEngine.Device {
    private static final String CHANNEL="crewcheck_alerts";
    static final String ACTION="com.crewcheck.app.STAY_HOTEL_ALARM";
    private final Context context;
    private final SharedPreferences journal;
    public StayAlarmAndroid(Context context) {
        this.context=context.getApplicationContext();journal=this.context.getSharedPreferences("crewcheck_stay_alarm_journal_v1",Context.MODE_PRIVATE);
    }
    static String digest(String key) {
        try {byte[] bytes=MessageDigest.getInstance("SHA-256").digest(key.getBytes(StandardCharsets.UTF_8));
            StringBuilder out=new StringBuilder();for(byte value:bytes)out.append(String.format("%02x",value&255));return out.toString();}
        catch(Exception error){throw new IllegalStateException(error);}
    }
    static Intent envelope(Context context,String key) {
        return new Intent(context,StayAlarmReceiver.class).setAction(ACTION)
            .setData(Uri.parse("crewcheck-stay-alarm://job/"+digest(key)));
    }
    @Override public long now(){return System.currentTimeMillis();}
    @Override public boolean permitted() {
        NotificationManager notifications=(NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);
        AlarmManager alarms=(AlarmManager)context.getSystemService(Context.ALARM_SERVICE);
        if(alarms==null||notifications==null||!notifications.areNotificationsEnabled())return false;
        if(Build.VERSION.SDK_INT>=33&&context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)return false;
        if(Build.VERSION.SDK_INT>=31&&!alarms.canScheduleExactAlarms())return false;
        // No channel creation/configuration or permission UI in this adapter.
        NotificationChannel channel=notifications.getNotificationChannel(CHANNEL);
        return channel!=null&&channel.getImportance()!=NotificationManager.IMPORTANCE_NONE;
    }
    @Override public void replace(StayAlarmEngine.Record r) {
        if(!permitted())throw new SecurityException("permission unavailable");
        AlarmManager alarms=(AlarmManager)context.getSystemService(Context.ALARM_SERVICE);
        Intent intent=envelope(context,r.key).putExtra("stayKey",r.key).putExtra("revision",r.revision).putExtra("scheduledAt",r.alarm);
        PendingIntent pending=PendingIntent.getBroadcast(context,0,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        // Same action/component/data/requestCode => one OS alarm across edits.
        alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,r.alarm,pending);
    }
    @Override public void cancel(String key) {
        AlarmManager alarms=(AlarmManager)context.getSystemService(Context.ALARM_SERVICE);
        if(alarms==null)throw new IllegalStateException("alarm service unavailable");
        PendingIntent pending=PendingIntent.getBroadcast(context,0,envelope(context,key),PendingIntent.FLAG_NO_CREATE|PendingIntent.FLAG_IMMUTABLE);
        if(pending!=null){alarms.cancel(pending);pending.cancel();}
        NotificationManager notifications=(NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);
        if(notifications==null)throw new IllegalStateException("notification service unavailable");
        notifications.cancel(digest(key),0);
    }
    @Override public void notify(StayAlarmEngine.Record r) {
        if(!permitted())throw new SecurityException("permission unavailable");
        NotificationManager notifications=(NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);
        Intent open=context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if(open==null)throw new IllegalStateException("app unavailable");
        open.setData(Uri.parse("crewcheck-stay-alarm://open/"+digest(r.key)));
        PendingIntent tap=PendingIntent.getActivity(context,0,open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        Notification value=new Notification.Builder(context,CHANNEL).setContentTitle("Despertador do pernoite")
            .setContentText("Confira sua programação no CrewCheck.").setVisibility(Notification.VISIBILITY_PRIVATE)
            .setSmallIcon(android.R.drawable.ic_dialog_info).setContentIntent(tap).setAutoCancel(true).build();
        notifications.notify(digest(r.key),0,value);
    }
    private static JSONObject encode(StayAlarmEngine.Record r)throws Exception {
        JSONObject value=new JSONObject();value.put("v",1);value.put("key",r.key);value.put("owner",r.owner);value.put("ownerEpoch",r.ownerEpoch);
        value.put("event",r.event);value.put("operation",r.operation);value.put("revision",r.revision);
        value.put("alarmAt",r.alarmAt);value.put("alarm",r.alarm);value.put("apz",r.apz);value.put("mode",r.mode);value.put("state",r.state);return value;
    }
    private static long integer(JSONObject value,String name)throws Exception {
        Object raw=value.get(name);if(!(raw instanceof Integer)&&!(raw instanceof Long))throw new IllegalArgumentException(name);
        return ((Number)raw).longValue();
    }
    private static StayAlarmEngine.Record decode(String raw)throws Exception {
        JSONObject v=new JSONObject(raw);if(v.getInt("v")!=1)throw new IllegalArgumentException("journal version");
        return new StayAlarmEngine.Record(v.getString("key"),v.getString("owner"),v.getString("ownerEpoch"),v.getString("event"),v.getString("operation"),
            integer(v,"revision"),v.getString("alarmAt"),integer(v,"alarm"),integer(v,"apz"),v.getString("mode"),v.getString("state"));
    }
    @Override public StayAlarmEngine.Record read(String key)throws Exception {
        String raw=journal.getString("r:"+digest(key),null);if(raw==null)return null;
        StayAlarmEngine.Record r=decode(raw);if(!key.equals(r.key))throw new SecurityException("journal identity");return r;
    }
    @Override public void commit(StayAlarmEngine.Record r)throws Exception {
        if(!journal.edit().putString("r:"+digest(r.key),encode(r).toString()).commit())throw new IllegalStateException("journal commit failed");
    }
    @Override public List<StayAlarmEngine.Record> all()throws Exception {
        List<StayAlarmEngine.Record> records=new ArrayList<>();
        for(String key:journal.getAll().keySet())if(key.startsWith("r:")) {
            StayAlarmEngine.Record r=decode(journal.getString(key,""));
            if(!key.equals("r:"+digest(r.key)))throw new SecurityException("journal identity");records.add(r);
        }return records;
    }
    /** Only a future trusted native host may issue this lease AFTER physical
     * validation. There is no writer or JavascriptInterface for it in this PR. */
    public static StayAlarmEngine.Owner owner(Context context) {
        SharedPreferences gate=context.getSharedPreferences("crewcheck_stay_alarm_owner_v1",Context.MODE_PRIVATE);
        return new StayAlarmEngine.Owner() {
            public String epoch(){return gate.getString("verifiedOwnerEpoch",null);}
            public boolean enabled(){return gate.getBoolean("physicalValidationApproved",false);}
            public String activeOwner(){return gate.getLong("verifiedOwnerExpiresAt",0)>System.currentTimeMillis()?gate.getString("verifiedOwnerId",null):null;}
        };
    }
    public static StayAlarmEngine engine(Context context) {StayAlarmAndroid driver=new StayAlarmAndroid(context);return new StayAlarmEngine(driver,driver,owner(context));}
}
