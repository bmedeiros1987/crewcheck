import assert from 'node:assert/strict';
import fs from 'node:fs';

const roadmap = fs.readFileSync('docs/ROADMAP_CURRENT.md', 'utf8');
const contract = fs.readFileSync('docs/V14_3_88_VISUAL_STANDARDIZATION_ROADMAP.md', 'utf8');

assert.match(roadmap, /sistema visual unificado v14\.3\.88–v14\.3\.90/, 'roadmap deve registrar o lote visual atual');
assert.match(roadmap, /nenhuma mudança visual pode alterar parser, fingerprint, escala ativa/, 'motor canônico deve permanecer protegido');
assert.match(contract, /cabeçalho CrewCheck global fixo/, 'cabeçalho global deve fazer parte do contrato');
assert.match(contract, /hover pode alterar cor, borda, sombra ou elevação, mas não posição ou tamanho/, 'hover não pode deslocar controles');
assert.match(contract, /Usuário primeiro/, 'prioridade do usuário deve orientar a hierarquia');
assert.match(contract, /Cronologia primeiro/, 'cronologia deve orientar as superfícies operacionais');
assert.match(contract, /prefers-reduced-motion/, 'movimento reduzido deve ser obrigatório');
assert.match(contract, /360, 390\/412, tablet e desktop/, 'matriz responsiva deve estar explícita');

console.log('[v14.3.88] OK — padronização visual registrada como gate formal do roadmap.');
