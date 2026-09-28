package com.crewcheck.app;

import android.app.Activity;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public final class CrewCheckBillingBridge implements PurchasesUpdatedListener {
    private final Activity activity;
    private final WebView webView;
    private final BillingClient billingClient;
    private final Map<String, ProductDetails> products = new ConcurrentHashMap<>();
    private volatile boolean ready = false;

    public CrewCheckBillingBridge(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
        this.billingClient = BillingClient.newBuilder(activity)
                .setListener(this)
                .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
                .enableAutoServiceReconnection()
                .build();
        connect();
    }

    private void connect() {
        if (billingClient.isReady()) {
            ready = true;
            dispatch("crewcheck:billing-ready", new JSONObject());
            return;
        }
        billingClient.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(BillingResult billingResult) {
                ready = billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK;
                if (ready) {
                    dispatch("crewcheck:billing-ready", new JSONObject());
                    restorePurchases();
                } else {
                    dispatchError("Não foi possível conectar à Google Play.", billingResult);
                }
            }

            @Override
            public void onBillingServiceDisconnected() {
                ready = false;
            }
        });
    }

    @JavascriptInterface
    public boolean isReady() {
        return ready && billingClient.isReady();
    }

    @JavascriptInterface
    public void queryProducts(String productIdsJson) {
        activity.runOnUiThread(() -> {
            try {
                JSONArray ids = new JSONArray(productIdsJson == null ? "[]" : productIdsJson);
                List<QueryProductDetailsParams.Product> query = new ArrayList<>();
                for (int index = 0; index < ids.length(); index++) {
                    String id = ids.optString(index, "").trim();
                    if (!id.isEmpty()) {
                        query.add(QueryProductDetailsParams.Product.newBuilder()
                                .setProductId(id)
                                .setProductType(BillingClient.ProductType.SUBS)
                                .build());
                    }
                }
                if (query.isEmpty()) return;
                ensureReady(() -> billingClient.queryProductDetailsAsync(
                        QueryProductDetailsParams.newBuilder().setProductList(query).build(),
                        (billingResult, result) -> {
                            if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                                dispatchError("Não foi possível consultar os planos da Google Play.", billingResult);
                                return;
                            }
                            JSONArray payload = new JSONArray();
                            for (ProductDetails details : result.getProductDetailsList()) {
                                products.put(details.getProductId(), details);
                                payload.put(publicProduct(details));
                            }
                            JSONObject event = new JSONObject();
                            try { event.put("products", payload); } catch (Exception ignored) {}
                            dispatch("crewcheck:billing-products", event);
                        }));
            } catch (Exception error) {
                dispatchError("Lista de produtos Google Play inválida.", null);
            }
        });
    }

    @JavascriptInterface
    public void purchase(String productId, String obfuscatedAccountId) {
        activity.runOnUiThread(() -> ensureReady(() -> {
            ProductDetails details = products.get(productId);
            if (details == null) {
                queryProducts(new JSONArray(Collections.singletonList(productId)).toString());
                dispatchError("O plano está sendo atualizado. Tente novamente em alguns segundos.", null);
                return;
            }
            List<ProductDetails.SubscriptionOfferDetails> offers = details.getSubscriptionOfferDetails();
            if (offers == null || offers.isEmpty()) {
                dispatchError("Este plano não possui oferta ativa na Google Play.", null);
                return;
            }
            ProductDetails.SubscriptionOfferDetails offer = chooseOffer(offers);
            BillingFlowParams.ProductDetailsParams item = BillingFlowParams.ProductDetailsParams.newBuilder()
                    .setProductDetails(details)
                    .setOfferToken(offer.getOfferToken())
                    .build();
            BillingFlowParams.Builder flow = BillingFlowParams.newBuilder()
                    .setProductDetailsParamsList(Collections.singletonList(item));
            String accountId = obfuscatedAccountId == null ? "" : obfuscatedAccountId.trim();
            if (!accountId.isEmpty() && accountId.length() <= 64) flow.setObfuscatedAccountId(accountId);
            BillingResult result = billingClient.launchBillingFlow(activity, flow.build());
            if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                dispatchError("A Google Play não conseguiu iniciar a compra.", result);
            }
        }));
    }

    private ProductDetails.SubscriptionOfferDetails chooseOffer(List<ProductDetails.SubscriptionOfferDetails> offers) {
        for (ProductDetails.SubscriptionOfferDetails offer : offers) {
            if (offer.getOfferTags() != null && offer.getOfferTags().contains("crewcheck-default")) return offer;
        }
        return offers.get(0);
    }

    @JavascriptInterface
    public void restorePurchases() {
        activity.runOnUiThread(() -> ensureReady(() -> billingClient.queryPurchasesAsync(
                QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build(),
                (billingResult, purchases) -> {
                    if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                        dispatchError("Não foi possível restaurar as compras da Google Play.", billingResult);
                        return;
                    }
                    if (purchases.isEmpty()) {
                        dispatch("crewcheck:billing-empty", new JSONObject());
                        return;
                    }
                    processPurchases(purchases, true);
                })));
    }

    @JavascriptInterface
    public void acknowledge(String purchaseToken) {
        if (purchaseToken == null || purchaseToken.trim().isEmpty()) return;
        activity.runOnUiThread(() -> ensureReady(() -> billingClient.acknowledgePurchase(
                AcknowledgePurchaseParams.newBuilder().setPurchaseToken(purchaseToken).build(),
                billingResult -> {
                    if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                        dispatch("crewcheck:billing-acknowledged", new JSONObject());
                    } else {
                        dispatchError("A confirmação da compra ficou pendente. Use Restaurar compras.", billingResult);
                    }
                })));
    }

    @Override
    public void onPurchasesUpdated(BillingResult billingResult, List<Purchase> purchases) {
        if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.USER_CANCELED) {
            dispatch("crewcheck:billing-canceled", new JSONObject());
            return;
        }
        if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK || purchases == null) {
            dispatchError("A compra não foi concluída pela Google Play.", billingResult);
            return;
        }
        processPurchases(purchases, false);
    }

    private void processPurchases(List<Purchase> purchases, boolean restored) {
        for (Purchase purchase : purchases) {
            if (purchase.getPurchaseState() == Purchase.PurchaseState.PENDING) {
                JSONObject pending = new JSONObject();
                try { pending.put("pending", true); } catch (Exception ignored) {}
                dispatch("crewcheck:billing-pending", pending);
                continue;
            }
            if (purchase.getPurchaseState() != Purchase.PurchaseState.PURCHASED) continue;
            for (String productId : purchase.getProducts()) {
                JSONObject detail = new JSONObject();
                try {
                    detail.put("productId", productId);
                    detail.put("purchaseToken", purchase.getPurchaseToken());
                    detail.put("orderId", purchase.getOrderId());
                    detail.put("acknowledged", purchase.isAcknowledged());
                    detail.put("restored", restored);
                } catch (Exception ignored) {}
                dispatch("crewcheck:billing-purchase", detail);
            }
        }
    }

    private JSONObject publicProduct(ProductDetails details) {
        JSONObject value = new JSONObject();
        try {
            value.put("productId", details.getProductId());
            value.put("name", details.getName());
            value.put("description", details.getDescription());
            List<ProductDetails.SubscriptionOfferDetails> offers = details.getSubscriptionOfferDetails();
            if (offers != null && !offers.isEmpty()) {
                ProductDetails.SubscriptionOfferDetails offer = chooseOffer(offers);
                List<ProductDetails.PricingPhase> phases = offer.getPricingPhases().getPricingPhaseList();
                if (!phases.isEmpty()) {
                    ProductDetails.PricingPhase phase = phases.get(phases.size() - 1);
                    value.put("formattedPrice", phase.getFormattedPrice());
                    value.put("billingPeriod", phase.getBillingPeriod());
                    value.put("currencyCode", phase.getPriceCurrencyCode());
                }
            }
        } catch (Exception ignored) {}
        return value;
    }

    private void ensureReady(Runnable action) {
        if (billingClient.isReady()) {
            ready = true;
            action.run();
        } else {
            ready = false;
            connect();
            dispatchError("Conectando à Google Play. Tente novamente em alguns segundos.", null);
        }
    }

    private void dispatchError(String message, BillingResult result) {
        JSONObject detail = new JSONObject();
        try {
            detail.put("message", message);
            if (result != null) detail.put("responseCode", result.getResponseCode());
        } catch (Exception ignored) {}
        dispatch("crewcheck:billing-error", detail);
    }

    private void dispatch(String eventName, JSONObject detail) {
        final String script = "(function(){try{window.dispatchEvent(new CustomEvent(" + JSONObject.quote(eventName) + ",{detail:" + detail.toString() + "}));}catch(e){}})();";
        webView.post(() -> {
            try { webView.evaluateJavascript(script, null); } catch (Exception ignored) {}
        });
    }

    public void destroy() {
        ready = false;
        try { billingClient.endConnection(); } catch (Exception ignored) {}
        products.clear();
    }
}
