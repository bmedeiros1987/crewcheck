import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, LayoutDashboard, Pin } from 'lucide-react';
import { HomeLayoutShell, type HomeLayoutSlot } from './HomeLayoutShell';
import { getStoredUser } from '@/lib/authClient';
import { MENU_FAVORITES_LIMIT, readMenuFavorites, saveMenuFavorites } from '@/lib/menuPreference';
import { resetMenuUsage } from '@/lib/menuUsagePreference';
import './menu-personalization.css';
const slots: HomeLayoutSlot[] = [
 {id:'summary',label:'Resumo operacional',description:'Alertas da escala',content:null},
 {id:'finance',label:'Atalhos financeiros',description:'Diárias e salário',content:null},
 {id:'next',label:'Próxima programação',description:'Programação da escala',content:null},
 {id:'limits',label:'Alertas e limites',description:'Limites operacionais',content:null},
 {id:'smart',label:'Ações contextuais',description:'Recursos do próximo evento',content:null},
];
export function MenuPersonalization({ catalog, onChange }: {catalog: Array<{id:string;label:string}>;onChange:()=>void}) {
 const owner=getStoredUser()?.id || null;
 const allowed=catalog.map(item=>item.id);
 const [fixed,setFixed]=useState(()=>readMenuFavorites(localStorage,owner,allowed));
 const [status,setStatus]=useState('');
 useEffect(()=>{ const refresh=()=>setFixed(readMenuFavorites(localStorage,owner,allowed)); refresh();setStatus('');window.addEventListener('crewcheck:menu-favorites',refresh);window.addEventListener('storage',refresh);return()=>{window.removeEventListener('crewcheck:menu-favorites',refresh);window.removeEventListener('storage',refresh)};},[owner,allowed.join('|')]);
 function save(next:string[]) {
  if(!saveMenuFavorites(localStorage,owner,allowed,next)){setStatus('Não foi possível salvar os atalhos desta conta.');return;}
  setFixed(next);onChange();window.dispatchEvent(new Event('crewcheck:personalization'));setStatus('Atalhos salvos nesta conta e neste dispositivo.');
 }
 function move(index:number,delta:number){const next=readMenuFavorites(localStorage,owner,allowed),target=index+delta;if(target<0||target>=next.length)return;[next[index],next[target]]=[next[target],next[index]];save(next);}
 return <details className="cc-menu-personalization" id="cc-menu-personalization">
  <summary><LayoutDashboard aria-hidden="true"/> Personalizar início e atalhos</summary>
  <HomeLayoutShell slots={slots} editorOnly/>
  <h3><Pin aria-hidden="true"/> Atalhos fixados</h3><p>Os fixados aparecem primeiro na Home e no Menu. Os espaços restantes mostram funções mais usadas neste dispositivo, somente nesta conta.</p>
  <div className="cc-fixed-order">{fixed.map((id,index)=><div key={id}><strong>{catalog.find(item=>item.id===id)?.label || id}</strong><button type="button" aria-label={`Mover ${catalog.find(item=>item.id===id)?.label || id} para cima`} disabled={index===0} onClick={()=>move(index,-1)}><ArrowUp/></button><button type="button" aria-label={`Mover ${catalog.find(item=>item.id===id)?.label || id} para baixo`} disabled={index===fixed.length-1} onClick={()=>move(index,1)}><ArrowDown/></button></div>)}</div>
  <details><summary>Escolher até {MENU_FAVORITES_LIMIT} atalhos fixados</summary><div className="cc-fixed-catalog">{catalog.map(item=><label key={item.id}><input type="checkbox" checked={fixed.includes(item.id)} disabled={!fixed.includes(item.id)&&fixed.length>=MENU_FAVORITES_LIMIT} onChange={()=>{const latest=readMenuFavorites(localStorage,owner,allowed);save(latest.includes(item.id)?latest.filter(id=>id!==item.id):[...latest,item.id]);}}/>{item.label}</label>)}</div></details>
  <button type="button" onClick={()=>{if(resetMenuUsage(localStorage,owner)){onChange();setStatus('Sugestões por uso reiniciadas. Seus fixados foram preservados.');}else setStatus('Não foi possível reiniciar as sugestões.');}}>Reiniciar sugestões por uso</button>
  <p role="status">{status}</p>
 </details>;
}
