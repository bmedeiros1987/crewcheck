import type { jsPDF } from 'jspdf';
import { crewCheckEmailIdentity } from '../../../shared/crewcheckEmailIdentity.mjs';
export const CREWCHECK_BRAND = {
  name: 'CrewCheck',
  descriptor: 'Roster Intelligence',
  iconPath: crewCheckEmailIdentity.logoPath,
  palette: {
    navy950: '#020817',
    navy900: '#071D33',
    navy800: '#092846',
    text: '#071D33',
    muted: '#5D7083',
    white: '#FFFFFF',
    surface: '#F8FAFF',
    surfaceLavender: '#F6F1FF',
    surfacePink: '#FFF1F7',
    surfaceCyan: '#ECFBFF',
    line: '#DCE6F0',
    violet: '#9A4DFF',
    magenta: '#EC2C86',
    cyan: '#27C3E8',
    green: '#16865A',
    amber: '#D97706',
    red: '#C83E5A',
  },
  gradientCss: 'linear-gradient(135deg, #9A4DFF 0%, #EC2C86 52%, #27C3E8 100%)',
} as const;

let logoDataUrlPromise: Promise<string> | null = null;

function fileReaderDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Não foi possível carregar a identidade visual do CrewCheck.'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Retorna o ícone oficial como data URL para PDF, impressão e compartilhamento.
 * O cache evita reler a mesma imagem a cada exportação.
 */
export function crewCheckLogoDataUrl(): Promise<string> {
  if (!logoDataUrlPromise) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 2500);
    logoDataUrlPromise = fetch(CREWCHECK_BRAND.iconPath, { cache: 'force-cache', signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Logo indisponível (${response.status}).`);
        return response.blob();
      })
      .then(fileReaderDataUrl)
      .catch(() => '')
      .finally(() => window.clearTimeout(timer));
  }
  return logoDataUrlPromise;
}

/**
 * Resolve um asset público para URL absoluta, necessária em clientes de e-mail.
 */
export function crewCheckPublicAssetUrl(path = CREWCHECK_BRAND.iconPath): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  try {
    const env = ((import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env || {});
    const configured = String(env.VITE_PUBLIC_APP_URL || env.VITE_APP_URL || '').trim().replace(/\/$/, '');
    if (configured) return `${configured}${cleanPath}`;
  } catch {}
  if (typeof window !== 'undefined' && window.location?.origin) return `${window.location.origin}${cleanPath}`;
  return cleanPath;
}

/** Embed the existing approved PNG; readable document text remains the fallback. */
export function addCrewCheckPdfLogo(doc: jsPDF, dataUrl: string, x: number, y: number, size: number): boolean {
  if (!dataUrl) return false;
  try { doc.addImage(dataUrl, 'PNG', x, y, size, size); return true; } catch { return false; }
}
