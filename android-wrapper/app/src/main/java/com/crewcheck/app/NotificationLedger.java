package com.crewcheck.app;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/** Cancellation fence only. A client account hint never authenticates an owner or authorizes reboot restoration. */
public final class NotificationLedger {
    static final Object LOCK = new Object();
    private static boolean uncertain;
    public interface Store {
        String scope(); String epoch(); Map<String,Long> entries();
        void commit(String scope,String epoch,Map<String,Long> entries) throws Exception;
    }
    public interface Device { long now(); void cancel(String key) throws Exception; void dismiss() throws Exception; }
    public interface Arm { void run(String epoch) throws Exception; }
    private final Store store; private final Device device;
    public NotificationLedger(Store store,Device device){this.store=store;this.device=device;}
    public boolean scope(String hint) {
        synchronized(LOCK) {
            try {
                String next=hint==null||hint.isEmpty()?"":NotificationIdentity.key("scope",hint,0);
                if(!uncertain&&next.equals(store.scope())&&!store.epoch().isEmpty())return true;
                Map<String,Long> previous=store.entries();
                uncertain=true;
                // Invalidate first: even failed OS cancellation cannot make an old intent eligible.
                store.commit(next,UUID.randomUUID().toString(),new HashMap<>());
                boolean cancelled=true;
                for(String key:previous.keySet())try{device.cancel(key);}catch(Exception error){cancelled=false;}
                try{device.dismiss();}catch(Exception error){cancelled=false;}
                uncertain=!cancelled;
                return cancelled;
            }catch(Exception error){
                uncertain=true;
                // Best effort even if persistence failed; never acknowledge an uncertain fence.
                try { for(String key:store.entries().keySet())device.cancel(key); device.dismiss(); } catch(Exception ignored) {}
                return false;
            }
        }
    }
    public boolean schedule(String key,long at,Arm arm) {
        synchronized(LOCK) {
            try {
                if(uncertain||store.scope().isEmpty()||store.epoch().isEmpty()||at<=device.now()||at>Long.MAX_VALUE-120_000)return false;
                Map<String,Long> entries=new HashMap<>(store.entries());
                entries.entrySet().removeIf(e->e.getValue()<device.now());
                if(entries.size()>=256&&!entries.containsKey(key))return false;
                String epoch=store.epoch();entries.put(key,at+120_000);
                store.commit(store.scope(),epoch,entries);
                try{arm.run(epoch);return true;}
                catch(Exception error){entries.remove(key);store.commit(store.scope(),epoch,entries);device.cancel(key);return false;}
            }catch(Exception error){uncertain=true;return false;}
        }
    }
    /** Caller holds LOCK through NotificationManager.notify to serialize with cancellation. */
    public boolean claim(String key,String epoch,long at) {
        synchronized(LOCK) {
            try {
                if(uncertain||key==null||epoch==null||store.scope().isEmpty()||!epoch.equals(store.epoch()))return false;
                Map<String,Long> entries=new HashMap<>(store.entries());
                Long until=entries.get(key);long now=device.now();
                if(until==null||until!=at+120_000||!NotificationTiming.shouldAttempt(at,now,true))return false;
                entries.remove(key);store.commit(store.scope(),epoch,entries);return true;
            }catch(Exception error){uncertain=true;return false;}
        }
    }
}
