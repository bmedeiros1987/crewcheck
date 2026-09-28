import fs from 'node:fs';

const VERSION = '14.3.86';
const file = 'client/src/pages/Home.tsx';

if (!fs.existsSync(file)) throw new Error('[v14386] Home.tsx ausente.');
let source = fs.readFileSync(file, 'utf8');

const anchor = '      <h2>Ganhos variáveis por voo</h2>';
const notice = `      <h2>Ganhos variáveis por voo</h2>\n      <div className="finance-learning-notice warning" data-km-source="operational-estimate">\n        <ShieldCheck size={17}/><span>KM exibido nesta previsão é uma estimativa operacional pela distância entre aeroportos. A quilometragem remunerável da folha pode usar a tabela corporativa por trecho; confirme o extrato/AIMS até essa fonte estar vinculada ao CrewCheck.</span>\n      </div>`;

if (!source.includes('data-km-source="operational-estimate"')) {
  if (!source.includes(anchor)) throw new Error('[v14386] âncora de ganhos variáveis não encontrada.');
  source = source.replace(anchor, notice);
}

if (!source.includes('data-km-source="operational-estimate"')) throw new Error('[v14386] aviso de fonte de KM não aplicado.');
fs.writeFileSync(file, source, 'utf8');
console.log(`[v14386] CrewCheck ${VERSION}: distância geográfica não é mais apresentada sem aviso como KM exato de folha.`);
