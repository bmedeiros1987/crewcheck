import assert from 'node:assert/strict';
import fs from 'node:fs';

const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const compliance = fs.readFileSync('client/src/lib/complianceEngine.ts', 'utf8');

assert.match(home, /COMPLIANCE_ALERT_DISPOSITIONS_KEY = 'crewcheck_compliance_alert_dispositions_v1'/, 'classificação do usuário deve ser persistida separadamente');
assert.match(home, /reason: 'user_schedule_change'/, 'motivo deve distinguir alteração da programação do usuário');
assert.match(home, /Ignorar — alteração da minha programação/, 'alerta de solo deve oferecer ação explícita');
assert.match(home, /A análise original permanece preservada para auditoria/, 'ação não pode apagar a evidência regulatória');
assert.match(home, /isGroundLimitAlert\(a\) && <button/, 'ignorar não pode ser oferecido indiscriminadamente para todos os alertas');
assert.match(home, /Restaurar alertas ignorados/, 'usuário deve conseguir desfazer a classificação');
assert.match(compliance, /Tempo em solo entre etapas acima do limite ACT/, 'motor canônico deve continuar produzindo a evidência publicada');

console.log('[v14.3.85] OK — alerta de solo pode ser classificado como alteração do usuário sem alterar o motor canônico.');
