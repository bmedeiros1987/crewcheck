package com.crewcheck.app;

/** Durable local authority exists only for already-confirmed scheduled stays.
 * It contains no bearer/token and expires at the latest confirmed APZ. */
public final class StayAlarmDurableAuthority implements StayAlarmEngine.Owner {
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
        try {Snapshot value=store.read();if(value==null||value.revoked||value.owner==null||value.owner.trim().isEmpty()
            ||value.epoch==null||value.epoch.trim().isEmpty()||value.expiresAt<=clock.now())return null;return value;}
        catch(Exception error){return null;}
    }
    public synchronized boolean grant(StayAlarmEngine.Record r){
        if(r==null||!"scheduled".equals(r.state)||r.owner==null||r.owner.trim().isEmpty()||r.ownerEpoch==null||r.ownerEpoch.trim().isEmpty()
            ||r.apz<=clock.now())return false;
        try{
            Snapshot old=store.read();long generation=old==null?1:old.generation+1;
            long expiresAt=r.apz;
            if(old!=null&&!old.revoked&&r.owner.equals(old.owner)&&r.ownerEpoch.equals(old.epoch)&&old.expiresAt>clock.now())
                expiresAt=Math.max(old.expiresAt,r.apz);
            return store.write(new Snapshot(r.owner,r.ownerEpoch,expiresAt,generation,false));
        }catch(Exception error){return false;}
    }
    public synchronized boolean revoke(String owner,String epoch){
        try{
            Snapshot old=store.read();long generation=old==null?1:old.generation+1;
            if(old==null||old.revoked)return true;
            if(owner==null||epoch==null||!owner.equals(old.owner)||!epoch.equals(old.epoch))return false;
            return store.write(new Snapshot(null,null,0,generation,true));
        }catch(Exception error){return false;}
    }
    @Override public synchronized boolean enabled(){return current()!=null;}
    @Override public synchronized String activeOwner(){Snapshot value=current();return value==null?null:value.owner;}
    @Override public synchronized String epoch(){Snapshot value=current();return value==null?null:value.epoch;}
}
