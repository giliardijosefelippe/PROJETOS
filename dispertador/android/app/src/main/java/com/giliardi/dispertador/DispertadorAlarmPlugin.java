package com.giliardi.dispertador;

import android.Manifest;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Capacitor bridge: the web layer hands over the alarm schedule, native code does the ringing. */
@CapacitorPlugin(
        name = "DispertadorAlarm",
        permissions = {@Permission(strings = {Manifest.permission.POST_NOTIFICATIONS}, alias = "notifications")})
public class DispertadorAlarmPlugin extends Plugin {
    private static volatile DispertadorAlarmPlugin instance;

    @Override
    public void load() {
        instance = this;
        AlarmService.ensureChannels(getContext());
    }

    static void emitUpdated() {
        DispertadorAlarmPlugin p = instance;
        if (p != null) {
            try {
                p.notifyListeners("alarmEvent", new JSObject());
            } catch (Exception ignored) {
            }
        }
    }

    @PluginMethod
    public void sync(PluginCall call) {
        Context c = getContext();
        JSArray incoming = call.getArray("alarms");
        JSObject settings = call.getObject("settings");
        if (settings != null) AlarmStore.setSettings(c, settings);
        long now = System.currentTimeMillis();
        boolean activeWasRunning;
        synchronized (AlarmStore.LOCK) {
            Set<String> resolved = AlarmStore.pendingResolvedKeys(c);
            List<JSONObject> existing = AlarmStore.getSchedule(c);
            List<JSONObject> next = new ArrayList<>();
            Set<String> incomingKeys = new HashSet<>();
            try {
                for (int i = 0; incoming != null && i < incoming.length(); i++) {
                    JSONObject a = incoming.getJSONObject(i);
                    String key = a.optString("key");
                    if (key.isEmpty() || resolved.contains(key)) continue;
                    incomingKeys.add(key);
                    JSONObject keep = null;
                    for (JSONObject e : existing) {
                        if (key.equals(e.optString("key")) && e.optLong("at") > now
                                && (e.optInt("repeat", 0) > 0 || e.optInt("snoozes", 0) > 0)) {
                            keep = e;
                        }
                    }
                    if (keep != null) {
                        next.add(keep);
                        continue;
                    }
                    long at = a.optLong("at", 0);
                    if (at < now - AlarmScheduler.STALE_MS) continue;
                    JSONObject e = new JSONObject();
                    e.put("key", key);
                    e.put("name", a.optString("name"));
                    e.put("dose", a.optString("dose"));
                    e.put("notes", a.optString("notes"));
                    e.put("at", at);
                    e.put("dueAt", a.optLong("dueAt", at));
                    e.put("repeat", 0);
                    e.put("snoozes", 0);
                    next.add(e);
                }
            } catch (JSONException ex) {
                call.reject("Alarmes inválidos: " + ex.getMessage());
                return;
            }
            AlarmStore.setSchedule(c, next);

            List<JSONObject> active = AlarmStore.getActive(c);
            activeWasRunning = !active.isEmpty();
            List<JSONObject> stillActive = new ArrayList<>();
            for (JSONObject a : active) {
                String key = a.optString("key");
                if (key.startsWith("teste@") || incomingKeys.contains(key)) stillActive.add(a);
            }
            AlarmStore.setActive(c, stillActive);
        }
        long scheduled = AlarmScheduler.scheduleNext(c);
        if (activeWasRunning) AlarmService.refresh(c);
        JSObject out = new JSObject();
        out.put("nextAlarmAt", scheduled);
        out.put("scheduled", AlarmStore.getSchedule(c).size());
        call.resolve(out);
    }

    @PluginMethod
    public void consumeEvents(PluginCall call) {
        JSObject out = new JSObject();
        JSONArray events = AlarmStore.takeEvents(getContext());
        out.put("events", new JSArray(toList(events)));
        call.resolve(out);
    }

    private static List<Object> toList(JSONArray arr) {
        List<Object> list = new ArrayList<>();
        for (int i = 0; i < arr.length(); i++) list.add(arr.opt(i));
        return list;
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        Context c = getContext();
        JSObject out = new JSObject();
        out.put("sdk", Build.VERSION.SDK_INT);
        out.put("manufacturer", Build.MANUFACTURER);
        out.put("notifications", NotificationManagerCompat.from(c).areNotificationsEnabled());
        out.put("exactAlarm", AlarmScheduler.canScheduleExact(c));
        boolean fsi = true;
        if (Build.VERSION.SDK_INT >= 34) {
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            fsi = nm.canUseFullScreenIntent();
        }
        out.put("fullScreen", fsi);
        PowerManager pm = (PowerManager) c.getSystemService(Context.POWER_SERVICE);
        out.put("batteryUnrestricted", pm.isIgnoringBatteryOptimizations(c.getPackageName()));
        out.put("scheduled", AlarmStore.getSchedule(c).size());
        call.resolve(out);
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        String type = call.getString("type", "app");
        Context c = getContext();
        String pkg = c.getPackageName();
        Intent intent;
        Uri uri = Uri.parse("package:" + pkg);
        switch (type) {
            case "exactAlarm":
                intent = Build.VERSION.SDK_INT >= 31 ? new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, uri) : new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, uri);
                break;
            case "fullScreen":
                intent = Build.VERSION.SDK_INT >= 34 ? new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, uri) : new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, uri);
                break;
            case "notifications":
                intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, pkg);
                break;
            case "battery":
                intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, uri);
                break;
            default:
                intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, uri);
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            c.startActivity(intent);
        } catch (Exception e) {
            try {
                c.startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            } catch (Exception e2) {
                call.reject("Não foi possível abrir as configurações.");
                return;
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED) {
            call.resolve();
            return;
        }
        requestPermissionForAlias("notifications", call, "notificationsCallback");
    }

    @PermissionCallback
    private void notificationsCallback(PluginCall call) {
        call.resolve();
    }

    /** Schedules a test alarm a few seconds ahead (lock the phone meanwhile to test the lock screen). */
    @PluginMethod
    public void testAlarm(PluginCall call) {
        Context c = getContext();
        int delay = call.getInt("delaySec", 8);
        long at = System.currentTimeMillis() + delay * 1000L;
        synchronized (AlarmStore.LOCK) {
            List<JSONObject> schedule = AlarmStore.getSchedule(c);
            try {
                JSONObject e = new JSONObject();
                e.put("key", "teste@" + at);
                e.put("name", "Alarme de teste");
                e.put("dose", "Está tudo funcionando");
                e.put("notes", "Toque em Tomei, Adiar ou Pular.");
                e.put("at", at);
                e.put("dueAt", at);
                e.put("repeat", 0);
                e.put("snoozes", 0);
                schedule.add(e);
            } catch (JSONException ignored) {
            }
            AlarmStore.setSchedule(c, schedule);
        }
        AlarmScheduler.scheduleNext(c);
        call.resolve();
    }
}
