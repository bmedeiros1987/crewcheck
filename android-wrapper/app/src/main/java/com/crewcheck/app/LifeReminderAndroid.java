package com.crewcheck.app;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.provider.Settings;
import org.json.JSONObject;
import java.util.Iterator;
import java.util.HashMap;
import java.util.Map;

/** Existing permission/channel/receiver; no new transport, credential or boot restoration. */
final class LifeReminderAndroid implements LifeReminderLedger.Store, LifeReminderLedger.Owner, LifeReminderLedger.Device {
    private static final String JOURNAL="life:v1:journal";
    private final Context context; private final SharedPreferences prefs;
    LifeReminderAndroid(Context context) {
        this.context=context.getApplicationContext();
        prefs=this.context.getSharedPreferences("crewcheck_local_reminder_fence_v1",Context.MODE_PRIVATE);
    }
    LifeReminderLedger ledger() { return new LifeReminderLedger(this,this,this); }
    public String read() { return prefs.getString(JOURNAL,""); }
    public String context() {
        if (!NotificationLedger.cancellationCertain()) return "";
        String scope=prefs.getString("scope",""), epoch=prefs.getString("epoch","");
        // BOOT_COUNT is readable without a new Android permission. Unknown boot => unavailable.
        int boot=Settings.Global.getInt(context.getContentResolver(),Settings.Global.BOOT_COUNT,-1);
        if (scope.isEmpty() || epoch.isEmpty() || boot<0) return "";
        return NotificationIdentity.key("life-context",scope+":"+epoch,boot);
    }
    public void write(String json) throws Exception {
        JSONObject journal=new JSONObject(json), records=journal.getJSONObject("records");
        if (!journal.getString("context").equals(context())) throw new IllegalStateException("owner changed");
        Map<String,Object> untouched=new HashMap<>();
        for (Map.Entry<String,?> field:prefs.getAll().entrySet())
            if (!field.getKey().equals(JOURNAL) && !field.getKey().startsWith("job:"+LifeReminderLedger.PREFIX)) untouched.put(field.getKey(),field.getValue());
        Map<String,Long> mirrored=new HashMap<>();
        SharedPreferences.Editor edit=prefs.edit();
        // Mirror only opaque Life keys into the existing global logout fence, in the same commit.
        // All non-Life entries and the active account scope/epoch remain unchanged.
        for (String field:prefs.getAll().keySet()) if (field.startsWith("job:"+LifeReminderLedger.PREFIX)) edit.remove(field);
        for (Iterator<String> i=records.keys();i.hasNext();) {
            JSONObject r=records.getJSONObject(i.next()); String key=r.getString("key");
            if (!key.isEmpty() && (r.getString("phase").equals("armed") || r.getString("phase").equals("arm_pending"))) mirrored.put("job:"+key,r.getLong("at")+120_000);
            JSONObject cleanup=r.getJSONObject("cleanup");
            for (Iterator<String> c=cleanup.keys();c.hasNext();) { String old=c.next(); mirrored.put("job:"+old,cleanup.getLong(old)+120_000); }
        }
        for (Map.Entry<String,Long> entry:mirrored.entrySet()) edit.putLong(entry.getKey(),entry.getValue());
        long otherJobs=untouched.keySet().stream().filter(field->field.startsWith("job:")).count();
        if (otherJobs+mirrored.size()>256) throw new IllegalStateException("existing global reminder limit");
        edit.putString(JOURNAL,json);
        if (!edit.commit() || !json.equals(read())) throw new IllegalStateException("Life journal receipt failed");
        Map<String,Object> afterUntouched=new HashMap<>(), afterMirrored=new HashMap<>();
        for (Map.Entry<String,?> field:prefs.getAll().entrySet()) {
            if (field.getKey().startsWith("job:"+LifeReminderLedger.PREFIX)) afterMirrored.put(field.getKey(),field.getValue());
            else if (!field.getKey().equals(JOURNAL)) afterUntouched.put(field.getKey(),field.getValue());
        }
        if (!untouched.equals(afterUntouched) || !mirrored.equals(afterMirrored)) throw new IllegalStateException("Life mirror receipt failed");
    }
    public long now() { return System.currentTimeMillis(); }
    public void cancel(String key) throws Exception {
        if (!LifeReminderLedger.lifeKey(key)) throw new IllegalArgumentException("Life key required");
        AlarmManager alarms=(AlarmManager)context.getSystemService(Context.ALARM_SERVICE);
        NotificationManager notifications=(NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (alarms==null || notifications==null) throw new IllegalStateException("OS service unavailable");
        PendingIntent pending=PendingIntent.getBroadcast(context,0,NotificationLedgerAndroid.envelope(context,key),PendingIntent.FLAG_NO_CREATE|PendingIntent.FLAG_IMMUTABLE);
        if (pending!=null) { alarms.cancel(pending); pending.cancel(); }
        notifications.cancel(NotificationLedgerAndroid.TAG+key,0);
    }
    public void arm(String key,String generation,long at,String title,String body) throws Exception {
        if (!LifeReminderLedger.lifeKey(key) || !generation.equals(context())) throw new IllegalStateException("owner changed");
        if (Build.VERSION.SDK_INT>=33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED) throw new IllegalStateException("permission unavailable");
        AlarmManager alarms=(AlarmManager)context.getSystemService(Context.ALARM_SERVICE);
        if (alarms==null) throw new IllegalStateException("alarm unavailable");
        Intent intent=NotificationLedgerAndroid.envelope(context,key).putExtra("notificationKey",key).putExtra("notificationEpoch",generation)
                .putExtra("scheduledAt",at).putExtra("title",title).putExtra("body",body);
        PendingIntent pending=PendingIntent.getBroadcast(context,0,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        if (Build.VERSION.SDK_INT<31 || alarms.canScheduleExactAlarms()) {
            try { alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,at,pending); return; }
            catch (SecurityException revoked) { /* existing grant changed; retain inexact fallback */ }
        }
        alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,at,pending);
    }
}
