package com.crewcheck.app;

/** Read-only capability receipt. Unknown is never permission or delivery proof. */
public final class StayAlarmPermissionState {
    public final int alarmService,notificationService,notifications,postNotifications,exactAlarms,channel;
    public StayAlarmPermissionState(int alarmService,int notificationService,int notifications,int postNotifications,int exactAlarms,int channel){
        this.alarmService=alarmService;this.notificationService=notificationService;this.notifications=notifications;
        this.postNotifications=postNotifications;this.exactAlarms=exactAlarms;this.channel=channel;
    }
    public boolean ready(){return alarmService==1&&notificationService==1&&notifications==1&&postNotifications==1&&exactAlarms==1&&channel==1;}
    static String state(int value){return value==1?"disponível":value==0?"indisponível":"não verificado";}
    public String describe(boolean postRequired,boolean exactRequired){
        return "Serviço de alarmes: "+state(alarmService)+"\nServiço de notificações: "+state(notificationService)
            +"\nNotificações deste app: "+state(notifications)
            +"\nPermissão de notificações (Android 13+): "+(postRequired?state(postNotifications):"não exigida nesta versão")
            +"\nAlarmes e lembretes exatos (Android 12+): "+(exactRequired?state(exactAlarms):"não exigidos nesta versão")
            +"\nCanal Teste local CrewCheck: "+state(channel);
    }
}
