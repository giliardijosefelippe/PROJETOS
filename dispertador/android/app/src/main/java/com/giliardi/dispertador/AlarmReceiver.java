package com.giliardi.dispertador;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Receives the exact alarm and system events that require re-arming alarms (boot, time change). */
public class AlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent == null ? null : intent.getAction();
        if (action == null) return;
        // fireDue also re-arms the next alarm and rings anything overdue (e.g. alarm missed while the phone was off).
        AlarmScheduler.fireDue(context);
    }
}
