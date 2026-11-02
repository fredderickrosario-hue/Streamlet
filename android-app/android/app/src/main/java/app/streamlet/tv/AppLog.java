package app.streamlet.tv;

import android.app.ActivityManager;
import android.app.ApplicationExitInfo;
import android.content.Context;
import android.os.Build;

import java.io.File;
import java.io.FileOutputStream;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/** Small rolling log (files/streamlet.log, about 64 KB max): crashes, how the last run ended, player errors and fallbacks. Shown in Settings. */
public final class AppLog {
    private static File file;
    private static final SimpleDateFormat FMT = new SimpleDateFormat("MM-dd HH:mm:ss", Locale.US);
    private AppLog() { }

    public static synchronized void init(Context c) {
        if (file != null) return;
        file = new File(c.getFilesDir(), "streamlet.log");
        final Thread.UncaughtExceptionHandler old = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((t, e) -> {
            StringWriter sw = new StringWriter(); e.printStackTrace(new PrintWriter(sw));
            add("CRASH", t.getName() + ": " + sw.toString().trim());
            if (old != null) old.uncaughtException(t, e);
        });
        add("START", Build.MANUFACTURER + " " + Build.MODEL + ", Android " + Build.VERSION.RELEASE);
        if (Build.VERSION.SDK_INT >= 30) {                           // why did the last run end? (native crash, memory, ANR ...)
            try {
                ActivityManager am = (ActivityManager) c.getSystemService(Context.ACTIVITY_SERVICE);
                List<ApplicationExitInfo> l = am.getHistoricalProcessExitReasons(c.getPackageName(), 0, 1);
                if (!l.isEmpty()) { ApplicationExitInfo x = l.get(0); add("LASTEXIT", reason(x.getReason()) + (x.getDescription() == null ? "" : " · " + x.getDescription())); }
            } catch (Exception ignored) { }
        }
    }

    private static String reason(int r) {
        switch (r) {
            case 1: return "exit"; case 2: return "killed by system"; case 3: return "signal";
            case 4: return "Java crash"; case 5: return "native crash"; case 6: return "not responding (ANR)";
            case 7: return "initialization failure"; case 8: return "permission change"; case 9: return "low memory";
            case 10: return "user request"; case 11: return "user stopped"; case 12: return "dependency died";
            case 13: return "other"; default: return "unknown (" + r + ")";
        }
    }

    public static synchronized void add(String tag, String msg) {
        if (file == null) return;
        try {
            String line = FMT.format(new Date()) + " " + tag + " " + msg.replace('\r', ' ') + "\n";
            if (file.length() > 64 * 1024) {
                String all = read();
                String keep = all.substring(Math.max(0, all.length() - 32 * 1024));
                int nl = keep.indexOf('\n'); if (nl >= 0) keep = keep.substring(nl + 1);
                try (FileOutputStream o = new FileOutputStream(file, false)) { o.write(keep.getBytes(StandardCharsets.UTF_8)); }
            }
            try (FileOutputStream o = new FileOutputStream(file, true)) { o.write(line.getBytes(StandardCharsets.UTF_8)); }
        } catch (Exception ignored) { }
    }

    public static synchronized String read() {
        try {
            if (file == null || !file.exists()) return "";
            byte[] b = new byte[(int) file.length()];
            try (java.io.FileInputStream i = new java.io.FileInputStream(file)) { int n = 0; while (n < b.length) { int r = i.read(b, n, b.length - n); if (r < 0) break; n += r; } }
            return new String(b, StandardCharsets.UTF_8);
        } catch (Exception e) { return ""; }
    }

    public static synchronized void clear() { try { if (file != null) new FileOutputStream(file, false).close(); } catch (Exception ignored) { } }
}
