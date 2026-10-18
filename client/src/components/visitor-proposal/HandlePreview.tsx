import { useState } from 'react';
import { handlePreview } from '../../../../shared/visitor-access-proposal/contract.mjs';
// Unmounted proposal: no directory lookup, identity claim, account creation or availability leak.
export default function HandlePreview() {
 const [value,setValue]=useState(''); const preview=handlePreview(value);
 return <section aria-label="Prévia de nome de usuário"><h2>Seu nome de usuário</h2><label htmlFor="proposed-handle">@usuario</label><input id="proposed-handle" value={value} onChange={e=>setValue(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} aria-describedby="handle-rule handle-status"/><p id="handle-rule">Proposta: 3 a 24 caracteres; comece com uma letra. Use letras sem acento, números e sublinhado. Maiúsculas e minúsculas representam o mesmo nome.</p><p id="handle-status" role="status">{!value?'Escolha como quer ser encontrado.':preview.formatValid?'Formato válido. Disponibilidade ainda não verificada.':'Confira o formato.'}</p>{preview.suggestions.map((handle:string)=><button type="button" key={handle} onClick={()=>setValue(handle)}>Usar @{handle} · não verificado</button>)}<p>Nome de exibição e e-mail de acesso continuam separados. Nenhum cadastro será criado nesta prévia.</p><button type="button" disabled>Salvar indisponível nesta prévia</button></section>;
}
