import com.crewcheck.app.NotificationLedger;
import com.crewcheck.app.NotificationIdentity;
import java.util.*;

public class NotificationLedgerFixture {
 static int cases;static void check(boolean value){cases++;if(!value)throw new AssertionError("case "+cases);}
 static class Store implements NotificationLedger.Store {
  String scope="",epoch="";Map<String,Long> rows=new HashMap<>();boolean fail;
  public String scope(){return scope;}public String epoch(){return epoch;}public Map<String,Long> entries(){return new HashMap<>(rows);}
  public void commit(String s,String e,Map<String,Long> r){if(fail)throw new IllegalStateException();scope=s;epoch=e;rows=new HashMap<>(r);}
 }
 static class Device implements NotificationLedger.Device {long now=1_800_000_000_000L;List<String> cancelled=new ArrayList<>();boolean fail;int dismiss;
  public long now(){return now;}public void cancel(String key){cancelled.add(key);if(fail)throw new IllegalStateException();}public void dismiss(){dismiss++;if(fail)throw new IllegalStateException();}}
 public static void main(String[] args){Store s=new Store();Device d=new Device();NotificationLedger l=new NotificationLedger(s,d);long at=d.now+60_000;String key=NotificationIdentity.key("title","body",at);List<String> armed=new ArrayList<>();
  check(!l.schedule(key,at,armed::add));check(armed.isEmpty());
  check(l.scope("account-A"));String first=s.epoch;check(!s.scope.contains("account-A"));check(l.schedule(key,at,armed::add));check(armed.get(0).equals(first));
  check(l.scope("account-A"));check(first.equals(s.epoch)&&s.rows.size()==1);
  check(!l.claim(key,first,at));d.now=at;check(new NotificationLedger(s,d).claim(key,first,at));check(!l.claim(key,first,at));
  at=d.now+60_000;check(l.schedule(key,at,armed::add));String old=s.epoch;check(l.scope(""));check(s.scope.isEmpty()&&s.rows.isEmpty());check(d.cancelled.contains(key));check(!l.claim(key,old,at));check(!l.schedule(key,at,armed::add));
  check(l.scope("account-B"));check(!old.equals(s.epoch));check(l.schedule(key,at,armed::add));old=s.epoch;check(l.scope("account-A"));check(!l.claim(key,old,at));
  check(l.schedule(key,at,armed::add));old=s.epoch;d.fail=true;check(!l.scope("account-B"));check(!old.equals(s.epoch)&&s.rows.isEmpty());check(!l.claim(key,old,at));check(!l.schedule(key,at,armed::add));d.fail=false;check(l.scope("account-B"));
  check(l.schedule(key,at,armed::add));String epoch=s.epoch;check(!l.claim("wrong",epoch,at));check(!l.claim(key,"old",at));check(!l.claim(key,epoch,at+1));d.now=at+120_001;check(!l.claim(key,epoch,at));
  at=d.now+60_000;check(l.schedule(key,at,armed::add));d.now=at+120_000;check(l.claim(key,s.epoch,at));
  at=d.now+60_000;check(!l.schedule(key,at,e->{throw new SecurityException();}));check(!s.rows.containsKey(key));
  s.fail=true;check(!l.scope("account-C"));check(!l.claim(key,s.epoch,at));check(!l.schedule(key,at,armed::add));s.fail=false;check(l.scope("account-C"));
  for(int i=0;i<256;i++)check(l.schedule("k"+i,d.now+60_000,armed::add));check(!l.schedule("overflow",d.now+60_000,armed::add));check(s.rows.size()==256);check(l.schedule("k0",d.now+60_000,armed::add));
  check(l.scope(""));check(s.rows.isEmpty());check(d.dismiss>0);
  System.out.println("PASS actual native cancellation ledger: "+cases+" assertions; logout/account-switch, process-death, dedupe, expiry, disk/OS faults; synthetic only");
 }
}
