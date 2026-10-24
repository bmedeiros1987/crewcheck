package com.crewcheck.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.graphics.Color;
import android.text.InputType;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.FrameLayout;
import android.widget.ScrollView;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.UUID;

/** Native manual fixture, never a production authentication shortcut. Enabled
 * only by the dedicated CI asset AND exact debuggable test package. No network,
 * login, real roster, credential, permission request or automatic new alarm. */
public final class StayAlarmPhysicalFixture {
    static final String MARKER="crewcheck-stay-synthetic-v1";
    static final String ASSET="crewcheck-stay-synthetic.txt";
    static final String ACCOUNT_A="synthetic-offline-account-a",ACCOUNT_B="synthetic-offline-account-b";
    static final String EVENT="synthetic-offline-event";
    private StayAlarmPhysicalFixture(){}
    static boolean enabled(Context context){
        if(!StayAlarmHostAndroid.testHostEnabled(context))return false;
        try(java.io.InputStream input=context.getAssets().open(ASSET)){
            byte[] bytes=new byte[64];int length=input.read(bytes);
            return length>0&&MARKER.equals(new String(bytes,0,length,StandardCharsets.UTF_8))&&input.read()==-1;
        }catch(Exception absent){return false;}
    }
    static String journalName(Context context){return enabled(context)?"crewcheck_synthetic_stay_journal_v1":"crewcheck_stay_alarm_journal_v1";}
    static String authorityName(Context context){return enabled(context)?"crewcheck_synthetic_stay_authority_v1":"crewcheck_stay_alarm_durable_authority_v1";}
    static void show(Activity activity){if(enabled(activity))new Panel(activity).show();}
    static final class Panel {
        final Activity activity;final StayAlarmAndroid driver;final StayAlarmDurableAuthority durable;
        final StayAlarmSessionHost session;final StayAlarmEngine engine;
        String account;TextView status;EditText minutes;String result="Nenhum teste programado.";
        Panel(Activity activity){
            this.activity=activity;driver=new StayAlarmAndroid(activity);durable=StayAlarmDurableAuthorityAndroid.open(activity);
            session=new StayAlarmSessionHost(true,android.os.SystemClock::elapsedRealtime,(owner,epoch,expiry)->{});
            engine=new StayAlarmEngine(driver,driver,new StayAlarmCompositeOwner(session,durable));
            String saved=durable.activeOwner();if(ACCOUNT_A.equals(saved)||ACCOUNT_B.equals(saved))account=saved;
        }
        void show(){
            LinearLayout box=new LinearLayout(activity);box.setOrientation(LinearLayout.VERTICAL);box.setPadding(28,32,28,20);box.setBackgroundColor(Color.rgb(7,29,51));
            TextView title=new TextView(activity);title.setText("CrewCheck • teste local offline");title.setTextSize(22);title.setTextColor(Color.WHITE);box.addView(title);
            TextView info=new TextView(activity);info.setText("App separado .mcctest. Apenas contas A/B e evento fictícios. Sem login, escala real ou push remoto. Nenhuma permissão será solicitada por este painel.");info.setTextColor(Color.WHITE);box.addView(info);
            status=new TextView(activity);status.setTextColor(Color.WHITE);box.addView(status);
            minutes=new EditText(activity);minutes.setInputType(InputType.TYPE_CLASS_NUMBER);minutes.setText("7");minutes.setHint("Minutos até o alerta: 1 a 30");minutes.setTextColor(Color.WHITE);box.addView(minutes);
            button(box,"Selecionar conta fictícia A",()->select(ACCOUNT_A));
            button(box,"Selecionar conta fictícia B",()->select(ACCOUNT_B));
            button(box,"Programar / editar teste",this::confirmSchedule);
            button(box,"Cancelar teste",this::cancel);
            button(box,"Sair da conta fictícia",this::logout);
            button(box,"Suspender sessão / consultar estado",()->{session.revoke();result="Sessão suspensa; somente o alarme já confirmado pode continuar.";render();});
            ScrollView scroll=new ScrollView(activity);scroll.addView(box);activity.addContentView(scroll,new FrameLayout.LayoutParams(-1,-1));render();
        }
        void button(LinearLayout box,String label,Runnable action){Button button=new Button(activity);button.setText(label);button.setOnClickListener(v->{try{action.run();}catch(Exception error){result="Operação não confirmada. Não considere o alarme programado/cancelado.";render();}});box.addView(button);}
        boolean bind(String owner){return StayAlarmHostAndroid.acceptVerified(session,durable,session.begin(),owner,android.os.SystemClock.elapsedRealtime()+300000);}
        void select(String owner){
            if(!bind(owner)){result="Conta fictícia não confirmada; persistência precisa de reconciliação.";render();return;}
            account=owner;try{engine.recover(false);result="Conta fictícia selecionada. Nenhum novo alarme foi criado.";}catch(Exception failure){result="Recovery não confirmado.";}render();
        }
        String key(){return StayAlarmEngine.identity(account,EVENT);}
        void confirmSchedule(){
            if(account==null){result="Selecione A ou B antes do teste.";render();return;}
            int delay;try{delay=Integer.parseInt(minutes.getText().toString());}catch(Exception invalid){delay=0;}
            if(delay<1||delay>30){result="Use de 1 a 30 minutos.";render();return;}
            final long alarm=System.currentTimeMillis()+delay*60000L,apz=alarm+15*60000L;
            new AlertDialog.Builder(activity).setTitle("Confirmar alarme fictício")
                .setMessage("Alerta: "+Instant.ofEpochMilli(alarm)+"\nAPZ fictícia: "+Instant.ofEpochMilli(apz)+"\nSó o journal local de teste será alterado. Não é push remoto.")
                .setNegativeButton("Voltar",null).setPositiveButton("Confirmar teste",(dialog,which)->schedule(alarm,apz)).show();
        }
        void schedule(long alarm,long apz){
            try{
                if(account==null||!bind(account)){result="Autoridade fictícia não confirmada.";render();return;}
                StayAlarmEngine.Record prior=driver.read(key());long revision=prior==null?0:prior.revision;
                StayAlarmEngine.Record request=new StayAlarmEngine.Record(key(),account,session.epoch(),EVENT,UUID.randomUUID().toString(),revision+1,
                    Instant.ofEpochMilli(alarm).toString(),alarm,apz,"absolute","pending-schedule");
                StayAlarmEngine.Result receipt=engine.replace(request,revision,true,true);
                result="Estado: "+receipt.state+". "+receipt.reason+". API+journal não comprovam entrega no aparelho.";
            }catch(Exception error){result="Programação não confirmada.";}render();
        }
        void cancel(){
            try{if(account==null||!bind(account)){result="Cancelamento não confirmado.";render();return;}
                StayAlarmEngine.Record record=driver.read(key());if(record==null){result="Nenhum evento fictício salvo para esta conta.";render();return;}
                org.json.JSONObject request=new org.json.JSONObject().put("protocol",StayAlarmBridge.PROTOCOL).put("key",key()).put("accountId",account)
                    .put("ownerEpoch",session.epoch()).put("eventId",EVENT).put("operationId",UUID.randomUUID().toString()).put("action","cancel").put("expectedRevision",record.revision);
                result=StayAlarmHostAndroid.transactOrRevoke(new StayAlarmBridge(engine,session),session,durable,request.toString());
            }catch(Exception error){result="Cancelamento não confirmado.";}render();
        }
        void logout(){
            String epoch=session.epoch();if(epoch==null)epoch=durable.epoch();
            boolean revoked=StayAlarmHostAndroid.revokeLocal(session,durable,account,epoch);
            if(revoked){account=null;try{engine.recover(false);}catch(Exception ignored){}result="Conta fictícia revogada. Nenhuma entrega antiga é autorizada.";}
            else result="Revogação não confirmada; não considere limpeza persistida.";render();
        }
        void render(){
            if(status==null)return;
            String detail="";try{if(account!=null){StayAlarmEngine.Record record=driver.read(key());if(record!=null)detail="\nEvento fictício: "+record.state+" • "+record.alarmAt;}}catch(Exception ignored){detail="\nJournal não pôde ser lido.";}
            status.setText("\nConta: "+(ACCOUNT_A.equals(account)?"A":ACCOUNT_B.equals(account)?"B":"nenhuma")+"\nPermissões já concedidas: "+(driver.permitted()?"disponíveis":"insuficientes; não programado")+detail+"\n"+result+"\n");
        }
    }
}
