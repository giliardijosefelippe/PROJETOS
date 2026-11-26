package com.giliardi.dispertador;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Handles the Tomei / Adiar / Pular buttons of the alarm notification. */
public class AlarmActionReceiver extends BroadcastReceiver {
    public static final String EXTRA_ACTION = "dispertador_action";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getStringExtra(EXTRA_ACTION);
        if (action != null) AlarmActions.handle(context, action, null);
    }
}
