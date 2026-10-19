package com.crewcheck.watch;

import org.json.JSONObject;
import org.junit.Test;
import static org.junit.Assert.*;

public final class CrewLifeSnapshotTest {
    static final long NOW=1_800_000_000_000L;
    static final String STREAM="00000000-0000-4000-8000-000000000001";
    static JSONObject base() throws Exception {
        return new JSONObject().put("schemaVersion",2).put("streamId",STREAM).put("revision",2).put("kind","snapshot")
                .put("generatedAtEpochMs",NOW-60000).put("validUntilEpochMs",NOW+60000).put("metrics",new JSONObject());
    }
    static JSONObject metric(Object value,long until) throws Exception {
        return new JSONObject().put("state","valid").put("value",value).put("validUntilEpochMs",until);
    }
    static CrewLifeSnapshot parse(JSONObject json) { return CrewLifeSnapshot.fromJson(json,NOW); }
    @Test public void zeroIsMeasuredAndAbsenceIsNotZero() throws Exception {
        JSONObject j=base();j.getJSONObject("metrics").put("recoveryScore",metric(0,NOW+1000));
        CrewLifeSnapshot s=parse(j);
        assertEquals(Integer.valueOf(0),s.value("recoveryScore",NOW));assertEquals("0/100",s.complicationText(NOW));
        assertNull(s.value("steps",NOW));assertEquals(-1,s.steps);
        assertEquals(Integer.valueOf(0),ComplicationText.crewLife(s,NOW).rangedValue);
        assertTrue(s.accessibilityDescription(NOW).contains("0 de 100"));
    }
    @Test public void malformedMetricReplacesOnlyItsOwnValue() throws Exception {
        for(Object invalid:new Object[]{-1,101,1.5,"0",JSONObject.NULL}) {
            JSONObject j=base();j.getJSONObject("metrics").put("recoveryScore",metric(invalid,NOW+1000)).put("steps",metric(51,NOW+1000));
            CrewLifeSnapshot s=parse(j);assertNull(s.value("recoveryScore",NOW));assertEquals(Integer.valueOf(51),s.value("steps",NOW));
        }
    }
    @Test public void unknownNonvalidAndMissingStatesNeverShowValues() throws Exception {
        for(String state:new String[]{"no_data","expired","sample_time_unknown","revoked","permission_denied","invalid","other"}) {
            JSONObject j=base();j.getJSONObject("metrics").put("steps",new JSONObject().put("state",state).put("validUntilEpochMs",0));
            assertNull(parse(j).value("steps",NOW));
        }
    }
    @Test public void perMetricExpiryIsStrictAndNeverRenewed() throws Exception {
        JSONObject j=base();j.getJSONObject("metrics").put("recoveryScore",metric(78,NOW+1000)).put("steps",metric(51,NOW+3000));
        CrewLifeSnapshot s=parse(j);assertEquals(NOW+1000,s.nextExpiry(NOW));
        assertNull(s.value("recoveryScore",NOW+1000));assertEquals(Integer.valueOf(51),s.value("steps",NOW+1000));
        CrewLifeSnapshot loaded=CrewLifeSnapshot.fromJson(s.toJson(),NOW+2000);
        assertNull(loaded.value("recoveryScore",NOW+2000));assertEquals(NOW+3000,loaded.nextExpiry(NOW+2000));
        assertEquals(NOW+60000,loaded.validUntilEpochMs);
    }
    @Test public void envelopeExpiryAndDeadlineOverflowCannotSupplyFreshness() throws Exception {
        JSONObject j=base();j.getJSONObject("metrics").put("steps",metric(51,NOW+60001));assertNull(parse(j).value("steps",NOW));
        j=base().put("validUntilEpochMs",NOW-1);j.getJSONObject("metrics").put("steps",metric(51,NOW-1));assertNull(parse(j).value("steps",NOW));
    }
    @Test public void absentRoundtripNeverManufacturesZero() throws Exception {
        JSONObject m=parse(base()).toJson().getJSONObject("metrics").getJSONObject("sleepMinutes");
        assertFalse(m.has("value"));assertEquals("no_data",m.getString("state"));assertEquals(0,m.getLong("validUntilEpochMs"));
    }
    @Test public void futureAndWrongTypedEnvelopeRejected() throws Exception {
        for(String key:new String[]{"schemaVersion","revision","generatedAtEpochMs","validUntilEpochMs"}) {
            JSONObject j=base();j.put(key,"2");assertThrows(IllegalArgumentException.class,()->parse(j));
        }
        assertThrows(IllegalArgumentException.class,()->parse(base().put("generatedAtEpochMs",NOW+1)));
        assertThrows(IllegalArgumentException.class,()->parse(base().put("revision",0)));
        assertThrows(IllegalArgumentException.class,()->parse(base().put("revision",9_007_199_254_740_992D)));
    }
    @Test public void unknownAndRecursiveFieldsRejectWholeEnvelope() throws Exception {
        for(String key:new String[]{"email","ownerId","heartRateSamples","sleepStages","location","recoveryLabel","scoreKind"}) {
            assertThrows(IllegalArgumentException.class,()->parse(base().put(key,"synthetic")));
            JSONObject j=base();j.getJSONObject("metrics").put("steps",metric(51,NOW+1000).put(key,"synthetic"));
            assertThrows(IllegalArgumentException.class,()->parse(j));
        }
        JSONObject j=base();j.getJSONObject("metrics").put("steps",metric(new JSONObject().put("email","synthetic"),NOW+1000));
        assertThrows(IllegalArgumentException.class,()->parse(j));
    }
    @Test public void tombstoneIsValueFreeAndAlwaysUnavailable() throws Exception {
        CrewLifeSnapshot s=parse(base().put("kind","revoked").put("validUntilEpochMs",0));assertFalse(s.hasAny(NOW));
        JSONObject j=s.toJson();j.getJSONObject("metrics").put("steps",metric(1,NOW+1000));assertThrows(IllegalArgumentException.class,()->parse(j));
    }
    @Test public void v1IsNeverReinterpretedAsV2() throws Exception {
        assertThrows(IllegalArgumentException.class,()->parse(base().put("schemaVersion",1)));
    }
    @Test public void zeroSleepAndActivitySurviveRendering() throws Exception {
        JSONObject j=base();for(String k:new String[]{"sleepMinutes","steps","activeMinutes"}) j.getJSONObject("metrics").put(k,metric(0,NOW+1000));
        CrewLifeSnapshot s=parse(j);assertEquals("0h00",s.sleepText(NOW));assertTrue(ComplicationText.crewLife(s,NOW).longText.contains("0h00"));
    }
    @Test public void sharedInteroperabilityVectorsExecuteTheActualParser() throws Exception {
        try(java.io.InputStream input=getClass().getResourceAsStream("/crewlife-v2-vectors.json")) {
            assertNotNull(input);
            org.json.JSONArray vectors=new org.json.JSONArray(new String(input.readAllBytes(),java.nio.charset.StandardCharsets.UTF_8));
            for(int i=0;i<vectors.length();i++) {
                JSONObject v=vectors.getJSONObject(i);
                Integer actual=CrewLifeSnapshot.fromJson(v.getJSONObject("payload"),v.getLong("now")).value("recoveryScore",v.getLong("now"));
                if(v.isNull("expectedScore")) assertNull(v.getString("id"),actual);
                else assertEquals(v.getString("id"),Integer.valueOf(v.getInt("expectedScore")),actual);
            }
        }
    }
    @Test public void demoRoundTripsAndLimitsRemain() {
        CrewLifeSnapshot s=CrewLifeSnapshot.demo(NOW);assertEquals(78,CrewLifeSnapshot.fromJson(s.toJson(),NOW).recoveryScore);
        assertThrows(IllegalArgumentException.class,()->CrewLifeSnapshot.fromJson("x".repeat(4097),NOW));
    }
}
