import com.crewcheck.app.StayAlarmSessionHost;
public final class StayAlarmSessionHostFixture {
 static int checks;static void check(boolean value){checks++;if(!value)throw new AssertionError("session check "+checks);}
 public static void main(String[] args){long[] now={1000};String[] persisted={null};
  StayAlarmSessionHost host=new StayAlarmSessionHost(true,()->now[0],(id,epoch,expiry)->persisted[0]=id);
  long first=host.begin();check(host.activeOwner()==null);check(host.verified(first,"verified-a","epoch-a",now[0]+300000));check(host.activeOwner().equals("verified-a"));
  long second=host.begin();check(persisted[0]==null);check(!host.verified(first,"stale","old",now[0]+300000));check(host.activeOwner()==null);
  check(host.verified(second,"verified-b","epoch-b",now[0]+300000));host.revoke();check(host.activeOwner()==null);check(persisted[0]==null);
  check(!host.verified(second,"late-after-logout","old",now[0]+300000));
  long third=host.begin();check(!host.verified(third,"b","e",now[0]+300001));check(!host.verified(third,"b","e",now[0]));
  check(host.verified(third,"b","e",now[0]+1));now[0]++;check(host.activeOwner()==null);check(host.epoch()==null);
  StayAlarmSessionHost off=new StayAlarmSessionHost(false,()->now[0],(id,epoch,expiry)->{});check(!off.verified(off.begin(),"b","e",now[0]+1));check(!off.enabled());
  System.out.println("PASS trusted host: "+checks+" assertions; verified result/lease/logout/account switch/stale generation/OFF; fake clock/store only");
 }
}
