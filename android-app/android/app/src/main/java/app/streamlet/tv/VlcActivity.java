package app.streamlet.tv;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.SeekBar;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;
import org.videolan.libvlc.LibVLC;
import org.videolan.libvlc.Media;
import org.videolan.libvlc.MediaPlayer;
import org.videolan.libvlc.util.VLCVideoLayout;

import java.util.ArrayList;
import java.util.Locale;

/** Backup player (libVLC) for files ExoPlayer can't open. Reports back through the same bridge. */
public class VlcActivity extends Activity {
    private LibVLC lib;
    private MediaPlayer mp;
    private FrameLayout root;
    private LinearLayout bar;
    private TextView posTx, durTx, hint, note;
    private SeekBar seek;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean reported = false, barOn = true, ended = false, seekedStart = false;
    private long lastPos = 0, lastDur = 0;
    private int accent = 0xFF8B5CFF;
    private final Runnable hideRun = new Runnable() { @Override public void run() { setBar(false); } };
    private final Runnable tick = new Runnable() { @Override public void run() {
        if (mp != null) {
            long t = Math.max(0, mp.getTime()), d = Math.max(0, mp.getLength());
            lastPos = t; lastDur = d;
            if (d > 0) { seek.setMax((int) Math.min(d, Integer.MAX_VALUE)); seek.setProgress((int) Math.min(t, seek.getMax())); durTx.setText("−" + fmt(d - t)); }
            posTx.setText(fmt(t));
        }
        handler.postDelayed(this, 500);
    } };
    private final Runnable report = new Runnable() { @Override public void run() { ExoPlayerPlugin.progress(lastPos, lastDur); handler.postDelayed(this, 5000); } };

    private static String fmt(long ms) {
        long s = Math.max(0, ms) / 1000, h = s / 3600, m = (s % 3600) / 60, x = s % 60;
        return h > 0 ? String.format(Locale.US, "%d:%02d:%02d", h, m, x) : String.format(Locale.US, "%d:%02d", m, x);
    }
    private int dp(float v) { return Math.round(v * getResources().getDisplayMetrics().density); }

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        Intent in = getIntent();
        try { String ac = in.getStringExtra("accent"); if (ac != null && !ac.isEmpty()) accent = Color.parseColor(ac); } catch (Exception ignored) { }
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        VLCVideoLayout layout = new VLCVideoLayout(this);
        root.addView(layout, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        hideSystemUi();

        TextView title = new TextView(this);
        title.setText(in.getStringExtra("title"));
        title.setTextColor(Color.WHITE); title.setTextSize(24); title.setTypeface(Typeface.DEFAULT_BOLD); title.setSingleLine(true);
        title.setPadding(dp(48), dp(30), dp(48), 0);
        root.addView(title, new FrameLayout.LayoutParams(-1, -2, Gravity.TOP));

        bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.VERTICAL);
        bar.setPadding(dp(56), dp(80), dp(56), dp(28));
        bar.setBackground(new GradientDrawable(GradientDrawable.Orientation.BOTTOM_TOP, new int[]{0xEE000000, 0x00000000}));
        LinearLayout row = new LinearLayout(this);
        row.setGravity(Gravity.CENTER_VERTICAL);
        posTx = new TextView(this); posTx.setTextColor(Color.WHITE); posTx.setTextSize(15); posTx.setTypeface(Typeface.DEFAULT_BOLD); posTx.setText("0:00");
        durTx = new TextView(this); durTx.setTextColor(0xB3FFFFFF); durTx.setTextSize(15); durTx.setTypeface(Typeface.DEFAULT_BOLD);
        seek = new SeekBar(this);
        seek.setFocusable(false); seek.setEnabled(false); seek.setPadding(0, 0, 0, 0);
        seek.setProgressTintList(android.content.res.ColorStateList.valueOf(accent));
        seek.setProgressBackgroundTintList(android.content.res.ColorStateList.valueOf(0x55FFFFFF));
        seek.setThumb(null);
        LinearLayout.LayoutParams sl = new LinearLayout.LayoutParams(0, dp(24), 1f);
        sl.leftMargin = dp(16); sl.rightMargin = dp(16);
        row.addView(posTx); row.addView(seek, sl); row.addView(durTx);
        bar.addView(row);
        hint = new TextView(this);
        hint.setText("▲ Audio     ▼ Subtitles     ◀ ▶ Skip 10 s     OK Play / Pause");
        hint.setTextColor(0x99FFFFFF); hint.setTextSize(13); hint.setGravity(Gravity.CENTER);
        hint.setPadding(0, dp(14), 0, 0);
        bar.addView(hint);
        root.addView(bar, new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM));

        note = new TextView(this);
        note.setTextColor(Color.WHITE); note.setTextSize(20); note.setTypeface(Typeface.DEFAULT_BOLD);
        note.setPadding(dp(22), dp(12), dp(22), dp(12));
        GradientDrawable nb = new GradientDrawable(); nb.setColor(0xAA000000); nb.setCornerRadius(dp(26)); note.setBackground(nb);
        note.setVisibility(View.GONE);
        FrameLayout.LayoutParams nl = new FrameLayout.LayoutParams(-2, -2, Gravity.CENTER_HORIZONTAL | Gravity.TOP);
        nl.topMargin = dp(90);
        root.addView(note, nl);

        ArrayList<String> args = new ArrayList<>();
        args.add("--http-reconnect");
        args.add(in.getBooleanExtra("hw", true) ? "--avcodec-hw=any" : "--avcodec-hw=none");
        args.add("--network-caching=2500");
        if (in.getBooleanExtra("pass", true)) args.add("--spdif");                      // pass Dolby (Digital, Plus, Atmos) to the TV / receiver instead of decoding it here
        lib = new LibVLC(this, args);
        mp = new MediaPlayer(lib);
        mp.attachViews(layout, null, false, false);
        Media m = new Media(lib, Uri.parse(in.getStringExtra("url")));
        m.addOption(":http-user-agent=Mozilla/5.0 (Linux; Android 12; TV)");
        final long startF = in.getLongExtra("startMs", 0L);
        if (startF > 0) m.addOption(":start-time=" + (startF / 1000.0));
        mp.setMedia(m);
        m.release();
        long start = in.getLongExtra("startMs", 0L);
        mp.setEventListener(ev -> {
            switch (ev.type) {
                case MediaPlayer.Event.Playing:
                    if (startF > 0 && !seekedStart) { seekedStart = true; if (Math.abs(mp.getTime() - startF) > 5000) mp.setTime(startF); }
                    break;
                case MediaPlayer.Event.EncounteredError:
                    AppLog.add("VLC", "playback error"); finishFailed(); break;
                case MediaPlayer.Event.EndReached:
                    ended = true; finishWith(true); break;
                default: break;
            }
        });
        mp.play();
        if (start > 0) mp.setTime(start);
        try {
            JSONArray arr = new JSONArray(in.getStringExtra("subs") == null ? "[]" : in.getStringExtra("subs"));
            for (int i = 0; i < arr.length(); i++) {
                String su = arr.getJSONObject(i).optString("url", "");
                if (!su.isEmpty()) mp.addSlave(Media.Slave.Type.Subtitle, Uri.parse(su), false);
            }
        } catch (Exception ignored) { }
        handler.post(tick);
        handler.postDelayed(report, 5000);
        setBar(true);
        flash("Playing with the backup player");
    }

    private void flash(String t) {
        note.setText(t); note.setVisibility(View.VISIBLE);
        handler.postDelayed(() -> note.setVisibility(View.GONE), 2200);
    }

    private void setBar(boolean on) {
        barOn = on;
        bar.animate().alpha(on ? 1f : 0f).setDuration(180).start();
        handler.removeCallbacks(hideRun);
        if (on) handler.postDelayed(hideRun, 4500);
    }

    private void skip(long d) {
        if (mp == null) return;
        long t = Math.max(0, mp.getTime() + d);
        long len = mp.getLength();
        if (len > 0) t = Math.min(t, len - 500);
        mp.setTime(t);
        flash(d < 0 ? "−" + Math.abs(d / 1000) + " s" : "+" + (d / 1000) + " s");
        setBar(true);
    }

    private void pick(boolean audio) {
        if (mp == null) return;
        final MediaPlayer.TrackDescription[] tr = audio ? mp.getAudioTracks() : mp.getSpuTracks();
        if (tr == null || tr.length == 0) { flash(audio ? "No other audio tracks" : "No subtitles available"); return; }
        final int cur = audio ? mp.getAudioTrack() : mp.getSpuTrack();
        String[] names = new String[tr.length];
        int sel = 0;
        for (int i = 0; i < tr.length; i++) { names[i] = tr[i].name; if (tr[i].id == cur) sel = i; }
        new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle(audio ? "Audio" : "Subtitles")
                .setSingleChoiceItems(names, sel, (d, which) -> {
                    if (audio) mp.setAudioTrack(tr[which].id); else mp.setSpuTrack(tr[which].id);
                    d.dismiss();
                }).show();
    }

    private void finishFailed() {
        if (reported) return;
        reported = true;
        ExoPlayerPlugin.failed(lastPos, lastDur, true, "VLC_ERROR");
        finish();
    }

    private void finishWith(boolean end) {
        if (reported) return;
        reported = true;
        ExoPlayerPlugin.finished(end && lastDur > 0 ? lastDur : lastPos, lastDur, end);
        finish();
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent e) {
        switch (keyCode) {
            case KeyEvent.KEYCODE_BACK: finishWith(false); return true;
            case KeyEvent.KEYCODE_DPAD_CENTER: case KeyEvent.KEYCODE_ENTER: case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
                if (mp != null) { if (mp.isPlaying()) mp.pause(); else mp.play(); } setBar(true); return true;
            case KeyEvent.KEYCODE_DPAD_LEFT: case KeyEvent.KEYCODE_MEDIA_REWIND: skip(-10000); return true;
            case KeyEvent.KEYCODE_DPAD_RIGHT: case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD: skip(10000); return true;
            case KeyEvent.KEYCODE_DPAD_UP: pick(true); return true;
            case KeyEvent.KEYCODE_DPAD_DOWN: pick(false); return true;
            default: return super.onKeyDown(keyCode, e);
        }
    }

    private void hideSystemUi() {
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
    }

    @Override
    protected void onStop() { super.onStop(); if (mp != null) mp.pause(); }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (!reported) { reported = true; ExoPlayerPlugin.finished(lastPos, lastDur, false); }
        try { if (mp != null) { mp.stop(); mp.detachViews(); mp.release(); } if (lib != null) lib.release(); } catch (Exception ignored) { }
        super.onDestroy();
    }
}
