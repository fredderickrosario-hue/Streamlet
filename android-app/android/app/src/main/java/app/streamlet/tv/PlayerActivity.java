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
import androidx.media3.datasource.DefaultDataSource;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.extractor.DefaultExtractorsFactory;
import androidx.media3.extractor.mkv.MatroskaExtractor;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.ui.PlayerView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.net.HttpURLConnection;
import java.net.URL;
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

    // ---- failed source dialog
    private FrameLayout errLayer;
    private TextView errMsg, errCode;
    private TextView errNextLabel;
    private View errNextBtn;
    private boolean errOn = false;
    private MediaItem mediaItem;
    private TrackSelectionParameters trackParams;
    private Player.Listener playerListener;
    private boolean compatTried = false;
    private String streamSubtitle = "";
    private TextView subTx;
    private String streamUrl = "", streamTitle = "";
    private static final String UA = "Mozilla/5.0 (Linux; Android 12; TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
    private int countdown = 0;
    private final Runnable tick = new Runnable() { @Override public void run() {
        if (!errOn) return;
        countdown--;
        if (countdown <= 0) { failAndLeave(true); return; }
        if (errNextLabel != null) errNextLabel.setText("Try next source (" + countdown + ")");
        handler.postDelayed(this, 1000);
    } };

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
    private TextView avTx;
    private static class SubCfg { String url, mime, lang, label; boolean shiftable, vtt; }
    private final List<SubCfg> subCfgs = new ArrayList<>();
    private final Map<String, String> subText = new HashMap<>();
    private long subDelayMs = 0;
    private boolean delayDirty = false;
    private String pendingSubLabel = null;
    private final Runnable delayRun = new Runnable() { @Override public void run() { applyDelay(); } };
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
        streamUrl = url == null ? "" : url; streamTitle = title == null ? "" : title;
        String st = in.getStringExtra("subtitle"); streamSubtitle = st == null ? "" : st;
        long startMs = in.getLongExtra("startMs", 0L);
        String audioLang = in.getStringExtra("audioLang");
        String subLang = in.getStringExtra("subLang");

        player = makePlayer(false);
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
                SubCfg sc = new SubCfg();
                sc.url = su; sc.mime = mime; sc.lang = o.optString("lang", null); sc.label = o.optString("label", null);
                sc.vtt = MimeTypes.TEXT_VTT.equals(mime);
                sc.shiftable = !MimeTypes.TEXT_SSA.equals(mime);
                subCfgs.add(sc);
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
        trackParams = tp.build();
        player.setTrackSelectionParameters(trackParams);

        playerListener = new Player.Listener() {
            @Override
            public void onPlaybackStateChanged(int state) {
                if (state == Player.STATE_ENDED) finishWith(true);
                spinner.setVisibility(state == Player.STATE_BUFFERING ? View.VISIBLE : View.GONE);
                refreshProgress();
            }

            @Override
            public void onTracksChanged(Tracks tracks) {
                if (pendingSubLabel != null) {
                    List<TrackRef> tx = tracksOf(C.TRACK_TYPE_TEXT);
                    for (TrackRef t : tx) {
                        if (pendingSubLabel.equals(t.label)) {
                            pendingSubLabel = null;
                            if (!t.sel) applyTrack(C.TRACK_TYPE_TEXT, tx, tx.indexOf(t) + 1);
                            break;
                        }
                    }
                }
                updateAvLabel();
            }

            @Override
            public void onIsPlayingChanged(boolean playing) {
                playIcon.setImageResource(playing ? R.drawable.ic_p_pause : R.drawable.ic_p_play);
                if (playing) scheduleHide(); else if (controlsOn) handler.removeCallbacks(hideRun);
            }

            @Override
            public void onPlayerError(PlaybackException error) {
                boolean parse = error.errorCode == PlaybackException.ERROR_CODE_PARSING_CONTAINER_MALFORMED
                        || error.errorCode == PlaybackException.ERROR_CODE_PARSING_CONTAINER_UNSUPPORTED;
                if (parse && !compatTried) { compatTried = true; handler.post(() -> retryCompat()); return; }          // some MKVs only play when the player doesn't hunt for the index at the end
                showError(friendly(error), error.getErrorCodeName());
            }
        };
        player.addListener(playerListener);

        mediaItem = item.build();
        player.setMediaItem(mediaItem, Math.max(0L, startMs));
        player.prepare();
        player.play();
        handler.postDelayed(ticker, 5000);
        handler.post(uiTick);
        showControls(playBtn);
    }

    private ExoPlayer makePlayer(boolean compat) {
        DefaultHttpDataSource.Factory http = new DefaultHttpDataSource.Factory()
                .setUserAgent(UA)
                .setAllowCrossProtocolRedirects(true)
                .setConnectTimeoutMs(15000)
                .setReadTimeoutMs(25000);
        DefaultExtractorsFactory ex = new DefaultExtractorsFactory();
        if (compat) ex.setMatroskaExtractorFlags(MatroskaExtractor.FLAG_DISABLE_SEEK_FOR_CUES);
        return new ExoPlayer.Builder(this)
                .setMediaSourceFactory(new DefaultMediaSourceFactory(new DefaultDataSource.Factory(this, http), ex))
                .build();
    }

    /** Second try for files the strict reader rejects: start from the beginning and skip the seek index. Seeking is limited in this mode. */
    private void retryCompat() {
        compatTried = true;
        try { if (player != null) player.release(); } catch (Exception ignored) { }
        player = makePlayer(true);
        view.setPlayer(player);
        player.setTrackSelectionParameters(trackParams);
        player.addListener(playerListener);
        player.setMediaItem(mediaItem, 0L);
        player.prepare();
        player.play();
        flash("Compatibility mode \u00b7 seeking is limited");
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

    private Drawable fillBg(int normal, int focused, float radiusDp, boolean oval) {
        StateListDrawable sl = new StateListDrawable();
        GradientDrawable f = shape(oval, focused, 0, 0, radiusDp);
        sl.addState(new int[]{android.R.attr.state_focused}, f);
        sl.addState(new int[]{android.R.attr.state_pressed}, f);
        sl.addState(new int[]{}, shape(oval, normal, 0, 0, radiusDp));
        return sl;
    }

    private Drawable softBg(boolean oval, float radiusDp) { return fillBg(0x00000000, 0x38FFFFFF, radiusDp, oval); }

    /** icon-only button that grows a label when it has focus */
    private LinearLayout quick(int iconRes, String label, View.OnClickListener c, TextView[] holder) {
        final LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.HORIZONTAL);
        l.setGravity(Gravity.CENTER_VERTICAL);
        l.setPadding(dp(18), dp(12), dp(22), dp(12));
        l.setBackground(softBg(false, 28));
        l.setFocusable(true);
        l.setClickable(true);
        l.setOnClickListener(c);
        ImageView iv = icon(iconRes, 24);
        iv.setAlpha(.95f);
        l.addView(iv);
        final TextView t = text(label, 15, true);
        t.setAlpha(.92f);
        LinearLayout.LayoutParams tl = new LinearLayout.LayoutParams(-2, -2);
        tl.leftMargin = dp(10);
        l.addView(t, tl);
        l.setOnFocusChangeListener((v, f) -> v.animate().scaleX(f ? 1.06f : 1f).scaleY(f ? 1.06f : 1f).setDuration(120).start());
        if (holder != null) holder[0] = t;
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-2, -2);
        lp.leftMargin = dp(6);
        l.setLayoutParams(lp);
        return l;
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
        b.setBackground(softBg(true, 0));
        b.setFocusable(true);
        b.setClickable(true);
        b.setOnClickListener(c);
        b.setOnFocusChangeListener((v, f) -> v.animate().scaleX(f ? 1.1f : 1f).scaleY(f ? 1.1f : 1f).setDuration(120).start());
        ImageView iv = new ImageView(this);
        iv.setImageResource(iconRes);
        iv.setColorFilter(Color.WHITE);
        iv.setAlpha(.95f);
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
        l.setBackground(fillBg(0x1FFFFFFF, 0x45FFFFFF, 26, false));
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

        // top: back arrow, title and (for episodes) the episode line
        LinearLayout top = new LinearLayout(this);
        top.setOrientation(LinearLayout.HORIZONTAL);
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.setPadding(dp(40), dp(28), pad, dp(70));
        top.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, new int[]{0xC8000000, 0x66000000, 0x00000000}));
        FrameLayout back = circleBtn(R.drawable.ic_p_back, 48, 26, null, false, v -> finishWith(false));
        top.addView(back);
        LinearLayout tcol = new LinearLayout(this);
        tcol.setOrientation(LinearLayout.VERTICAL);
        titleTx = text(title, 24, true);
        titleTx.setEllipsize(TextUtils.TruncateAt.END);
        tcol.addView(titleTx);
        subTx = text(streamSubtitle, 15, false);
        subTx.setAlpha(.7f);
        subTx.setEllipsize(TextUtils.TruncateAt.END);
        subTx.setVisibility(streamSubtitle.isEmpty() ? View.GONE : View.VISIBLE);
        tcol.addView(subTx);
        LinearLayout.LayoutParams tl = new LinearLayout.LayoutParams(0, -2, 1f);
        tl.leftMargin = dp(16);
        top.addView(tcol, tl);
        controls.addView(top, new FrameLayout.LayoutParams(-1, -2, Gravity.TOP));

        // bottom: [play] elapsed ---- remaining, then one centered row: audio & subtitles + options
        LinearLayout bottom = new LinearLayout(this);
        bottom.setOrientation(LinearLayout.VERTICAL);
        bottom.setPadding(dp(56), dp(110), dp(56), dp(26));
        bottom.setBackground(new GradientDrawable(GradientDrawable.Orientation.BOTTOM_TOP, new int[]{0xF2000000, 0xB0000000, 0x00000000}));

        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        FrameLayout play = new FrameLayout(this);
        play.setBackground(fillBg(0xEFFFFFFF, 0xFFFFFFFF, 0, true));
        play.setFocusable(true);
        play.setClickable(true);
        play.setOnClickListener(v -> togglePlay());
        play.setOnFocusChangeListener((v, f) -> v.animate().scaleX(f ? 1.1f : 1f).scaleY(f ? 1.1f : 1f).setDuration(120).start());
        playIcon = new ImageView(this);
        playIcon.setImageResource(R.drawable.ic_p_pause);
        playIcon.setColorFilter(0xFF12121C);
        play.addView(playIcon, new FrameLayout.LayoutParams(dp(28), dp(28), Gravity.CENTER));
        playBtn = play;
        row.addView(play, new LinearLayout.LayoutParams(dp(52), dp(52)));
        posTx = text("0:00", 15, true);
        durTx = text("", 15, true);
        posTx.setAlpha(.95f); durTx.setAlpha(.7f);
        seek = new SeekBar(this);
        seek.setPadding(0, 0, 0, 0);
        seek.setMax(1);
        seek.setKeyProgressIncrement(10000);
        seek.setProgressDrawable(seekDrawable());
        final GradientDrawable thumbS = shape(true, Color.WHITE, 0, 0, 0); thumbS.setSize(dp(14), dp(14));
        final GradientDrawable thumbL = shape(true, Color.WHITE, 0x66FFFFFF, dp(4), 0); thumbL.setSize(dp(26), dp(26));
        seek.setThumb(thumbS);
        seek.setThumbOffset(0);
        seek.setSplitTrack(false);
        seek.setBackground(null);
        seek.setFocusable(true);
        seek.setOnClickListener(v -> togglePlay());
        seek.setOnFocusChangeListener((v, f) -> { seek.setThumb(f ? thumbL : thumbS); seek.setThumbOffset(0); seek.invalidate(); });
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
        LinearLayout.LayoutParams pt = new LinearLayout.LayoutParams(-2, -2);
        pt.leftMargin = dp(20);
        LinearLayout.LayoutParams sl = new LinearLayout.LayoutParams(0, dp(34), 1f);
        sl.leftMargin = dp(16); sl.rightMargin = dp(16);
        row.addView(posTx, pt);
        row.addView(seek, sl);
        row.addView(durTx);
        bottom.addView(row, new LinearLayout.LayoutParams(-1, -2));

        LinearLayout ctl = new LinearLayout(this);
        ctl.setOrientation(LinearLayout.HORIZONTAL);
        ctl.setGravity(Gravity.CENTER);
        ctl.setPadding(0, dp(12), 0, 0);
        TextView[] h = new TextView[1];
        final LinearLayout qAv = quick(R.drawable.ic_p_cc, "Audio & subtitles", null, h);
        avTx = h[0];
        qAv.setOnClickListener(v -> openCombo(qAv));
        final FrameLayout gear = circleBtn(R.drawable.ic_p_gear, 48, 26, null, false, null);
        gear.setOnClickListener(v -> openOptions(gear));
        LinearLayout.LayoutParams gp = new LinearLayout.LayoutParams(dp(48), dp(48));
        gp.leftMargin = dp(8);
        ctl.addView(qAv); ctl.addView(gear, gp);
        bottom.addView(ctl, new LinearLayout.LayoutParams(-1, -2));
        controls.addView(bottom, new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM));
        root.addView(controls, new FrameLayout.LayoutParams(-1, -1));

        // buffering spinner + quick seek flash
        spinner = new ProgressBar(this);
        spinner.setIndeterminateTintList(ColorStateList.valueOf(Color.WHITE));
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

        errLayer = new FrameLayout(this);
        errLayer.setVisibility(View.GONE);
        errLayer.setBackgroundColor(0xE6000000);
        errLayer.setClickable(true);
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(34), dp(30), dp(34), dp(28));
        GradientDrawable cbg = new GradientDrawable(GradientDrawable.Orientation.TL_BR, new int[]{0xFF241C3F, 0xFF0F0F18});
        cbg.setCornerRadius(dp(26)); cbg.setStroke(dp(1), 0x33FFFFFF);
        card.setBackground(cbg);
        TextView et = text("This source can't be played", 22, true);
        errMsg = text("", 16, false);
        errMsg.setSingleLine(false); errMsg.setAlpha(.85f);
        errMsg.setPadding(0, dp(10), 0, 0);
        errCode = text("", 12, false);
        errCode.setAlpha(.5f); errCode.setPadding(0, dp(8), 0, dp(22));
        LinearLayout btns = new LinearLayout(this);
        btns.setOrientation(LinearLayout.HORIZONTAL);
        TextView[] hold = new TextView[1];
        LinearLayout nextB = pill(R.drawable.ic_p_play, "Try next source (6)", v -> failAndLeave(true), hold);
        errNextLabel = hold[0]; errNextBtn = nextB;
        LinearLayout backB = pill(R.drawable.ic_p_back, "Back to sources", v -> failAndLeave(false), null);
        LinearLayout otherB = pill(R.drawable.ic_p_speed, "Open in another app", v -> openElsewhere(), null);
        btns.addView(nextB); btns.addView(otherB); btns.addView(backB);
        card.addView(et); card.addView(errMsg); card.addView(errCode); card.addView(btns);
        errLayer.addView(card, new FrameLayout.LayoutParams(dp(720), -2, Gravity.CENTER));
        root.addView(errLayer, new FrameLayout.LayoutParams(-1, -1));

        root.setOnClickListener(v -> { if (controlsOn) hideControls(); else showControls(playBtn); });
    }

    private Drawable seekDrawable() {
        GradientDrawable bg = shape(false, 0x40FFFFFF, 0, 0, 3);
        GradientDrawable buf = shape(false, 0x55FFFFFF, 0, 0, 3);
        GradientDrawable fg = new GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT, new int[]{ACC1, ACC2});
        fg.setCornerRadius(dp(3));
        LayerDrawable ld = new LayerDrawable(new Drawable[]{bg, new ClipDrawable(buf, Gravity.START, ClipDrawable.HORIZONTAL), new ClipDrawable(fg, Gravity.START, ClipDrawable.HORIZONTAL)});
        ld.setId(0, android.R.id.background);
        ld.setId(1, android.R.id.secondaryProgress);
        ld.setId(2, android.R.id.progress);
        for (int i = 0; i < 3; i++) ld.setLayerInset(i, 0, dp(14), 0, dp(14));
        return ld;
    }

    private static final int[] SUB_COLORS = {0xFFFFFFFF, 0xFFFFE066, 0xFF22D3EE};
    private static final String[] SUB_COLOR_NAMES = {"White", "Yellow", "Cyan"};
    private static final String[] SUB_BG_NAMES = {"None", "Box"};
    private static final String[] SUB_EDGE_NAMES = {"Outline", "Shadow", "None"};

    private void styleSubtitles() {
        SubtitleView sv = view.getSubtitleView();
        if (sv == null) return;
        sv.setApplyEmbeddedStyles(false);
        sv.setApplyEmbeddedFontSizes(false);
        int edge = prefs.getInt("subEdge", 0);
        int edgeType = edge == 0 ? CaptionStyleCompat.EDGE_TYPE_OUTLINE : edge == 1 ? CaptionStyleCompat.EDGE_TYPE_DROP_SHADOW : CaptionStyleCompat.EDGE_TYPE_NONE;
        sv.setStyle(new CaptionStyleCompat(SUB_COLORS[prefs.getInt("subColor", 0)], prefs.getInt("subBg", 0) == 1 ? 0xB3000000 : Color.TRANSPARENT,
                Color.TRANSPARENT, edgeType, Color.BLACK, Typeface.DEFAULT_BOLD));
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
            durTx.setText("\u2212" + fmt(d - Math.max(0, player.getCurrentPosition())));
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
        panel.setBackground(new GradientDrawable(GradientDrawable.Orientation.TL_BR, new int[]{0xF2161622, 0xF20B0B12}));
        ((GradientDrawable) panel.getBackground()).setCornerRadius(dp(26));
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
            r.setBackground(fillBg(i == selected ? 0x16FFFFFF : 0x00000000, 0x33FFFFFF, 16, false));
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
        if (delayDirty) applyDelay();
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

    private void applyTrack(int type, List<TrackRef> refs, int idx) {
        final boolean text = type == C.TRACK_TYPE_TEXT;
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
    }

    /* ---- one list with audio + subtitle choices ---- */
    private static class Combo { int a, t; String label; boolean sel; }

    private String curAudioLabel() {
        for (TrackRef t : tracksOf(C.TRACK_TYPE_AUDIO)) if (t.sel) return t.label;
        return null;
    }

    private void updateAvLabel() {
        if (avTx == null || player == null) return;
        String a = curAudioLabel(), sb = null;
        for (TrackRef t : tracksOf(C.TRACK_TYPE_TEXT)) if (t.sel) sb = t.label;
        String txt;
        if (a == null && sb == null) txt = tracksOf(C.TRACK_TYPE_TEXT).isEmpty() ? "Audio & subtitles" : "Subtitles off";
        else txt = (a == null ? "" : a) + (sb != null ? (a == null ? "" : " \u00b7 ") + sb + " subs" : "");
        avTx.setText(txt);
    }

    private void openCombo(View opener) {
        final List<TrackRef> aud = tracksOf(C.TRACK_TYPE_AUDIO), txt = tracksOf(C.TRACK_TYPE_TEXT);
        int curA = -1, curT = -1;
        for (int i = 0; i < aud.size(); i++) if (aud.get(i).sel) curA = i;
        for (int j = 0; j < txt.size(); j++) if (txt.get(j).sel) curT = j;
        if (aud.isEmpty() && txt.isEmpty()) { flash("No other audio or subtitles in this file"); return; }
        List<Combo> cs = new ArrayList<>();
        int nA = Math.max(1, aud.size());
        for (int k = 0; k < nA; k++) {
            int a = aud.isEmpty() ? -1 : (curA + k + (curA < 0 ? 0 : 0)) % nA;
            if (curA < 0) a = aud.isEmpty() ? -1 : k;
            String al = a < 0 ? "" : aud.get(a).label;
            Combo off = new Combo();
            off.a = a; off.t = -1; off.label = a < 0 ? "Subtitles off" : al; off.sel = a == curA && curT < 0;
            cs.add(off);
            Set<String> seen = new HashSet<>();
            int added = 0;
            for (int j = 0; j < txt.size() && added < 6; j++) {
                String sl = txt.get(j).label;
                if (!seen.add(sl)) continue;
                added++;
                Combo c = new Combo();
                c.a = a; c.t = j;
                if (a < 0) c.label = sl + " subtitles";
                else if (sl.equalsIgnoreCase(al)) c.label = al + " with subtitles";
                else c.label = al + " \u00b7 " + sl + " subtitles";
                c.sel = a == curA && txt.get(j).sel;
                cs.add(c);
            }
        }
        List<String> labels = new ArrayList<>();
        int sel = 0;
        for (int i = 0; i < cs.size(); i++) { labels.add(cs.get(i).label); if (cs.get(i).sel) sel = i; }
        final List<Combo> fcs = cs;
        openCenter("Audio & subtitles", labels, sel, opener, idx -> {
            Combo c = fcs.get(idx);
            TrackSelectionParameters.Builder b = player.getTrackSelectionParameters().buildUpon();
            if (c.a >= 0) {
                b.setTrackTypeDisabled(C.TRACK_TYPE_AUDIO, false);
                b.setOverrideForType(new TrackSelectionOverride(aud.get(c.a).g.getMediaTrackGroup(), aud.get(c.a).idx));
            }
            if (c.t < 0) {
                b.setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true);
                b.clearOverridesOfType(C.TRACK_TYPE_TEXT);
            } else {
                b.setTrackTypeDisabled(C.TRACK_TYPE_TEXT, false);
                b.setOverrideForType(new TrackSelectionOverride(txt.get(c.t).g.getMediaTrackGroup(), txt.get(c.t).idx));
            }
            player.setTrackSelectionParameters(b.build());
            handler.postDelayed(this::updateAvLabel, 400);
        });
    }

    /** centered popup list */
    private void openCenter(String title, List<String> labels, int selected, View opener, Pick pick) {
        menuOpener = opener;
        menuOn = true;
        handler.removeCallbacks(hideRun);
        controls.setVisibility(View.GONE);
        controlsOn = false;
        menuLayer.removeAllViews();
        menuLayer.setVisibility(View.VISIBLE);
        menuLayer.setBackgroundColor(0x99000000);
        menuLayer.setClickable(true);
        menuLayer.setOnClickListener(v -> closeMenu());
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(dp(16), dp(22), dp(16), dp(16));
        GradientDrawable pbg = new GradientDrawable(GradientDrawable.Orientation.TL_BR, new int[]{0xF2161622, 0xF20B0B12});
        pbg.setCornerRadius(dp(28));
        panel.setBackground(pbg);
        panel.setClickable(true);
        TextView ttl = text(title, 20, true);
        ttl.setPadding(dp(14), 0, 0, dp(12));
        panel.addView(ttl);
        ScrollView sc = new ScrollView(this);
        sc.setVerticalScrollBarEnabled(false);
        LinearLayout list = new LinearLayout(this);
        list.setOrientation(LinearLayout.VERTICAL);
        sc.addView(list);
        panel.addView(sc, new LinearLayout.LayoutParams(-1, Math.min(dp(60) + labels.size() * dp(50), dp(330))));
        View first = null;
        for (int i = 0; i < labels.size(); i++) {
            final int idx = i;
            LinearLayout r = new LinearLayout(this);
            r.setOrientation(LinearLayout.HORIZONTAL);
            r.setGravity(Gravity.CENTER_VERTICAL);
            r.setPadding(dp(18), dp(13), dp(18), dp(13));
            r.setBackground(fillBg(i == selected ? 0x16FFFFFF : 0x00000000, 0x38FFFFFF, 16, false));
            r.setFocusable(true);
            r.setClickable(true);
            TextView l = text(labels.get(i), 17, i == selected);
            l.setEllipsize(TextUtils.TruncateAt.END);
            r.addView(l, new LinearLayout.LayoutParams(0, -2, 1f));
            if (i == selected) { TextView ck = text("\u2713", 18, true); ck.setTextColor(CYAN); r.addView(ck); }
            r.setOnClickListener(v -> { pick.on(idx); closeMenu(); });
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
            lp.bottomMargin = dp(3);
            list.addView(r, lp);
            if (first == null || i == selected) first = r;
        }
        menuLayer.addView(panel, new FrameLayout.LayoutParams(dp(520), -2, Gravity.CENTER));
        final View f = first;
        if (f != null) f.post(f::requestFocus);
    }

    /* ---- option wheel: subtitle sync + style, speed ---- */
    private View chipRow(String title, final String[] names, int cur0, final Pick pick) {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        TextView h = text(title, 15, true);
        h.setAlpha(.7f); h.setPadding(dp(6), dp(12), 0, dp(8));
        box.addView(h);
        final LinearLayout chips = new LinearLayout(this);
        chips.setOrientation(LinearLayout.HORIZONTAL);
        final int[] cur = {cur0};
        final Runnable[] paint = new Runnable[1];
        paint[0] = () -> {
            chips.removeAllViews();
            for (int i = 0; i < names.length; i++) {
                final int idx = i;
                TextView c = text(names[i], 15, i == cur[0]);
                c.setPadding(dp(18), dp(9), dp(18), dp(9));
                c.setBackground(fillBg(i == cur[0] ? 0x30FFFFFF : 0x12FFFFFF, 0x4CFFFFFF, 22, false));
                c.setFocusable(true);
                c.setClickable(true);
                c.setOnClickListener(v -> { cur[0] = idx; pick.on(idx); paint[0].run(); chips.getChildAt(idx).requestFocus(); });
                LinearLayout.LayoutParams cp = new LinearLayout.LayoutParams(-2, -2);
                cp.rightMargin = dp(8);
                chips.addView(c, cp);
            }
        };
        paint[0].run();
        box.addView(chips);
        return box;
    }

    private String delayText() {
        return (subDelayMs > 0 ? "+" : "") + String.format(Locale.US, "%.1f", subDelayMs / 1000.0) + " s";
    }

    private View delayRow() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        TextView h = text("Subtitle sync", 15, true);
        h.setAlpha(.7f); h.setPadding(dp(6), dp(4), 0, dp(8));
        box.addView(h);
        LinearLayout r = new LinearLayout(this);
        r.setOrientation(LinearLayout.HORIZONTAL);
        r.setGravity(Gravity.CENTER_VERTICAL);
        final TextView val = text(delayText(), 17, true);
        val.setGravity(Gravity.CENTER);
        final long[] steps = {-500, -100, 100, 500};
        String[] names = {"\u22120.5", "\u22120.1", "+0.1", "+0.5"};
        for (int i = 0; i < 4; i++) {
            if (i == 2) { LinearLayout.LayoutParams vp = new LinearLayout.LayoutParams(dp(90), -2); r.addView(val, vp); }
            final long st = steps[i];
            TextView c = text(names[i], 15, true);
            c.setPadding(dp(16), dp(9), dp(16), dp(9));
            c.setBackground(fillBg(0x12FFFFFF, 0x4CFFFFFF, 22, false));
            c.setFocusable(true); c.setClickable(true);
            c.setOnClickListener(v -> { subDelayMs += st; val.setText(delayText()); markDelay(); });
            LinearLayout.LayoutParams cp = new LinearLayout.LayoutParams(-2, -2);
            cp.rightMargin = dp(8);
            r.addView(c, cp);
        }
        TextView rs = text("Reset", 15, true);
        rs.setPadding(dp(16), dp(9), dp(16), dp(9));
        rs.setBackground(fillBg(0x12FFFFFF, 0x4CFFFFFF, 22, false));
        rs.setFocusable(true); rs.setClickable(true);
        rs.setOnClickListener(v -> { subDelayMs = 0; val.setText(delayText()); markDelay(); });
        r.addView(rs);
        box.addView(r);
        if (subCfgs.isEmpty()) {
            TextView n = text("Sync works with downloaded subtitles, not ones built into the video", 13, false);
            n.setAlpha(.5f); n.setPadding(dp(6), dp(8), 0, 0);
            box.addView(n);
        }
        return box;
    }

    private void markDelay() {
        delayDirty = true;
        handler.removeCallbacks(delayRun);
        handler.postDelayed(delayRun, 1200);
    }

    private void openOptions(View opener) {
        menuOpener = opener;
        menuOn = true;
        handler.removeCallbacks(hideRun);
        controls.setVisibility(View.GONE);
        controlsOn = false;
        menuLayer.removeAllViews();
        menuLayer.setVisibility(View.VISIBLE);
        menuLayer.setBackgroundColor(0x99000000);
        menuLayer.setClickable(true);
        menuLayer.setOnClickListener(v -> closeMenu());
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(dp(26), dp(22), dp(26), dp(18));
        GradientDrawable pbg = new GradientDrawable(GradientDrawable.Orientation.TL_BR, new int[]{0xF2161622, 0xF20B0B12});
        pbg.setCornerRadius(dp(28));
        panel.setBackground(pbg);
        panel.setClickable(true);
        TextView ttl = text("Options", 20, true);
        ttl.setPadding(dp(6), 0, 0, dp(6));
        panel.addView(ttl);
        ScrollView sc = new ScrollView(this);
        sc.setVerticalScrollBarEnabled(false);
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        sc.addView(col);
        col.addView(delayRow());
        col.addView(chipRow("Subtitle size", SUB_NAMES, prefs.getInt("subSize", 1), i -> { prefs.edit().putInt("subSize", i).apply(); styleSubtitles(); }));
        col.addView(chipRow("Subtitle color", SUB_COLOR_NAMES, prefs.getInt("subColor", 0), i -> { prefs.edit().putInt("subColor", i).apply(); styleSubtitles(); }));
        col.addView(chipRow("Background", SUB_BG_NAMES, prefs.getInt("subBg", 0), i -> { prefs.edit().putInt("subBg", i).apply(); styleSubtitles(); }));
        col.addView(chipRow("Edge", SUB_EDGE_NAMES, prefs.getInt("subEdge", 0), i -> { prefs.edit().putInt("subEdge", i).apply(); styleSubtitles(); }));
        String[] sp = new String[SPEEDS.length];
        int si = 2;
        for (int i = 0; i < SPEEDS.length; i++) { sp[i] = SPEEDS[i] == 1f ? "1\u00d7" : (SPEEDS[i] + "\u00d7"); if (SPEEDS[i] == speed) si = i; }
        col.addView(chipRow("Playback speed", sp, si, i -> { speed = SPEEDS[i]; player.setPlaybackSpeed(speed); }));
        panel.addView(sc, new LinearLayout.LayoutParams(-1, dp(360)));
        menuLayer.addView(panel, new FrameLayout.LayoutParams(dp(720), -2, Gravity.CENTER));
        panel.post(() -> { View f = ((LinearLayout) ((LinearLayout) col.getChildAt(0)).getChildAt(1)).getChildAt(2); if (f != null) f.requestFocus(); });
    }

    /* ---- subtitle delay: shift the downloaded subtitle files and reload them ---- */
    private static final Pattern TS = Pattern.compile("(?:(\\d{1,2}):)?(\\d{2}):(\\d{2})[.,](\\d{3})");

    private static String shiftSub(String text, long delta, boolean vtt) {
        StringBuilder out = new StringBuilder(text.length() + 64);
        for (String line : text.split("\r?\n", -1)) {
            if (line.contains("-->")) {
                Matcher m = TS.matcher(line);
                StringBuffer sb = new StringBuffer();
                while (m.find()) {
                    long t = ((m.group(1) == null ? 0 : Long.parseLong(m.group(1))) * 3600 + Long.parseLong(m.group(2)) * 60 + Long.parseLong(m.group(3))) * 1000 + Long.parseLong(m.group(4)) + delta;
                    if (t < 0) t = 0;
                    long hh = t / 3600000, mm = (t / 60000) % 60, ss = (t / 1000) % 60, ms = t % 1000;
                    m.appendReplacement(sb, String.format(Locale.US, "%02d:%02d:%02d%s%03d", hh, mm, ss, vtt ? "." : ",", ms));
                }
                m.appendTail(sb);
                out.append(sb);
            } else out.append(line);
            out.append('\n');
        }
        return out.toString();
    }

    private String download(String u) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(u).openConnection();
        c.setRequestProperty("User-Agent", UA);
        c.setInstanceFollowRedirects(true);
        c.setConnectTimeout(12000); c.setReadTimeout(20000);
        try (InputStream in = c.getInputStream()) {
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
            String t = bo.toString("UTF-8");
            if (t.startsWith("\uFEFF")) t = t.substring(1);
            return t;
        } finally { c.disconnect(); }
    }

    private void applyDelay() {
        delayDirty = false;
        handler.removeCallbacks(delayRun);
        if (player == null || subCfgs.isEmpty()) return;
        final long d = subDelayMs, pos = player.getCurrentPosition();
        final boolean playing = player.getPlayWhenReady();
        String sel = null;
        for (TrackRef t : tracksOf(C.TRACK_TYPE_TEXT)) if (t.sel) sel = t.label;
        final String keep = sel;
        flash("Syncing subtitles\u2026");
        new Thread(() -> {
            List<MediaItem.SubtitleConfiguration> out = new ArrayList<>();
            for (int i = 0; i < subCfgs.size(); i++) {
                SubCfg c = subCfgs.get(i);
                Uri u = Uri.parse(c.url);
                if (c.shiftable) {
                    try {
                        String txt;
                        synchronized (subText) { txt = subText.get(c.url); }
                        if (txt == null) { txt = download(c.url); synchronized (subText) { subText.put(c.url, txt); } }
                        File f = new File(getCacheDir(), "sub" + i + (c.vtt ? ".vtt" : ".srt"));
                        try (FileOutputStream fo = new FileOutputStream(f)) { fo.write((d == 0 ? txt : shiftSub(txt, d, c.vtt)).getBytes("UTF-8")); }
                        u = Uri.fromFile(f);
                    } catch (Exception ignored) { u = Uri.parse(c.url); }
                }
                out.add(new MediaItem.SubtitleConfiguration.Builder(u).setMimeType(c.mime).setLanguage(c.lang).setLabel(c.label).build());
            }
            runOnUiThread(() -> {
                if (player == null) return;
                mediaItem = mediaItem.buildUpon().setSubtitleConfigurations(out).build();
                pendingSubLabel = keep;
                player.setMediaItem(mediaItem, pos);
                player.prepare();
                player.setPlayWhenReady(playing);
            });
        }).start();
    }

    private void snapshot() {
        if (player == null) return;
        lastPos = Math.max(0L, player.getCurrentPosition());
        long d = player.getDuration();
        lastDur = d == C.TIME_UNSET ? 0L : Math.max(0L, d);
    }

    private String friendly(PlaybackException e) {
        switch (e.errorCode) {
            case PlaybackException.ERROR_CODE_PARSING_CONTAINER_MALFORMED:
            case PlaybackException.ERROR_CODE_PARSING_CONTAINER_UNSUPPORTED:
            case PlaybackException.ERROR_CODE_PARSING_MANIFEST_MALFORMED:
            case PlaybackException.ERROR_CODE_PARSING_MANIFEST_UNSUPPORTED:
                return "The file looks damaged, or it's in a format this player can't read.";
            case PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED:
            case PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT:
                return "Couldn't reach this source. It may be offline or slow.";
            case PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS:
                return "The source refused the request (it may have expired).";
            case PlaybackException.ERROR_CODE_DECODER_INIT_FAILED:
            case PlaybackException.ERROR_CODE_DECODING_FAILED:
            case PlaybackException.ERROR_CODE_DECODING_FORMAT_EXCEEDS_CAPABILITIES:
            case PlaybackException.ERROR_CODE_DECODING_FORMAT_UNSUPPORTED:
                return "This TV can't decode this video. A 1080p source usually works.";
            default:
                return "Something went wrong while loading this source.";
        }
    }

    private void showError(String msg, String code) {
        if (errOn || reported) return;
        errOn = true;
        if (player != null) player.pause();
        hideControls();
        menuLayer.setVisibility(View.GONE); menuOn = false;
        spinner.setVisibility(View.GONE);
        errMsg.setText(msg);
        errCode.setText(code);
        errLayer.setVisibility(View.VISIBLE);
        countdown = 6;
        if (errNextLabel != null) errNextLabel.setText("Try next source (6)");
        if (errNextBtn != null) errNextBtn.requestFocus();
        handler.removeCallbacks(tick);
        handler.postDelayed(tick, 1000);
        final String base = code;
        new Thread(() -> {                                           // ask the server what it actually sends, so we can tell why the file won't parse
            final String info = probe(streamUrl);
            runOnUiThread(() -> { if (errCode != null) errCode.setText(base + "\n" + info); });
        }).start();
    }

    private void openElsewhere() {
        handler.removeCallbacks(tick);
        if (errNextLabel != null) errNextLabel.setText("Try next source");
        try {
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(Uri.parse(streamUrl), "video/*");
            i.putExtra("title", streamTitle);
            startActivity(Intent.createChooser(i, "Open with"));
        } catch (Exception e) {
            Toast.makeText(this, "No other video app found.", Toast.LENGTH_LONG).show();
        }
    }

    private String probe(String u) {
        try {
            String cur = u; HttpURLConnection c = null;
            for (int hop = 0; hop < 6; hop++) {
                c = (HttpURLConnection) new URL(cur).openConnection();
                c.setInstanceFollowRedirects(false);
                c.setConnectTimeout(8000); c.setReadTimeout(8000);
                c.setRequestProperty("User-Agent", UA);
                c.setRequestProperty("Range", "bytes=0-31");
                int rc = c.getResponseCode();
                if (rc / 100 == 3) { String loc = c.getHeaderField("Location"); if (loc == null) break; cur = new URL(new URL(cur), loc).toString(); c.disconnect(); continue; }
                break;
            }
            int rc = c.getResponseCode();
            String ct = c.getContentType(), cr = c.getHeaderField("Content-Range");
            long total = -1;
            if (cr != null && cr.contains("/")) { try { total = Long.parseLong(cr.substring(cr.indexOf('/') + 1).trim()); } catch (Exception ignored) { } }
            if (total < 0) total = c.getContentLengthLong();
            byte[] b = new byte[24]; int n = 0;
            try (InputStream in = rc >= 400 ? c.getErrorStream() : c.getInputStream()) { if (in != null) n = Math.max(0, in.read(b)); } catch (Exception ignored) { }
            String kind = "unknown data";
            if (n >= 4 && (b[0] & 0xFF) == 0x1A && (b[1] & 0xFF) == 0x45 && (b[2] & 0xFF) == 0xDF && (b[3] & 0xFF) == 0xA3) kind = "MKV file";
            else if (n >= 8 && b[4] == 'f' && b[5] == 't' && b[6] == 'y' && b[7] == 'p') kind = "MP4 file";
            else if (n >= 1 && (b[0] == '<' || b[0] == '{')) kind = "text: " + new String(b, 0, n).replaceAll("[^\\x20-\\x7E]", "").trim();
            String size = total > 0 ? String.format(Locale.US, "%.1f GB", total / 1073741824.0) : "size ?";
            return "Server: HTTP " + rc + (rc == 206 ? " (ranges ok)" : rc == 200 ? " (no ranges)" : "") + " \u00b7 " + (ct == null ? "no type" : ct) + " \u00b7 " + kind + " \u00b7 " + size + " \u00b7 " + new URL(cur).getHost();
        } catch (Exception e) {
            return "Server check failed: " + e.getClass().getSimpleName();
        }
    }

    private void failAndLeave(boolean next) {
        if (reported) return;
        handler.removeCallbacks(tick);
        snapshot();
        reported = true;
        ExoPlayerPlugin.failed(lastPos, lastDur, next, errCode != null ? String.valueOf(errCode.getText()) : "");
        finish();
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
        if (errOn) {                                                 // failed-source dialog: Back leaves, everything else moves between its two buttons
            if (keyCode == KeyEvent.KEYCODE_BACK) { failAndLeave(false); return true; }
            handler.removeCallbacks(tick); if (errNextLabel != null) errNextLabel.setText("Try next source");
            return super.onKeyDown(keyCode, event);
        }
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
