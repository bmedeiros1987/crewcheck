import fs from 'node:fs';

const homePath = 'client/src/pages/Home.tsx';
if (!fs.existsSync(homePath)) throw new Error('[v14340-consent] Home.tsx ausente.');

const source = fs.readFileSync(homePath, 'utf8');
const protectedBlock = `      const decision = confirmRosterImport(roster, file.name);
      let auditImport = false;
      const detectedDays = Array.isArray(roster.days) ? roster.days.length : 0;
      if (!detectedDays) {
        toast.error('Nenhuma data de escala foi reconhecida. A importação não substituirá sua escala ativa; tente novamente para acionar a leitura visual alternativa.');
        return;
      }
      if (!decision.ok) {
        const overrideImport = window.confirm(
          \`${'${decision.toastText || "A auditoria encontrou divergências."}'}\n\nA escala será importada mesmo assim somente com sua confirmação. Deseja continuar?\`,
        );
        if (!overrideImport) {
          toast.message('Importação cancelada. Sua escala ativa foi preservada.');
          return;
        }
        toast.warning('Importação liberada por confirmação explícita. Confira o período e os voos após abrir.');
      }
`;

if (source.includes(protectedBlock)) {
  console.log('[v14340-consent] Consentimento explícito já aplicado.');
} else {
  const permissiveBlock = `      const decision = confirmRosterImport(roster, file.name);
      let auditImport = false;
      if (!decision.ok) {
        toast.warning(\`${'${decision.toastText || "A auditoria encontrou divergências."}'} A escala será importada mesmo assim; confira os dados após abrir.\`);
      }
`;
  if (!source.includes(permissiveBlock)) throw new Error('[v14340-consent] Bloco permissivo não localizado com segurança.');
  fs.writeFileSync(homePath, source.replace(permissiveBlock, protectedBlock), 'utf8');
  console.log('[v14340-consent] Importação sem restrição de qualidade, com proteção para escala vazia e cancelamento explícito.');
}
