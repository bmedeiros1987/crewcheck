package com.crewcheck.watch;
import org.junit.Test;
import static org.junit.Assert.*;
public class WatchOvernightTextTest {
 @Test public void overnightNeverDegradesToGenericProgramOrAirportApz()throws Exception{
  long now=1800000000000L;
  var json=WatchContextSnapshot.demo(now).toJson().put("state","OVERNIGHT").put("headline","PERNOITE")
   .put("hotelPickup", "").put("overnight","Synthetic hotel").put("presentationTime","09:20");
  var s=WatchContextSnapshot.fromJson(json.toString());
  assertEquals("PERNOITE",s.complicationTitle(now));
  assertEquals("Pernoite • APZ hotel não informada",s.complicationLongText(now));
  assertFalse(s.complicationLongText(now).contains("09:20"));
 }
 @Test public void specificHotelApzIncludesCivilDateAndStaleSnapshotHidesIt()throws Exception{
  long now=1800000000000L;
  var json=WatchContextSnapshot.demo(now).toJson().put("state","OVERNIGHT").put("headline","PERNOITE")
   .put("hotelPickup","APZ hotel 19/10 07:30 America/Recife").put("validUntilEpochMs",now+1000);
  var s=WatchContextSnapshot.fromJson(json.toString());
  assertTrue(s.complicationLongText(now).contains("19/10 07:30"));
  assertEquals("Abra o CrewCheck no celular",s.complicationLongText(now+1001));
 }
}
