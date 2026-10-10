import { isOfficialWellhubUrl } from '@shared/wellhub-links.mjs';
export function WellhubConciergeAnswer({ text }: { text: string }) {
  return <p className="cc-wellhub-concierge-answer" style={{ whiteSpace: 'pre-wrap' }}>{text.split(/(https:\/\/[^\s]+)/g).map((part,index) => isOfficialWellhubUrl(part)
    ? <a key={index} href={part} target="_blank" rel="noreferrer noopener">Ver no Wellhub</a> : part)}</p>;
}
