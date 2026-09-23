package com.crewcheck.life;

import android.app.Activity;
import android.content.Context;

import org.json.JSONObject;

import java.lang.reflect.Field;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ExecutionException;

/**
 * Runtime adapter for Samsung Health Data SDK.
 *
 * The public CrewCheck repository intentionally does not redistribute Samsung's AAR.
 * When a samsung-health-data-api*.aar file is present in lifecompanion/libs, Gradle
 * packages it and this adapter uses the official API reflectively. The same source
 * therefore keeps CI buildable without shipping a third-party binary.
 */
final class SamsungHealthRuntime {
    private static final String CLS_SERVICE =
            "com.samsung.android.sdk.health.data.HealthDataService";
    private static final String CLS_DATA_TYPES =
            "com.samsung.android.sdk.health.data.request.DataTypes";
    private static final String CLS_DATA_TYPE =
            "com.samsung.android.sdk.health.data.request.DataType";
    private static final String CLS_PERMISSION =
            "com.samsung.android.sdk.health.data.permission.Permission";
    private static final String CLS_ACCESS =
            "com.samsung.android.sdk.health.data.permission.AccessType";
    private static final String CLS_LOCAL_TIME_FILTER =
            "com.samsung.android.sdk.health.data.request.LocalTimeFilter";
    private static final String CLS_LOCAL_DATE_FILTER =
            "com.samsung.android.sdk.health.data.request.LocalDateFilter";

    private SamsungHealthRuntime() {}

    static boolean sdkBundled() {
        if (!BuildConfig.SAMSUNG_HEALTH_SDK_INCLUDED) return false;
        try {
            Class.forName(CLS_SERVICE);
            return true;
        } catch (Throwable ignored) {
            return false;
        }
    }

    /**
     * Must be called away from Android's main thread because the Samsung async API
     * is intentionally awaited here to keep the Java/reflection boundary compact.
     */
    static JSONObject status(Context context) {
        JSONObject json = new JSONObject();
        try {
            json.put("ok", true);
            json.put("sdkBundled", sdkBundled());
            json.put("source", "samsung_health");

            if (!sdkBundled()) {
                json.put("state", "sdk_missing");
                json.put("message", "Adicione o Samsung Health Data SDK para habilitar a leitura automática.");
                return json;
            }

            Object store = getStore(context);
            boolean granted = hasAllPermissions(store);
            json.put("state", granted ? "connected" : "permission_required");
            json.put("permissionsGranted", granted);
        } catch (Throwable error) {
            Throwable healthError = rootHealthError(error);
            try {
                json.put("ok", false);
                json.put("sdkBundled", sdkBundled());
                json.put("source", "samsung_health");
                json.put("state", stateForError(healthError));
                json.put("message", friendlyError(healthError));
                json.put("errorCode", healthErrorCode(healthError));
            } catch (Exception ignored) {
            }
        }
        return json;
    }

    static boolean requestPermissions(Activity activity) throws Exception {
        if (!sdkBundled()) return false;

        Object store = getStore(activity);
        Set<Object> required = requiredPermissions();
        Set<Object> granted = grantedPermissions(store, required);
        if (granted.containsAll(required)) return true;

        Set<Object> missing = new HashSet<>(required);
        missing.removeAll(granted);

        Object future = invoke(store, "requestPermissionsAsync", missing, activity);
        Object result = invoke(future, "get");

        Set<Object> combined = new HashSet<>(granted);
        if (result instanceof Set<?>) {
            combined.addAll((Set<?>) result);
        }
        if (combined.containsAll(required)) return true;

        return grantedPermissions(store, required).containsAll(required);
    }

    static JSONObject readSummary(Context context) throws Exception {
        if (!sdkBundled()) {
            throw new IllegalStateException("Samsung Health Data SDK não incluído.");
        }

        Object store = getStore(context);
        Set<Object> required = requiredPermissions();
        if (!grantedPermissions(store, required).containsAll(required)) {
            throw new SecurityException("Permissões do Samsung Health ainda não foram concedidas.");
        }

        LocalDateTime now = LocalDateTime.now();
        LocalDateTime startOfDay = LocalDate.now().atStartOfDay();

        long steps = Math.round(numberValue(aggregate(
                store,
                "com.samsung.android.sdk.health.data.request.DataType$StepsType",
                "TOTAL",
                localTimeFilter(startOfDay, now)
        )));

        Duration active = durationValue(aggregate(
                store,
                "com.samsung.android.sdk.health.data.request.DataType$ActivitySummaryType",
                "TOTAL_ACTIVE_TIME",
                localTimeFilter(startOfDay, now)
        ));

        double activeCalories = numberValue(aggregate(
                store,
                "com.samsung.android.sdk.health.data.request.DataType$ActivitySummaryType",
                "TOTAL_ACTIVE_CALORIES_BURNED",
                localTimeFilter(startOfDay, now)
        ));

        double distance = numberValue(aggregate(
                store,
                "com.samsung.android.sdk.health.data.request.DataType$ActivitySummaryType",
                "TOTAL_DISTANCE",
                localTimeFilter(startOfDay, now)
        ));

        JSONObject sleep = latestSleep(store, now);
        JSONObject energy = latestEnergyScore(store);

        JSONObject json = new JSONObject();
        json.put("schemaVersion", 1);
        json.put("source", "samsung_health");
        json.put("generatedAtEpochMs", System.currentTimeMillis());
        json.put("day", LocalDate.now().toString());
        json.put("steps", Math.max(0, steps));
        json.put("activeMinutes", active == null ? 0 : Math.max(0, active.toMinutes()));
        json.put("caloriesBurned", Math.max(0, Math.round(activeCalories)));
        json.put("distanceMeters", Math.max(0, Math.round(distance)));
        json.put("sleepMinutes", sleep.optInt("sleepMinutes", 0));
        json.put("sleepScore", sleep.optInt("sleepScore", 0));
        json.put("sleepStart", sleep.optString("sleepStart", ""));
        json.put("sleepEnd", sleep.optString("sleepEnd", ""));
        json.put("energyScore", energy.optInt("energyScore", 0));
        json.put("energyDate", energy.optString("energyDate", ""));
        json.put("automatic", true);
        return json;
    }

    static boolean resolveIfPossible(Throwable error, Activity activity) {
        Throwable root = rootHealthError(error);
        if (!"ResolvablePlatformException".equals(root.getClass().getSimpleName())) return false;
        try {
            Object hasResolution = invoke(root, "getHasResolution");
            if (!(hasResolution instanceof Boolean) || !((Boolean) hasResolution)) return false;
            invoke(root, "resolve", activity);
            return true;
        } catch (Throwable ignored) {
            return false;
        }
    }

    static String friendlyError(Throwable error) {
        Throwable root = rootHealthError(error);
        int code = healthErrorCode(root);
        return switch (code) {
            case 3000 -> "Samsung Health não está instalado";
            case 3001 -> "Samsung Health precisa ser atualizado";
            case 3002 -> "Samsung Health está desativado";
            case 3003 -> "Conclua a configuração inicial do Samsung Health";
            case 2003 -> "o acesso do app ainda não foi autorizado pela Samsung";
            case 2004 -> "a assinatura desta build não está autorizada pela Samsung";
            default -> {
                if (root instanceof SecurityException) {
                    yield "permissões do Samsung Health ainda não foram concedidas";
                }
                String name = root.getClass().getSimpleName();
                yield name == null || name.isBlank() ? "erro desconhecido" : name;
            }
        };
    }

    private static String stateForError(Throwable error) {
        int code = healthErrorCode(error);
        return switch (code) {
            case 3000 -> "samsung_health_missing";
            case 3001 -> "samsung_health_update_required";
            case 3002 -> "samsung_health_disabled";
            case 3003 -> "samsung_health_setup_required";
            case 2003, 2004 -> "authorization_required";
            default -> "unavailable";
        };
    }

    private static int healthErrorCode(Throwable error) {
        try {
            Object value = tryInvoke(rootHealthError(error), "getErrorCode");
            return value instanceof Number ? ((Number) value).intValue() : 0;
        } catch (Throwable ignored) {
            return 0;
        }
    }

    private static Throwable rootHealthError(Throwable error) {
        Throwable current = error == null ? new IllegalStateException("unknown") : error;
        while (true) {
            if (current instanceof InvocationTargetException invocation
                    && invocation.getTargetException() != null) {
                current = invocation.getTargetException();
                continue;
            }
            if ((current instanceof ExecutionException || current instanceof CompletionException)
                    && current.getCause() != null) {
                current = current.getCause();
                continue;
            }
            return current;
        }
    }

    private static Object getStore(Context context) throws Exception {
        Class<?> service = Class.forName(CLS_SERVICE);
        return service.getMethod("getStore", Context.class)
                .invoke(null, context.getApplicationContext());
    }

    private static Set<Object> requiredPermissions() throws Exception {
        Set<Object> set = new HashSet<>();
        Object read = Enum.valueOf((Class<Enum>) Class.forName(CLS_ACCESS), "READ");
        Class<?> permissionClass = Class.forName(CLS_PERMISSION);
        Class<?> dataTypeClass = Class.forName(CLS_DATA_TYPE);
        Method of = permissionClass.getMethod(
                "of",
                dataTypeClass,
                Class.forName(CLS_ACCESS)
        );

        for (String field : new String[]{"STEPS", "SLEEP", "ACTIVITY_SUMMARY", "ENERGY_SCORE"}) {
            Object type = staticField(CLS_DATA_TYPES, field);
            set.add(of.invoke(null, type, read));
        }
        return set;
    }

    private static boolean hasAllPermissions(Object store) throws Exception {
        Set<Object> required = requiredPermissions();
        return grantedPermissions(store, required).containsAll(required);
    }

    private static Set<Object> grantedPermissions(Object store, Set<Object> required)
            throws Exception {
        Object future = invoke(store, "getGrantedPermissionsAsync", required);
        Object result = invoke(future, "get");
        Set<Object> granted = new HashSet<>();
        if (result instanceof Set<?>) {
            granted.addAll((Set<?>) result);
        }
        return granted;
    }

    private static Object localTimeFilter(LocalDateTime start, LocalDateTime end)
            throws Exception {
        return invokeStatic(Class.forName(CLS_LOCAL_TIME_FILTER), "of", start, end);
    }

    private static Object localDateFilter(LocalDate start, LocalDate end)
            throws Exception {
        return invokeStatic(Class.forName(CLS_LOCAL_DATE_FILTER), "of", start, end);
    }

    private static Object aggregate(
            Object store,
            String aggregateOwnerClass,
            String aggregateField,
            Object filter
    ) throws Exception {
        Object operation = staticField(aggregateOwnerClass, aggregateField);
        Object builder = invoke(operation, "getRequestBuilder");
        invoke(builder, "setLocalTimeFilter", filter);
        Object request = invoke(builder, "build");
        Object future = invoke(store, "aggregateDataAsync", request);
        Object response = invoke(future, "get");
        List<?> data = listValue(invoke(response, "getDataList"));
        if (data.isEmpty()) return null;
        return invoke(data.get(data.size() - 1), "getValue");
    }

    private static JSONObject latestSleep(Object store, LocalDateTime now) throws Exception {
        Object sleepType = staticField(CLS_DATA_TYPES, "SLEEP");
        Object builder = invoke(sleepType, "getReadDataRequestBuilder");
        invoke(builder, "setLocalTimeFilter", localTimeFilter(now.minusHours(40), now));
        Object request = invoke(builder, "build");
        Object future = invoke(store, "readDataAsync", request);
        Object response = invoke(future, "get");
        List<?> points = listValue(invoke(response, "getDataList"));

        Object durationField = staticField(
                "com.samsung.android.sdk.health.data.request.DataType$SleepType",
                "DURATION"
        );
        Object scoreField = staticField(
                "com.samsung.android.sdk.health.data.request.DataType$SleepType",
                "SLEEP_SCORE"
        );

        Object latest = null;
        LocalDateTime latestEnd = null;
        for (Object point : points) {
            Object end = tryInvoke(point, "getEndLocalDateTime");
            Object start = tryInvoke(point, "getStartLocalDateTime");
            LocalDateTime candidate = end instanceof LocalDateTime
                    ? (LocalDateTime) end
                    : start instanceof LocalDateTime ? (LocalDateTime) start : null;
            if (candidate != null && (latestEnd == null || candidate.isAfter(latestEnd))) {
                latest = point;
                latestEnd = candidate;
            }
        }

        JSONObject json = new JSONObject();
        if (latest == null) return json;

        Object duration = invoke(latest, "getValue", durationField);
        Object score = invoke(latest, "getValue", scoreField);
        Object start = tryInvoke(latest, "getStartLocalDateTime");
        Object end = tryInvoke(latest, "getEndLocalDateTime");

        Duration d = durationValue(duration);
        json.put("sleepMinutes", d == null ? 0 : Math.max(0, d.toMinutes()));
        json.put("sleepScore", Math.max(0, Math.round(numberValue(score))));
        json.put("sleepStart", start == null ? "" : start.toString());
        json.put("sleepEnd", end == null ? "" : end.toString());
        return json;
    }

    private static JSONObject latestEnergyScore(Object store) throws Exception {
        Object energyType = staticField(CLS_DATA_TYPES, "ENERGY_SCORE");
        Object builder = invoke(energyType, "getReadDataRequestBuilder");
        invoke(
                builder,
                "setLocalDateFilter",
                localDateFilter(LocalDate.now().minusDays(7), LocalDate.now().plusDays(1))
        );
        Object request = invoke(builder, "build");
        Object future = invoke(store, "readDataAsync", request);
        Object response = invoke(future, "get");
        List<?> points = listValue(invoke(response, "getDataList"));

        Object scoreField = staticField(
                "com.samsung.android.sdk.health.data.request.DataType$EnergyScoreType",
                "ENERGY_SCORE"
        );

        Object latest = null;
        LocalDateTime latestStart = null;
        for (Object point : points) {
            Object start = tryInvoke(point, "getStartLocalDateTime");
            LocalDateTime candidate = start instanceof LocalDateTime ? (LocalDateTime) start : null;
            if (candidate != null && (latestStart == null || candidate.isAfter(latestStart))) {
                latest = point;
                latestStart = candidate;
            }
        }

        JSONObject json = new JSONObject();
        if (latest == null) return json;

        Object value = invoke(latest, "getValue", scoreField);
        json.put(
                "energyScore",
                Math.max(0, Math.min(100, Math.round(numberValue(value))))
        );
        json.put(
                "energyDate",
                latestStart == null ? "" : latestStart.toLocalDate().toString()
        );
        return json;
    }

    private static Duration durationValue(Object value) {
        return value instanceof Duration ? (Duration) value : null;
    }

    private static double numberValue(Object value) {
        return value instanceof Number ? ((Number) value).doubleValue() : 0d;
    }

    private static List<?> listValue(Object value) {
        return value instanceof List<?> ? (List<?>) value : new ArrayList<>();
    }

    private static Object staticField(String className, String name) throws Exception {
        Class<?> type = Class.forName(className);
        try {
            Field field = type.getField(name);
            return field.get(null);
        } catch (NoSuchFieldException missing) {
            Field companionField = type.getField("Companion");
            Object companion = companionField.get(null);
            return companion.getClass().getMethod("get" + name).invoke(companion);
        }
    }

    private static Object invokeStatic(Class<?> type, String name, Object... args)
            throws Exception {
        try {
            Method method = findMethod(type, name, args);
            return method.invoke(null, args);
        } catch (NoSuchMethodException directMissing) {
            Field companionField = type.getField("Companion");
            Object companion = companionField.get(null);
            Method method = findMethod(companion.getClass(), name, args);
            return method.invoke(companion, args);
        }
    }

    private static Object invoke(Object target, String name, Object... args)
            throws Exception {
        Method method = findMethod(target.getClass(), name, args);
        return method.invoke(target, args);
    }

    private static Object tryInvoke(Object target, String name, Object... args) {
        try {
            return invoke(target, name, args);
        } catch (Throwable ignored) {
            return null;
        }
    }

    private static Method findMethod(Class<?> type, String name, Object[] args)
            throws NoSuchMethodException {
        for (Method method : type.getMethods()) {
            if (!method.getName().equals(name)
                    || method.getParameterCount() != args.length) {
                continue;
            }

            Class<?>[] params = method.getParameterTypes();
            boolean compatible = true;
            for (int i = 0; i < params.length; i++) {
                if (args[i] == null) continue;
                Class<?> boxed = box(params[i]);
                if (!boxed.isAssignableFrom(args[i].getClass())) {
                    compatible = false;
                    break;
                }
            }
            if (compatible) return method;
        }
        throw new NoSuchMethodException(type.getName() + "#" + name);
    }

    private static Class<?> box(Class<?> type) {
        if (!type.isPrimitive()) return type;
        if (type == int.class) return Integer.class;
        if (type == long.class) return Long.class;
        if (type == float.class) return Float.class;
        if (type == double.class) return Double.class;
        if (type == boolean.class) return Boolean.class;
        if (type == byte.class) return Byte.class;
        if (type == short.class) return Short.class;
        if (type == char.class) return Character.class;
        return type;
    }
}
