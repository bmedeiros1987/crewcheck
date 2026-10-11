import './wakeup-selection.css';
import {useEffect,useState} from 'react';
import {phonePreferenceDisplay} from '../../../../shared/wakeupChannelSelection.mjs';
export function WakeupPhonePreference({value,onChange,ownerId}:{value:string|undefined;ownerId?:string;onChange:(value:string)=>void}){
 const[editing,setEditing]=useState(false);useEffect(()=>setEditing(false),[ownerId]);
 return <details id="cc-notification-phone" className="cc-notification-phone"><summary>Ligação · número e disponibilidade</summary><p>{value===undefined?'Número desta conta ainda não consultado.':phonePreferenceDisplay(value)}</p><p>Este número é uma preferência da conta, não um telefone verificado. Guardar o número não confirma que ele pertence à conta. Ligação telefônica ainda depende de verificação e disponibilidade/autorização do servidor. Ligação via Telegram usa o usuário vinculado ao bot.</p>
 <button type="button" onClick={()=>setEditing(current=>!current)}>{editing?'Ocultar número':'Informar ou revisar número'}</button>{editing&&<label>Número para ligação telefônica, com DDI<input type="tel" inputMode="tel" autoComplete="off" maxLength={60} value={value||''} onChange={event=>onChange(event.target.value.replace(/[^+\d\s().-]/g,''))} aria-describedby="cc-phone-preference-help"/></label>}
 <p id="cc-phone-preference-help">O número fica oculto até você escolher revisar. Use “Salvar preferências” ao final. Salvar não verifica o número, habilita chamadas, envia código ou realiza ligação.</p></details>;
}
