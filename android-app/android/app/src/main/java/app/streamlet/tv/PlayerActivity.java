package app.streamlet.tv;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Rect;
import android.graphics.Paint;
import android.graphics.RectF;
import android.view.animation.Animation;
import android.view.animation.LinearInterpolator;
import android.view.animation.RotateAnimation;
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
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
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
import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector;
import androidx.media3.exoplayer.mediacodec.MediaCodecInfo;
import androidx.media3.exoplayer.mediacodec.MediaCodecSelector;
import androidx.media3.exoplayer.mediacodec.MediaCodecUtil;
import java.util.Collections;
import java.util.Comparator;
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
    private final Runnable stallRun = new Runnable() { @Override public void run() { if (!errOn && !reported) { AppLog.add("STALL", "no data for 45 s from " + String.valueOf(android.net.Uri.parse(String.valueOf(getIntent().getStringExtra("url"))).getHost())); showError("This source isn't loading.", "STALLED"); } } };
    private MediaItem mediaItem;
    private TrackSelectionParameters trackParams;
    private Player.Listener playerListener;
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
    private static final int CYAN = 0xFF22D3EE;
    private FrameLayout root, controls, menuLayer;
    private Scrub seek;
    private TextView posTx, durTx, titleTx, flashTx;
    private View spinner;
    private int accent = 0xFF8B5CFF;
    private DefaultTrackSelector tsel;
    private String nextTitle = "";
    private boolean isEpisode = false, nextOn = false, skipDone = false, overDone = false, delayInit = false;
    private long startMsIn = 0;
    private TextView overChip, skipChip, nextCount;
    private FrameLayout nextLayer;
    private int nextSecs = 0;
    private final Runnable nextTick = new Runnable() { @Override public void run() {
        if (!nextOn) return;
        nextSecs--;
        if (nextSecs <= 0) { ExoPlayerPlugin.autoNext = true; finishWith(true); return; }
        if (nextCount != null) nextCount.setText("Starting in " + nextSecs + " s");
        handler.postDelayed(this, 1000);
    } };
    private boolean optHw = true, optFps = true, optTunnel = false;
    private LinearLayout presetBox;
    private final List<Combo> presets = new ArrayList<>();
    private String presetSig = "";
    private View playBtn, menuOpener;
    private ImageView playIcon;
    private boolean controlsOn = false, menuOn = false, seekPending = false;
    private float speed = 1f;
    private boolean phone = false;
    private int skipMs = 10000;
    private String epsJson = "";
    private int curS = 1, curE = 0;
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
        String nt = in.getStringExtra("nextTitle"); nextTitle = nt == null ? "" : nt;
        isEpisode = in.getBooleanExtra("episode", false);
        String ej = in.getStringExtra("eps"); epsJson = ej == null ? "" : ej;
        skipMs = Math.max(1, in.getIntExtra("skip", 10)) * 1000;
        curS = in.getIntExtra("curSeason", 1); curE = in.getIntExtra("curEpisode", 0);
        phone = (getResources().getConfiguration().uiMode & android.content.res.Configuration.UI_MODE_TYPE_MASK) != android.content.res.Configuration.UI_MODE_TYPE_TELEVISION;
        subDelayMs = in.getLongExtra("subDelay", 0L);
        startMsIn = in.getLongExtra("startMs", 0L);
        String ac = in.getStringExtra("accent");
        try { if (ac != null && !ac.isEmpty()) accent = Color.parseColor(ac); } catch (Exception ignored) { }
        optHw = in.getBooleanExtra("hw", true); optFps = in.getBooleanExtra("fps", true); optTunnel = in.getBooleanExtra("tunnel", false);
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
        if (optTunnel && tsel != null) tsel.setParameters(tsel.buildUponParameters().setTunnelingEnabled(true));

        playerListener = new Player.Listener() {
            @Override
            public void onPlaybackStateChanged(int state) {
                if (state == Player.STATE_ENDED) onEnded();
                spinner.setVisibility(state == Player.STATE_BUFFERING ? View.VISIBLE : View.GONE);
                handler.removeCallbacks(stallRun);                                   // a source that sits buffering for 45 s counts as failed (the next-source screen takes over)
                if (state == Player.STATE_BUFFERING && !errOn && !reported) handler.postDelayed(stallRun, 45000);
                refreshProgress();
            }

            @Override
            public void onTracksChanged(Tracks tracks) {
                if (!delayInit) { delayInit = true; if (subDelayMs != 0 && !subCfgs.isEmpty()) handler.post(() -> applyDelay()); }
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
                int ec = error.errorCode;
                AppLog.add("EXO", error.getErrorCodeName() + " (" + ec + ") " + String.valueOf(error.getMessage()));
                boolean network = ec >= 2000 && ec < 3000;            // connection / HTTP problems: the other player would fail too
                if (!network && !errOn) { handler.post(() -> switchToVlc()); return; }
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
        DefaultRenderersFactory rf = new DefaultRenderersFactory(this).setEnableDecoderFallback(true);
        if (!optHw) rf.setMediaCodecSelector(new MediaCodecSelector() {          // software decoders first
            @Override public List<MediaCodecInfo> getDecoderInfos(String mime, boolean secure, boolean tunneling) throws MediaCodecUtil.DecoderQueryException {
                List<MediaCodecInfo> l = new ArrayList<>(MediaCodecUtil.getDecoderInfos(mime, secure, tunneling));
                Collections.sort(l, new Comparator<MediaCodecInfo>() { @Override public int compare(MediaCodecInfo a, MediaCodecInfo b) { return Boolean.compare(a.hardwareAccelerated, b.hardwareAccelerated); } });
                return l;
            }
        });
        tsel = new DefaultTrackSelector(this);
        ExoPlayer p = new ExoPlayer.Builder(this, rf)
                .setTrackSelector(tsel)
                .setMediaSourceFactory(new DefaultMediaSourceFactory(new DefaultDataSource.Factory(this, http), ex))
                .build();
        p.setVideoChangeFrameRateStrategy(optFps ? C.VIDEO_CHANGE_FRAME_RATE_STRATEGY_ONLY_IF_SEAMLESS : C.VIDEO_CHANGE_FRAME_RATE_STRATEGY_OFF);
        return p;
    }

    /** Hand the stream to the backup player (libVLC), keeping the position and the bridge call. */
    private void switchToVlc() {
        if (reported) return;
        snapshot();
        reported = true;
        AppLog.add("FALLBACK", "ExoPlayer could not play it, switching to the backup player");
        Intent v = new Intent(this, VlcActivity.class);
        v.putExtras(getIntent());
        v.putExtra("startMs", lastPos);
        startActivity(v);
        finish();
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


    private Drawable fillBg(int normal, int focused, float radiusDp, boolean oval) {
        StateListDrawable sl = new StateListDrawable();
        GradientDrawable f = shape(oval, focused, 0, 0, radiusDp);
        sl.addState(new int[]{android.R.attr.state_focused}, f);
        sl.addState(new int[]{android.R.attr.state_pressed}, f);
        sl.addState(new int[]{}, shape(oval, normal, 0, 0, radiusDp));
        return sl;
    }

    private Drawable softBg(boolean oval, float radiusDp) { return fillBg(0x00000000, 0x38FFFFFF, radiusDp, oval); }


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
        final FrameLayout b = new FrameLayout(this);
        b.setFocusable(true);
        b.setClickable(true);
        b.setOnClickListener(c);
        final ImageView iv = new ImageView(this);
        iv.setImageResource(iconRes);
        iv.setColorFilter(Color.WHITE);
        iv.setAlpha(.6f);
        if (mirror) iv.setScaleX(-1f);
        b.setOnFocusChangeListener((v, f) -> { iv.animate().alpha(f ? 1f : .6f).setDuration(120).start(); v.animate().scaleX(f ? 1.18f : 1f).scaleY(f ? 1.18f : 1f).setDuration(120).start(); });
        b.addView(iv, new FrameLayout.LayoutParams(dp(iconDp), dp(iconDp), Gravity.CENTER));
        b.setLayoutParams(new LinearLayout.LayoutParams(dp(sizeDp), dp(sizeDp)));
        return b;
    }

    private void paintChip(TextView t, boolean sel, boolean focus) {
        t.setBackground(shape(false, focus ? 0xFFFFFFFF : sel ? 0x33FFFFFF : 0x14FFFFFF, 0, 0, 15));
        t.setTextColor(focus ? 0xFF12121C : Color.WHITE);
        t.setTypeface(sel || focus ? Typeface.DEFAULT_BOLD : Typeface.DEFAULT);
        t.setAlpha(focus || sel ? 1f : .85f);
    }

    private TextView chip(String label, boolean sel, View.OnClickListener c) {
        final TextView t = text(label, 13, true);
        t.setPadding(dp(15), 0, dp(15), 0);
        t.setGravity(Gravity.CENTER);
        t.setTag(sel);
        paintChip(t, sel, false);
        t.setFocusable(true);
        t.setClickable(true);
        t.setOnClickListener(c);
        t.setOnFocusChangeListener((v, f) -> { paintChip(t, Boolean.TRUE.equals(t.getTag()), f); t.animate().scaleX(f ? 1.04f : 1f).scaleY(f ? 1.04f : 1f).setDuration(120).start(); });
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-2, dp(30));
        lp.rightMargin = dp(8);
        t.setLayoutParams(lp);
        return t;
    }

    private interface ScrubL { void onChange(int p, boolean fromUser); void onStart(); void onStop(); }

    /** our own progress line: grey track, accent for what has been played, a small dot only while focused */
    private class Scrub extends View {
        private int max = 1, prog = 0, sec = 0, inc = 10000;
        private ScrubL l;
        private final Paint pt = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final RectF rc = new RectF();
        Scrub(Context c) { super(c); setFocusable(true); setClickable(true); }
        void setListener(ScrubL x) { l = x; }
        void setMax(int m) { max = Math.max(1, m); invalidate(); }
        int getMax() { return max; }
        void setProgress(int p) { prog = Math.max(0, Math.min(max, p)); invalidate(); }
        int getProgress() { return prog; }
        void setSecondaryProgress(int p) { sec = Math.max(0, Math.min(max, p)); invalidate(); }
        void setKeyProgressIncrement(int i) { inc = i; }
        @Override protected void onFocusChanged(boolean g, int d, Rect r) { super.onFocusChanged(g, d, r); invalidate(); }
        @Override protected void onDraw(Canvas cv) {
            float pad = dp(7), x0 = pad, x1 = getWidth() - pad, w = x1 - x0, cy = getHeight() / 2f;
            float h = dp(isFocused() ? 6 : 4), rad = h / 2f;
            pt.setStyle(Paint.Style.FILL);
            pt.setColor(0x887C808A);
            rc.set(x0, cy - h / 2, x1, cy + h / 2);
            cv.drawRoundRect(rc, rad, rad, pt);
            if (sec > prog) { pt.setColor(0x66B4B8C2); rc.set(x0, cy - h / 2, x0 + w * sec / max, cy + h / 2); cv.drawRoundRect(rc, rad, rad, pt); }
            float px = x0 + w * prog / max;
            pt.setColor(accent);
            rc.set(x0, cy - h / 2, Math.max(px, x0 + h), cy + h / 2);
            cv.drawRoundRect(rc, rad, rad, pt);
            if (isFocused()) { pt.setColor(Color.WHITE); cv.drawCircle(px, cy, dp(6), pt); }
        }
        @Override public boolean onKeyDown(int k, KeyEvent e) {
            if (k == KeyEvent.KEYCODE_DPAD_LEFT || k == KeyEvent.KEYCODE_DPAD_RIGHT) {
                int step = e.getRepeatCount() > 8 ? inc * 3 : inc;
                setProgress(prog + (k == KeyEvent.KEYCODE_DPAD_LEFT ? -step : step));
                if (l != null) { if (e.getRepeatCount() == 0) l.onStart(); l.onChange(prog, true); }
                return true;
            }
            return super.onKeyDown(k, e);
        }
        @Override public boolean onKeyUp(int k, KeyEvent e) {
            if ((k == KeyEvent.KEYCODE_DPAD_LEFT || k == KeyEvent.KEYCODE_DPAD_RIGHT) && l != null) { l.onStop(); return true; }
            return super.onKeyUp(k, e);
        }
        @Override public boolean onTouchEvent(MotionEvent ev) {
            float pad = dp(7), w = getWidth() - 2 * pad;
            int a = ev.getActionMasked();
            if (a == MotionEvent.ACTION_DOWN && l != null) l.onStart();
            if (a == MotionEvent.ACTION_DOWN || a == MotionEvent.ACTION_MOVE) {
                setProgress((int) (max * Math.max(0f, Math.min(1f, (ev.getX() - pad) / w))));
                if (l != null) l.onChange(prog, true);
            }
            if ((a == MotionEvent.ACTION_UP || a == MotionEvent.ACTION_CANCEL) && l != null) l.onStop();
            return true;
        }
    }

    /** buffering indicator: our logo ring with its plug (no play icon) turning counter-clockwise */
    private class Spin extends ImageView {
        private final RotateAnimation turn = new RotateAnimation(0f, -360f, Animation.RELATIVE_TO_SELF, .5f, Animation.RELATIVE_TO_SELF, .5f);
        Spin(Context c) {
            super(c);
            setImageResource(R.drawable.ld_logo);
            setScaleType(ImageView.ScaleType.FIT_CENTER);
            turn.setDuration(1500); turn.setRepeatCount(Animation.INFINITE); turn.setInterpolator(new LinearInterpolator());
        }
        @Override protected void onVisibilityChanged(View v, int vis) {
            super.onVisibilityChanged(v, vis);
            if (vis == View.VISIBLE) startAnimation(turn); else clearAnimation();
        }
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

    private FrameLayout makePlay(int iconDp, boolean big) {
        FrameLayout play = new FrameLayout(this);
        play.setFocusable(true);
        play.setClickable(true);
        play.setOnClickListener(v -> togglePlay());
        playIcon = new ImageView(this);
        playIcon.setImageResource(R.drawable.ic_p_pause);
        playIcon.setColorFilter(Color.WHITE);
        playIcon.setAlpha(big ? 1f : .7f);
        play.setOnFocusChangeListener((v, f) -> { if (!big) playIcon.animate().alpha(f ? 1f : .7f).setDuration(120).start(); v.animate().scaleX(f ? 1.18f : 1f).scaleY(f ? 1.18f : 1f).setDuration(120).start(); });
        play.addView(playIcon, new FrameLayout.LayoutParams(dp(iconDp), dp(iconDp), Gravity.CENTER));
        playBtn = play;
        return play;
    }

    /** round "10 s" button: back (replay arrow) or forward (mirrored) */
    private FrameLayout skipBtn(final boolean fwd) {
        FrameLayout b = new FrameLayout(this);
        b.setFocusable(true); b.setClickable(true);
        ImageView iv = new ImageView(this);
        iv.setImageResource(R.drawable.ic_p_replay);
        iv.setColorFilter(Color.WHITE);
        if (fwd) iv.setScaleX(-1f);
        b.addView(iv, new FrameLayout.LayoutParams(dp(46), dp(46), Gravity.CENTER));
        TextView t = text(String.valueOf(skipMs / 1000), 11, true);
        t.setShadowLayer(dp(3), 0, 0, 0xCC000000);
        b.addView(t, new FrameLayout.LayoutParams(-2, -2, Gravity.CENTER));
        b.setOnClickListener(v -> seekBy(fwd ? skipMs : -skipMs));
        b.setOnFocusChangeListener((v, f) -> v.animate().scaleX(f ? 1.15f : 1f).scaleY(f ? 1.15f : 1f).setDuration(120).start());
        return b;
    }

    private String speedLabel() { return speed == 1f ? "1\u00d7" : (speed + "\u00d7"); }

    private void cycleSpeed() {
        int i = 2;
        for (int k = 0; k < SPEEDS.length; k++) if (SPEEDS[k] == speed) i = k;
        speed = SPEEDS[(i + 1) % SPEEDS.length];
        if (player != null) player.setPlaybackSpeed(speed);
        flash("Speed " + speedLabel());
        scheduleHide();
    }

    /** list of the show's episodes, grouped by season; picking one hands it back to the app, which plays it from the same kind of source */
    private void openEpisodes(View opener) {
        JSONArray eps;
        try { eps = new JSONArray(epsJson); } catch (Exception e) { return; }
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
        final LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(dp(22), dp(20), dp(22), dp(14));
        GradientDrawable pbg = new GradientDrawable(GradientDrawable.Orientation.TL_BR, new int[]{0xF2161622, 0xF20B0B12});
        pbg.setCornerRadius(dp(28));
        panel.setBackground(pbg);
        panel.setClickable(true);
        TextView ttl = text("Episodes", 20, true);
        ttl.setPadding(dp(6), 0, 0, dp(8));
        panel.addView(ttl);
        final List<Integer> seasons = new ArrayList<>();
        for (int i = 0; i < eps.length(); i++) { int sn = eps.optJSONObject(i).optInt("s", 1); if (!seasons.contains(sn)) seasons.add(sn); }
        final HorizontalScrollView hs = new HorizontalScrollView(this);
        hs.setHorizontalScrollBarEnabled(false);
        final LinearLayout srow = new LinearLayout(this);
        srow.setOrientation(LinearLayout.HORIZONTAL);
        srow.setPadding(0, 0, 0, dp(8));
        hs.addView(srow);
        panel.addView(hs);
        final ScrollView sc = new ScrollView(this);
        sc.setVerticalScrollBarEnabled(false);
        final LinearLayout list = new LinearLayout(this);
        list.setOrientation(LinearLayout.VERTICAL);
        sc.addView(list);
        final int[] season = {seasons.contains(curS) ? curS : (seasons.isEmpty() ? 1 : seasons.get(0))};
        final JSONArray fe = eps;
        final Runnable[] draw = new Runnable[1];
        draw[0] = () -> {
            srow.removeAllViews();
            for (final int sn : seasons) srow.addView(chip(sn == 0 ? "Specials" : "Season " + sn, sn == season[0], v -> { season[0] = sn; draw[0].run(); }));
            list.removeAllViews();
            View focus = null;
            for (int i = 0; i < fe.length(); i++) {
                final JSONObject o = fe.optJSONObject(i);
                final int sn = o.optInt("s", 1), en = o.optInt("e", 0);
                if (sn != season[0]) continue;
                boolean cur = sn == curS && en == curE;
                String t = o.optString("t", "");
                TextView row = text((cur ? "\u25B6  " : "") + en + "  \u00b7  " + (t.isEmpty() ? "Episode " + en : t), 15, cur);
                row.setSingleLine(true); row.setEllipsize(TextUtils.TruncateAt.END);
                row.setPadding(dp(14), dp(11), dp(14), dp(11));
                row.setBackground(fillBg(cur ? 0x22FFFFFF : 0x00000000, 0x44FFFFFF, 14, false));
                row.setFocusable(true); row.setClickable(true);
                row.setOnClickListener(v -> { if (sn == curS && en == curE) { closeMenu(); return; } ExoPlayerPlugin.pickSeason = sn; ExoPlayerPlugin.pickEpisode = en; finishWith(false); });
                list.addView(row, new LinearLayout.LayoutParams(-1, -2));
                if (cur || focus == null) focus = row;
            }
            final View f = focus;
            if (f != null) sc.post(() -> { sc.scrollTo(0, Math.max(0, f.getTop() - dp(60))); f.requestFocus(); });
        };
        draw[0].run();
        panel.addView(sc, new LinearLayout.LayoutParams(-1, dp(phone ? 250 : 320)));
        int w = Math.min(dp(720), getResources().getDisplayMetrics().widthPixels - dp(24));
        menuLayer.addView(panel, new FrameLayout.LayoutParams(w, -2, Gravity.CENTER));
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
        FrameLayout play = makePlay(phone ? 64 : 26, phone);
        if (!phone) row.addView(play, new LinearLayout.LayoutParams(dp(40), dp(40)));
        posTx = text("0:00", 15, true);
        durTx = text("", 15, true);
        posTx.setAlpha(.95f); durTx.setAlpha(.7f);
        seek = new Scrub(this);
        seek.setKeyProgressIncrement(10000);
        seek.setOnClickListener(v -> togglePlay());
        seek.setListener(new ScrubL() {
            @Override public void onChange(int p, boolean fromUser) {
                if (!fromUser) return;
                posTx.setText(fmt(p));
                seekPending = true;
                handler.removeCallbacks(seekRun);
                handler.postDelayed(seekRun, 400);
                scheduleHide();
            }
            @Override public void onStart() { seekPending = true; handler.removeCallbacks(hideRun); }
            @Override public void onStop() { handler.removeCallbacks(seekRun); seekRun.run(); scheduleHide(); }
        });
        LinearLayout.LayoutParams pt = new LinearLayout.LayoutParams(-2, -2);
        pt.leftMargin = dp(14);
        LinearLayout.LayoutParams sl = new LinearLayout.LayoutParams(0, dp(30), 1f);
        sl.leftMargin = dp(16); sl.rightMargin = dp(16);
        row.addView(posTx, pt);
        row.addView(seek, sl);
        row.addView(durTx);
        bottom.addView(row, new LinearLayout.LayoutParams(-1, -2));

        LinearLayout ctl = new LinearLayout(this);
        ctl.setOrientation(LinearLayout.HORIZONTAL);
        ctl.setGravity(Gravity.CENTER);
        ctl.setPadding(0, dp(12), 0, 0);
        presetBox = new LinearLayout(this);
        presetBox.setOrientation(LinearLayout.HORIZONTAL);
        presetBox.setGravity(Gravity.CENTER_VERTICAL);
        ctl.addView(presetBox);
        overChip = chip("Start over", false, v -> { if (player != null) player.seekTo(0); overDone = true; overChip.setVisibility(View.GONE); flash("From the beginning"); presetBox.requestFocus(); });
        overChip.setVisibility(startMsIn > 20000 ? View.VISIBLE : View.GONE);
        skipChip = chip("Skip intro", false, v -> { seekBy(85000); skipDone = true; skipChip.setVisibility(View.GONE); });
        skipChip.setVisibility(isEpisode ? View.VISIBLE : View.GONE);
        LinearLayout above = new LinearLayout(this);                          // right-aligned, just above the time bar
        above.setOrientation(LinearLayout.HORIZONTAL);
        above.setGravity(Gravity.END);
        ((LinearLayout.LayoutParams) skipChip.getLayoutParams()).bottomMargin = dp(10);
        above.addView(skipChip);
        bottom.addView(above, 0, new LinearLayout.LayoutParams(-1, -2));
        final TextView other = chip("Other\u2026", false, null);
        other.setOnClickListener(v -> openOther(other));
        ctl.addView(other);
        ctl.addView(overChip);
        FrameLayout spd = circleBtn(R.drawable.ic_p_speed, 44, 24, null, false, v -> cycleSpeed());
        ctl.addView(spd);
        if (!epsJson.isEmpty()) { final FrameLayout ec = circleBtn(R.drawable.ic_p_episodes, 44, 24, null, false, null); ec.setOnClickListener(v -> openEpisodes(ec)); ctl.addView(ec); }
        if (!nextTitle.isEmpty()) ctl.addView(circleBtn(R.drawable.ic_p_next, 44, 24, null, false, v -> { ExoPlayerPlugin.autoNext = true; finishWith(false); }));
        final FrameLayout gear = circleBtn(R.drawable.ic_p_gear, 44, 24, null, false, null);
        gear.setOnClickListener(v -> openOptions(gear));
        LinearLayout.LayoutParams gp = new LinearLayout.LayoutParams(dp(44), dp(44));
        gp.leftMargin = dp(6);
        ctl.addView(gear, gp);
        bottom.addView(ctl, new LinearLayout.LayoutParams(-1, -2));
        controls.addView(bottom, new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM));
        if (phone) {                                                  // phone: pause in the middle of the screen with -10 / +10 beside it
            LinearLayout mid = new LinearLayout(this);
            mid.setOrientation(LinearLayout.HORIZONTAL);
            mid.setGravity(Gravity.CENTER);
            FrameLayout bk = skipBtn(false), fw = skipBtn(true);
            LinearLayout.LayoutParams sp1 = new LinearLayout.LayoutParams(dp(64), dp(64)); sp1.rightMargin = dp(30);
            LinearLayout.LayoutParams sp2 = new LinearLayout.LayoutParams(dp(64), dp(64)); sp2.leftMargin = dp(30);
            mid.addView(bk, sp1);
            mid.addView(play, new LinearLayout.LayoutParams(dp(84), dp(84)));
            mid.addView(fw, sp2);
            controls.addView(mid, new FrameLayout.LayoutParams(-2, -2, Gravity.CENTER));
        }
        root.addView(controls, new FrameLayout.LayoutParams(-1, -1));

        // buffering spinner + quick seek flash
        spinner = new Spin(this);
        spinner.setVisibility(View.GONE);
        root.addView(spinner, new FrameLayout.LayoutParams(dp(96), dp(96), Gravity.CENTER));
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
        nextLayer = new FrameLayout(this);
        nextLayer.setVisibility(View.GONE);
        root.addView(nextLayer, new FrameLayout.LayoutParams(-1, -1));

        final android.view.GestureDetector gd = new android.view.GestureDetector(this, new android.view.GestureDetector.SimpleOnGestureListener() {
            @Override public boolean onDown(MotionEvent e) { return true; }
            @Override public boolean onSingleTapUp(MotionEvent e) { if (controlsOn && !menuOn) { hideControls(); return true; } return false; }
            @Override public boolean onSingleTapConfirmed(MotionEvent e) { if (!controlsOn && !menuOn && !errOn && !nextOn) showControls(playBtn); return true; }
            @Override public boolean onDoubleTap(MotionEvent e) {                // controls hidden: double tap the left / right side to skip back / forward
                if (controlsOn || menuOn || errOn || nextOn) return false;
                float x = e.getX() / Math.max(1, root.getWidth());
                if (x < .4f) seekBy(-skipMs); else if (x > .6f) seekBy(skipMs); else togglePlay();
                return true;
            }
        });
        root.setOnTouchListener((v, ev) -> gd.onTouchEvent(ev));
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
        long cp = player.getCurrentPosition();
        if (overChip != null && !overDone && cp > startMsIn + 90000) { overDone = true; overChip.setVisibility(View.GONE); }
        if (skipChip != null && !skipDone && cp > 300000) { skipDone = true; skipChip.setVisibility(View.GONE); }
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

    /* ---- quick audio/subtitle presets + the full picker ---- */
    private static class Combo { int a, t; String label; boolean sel; }

    private static String shortLabel(String l) { int i = l.indexOf(" \u00b7 "); return i > 0 ? l.substring(0, i) : l; }

    private void updateAvLabel() {
        if (presetBox == null || player == null) return;
        List<TrackRef> aud = tracksOf(C.TRACK_TYPE_AUDIO), txt = tracksOf(C.TRACK_TYPE_TEXT);
        int curA = -1, curT = -1;
        for (int i = 0; i < aud.size(); i++) if (aud.get(i).sel) curA = i;
        for (int j = 0; j < txt.size(); j++) if (txt.get(j).sel) curT = j;
        List<Combo> ps = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        int nA = aud.size();
        for (int k = 0; k < nA && ps.size() < 2; k++) {
            int a = (Math.max(curA, 0) + k) % nA;
            String l = shortLabel(aud.get(a).label);
            if (!seen.add(l)) continue;
            Combo c = new Combo(); c.a = a; c.t = -1; c.label = l; c.sel = a == curA && curT < 0;
            ps.add(c);
        }
        if (!txt.isEmpty()) {
            int a = nA > 0 ? Math.max(curA, 0) : -1;
            int t = curT >= 0 ? curT : 0;
            if (curT < 0 && a >= 0) for (int j = 0; j < txt.size(); j++) if (txt.get(j).label.equalsIgnoreCase(shortLabel(aud.get(a).label))) { t = j; break; }
            Combo c = new Combo(); c.a = a; c.t = t;
            c.label = a >= 0 ? shortLabel(aud.get(a).label) + " with subs" : txt.get(t).label + " subs";
            c.sel = curT >= 0 && (a < 0 || a == curA);
            ps.add(c);
        }
        StringBuilder sig = new StringBuilder();
        for (Combo c : ps) sig.append(c.label).append(c.sel).append('|').append(c.a).append(',').append(c.t).append(';');
        if (sig.toString().equals(presetSig)) return;
        presetSig = sig.toString();
        int fi = -1;
        for (int i = 0; i < presetBox.getChildCount(); i++) if (presetBox.getChildAt(i).hasFocus()) fi = i;
        presets.clear(); presets.addAll(ps);
        presetBox.removeAllViews();
        for (int i = 0; i < ps.size(); i++) {
            final int idx = i;
            presetBox.addView(chip(ps.get(i).label, ps.get(i).sel, v -> { applyCombo(presets.get(idx)); handler.postDelayed(this::updateAvLabel, 350); }));
        }
        if (fi >= 0 && fi < presetBox.getChildCount()) presetBox.getChildAt(fi).requestFocus();
    }

    private void applyCombo(Combo c) {
        List<TrackRef> aud = tracksOf(C.TRACK_TYPE_AUDIO), txt = tracksOf(C.TRACK_TYPE_TEXT);
        TrackSelectionParameters.Builder b = player.getTrackSelectionParameters().buildUpon();
        if (c.a >= 0 && c.a < aud.size()) {
            b.setTrackTypeDisabled(C.TRACK_TYPE_AUDIO, false);
            b.setOverrideForType(new TrackSelectionOverride(aud.get(c.a).g.getMediaTrackGroup(), aud.get(c.a).idx));
        }
        if (c.t < 0 || c.t >= txt.size()) {
            b.setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true);
            b.clearOverridesOfType(C.TRACK_TYPE_TEXT);
        } else {
            b.setTrackTypeDisabled(C.TRACK_TYPE_TEXT, false);
            b.setOverrideForType(new TrackSelectionOverride(txt.get(c.t).g.getMediaTrackGroup(), txt.get(c.t).idx));
        }
        player.setTrackSelectionParameters(b.build());
    }

    private void fillCol(final LinearLayout list, final List<String> labels, final int sel, final Pick pick) {
        list.removeAllViews();
        if (labels.isEmpty()) {
            TextView none = text("Nothing to choose here", 15, false);
            none.setAlpha(.5f); none.setPadding(dp(16), dp(12), dp(16), dp(12));
            list.addView(none);
            return;
        }
        for (int i = 0; i < labels.size(); i++) {
            final int idx = i;
            LinearLayout r = new LinearLayout(this);
            r.setOrientation(LinearLayout.HORIZONTAL);
            r.setGravity(Gravity.CENTER_VERTICAL);
            r.setPadding(dp(16), dp(13), dp(16), dp(13));
            r.setBackground(fillBg(i == sel ? 0x16FFFFFF : 0x00000000, 0x30FFFFFF, 12, false));
            r.setFocusable(true);
            r.setClickable(true);
            TextView l = text(labels.get(i), 16, i == sel);
            l.setEllipsize(TextUtils.TruncateAt.END);
            r.addView(l, new LinearLayout.LayoutParams(0, -2, 1f));
            if (i == sel) { TextView ck = text("\u2713", 18, true); ck.setTextColor(CYAN); r.addView(ck); }
            r.setOnClickListener(v -> { pick.on(idx); fillCol(list, labels, idx, pick); View n = list.getChildAt(idx); if (n != null) n.requestFocus(); });
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
            lp.bottomMargin = dp(3);
            list.addView(r, lp);
        }
    }

    private LinearLayout avColumn(String title, final List<String> labels, int sel, Pick pick) {
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        TextView h = text(title, 18, true);
        h.setPadding(dp(14), 0, 0, dp(10));
        col.addView(h);
        ScrollView sc = new ScrollView(this);
        sc.setVerticalScrollBarEnabled(false);
        LinearLayout list = new LinearLayout(this);
        list.setOrientation(LinearLayout.VERTICAL);
        sc.addView(list);
        col.addView(sc, new LinearLayout.LayoutParams(-1, dp(280)));
        fillCol(list, labels, sel, pick);
        return col;
    }

    /** Other\u2026: audio and subtitles picked separately from the full lists */
    private void openOther(View opener) {
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

        final List<TrackRef> aud = tracksOf(C.TRACK_TYPE_AUDIO), txt = tracksOf(C.TRACK_TYPE_TEXT);
        final List<String> al = new ArrayList<>(), tl = new ArrayList<>();
        int asel = 0, tsel = 0;
        for (int i = 0; i < aud.size(); i++) { al.add(aud.get(i).label); if (aud.get(i).sel) asel = i; }
        tl.add("Off");
        for (int i = 0; i < txt.size(); i++) { tl.add(txt.get(i).label); if (txt.get(i).sel) tsel = i + 1; }

        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(dp(26), dp(24), dp(26), dp(22));
        GradientDrawable pbg = new GradientDrawable(GradientDrawable.Orientation.TL_BR, new int[]{0xF2161622, 0xF20B0B12});
        pbg.setCornerRadius(dp(28));
        panel.setBackground(pbg);
        panel.setClickable(true);
        LinearLayout cols = new LinearLayout(this);
        cols.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout c1 = avColumn("Audio", al, asel, idx -> applyTrack(C.TRACK_TYPE_AUDIO, aud, idx));
        LinearLayout c2 = avColumn("Subtitles", tl, tsel, idx -> applyTrack(C.TRACK_TYPE_TEXT, txt, idx));
        LinearLayout.LayoutParams l1 = new LinearLayout.LayoutParams(0, -2, 1f); l1.rightMargin = dp(16);
        cols.addView(c1, l1); cols.addView(c2, new LinearLayout.LayoutParams(0, -2, 1f));
        panel.addView(cols);
        menuLayer.addView(panel, new FrameLayout.LayoutParams(dp(820), -2, Gravity.CENTER));
        final ScrollView sc1 = (ScrollView) c1.getChildAt(1), sc2 = (ScrollView) c2.getChildAt(1);
        final int fa = asel, ft = tsel;
        panel.post(() -> {
            LinearLayout la = (LinearLayout) sc1.getChildAt(0), lt = (LinearLayout) sc2.getChildAt(0);
            View f = la.getChildCount() > fa && !al.isEmpty() ? la.getChildAt(fa) : lt.getChildAt(ft);
            if (f != null) f.requestFocus();
        });
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
                chips.addView(chip(names[i], i == cur[0], v -> { cur[0] = idx; pick.on(idx); paint[0].run(); chips.getChildAt(idx).requestFocus(); }));
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
            r.addView(chip(names[i], false, v -> { subDelayMs += st; val.setText(delayText()); markDelay(); }));
        }
        r.addView(chip("Reset", false, v -> { subDelayMs = 0; val.setText(delayText()); markDelay(); }));
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
        panel.post(() -> { View f = ((LinearLayout) ((LinearLayout) col.getChildAt(0)).getChildAt(1)).getChildAt(3); if (f != null) f.requestFocus(); });
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
        ExoPlayerPlugin.subDelay = subDelayMs;
        ExoPlayerPlugin.failed(lastPos, lastDur, next, errCode != null ? String.valueOf(errCode.getText()) : "");
        finish();
    }

    private void finishWith(boolean ended) {
        if (reported) return;
        snapshot();
        reported = true;
        ExoPlayerPlugin.subDelay = subDelayMs;
        ExoPlayerPlugin.finished(ended && lastDur > 0 ? lastDur : lastPos, lastDur, ended);
        finish();
    }

    /** the video ended: offer the next episode (starts by itself in a few seconds) or just leave */
    private void onEnded() {
        if (nextTitle.isEmpty() || nextLayer == null) { finishWith(true); return; }
        if (nextOn) return;
        nextOn = true;
        nextSecs = 8;
        controls.setVisibility(View.GONE);
        controlsOn = false;
        handler.removeCallbacks(hideRun);
        nextLayer.removeAllViews();
        nextLayer.setVisibility(View.VISIBLE);
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(30), dp(24), dp(30), dp(24));
        GradientDrawable cb = new GradientDrawable(GradientDrawable.Orientation.TL_BR, new int[]{0xF2161622, 0xF20B0B12});
        cb.setCornerRadius(dp(26));
        card.setBackground(cb);
        TextView h1 = text("Next episode", 14, true); h1.setAlpha(.6f);
        TextView h2 = text(nextTitle, 22, true); h2.setEllipsize(TextUtils.TruncateAt.END);
        nextCount = text("Starting in " + nextSecs + " s", 14, false); nextCount.setAlpha(.7f);
        nextCount.setPadding(0, dp(6), 0, dp(16));
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        TextView go = chip("Play now", true, v -> { ExoPlayerPlugin.autoNext = true; finishWith(true); });
        TextView no = chip("Not now", false, v -> finishWith(true));
        row.addView(go); row.addView(no);
        card.addView(h1); card.addView(h2); card.addView(nextCount); card.addView(row);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(dp(460), -2, Gravity.BOTTOM | Gravity.END);
        lp.rightMargin = dp(48); lp.bottomMargin = dp(48);
        nextLayer.addView(card, lp);
        go.requestFocus();
        handler.postDelayed(nextTick, 1000);
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
        if (nextOn) {                                                // next-episode card: Back leaves, other keys move between its buttons
            if (keyCode == KeyEvent.KEYCODE_BACK) { finishWith(true); return true; }
            handler.removeCallbacks(nextTick); if (nextCount != null) nextCount.setText("Paused");
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
                case KeyEvent.KEYCODE_DPAD_LEFT: seekBy(-skipMs); showControls(seek); return true;
                case KeyEvent.KEYCODE_DPAD_RIGHT: seekBy(skipMs); showControls(seek); return true;
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
