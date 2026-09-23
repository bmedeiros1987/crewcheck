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
        const remoteIdentity = reconciliation.comparison.left;
        const localIdentity = reconciliation.comparison.right;
        const sameReferencePeriod = remoteIdentity.year !== null
          && localIdentity.year !== null
          && remoteIdentity.month !== null
          && localIdentity.month !== null
          && remoteIdentity.year === localIdentity.year
          && remoteIdentity.month === localIdentity.month;
        if (!sameReferencePeriod) {
          const mismatch = new Error('Escala ativa e dispositivo pertencem a competências diferentes.');
          (mismatch as any).code = 'ROSTER_PERIOD_MISMATCH';
          (mismatch as any).comparison = reconciliation.comparison;
          throw mismatch;
        }

        const conflict = new Error('Escala ativa precisa de confirmação: servidor e dispositivo possuem versões diferentes.');
        (conflict as any).code = 'ACTIVE_ROSTER_CONFLICT';
        (conflict as any).comparison = reconciliation.comparison;
        // The default contract remains fail-closed. The verified account-sync
        // consumer may adjudicate this exact same-period conflict without
        // refetching or mistaking device fallback bytes for account authority.
        (conflict as any).remoteCandidate = {
          roster: payload.data.roster,
          compliance: payload.data.compliance as any,
          gym: payload.data.gym || [],
          summary: payload.roster || null,
        };
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
    if (['ACTIVE_ROSTER_CONFLICT', 'ROSTER_PERIOD_MISMATCH'].includes(String(error?.code || '').toUpperCase())) throw error;
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
console.log('[v14.3.71] openActiveRoster reconcilia identidade remoto/local e bloqueia conflito ou competência divergente.');
