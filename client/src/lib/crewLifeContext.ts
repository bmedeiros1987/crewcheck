export type CrewLifeOperationalWindow = 'early_start' | 'daytime' | 'overnight' | 'unknown';

export type CrewLifeContext = {
  schemaVersion: 1;
  generatedAt: string;
  nextProgram?: { title?: string; presentation?: string; canonicalStartDateTime?: string; window: CrewLifeOperationalWindow };
  routine: { sleepHours?: number; activityMinutes?: number; recoveryPriority: 'normal' | 'high' };
  provenance: { operational: 'canonical_next_program' | 'unavailable'; wellbeing: 'crewlife_local' };
};

type NextProgram = {
  title?: string;
  presentation?: string;
  departure?: string;
  canonical?: { startDateTime?: string };
  operationalWindow?: CrewLifeOperationalWindow;
};

function finitePositive(value?: number): number | undefined {
  return Number.isFinite(value) && Number(value) > 0 ? Number(value) : undefined;
}

function canonicalWindow(program?: NextProgram | null): CrewLifeOperationalWindow {
  if (!program) return 'unknown';
  if (program.operationalWindow) return program.operationalWindow;
  // Compatibility belongs at the shared CrewLife boundary, never inside Fem.
  // This mirrors the existing Routine contract until Routine publishes the signal.
  const presentation = String(program.presentation || program.departure || '');
  const match = presentation.match(/(?:^|\s)(\d{1,2}):(\d{2})(?:\s|$)/);
  if (!match) return 'unknown';
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  if (minutes < 6 * 60) return 'early_start';
  if (minutes >= 22 * 60) return 'overnight';
  return 'daytime';
}

export function buildCrewLifeContext(input: { nextProgram?: NextProgram | null; sleepHours?: number; activityMinutes?: number; now?: Date }): CrewLifeContext {
  const { nextProgram } = input;
  const sleepHours = finitePositive(input.sleepHours);
  const activityMinutes = finitePositive(input.activityMinutes);
  const window = canonicalWindow(nextProgram);
  return {
    schemaVersion: 1,
    generatedAt: (input.now || new Date()).toISOString(),
    nextProgram: nextProgram ? {
      title: nextProgram.title,
      presentation: nextProgram.presentation || nextProgram.departure,
      canonicalStartDateTime: nextProgram.canonical?.startDateTime,
      window,
    } : undefined,
    routine: { sleepHours, activityMinutes, recoveryPriority: sleepHours !== undefined && sleepHours < 6 ? 'high' : 'normal' },
    provenance: { operational: nextProgram ? 'canonical_next_program' : 'unavailable', wellbeing: 'crewlife_local' },
  };
}
