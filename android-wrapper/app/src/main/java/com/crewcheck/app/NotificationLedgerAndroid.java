package com.crewcheck.app;

import android.app.AlarmManager;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.service.notification.StatusBarNotification;
import java.util.HashMap;
import java.util.Map;

final class NotificationLedgerAndroid implements NotificationLedger.Store,NotificationLedger.Device {
    static final String TAG="crewcheck-reminder:";
    private final Context context; private final SharedPreferences prefs;
    NotificationLedgerAndroid(Context context){this.context=context.getApplicationContext();prefs=this.context.getSharedPreferences("crewcheck_local_reminder_fence_v1",Context.MODE_PRIVATE);}
    static Intent envelope(Context context,String key){return new Intent(context,CrewCheckNotificationReceiver.class).setData(Uri.parse("crewcheck-reminder://job/"+key));}
    NotificationLedger ledger(){return new NotificationLedger(this,this);}
    public String scope(){return prefs.getString("scope","");}
    public String epoch(){return prefs.getString("epoch","");}
    public Map<String,Long> entries(){Map<String,Long> out=new HashMap<>();for(Map.Entry<String,?> e:prefs.getAll().entrySet())if(e.getKey().startsWith("job:")&&e.getValue() instanceof Long)out.put(e.getKey().substring(4),(Long)e.getValue());return out;}
    public void commit(String scope,String epoch,Map<String,Long> entries){
        SharedPreferences.Editor edit=prefs.edit();
        for(String key:prefs.getAll().keySet())if(key.startsWith("job:"))edit.remove(key);
        edit.putString("scope",scope).putString("epoch",epoch);
        for(Map.Entry<String,Long> e:entries.entrySet())edit.putLong("job:"+e.getKey(),e.getValue());
        if(!edit.commit()||!scope.equals(scope())||!epoch.equals(epoch())||!entries.equals(entries()))throw new IllegalStateException("reminder fence not committed");
    }
    public long now(){return System.currentTimeMillis();}
    public void cancel(String key){AlarmManager alarms=(AlarmManager)context.getSystemService(Context.ALARM_SERVICE);if(alarms==null)throw new IllegalStateException("alarm unavailable");PendingIntent pi=PendingIntent.getBroadcast(context,0,envelope(context,key),PendingIntent.FLAG_NO_CREATE|PendingIntent.FLAG_IMMUTABLE);if(pi!=null){alarms.cancel(pi);pi.cancel();}}
    public void dismiss(){NotificationManager notifications=(NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);if(notifications==null)throw new IllegalStateException("notifications unavailable");for(StatusBarNotification active:notifications.getActiveNotifications())if(active.getTag()!=null&&active.getTag().startsWith(TAG))notifications.cancel(active.getTag(),0);}
}
