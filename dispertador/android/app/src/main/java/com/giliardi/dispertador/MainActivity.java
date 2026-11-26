package com.giliardi.dispertador;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DispertadorAlarmPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
