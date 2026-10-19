package com.crewcheck.app;

import static org.junit.Assert.*;
import android.Manifest;
import android.app.AlarmManager;
import android.app.Application;
import android.content.Context;
import android.content.Intent;
import android.provider.Settings;
import org.json.JSONObject;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.Shadows;
import org.robolectric.annotation.Config;

/** Actual adapter, SharedPreferences, AlarmManager PendingIntent identity and receiver under Android shadows. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk={26,35}, manifest=Config.NONE)
public class LifeReminderAndroidTest {
    private Application app; private AlarmManager alarms; private LifeReminderLedger life;
    private static final String ID="hydration:2026-10-19:morning";
    @Before public void setup() throws Exception {
        app=RuntimeEnvironment.getApplication();
        app.getSharedPreferences("crewcheck_local_reminder_fence_v1",0).edit().clear().commit();
        Settings.Global.putInt(app.getContentResolver(),Settings.Global.BOOT_COUNT,1);
        Shadows.shadowOf(app).grantPermissions(Manifest.permission.POST_NOTIFICATIONS);
        alarms=(AlarmManager)app.getSystemService(Context.ALARM_SERVICE);
        assertTrue(new NotificationLedgerAndroid(app).ledger().scope("synthetic-owner-A"));
        life=new LifeReminderAndroid(app).ledger();
    }
    private JSONObject request(String op,long rev) throws Exception {
        return new JSONObject().put("schemaVersion",1).put("op",op).put("context",new JSONObject(life.state()).getString("context")).put("id",ID).put("revision",rev);
    }
    private JSONObject replace(long rev,long at) throws Exception {return request("replace",rev).put("at",at).put("title","Synthetic").put("body","Fixture only");}
    private JSONObject send(JSONObject r)throws Exception{return new JSONObject(life.update(r.toString()));}
    private void awaitReceiverWindow(Intent intent)throws Exception{
        long at=intent.getLongExtra("scheduledAt",0L);
        while(System.currentTimeMillis()<at)Thread.sleep(Math.min(20,Math.max(1,at-System.currentTimeMillis())));
        assertTrue("fixture must reach a valid receiver time",NotificationTiming.shouldAttempt(at,System.currentTimeMillis(),true));
    }
    private Intent lifeIntent()throws Exception{
        for(var alarm:Shadows.shadowOf(alarms).getScheduledAlarms()){
            Intent i=Shadows.shadowOf(alarm.operation).getSavedIntent();
            if(LifeReminderLedger.lifeKey(i.getStringExtra("notificationKey")))return i;
        }
        throw new AssertionError("Life alarm absent");
    }
    private String other(long at)throws Exception{
        String key=NotificationIdentity.key("Other module","Synthetic",at);
        assertTrue(new NotificationLedgerAndroid(app).ledger().schedule(key,at,epoch->{
            Intent i=NotificationLedgerAndroid.envelope(app,key).putExtra("notificationKey",key).putExtra("notificationEpoch",epoch).putExtra("scheduledAt",at);
            alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,at,android.app.PendingIntent.getBroadcast(app,0,i,android.app.PendingIntent.FLAG_UPDATE_CURRENT|android.app.PendingIntent.FLAG_IMMUTABLE));
        }));return key;
    }
    @Test public void replaceAndCancelPreserveOtherModuleAlarmAndLedger()throws Exception{
        long now=System.currentTimeMillis();String other=other(now+120000);
        JSONObject first=replace(1,now+1000);assertTrue(send(first).getBoolean("ok"));Intent old=lifeIntent();
        assertTrue(send(first).getBoolean("ok"));assertEquals(2,Shadows.shadowOf(alarms).getScheduledAlarms().size());
        assertTrue(send(replace(2,now+2000)).getBoolean("ok"));assertEquals(2,Shadows.shadowOf(alarms).getScheduledAlarms().size());
        assertTrue(send(request("cancel",3)).getBoolean("ok"));assertEquals(1,Shadows.shadowOf(alarms).getScheduledAlarms().size());
        assertTrue(new NotificationLedgerAndroid(app).entries().containsKey(other));
        awaitReceiverWindow(old);new CrewCheckNotificationReceiver().onReceive(app,old);
        assertEquals(0,Shadows.shadowOf((android.app.NotificationManager)app.getSystemService(Context.NOTIFICATION_SERVICE)).size());
    }
    @Test public void globalAccountFenceIncludesLifeAndOldRequestCannotActInNewAccount()throws Exception{
        JSONObject r=replace(1,System.currentTimeMillis()+1000);assertTrue(send(r).getBoolean("ok"));Intent old=lifeIntent();
        assertFalse(new NotificationLedgerAndroid(app).entries().isEmpty());
        assertTrue(new NotificationLedgerAndroid(app).ledger().scope("synthetic-owner-B"));
        assertEquals(0,Shadows.shadowOf(alarms).getScheduledAlarms().size());
        assertEquals("wrong_context",send(r).getString("status"));
        awaitReceiverWindow(old);new CrewCheckNotificationReceiver().onReceive(app,old);
        assertEquals(0,Shadows.shadowOf((android.app.NotificationManager)app.getSystemService(Context.NOTIFICATION_SERVICE)).size());
    }
    @Test public void bootChangeAndUnknownBootNeverRestoreOrAuthorizeOldTicket()throws Exception{
        JSONObject r=replace(1,System.currentTimeMillis()+1000);assertTrue(send(r).getBoolean("ok"));Intent old=lifeIntent();
        int scheduled=Shadows.shadowOf(alarms).getScheduledAlarms().size();
        Settings.Global.putInt(app.getContentResolver(),Settings.Global.BOOT_COUNT,2);
        assertEquals(0,new JSONObject(life.state()).getJSONObject("records").length());
        assertEquals(scheduled,Shadows.shadowOf(alarms).getScheduledAlarms().size()); // no restore side effect
        assertEquals("wrong_context",send(r).getString("status"));
        awaitReceiverWindow(old);new CrewCheckNotificationReceiver().onReceive(app,old);
        assertEquals(0,Shadows.shadowOf((android.app.NotificationManager)app.getSystemService(Context.NOTIFICATION_SERVICE)).size());
        Settings.Global.putInt(app.getContentResolver(),Settings.Global.BOOT_COUNT,-1);assertFalse(new JSONObject(life.state()).getBoolean("available"));
    }
    @Test public void actualBridgeAndReceiverExposeOnlyCurrentEligibleLifeRecord()throws Exception{
        MainActivity a=Robolectric.buildActivity(MainActivity.class).get();
        var bridge=a.new CrewCheckNativeBridge();assertTrue(new JSONObject(bridge.lifeReminderState()).getBoolean("available"));
        long at=System.currentTimeMillis()+1000;JSONObject r=replace(1,at);
        assertTrue(new JSONObject(bridge.updateLifeReminder(r.toString())).getBoolean("ok"));Intent i=lifeIntent();
        awaitReceiverWindow(i);
        assertEquals("test POST_NOTIFICATIONS grant",android.content.pm.PackageManager.PERMISSION_GRANTED,app.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS));
        assertTrue("test clock is inside receiver window: "+System.currentTimeMillis()+" / "+at,NotificationTiming.shouldAttempt(at,System.currentTimeMillis(),true));
        new CrewCheckNotificationReceiver().onReceive(app,i);
        var notifications=Shadows.shadowOf((android.app.NotificationManager)app.getSystemService(Context.NOTIFICATION_SERVICE));assertEquals(1,notifications.size());
        new CrewCheckNotificationReceiver().onReceive(app,i);assertEquals(1,notifications.size());
        assertTrue(new JSONObject(bridge.updateLifeReminder(request("cancel",2).toString())).getBoolean("ok"));assertEquals(0,notifications.size());
    }
    @Test @Config(sdk=35) public void deniedPermissionStillAllowsCancellationButNeverAcceptedNewArm()throws Exception{
        long now=System.currentTimeMillis();String other=other(now+120000);
        assertTrue(send(replace(1,now+60000)).getBoolean("ok"));
        Shadows.shadowOf(app).denyPermissions(Manifest.permission.POST_NOTIFICATIONS);
        assertTrue(send(request("cancel",2)).getBoolean("ok"));
        assertEquals("failed",send(replace(3,now+90000)).getString("status"));
        assertEquals(1,Shadows.shadowOf(alarms).getScheduledAlarms().size());assertTrue(new NotificationLedgerAndroid(app).entries().containsKey(other));
    }
    @Test public void existingCombinedLimitDoesNotDeleteOtherModuleEntriesToMakeRoom()throws Exception{
        var prefs=app.getSharedPreferences("crewcheck_local_reminder_fence_v1",0);var editor=prefs.edit();
        for(int i=0;i<256;i++)editor.putLong("job:"+NotificationIdentity.key("other",String.valueOf(i),0),System.currentTimeMillis()+180000);
        assertTrue(editor.commit());
        assertFalse(send(replace(1,System.currentTimeMillis()+60000)).getBoolean("ok"));
        assertEquals(256,new NotificationLedgerAndroid(app).entries().size());assertEquals(0,Shadows.shadowOf(alarms).getScheduledAlarms().size());
    }
}
