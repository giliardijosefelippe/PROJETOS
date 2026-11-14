package br.lunardeli.conferenciaarmadura;

import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.OpenableColumns;
import android.webkit.MimeTypeMap;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.Locale;

/**
 * Receives ACTION_VIEW / ACTION_SEND PDF intents (Abrir com / WhatsApp)
 * and exposes the file to the WebView via cache + pdfOpen event.
 */
@CapacitorPlugin(name = "PdfOpen")
public class PdfOpenPlugin extends Plugin {

    private static final String EVENT_PDF_OPEN = "pdfOpen";
    private static JSObject pendingPayload;
    private static PdfOpenPlugin instance;

    @Override
    public void load() {
        instance = this;
        if (pendingPayload != null) {
            notifyListeners(EVENT_PDF_OPEN, pendingPayload, true);
        }
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) instance = null;
        super.handleOnDestroy();
    }

    @PluginMethod
    public void consumePending(PluginCall call) {
        JSObject payload = pendingPayload;
        pendingPayload = null;
        if (payload == null) {
            call.resolve();
            return;
        }
        call.resolve(payload);
    }

    /** Called from MainActivity for cold start and onNewIntent. */
    public static void handleIntent(Context context, Intent intent) {
        if (context == null || intent == null) return;
        Uri uri = extractPdfUri(intent);
        if (uri == null) return;
        try {
            JSObject payload = copyUriToCache(context, uri, guessDisplayName(context, uri, intent));
            pendingPayload = payload;
            if (instance != null) {
                instance.notifyListeners(EVENT_PDF_OPEN, payload, true);
            }
        } catch (Exception e) {
            JSObject err = new JSObject();
            err.put("error", e.getMessage() != null ? e.getMessage() : "falha ao abrir PDF");
            pendingPayload = err;
            if (instance != null) {
                instance.notifyListeners(EVENT_PDF_OPEN, err, true);
            }
        }
    }

    private static Uri extractPdfUri(Intent intent) {
        String action = intent.getAction();
        if (Intent.ACTION_VIEW.equals(action)) {
            return intent.getData();
        }
        if (Intent.ACTION_SEND.equals(action)) {
            Uri stream = null;
            if (Build.VERSION.SDK_INT >= 33) {
                stream = intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri.class);
            } else {
                stream = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            }
            if (stream != null) return stream;
        }
        if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            // Take first URI only
            if (Build.VERSION.SDK_INT >= 33) {
                java.util.ArrayList<Uri> list = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri.class);
                if (list != null && !list.isEmpty()) return list.get(0);
            } else {
                java.util.ArrayList<Uri> list = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
                if (list != null && !list.isEmpty()) return list.get(0);
            }
        }
        return null;
    }

    private static String guessDisplayName(Context context, Uri uri, Intent intent) {
        String name = null;
        try {
            if (ContentResolver.SCHEME_CONTENT.equals(uri.getScheme())) {
                Cursor c = context.getContentResolver().query(uri, null, null, null, null);
                if (c != null) {
                    try {
                        if (c.moveToFirst()) {
                            int idx = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                            if (idx >= 0) name = c.getString(idx);
                        }
                    } finally {
                        c.close();
                    }
                }
            }
        } catch (Exception ignored) {}
        if (name == null || name.trim().isEmpty()) {
            name = uri.getLastPathSegment();
        }
        if (name == null || name.trim().isEmpty()) name = "recebido.pdf";
        if (!name.toLowerCase(Locale.US).endsWith(".pdf")) {
            String mime = intent.getType();
            if (mime == null) {
                mime = context.getContentResolver().getType(uri);
            }
            String ext = mime != null ? MimeTypeMap.getSingleton().getExtensionFromMimeType(mime) : null;
            if ("pdf".equalsIgnoreCase(ext) || (mime != null && mime.contains("pdf"))) {
                name = name + ".pdf";
            }
        }
        return name.replaceAll("[\\\\/]+", "_");
    }

    private static JSObject copyUriToCache(Context context, Uri uri, String displayName) throws Exception {
        File dir = new File(context.getCacheDir(), "incoming");
        if (!dir.exists() && !dir.mkdirs()) {
            throw new Exception("Não foi possível criar pasta cache");
        }
        String safe = displayName.replaceAll("[^a-zA-Z0-9._\\- À-ÿ]", "_");
        if (safe.length() > 80) safe = safe.substring(safe.length() - 80);
        File out = new File(dir, System.currentTimeMillis() + "_" + safe);

        ContentResolver cr = context.getContentResolver();
        try (InputStream in = cr.openInputStream(uri);
             FileOutputStream fos = new FileOutputStream(out)) {
            if (in == null) throw new Exception("Não foi possível ler o PDF compartilhado");
            byte[] buf = new byte[64 * 1024];
            int n;
            long total = 0;
            long max = 80L * 1024L * 1024L; // 80 MB
            while ((n = in.read(buf)) >= 0) {
                total += n;
                if (total > max) throw new Exception("PDF grande demais (limite 80 MB)");
                fos.write(buf, 0, n);
            }
        }

        JSObject payload = new JSObject();
        payload.put("name", displayName);
        payload.put("cachePath", "incoming/" + out.getName());
        payload.put("bytes", out.length());
        return payload;
    }
}
