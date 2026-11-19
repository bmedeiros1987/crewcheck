package com.crewcheck.app;

import android.content.Context;
import android.content.SharedPreferences;

/** App-private persistence for the local confirmed-alarm authority.
 * Stores no login token, sender credential or provider secret. */
public final class StayAlarmDurableAuthorityAndroid {
    private static final String PREFS="crewcheck_stay_alarm_durable_authority_v1";
    private StayAlarmDurableAuthorityAndroid(){}
    public static StayAlarmDurableAuthority open(Context context){
        final Context app=context.getApplicationContext();
        final boolean qaBoot=StayAlarmQaAlerts.enabled(app);
        final SharedPreferences prefs=qaBoot
            ? app.createDeviceProtectedStorageContext().getSharedPreferences(StayAlarmQaBoot.AUTHORITY,Context.MODE_PRIVATE)
            : app.getSharedPreferences(StayAlarmPhysicalFixture.authorityName(app),Context.MODE_PRIVATE);
        StayAlarmDurableAuthority.Store store=new StayAlarmDurableAuthority.Store(){
            @Override public StayAlarmDurableAuthority.Snapshot read(){
                if(!prefs.contains("generation"))return null;
                boolean revoked=prefs.getBoolean("revoked",true);
                String owner=qaBoot?(revoked?null:StayAlarmQaBoot.slotOwner(prefs.getInt("slot",0))):prefs.getString("owner",null);
                String epoch=qaBoot?(revoked?null:StayAlarmQaBoot.epoch(prefs.getString("epoch",null))):prefs.getString("epoch",null);
                return new StayAlarmDurableAuthority.Snapshot(owner,epoch,prefs.getLong("expiresAt",0),prefs.getLong("generation",0),revoked);
            }
            @Override public boolean write(StayAlarmDurableAuthority.Snapshot value){
                SharedPreferences.Editor edit=prefs.edit().putLong("generation",value.generation).putLong("expiresAt",value.expiresAt).putBoolean("revoked",value.revoked);
                if(qaBoot){
                    if(value.revoked)edit.remove("slot").remove("epoch");
                    else edit.putInt("slot",StayAlarmQaBoot.slot(value.owner)).putString("epoch",StayAlarmQaBoot.epoch(value.epoch));
                }else{
                    if(value.owner==null)edit.remove("owner");else edit.putString("owner",value.owner);
                    if(value.epoch==null)edit.remove("epoch");else edit.putString("epoch",value.epoch);
                }
                return edit.commit();
            }
        };
        return new StayAlarmDurableAuthority(store,System::currentTimeMillis);
    }
}
