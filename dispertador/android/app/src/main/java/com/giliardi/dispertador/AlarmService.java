package com.giliardi.dispertador;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Foreground service that rings the alarm: looping sound on the ALARM stream at max volume,
 * repeating vibration, wake lock and a full-screen-intent notification. It keeps ringing until
 * the user acts or the ring timeout elapses (then it re-arms the alarm to ring again).
 */
public class AlarmService extends Service {
    private static final String TAG = "DispertadorAlarm";
    public static final String CHANNEL_ID = "dispertador_alarm";
    public static final String CHANNEL_MISSED_ID = "dispertador_missed";
    private static final int NOTIF_ID = 4201;
    private static final int NOTIF_MISSED_ID = 4202;
    private static final String ACT_RING = "com.giliardi.dispertador.RING";
    private static final String ACT_REFRESH = "com.giliardi.dispertador.REFRESH";

    private final Handler handler = new Handler(Looper.getMainLooper());
    private MediaPlayer player;
    private PowerManager.WakeLock wakeLock;
    private AudioManager audio;
    private AudioFocusRequest focusRequest;
    private int originalVolume = -1;
    private boolean ringing = false;
    private final Runnable timeout = this::onIgnored;

    public static void start(Context c) {
        Intent i = new Intent(c, AlarmService.class).setAction(ACT_RING);
        ContextCompat.startForegroundService(c, i);
    }

    /** Updates (or stops) the service after the active list changed. No-op when it is not running. */
    public static void refresh(Context c) {
        if (AlarmStore.getActive(c).isEmpty()) {
            c.stopService(new Intent(c, AlarmService.class));
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            nm.cancel(NOTIF_ID);
        } else {
            Intent i = new Intent(c, AlarmService.class).setAction(ACT_REFRESH);
            ContextCompat.startForegroundService(c, i);
        }
    }

    public static void ensureChannels(Context c) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        NotificationChannel ch = new NotificationChannel(CHANNEL_ID, "Alarme de medicamentos", NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("Alarme que toca na hora de tomar o remédio, com tela cheia.");
        ch.setSound(null, null);
        ch.enableVibration(false);
        ch.setBypassDnd(true);
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        ch.setShowBadge(false);
        nm.createNotificationChannel(ch);

        NotificationChannel missed = new NotificationChannel(CHANNEL_MISSED_ID, "Doses sem resposta", NotificationManager.IMPORTANCE_DEFAULT);
        missed.setDescription("Aviso quando um alarme foi ignorado.");
        nm.createNotificationChannel(missed);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        ensureChannels(this);
        List<JSONObject> active = AlarmStore.getActive(this);
        Notification n = buildNotification(active);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIF_ID, n);
        }
        if (active.isEmpty()) {
            stopRingingResources();
            stopForeground(true);
            stopSelf();
            return START_NOT_STICKY;
        }
        if (!ringing) {
            startRinging();
            tryLaunchActivity();
        } else {
            DispertadorAlarmPlugin.emitUpdated();
        }
        return START_STICKY;
    }

    private void tryLaunchActivity() {
        // Works on older Android versions or when the system allows it; otherwise the
        // full-screen-intent notification is what brings the alarm screen up.
        try {
            startActivity(activityIntent());
        } catch (Exception e) {
            Log.i(TAG, "Direct activity launch not allowed: " + e.getMessage());
        }
    }

    private Intent activityIntent() {
        return new Intent(this, AlarmActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_NO_USER_ACTION);
    }

    private PendingIntent actionPi(String action, int req) {
        Intent i = new Intent(this, AlarmActionReceiver.class).putExtra(AlarmActionReceiver.EXTRA_ACTION, action);
        i.setPackage(getPackageName());
        return PendingIntent.getBroadcast(this, req, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private Notification buildNotification(List<JSONObject> active) {
        PendingIntent screen = PendingIntent.getActivity(this, 10, activityIntent(), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        String title;
        String text;
        if (active.isEmpty()) {
            title = "Dispertador";
            text = "";
        } else if (active.size() == 1) {
            JSONObject e = active.get(0);
            title = "Hora do remédio: " + e.optString("name");
            text = e.optString("dose", "");
        } else {
            title = "Hora dos remédios (" + active.size() + ")";
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < active.size(); i++) {
                if (i > 0) sb.append(", ");
                sb.append(active.get(i).optString("name"));
            }
            text = sb.toString();
        }
        boolean many = active.size() > 1;
        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_alarm)
                .setContentTitle(title)
                .setContentText(text)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setOngoing(true)
                .setAutoCancel(false)
                .setOnlyAlertOnce(true)
                .setColor(0xFF0F766E)
                .setContentIntent(screen)
                .setFullScreenIntent(screen, true)
                .addAction(0, many ? "Tomei todos" : "Tomei", actionPi(AlarmActions.ACTION_TAKEN, 21))
                .addAction(0, "Adiar", actionPi(AlarmActions.ACTION_SNOOZED, 22))
                .addAction(0, many ? "Pular todos" : "Pular", actionPi(AlarmActions.ACTION_SKIPPED, 23))
                .build();
    }

    private void startRinging() {
        ringing = true;
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        int timeoutSec = AlarmStore.ringTimeoutSec(this);
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "dispertador:alarm");
        wakeLock.acquire((timeoutSec + 30) * 1000L);

        audio = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        AudioAttributes attrs = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
        try {
            if (AlarmStore.maxVolume(this)) {
                originalVolume = audio.getStreamVolume(AudioManager.STREAM_ALARM);
                audio.setStreamVolume(AudioManager.STREAM_ALARM, audio.getStreamMaxVolume(AudioManager.STREAM_ALARM), 0);
            }
        } catch (SecurityException e) {
            Log.w(TAG, "Could not raise alarm volume: " + e.getMessage());
        }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE)
                        .setAudioAttributes(attrs)
                        .setOnAudioFocusChangeListener(change -> { })
                        .build();
                audio.requestAudioFocus(focusRequest);
            }
        } catch (Exception e) {
            Log.w(TAG, "Audio focus: " + e.getMessage());
        }

        try {
            player = MediaPlayer.create(this, R.raw.alarm_loop, attrs, audio.generateAudioSessionId());
            if (player != null) {
                player.setLooping(true);
                player.setVolume(1f, 1f);
                player.start();
            }
        } catch (Exception e) {
            Log.e(TAG, "Could not play alarm sound: " + e.getMessage());
        }

        if (AlarmStore.vibrate(this)) {
            Vibrator vib = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (vib != null && vib.hasVibrator()) {
                long[] pattern = {0, 700, 250, 700, 250, 700, 900};
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    VibrationEffect fx = VibrationEffect.createWaveform(pattern, 0);
                    vib.vibrate(fx, attrs);
                } else {
                    vib.vibrate(pattern, 0, attrs);
                }
            }
        }
        handler.postDelayed(timeout, timeoutSec * 1000L);
        DispertadorAlarmPlugin.emitUpdated();
    }

    private void stopRingingResources() {
        ringing = false;
        handler.removeCallbacks(timeout);
        try {
            if (player != null) {
                player.stop();
                player.release();
            }
        } catch (Exception ignored) {
        }
        player = null;
        Vibrator vib = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        if (vib != null) vib.cancel();
        if (audio != null) {
            try {
                if (originalVolume >= 0) audio.setStreamVolume(AudioManager.STREAM_ALARM, originalVolume, 0);
            } catch (SecurityException ignored) {
            }
            originalVolume = -1;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && focusRequest != null) {
                audio.abandonAudioFocusRequest(focusRequest);
            }
            focusRequest = null;
        }
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        wakeLock = null;
    }

    /** Nobody answered: stop ringing, re-arm the alarm (insistence) up to maxRepeats times. */
    private void onIgnored() {
        Context c = getApplicationContext();
        long now = System.currentTimeMillis();
        int repeatMin = AlarmStore.repeatMinutes(c);
        int maxRepeats = AlarmStore.maxRepeats(c);
        StringBuilder names = new StringBuilder();
        boolean willRepeat = false;
        synchronized (AlarmStore.LOCK) {
            List<JSONObject> active = AlarmStore.getActive(c);
            List<JSONObject> schedule = AlarmStore.getSchedule(c);
            List<JSONObject> rearmed = new ArrayList<>();
            for (JSONObject e : active) {
                if (names.length() > 0) names.append(", ");
                names.append(e.optString("name"));
                int repeat = e.optInt("repeat", 0) + 1;
                if (repeat <= maxRepeats) {
                    try {
                        JSONObject copy = new JSONObject(e.toString());
                        copy.put("repeat", repeat);
                        copy.put("at", now + repeatMin * 60_000L);
                        rearmed.add(copy);
                        willRepeat = true;
                    } catch (JSONException ignored) {
                    }
                }
            }
            List<JSONObject> merged = new ArrayList<>();
            for (JSONObject s : schedule) {
                boolean replaced = false;
                for (JSONObject n : rearmed) if (n.optString("key").equals(s.optString("key"))) replaced = true;
                if (!replaced) merged.add(s);
            }
            merged.addAll(rearmed);
            AlarmStore.setSchedule(c, merged);
            AlarmStore.setActive(c, new ArrayList<>());
        }
        AlarmScheduler.scheduleNext(c);
        stopRingingResources();
        stopForeground(true);
        postMissedNotification(names.toString(), willRepeat, repeatMin);
        c.sendBroadcast(new Intent(AlarmActions.BROADCAST_UPDATED).setPackage(c.getPackageName()));
        DispertadorAlarmPlugin.emitUpdated();
        stopSelf();
    }

    private void postMissedNotification(String names, boolean willRepeat, int repeatMin) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        PendingIntent open = PendingIntent.getActivity(this, 11, new Intent(this, MainActivity.class), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        String text = willRepeat ? "Vou tocar de novo em " + repeatMin + " min. Abra o app para registrar." : "Abra o app para registrar a dose.";
        Notification n = new NotificationCompat.Builder(this, CHANNEL_MISSED_ID)
                .setSmallIcon(R.drawable.ic_stat_alarm)
                .setContentTitle("Você não respondeu: " + names)
                .setContentText(text)
                .setAutoCancel(true)
                .setContentIntent(open)
                .build();
        nm.notify(NOTIF_MISSED_ID, n);
    }

    @Override
    public void onDestroy() {
        stopRingingResources();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
