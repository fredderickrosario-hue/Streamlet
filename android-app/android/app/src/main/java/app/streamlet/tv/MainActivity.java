package app.streamlet.tv;

import android.app.Activity;
import android.content.Context;
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
            a.getWindow().setBackgroundDrawable(new ColorDrawable(on ? Color.BLACK : 0xFF0B0B13));
            if (a instanceof BridgeActivity) { WebView wv = ((BridgeActivity) a).getBridge().getWebView(); wv.setBackgroundColor(on ? Color.BLACK : Color.TRANSPARENT); wv.invalidate(); }
        } catch (Exception ignored) { }
    }
    private boolean blackBg() { return getSharedPreferences("streamlet_player", Context.MODE_PRIVATE).getBoolean("blackbg", true); }

    @Override
    public void onResume() { super.onResume(); applyBg(this, blackBg()); }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) { super.onWindowFocusChanged(hasFocus); if (hasFocus) applyBg(this, blackBg()); }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        AppLog.init(getApplicationContext());
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
            applyBg(this, blackBg());
        } catch (Exception ignored) { }
    }
}
