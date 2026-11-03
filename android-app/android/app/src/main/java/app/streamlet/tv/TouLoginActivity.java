package app.streamlet.tv;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.util.Map;

/**
 * ICI TOU.TV sign-in. The person signs in on the real site (desktop version) inside this window, with their own account.
 * Nothing is typed into Streamlet. While the site runs, this notes which Radio-Canada calls it makes (names only, never secrets)
 * and keeps the session token it uses, privately on the device, so Streamlet can ask for the same video links the site does.
 */
public class TouLoginActivity extends Activity {
    static final String PREFS = "streamlet_tou";
    static final String UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

    static String redactUrl(String u) {
        try {
            Uri uri = Uri.parse(u);
            StringBuilder sb = new StringBuilder(uri.getHost() + uri.getPath());
            String sep = "?";
            for (String k : uri.getQueryParameterNames()) {
                String v = uri.getQueryParameter(k); if (v == null) v = "";
                sb.append(sep).append(k).append('=').append(v.length() > 30 ? "<" + v.length() + " chars>" : v); sep = "&";
            }
            return sb.toString();
        } catch (Exception e) { return "?"; }
    }

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        LinearLayout root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setBackgroundColor(Color.BLACK);
        LinearLayout bar = new LinearLayout(this); bar.setOrientation(LinearLayout.HORIZONTAL); bar.setGravity(Gravity.CENTER_VERTICAL); bar.setBackgroundColor(Color.parseColor("#111111"));
        bar.setPadding(24, 16, 24, 16);
        TextView t = new TextView(this); t.setText("ICI TOU.TV · sign in, then press Done"); t.setTextColor(Color.WHITE); t.setTextSize(14);
        bar.addView(t, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        Button done = new Button(this); done.setText("Done"); done.setOnClickListener(v -> finish());
        bar.addView(done);
        root.addView(bar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        WebView wv = new WebView(this);
        WebSettings ws = wv.getSettings();
        ws.setJavaScriptEnabled(true); ws.setDomStorageEnabled(true); ws.setUserAgentString(UA);
        ws.setMediaPlaybackRequiresUserGesture(false); ws.setLoadWithOverviewMode(true); ws.setUseWideViewPort(true);
        ws.setSupportZoom(true); ws.setBuiltInZoomControls(true); ws.setDisplayZoomControls(false);
        CookieManager cm = CookieManager.getInstance(); cm.setAcceptCookie(true); cm.setAcceptThirdPartyCookies(wv, true);
        final SharedPreferences sp = getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        wv.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest r) {
                try {
                    String url = r.getUrl().toString(), host = r.getUrl().getHost();
                    if (host != null && (host.endsWith("radio-canada.ca") || host.endsWith("tou.tv")) && !url.matches(".*\\.(png|jpg|jpeg|webp|svg|css|woff2?|ico|js)(\\?.*)?$")) {
                        Map<String, String> h = r.getRequestHeaders();
                        StringBuilder names = new StringBuilder();
                        for (Map.Entry<String, String> e : h.entrySet()) {
                            String k = e.getKey(), lk = k.toLowerCase();
                            if (lk.equals("authorization") && e.getValue() != null) {
                                names.append(k).append("(").append(e.getValue().length()).append(" chars) ");
                                if (host.endsWith("radio-canada.ca")) sp.edit().putString("auth", e.getValue()).putLong("authT", System.currentTimeMillis()).apply();
                            } else if (lk.startsWith("x-") || lk.equals("content-type")) names.append(k).append(' ');
                        }
                        if (url.contains("/media/validation/")) sp.edit().putString("lastValidation", url).putLong("valT", System.currentTimeMillis()).apply();
                        AppLog.add("tou", r.getMethod() + " " + redactUrl(url) + (names.length() > 0 ? "  [" + names.toString().trim() + "]" : ""));
                    }
                } catch (Exception ignored) { }
                return null;
            }
        });
        root.addView(wv, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        setContentView(root);
        wv.loadUrl("https://ici.tou.tv/");
    }

    @Override
    protected void onPause() { super.onPause(); try { CookieManager.getInstance().flush(); } catch (Exception ignored) { } }
}
