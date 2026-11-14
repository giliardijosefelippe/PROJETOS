package br.lunardeli.conferenciaarmadura;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PdfOpenPlugin.class);
        super.onCreate(savedInstanceState);
        PdfOpenPlugin.handleIntent(this, getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        PdfOpenPlugin.handleIntent(this, intent);
    }
}
