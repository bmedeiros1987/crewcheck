package com.crewcheck.app;

/** Durable local authority exists only for already-confirmed scheduled stays.
 * It contains no bearer/token and expires at the latest confirmed APZ. */
public final class StayAlarmDurableAuthority implements StayAlarmEngine.Owner {
    // All receiver/host instances share this process fence when persistence is
    // uncertain. No successful revoke receipt is issued until a tombstone is read back.
    private static volatile boolean persistenceUncertain;
    public static boolean deliveryBlocked(){return persistenceUncertain;}
    public static void blockUncertain(){persistenceUncertain=true;}
    public interface Clock { long now(); }
    public interface Store { Snapshot read(); boolean write(Snapshot value); }
    public static final class Snapshot {
        public final String owner,epoch; public final long expiresAt,generation; public final boolean revoked;
        public Snapshot(String owner,String epoch,long expiresAt,long generation,boolean revoked){
            this.owner=owner;this.epoch=epoch;this.expiresAt=expiresAt;this.generation=generation;this.revoked=revoked;
        }
    }
    private final Store store; private final Clock clock;
    public StayAlarmDurableAuthority(Store store,Clock clock){this.store=store;this.clock=clock;}
    private Snapshot current(){
        try {Snapshot value=store.read();if(persistenceUncertain||value==null||value.revoked||value.owner==null||value.owner.trim().isEmpty()
            ||value.epoch==null||value.epoch.trim().isEmpty()||value.expiresAt<=clock.now())return null;return value;}
        catch(Exception error){return null;}
    }
    public synchronized boolean grant(StayAlarmEngine.Record r){
        if(persistenceUncertain||r==null||!"scheduled".equals(r.state)||r.owner==null||r.owner.trim().isEmpty()||r.ownerEpoch==null||r.ownerEpoch.trim().isEmpty()
            ||r.apz<=clock.now())return false;
        try{
            Snapshot old=store.read();long generation=old==null?1:old.generation+1;
            long expiresAt=r.apz;
            if(old!=null&&!old.revoked&&r.owner.equals(old.owner)&&r.ownerEpoch.equals(old.epoch)&&old.expiresAt>clock.now())
                expiresAt=Math.max(old.expiresAt,r.apz);
            Snapshot next=new Snapshot(r.owner,r.ownerEpoch,expiresAt,generation,false);
            if(!store.write(next)||!same(next,store.read())){persistenceUncertain=true;return false;}
            return true;
        }catch(Exception error){persistenceUncertain=true;return false;}
    }
    private static boolean same(Snapshot a,Snapshot b){return b!=null&&java.util.Objects.equals(a.owner,b.owner)
        &&java.util.Objects.equals(a.epoch,b.epoch)&&a.expiresAt==b.expiresAt&&a.generation==b.generation&&a.revoked==b.revoked;}
    /** Trusted verified identity only; call within the engine owner boundary.
     * Same-account reauth preserves the local event epoch. A different verified
     * account must first durably tombstone the old authority. */
    public synchronized String epochForVerifiedOwner(String owner,String newEpoch){
        if(owner==null||owner.trim().isEmpty()||newEpoch==null||newEpoch.trim().isEmpty()||persistenceUncertain)return null;
        Snapshot active=current();if(active!=null&&owner.equals(active.owner))return active.epoch;
        try{Snapshot old=store.read();if(old!=null&&!old.revoked&&!owner.equals(old.owner)&&!revoke(old.owner,old.epoch))return null;}
        catch(Exception error){persistenceUncertain=true;return null;}
        return newEpoch;
    }
    public synchronized boolean matches(String owner,String epoch){
        try{Snapshot old=store.read();return old!=null&&!old.revoked&&owner!=null&&epoch!=null&&owner.equals(old.owner)&&epoch.equals(old.epoch);}
        catch(Exception error){return false;}
    }
    /** Host-owned local scope, including after the short online lease expires. */
    public synchronized boolean revokeCurrent(){
        try{Snapshot old=store.read();if(old==null||old.revoked){persistenceUncertain=false;return true;}return revoke(old.owner,old.epoch);}
        catch(Exception error){persistenceUncertain=true;return false;}
    }
    public synchronized boolean revoke(String owner,String epoch){
        try{
            Snapshot old=store.read();long generation=old==null?1:old.generation+1;
            if(old==null||old.revoked){persistenceUncertain=false;return true;}
            if(owner==null||epoch==null||!owner.equals(old.owner)||!epoch.equals(old.epoch))return false;
            persistenceUncertain=true;
            Snapshot next=new Snapshot(null,null,0,generation,true);
            if(!store.write(next)||!same(next,store.read()))return false;
            persistenceUncertain=false;return true;
        }catch(Exception error){persistenceUncertain=true;return false;}
    }
    @Override public synchronized boolean enabled(){return current()!=null;}
    @Override public synchronized String activeOwner(){Snapshot value=current();return value==null?null:value.owner;}
    @Override public synchronized String epoch(){Snapshot value=current();return value==null?null:value.epoch;}
}
