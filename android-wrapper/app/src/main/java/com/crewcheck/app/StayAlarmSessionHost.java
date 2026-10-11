package com.crewcheck.app;

/** Session authority state machine. Network verification happens outside the
 * engine lock; only a generation-matched verified result may issue a lease. */
public final class StayAlarmSessionHost implements StayAlarmEngine.Owner {
    public interface Clock { long now(); }
    public interface LeaseStore { void write(String account,String epoch,long expiresAt); }
    private final Clock clock; private final LeaseStore store; private final boolean enabled;
    private volatile long generation=0,expires=0; private volatile String account=null,epoch=null;
    public StayAlarmSessionHost(boolean enabled,Clock clock,LeaseStore store){this.enabled=enabled;this.clock=clock;this.store=store;}
    public boolean enabled(){return enabled;}
    public String activeOwner(){return enabled&&clock.now()<expires?account:null;}
    public String epoch(){return activeOwner()==null?null:epoch;}
    public long begin(){final long[] result={0};StayAlarmEngine.updateTrustedOwner(()->{
        generation++;account=null;epoch=null;expires=0;store.write(null,null,0);result[0]=generation;
    });return result[0];}
    public void revoke(){begin();}
    public boolean verified(long requestGeneration,String verifiedId,String newEpoch,long expiry){final boolean[] accepted={false};
        StayAlarmEngine.updateTrustedOwner(()->{
            if(!enabled||requestGeneration!=generation||verifiedId==null||verifiedId.trim().isEmpty()||newEpoch==null||newEpoch.isEmpty()
                ||expiry<=clock.now()||expiry-clock.now()>300_000)return;
            store.write(verifiedId,newEpoch,expiry);account=verifiedId;epoch=newEpoch;expires=expiry;accepted[0]=true;
        });return accepted[0];}
    public boolean current(long value){return enabled&&value==generation&&activeOwner()!=null;}
    public long generation(){return generation;}
}
