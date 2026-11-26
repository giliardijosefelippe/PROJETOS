package com.giliardi.dispertador;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/** Schedules the single next exact alarm (AlarmManager.setAlarmClock) from the stored schedule. */
public final class AlarmScheduler {
    public static final String ACTION_FIRE = "com.giliardi.dispertador.FIRE";
    private static final int REQ_FIRE = 1001;
    private static final int REQ_SHOW = 1002;
    /** Entries overdue by more than this are dropped from the schedule. */
    public static final long STALE_MS = 30L * 60 * 1000;
    /** Entries due within this window are fired together. */
    public static final long GROUP_MS = 45L * 1000;

    private AlarmScheduler() {}

    private static PendingIntent firePendingIntent(Context c) {
        Intent i = new Intent(c, AlarmReceiver.class).setAction(ACTION_FIRE);
        return PendingIntent.getBroadcast(c, REQ_FIRE, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Returns the epoch ms of the scheduled alarm, or -1 when nothing is scheduled. */
    public static long scheduleNext(Context ctx) {
        Context c = ctx.getApplicationContext();
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        long now = System.currentTimeMillis();
        long next = -1;
        synchronized (AlarmStore.LOCK) {
            List<JSONObject> kept = new ArrayList<>();
            for (JSONObject e : AlarmStore.getSchedule(c)) {
                long at = e.optLong("at", 0);
                if (at < now - STALE_MS) continue;
                kept.add(e);
                if (next < 0 || at < next) next = at;
            }
            AlarmStore.setSchedule(c, kept);
        }
        PendingIntent fire = firePendingIntent(c);
        if (next < 0) {
            am.cancel(fire);
            return -1;
        }
        long triggerAt = Math.max(next, now + 1000);
        Intent show = new Intent(c, MainActivity.class);
        PendingIntent showPi = PendingIntent.getActivity(c, REQ_SHOW, show, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        try {
            am.setAlarmClock(new AlarmManager.AlarmClockInfo(triggerAt, showPi), fire);
        } catch (SecurityException e) {
            // Exact alarm permission revoked: fall back to an inexact (may be late) alarm.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, fire);
            } else {
                am.set(AlarmManager.RTC_WAKEUP, triggerAt, fire);
            }
        }
        return triggerAt;
    }

    public static boolean canScheduleExact(Context c) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true;
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        return am.canScheduleExactAlarms();
    }

    /**
     * Move every schedule entry due now (within the group window, or slightly overdue) into the
     * "active" list and start the ringing service. Safe to call repeatedly.
     */
    public static void fireDue(Context ctx) {
        Context c = ctx.getApplicationContext();
        long now = System.currentTimeMillis();
        boolean ring = false;
        synchronized (AlarmStore.LOCK) {
            List<JSONObject> schedule = AlarmStore.getSchedule(c);
            List<JSONObject> remaining = new ArrayList<>();
            List<JSONObject> active = AlarmStore.getActive(c);
            if (!active.isEmpty()) ring = true;
            for (JSONObject e : schedule) {
                long at = e.optLong("at", 0);
                if (at <= now + GROUP_MS && at >= now - STALE_MS) {
                    String key = e.optString("key");
                    boolean dup = false;
                    for (JSONObject a : active) if (key.equals(a.optString("key"))) dup = true;
                    if (!dup) active.add(e);
                    ring = true;
                } else if (at >= now - STALE_MS) {
                    remaining.add(e);
                }
            }
            AlarmStore.setSchedule(c, remaining);
            AlarmStore.setActive(c, active);
        }
        scheduleNext(c);
        if (ring) AlarmService.start(c);
    }
}
