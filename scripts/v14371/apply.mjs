import fs from 'node:fs';

const file = 'client/src/lib/databaseClient.ts';
if (!fs.existsSync(file)) throw new Error('[v14.3.71] databaseClient.ts não encontrado.');

let source = fs.readFileSync(file, 'utf8');
const marker = '// [v14.3.71] active roster runtime reconciliation';
if (source.includes(marker)) {
  console.log('[v14.3.71] Reconciliação runtime da escala ativa já aplicada.');
  process.exit(0);
}

const importAnchor = "import { authFetch, getStoredUser, getToken } from './authClient';";
if (!source.includes(importAnchor)) throw new Error('[v14.3.71] Ponto de importação do databaseClient não encontrado.');
source = source.replace(
  importAnchor,
  `${importAnchor}\nimport { reconcileActiveRosterIdentity } from '@shared/activeRosterIdentity.mjs';\n${marker}`,
);

const oldBlock = `export async function openActiveRoster(): Promise<{ roster: CrewRoster; compliance: ComplianceResult; gym: GymRecommendation[]; summary?: SavedRosterSummary | null }> {
  const local = getSmartLocalActiveRosterSummary();
  try {
    const payload = await jsonFetch<{ ok: boolean; roster?: SavedRosterSummary | null; data?: { roster: CrewRoster; compliance: ComplianceResult | null; gym: GymRecommendation[] } }>(\`/api/rosters/active\`, { cache: 'no-store' });
    if (payload?.data?.roster?.days?.length) {
      return { roster: payload.data.roster, compliance: payload.data.compliance as any, gym: payload.data.gym || [], summary: payload.roster || null };
    }
    throw new Error('Escala ativa não retornou dados.');
  } catch (error) {
    if (local?.id) {
      const data = await openSavedRoster(local.id, local);
      const merged = await buildSmartLocalContinuousRoster(local, data).catch(() => data);
      return { ...merged, summary: local };
    }
    throw error;
  }
}`;

const newBlock = `export async function openActiveRoster(): Promise<{ roster: CrewRoster; compliance: ComplianceResult; gym: GymRecommendation[]; summary?: SavedRosterSummary | null }> {
  const local = getSmartLocalActiveRosterSummary();
  try {
    const payload = await jsonFetch<{ ok: boolean; roster?: SavedRosterSummary | null; data?: { roster: CrewRoster; compliance: ComplianceResult | null; gym: GymRecommendation[] } }>(\`/api/rosters/active\`, { cache: 'no-store' });
    if (payload?.data?.roster?.days?.length) {
      const reconciliation = reconcileActiveRosterIdentity({ remote: payload.roster || null, local: local || null });

      if (reconciliation.decision === 'confirm') {
        const conflict = new Error('Escala ativa precisa de confirmação: servidor e dispositivo possuem versões diferentes.');
        (conflict as any).code = 'ACTIVE_ROSTER_CONFLICT';
        (conflict as any).comparison = reconciliation.comparison;
        throw conflict;
      }

      if (reconciliation.decision === 'use-local' && local?.id) {
        const data = await openSavedRoster(local.id, local);
        const merged = await buildSmartLocalContinuousRoster(local, data).catch(() => data);
        return { ...merged, summary: local };
      }

      return { roster: payload.data.roster, compliance: payload.data.compliance as any, gym: payload.data.gym || [], summary: payload.roster || null };
    }
    throw new Error('Escala ativa não retornou dados.');
  } catch (error: any) {
    if (String(error?.code || '').toUpperCase() === 'ACTIVE_ROSTER_CONFLICT') throw error;
    if (local?.id) {
      const data = await openSavedRoster(local.id, local);
      const merged = await buildSmartLocalContinuousRoster(local, data).catch(() => data);
      return { ...merged, summary: local };
    }
    throw error;
  }
}`;

if (!source.includes(oldBlock)) throw new Error('[v14.3.71] Ponto de aplicação openActiveRoster não encontrado.');
source = source.replace(oldBlock, newBlock);
fs.writeFileSync(file, source, 'utf8');
console.log('[v14.3.71] openActiveRoster reconcilia identidade remoto/local e bloqueia conflito silencioso.');
