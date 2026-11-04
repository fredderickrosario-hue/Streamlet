package app.streamlet.tv;

import android.app.UiModeManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Bridge between the Streamlet web app and the native Media3 / ExoPlayer screen.
 *
 *   ExoPlayer.device()  -> { isTV, native }
 *   ExoPlayer.play({url, title, startMs, subtitles:[{url,lang,label}], audioLang, subLang})
 *        -> resolves when the player is closed: { position, duration, ended }  (milliseconds)
 *   event "progress" -> { position, duration }   every ~5 s while playing
 */
@CapacitorPlugin(name = "ExoPlayer")
public class ExoPlayerPlugin extends Plugin {
    static ExoPlayerPlugin instance;
    static PluginCall pending;
    static long subDelay = Long.MIN_VALUE;   // set by the player when it knows the subtitle delay
    static boolean autoNext = false;
    static int pickSeason = -1, pickEpisode = -1;   // set when the viewer picks another episode inside the player

    @Override
    public void load() {
        instance = this;
    }

    /** versionCode of the installed app (= the GitHub Actions build number). */
    @PluginMethod
    public void appVersion(PluginCall call) {
        try {
            android.content.pm.PackageInfo pi = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            JSObject r = new JSObject();
            long code = Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode;
            r.put("code", code);
            r.put("name", pi.versionName);
            call.resolve(r);
        } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
    }

    private void openInstaller(File out) {
        Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", out);
        Intent i = new Intent(Intent.ACTION_VIEW);
        i.setDataAndType(uri, "application/vnd.android.package-archive");
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
    }

    /** opens the installer for the APK downloaded earlier (installApk with install:false) */
    @PluginMethod
    public void installDownloaded(PluginCall call) {
        File out = new File(new File(getContext().getCacheDir(), "updates"), "Streamlet.apk");
        if (!out.exists()) { call.reject("nofile"); return; }
        if (Build.VERSION.SDK_INT >= 26 && !getContext().getPackageManager().canRequestPackageInstalls()) {
            Intent s = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            s.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(s);
            call.reject("permission");
            return;
        }
        try { openInstaller(out); call.resolve(); } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
    }

    /** Download an APK into the app cache (emits "updateProgress" {percent}) and open the system installer. */
    @PluginMethod
    public void installApk(final PluginCall call) {
        final String url = call.getString("url");
        if (url == null || url.isEmpty()) { call.reject("url required"); return; }
        final boolean installNow = call.getBoolean("install", true);                       // false: only download, install later with installDownloaded
        if (installNow && Build.VERSION.SDK_INT >= 26 && !getContext().getPackageManager().canRequestPackageInstalls()) {
            Intent s = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            s.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(s);
            call.reject("permission");
            return;
        }
        new Thread(() -> {
            try {
                File dir = new File(getContext().getCacheDir(), "updates");
                dir.mkdirs();
                File out = new File(dir, "Streamlet.apk");
                HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                c.setInstanceFollowRedirects(true);
                c.setConnectTimeout(15000); c.setReadTimeout(30000);
                int code = c.getResponseCode();
                if (code / 100 == 3) {   // GitHub redirects to another host: follow by hand
                    String loc = c.getHeaderField("Location");
                    c.disconnect();
                    c = (HttpURLConnection) new URL(loc).openConnection();
                    c.setConnectTimeout(15000); c.setReadTimeout(30000);
                    code = c.getResponseCode();
                }
                if (code != 200) { call.reject("HTTP " + code); return; }
                long total = c.getContentLengthLong(), done = 0; int last = -1;
                try (InputStream in = c.getInputStream(); FileOutputStream fo = new FileOutputStream(out)) {
                    byte[] buf = new byte[65536]; int n;
                    while ((n = in.read(buf)) > 0) {
                        fo.write(buf, 0, n); done += n;
                        int pct = total > 0 ? (int) (done * 100 / total) : -1;
                        if (pct != last) { last = pct; JSObject p = new JSObject(); p.put("percent", pct); notifyListeners("updateProgress", p); }
                    }
                }
                if (installNow) openInstaller(out);
                call.resolve();
            } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
        }).start();
    }

    /** the rolling native log (crashes, how the last run ended, player errors) */
    @PluginMethod
    public void getLog(PluginCall call) { JSObject r = new JSObject(); r.put("log", AppLog.read()); call.resolve(r); }

    /** empties the web view's saved pages and files (settings and accounts are kept) */
    @PluginMethod
    public void clearWebCache(final PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try { getBridge().getWebView().clearCache(true); call.resolve(); }
            catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
        });
    }

    /** setting "Screensaver": off keeps the screen awake while the app is open */
    @PluginMethod
    public void setKeepAwake(final PluginCall call) {
        final boolean on = call.getBoolean("on", false);
        getContext().getSharedPreferences("streamlet_player", Context.MODE_PRIVATE).edit().putBoolean("keepawake", on).apply();
        getActivity().runOnUiThread(() -> { MainActivity.applyAwake(getActivity(), on); call.resolve(); });
    }

    /** plain GET from the native side (no browser cross-origin rules): used for the intro database */
    @PluginMethod
    public void httpGet(final PluginCall call) {
        final String url = call.getString("url");
        if (url == null || !url.startsWith("https://")) { call.reject("https only"); return; }
        new Thread(() -> {
            try {
                HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                c.setConnectTimeout(8000); c.setReadTimeout(8000);
                c.setRequestProperty("Accept", "application/json");
                JSObject hd = call.getObject("headers");                       // optional extra request headers (used by the Québec test)
                if (hd != null) { java.util.Iterator<String> it = hd.keys(); while (it.hasNext()) { String k = it.next(); c.setRequestProperty(k, hd.getString(k)); } }
                int code = c.getResponseCode();
                InputStream in = code / 100 == 2 ? c.getInputStream() : c.getErrorStream();
                java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream();
                byte[] buf = new byte[8192]; int n; while (in != null && (n = in.read(buf)) > 0) bo.write(buf, 0, n);
                JSObject r = new JSObject(); r.put("status", code); r.put("body", bo.toString("UTF-8")); r.put("url", c.getURL().toString());
                call.resolve(r);
            } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
        }).start();
    }

    @PluginMethod
    public void clearLog(PluginCall call) { AppLog.clear(); call.resolve(); }

    @PluginMethod
    public void device(PluginCall call) {
        UiModeManager um = (UiModeManager) getContext().getSystemService(Context.UI_MODE_SERVICE);
        boolean tv = um != null && um.getCurrentModeType() == Configuration.UI_MODE_TYPE_TELEVISION;
        JSObject r = new JSObject();
        r.put("isTV", tv);
        r.put("native", true);
        call.resolve(r);
    }

    @PluginMethod
    public void play(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("url required");
            return;
        }
        if (pending != null) {
            pending.reject("replaced");
            pending = null;
        }
        long start = call.getData().optLong("startMs", 0L);       // call.getLong() ignores numbers the JSON parser reads as Integer, so every resume started at 0
        JSArray subs = call.getArray("subtitles", new JSArray());

        Intent i = new Intent(getContext(), PlayerActivity.class);
        i.putExtra("url", url);
        i.putExtra("title", call.getString("title", ""));
        i.putExtra("subtitle", call.getString("subtitle", ""));
        i.putExtra("startMs", start);
        i.putExtra("audioLang", call.getString("audioLang"));
        i.putExtra("subLang", call.getString("subLang"));
        i.putExtra("subs", subs.toString());
        i.putExtra("accent", call.getString("accent", ""));
        i.putExtra("hw", call.getBoolean("hw", true));
        i.putExtra("fps", call.getBoolean("fps", true));
        i.putExtra("tunnel", call.getBoolean("tunnel", false));
        i.putExtra("pass", call.getBoolean("pass", true));
        i.putExtra("nextTitle", call.getString("nextTitle", ""));
        i.putExtra("autoNext", call.getBoolean("autoNext", true));
        i.putExtra("autoSkip", call.getBoolean("autoSkip", false));
        i.putExtra("episode", call.getBoolean("episode", false));
        i.putExtra("eps", call.getString("eps", ""));
        i.putExtra("skip", call.getInt("skip", 10));
        i.putExtra("segs", call.getString("segs", ""));
        i.putExtra("curSeason", call.getInt("curSeason", 1));
        i.putExtra("curEpisode", call.getInt("curEpisode", 0));
        i.putExtra("subDelay", call.getData().optLong("subDelay", 0L));
        i.putExtra("wnProfile", call.getString("wnProfile", ""));
        i.putExtra("wnItem", call.getString("wnItem", ""));
        i.putExtra("wnKind", call.getString("wnKind", "movie"));
        i.putExtra("wnTitle", call.getString("wnTitle", ""));
        i.putExtra("wnPoster", call.getString("wnPoster", ""));

        call.setKeepAlive(true);
        pending = call;
        getActivity().startActivity(i);
    }

    static void progress(long position, long duration) {
        if (instance == null) return;
        JSObject o = new JSObject();
        o.put("position", position);
        o.put("duration", duration);
        instance.notifyListeners("progress", o);
    }

    static void failed(long position, long duration, boolean next, String code) {
        if (pending == null) return;
        JSObject o = new JSObject();
        o.put("position", position);
        o.put("duration", duration);
        o.put("ended", false);
        o.put("failed", true);
        if (subDelay != Long.MIN_VALUE) o.put("subDelay", subDelay);
        subDelay = Long.MIN_VALUE; autoNext = false; pickSeason = -1; pickEpisode = -1;
        o.put("next", next);
        o.put("error", code);
        pending.resolve(o);
        pending = null;
    }

    static void finished(long position, long duration, boolean ended) {
        if (pending == null) return;
        JSObject o = new JSObject();
        o.put("position", position);
        o.put("duration", duration);
        o.put("ended", ended);
        if (subDelay != Long.MIN_VALUE) o.put("subDelay", subDelay);
        o.put("autoNext", autoNext);
        if (pickEpisode >= 0) { JSObject pk = new JSObject(); pk.put("season", pickSeason); pk.put("episode", pickEpisode); o.put("pick", pk); }
        pickSeason = -1; pickEpisode = -1;
        subDelay = Long.MIN_VALUE; autoNext = false;
        pending.resolve(o);
        pending = null;
    }
}
