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
    static int altUsed = -1;                 // which of the backup sources the player ended on (-1: the one it was given)
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

    /** ICI TOU.TV sign-in window (see TouLoginActivity) and what it has noted so far, without exposing the secrets */
    @PluginMethod
    public void openTouLogin(PluginCall call) {
        Intent i = new Intent(getActivity(), TouLoginActivity.class);
        String u = call.getString("url");
        if (u != null && u.startsWith("https://ici.tou.tv/")) { i.putExtra("url", u); i.putExtra("player", Boolean.TRUE.equals(call.getBoolean("player", false))); }
        getActivity().startActivity(i); call.resolve();
    }
    @PluginMethod
    public void touStatus(PluginCall call) {
        SharedPreferences sp = getContext().getSharedPreferences(TouLoginActivity.PREFS, Context.MODE_PRIVATE);
        JSObject r = new JSObject(); long t = sp.getLong("authT", 0);
        r.put("signedIn", sp.getString("auth", null) != null); r.put("ageMin", t == 0 ? -1 : (System.currentTimeMillis() - t) / 60000);
        r.put("sawValidation", sp.getString("lastValidation", null) != null); r.put("claims", sp.getString("claims", null) != null);
        call.resolve(r);
    }
    /** GET to a Radio-Canada address with the saved sign-in (the secrets stay on this side and never go to the page) */
    @PluginMethod
    public void touGet(final PluginCall call) {
        final String url = call.getString("url");
        if (url == null || !url.startsWith("https://services.radio-canada.ca/")) { call.reject("Radio-Canada services only"); return; }
        new Thread(() -> {
            try {
                SharedPreferences sp = getContext().getSharedPreferences(TouLoginActivity.PREFS, Context.MODE_PRIVATE);
                HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                c.setConnectTimeout(8000); c.setReadTimeout(10000);
                c.setRequestProperty("Accept", "application/json, text/plain, */*");
                c.setRequestProperty("User-Agent", TouLoginActivity.UA);
                c.setRequestProperty("Origin", "https://ici.tou.tv"); c.setRequestProperty("Referer", "https://ici.tou.tv/");
                c.setRequestProperty("X-Requested-With", "XMLHttpRequest");
                String a = sp.getString("auth", null), cl = sp.getString("claims", null);
                if (a != null) c.setRequestProperty("Authorization", a);
                if (cl != null) c.setRequestProperty("x-claims-token", cl);
                int code = c.getResponseCode();
                InputStream in = code / 100 == 2 ? c.getInputStream() : c.getErrorStream();
                java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream();
                byte[] buf = new byte[8192]; int n; while (in != null && (n = in.read(buf)) > 0 && bo.size() < 6000000) bo.write(buf, 0, n);
                JSObject r = new JSObject(); r.put("status", code); r.put("body", bo.toString("UTF-8"));
                call.resolve(r);
            } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
        }).start();
    }
    @PluginMethod
    public void touForget(PluginCall call) {
        getContext().getSharedPreferences(TouLoginActivity.PREFS, Context.MODE_PRIVATE).edit().clear().apply();
        try { android.webkit.CookieManager.getInstance().removeAllCookies(null); } catch (Exception ignored) { }
        call.resolve();
    }

    @PluginMethod
    public void clearLog(PluginCall call) { AppLog.clear(); call.resolve(); }

    /* ---- downloads (phone app): Android's download manager keeps going in the background, with its own notification ----
       Files go to the app's own folder (Android/data/app.streamlet.tv/files/Streamlet): no storage permission, removed with the app. */
    private File dlDir() { File d = new File(getContext().getExternalFilesDir(null), "Streamlet"); if (!d.exists()) d.mkdirs(); return d; }
    private static String safeName(String n) { String s = n == null ? "video" : n.replaceAll("[^A-Za-z0-9._ -]", "_").trim(); return s.isEmpty() ? "video" : s.length() > 120 ? s.substring(0, 120) : s; }
    /** the playable file link for an addon link (Torrentio Real-Debrid links go straight to Real-Debrid), on a worker thread */
    /** open an episode in the ICI TOU.TV app (Android TV: tv.toutv.androidtv, phone: tv.tou.android): the app's own link first, then the app's home */
    @PluginMethod
    public void openTou(PluginCall call) {
        String path = call.getString("path", "");
        android.content.pm.PackageManager pm = getContext().getPackageManager();
        String pkg = null;
        for (String p : new String[]{"tv.toutv.androidtv", "tv.tou.android"}) { try { pm.getPackageInfo(p, 0); pkg = p; break; } catch (Exception ignored) { } }
        JSObject r = new JSObject();
        if (pkg == null) { r.put("ok", false); r.put("why", "ICI TOU.TV isn't installed"); call.resolve(r); return; }
        String[] links = {"https://ici.tou.tv/" + path, "toutv://" + path, "toutv://ici.tou.tv/" + path};
        for (String l : links) {
            try {
                Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(l)).setPackage(pkg).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                if (i.resolveActivity(pm) != null) { getActivity().startActivity(i); AppLog.add("tou", "opened " + pkg + " with " + l); r.put("ok", true); r.put("how", "episode"); call.resolve(r); return; }
            } catch (Exception e) { AppLog.add("tou", "link refused: " + l + " (" + e.getClass().getSimpleName() + ")"); }
        }
        Intent home = pm.getLeanbackLaunchIntentForPackage(pkg); if (home == null) home = pm.getLaunchIntentForPackage(pkg);
        if (home != null) { getActivity().startActivity(home.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); AppLog.add("tou", "the app has no episode link: opened its home"); r.put("ok", true); r.put("how", "home"); call.resolve(r); return; }
        r.put("ok", false); r.put("why", "Couldn't open ICI TOU.TV"); call.resolve(r);
    }

    @PluginMethod
    public void resolveLink(final PluginCall call) {
        final String u = call.getString("url");
        new Thread(() -> { try { JSObject r = new JSObject(); r.put("url", PlayerActivity.resolveFinal(u)); call.resolve(r); } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); } }).start();
    }
    @PluginMethod
    public void dlStart(PluginCall call) {
        try {
            String url = call.getString("url"), name = safeName(call.getString("file"));
            if (url == null || !url.startsWith("http")) { call.reject("no link"); return; }
            File f = new File(dlDir(), name); if (f.exists()) f.delete();
            android.app.DownloadManager dm = (android.app.DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
            android.app.DownloadManager.Request rq = new android.app.DownloadManager.Request(Uri.parse(url));
            rq.setTitle(call.getString("title", "Streamlet download")); rq.setDescription("Streamlet");
            rq.setDestinationUri(Uri.fromFile(f));
            rq.addRequestHeader("User-Agent", PlayerActivity.UA);
            rq.setNotificationVisibility(android.app.DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            boolean wifi = Boolean.TRUE.equals(call.getBoolean("wifiOnly", true));
            if (wifi) { rq.setAllowedNetworkTypes(android.app.DownloadManager.Request.NETWORK_WIFI); rq.setAllowedOverMetered(false); }
            rq.setAllowedOverRoaming(false);
            long id = dm.enqueue(rq);
            AppLog.add("DL", "started " + name + (wifi ? " (Wi-Fi only)" : ""));
            JSObject r = new JSObject(); r.put("id", id); r.put("file", Uri.fromFile(f).toString()); call.resolve(r);
        } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
    }
    /** small files (subtitles, poster) saved straight away */
    @PluginMethod
    public void dlSmall(final PluginCall call) {
        final String url = call.getString("url"), name = safeName(call.getString("file"));
        new Thread(() -> {
            try {
                HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                c.setRequestProperty("User-Agent", PlayerActivity.UA); c.setInstanceFollowRedirects(true); c.setConnectTimeout(12000); c.setReadTimeout(20000);
                File f = new File(dlDir(), name);
                try (InputStream in = c.getInputStream(); FileOutputStream fo = new FileOutputStream(f)) { byte[] buf = new byte[8192]; int n; long tot = 0; while ((n = in.read(buf)) > 0 && tot < 8_000_000) { fo.write(buf, 0, n); tot += n; } }
                JSObject r = new JSObject(); r.put("file", Uri.fromFile(f).toString()); r.put("bytes", f.length()); call.resolve(r);
            } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
        }).start();
    }
    @PluginMethod
    public void dlStatus(PluginCall call) {
        try {
            JSArray ids = call.getArray("ids"); JSObject out = new JSObject();
            android.app.DownloadManager dm = (android.app.DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
            long[] arr = new long[ids.length()]; for (int i = 0; i < ids.length(); i++) arr[i] = ids.getLong(i);
            if (arr.length > 0) try (android.database.Cursor c = dm.query(new android.app.DownloadManager.Query().setFilterById(arr))) {
                while (c.moveToNext()) {
                    JSObject o = new JSObject();
                    int st = c.getInt(c.getColumnIndexOrThrow(android.app.DownloadManager.COLUMN_STATUS));
                    o.put("status", st == android.app.DownloadManager.STATUS_SUCCESSFUL ? "done" : st == android.app.DownloadManager.STATUS_FAILED ? "failed" : st == android.app.DownloadManager.STATUS_PAUSED ? "paused" : st == android.app.DownloadManager.STATUS_PENDING ? "waiting" : "running");
                    o.put("done", c.getLong(c.getColumnIndexOrThrow(android.app.DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR)));
                    o.put("total", c.getLong(c.getColumnIndexOrThrow(android.app.DownloadManager.COLUMN_TOTAL_SIZE_BYTES)));
                    o.put("reason", c.getInt(c.getColumnIndexOrThrow(android.app.DownloadManager.COLUMN_REASON)));
                    out.put(String.valueOf(c.getLong(c.getColumnIndexOrThrow(android.app.DownloadManager.COLUMN_ID))), o);
                }
            }
            File d = dlDir(); JSObject r = new JSObject(); r.put("items", out); r.put("free", d.getUsableSpace()); call.resolve(r);
        } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
    }
    @PluginMethod
    public void dlRemove(PluginCall call) {
        try {
            android.app.DownloadManager dm = (android.app.DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
            JSArray ids = call.getArray("ids", new JSArray()); for (int i = 0; i < ids.length(); i++) try { dm.remove(ids.getLong(i)); } catch (Exception ignored) { }
            JSArray files = call.getArray("files", new JSArray());
            for (int i = 0; i < files.length(); i++) try { String fu = files.getString(i); if (fu != null && fu.startsWith("file:")) { File f = new File(Uri.parse(fu).getPath()); if (f.getCanonicalPath().startsWith(dlDir().getCanonicalPath())) f.delete(); } } catch (Exception ignored) { }
            call.resolve();
        } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
    }

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
        i.putExtra("autoPick", call.getBoolean("autoPick", false));
        i.putExtra("alts", call.getString("alts", "[]"));
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
        o.put("alt", altUsed); altUsed = -1;
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
        o.put("alt", altUsed); altUsed = -1;
        if (pickEpisode >= 0) { JSObject pk = new JSObject(); pk.put("season", pickSeason); pk.put("episode", pickEpisode); o.put("pick", pk); }
        pickSeason = -1; pickEpisode = -1;
        subDelay = Long.MIN_VALUE; autoNext = false;
        pending.resolve(o);
        pending = null;
    }
}
