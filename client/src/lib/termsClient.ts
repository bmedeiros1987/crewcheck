import { authFetch } from './authClient';

export type CrewCheckTerms = {
  id: string;
  version: number;
  title: string;
  body: string;
  contentHash: string;
  publishedAt?: string;
  effectiveAt?: string;
  accepted?: boolean;
};

export async function getCurrentTerms(): Promise<CrewCheckTerms | null> {
  const response = await fetch('/api/platform/terms/current', { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok === false) throw new Error(payload?.message || 'Não foi possível consultar os Termos.');
  return payload?.terms || null;
}

export async function acceptCurrentTerms(terms: CrewCheckTerms): Promise<CrewCheckTerms> {
  const payload = await authFetch<any>('/api/platform/terms/accept', {
    method: 'POST',
    cache: 'no-store',
    body: JSON.stringify({ termsId: terms.id, contentHash: terms.contentHash }),
  });
  return payload.terms;
}

export async function publishTerms(input: { title: string; body: string }): Promise<CrewCheckTerms> {
  const payload = await authFetch<any>('/api/platform/admin/terms', {
    method: 'POST',
    cache: 'no-store',
    body: JSON.stringify(input),
  });
  return payload.terms;
}

export async function grantUnlimited(input: { email: string; name?: string }) {
  return authFetch<any>('/api/platform/admin/unlimited', {
    method: 'POST',
    cache: 'no-store',
    body: JSON.stringify(input),
  });
}
