package com.crewcheck.app;

import android.Manifest;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.SystemClock;
import android.provider.Settings;
import android.service.notification.StatusBarNotification;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Android adapter for LocalAlarmLedger and its JSON bridge. Hard OFF: while ENABLED is
 * false every bridge call answers "disabled" and nothing is armed. Fencing still runs so
 * an account change always clears whatever an earlier build armed. No permission is
 * requested here and nothing is restored after a reboot. */
final class LocalAlarmAndroid implements LocalAlarmLedger.Store, LocalAlarmLedger.Device {
    static final boolean ENABLED = false;
    static final String PROTOCOL = "crewcheck-local-alarm-v1";
    static final String TAG = "crewcheck-local-alarm:";
    static final String ALARM_CHANNEL = "crewcheck_local_alarm_v1", VIBRATE_CHANNEL = "crewcheck_local_vibrate_v1", DEFAULT_CHANNEL = "crewcheck_alerts";
    private static final long[] PATTERN = {0, 700, 400, 700, 400, 700};
    private final Context context; private final SharedPreferences prefs;
    LocalAlarmAndroid(Context context){this.context=context.getApplicationContext();prefs=this.context.getSharedPreferences("crewcheck_local_alarms_v1",Context.MODE_PRIVATE);}
    LocalAlarmLedger ledger(){return new LocalAlarmLedger(this,this);}
    static Intent envelope(Context context,String key){return new Intent(context,LocalAlarmReceiver.class).setData(Uri.parse("crewcheck-local-alarm://job/"+key));}

    public Map<String,LocalAlarmLedger.Entry> entries() throws Exception {
        Map<String,LocalAlarmLedger.Entry> out=new HashMap<>();
        for(Map.Entry<String,?> e:prefs.getAll().entrySet()){
            if(!e.getKey().startsWith("job:")||!(e.getValue() instanceof String))continue;
            JSONObject v=new JSONObject((String)e.getValue());String key=e.getKey().substring(4);
            out.put(key,new LocalAlarmLedger.Entry(key,v.getString("g"),v.getString("i"),v.getString("e"),v.getString("b"),v.getString("c"),v.getLong("a")));
        }
        return out;
    }
    public void commit(Map<String,LocalAlarmLedger.Entry> entries) throws Exception {
        SharedPreferences.Editor edit=prefs.edit();
        for(String key:prefs.getAll().keySet())if(key.startsWith("job:"))edit.remove(key);
        for(LocalAlarmLedger.Entry e:entries.values())edit.putString("job:"+e.key,new JSONObject().put("g",e.group).put("i",e.id)
            .put("e",e.epoch).put("b",e.boot).put("c",e.channel).put("a",e.at).toString());
        if(!edit.commit())throw new IllegalStateException("local alarm journal not committed");
    }
    public long now(){return System.currentTimeMillis();}
    public String epoch(){NotificationLedgerAndroid fence=new NotificationLedgerAndroid(context);return fence.scope().isEmpty()?"":fence.epoch();}
    public String boot(){
        int count=Settings.Global.getInt(context.getContentResolver(),Settings.Global.BOOT_COUNT,-1);
        // Fallback: boot instant rounded to a minute, stable for the life of this boot.
        return count>=0?"count:"+count:"since:"+((System.currentTimeMillis()-SystemClock.elapsedRealtime())/60_000L);
    }
    public boolean permitted(){
        if(Build.VERSION.SDK_INT>=33&&context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)return false;
        NotificationManager manager=(NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);
        return manager!=null&&manager.areNotificationsEnabled();
    }
    boolean exact(){
        AlarmManager alarms=(AlarmManager)context.getSystemService(Context.ALARM_SERVICE);
        return alarms!=null&&(Build.VERSION.SDK_INT<31||alarms.canScheduleExactAlarms());
    }
    public void arm(LocalAlarmLedger.Entry entry,LocalAlarmLedger.Job job) throws Exception {
        AlarmManager alarms=(AlarmManager)context.getSystemService(Context.ALARM_SERVICE);
        if(alarms==null)throw new IllegalStateException("alarm unavailable");
        Intent intent=envelope(context,entry.key).putExtra("key",entry.key).putExtra("epoch",entry.epoch).putExtra("at",entry.at)
            .putExtra("title",job.title).putExtra("body",job.body);
        PendingIntent pi=PendingIntent.getBroadcast(context,0,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        if(exact()){
            try{
                if("alarm".equals(entry.channel)){
                    PendingIntent show=PendingIntent.getActivity(context,10838,new Intent(context,MainActivity.class),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
                    alarms.setAlarmClock(new AlarmManager.AlarmClockInfo(entry.at,show),pi);
                } else alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,entry.at,pi);
                return;
            }catch(SecurityException revoked){ /* exact grant can change after the check */ }
        }
        alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,entry.at,pi);
    }
    public void cancel(String key){
        AlarmManager alarms=(AlarmManager)context.getSystemService(Context.ALARM_SERVICE);if(alarms==null)throw new IllegalStateException("alarm unavailable");
        PendingIntent pi=PendingIntent.getBroadcast(context,0,envelope(context,key),PendingIntent.FLAG_NO_CREATE|PendingIntent.FLAG_IMMUTABLE);
        if(pi!=null){alarms.cancel(pi);pi.cancel();}
        NotificationManager manager=(NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);
        if(manager!=null)manager.cancel(TAG+key,0);
    }

    /** Runs after every account fence change; also clears ringing local alarms of a previous account. */
    boolean fence(){
        String epoch=epoch();boolean changed=!epoch.equals(prefs.getString("fenceEpoch",null));
        boolean ok=ledger().fence();
        if(changed){
            NotificationManager manager=(NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);
            try{if(manager!=null)for(StatusBarNotification active:manager.getActiveNotifications())if(active.getTag()!=null&&active.getTag().startsWith(TAG))manager.cancel(active.getTag(),0);}
            catch(Exception error){ok=false;}
            if(!prefs.edit().putString("fenceEpoch",epoch).commit())ok=false;
        }
        return ok;
    }

    static void ensureChannels(Context context){
        if(Build.VERSION.SDK_INT<Build.VERSION_CODES.O)return;
        NotificationManager manager=(NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);if(manager==null)return;
        // Importance/sound cannot change after creation: a behavior change needs a new versioned id.
        NotificationChannel alarm=new NotificationChannel(ALARM_CHANNEL,"Alarmes CrewCheck",NotificationManager.IMPORTANCE_HIGH);
        alarm.setDescription("Fim do descanso a bordo e outros alarmes que você programar.");
        alarm.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM),new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
        alarm.enableVibration(true);alarm.setVibrationPattern(PATTERN);
        NotificationChannel vibrate=new NotificationChannel(VIBRATE_CHANNEL,"Alarmes só vibração",NotificationManager.IMPORTANCE_HIGH);
        vibrate.setDescription("Alarmes sem som, para a cabine em silêncio.");
        vibrate.setSound(null,null);vibrate.enableVibration(true);vibrate.setVibrationPattern(PATTERN);
        manager.createNotificationChannel(alarm);manager.createNotificationChannel(vibrate);
    }
    static String channelId(String channel){return "alarm".equals(channel)?ALARM_CHANNEL:"vibrate".equals(channel)?VIBRATE_CHANNEL:DEFAULT_CHANNEL;}

    // JSON bridge. Every answer carries the protocol; failures never claim an alarm is armed.
    private static JSONObject answer(boolean ok,String reason){
        JSONObject out=new JSONObject();try{out.put("protocol",PROTOCOL).put("ok",ok).put("reason",reason);}catch(Exception ignored){}return out;
    }
    String capabilities(){
        JSONObject out=answer(ENABLED,ENABLED?"ready":"disabled");
        try{out.put("enabled",ENABLED).put("permitted",ENABLED&&permitted()).put("exact",ENABLED&&exact()).put("restoredAfterReboot",false);}catch(Exception ignored){}
        return out.toString();
    }
    private String result(LocalAlarmLedger.Result result){
        JSONObject out=answer(result.ok,result.reason);
        try{JSONArray armed=new JSONArray();for(LocalAlarmLedger.Entry e:result.armed)armed.put(new JSONObject().put("id",e.id).put("at",e.at).put("channel",e.channel));
            out.put("armed",armed).put("exact",exact());}catch(Exception ignored){}
        return out.toString();
    }
    private static long instant(Object raw){
        if(!(raw instanceof Integer)&&!(raw instanceof Long))throw new IllegalArgumentException("at");return ((Number)raw).longValue();
    }
    String replace(String payload){
        if(!ENABLED)return answer(false,"disabled").toString();
        try{
            if(payload==null||payload.length()>16384)return answer(false,"invalid-request").toString();
            JSONObject request=new JSONObject(payload);
            if(!PROTOCOL.equals(request.optString("protocol")))return answer(false,"invalid-request").toString();
            JSONArray raw=request.getJSONArray("jobs");List<LocalAlarmLedger.Job> jobs=new ArrayList<>();
            for(int i=0;i<raw.length();i++){JSONObject job=raw.getJSONObject(i);
                jobs.add(new LocalAlarmLedger.Job(job.getString("id"),instant(job.get("at")),job.getString("channel"),job.getString("title"),job.getString("body")));}
            ensureChannels(context);
            return result(ledger().replace(request.getString("group"),jobs));
        }catch(Exception error){return answer(false,"invalid-request").toString();}
    }
    String cancelGroup(String group){
        if(!ENABLED)return answer(false,"disabled").toString();
        return result(ledger().cancel(group));
    }
    String group(String group){
        JSONObject out=answer(ENABLED,ENABLED?"sampled":"disabled");
        try{JSONArray jobs=new JSONArray();if(ENABLED)for(LocalAlarmLedger.Entry e:ledger().group(group))jobs.put(new JSONObject().put("id",e.id).put("at",e.at).put("channel",e.channel));
            out.put("jobs",jobs);}catch(Exception error){return answer(false,"journal-unavailable").toString();}
        return out.toString();
    }
}
