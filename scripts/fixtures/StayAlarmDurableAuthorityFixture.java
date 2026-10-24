import com.crewcheck.app.*;
public final class StayAlarmDurableAuthorityFixture {
  static int checks=0; static void ok(boolean value,String message){checks++;if(!value)throw new AssertionError(message);}
  static final class Clock implements StayAlarmDurableAuthority.Clock {long now=1000;public long now(){return now;}}
  static final class Store implements StayAlarmDurableAuthority.Store {boolean fail;StayAlarmDurableAuthority.Snapshot value;public StayAlarmDurableAuthority.Snapshot read(){return value;}public boolean write(StayAlarmDurableAuthority.Snapshot v){if(fail)return false;value=v;return true;}}
  static StayAlarmEngine.Record record(String owner,String epoch,String event,long alarm,long apz,String state){
    return new StayAlarmEngine.Record(StayAlarmEngine.identity(owner,event),owner,epoch,event,"op-"+event,1,
      java.time.Instant.ofEpochMilli(alarm).toString(),alarm,apz,"absolute",state);
  }
  static final class Owner implements StayAlarmEngine.Owner {boolean enabled;String owner,epoch;Owner(boolean e,String o,String x){enabled=e;owner=o;epoch=x;}public boolean enabled(){return enabled;}public String activeOwner(){return enabled?owner:null;}public String epoch(){return enabled?epoch:null;}}
  public static void main(String[] args){
    Clock clock=new Clock();Store store=new Store();StayAlarmDurableAuthority first=new StayAlarmDurableAuthority(store,clock);
    StayAlarmEngine.Record a=record("A","epoch-a","stay-a",2000,9000,"scheduled");
    ok(first.grant(a),"confirmed scheduled record grants durable authority");
    ok(first.enabled()&&"A".equals(first.activeOwner())&&"epoch-a".equals(first.epoch()),"authority active");
    StayAlarmDurableAuthority afterRestart=new StayAlarmDurableAuthority(store,clock);
    ok("A".equals(afterRestart.activeOwner()),"authority survives process restart");
    ok(!afterRestart.grant(record("A","epoch-a","bad",2000,9000,"pending-schedule")),"pending state cannot grant");
    ok(!afterRestart.revoke("A","wrong"),"wrong epoch cannot revoke");
    ok("A".equals(afterRestart.activeOwner()),"wrong revoke preserves authority");
    StayAlarmCompositeOwner composite=new StayAlarmCompositeOwner(new Owner(true,"B","epoch-b"),afterRestart);
    ok("B".equals(composite.activeOwner())&&"epoch-b".equals(composite.epoch()),"online owner overrides durable old account");
    ok(afterRestart.revoke("A","epoch-a"),"matching logout revokes");
    ok(!afterRestart.enabled(),"revocation tombstone disables fallback");
    ok(first.grant(record("B","epoch-b","stay-b",3000,7000,"scheduled")),"new account can grant after tombstone");
    clock.now=7000;ok(!first.enabled(),"authority expires at APZ");
    clock.now=1000;Store stable=new Store();StayAlarmDurableAuthority durable=new StayAlarmDurableAuthority(stable,clock);
    ok(durable.revokeCurrent(),"empty current scope is confirmed absent");
    ok(durable.grant(a),"confirmed A available for reauth");
    ok("epoch-a".equals(durable.epochForVerifiedOwner("A","new-online-epoch")),"same verified owner retains confirmed local epoch");
    ok("epoch-b".equals(durable.epochForVerifiedOwner("B","epoch-b")),"different verified owner gets a new epoch");
    ok(stable.value.revoked&&!durable.enabled(),"A tombstoned before accepting B");
    ok(durable.grant(record("B","epoch-b","stay-b",3000,9000,"scheduled")),"B can confirm its own job");
    stable.fail=true;ok(!durable.revokeCurrent(),"disk failure is not successful revocation");
    ok(!durable.enabled(),"uncertain revoke quarantines live durable authority");
    ok(!new StayAlarmDurableAuthority(stable,clock).enabled(),"other receiver instance shares uncertainty fence");
    ok(!new StayAlarmCompositeOwner(new Owner(true,"B","epoch-b"),durable).enabled(),"uncertain persistence also blocks online delivery");
    stable.fail=false;ok(durable.revokeCurrent(),"explicit retry confirms tombstone after disk recovers");
    ok(!StayAlarmDurableAuthority.deliveryBlocked()&&!durable.enabled(),"confirmed tombstone clears uncertainty without rearming");
    ok(durable.grant(record("C","epoch-c","stay-c",3000,9000,"scheduled")),"new confirmed C after tombstone");
    ok(!durable.revoke("A","epoch-a"),"stale A cannot revoke C");
    ok("C".equals(durable.activeOwner()),"stale revocation leaves current account intact");
    System.out.println("PASS "+checks+" durable StayAlarm authority checks");
  }
}
