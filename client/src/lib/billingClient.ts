import { authFetch, AuthClientError } from './authClient';

export type BillingPlanId = 'free' | 'premium_monthly' | 'premium_annual' | 'premium_lifetime' | 'admin';
export type BillingCheckoutBillingType = 'UNDEFINED' | 'PIX' | 'BOLETO' | 'CREDIT_CARD';

export interface BillingPlan {
 id: BillingPlanId | string;
 name: string;
 cycle: string;
 value: number;
 currency: string;
 description: string;
 reference?: string;
 diariaReferenceValue?: number;
 annualDiscountPercent?: number;
 notice?: string;
 originalValue?: number;
 promoValue?: number;
 promoActive?: boolean;
 promoEndsAt?: string;
 promoDurationMonths?: number;
 regularValueAfterPromo?: number;
 firstYearPromoOnly?: boolean;
 annualGift?: string;
}

export interface BillingPricePolicy {
 diariaReferenceValue?: number;
 monthlyValue?: number;
 annualValue?: number;
 monthlyOriginalValue?: number;
 annualOriginalValue?: number;
 monthlyPromoValue?: number;
 annualPromoValue?: number;
 promoActive?: boolean;
 promoEndsAt?: string;
 monthlyPromoMonths?: number;
 monthlyRegularValueAfterPromo?: number;
 annualRegularValueAfterPromo?: number;
 annualDiscountPercent?: number;
 notice?: string;
 monthlyRule?: string;
 annualRule?: string;
}

export interface BillingStatus {
 ok: boolean;
 plan: BillingPlan;
 status: string;
 premiumAccess: boolean;
 trialEligible: boolean;
 trialDays?: number;
 trialExpiresAt?: string | null;
 premiumExpiresAt?: string | null;
 billingCycle?: string | null;
 cancelAtPeriodEnd?: boolean;
 asaasConfigured?: boolean;
 hasBillingSubscription?: boolean;
 needsAsaasRegularization?: boolean;
 regularizationTrialDaysRemaining?: number;
 regularizationFirstDueDate?: string | null;
 regularizationMessage?: string | null;
 plans?: BillingPlan[];
 pricePolicy?: BillingPricePolicy;
 misusePolicy?: string;
 message?: string;
}

export interface BillingPixQrCode {
 encodedImage?: string | null;
 payload?: string | null;
 expirationDate?: string | null;
}

export interface BillingPaymentPublicInfo {
 value?: number | null;
 dueDate?: string | null;
 status?: string | null;
 invoiceUrl?: string | null;
 bankSlipUrl?: string | null;
 pixQrCode?: BillingPixQrCode | null;
}

export interface BillingCheckoutResponse {
 ok: boolean;
 plan: BillingPlan;
 checkoutUrl?: string | null;
 payment?: BillingPaymentPublicInfo | null;
 promo?: Record<string, unknown> | null;
 billingType?: BillingCheckoutBillingType;
 firstDueDate?: string | null;
 billing?: BillingStatus;
 message?: string;
}


function billingSafeMessage(error: unknown, fallback: string): string {
 const anyError = error as any;
 const code = String(anyError?.code || anyError?.payload?.code || '').toUpperCase();
 const payloadMessage = String(anyError?.payload?.message || '');
 const rawMessage = String(anyError?.message || '');
 const joined = `${code} ${payloadMessage} ${rawMessage}`.toLowerCase();
 if (code === 'CPF_REQUIRED' || joined.includes('cpf_required')) return 'Informe o CPF para continuar.';
 if (code === 'CPF_INVALID' || joined.includes('cpf inválido') || joined.includes('cpf invalido')) return 'CPF inválido. Confira os números e tente novamente.';
 if (code === 'SAFETY_NOTICE_REQUIRED') return 'Confirme a ciência de uso antes de continuar.';
 if (code === 'TRIAL_IDENTITY_ALREADY_USED') return 'Este teste grátis já foi usado para esta escala. Escolha um plano Premium para continuar.';
 if (code === 'REGULARIZATION_NOT_REQUIRED') return 'Esta conta não precisa de regularização. Escolha um plano ou atualize o status.';
 if (joined.includes('invalid_customer') || joined.includes('cliente inválido') || joined.includes('cliente invalido')) return 'Não foi possível validar o cadastro de cobrança. Tente novamente.';
 if (joined.includes('asaas') || joined.includes('externalreference') || joined.includes('customer') || joined.includes('subscription')) return fallback;
 if (error instanceof AuthClientError && payloadMessage && !payloadMessage.includes('{')) return payloadMessage;
 return fallback;
}

async function safeBillingFetch<T>(operation: Promise<T>, fallback: string): Promise<T> {
 try {
  return await operation;
 } catch (error) {
  throw new Error(billingSafeMessage(error, fallback));
 }
}

export function formatBillingValue(value?: number | null, currency = 'BRL'): string {
 const number = Number(value || 0);
 if (!Number.isFinite(number) || number <= 0) return 'Grátis';
 return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(number);
}

export function billingStatusLabel(status?: string): string {
 const normalized = String(status || 'free').toLowerCase();
 if (normalized === 'lifetime') return 'Premium Unlimited';
 if (normalized === 'trialing') return 'Teste grátis ativo';
 if (normalized === 'active' || normalized === 'paid' || normalized === 'received') return 'Premium ativo';
 if (normalized === 'pending') return 'Pagamento pendente';
 if (normalized === 'past_due') return 'Pagamento em atraso';
 if (normalized === 'canceled') return 'Cancelado';
 if (normalized === 'trial_expired') return 'Teste encerrado';
 return 'Básico gratuito';
}

export async function getBillingStatus(): Promise<BillingStatus> {
 return safeBillingFetch(authFetch<BillingStatus>('/api/billing/status'), 'Não foi possível carregar a assinatura agora.');
}

export async function startPremiumTrial(customer?: { cpfCnpj?: string; acknowledgedSafetyNotice?: boolean; safetyNoticeVersion?: string }): Promise<BillingStatus> {
 return safeBillingFetch(authFetch<BillingStatus>('/api/billing/start-trial', { method: 'POST', body: JSON.stringify(customer || {}) }), 'Não foi possível iniciar o teste grátis agora.');
}


export async function regularizePremiumTrial(customer?: { cpfCnpj?: string; acknowledgedSafetyNotice?: boolean; safetyNoticeVersion?: string }): Promise<BillingStatus> {
 return safeBillingFetch(authFetch<BillingStatus>('/api/billing/regularize-trial-as-subscription', { method: 'POST', body: JSON.stringify(customer || {}) }), 'Não foi possível regularizar a assinatura agora.');
}

export async function createBillingCheckout(
 planId: 'premium_monthly' | 'premium_annual',
 billingType: BillingCheckoutBillingType = 'UNDEFINED',
 customer?: { cpfCnpj?: string; acknowledgedSafetyNotice?: boolean; safetyNoticeVersion?: string },
): Promise<BillingCheckoutResponse> {
 return safeBillingFetch(authFetch<BillingCheckoutResponse>('/api/billing/checkout', {
  method: 'POST',
  body: JSON.stringify({ planId, billingType, ...(customer || {}) }),
 }), 'Não foi possível criar a cobrança agora. Confira o CPF e tente novamente.');
}

export async function cancelBillingSubscription(): Promise<BillingStatus> {
 return safeBillingFetch(authFetch<BillingStatus>('/api/billing/cancel', { method: 'POST', body: '{}' }), 'Não foi possível cancelar a assinatura agora.');
}
