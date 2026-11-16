import fs from 'node:fs';import spans from './source-spans.mjs';
const file='client/src/pages/Home.tsx';let source=fs.readFileSync(file,'utf8');
const header="import {clearKnownDeletedAccountStores} from '@shared/accountDeletionLocal.mjs';\nimport {clearSession as clearDeletedAccountSession} from '@/lib/authClient';";
if(!source.includes(header))source=header+'\n'+source;
const node=spans.createSourceFile(file,source).statements.find(n=>n.name?.text==='deleteAccount');if(!node)throw Error('[telegram-binding] account deletion UI missing');
const body=`async function deleteAccount() {
    if (!confirm('Excluir permanentemente sua conta, escalas, visitantes, hotéis, chat e histórico? Esta ação não pode ser desfeita.')) return;
    const confirmation = prompt('Para confirmar, digite EXCLUIR') || '';
    if (confirmation.trim().toUpperCase() !== 'EXCLUIR') { toast.message('Exclusão cancelada.'); return; }
    const deletionSession=captureAuthSession(),deletionOwner=getStoredUser()?.id;
    try {
      const result=await deleteCrewCheckAccount(confirmation);
      if(!deletionSession.isCurrent())return;
      if(result?.ok!==true||result?.deleted!==true)throw Error('ACCOUNT_DELETION_UNCONFIRMED');
      const localCleanup=clearKnownDeletedAccountStores({ownerId:deletionOwner,local:localStorage,session:sessionStorage,isCurrent:deletionSession.isCurrent});
      if(!deletionSession.isCurrent())return;
      if(result.manageGooglePlayUrl && confirm('A assinatura Google Play deve ser cancelada separadamente. Abrir a Play Store?'))window.open('https://play.google.com/store/account/subscriptions','_blank','noopener,noreferrer');
      if(!deletionSession.isCurrent())return;
      clearDeletedAccountSession();
      if(!localCleanup.ok)toast.error('Conta removida. A limpeza local ficou pendente neste aparelho.');
      window.location.assign('/login');
    } catch {
      if(deletionSession.isCurrent())toast.error('Não foi possível confirmar a exclusão. Fale com o suporte antes de repetir.');
    }
  }`;
source=source.slice(0,node.getStart())+body+source.slice(node.end);fs.writeFileSync(file,source);
