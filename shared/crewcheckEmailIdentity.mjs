// Public institutional identity shared by delivered email and its admin preview.
export const crewCheckEmailIdentity = Object.freeze({
  name: 'CrewCheck',
  description: 'Inteligência Operacional para Profissionais da Aviação',
  url: 'https://crewcheck.online',
  websiteLabel: 'crewcheck.online',
});

export const crewCheckEmailSignatureText = `${crewCheckEmailIdentity.name} — ${crewCheckEmailIdentity.description}\n${crewCheckEmailIdentity.url}`;
