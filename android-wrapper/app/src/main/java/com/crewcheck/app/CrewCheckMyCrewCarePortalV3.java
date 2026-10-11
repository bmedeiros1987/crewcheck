package com.crewcheck.app;

import android.app.Activity;
import android.webkit.WebView;
import android.widget.FrameLayout;
import java.net.URI;
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Release-disabled boundary for the future provider connection.
 *
 * The persistence, cache and reconciliation layers can compile and be reviewed
 * without enabling navigation, authentication or data acquisition. A later,
 * separately reviewed provider adapter must supply the real connection flow.
 */
public final class CrewCheckMyCrewCarePortalV3 {
    public static final int PROTOCOL_VERSION = 3;
    public static final boolean RELEASE_ENABLED = false;

    public interface ProviderVerifier {
        boolean isReady();
    }

    /** Injected observation boundary only. There is no production navigator or JS bridge. */
    public interface ObservedSource {
        void acquire(ObservedRequest request, ObservedPageCallback callback);
        void cancel(ObservedScope scope);
    }
    public interface ObservedPageCallback { void complete(ObservedPage page); }
    public interface ObservedCompletion { void complete(ObservedResult result, String error); }
    public interface ObservedCancel { void cancel(); }
    public interface ObservedDeadline { ObservedCancel schedule(long milliseconds, Runnable timeout); }
    public static final class ObservedScope {
        public final String accountId, sessionId, requestId, employeeId, username;
        public final long generation;
        public ObservedScope(String account, String session, String request, String employee, String user, long generation) {
            if (!id(account) || !id(session) || !id(request) || !id(employee) || !employee.matches("[0-9]+") || !id(user))
                throw new IllegalArgumentException("invalid-observed-scope");
            this.accountId=account; this.sessionId=session; this.requestId=request;
            this.employeeId=employee; this.username=user; this.generation=generation;
        }
    }
    public static final class ObservedRequest {
        public final ObservedScope scope;
        public final String kind;
        public final Map<String,String> card;
        ObservedRequest(ObservedScope scope, String kind, Map<String,String> card) {
            this.scope=scope; this.kind=kind; this.card=card;
        }
    }
    public static final class ObservedPage {
        public final ObservedScope scope;
        public final String url;
        public final List<Map<String,String>> rows;
        public ObservedPage(ObservedScope scope, String url, List<Map<String,String>> rows) {
            this.scope=scope; this.url=url; this.rows=copyRows(rows);
        }
    }
    public static final class ObservedResult {
        public final int schemaVersion=3;
        public final boolean operationalImportAllowed=false;
        public final String accountId,sessionId,requestId;
        public final long generation;
        public final List<Map<String,String>> observations;
        ObservedResult(ObservedScope scope,List<Map<String,String>> rows) {
            accountId=scope.accountId; sessionId=scope.sessionId; requestId=scope.requestId;
            generation=scope.generation; observations=copyRows(rows);
        }
    }
    private static boolean id(String value) { return value!=null && !value.trim().isEmpty() && value.equals(value.trim()) && value.length()<=240 && !value.matches("(?s).*[\\x00-\\x1f\\x7f].*"); }
    private static List<Map<String,String>> copyRows(List<Map<String,String>> rows) {
        if (rows==null || rows.size()>50) throw new IllegalArgumentException("invalid-observed-page");
        List<Map<String,String>> result=new ArrayList<>();
        for(Map<String,String> row:rows) {
            if(row==null || row.size()>14) throw new IllegalArgumentException("invalid-observed-page");
            result.add(Collections.unmodifiableMap(new LinkedHashMap<>(row)));
        }
        return Collections.unmodifiableList(result);
    }
    /** Thread-safe ownership is reserved before any injected/reentrant callback. */
    public static final class ObservedAcquisition {
        private long generation;
        private Operation active;
        private static final Set<String> PROFILE=keys("employeeId","username");
        private static final Set<String> CARD=keys("providerReservationId","dutyPeriodNumber","airport","pairingId","hotelName");
        private static final Set<String> DETAIL=keys("providerReservationId","dutyPeriodNumber","airport","pairingId","hotelName",
            "confirmationRaw","checkInWallDateTime","checkOutWallDateTime","toHotelProvider","toHotelPickupWallTime","toHotelTransitMinutes",
            "toAirportProvider","toAirportPickupWallTime","toAirportTransitMinutes");
        private static Set<String> keys(String... values) { return Collections.unmodifiableSet(new HashSet<>(Arrays.asList(values))); }
        private static final class Operation {
            final ObservedScope scope; final ObservedSource source; final ObservedCompletion completion;
            final AtomicBoolean completed=new AtomicBoolean();
            ObservedCancel timeout; int step; long finishedGeneration; List<Map<String,String>> cards=Collections.emptyList();
            final List<Map<String,String>> details=new ArrayList<>();
            Operation(ObservedScope scope,ObservedSource source,ObservedCompletion completion) { this.scope=scope; this.source=source; this.completion=completion; }
        }
        public boolean begin(ObservedScope scope,ObservedSource source,ObservedDeadline deadline,ObservedCompletion completion) {
            if(scope==null || source==null || deadline==null || completion==null) return false;
            Operation old,op;
            synchronized(this) {
                old=active;
                ObservedScope captured=new ObservedScope(scope.accountId,scope.sessionId,scope.requestId,scope.employeeId,scope.username,++generation);
                active=op=new Operation(captured,source,completion);
            }
            terminate(old,null,"observed-cancelled");
            synchronized(this) { if(active!=op) return false; }
            try {
                ObservedCancel timer=deadline.schedule(30000,()->finish(op,null,"observed-timeout"));
                boolean current;
                synchronized(this) { current=active==op; if(current) op.timeout=timer; }
                if(!current) { if(timer!=null) timer.cancel(); return false; }
                acquire(op,"profile-before",null);
                return true;
            } catch(RuntimeException error) { finish(op,null,"observed-acquisition-failed"); return false; }
        }
        public void cancel() {
            Operation old;
            synchronized(this) { old=active; active=null; ++generation; }
            terminate(old,null,"observed-cancelled");
        }
        /** Account cleanup must not invalidate a newer observation owned by another account. */
        public void cancel(String accountId) {
            Operation old;
            synchronized(this) {
                if(active==null || accountId==null || !active.scope.accountId.equals(accountId.trim())) return;
                old=active; active=null; ++generation;
            }
            terminate(old,null,"observed-cancelled");
        }
        private void acquire(Operation op,String kind,Map<String,String> card) {
            final int step;
            synchronized(this) { if(active!=op) return; step=++op.step; }
            try { op.source.acquire(new ObservedRequest(op.scope,kind,card), page->receive(op,step,kind,card,page)); }
            catch(RuntimeException error) { finish(op,null,"observed-acquisition-failed"); }
        }
        private void receive(Operation op,int step,String kind,Map<String,String> card,ObservedPage page) {
            synchronized(this) { if(active!=op || op.step!=step) return; ++op.step; }
            try {
                validate(op,kind,card,page);
                if(kind.startsWith("profile")) {
                    Map<String,String> profile=page.rows.get(0);
                    if(!op.scope.employeeId.equals(profile.get("employeeId")) || !op.scope.username.equals(profile.get("username"))) throw new IllegalArgumentException();
                    if(kind.equals("profile-before")) acquire(op,"cards",null);
                    else finish(op,new ObservedResult(op.scope,op.details),null);
                } else if(kind.equals("cards")) {
                    synchronized(this) { if(active!=op) return; op.cards=page.rows; }
                    acquire(op,"detail",op.cards.get(0));
                } else {
                    int index;
                    synchronized(this) { if(active!=op) return; op.details.add(page.rows.get(0)); index=op.details.size(); }
                    if(index<op.cards.size()) acquire(op,"detail",op.cards.get(index));
                    else acquire(op,"profile-after",null);
                }
            } catch(RuntimeException error) { finish(op,null,"observed-validation-failed"); }
        }
        private void validate(Operation op,String kind,Map<String,String> card,ObservedPage page) {
            if(page==null || page.scope==null || page.scope.generation!=op.scope.generation
                || !op.scope.accountId.equals(page.scope.accountId) || !op.scope.sessionId.equals(page.scope.sessionId)
                || !op.scope.requestId.equals(page.scope.requestId)) throw new IllegalArgumentException();
            URI uri=URI.create(page.url);
            String path=kind.startsWith("profile")?"userprofile.aspx":kind.equals("cards")?"mytravel.aspx":"reservation.aspx";
            if(!"https".equals(uri.getScheme()) || !"api2.apicrewcare.com".equals(uri.getHost())
                || uri.getUserInfo()!=null || (uri.getPort()!=-1 && uri.getPort()!=443) || !uri.getPath().equals("/LATAM/"+path)
                || uri.getFragment()!=null || page.rows.isEmpty() || (!kind.equals("cards") && page.rows.size()!=1)) throw new IllegalArgumentException();
            Set<String> keys=kind.startsWith("profile")?PROFILE:kind.equals("cards")?CARD:DETAIL;
            Set<String> unique=new HashSet<>();
            for(Map<String,String> row:page.rows) {
                if(!row.keySet().equals(keys)) throw new IllegalArgumentException();
                for(String value:row.values()) if(!id(value) || value.matches("(?s).*[\\x00-\\x1f\\x7f].*")) throw new IllegalArgumentException();
                if(!kind.startsWith("profile")) {
                    if(!row.get("airport").matches("[A-Z]{3}")) throw new IllegalArgumentException();
                    if(!unique.add(row.get("providerReservationId")+"|"+row.get("dutyPeriodNumber"))) throw new IllegalArgumentException();
                }
                if(kind.equals("detail")) {
                    for(String key:CARD) if(!row.get(key).equals(card.get(key))) throw new IllegalArgumentException();
                    String expected="tripreservid="+row.get("providerReservationId")+"&dutyperiodnumber="+row.get("dutyPeriodNumber");
                    if(!expected.equals(uri.getRawQuery())) throw new IllegalArgumentException();
                    for(String key:Arrays.asList("toHotelPickupWallTime","toAirportPickupWallTime")) if(!row.get(key).matches("(?:[01][0-9]|2[0-3]):[0-5][0-9]")) throw new IllegalArgumentException();
                    for(String key:Arrays.asList("toHotelTransitMinutes","toAirportTransitMinutes")) if(!row.get(key).matches("[0-9]{1,3}") || Integer.parseInt(row.get(key))>360) throw new IllegalArgumentException();
                    for(String key:Arrays.asList("checkInWallDateTime","checkOutWallDateTime")) {
                        if(!row.get(key).matches("[0-9]{4}-[0-9]{2}-[0-9]{2}T(?:[01][0-9]|2[0-3]):[0-5][0-9]")) throw new IllegalArgumentException();
                        java.time.LocalDateTime.parse(row.get(key));
                    }
                    if(row.get("checkOutWallDateTime").compareTo(row.get("checkInWallDateTime"))<=0) throw new IllegalArgumentException();
                }
            }
        }
        private void finish(Operation op,ObservedResult result,String error) {
            synchronized(this) { if(active!=op) return; active=null; op.finishedGeneration=++generation; }
            terminate(op,result,error);
        }
        private void terminate(Operation op,ObservedResult result,String error) {
            if(op==null || !op.completed.compareAndSet(false,true)) return;
            if(op.timeout!=null) { try { op.timeout.cancel(); } catch(RuntimeException ignored) {} }
            try { op.source.cancel(op.scope); } catch(RuntimeException ignored) {}
            synchronized(this) {
                if(result!=null && (active!=null || generation!=op.finishedGeneration)) {
                    result=null; error="observed-cancelled";
                }
            }
            op.completion.complete(result,error);
        }
    }

    private final Activity activity;
    private final CrewCheckMyCrewCareProfile profiles;

    public CrewCheckMyCrewCarePortalV3(
            Activity activity,
            FrameLayout root,
            WebView mainWebView,
            CrewCheckMyCrewCareProfile profiles,
            ProviderVerifier verifier
    ) {
        this.activity = activity;
        this.profiles = profiles;
    }

    public boolean isReady() {
        return false;
    }

    public boolean open(String requestJson, boolean automaticConsent) {
        return false;
    }

    /**
     * Starts an asynchronous disconnect. Returns false (without invoking the callback)
     * only when the request itself is invalid; otherwise the callback reports the real result.
     */
    public boolean disconnect(String accountId, boolean forgetProfile, CrewCheckMyCrewCareProfile.CleanupCallback callback) {
        if (activity == null || profiles == null || accountId == null || accountId.trim().isEmpty()) return false;
        if (forgetProfile) profiles.clear(activity, accountId, callback);
        else if (callback != null) callback.onComplete(true, "ok");
        return true;
    }

    public void cancelVisible() { }

    public boolean isVisible() {
        return false;
    }

    public void destroy() { }
}
