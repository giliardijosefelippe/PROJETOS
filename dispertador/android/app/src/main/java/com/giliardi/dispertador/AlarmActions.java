package com.giliardi.dispertador;

import android.content.Context;
import android.content.Intent;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/** User decisions on ringing doses: taken, skipped, snoozed. */
public final class AlarmActions {
    public static final String ACTION_TAKEN = "taken";
    public static final String ACTION_SKIPPED = "skipped";
    public static final String ACTION_SNOOZED = "snoozed";
    public static final String BROADCAST_UPDATED = "com.giliardi.dispertador.ALARM_UPDATED";

    private AlarmActions() {}

    /** @param keys dose keys to act on; null means every ringing dose. */
    public static void handle(Context ctx, String action, List<String> keys) {
        Context c = ctx.getApplicationContext();
        long now = System.currentTimeMillis();
        List<JSONObject> remaining = new ArrayList<>();
        List<JSONObject> snoozed = new ArrayList<>();
        synchronized (AlarmStore.LOCK) {
            List<JSONObject> active = AlarmStore.getActive(c);
            int snoozeMin = AlarmStore.snoozeMinutes(c);
            for (JSONObject e : active) {
                String key = e.optString("key");
                boolean selected = keys == null || keys.contains(key);
                if (!selected) {
                    remaining.add(e);
                    continue;
                }
                if (ACTION_SNOOZED.equals(action)) {
                    long until = now + snoozeMin * 60_000L;
                    try {
                        JSONObject copy = new JSONObject(e.toString());
                        copy.put("at", until);
                        copy.put("repeat", 0);
                        copy.put("snoozes", e.optInt("snoozes", 0) + 1);
                        snoozed.add(copy);
                    } catch (JSONException ignored) {
                    }
                    AlarmStore.addEvent(c, key, ACTION_SNOOZED, now, until);
                } else {
                    AlarmStore.addEvent(c, key, action, now, 0);
                }
            }
            AlarmStore.setActive(c, remaining);
            if (!snoozed.isEmpty()) {
                List<JSONObject> schedule = AlarmStore.getSchedule(c);
                List<JSONObject> merged = new ArrayList<>();
                for (JSONObject s : schedule) {
                    boolean replaced = false;
                    for (JSONObject n : snoozed) if (n.optString("key").equals(s.optString("key"))) replaced = true;
                    if (!replaced) merged.add(s);
                }
                merged.addAll(snoozed);
                AlarmStore.setSchedule(c, merged);
            }
        }
        AlarmScheduler.scheduleNext(c);
        AlarmService.refresh(c);
        c.sendBroadcast(new Intent(BROADCAST_UPDATED).setPackage(c.getPackageName()));
        DispertadorAlarmPlugin.emitUpdated();
    }
}
