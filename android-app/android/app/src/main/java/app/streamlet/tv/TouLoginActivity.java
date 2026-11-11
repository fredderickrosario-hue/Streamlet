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
    private WebView web; private boolean player = false; private View fullView = null; private android.webkit.WebChromeClient.CustomViewCallback fullCb = null; private LinearLayout rootView;
    /** player mode: TOU.TV's own web player, filling the screen, driven by the remote */
    static final String PLAYER_JS = "(function(){try{"
        + "if(!document.getElementById('__slst')){var st=document.createElement('style');st.id='__slst';st.textContent='video{position:fixed!important;left:0!important;top:0!important;width:100vw!important;height:100vh!important;z-index:2147483646!important;background:#000!important;object-fit:contain!important}html,body{background:#000!important;overflow:hidden!important}';(document.head||document.documentElement).appendChild(st);}"
        + "var v=document.querySelector('video');"
        + "if(!v){var b=document.querySelector('[data-testid*=play i],button[aria-label*=Regarder i],button[aria-label*=Lecture i],button[aria-label*=Play i],a[href*=\"/lecteur\"],.play-button');if(b&&!window.__slclk){window.__slclk=1;b.click();}}"
        + "else if(v.paused&&!window.__slstarted){window.__slstarted=1;v.play().catch(function(){});}"
        + "}catch(e){}})();";
    private void js(String code) { if (web != null) web.evaluateJavascript("(function(){try{var v=document.querySelector('video');if(!v)return;" + code + "}catch(e){}})();", null); }
    @Override
    public boolean dispatchKeyEvent(android.view.KeyEvent e) {
        if (!player || e.getAction() != android.view.KeyEvent.ACTION_DOWN) return super.dispatchKeyEvent(e);
        switch (e.getKeyCode()) {
            case android.view.KeyEvent.KEYCODE_DPAD_CENTER: case android.view.KeyEvent.KEYCODE_ENTER: case android.view.KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE: case android.view.KeyEvent.KEYCODE_SPACE:
                js("if(v.paused)v.play();else v.pause();"); return true;
            case android.view.KeyEvent.KEYCODE_DPAD_LEFT: case android.view.KeyEvent.KEYCODE_MEDIA_REWIND: js("v.currentTime=Math.max(0,v.currentTime-10);"); return true;
            case android.view.KeyEvent.KEYCODE_DPAD_RIGHT: case android.view.KeyEvent.KEYCODE_MEDIA_FAST_FORWARD: js("v.currentTime=v.currentTime+10;"); return true;
            case android.view.KeyEvent.KEYCODE_DPAD_UP: js("v.currentTime=v.currentTime+60;"); return true;
            case android.view.KeyEvent.KEYCODE_DPAD_DOWN: js("v.currentTime=Math.max(0,v.currentTime-60);"); return true;
            case android.view.KeyEvent.KEYCODE_BACK: finish(); return true;
        }
        return super.dispatchKeyEvent(e);
    }
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

    /** makes the page lay out as a desktop site: wide viewport and no touch device, like Chrome's "desktop site" switch */
    static final String DESKTOP_JS = "(function(){try{"
        + "var f=function(){var m=document.querySelector('meta[name=viewport]');if(!m){m=document.createElement('meta');m.name='viewport';(document.head||document.documentElement).appendChild(m);}if(m.getAttribute('content')!=='width=1280')m.setAttribute('content','width=1280');};f();new MutationObserver(f).observe(document.documentElement,{childList:true,subtree:true});"
        + "var d=function(o,k,v){try{Object.defineProperty(o,k,{get:function(){return v},configurable:true})}catch(e){}};"
        + "d(navigator,'maxTouchPoints',0);d(navigator,'platform','Linux x86_64');d(navigator,'vendor','Google Inc.');"
        + "d(navigator,'userAgentData',{mobile:false,platform:'Linux',brands:[{brand:'Chromium',version:'124'},{brand:'Google Chrome',version:'124'}],getHighEntropyValues:function(){return Promise.resolve({platform:'Linux',mobile:false})}});"
        + "try{delete window.ontouchstart;}catch(e){}"
        + "if(!window.__mmw){window.__mmw=1;var mm=window.matchMedia.bind(window);window.matchMedia=function(q){var r=mm(q);if(/pointer:\\s*coarse|hover:\\s*none|any-pointer:\\s*coarse/.test(q))return Object.assign(Object.create(r),{matches:false,media:q,addListener:function(){},removeListener:function(){},addEventListener:function(){},removeEventListener:function(){}});return r;};}"
        + "}catch(e){}})();";

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        LinearLayout root = new LinearLayout(this); root.setFitsSystemWindows(true); root.setOrientation(LinearLayout.VERTICAL); root.setBackgroundColor(Color.BLACK);
        LinearLayout bar = new LinearLayout(this); bar.setOrientation(LinearLayout.HORIZONTAL); bar.setGravity(Gravity.CENTER_VERTICAL); bar.setBackgroundColor(Color.parseColor("#111111"));
        bar.setPadding(24, 16, 24, 16);
        TextView t = new TextView(this); t.setText("ICI TOU.TV · sign in, start an episode for a few seconds, then press Done"); t.setTextColor(Color.WHITE); t.setTextSize(14);
        bar.addView(t, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        Button done = new Button(this); done.setText("Done"); done.setOnClickListener(v -> finish());
        bar.addView(done);
        String startUrl = getIntent().getStringExtra("url"); player = getIntent().getBooleanExtra("player", false);
        if (!player) root.addView(bar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        else { getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | android.view.WindowManager.LayoutParams.FLAG_FULLSCREEN); root.setFitsSystemWindows(false); AppLog.add("tou", "web player: " + redactUrl(startUrl)); }
        rootView = root;
        WebView wv = new WebView(this); web = wv;
        wv.setWebChromeClient(new android.webkit.WebChromeClient() {
            @Override public void onPermissionRequest(android.webkit.PermissionRequest r) {   // TOU.TV's player may use the device's protected playback (the same as a browser)
                java.util.List<String> ok = new java.util.ArrayList<>();
                for (String x : r.getResources()) if (android.webkit.PermissionRequest.RESOURCE_PROTECTED_MEDIA_ID.equals(x)) ok.add(x);
                if (!ok.isEmpty() && r.getOrigin() != null && String.valueOf(r.getOrigin().getHost()).endsWith("tou.tv")) r.grant(ok.toArray(new String[0])); else r.deny();
            }
            @Override public void onShowCustomView(View v, CustomViewCallback cb) { fullView = v; fullCb = cb; rootView.addView(v, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)); web.setVisibility(View.GONE); }
            @Override public void onHideCustomView() { if (fullView != null) { rootView.removeView(fullView); fullView = null; } web.setVisibility(View.VISIBLE); if (fullCb != null) { fullCb.onCustomViewHidden(); fullCb = null; } }
        });
        WebSettings ws = wv.getSettings();
        ws.setJavaScriptEnabled(true); ws.setDomStorageEnabled(true); ws.setUserAgentString(UA);
        ws.setMediaPlaybackRequiresUserGesture(false); ws.setLoadWithOverviewMode(true); ws.setUseWideViewPort(true);
        ws.setSupportZoom(true); ws.setBuiltInZoomControls(true); ws.setDisplayZoomControls(false);
        CookieManager cm = CookieManager.getInstance(); cm.setAcceptCookie(true); cm.setAcceptThirdPartyCookies(wv, true);
        final SharedPreferences sp = getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        wv.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) { super.onPageStarted(view, url, icon); view.evaluateJavascript(DESKTOP_JS, null); }
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url); view.evaluateJavascript(DESKTOP_JS, null);
                if (player) for (int i = 1; i <= 12; i++) view.postDelayed(() -> { if (web != null) web.evaluateJavascript(PLAYER_JS, null); }, i * 1500L);   // the player loads late: keep nudging it to start and fill the screen
            }
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest r) {
                try {
                    String url = r.getUrl().toString(), host = r.getUrl().getHost();
                    if (host != null && (host.endsWith("radio-canada.ca") || host.endsWith("tou.tv")) && !host.startsWith("logstash") && !host.startsWith("stats.") && !url.contains("/metrie/") && !url.matches(".*\\.(png|jpg|jpeg|webp|svg|css|woff2?|ico|js)(\\?.*)?$") && !"OPTIONS".equals(r.getMethod())) {
                        Map<String, String> h = r.getRequestHeaders();
                        StringBuilder names = new StringBuilder();
                        for (Map.Entry<String, String> e : h.entrySet()) {
                            String k = e.getKey(), lk = k.toLowerCase();
                            if (lk.equals("authorization") && e.getValue() != null) {
                                names.append(k).append("(").append(e.getValue().length()).append(" chars) ");
                                if (host.endsWith("radio-canada.ca") && e.getValue().length() > 500) sp.edit().putString("auth", e.getValue()).putLong("authT", System.currentTimeMillis()).apply();
                            } else if (lk.equals("x-claims-token") && e.getValue() != null) {
                                names.append(k).append("(").append(e.getValue().length()).append(" chars) ");
                                if (host.endsWith("radio-canada.ca") && e.getValue().length() > 100) sp.edit().putString("claims", e.getValue()).putLong("claimsT", System.currentTimeMillis()).apply();
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
        wv.loadUrl(startUrl != null ? startUrl : "https://ici.tou.tv/stat");   // straight to Stat: sign in there, then start an episode for a second so the session is seen
    }

    @Override
    protected void onPause() { super.onPause(); try { CookieManager.getInstance().flush(); } catch (Exception ignored) { } if (player && web != null) web.evaluateJavascript("try{document.querySelector('video').pause()}catch(e){}", null); }
    @Override
    protected void onDestroy() { if (web != null) { web.loadUrl("about:blank"); web.destroy(); web = null; } super.onDestroy(); }
}
