package app.streamlet.tv;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    /** pure black behind everything (setting "Pure black background"): no grey flash when the app comes back from the system screensaver */
    static void applyBg(Activity a, boolean on) {
        try {
            a.getWindow().setBackgroundDrawable(new ColorDrawable(Color.BLACK));
            if (a instanceof BridgeActivity) { WebView wv = ((BridgeActivity) a).getBridge().getWebView(); wv.setBackgroundColor(Color.BLACK); wv.invalidate(); }
        } catch (Exception ignored) { }
    }
    /** setting "Screensaver" off = keep the screen awake while the app is open */
    private static android.os.PowerManager.WakeLock awakeLock;
    static void applyAwake(Activity a, boolean awake) {
        try { if (awake) a.getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON); else a.getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON); } catch (Exception ignored) { }
        try { if (a instanceof BridgeActivity) ((BridgeActivity) a).getBridge().getWebView().setKeepScreenOn(awake); } catch (Exception ignored) { }
        try {                                              // belt and braces: some TV builds ignore the window flag, so also hold a screen wake lock
            if (awake) {
                if (awakeLock == null) awakeLock = ((android.os.PowerManager) a.getSystemService(Context.POWER_SERVICE)).newWakeLock(android.os.PowerManager.SCREEN_BRIGHT_WAKE_LOCK, "streamlet:awake");
                if (!awakeLock.isHeld()) awakeLock.acquire();
            } else if (awakeLock != null && awakeLock.isHeld()) awakeLock.release();
            AppLog.add("awake", awake ? "screen kept on" : "screensaver allowed");
        } catch (Exception ignored) { }
    }
    @Override
    public void onPause() { super.onPause(); try { if (awakeLock != null && awakeLock.isHeld()) awakeLock.release(); } catch (Exception ignored) { } }
    private boolean blackBg() { return true; }
    private boolean keepAwake() { return getSharedPreferences("streamlet_player", Context.MODE_PRIVATE).getBoolean("keepawake", false); }

    @Override
    public void onResume() { super.onResume(); applyBg(this, true); applyAwake(this, keepAwake()); }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) { super.onWindowFocusChanged(hasFocus); if (hasFocus) { applyBg(this, true); applyAwake(this, keepAwake()); } }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        AppLog.init(getApplicationContext());
        try {                                                  // the removed ICI TOU.TV sign-in: wipe any session it saved on this device
            SharedPreferences tou = getSharedPreferences("streamlet_tou", Context.MODE_PRIVATE);
            if (!tou.getAll().isEmpty()) { tou.edit().clear().apply(); android.webkit.CookieManager.getInstance().removeAllCookies(null); }
        } catch (Exception ignored) { }
        registerPlugin(ExoPlayerPlugin.class);
        super.onCreate(savedInstanceState);
        try {
            WebView wv = getBridge().getWebView();
            WebSettings ws = wv.getSettings();
            ws.setSupportZoom(false);
            ws.setBuiltInZoomControls(false);
            ws.setTextZoom(100);                               // ignore the system font size, the page sizes everything itself
            ws.setMediaPlaybackRequiresUserGesture(false);     // lets the start-up sound play
            wv.setOverScrollMode(View.OVER_SCROLL_NEVER);
            wv.setHorizontalScrollBarEnabled(false);
            wv.setVerticalScrollBarEnabled(false);
            wv.setLayerType(View.LAYER_TYPE_HARDWARE, null);
            applyBg(this, true); applyAwake(this, keepAwake());
        } catch (Exception ignored) { }
    }
}
