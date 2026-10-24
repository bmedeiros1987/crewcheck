package com.crewcheck.app;

import android.content.Context;
import android.content.SharedPreferences;

/** App-private persistence for the local confirmed-alarm authority.
 * Stores no login token, sender credential or provider secret. */
public final class StayAlarmDurableAuthorityAndroid {
    private static final String PREFS="crewcheck_stay_alarm_durable_authority_v1";
    private StayAlarmDurableAuthorityAndroid(){}
    public static StayAlarmDurableAuthority open(Context context){
        final SharedPreferences prefs=context.getApplicationContext().getSharedPreferences(PREFS,Context.MODE_PRIVATE);
        StayAlarmDurableAuthority.Store store=new StayAlarmDurableAuthority.Store(){
            @Override public StayAlarmDurableAuthority.Snapshot read(){
                if(!prefs.contains("generation"))return null;
                String owner=prefs.getString("owner",null),epoch=prefs.getString("epoch",null);
                return new StayAlarmDurableAuthority.Snapshot(owner,epoch,prefs.getLong("expiresAt",0),prefs.getLong("generation",0),prefs.getBoolean("revoked",true));
            }
            @Override public boolean write(StayAlarmDurableAuthority.Snapshot value){
                SharedPreferences.Editor edit=prefs.edit().putLong("generation",value.generation).putLong("expiresAt",value.expiresAt).putBoolean("revoked",value.revoked);
                if(value.owner==null)edit.remove("owner");else edit.putString("owner",value.owner);
                if(value.epoch==null)edit.remove("epoch");else edit.putString("epoch",value.epoch);
                return edit.commit();
            }
        };
        return new StayAlarmDurableAuthority(store,System::currentTimeMillis);
    }
}
