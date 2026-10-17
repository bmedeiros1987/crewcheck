import { useEffect, useState } from 'react';
import { getSavedLanguage, type CrewLanguage } from '../lib/i18n';

const copy = {
  pt: { opening: 'Abrindo CrewCheck', loaded: 'Aplicativo carregado', session: 'Verificando sessão', profile: 'Preparando seu acesso', steps: 'Etapas da abertura', step: 'Etapa {step} de 3: {label}', offline: 'Seu dispositivo está sem conexão. Aguardando a verificação de acesso.', slow: 'Está levando mais tempo que o normal. A verificação continua em andamento.', retry: 'Tentar novamente' },
  en: { opening: 'Opening CrewCheck', loaded: 'App loaded', session: 'Checking session', profile: 'Preparing your access', steps: 'Startup steps', step: 'Step {step} of 3: {label}', offline: 'Your device is offline. Waiting to verify access.', slow: 'This is taking longer than usual. Verification is still in progress.', retry: 'Try again' },
  es: { opening: 'Abriendo CrewCheck', loaded: 'Aplicación cargada', session: 'Verificando sesión', profile: 'Preparando tu acceso', steps: 'Pasos de inicio', step: 'Paso {step} de 3: {label}', offline: 'Tu dispositivo está sin conexión. Esperando verificar el acceso.', slow: 'Está tardando más de lo habitual. La verificación continúa.', retry: 'Reintentar' },
  fr: { opening: 'Ouverture de CrewCheck', loaded: 'Application chargée', session: 'Vérification de la session', profile: 'Préparation de votre accès', steps: 'Étapes du démarrage', step: 'Étape {step} sur 3 : {label}', offline: 'Votre appareil est hors ligne. En attente de la vérification de l’accès.', slow: 'Cela prend plus de temps que prévu. La vérification continue.', retry: 'Réessayer' },
  it: { opening: 'Apertura di CrewCheck', loaded: 'Applicazione caricata', session: 'Verifica della sessione', profile: 'Preparazione del tuo accesso', steps: 'Fasi di avvio', step: 'Fase {step} di 3: {label}', offline: 'Il dispositivo è offline. In attesa della verifica dell’accesso.', slow: 'Sta richiedendo più tempo del solito. La verifica continua.', retry: 'Riprova' },
  de: { opening: 'CrewCheck wird geöffnet', loaded: 'App geladen', session: 'Sitzung wird geprüft', profile: 'Zugang wird vorbereitet', steps: 'Startschritte', step: 'Schritt {step} von 3: {label}', offline: 'Dein Gerät ist offline. Die Zugangsprüfung steht noch aus.', slow: 'Dies dauert länger als üblich. Die Prüfung läuft weiter.', retry: 'Erneut versuchen' },
} satisfies Record<CrewLanguage, Record<string, string>>;

export function startupCopy(language: CrewLanguage = getSavedLanguage()) { return copy[language]; }
export function useStartupCopy() {
  const [language, setLanguage] = useState(getSavedLanguage);
  useEffect(() => {
    const refresh = () => setLanguage(getSavedLanguage());
    window.addEventListener('crewcheck:language-change', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('crewcheck:language-change', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);
  return startupCopy(language);
}
