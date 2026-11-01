package app.streamlet.tv;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.ClipDrawable;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.LayerDrawable;
import android.graphics.drawable.StateListDrawable;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.TextView;
import androidx.media3.common.Format;
import androidx.media3.common.Tracks;
import androidx.media3.common.TrackSelectionOverride;
import androidx.media3.ui.CaptionStyleCompat;
import androidx.media3.ui.SubtitleView;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.Toast;

import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.TrackSelectionParameters;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.ui.PlayerView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** Full-screen ExoPlayer (Media3). The built-in controls work with a TV remote (D-pad, OK, media keys). */
public class PlayerActivity extends Activity {
    private ExoPlayer player;
    private PlayerView view;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean reported = false;
    private long lastPos = 0, lastDur = 0;

    // ---- Streamlet control layer
    private static final int ACC1 = 0xFF8B5CFF, ACC2 = 0xFFEC4899, CYAN = 0xFF22D3EE;
    private FrameLayout root, controls, menuLayer;
    private SeekBar seek;
    private TextView posTx, durTx, titleTx, speedTx, flashTx;
    private ProgressBar spinner;
    private View playBtn, menuOpener;
    private ImageView playIcon;
    private boolean controlsOn = false, menuOn = false, seekPending = false;
    private float speed = 1f;
    private SharedPreferences prefs;
    private static final float[] SPEEDS = {0.5f, 0.75f, 1f, 1.25f, 1.5f, 2f};
    private static final float[] SUB_SCALES = {0.8f, 1f, 1.3f, 1.7f};
    private static final String[] SUB_NAMES = {"Small", "Medium", "Large", "Extra large"};
    private final Runnable hideRun = new Runnable() { @Override public void run() {
        if (player != null && player.isPlaying() && !menuOn) hideControls(); else scheduleHide(); } };
    private final Runnable seekRun = new Runnable() { @Override public void run() {
        if (player != null) player.seekTo(seek.getProgress()); seekPending = false; } };
    private final Runnable uiTick = new Runnable() { @Override public void run() { refreshProgress(); handler.postDelayed(this, 500); } };
    private final Runnable flashHide = new Runnable() { @Override public void run() { flashTx.setVisibility(View.GONE); } };

    private final Runnable ticker = new Runnable() {
        @Override
        public void run() {
            if (player == null) return;
            snapshot();
            ExoPlayerPlugin.progress(lastPos, lastDur);
            handler.postDelayed(this, 5000);
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        prefs = getSharedPreferences("streamlet_player", MODE_PRIVATE);
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        view = new PlayerView(this);
        view.setBackgroundColor(Color.BLACK);
        view.setUseController(false);
        view.setShowBuffering(PlayerView.SHOW_BUFFERING_NEVER);
        root.addView(view, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        hideSystemUi();
        styleSubtitles();

        Intent in = getIntent();
        String url = in.getStringExtra("url");
        String title = in.getStringExtra("title");
        long startMs = in.getLongExtra("startMs", 0L);
        String audioLang = in.getStringExtra("audioLang");
        String subLang = in.getStringExtra("subLang");

        player = new ExoPlayer.Builder(this).build();
        view.setPlayer(player);
        buildControls(title == null ? "" : title);

        MediaItem.Builder item = new MediaItem.Builder()
                .setUri(Uri.parse(url))
                .setMediaMetadata(new MediaMetadata.Builder().setTitle(title == null ? "" : title).build());
        List<MediaItem.SubtitleConfiguration> subs = new ArrayList<>();
        try {
            JSONArray arr = new JSONArray(in.getStringExtra("subs") == null ? "[]" : in.getStringExtra("subs"));
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.getJSONObject(i);
                String su = o.optString("url", "");
                if (su.isEmpty()) continue;
                String lower = su.toLowerCase(Locale.ROOT);
                String mime = lower.contains(".vtt") ? MimeTypes.TEXT_VTT
                        : (lower.contains(".ass") || lower.contains(".ssa")) ? MimeTypes.TEXT_SSA
                        : MimeTypes.APPLICATION_SUBRIP;
                subs.add(new MediaItem.SubtitleConfiguration.Builder(Uri.parse(su))
                        .setMimeType(mime)
                        .setLanguage(o.optString("lang", null))
                        .setLabel(o.optString("label", null))
                        .build());
            }
        } catch (Exception ignored) { }
        if (!subs.isEmpty()) item.setSubtitleConfigurations(subs);

        TrackSelectionParameters.Builder tp = player.getTrackSelectionParameters().buildUpon();
        if (audioLang != null && !audioLang.isEmpty()) tp.setPreferredAudioLanguage(audioLang);
        if (subLang != null && !subLang.isEmpty()) {
            tp.setPreferredTextLanguage(subLang);
            tp.setTrackTypeDisabled(C.TRACK_TYPE_TEXT, false);
        } else {
            tp.setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true); // subtitles off until chosen from the CC button
        }
        player.setTrackSelectionParameters(tp.build());

        player.addListener(new Player.Listener() {
            @Override
            public void onPlaybackStateChanged(int state) {
                if (state == Player.STATE_ENDED) finishWith(true);
                spinner.setVisibility(state == Player.STATE_BUFFERING ? View.VISIBLE : View.GONE);
                refreshProgress();
            }

            @Override
            public void onIsPlayingChanged(boolean playing) {
                playIcon.setImageResource(playing ? R.drawable.ic_p_pause : R.drawable.ic_p_play);
                if (playing) scheduleHide(); else if (controlsOn) handler.removeCallbacks(hideRun);
            }

            @Override
            public void onPlayerError(PlaybackException error) {
                Toast.makeText(PlayerActivity.this, "Can't play this stream: " + error.getErrorCodeName(), Toast.LENGTH_LONG).show();
            }
        });

        player.setMediaItem(item.build(), Math.max(0L, startMs));
        player.prepare();
        player.play();
        handler.postDelayed(ticker, 5000);
        handler.post(uiTick);
        showControls(playBtn);
    }

    /* ======================= Streamlet control layer ======================= */
    private int dp(float v) { return Math.round(v * getResources().getDisplayMetrics().density); }

    private GradientDrawable shape(boolean oval, int fill, int stroke, int strokeW, float radiusDp) {
        GradientDrawable g = new GradientDrawable();
        g.setShape(oval ? GradientDrawable.OVAL : GradientDrawable.RECTANGLE);
        g.setColor(fill);
        if (!oval) g.setCornerRadius(dp(radiusDp));
        if (strokeW > 0) g.setStroke(strokeW, stroke);
        return g;
    }

    private Drawable stateBg(boolean oval, int fill, int focusFill, float radiusDp) {
        StateListDrawable sl = new StateListDrawable();
        GradientDrawable f = shape(oval, focusFill, Color.WHITE, dp(2.5f), radiusDp);
        sl.addState(new int[]{android.R.attr.state_focused}, f);
        sl.addState(new int[]{android.R.attr.state_pressed}, f);
        sl.addState(new int[]{}, shape(oval, fill, 0x22FFFFFF, dp(1), radiusDp));
        return sl;
    }

    private TextView text(String t, float sp, boolean bold) {
        TextView v = new TextView(this);
        v.setText(t);
        v.setTextColor(Color.WHITE);
        v.setTextSize(sp);
        if (bold) v.setTypeface(Typeface.DEFAULT_BOLD);
        v.setSingleLine(true);
        return v;
    }

    private ImageView icon(int res, int sizeDp) {
        ImageView iv = new ImageView(this);
        iv.setImageResource(res);
        iv.setColorFilter(Color.WHITE);
        iv.setLayoutParams(new LinearLayout.LayoutParams(dp(sizeDp), dp(sizeDp)));
        return iv;
    }

    private FrameLayout circleBtn(int iconRes, int sizeDp, int iconDp, String badge, boolean mirror, View.OnClickListener c) {
        FrameLayout b = new FrameLayout(this);
        b.setBackground(stateBg(true, 0x33FFFFFF, 0x66FFFFFF, 0));
        b.setFocusable(true);
        b.setClickable(true);
        b.setOnClickListener(c);
        ImageView iv = new ImageView(this);
        iv.setImageResource(iconRes);
        iv.setColorFilter(Color.WHITE);
        if (mirror) iv.setScaleX(-1f);
        b.addView(iv, new FrameLayout.LayoutParams(dp(iconDp), dp(iconDp), Gravity.CENTER));
        if (badge != null) {
            TextView t = text(badge, 10, true);
            FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(-2, -2, Gravity.CENTER);
            lp.topMargin = dp(2);
            b.addView(t, lp);
        }
        b.setLayoutParams(new LinearLayout.LayoutParams(dp(sizeDp), dp(sizeDp)));
        return b;
    }

    private LinearLayout pill(int iconRes, String label, View.OnClickListener c, TextView[] holder) {
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.HORIZONTAL);
        l.setGravity(Gravity.CENTER_VERTICAL);
        l.setPadding(dp(16), dp(10), dp(20), dp(10));
        l.setBackground(stateBg(false, 0x30FFFFFF, 0xFF7C5CFF, 26));
        l.setFocusable(true);
        l.setClickable(true);
        l.setOnClickListener(c);
        ImageView iv = icon(iconRes, 20);
        l.addView(iv);
        TextView t = text(label, 14, true);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-2, -2);
        lp.leftMargin = dp(8);
        l.addView(t, lp);
        if (holder != null) holder[0] = t;
        LinearLayout.LayoutParams pl = new LinearLayout.LayoutParams(-2, -2);
        pl.rightMargin = dp(12);
        l.setLayoutParams(pl);
        return l;
    }

    private void buildControls(String title) {
        controls = new FrameLayout(this);
        int pad = dp(36);

        // top bar
        LinearLayout top = new LinearLayout(this);
        top.setOrientation(LinearLayout.HORIZONTAL);
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.setPadding(pad, dp(22), pad, dp(40));
        top.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, new int[]{0xE6000000, 0x00000000}));
        FrameLayout back = circleBtn(R.drawable.ic_p_back, 46, 24, null, false, v -> finishWith(false));
        top.addView(back);
        titleTx = text(title, 18, true);
        titleTx.setEllipsize(TextUtils.TruncateAt.END);
        LinearLayout.LayoutParams tl = new LinearLayout.LayoutParams(0, -2, 1f);
        tl.leftMargin = dp(16);
        top.addView(titleTx, tl);
        controls.addView(top, new FrameLayout.LayoutParams(-1, -2, Gravity.TOP));

        // centre transport
        LinearLayout mid = new LinearLayout(this);
        mid.setOrientation(LinearLayout.HORIZONTAL);
        mid.setGravity(Gravity.CENTER);
        FrameLayout rew = circleBtn(R.drawable.ic_p_replay, 58, 34, "10", false, v -> seekBy(-10000));
        FrameLayout ff = circleBtn(R.drawable.ic_p_replay, 58, 34, "10", true, v -> seekBy(10000));
        FrameLayout play = new FrameLayout(this);
        play.setBackground(playBg());
        play.setFocusable(true);
        play.setClickable(true);
        play.setOnClickListener(v -> togglePlay());
        playIcon = new ImageView(this);
        playIcon.setImageResource(R.drawable.ic_p_pause);
        playIcon.setColorFilter(Color.WHITE);
        play.addView(playIcon, new FrameLayout.LayoutParams(dp(40), dp(40), Gravity.CENTER));
        LinearLayout.LayoutParams pp = new LinearLayout.LayoutParams(dp(78), dp(78));
        pp.leftMargin = dp(34); pp.rightMargin = dp(34);
        playBtn = play;
        mid.addView(rew);
        mid.addView(play, pp);
        mid.addView(ff);
        controls.addView(mid, new FrameLayout.LayoutParams(-2, -2, Gravity.CENTER));

        // bottom: seek + pills
        LinearLayout bottom = new LinearLayout(this);
        bottom.setOrientation(LinearLayout.VERTICAL);
        bottom.setPadding(pad, dp(46), pad, dp(22));
        bottom.setBackground(new GradientDrawable(GradientDrawable.Orientation.BOTTOM_TOP, new int[]{0xEE000000, 0x00000000}));

        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        posTx = text("0:00", 14, true);
        durTx = text("0:00", 14, true);
        posTx.setAlpha(.9f); durTx.setAlpha(.7f);
        seek = new SeekBar(this);
        seek.setPadding(0, 0, 0, 0);
        seek.setMax(1);
        seek.setKeyProgressIncrement(10000);
        seek.setProgressDrawable(seekDrawable());
        GradientDrawable thumb = shape(true, Color.WHITE, 0, 0, 0);
        thumb.setSize(dp(18), dp(18));
        seek.setThumb(thumb);
        seek.setThumbOffset(0);
        seek.setSplitTrack(false);
        seek.setBackground(stateBg(false, 0x00000000, 0x22FFFFFF, 12));
        seek.setFocusable(true);
        seek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar sb, int p, boolean fromUser) {
                if (!fromUser) return;
                posTx.setText(fmt(p));
                seekPending = true;
                handler.removeCallbacks(seekRun);
                handler.postDelayed(seekRun, 400);
                scheduleHide();
            }
            @Override public void onStartTrackingTouch(SeekBar sb) { seekPending = true; handler.removeCallbacks(hideRun); }
            @Override public void onStopTrackingTouch(SeekBar sb) { handler.removeCallbacks(seekRun); seekRun.run(); scheduleHide(); }
        });
        LinearLayout.LayoutParams sl = new LinearLayout.LayoutParams(0, dp(40), 1f);
        sl.leftMargin = dp(14); sl.rightMargin = dp(14);
        row.addView(posTx);
        row.addView(seek, sl);
        row.addView(durTx);
        bottom.addView(row, new LinearLayout.LayoutParams(-1, -2));

        LinearLayout pills = new LinearLayout(this);
        pills.setOrientation(LinearLayout.HORIZONTAL);
        pills.setPadding(0, dp(8), 0, 0);
        final LinearLayout pSub = pill(R.drawable.ic_p_cc, "Subtitles", null, null);
        final LinearLayout pAud = pill(R.drawable.ic_p_audio, "Audio", null, null);
        TextView[] h = new TextView[1];
        final LinearLayout pSpd = pill(R.drawable.ic_p_speed, "1.0\u00d7", null, h);
        speedTx = h[0];
        final LinearLayout pSize = pill(R.drawable.ic_p_size, "Subtitle size", null, null);
        pSub.setOnClickListener(v -> openTrackMenu(pSub, "Subtitles", C.TRACK_TYPE_TEXT));
        pAud.setOnClickListener(v -> openTrackMenu(pAud, "Audio", C.TRACK_TYPE_AUDIO));
        pSpd.setOnClickListener(v -> openSpeedMenu(pSpd));
        pSize.setOnClickListener(v -> openSizeMenu(pSize));
        pills.addView(pSub); pills.addView(pAud); pills.addView(pSpd); pills.addView(pSize);
        bottom.addView(pills, new LinearLayout.LayoutParams(-2, -2));
        controls.addView(bottom, new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM));
        root.addView(controls, new FrameLayout.LayoutParams(-1, -1));

        // buffering spinner + quick seek flash
        spinner = new ProgressBar(this);
        spinner.setIndeterminateTintList(ColorStateList.valueOf(CYAN));
        root.addView(spinner, new FrameLayout.LayoutParams(dp(54), dp(54), Gravity.CENTER));
        flashTx = text("", 22, true);
        flashTx.setPadding(dp(22), dp(12), dp(22), dp(12));
        flashTx.setBackground(shape(false, 0xAA000000, 0, 0, 30));
        flashTx.setVisibility(View.GONE);
        FrameLayout.LayoutParams fl = new FrameLayout.LayoutParams(-2, -2, Gravity.CENTER_HORIZONTAL | Gravity.TOP);
        fl.topMargin = dp(90);
        root.addView(flashTx, fl);

        menuLayer = new FrameLayout(this);
        menuLayer.setVisibility(View.GONE);
        root.addView(menuLayer, new FrameLayout.LayoutParams(-1, -1));

        root.setOnClickListener(v -> { if (controlsOn) hideControls(); else showControls(playBtn); });
    }

    private Drawable playBg() {
        StateListDrawable sl = new StateListDrawable();
        GradientDrawable f = new GradientDrawable(GradientDrawable.Orientation.TL_BR, new int[]{ACC1, ACC2});
        f.setShape(GradientDrawable.OVAL);
        f.setStroke(dp(3.5f), Color.WHITE);
        GradientDrawable n = new GradientDrawable(GradientDrawable.Orientation.TL_BR, new int[]{ACC1, ACC2});
        n.setShape(GradientDrawable.OVAL);
        sl.addState(new int[]{android.R.attr.state_focused}, f);
        sl.addState(new int[]{android.R.attr.state_pressed}, f);
        sl.addState(new int[]{}, n);
        return sl;
    }

    private Drawable seekDrawable() {
        GradientDrawable bg = shape(false, 0x40FFFFFF, 0, 0, 3);
        GradientDrawable buf = shape(false, 0x55FFFFFF, 0, 0, 3);
        GradientDrawable fg = new GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT, new int[]{ACC1, CYAN});
        fg.setCornerRadius(dp(3));
        LayerDrawable ld = new LayerDrawable(new Drawable[]{bg, new ClipDrawable(buf, Gravity.START, ClipDrawable.HORIZONTAL), new ClipDrawable(fg, Gravity.START, ClipDrawable.HORIZONTAL)});
        ld.setId(0, android.R.id.background);
        ld.setId(1, android.R.id.secondaryProgress);
        ld.setId(2, android.R.id.progress);
        for (int i = 0; i < 3; i++) ld.setLayerInset(i, 0, dp(17), 0, dp(17));
        return ld;
    }

    private void styleSubtitles() {
        SubtitleView sv = view.getSubtitleView();
        if (sv == null) return;
        sv.setApplyEmbeddedStyles(false);
        sv.setApplyEmbeddedFontSizes(false);
        sv.setStyle(new CaptionStyleCompat(Color.WHITE, Color.TRANSPARENT, Color.TRANSPARENT, CaptionStyleCompat.EDGE_TYPE_OUTLINE, Color.BLACK, Typeface.DEFAULT_BOLD));
        sv.setBottomPaddingFraction(0.09f);
        sv.setFractionalTextSize(SubtitleView.DEFAULT_TEXT_SIZE_FRACTION * SUB_SCALES[prefs.getInt("subSize", 1)]);
    }

    private static String fmt(long ms) {
        long s = Math.max(0, ms) / 1000, h = s / 3600, m = (s % 3600) / 60, x = s % 60;
        return h > 0 ? String.format(Locale.US, "%d:%02d:%02d", h, m, x) : String.format(Locale.US, "%d:%02d", m, x);
    }

    private void refreshProgress() {
        if (player == null || seekPending || seek == null) return;
        long d = player.getDuration();
        if (d != C.TIME_UNSET && d > 0) {
            seek.setMax((int) Math.min(d, Integer.MAX_VALUE));
            durTx.setText(fmt(d));
        }
        seek.setProgress((int) Math.min(Math.max(0, player.getCurrentPosition()), seek.getMax()));
        seek.setSecondaryProgress((int) Math.min(Math.max(0, player.getBufferedPosition()), seek.getMax()));
        posTx.setText(fmt(player.getCurrentPosition()));
    }

    private void flash(String t) {
        flashTx.setText(t);
        flashTx.setVisibility(View.VISIBLE);
        handler.removeCallbacks(flashHide);
        handler.postDelayed(flashHide, 900);
    }

    private void seekBy(long delta) {
        if (player == null) return;
        long d = player.getDuration();
        long t = player.getCurrentPosition() + delta;
        if (d != C.TIME_UNSET && d > 0) t = Math.min(t, d - 500);
        player.seekTo(Math.max(0, t));
        refreshProgress();
        flash(delta < 0 ? "\u2212" + Math.abs(delta / 1000) + " s" : "+" + (delta / 1000) + " s");
        scheduleHide();
    }

    private void togglePlay() {
        if (player == null) return;
        if (player.isPlaying()) player.pause(); else player.play();
        scheduleHide();
    }

    private void showControls(View focus) {
        if (menuOn) return;
        controlsOn = true;
        controls.setVisibility(View.VISIBLE);
        controls.animate().alpha(1f).setDuration(180).start();
        if (focus != null) focus.requestFocus();
        scheduleHide();
    }

    private void hideControls() {
        controlsOn = false;
        handler.removeCallbacks(hideRun);
        controls.animate().alpha(0f).setDuration(180).withEndAction(() -> { if (!controlsOn) controls.setVisibility(View.GONE); }).start();
    }

    private void scheduleHide() {
        handler.removeCallbacks(hideRun);
        if (controlsOn) handler.postDelayed(hideRun, 4500);
    }

    /* ---- menus ---- */
    private interface Pick { void on(int index); }

    private void openMenu(View opener, String title, List<String> labels, int selected, Pick pick) {
        menuOpener = opener;
        menuOn = true;
        handler.removeCallbacks(hideRun);
        controls.setVisibility(View.GONE);
        controlsOn = false;
        menuLayer.removeAllViews();
        menuLayer.setVisibility(View.VISIBLE);
        menuLayer.setBackgroundColor(0x88000000);
        menuLayer.setClickable(true);
        menuLayer.setOnClickListener(v -> closeMenu());

        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(dp(14), dp(18), dp(14), dp(14));
        panel.setBackground(new GradientDrawable(GradientDrawable.Orientation.TL_BR, new int[]{0xF2201A38, 0xF20E0E18}));
        ((GradientDrawable) panel.getBackground()).setCornerRadius(dp(26));
        ((GradientDrawable) panel.getBackground()).setStroke(dp(1), 0x33FFFFFF);
        panel.setClickable(true);
        TextView ttl = text(title, 20, true);
        ttl.setPadding(dp(10), 0, 0, dp(12));
        panel.addView(ttl);
        ScrollView sc = new ScrollView(this);
        LinearLayout list = new LinearLayout(this);
        list.setOrientation(LinearLayout.VERTICAL);
        sc.addView(list);
        panel.addView(sc, new LinearLayout.LayoutParams(-1, 0, 1f));
        View first = null;
        for (int i = 0; i < labels.size(); i++) {
            final int idx = i;
            LinearLayout r = new LinearLayout(this);
            r.setOrientation(LinearLayout.HORIZONTAL);
            r.setGravity(Gravity.CENTER_VERTICAL);
            r.setPadding(dp(16), dp(13), dp(16), dp(13));
            r.setBackground(stateBg(false, i == selected ? 0x26FFFFFF : 0x00000000, 0xFF7C5CFF, 16));
            r.setFocusable(true);
            r.setClickable(true);
            TextView l = text(labels.get(i), 16, i == selected);
            l.setEllipsize(TextUtils.TruncateAt.END);
            r.addView(l, new LinearLayout.LayoutParams(0, -2, 1f));
            if (i == selected) {
                TextView ck = text("\u2713", 18, true);
                ck.setTextColor(CYAN);
                r.addView(ck);
            }
            r.setOnClickListener(v -> { pick.on(idx); closeMenu(); });
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
            lp.bottomMargin = dp(4);
            list.addView(r, lp);
            if (i == selected || first == null) { if (first == null || i == selected) first = r; }
        }
        FrameLayout.LayoutParams pl = new FrameLayout.LayoutParams(dp(340), -1, Gravity.END);
        pl.topMargin = dp(20); pl.bottomMargin = dp(20); pl.rightMargin = dp(24);
        menuLayer.addView(panel, pl);
        final View f = first;
        if (f != null) f.post(f::requestFocus);
    }

    private void closeMenu() {
        if (!menuOn) return;
        menuOn = false;
        menuLayer.removeAllViews();
        menuLayer.setVisibility(View.GONE);
        controls.setVisibility(View.VISIBLE);
        controls.setAlpha(1f);
        controlsOn = true;
        if (menuOpener != null) menuOpener.requestFocus();
        scheduleHide();
    }

    private static class TrackRef { Tracks.Group g; int idx; String label; boolean sel; }

    private List<TrackRef> tracksOf(int type) {
        List<TrackRef> out = new ArrayList<>();
        if (player == null) return out;
        int n = 0;
        for (Tracks.Group g : player.getCurrentTracks().getGroups()) {
            if (g.getType() != type) continue;
            for (int i = 0; i < g.length; i++) {
                if (!g.isTrackSupported(i)) continue;
                n++;
                Format f = g.getTrackFormat(i);
                String label = f.label;
                if (label == null || label.isEmpty()) {
                    if (f.language != null && !"und".equals(f.language)) label = new Locale(f.language).getDisplayLanguage();
                    if (label == null || label.isEmpty()) label = (type == C.TRACK_TYPE_AUDIO ? "Audio " : "Track ") + n;
                }
                if (type == C.TRACK_TYPE_AUDIO && f.channelCount > 2) label += f.channelCount == 6 ? " \u00b7 5.1" : f.channelCount == 8 ? " \u00b7 7.1" : "";
                TrackRef t = new TrackRef();
                t.g = g; t.idx = i; t.label = label; t.sel = g.isTrackSelected(i);
                out.add(t);
            }
        }
        return out;
    }

    private void openTrackMenu(View opener, String title, int type) {
        final List<TrackRef> refs = tracksOf(type);
        final boolean text = type == C.TRACK_TYPE_TEXT;
        List<String> labels = new ArrayList<>();
        int selected = -1;
        if (text) labels.add("Off");
        for (TrackRef t : refs) labels.add(t.label);
        for (int i = 0; i < refs.size(); i++) if (refs.get(i).sel) selected = i + (text ? 1 : 0);
        if (text && selected < 0) selected = 0;
        if (refs.isEmpty()) { flash(text ? "No subtitles available" : "No other audio tracks"); return; }
        openMenu(opener, title, labels, selected, idx -> {
            TrackSelectionParameters.Builder b = player.getTrackSelectionParameters().buildUpon();
            if (text && idx == 0) {
                b.setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true);
                b.clearOverridesOfType(C.TRACK_TYPE_TEXT);
            } else {
                TrackRef t = refs.get(idx - (text ? 1 : 0));
                b.setTrackTypeDisabled(type, false);
                b.setOverrideForType(new TrackSelectionOverride(t.g.getMediaTrackGroup(), t.idx));
            }
            player.setTrackSelectionParameters(b.build());
        });
    }

    private void openSpeedMenu(View opener) {
        List<String> labels = new ArrayList<>();
        int sel = 2;
        for (int i = 0; i < SPEEDS.length; i++) {
            labels.add(SPEEDS[i] == 1f ? "Normal" : SPEEDS[i] + "\u00d7");
            if (SPEEDS[i] == speed) sel = i;
        }
        openMenu(opener, "Playback speed", labels, sel, idx -> {
            speed = SPEEDS[idx];
            player.setPlaybackSpeed(speed);
            speedTx.setText(String.format(Locale.US, "%.2f", speed).replaceAll("0+$", "").replaceAll("\\.$", ".0") + "\u00d7");
        });
    }

    private void openSizeMenu(View opener) {
        List<String> labels = new ArrayList<>();
        for (String n : SUB_NAMES) labels.add(n);
        openMenu(opener, "Subtitle size", labels, prefs.getInt("subSize", 1), idx -> {
            prefs.edit().putInt("subSize", idx).apply();
            styleSubtitles();
            flash("Subtitles: " + SUB_NAMES[idx]);
        });
    }

    private void snapshot() {
        if (player == null) return;
        lastPos = Math.max(0L, player.getCurrentPosition());
        long d = player.getDuration();
        lastDur = d == C.TIME_UNSET ? 0L : Math.max(0L, d);
    }

    private void finishWith(boolean ended) {
        if (reported) return;
        snapshot();
        reported = true;
        ExoPlayerPlugin.finished(ended && lastDur > 0 ? lastDur : lastPos, lastDur, ended);
        finish();
    }

    private void hideSystemUi() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUi();
    }

    @Override
    public boolean dispatchTouchEvent(MotionEvent ev) {
        if (controlsOn) scheduleHide();
        return super.dispatchTouchEvent(ev);
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            if (menuOn) { closeMenu(); return true; }
            if (controlsOn) { hideControls(); return true; }
            finishWith(false);
            return true;
        }
        if (controlsOn) scheduleHide();
        switch (keyCode) {
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
                togglePlay(); if (!controlsOn && !menuOn) showControls(null); return true;
            case KeyEvent.KEYCODE_MEDIA_PLAY: if (player != null) player.play(); return true;
            case KeyEvent.KEYCODE_MEDIA_PAUSE: if (player != null) player.pause(); return true;
            case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD: seekBy(30000); return true;
            case KeyEvent.KEYCODE_MEDIA_REWIND: seekBy(-30000); return true;
            default: break;
        }
        if (!controlsOn && !menuOn) {
            switch (keyCode) {
                case KeyEvent.KEYCODE_DPAD_CENTER:
                case KeyEvent.KEYCODE_ENTER:
                case KeyEvent.KEYCODE_SPACE:
                    togglePlay(); showControls(playBtn); return true;
                case KeyEvent.KEYCODE_DPAD_LEFT: seekBy(-10000); showControls(seek); return true;
                case KeyEvent.KEYCODE_DPAD_RIGHT: seekBy(10000); showControls(seek); return true;
                case KeyEvent.KEYCODE_DPAD_UP:
                case KeyEvent.KEYCODE_DPAD_DOWN: showControls(playBtn); return true;
                default: break;
            }
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    public void onBackPressed() {
        if (menuOn) { closeMenu(); return; }
        if (controlsOn) { hideControls(); return; }
        finishWith(false);
    }

    @Override
    protected void onStop() {
        super.onStop();
        if (player != null) player.pause();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (!reported) {
            snapshot();
            reported = true;
            ExoPlayerPlugin.finished(lastPos, lastDur, false);
        }
        if (player != null) {
            player.release();
            player = null;
        }
        super.onDestroy();
    }
}
