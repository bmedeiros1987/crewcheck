package com.crewcheck.app;

/** Online authority wins while present; confirmed local authority is fallback
 * only for delivery/recovery after the process or network session disappears. */
public final class StayAlarmCompositeOwner implements StayAlarmEngine.Owner {
    private final StayAlarmEngine.Owner primary,fallback;
    public StayAlarmCompositeOwner(StayAlarmEngine.Owner primary,StayAlarmEngine.Owner fallback){this.primary=primary;this.fallback=fallback;}
    private StayAlarmEngine.Owner selected(){
        if(primary!=null&&primary.enabled()&&primary.activeOwner()!=null&&primary.epoch()!=null)return primary;
        if(fallback!=null&&fallback.enabled()&&fallback.activeOwner()!=null&&fallback.epoch()!=null)return fallback;
        return null;
    }
    @Override public boolean enabled(){return selected()!=null;}
    @Override public String activeOwner(){StayAlarmEngine.Owner value=selected();return value==null?null:value.activeOwner();}
    @Override public String epoch(){StayAlarmEngine.Owner value=selected();return value==null?null:value.epoch();}
}
