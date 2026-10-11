package com.crewcheck.app;
/** Executes production origin/frame admission with real Android Uri classes. */
public final class StayAlarmHostAdmissionFixture {
 static int checks;static void check(boolean value){checks++;if(!value)throw new AssertionError("admission "+checks);}
 public static void main(String[] args){
  check(StayAlarmHostAndroid.admitted(true,"https://crewcheck.online","https://crewcheck.online?app=1"));
  check(!StayAlarmHostAndroid.admitted(false,"https://crewcheck.online","https://crewcheck.online"));
  check(!StayAlarmHostAndroid.admitted(true,"https://evil.invalid","https://crewcheck.online"));
  check(!StayAlarmHostAndroid.admitted(true,"https://crewcheck.online","https://portal.invalid"));
  check(!StayAlarmHostAndroid.admitted(true,"http://crewcheck.online","https://crewcheck.online"));
  check(!StayAlarmHostAndroid.admitted(true,"https://crewcheck.online:444","https://crewcheck.online"));
  check(!StayAlarmHostAndroid.admitted(true,"https://user@crewcheck.online","https://crewcheck.online"));
  check(!StayAlarmHostAndroid.admitted(true,"https://crewcheck.online.evil.invalid","https://crewcheck.online"));
  check(!StayAlarmHostAndroid.PREPARED_HOST_ENABLED);check(StayAlarmHostAndroid.install(null,null)==null);
  check(!StayAlarmHostAndroid.owner().enabled());check(StayAlarmHostAndroid.owner().activeOwner()==null);
  System.out.println("PASS host production admission: "+checks+" assertions; exact origin/main frame/navigation/OFF; no WebView/device instantiated");
 }
}
