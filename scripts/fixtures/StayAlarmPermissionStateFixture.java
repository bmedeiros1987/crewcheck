package com.crewcheck.app;

/** All capability combinations, synthetic values only; no Android/device calls. */
public final class StayAlarmPermissionStateFixture {
    public static void main(String[] args){
        int checked=0;
        for(int a=-1;a<=1;a++)for(int b=-1;b<=1;b++)for(int c=-1;c<=1;c++)
        for(int d=-1;d<=1;d++)for(int e=-1;e<=1;e++)for(int f=-1;f<=1;f++){
            StayAlarmPermissionState state=new StayAlarmPermissionState(a,b,c,d,e,f);
            if(state.ready()!=(a==1&&b==1&&c==1&&d==1&&e==1&&f==1))throw new AssertionError("unknown/missing capability admitted");
            checked++;
        }
        StayAlarmPermissionState missing=new StayAlarmPermissionState(1,1,0,0,0,1);
        String text=missing.describe(true,true);
        for(String label:new String[]{"Notificações deste app: indisponível","Permissão de notificações (Android 13+): indisponível",
            "Alarmes e lembretes exatos (Android 12+): indisponível","Canal Teste local CrewCheck: disponível"})
            if(!text.contains(label))throw new AssertionError(label);
        String unknown=new StayAlarmPermissionState(-1,-1,-1,-1,-1,-1).describe(true,true);
        if(!unknown.contains("não verificado")||unknown.contains("disponível"))throw new AssertionError("unknown mislabeled");
        String legacy=new StayAlarmPermissionState(1,1,1,1,1,1).describe(false,false);
        if(!legacy.contains("não exigida nesta versão")||!legacy.contains("não exigidos nesta versão"))throw new AssertionError("older API mislabeled");
        System.out.println("PASS "+checked+" capability combinations plus explicit notification/exact-alarm/channel/unknown diagnostics; synthetic only");
    }
}
