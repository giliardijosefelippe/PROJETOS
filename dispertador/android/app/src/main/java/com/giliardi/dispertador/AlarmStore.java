package com.giliardi.dispertador;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Persistent store (SharedPreferences) shared by the Capacitor plugin, the alarm receiver,
 * the foreground service and the alarm activity. All access is synchronized on {@link #LOCK}.
 *
 * Schedule entries: {key, name, dose, notes, at, dueAt, repeat, snoozes}
 * Events: {key, action: taken|skipped|snoozed, ts, until?}
 */
public final class AlarmStore {
    public static final Object LOCK = new Object();
    private static final String PREFS = "dispertador_alarms";
    private static final String K_SCHEDULE = "schedule";
    private static final String K_ACTIVE = "active";
    private static final String K_EVENTS = "events";
    private static final String K_SETTINGS = "settings";

    private AlarmStore() {}

    private static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static List<JSONObject> readList(Context c, String key) {
        List<JSONObject> out = new ArrayList<>();
        String raw = prefs(c).getString(key, "[]");
        try {
            JSONArray arr = new JSONArray(raw);
            for (int i = 0; i < arr.length(); i++) out.add(arr.getJSONObject(i));
        } catch (JSONException ignored) {
        }
        return out;
    }

    private static void writeList(Context c, String key, List<JSONObject> list) {
        JSONArray arr = new JSONArray();
        for (JSONObject o : list) arr.put(o);
        prefs(c).edit().putString(key, arr.toString()).apply();
    }

    public static List<JSONObject> getSchedule(Context c) {
        synchronized (LOCK) {
            return readList(c, K_SCHEDULE);
        }
    }

    public static void setSchedule(Context c, List<JSONObject> list) {
        synchronized (LOCK) {
            writeList(c, K_SCHEDULE, list);
        }
    }

    public static List<JSONObject> getActive(Context c) {
        synchronized (LOCK) {
            return readList(c, K_ACTIVE);
        }
    }

    public static void setActive(Context c, List<JSONObject> list) {
        synchronized (LOCK) {
            writeList(c, K_ACTIVE, list);
        }
    }

    public static void addEvent(Context c, String key, String action, long ts, long until) {
        synchronized (LOCK) {
            List<JSONObject> events = readList(c, K_EVENTS);
            try {
                JSONObject e = new JSONObject();
                e.put("key", key);
                e.put("action", action);
                e.put("ts", ts);
                if (until > 0) e.put("until", until);
                events.add(e);
            } catch (JSONException ignored) {
            }
            writeList(c, K_EVENTS, events);
        }
    }

    public static JSONArray takeEvents(Context c) {
        synchronized (LOCK) {
            String raw = prefs(c).getString(K_EVENTS, "[]");
            prefs(c).edit().putString(K_EVENTS, "[]").apply();
            try {
                return new JSONArray(raw);
            } catch (JSONException e) {
                return new JSONArray();
            }
        }
    }

    /** Keys already resolved natively (taken/skipped) but not yet consumed by the web layer. */
    public static Set<String> pendingResolvedKeys(Context c) {
        synchronized (LOCK) {
            Set<String> keys = new HashSet<>();
            for (JSONObject e : readList(c, K_EVENTS)) {
                String action = e.optString("action");
                if ("taken".equals(action) || "skipped".equals(action)) keys.add(e.optString("key"));
            }
            return keys;
        }
    }

    public static void setSettings(Context c, JSONObject settings) {
        synchronized (LOCK) {
            prefs(c).edit().putString(K_SETTINGS, settings.toString()).apply();
        }
    }

    private static JSONObject settings(Context c) {
        try {
            return new JSONObject(prefs(c).getString(K_SETTINGS, "{}"));
        } catch (JSONException e) {
            return new JSONObject();
        }
    }

    public static int snoozeMinutes(Context c) {
        return Math.max(1, settings(c).optInt("snoozeMinutes", 10));
    }

    public static int ringTimeoutSec(Context c) {
        return Math.max(20, settings(c).optInt("ringTimeoutSec", 120));
    }

    public static int repeatMinutes(Context c) {
        return Math.max(1, settings(c).optInt("repeatMinutes", 5));
    }

    public static int maxRepeats(Context c) {
        return Math.max(0, settings(c).optInt("maxRepeats", 5));
    }

    public static boolean maxVolume(Context c) {
        return settings(c).optBoolean("maxVolume", true);
    }

    public static boolean vibrate(Context c) {
        return settings(c).optBoolean("vibrate", true);
    }
}
