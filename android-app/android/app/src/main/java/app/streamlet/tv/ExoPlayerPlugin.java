package app.streamlet.tv;

import android.app.UiModeManager;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;

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

    @Override
    public void load() {
        instance = this;
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
        Long start = call.getLong("startMs", 0L);
        JSArray subs = call.getArray("subtitles", new JSArray());

        Intent i = new Intent(getContext(), PlayerActivity.class);
        i.putExtra("url", url);
        i.putExtra("title", call.getString("title", ""));
        i.putExtra("startMs", start == null ? 0L : start);
        i.putExtra("audioLang", call.getString("audioLang"));
        i.putExtra("subLang", call.getString("subLang"));
        i.putExtra("subs", subs.toString());

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

    static void finished(long position, long duration, boolean ended) {
        if (pending == null) return;
        JSObject o = new JSObject();
        o.put("position", position);
        o.put("duration", duration);
        o.put("ended", ended);
        pending.resolve(o);
        pending = null;
    }
}
