
import React from 'react';import{createRoot}from'react-dom/client';
import{EscalaContactButton,EscalaContactAdmin}from'../../client/src/components/EscalaContact';
import{defaultEscalaContact}from'../../shared/escala-contact.mjs';
const state=window.fixture={contact:defaultEscalaContact(),requests:[],held:[],mode:'ok',hold:'',puts:0,forwarded:[],admin:true};
window.session=(owner='synthetic-A',token=owner)=>{window.dispatchEvent(new Event('crewcheck:auth-will-change'));localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:owner,email:owner+'@example.invalid'}));localStorage.setItem('crewcheck_auth_token',token);window.dispatchEvent(new Event('crewcheck:auth-changed'))};
window.fetch=async(url,init={})=>{
 if(!String(url).startsWith('/api/')||!String(url).endsWith('/escala-contact'))throw Error('Unexpected network');
 const method=init.method||'GET',admin=String(url).includes('/admin/'),mode=state.mode;
 state.requests.push({url,method,token:init.headers?.authorization});
 let status=200,payload={ok:true,contact:structuredClone(state.contact)};
 if(admin&&!state.admin){status=403;payload={ok:false,code:'CONTACT_FORBIDDEN'}}
 else if(method==='PUT'){
  state.puts++;const body=JSON.parse(init.body);if(body.expectedRevision!==state.contact.revision){status=409;payload={ok:false,code:'CONTACT_CONFLICT'}}
  else if(mode==='bad-ack'){payload={ok:true,contact:{...state.contact,dialString:body.dialString}}}
  else if(mode!=='write-error'){state.contact={...state.contact,dialString:body.dialString,revision:state.contact.revision+1,updatedAt:'2032-01-02T03:04:05.000Z'};payload={ok:true,contact:structuredClone(state.contact)}}
  if(mode==='write-error'||mode==='unknown-commit'){status=503;payload={ok:false,code:'CONTACT_UNAVAILABLE'}}
 }
 else if(mode==='bad-record')payload={ok:true,contact:{...state.contact,dialString:'tel:123#'}};
 else if(mode==='read-error'){status=503;payload={ok:false,code:'CONTACT_UNAVAILABLE'}}
 if(state.hold===method||(state.hold==='ADMIN'&&admin)){await new Promise(resolve=>state.held.push(resolve))}
 return {ok:status===200,status,json:async()=>payload};
};
window.release=()=>{state.hold='';state.held.splice(0).forEach(resolve=>resolve())};
window.focusFixture=()=>window.dispatchEvent(new Event('focus'));
window.session();const root=createRoot(document.getElementById('root'));
window.renderFixture=(admin=true)=>root.render(<><h1>Contato de teste</h1><EscalaContactButton/>{admin&&<EscalaContactAdmin/>}</>);window.renderFixture();
// Observe the native handoff boundary without opening a dialer or making a call.
document.addEventListener('click',event=>{const link=event.target.closest?.('a[href^="tel:"]');if(link){if(!event.defaultPrevented)state.forwarded.push(link.getAttribute('href'));event.preventDefault()}});
