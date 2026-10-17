import com.crewcheck.app.CrewCheckMyCrewCareSsoDraft;
import static com.crewcheck.app.CrewCheckMyCrewCareSsoDraft.*;

public final class SsoDraftHarness {
  static int count;
  static void expect(Fact wanted, String origin, String path, String method, Phase phase, Shape shape) {
    Fact got = observed(origin,path,method,phase,shape);
    if (got != wanted) throw new AssertionError("observation mismatch case " + count);
    if (permitsNavigation(got) || permitsAcquisition(got)) throw new AssertionError("inactive contract granted access");
    count++;
  }
  public static void main(String[] args) {
    String api="https://api2.apicrewcare.com", broker="https://sso2.apihotels.com", sso="/LATAM/SSOLogin.aspx";
    expect(Fact.SSO_ENTRY,api,sso,"GET",Phase.ENTRY,Shape.NONE);
    expect(Fact.SSO_RETURN,api,sso,"GET",Phase.RETURN,Shape.OPAQUE_RETURN_KEY_ONLY);
    expect(Fact.BROKER_ENTRY,broker,"/sso/sp/startSSO.ping","GET",Phase.BROKER,Shape.BROKER_KEYS_ONLY_UNVERIFIED);
    expect(Fact.BROKER_ACS,broker,"/sso/sp/ACS.saml2","POST",Phase.ACS,Shape.NONE);
    expect(Fact.MYTRAVEL,api,"/LATAM/mytravel.aspx","GET",Phase.DESTINATION,Shape.NONE);
    expect(Fact.CALENDAR,api,"/LATAM/mycrewcalendar.aspx","GET",Phase.AUXILIARY,Shape.NONE);
    for(String bad:new String[]{"http://api2.apicrewcare.com",api+".invalid",api+":443","https://user@api2.apicrewcare.com",api+"/",api+"#x",null})
      expect(Fact.UNKNOWN,bad,sso,"GET",Phase.ENTRY,Shape.NONE);
    for(String bad:new String[]{"/latam/SSOLogin.aspx","/LATAM/%53SOLogin.aspx",sso+"/",sso+"?unknown",sso+"#x","/LATAM/../LATAM/SSOLogin.aspx",null})
      expect(Fact.UNKNOWN,api,bad,"GET",Phase.ENTRY,Shape.NONE);
    for(String bad:new String[]{"POST","get","UNKNOWN","HEAD",null})
      expect(Fact.UNKNOWN,api,sso,bad,Phase.ENTRY,Shape.NONE);
    for(Phase bad:new Phase[]{Phase.BROKER,Phase.IDP,Phase.ACS,Phase.RETURN,Phase.DESTINATION,Phase.AUXILIARY,null})
      expect(Fact.UNKNOWN,api,sso,"GET",bad,Shape.NONE);
    for(Shape bad:new Shape[]{Shape.UNKNOWN,Shape.BROKER_KEYS_ONLY_UNVERIFIED,Shape.OPAQUE_RETURN_KEY_ONLY,null})
      expect(Fact.UNKNOWN,api,sso,"GET",Phase.ENTRY,bad);
    expect(Fact.UNKNOWN,broker,"/sso/sp/ACS.saml2","GET",Phase.ACS,Shape.NONE); // POST rewritten as GET
    expect(Fact.UNKNOWN,api,"/LATAM/mycrewcalendar.aspx","GET",Phase.DESTINATION,Shape.NONE);
    expect(Fact.UNKNOWN,api,"/LATAM/mytravel.aspx","GET",Phase.ENTRY,Shape.NONE);
    expect(Fact.UNKNOWN,"https://login.microsoftonline.com","/{tenant-uuid}/saml2","GET",Phase.IDP,Shape.NONE);
    for (Fact fact:Fact.values()) if (permitsNavigation(fact) || permitsAcquisition(fact)) throw new AssertionError("access");
    if (permitsNavigation(null) || permitsAcquisition(null)) throw new AssertionError("null access");
    System.out.println("PASS inactive sanitized contract cases="+count);
  }
}
