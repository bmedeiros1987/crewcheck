package com.crewcheck.watch;

import android.content.Intent;
import android.content.IntentFilter;
import android.os.BatteryManager;

/** Battery glance owned by CrewCheck so the value is always available on our watch face. */
public final class BatteryComplicationService extends BaseComplicationService {
    @Override
    protected int tapRequestCode() {
        return 15;
    }

    @Override
    protected String tapScreen() {
        return "now";
    }

    @Override
    protected ComplicationRendering render(long nowEpochMs, boolean preview) {
        if (preview) {
            return new ComplicationRendering(
                    "87%",
                    "Bateria 87%",
                    "BATERIA",
                    "Bateria do relógio em 87 por cento."
            );
        }

        try {
            Intent status = registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
            if (status == null) return unavailable();
            int level = status.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
            int scale = status.getIntExtra(BatteryManager.EXTRA_SCALE, 100);
            int state = status.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
            int percent = level >= 0 && scale > 0 ? Math.round(level * 100f / scale) : -1;
            if (percent < 0) return unavailable();
            boolean charging = state == BatteryManager.BATTERY_STATUS_CHARGING
                    || state == BatteryManager.BATTERY_STATUS_FULL;
            String shortText = percent + "%";
            String longText = "Bateria " + percent + "%" + (charging ? " · carregando" : "");
            String description = "Bateria do relógio em " + percent + " por cento"
                    + (charging ? ", carregando." : ".");
            return new ComplicationRendering(shortText, longText, "BATERIA", description);
        } catch (Exception ignored) {
            return unavailable();
        }
    }

    private static ComplicationRendering unavailable() {
        return new ComplicationRendering(
                "--",
                "Bateria indisponível",
                "BATERIA",
                "Não foi possível ler a bateria do relógio."
        );
    }
}
