export type AndroidBiometricStatus = {
  available: boolean;
  enabled: boolean;
  unlocked: boolean;
  code?: number;
};

export type AndroidBiometricResult = {
  action: 'enable' | 'unlock' | 'disable' | string;
  ok: boolean;
  code: string;
  message: string;
  enabled?: boolean;
  unlocked?: boolean;
  token?: string;
};

function nativeBridge(): any {
  if (typeof window === 'undefined') return null;
  return (window as any).AndroidCrewCheckNative || null;
}

export function getAndroidBiometricStatus(): AndroidBiometricStatus {
  const bridge = nativeBridge();
  if (!bridge || typeof bridge.biometricStatus !== 'function') {
    return { available: false, enabled: false, unlocked: false };
  }
  try {
    const raw = bridge.biometricStatus();
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return {
      available: Boolean(parsed?.available),
      enabled: Boolean(parsed?.enabled),
      unlocked: Boolean(parsed?.unlocked),
      code: Number.isFinite(Number(parsed?.code)) ? Number(parsed.code) : undefined,
    };
  } catch {
    return { available: false, enabled: false, unlocked: false };
  }
}

function requestResult(
  action: 'enable' | 'unlock',
  invoke: (bridge: any) => boolean,
): Promise<AndroidBiometricResult> {
  const bridge = nativeBridge();
  if (!bridge) return Promise.reject(new Error('Biometria disponível somente no aplicativo Android CrewCheck.'));

  return new Promise((resolve, reject) => {
    let done = false;
    const timeout = window.setTimeout(() => {
      if (done) return;
      done = true;
      window.removeEventListener('crewcheck:biometric-result', onResult as EventListener);
      reject(new Error('A autenticação biométrica demorou demais. Tente novamente.'));
    }, 45_000);

    const finish = (result: AndroidBiometricResult) => {
      if (done) return;
      done = true;
      window.clearTimeout(timeout);
      window.removeEventListener('crewcheck:biometric-result', onResult as EventListener);
      if (result.ok) resolve(result);
      else reject(new Error(result.message || 'A biometria não foi confirmada.'));
    };

    const onResult = (event: Event) => {
      const detail = (event as CustomEvent<AndroidBiometricResult>).detail;
      if (!detail || detail.action !== action) return;
      finish(detail);
    };

    window.addEventListener('crewcheck:biometric-result', onResult as EventListener);
    try {
      const accepted = invoke(bridge);
      if (accepted === false) finish({
        action,
        ok: false,
        code: 'native_rejected',
        message: 'O aplicativo não conseguiu iniciar a biometria.',
      });
    } catch {
      finish({
        action,
        ok: false,
        code: 'native_error',
        message: 'O aplicativo não conseguiu iniciar a biometria.',
      });
    }
  });
}

export function enableAndroidBiometric(token: string): Promise<AndroidBiometricResult> {
  if (!token) return Promise.reject(new Error('Sessão ausente para ativar a biometria.'));
  return requestResult('enable', (bridge) => bridge.enableBiometric(String(token)));
}

export function unlockAndroidBiometric(): Promise<AndroidBiometricResult> {
  return requestResult('unlock', (bridge) => bridge.unlockBiometric());
}

export function disableAndroidBiometric(): boolean {
  const bridge = nativeBridge();
  if (!bridge || typeof bridge.disableBiometric !== 'function') return false;
  try {
    return bridge.disableBiometric() !== false;
  } catch {
    return false;
  }
}

export function nativeBiometricBridgePresent(): boolean {
  return Boolean(nativeBridge());
}
