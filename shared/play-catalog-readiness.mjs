// Client readiness only; never grants entitlement or remaps a product/base plan.
export function playPlanReady(plan, product) {
  const period = {premium_monthly: 'P1M', premium_annual: 'P1Y'}[plan?.id];
  return Boolean(period && typeof plan?.googlePlayProductId === 'string' && plan.googlePlayProductId
    && product?.productId === plan.googlePlayProductId && product?.billingPeriod === period
    && typeof product?.formattedPrice === 'string' && product.formattedPrice.trim());
}
