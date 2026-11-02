package app.streamlet.tv;

import android.os.Bundle;
import android.view.View;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
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
        } catch (Exception ignored) { }
    }
}
