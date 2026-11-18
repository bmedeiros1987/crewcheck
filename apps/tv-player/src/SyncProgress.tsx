import React from 'react';
import { CheckCircle2, LoaderCircle, ShieldCheck } from 'lucide-react';
import './sync-progress.css';

export type SyncStage = 'authorized'|'validating'|'roster'|'dashboard';
const order:SyncStage[]=['authorized','validating','roster','dashboard'];
const labels:Record<SyncStage,string>={
  authorized:'TV autorizada',
  validating:'Validando vínculo seguro',
  roster:'Sincronizando sua escala',
  dashboard:'Preparando seu painel',
};
const progress:Record<SyncStage,number>={authorized:22,validating:44,roster:76,dashboard:96};

export function SyncProgress({stage}:{stage:SyncStage}) {
  const current=order.indexOf(stage);
  return <section className="sync-progress view-enter" aria-live="polite">
    <div className="sync-card">
      <div className="sync-orbit" aria-hidden="true"><span/><i/></div>
      <p className="eyebrow"><ShieldCheck/> CONEXÃO PROTEGIDA</p>
      <h1>Preparando seu CrewCheck.</h1>
      <p className="sync-lead">Sua TV já foi autorizada. Estamos organizando somente as informações necessárias para esta tela.</p>
      <div className="sync-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress[stage]}><i style={{width:progress[stage]+'%'}}/></div>
      <div className="sync-percent">{progress[stage]}%</div>
      <ol>{order.map((item,index)=><li key={item} data-state={index<current?'done':index===current?'active':'waiting'}>
        {index<current?<CheckCircle2/>:<LoaderCircle/>}<span>{labels[item]}</span>
      </li>)}</ol>
      <small>Não feche o aplicativo. Se a conexão oscilar, o CrewCheck tentará novamente sem perder sua autorização.</small>
    </div>
  </section>;
}
