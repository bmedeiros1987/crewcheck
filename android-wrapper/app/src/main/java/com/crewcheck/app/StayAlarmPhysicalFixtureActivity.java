package com.crewcheck.app;

/** Declared as launcher only by the dedicated CI debug overlay. No production
 * Activity, WebView, account store, API, credential or permission prompt runs. */
public final class StayAlarmPhysicalFixtureActivity extends android.app.Activity {
    @Override protected void onCreate(android.os.Bundle state){
        super.onCreate(state);
        if(!StayAlarmPhysicalFixture.enabled(this)){finish();return;}
        android.app.NotificationManager manager=(android.app.NotificationManager)getSystemService(NOTIFICATION_SERVICE);
        if(manager!=null)manager.createNotificationChannel(new android.app.NotificationChannel(
            "crewcheck_alerts","Teste local CrewCheck",android.app.NotificationManager.IMPORTANCE_HIGH));
        StayAlarmPhysicalFixture.show(this);
    }
}
