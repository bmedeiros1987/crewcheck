package com.crewcheck.app;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.content.Context;
import android.content.Intent;
import android.view.Gravity;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public final class CrewCheckWakeAlarmActivity extends Activity {
    private Ringtone ringtone;
    private Vibrator vibrator;
    private String wakeKey = "";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(
                    WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
                    WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON |
                    WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
            );
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setStatusBarColor(Color.parseColor("#030814"));
        getWindow().setNavigationBarColor(Color.parseColor("#030814"));

        Intent intent = getIntent();
        wakeKey = intent == null ? "" : String.valueOf(intent.getStringExtra("wakeKey"));
        String label = intent == null ? "Pernoite" : String.valueOf(intent.getStringExtra("label"));
        long when = intent == null ? System.currentTimeMillis() : intent.getLongExtra("when", System.currentTimeMillis());

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        root.setPadding(dp(28), dp(56), dp(28), dp(34));
        root.setBackgroundColor(Color.parseColor("#030814"));

        TextView brand = text("CREWCHECK WAKE", 13, Color.parseColor("#9CB7FF"), true);
        brand.setLetterSpacing(.16f);
        root.addView(brand);

        TextView time = text(new SimpleDateFormat("HH:mm", Locale.getDefault()).format(new Date(when)), 66, Color.WHITE, true);
        LinearLayout.LayoutParams timeParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        timeParams.topMargin = dp(18);
        time.setGravity(Gravity.CENTER);
        root.addView(time, timeParams);

        TextView title = text(label == null || label.trim().isEmpty() ? "Hora de acordar" : label, 19, Color.parseColor("#EAF0FF"), true);
        title.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        titleParams.topMargin = dp(8);
        root.addView(title, titleParams);

        TextView hint = text("Seu CrewCheck Wake está ativo.", 13, Color.parseColor("#91A4C8"), false);
        hint.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams hintParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        hintParams.topMargin = dp(7);
        root.addView(hint, hintParams);

        LinearLayout spacer = new LinearLayout(this);
        root.addView(spacer, new LinearLayout.LayoutParams(1, 0, 1f));

        Button awake = new Button(this);
        awake.setText("Acordei");
        awake.setAllCaps(false);
        awake.setTextColor(Color.WHITE);
        awake.setTextSize(17f);
        awake.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        GradientDrawable buttonBg = new GradientDrawable(
                GradientDrawable.Orientation.TL_BR,
                new int[]{Color.parseColor("#7559F2"), Color.parseColor("#3D8CF7")}
        );
        buttonBg.setCornerRadius(dp(22));
        awake.setBackground(buttonBg);
        awake.setOnClickListener(v -> acknowledge());

        LinearLayout.LayoutParams buttonParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(64));
        buttonParams.topMargin = dp(20);
        root.addView(awake, buttonParams);

        setContentView(root);
        startAlarmSound();
    }

    private TextView text(String value, float size, int color, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(color);
        if (bold) view.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        return view;
    }

    private void startAlarmSound() {
        try {
            Uri uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            if (uri == null) uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            ringtone = RingtoneManager.getRingtone(this, uri);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && ringtone != null) ringtone.setLooping(true);
            if (ringtone != null) ringtone.play();
        } catch (Exception ignored) {}

        try {
            vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            long[] pattern = new long[]{0, 650, 350, 650, 350};
            if (vibrator != null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
                } else {
                    vibrator.vibrate(pattern, 0);
                }
            }
        } catch (Exception ignored) {}
    }

    private void stopAlarmSound() {
        try { if (ringtone != null && ringtone.isPlaying()) ringtone.stop(); } catch (Exception ignored) {}
        try { if (vibrator != null) vibrator.cancel(); } catch (Exception ignored) {}
    }

    private void acknowledge() {
        stopAlarmSound();
        CrewCheckWakeScheduler.acknowledge(this, wakeKey);

        Intent main = new Intent(this, MainActivity.class);
        main.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        main.putExtra("crewcheckWakeAckKey", wakeKey);
        startActivity(main);
        finish();
    }

    @Override
    public void onBackPressed() {
        // A dismiss action must be explicit so the safety fallback is cancelled only
        // after the crew member confirms they are awake.
    }

    @Override
    protected void onDestroy() {
        stopAlarmSound();
        super.onDestroy();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
