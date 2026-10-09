import { financialRateOwner, financialRateSession } from './financialStatementLearning';
export const isFinancialSetting = (key: string) => /^crewcheck_(?:salary_|act_|perdiem_|fx_)/.test(key);
const prefix = 'crewcheck_financial_settings_v1:';
export function readFinancialSetting(key: string, fallback = ''): string {
  try { const owner = financialRateOwner(); return owner && isFinancialSetting(key) ? localStorage.getItem(prefix + encodeURIComponent(owner) + ':' + key) ?? fallback : fallback; } catch { return fallback; }
}
export function writeFinancialSetting(key: string, value: string, expectedSession = financialRateSession()): boolean {
  try {
    const owner = financialRateOwner();
    if (!owner || !isFinancialSetting(key) || !expectedSession || expectedSession !== financialRateSession()) return false;
    localStorage.setItem(prefix + encodeURIComponent(owner) + ':' + key, value);
    window.dispatchEvent(new Event('crewcheck:financial-config-changed'));
    return true;
  } catch { return false; }
}
