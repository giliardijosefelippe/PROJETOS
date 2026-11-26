package com.giliardi.dispertador;

import android.app.Activity;
import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextClock;
import android.widget.TextView;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** Full-screen alarm UI shown over the lock screen: Tomei / Adiar / Pular. */
public class AlarmActivity extends Activity {
    private LinearLayout list;
    private TextView title;
    private Button snoozeBtn;
    private Button takeAllBtn;
    private final BroadcastReceiver updated = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            render();
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        buildUi();
        render();
    }

    @Override
    protected void onResume() {
        super.onResume();
        IntentFilter f = new IntentFilter(AlarmActions.BROADCAST_UPDATED);
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(updated, f, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(updated, f);
        }
        render();
    }

    @Override
    protected void onPause() {
        super.onPause();
        try {
            unregisterReceiver(updated);
        } catch (IllegalArgumentException ignored) {
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        render();
    }

    @Override
    public void onBackPressed() {
        // The alarm only stops when the user chooses Tomei / Adiar / Pular.
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    private Button button(String label, int color, int textColor) {
        Button b = new Button(this);
        b.setText(label);
        b.setAllCaps(true);
        b.setTextSize(20);
        b.setTypeface(Typeface.DEFAULT_BOLD);
        b.setTextColor(textColor);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(color);
        bg.setCornerRadius(dp(16));
        b.setBackground(bg);
        b.setMinHeight(dp(72));
        b.setMinimumHeight(dp(72));
        return b;
    }

    private LinearLayout.LayoutParams lp(int w, int h, int top) {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(w, h);
        p.topMargin = dp(top);
        return p;
    }

    private void buildUi() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.parseColor("#7f1d1d"));
        root.setPadding(dp(20), dp(36), dp(20), dp(20));

        TextClock clock = new TextClock(this);
        clock.setFormat24Hour("HH:mm");
        clock.setFormat12Hour("HH:mm");
        clock.setTextColor(Color.WHITE);
        clock.setTextSize(64);
        clock.setTypeface(Typeface.DEFAULT_BOLD);
        clock.setGravity(Gravity.CENTER);
        root.addView(clock, lp(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, 0));

        title = new TextView(this);
        title.setTextColor(Color.parseColor("#fecaca"));
        title.setTextSize(22);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setGravity(Gravity.CENTER);
        root.addView(title, lp(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, 4));

        ScrollView scroll = new ScrollView(this);
        list = new LinearLayout(this);
        list.setOrientation(LinearLayout.VERTICAL);
        scroll.addView(list);
        root.addView(scroll, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        takeAllBtn = button("Tomei todos", Color.parseColor("#16a34a"), Color.WHITE);
        takeAllBtn.setOnClickListener(v -> AlarmActions.handle(this, AlarmActions.ACTION_TAKEN, null));
        root.addView(takeAllBtn, lp(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, 12));

        snoozeBtn = button("Adiar", Color.parseColor("#f59e0b"), Color.parseColor("#1f1300"));
        snoozeBtn.setOnClickListener(v -> AlarmActions.handle(this, AlarmActions.ACTION_SNOOZED, null));
        root.addView(snoozeBtn, lp(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, 12));

        setContentView(root);
    }

    private void render() {
        List<JSONObject> active = AlarmStore.getActive(this);
        if (active.isEmpty()) {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            nm.cancel(4201);
            finish();
            return;
        }
        title.setText(active.size() == 1 ? "Hora do remédio" : "Hora dos remédios");
        snoozeBtn.setText("Adiar " + AlarmStore.snoozeMinutes(this) + " min");
        takeAllBtn.setVisibility(active.size() > 1 ? View.VISIBLE : View.GONE);
        list.removeAllViews();
        for (JSONObject e : active) {
            list.addView(row(e), lp(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, 12));
        }
    }

    private View row(JSONObject e) {
        final String key = e.optString("key");
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(16), dp(14), dp(16), dp(14));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.parseColor("#991b1b"));
        bg.setCornerRadius(dp(18));
        card.setBackground(bg);

        TextView name = new TextView(this);
        name.setText(e.optString("name"));
        name.setTextColor(Color.WHITE);
        name.setTextSize(28);
        name.setTypeface(Typeface.DEFAULT_BOLD);
        card.addView(name);

        String dose = e.optString("dose", "");
        if (!dose.isEmpty()) {
            TextView d = new TextView(this);
            d.setText(dose);
            d.setTextColor(Color.parseColor("#fee2e2"));
            d.setTextSize(22);
            card.addView(d);
        }
        String notes = e.optString("notes", "");
        if (!notes.isEmpty()) {
            TextView n = new TextView(this);
            n.setText(notes);
            n.setTextColor(Color.parseColor("#fecaca"));
            n.setTextSize(16);
            card.addView(n);
        }
        int snoozes = e.optInt("snoozes", 0);
        int repeat = e.optInt("repeat", 0);
        if (snoozes > 0 || repeat > 0) {
            TextView extra = new TextView(this);
            extra.setText(snoozes > 0 ? "Adiado " + snoozes + "x" : "Alarme repetido " + repeat + "x");
            extra.setTextColor(Color.parseColor("#fcd34d"));
            extra.setTextSize(14);
            card.addView(extra);
        }

        LinearLayout buttons = new LinearLayout(this);
        buttons.setOrientation(LinearLayout.HORIZONTAL);
        Button take = button("Tomei", Color.parseColor("#16a34a"), Color.WHITE);
        take.setOnClickListener(v -> AlarmActions.handle(this, AlarmActions.ACTION_TAKEN, Collections.singletonList(key)));
        Button skip = button("Pular", Color.parseColor("#e5e7eb"), Color.parseColor("#111827"));
        skip.setOnClickListener(v -> AlarmActions.handle(this, AlarmActions.ACTION_SKIPPED, Collections.singletonList(key)));
        LinearLayout.LayoutParams lpl = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        lpl.rightMargin = dp(6);
        LinearLayout.LayoutParams lpr = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        lpr.leftMargin = dp(6);
        buttons.addView(take, lpl);
        buttons.addView(skip, lpr);
        card.addView(buttons, lp(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, 12));
        return card;
    }
}
