import { WELLHUB_VERIFIED_PARTNERS } from '@/lib/wellhubVerifiedCatalog';
import { wellhubUnitPageUrl } from '@shared/wellhub-unit-actions.mjs';
import { isOfficialWellhubUrl } from '@shared/wellhub-links.mjs';
export function WellhubConciergeAnswer({ text }: { text: string }) {
  return <p className="cc-wellhub-concierge-answer" style={{ whiteSpace: 'pre-wrap' }}>{text.split(/(https:\/\/[^\s]+)/g).map((part,index) => isOfficialWellhubUrl(part)
    ? <a key={index} href={wellhubUnitPageUrl(WELLHUB_VERIFIED_PARTNERS.find(p => p.sourceUrl === part)?.id) || part} target="_blank" rel="noreferrer noopener">{WELLHUB_VERIFIED_PARTNERS.some(p => p.sourceUrl === part) ? 'Ficha e ações' : 'Ver no Wellhub'}</a> : part)}</p>;
}
