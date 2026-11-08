package app.streamlet.tv;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Outline;
import android.util.LruCache;
import android.view.ViewOutlineProvider;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
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
import androidx.media3.exoplayer.audio.AudioCapabilities;
import androidx.media3.exoplayer.audio.AudioSink;
import androidx.media3.exoplayer.audio.DefaultAudioSink;
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
    private String wnProfile, wnItem, wnKind, wnTitle, wnPoster;          // Continue watching on the home screen (Watch Next)
    private int wnSeason = 1, wnEpisode = 0;
    private long wnLast = 0;

    // ---- failed source dialog
    private FrameLayout errLayer;
    private TextView errMsg, errCode;
    private TextView errNextLabel;
    private View errNextBtn;
    private boolean errOn = false;
    /* automatic source pick on: an error is retried on the same source behind the loading logo, then the next source takes over at the same spot */
    private boolean autoRecover = false, recovering = false, played = false, pendingReload = false;
    private int lastHttp = -1;
    private JSONArray alts = new JSONArray();
    private int altAt = -1, retries = 0;
    private long goodPos = 0;
    private final Runnable retryReset = () -> { retries = 0; };
    private final Runnable stallRun = new Runnable() { @Override public void run() { if (!errOn && !reported && autoRecover && recover(true, "STALLED")) return; if (!errOn && !reported) { AppLog.add("STALL", "no data for 45 s from " + String.valueOf(android.net.Uri.parse(String.valueOf(getIntent().getStringExtra("url"))).getHost())); showError("This source isn't loading.", "STALLED"); } } };
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
    private boolean resumeChecked = false;
    private TextView overChip, nextCount, segBtn;
    private long[] segIntro, segRecap, segOutro;
    private int segMode = 0;
    private long segTarget = 0, creditsShownAt = 0;
    private boolean creditsDismissed = false;
    private boolean subsWanted = false;
    private boolean autoNextOn = true, autoSkipOn = false;           // settings: start the next episode by itself, skip intros and recaps by themselves
    private long skippedIntro = -1, skippedRecap = -1;
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
    private boolean tapHid = false;
    private boolean allowPassthrough = true;
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
    private long seekTo = -1, seekAt = 0;                                  // the last jump: a retry after it resumes there, not before it
    private final Runnable seekRun = new Runnable() { @Override public void run() {
        thumbWant.clear();                                                  // the jump is happening: frames still queued for the preview are dropped
        if (player != null) { seekTo = seek.getProgress(); seekAt = System.currentTimeMillis(); player.seekTo(seekTo); } seekPending = false; } };
    private final Runnable uiTick = new Runnable() { @Override public void run() {
        refreshProgress();
        if (player != null && player.isPlaying()) goodPos = Math.max(0L, player.getCurrentPosition());
        if (player != null && player.isPlaying() && System.currentTimeMillis() - wnLast > 60000) wnSync(false);   // keep the home-screen position about a minute fresh
        handler.postDelayed(this, 500);
    } };
    /** Continue watching on the home screen: this title's entry follows the position; a finished title leaves the row */
    private void wnSync(boolean finished) {
        if (wnItem == null || wnItem.isEmpty() || wnProfile == null || wnProfile.isEmpty()) return;
        wnLast = System.currentTimeMillis();
        long pos = player != null ? Math.max(0L, player.getCurrentPosition()) : lastPos;
        long dur = player != null && player.getDuration() != C.TIME_UNSET ? player.getDuration() : lastDur;
        if (finished || (dur > 0 && pos >= dur * 0.95)) { WatchNext.remove(this, wnProfile, wnItem); return; }
        boolean ep = "episode".equals(wnKind);
        WatchNext.publish(this, wnProfile, wnItem, ep, wnTitle, streamSubtitle, wnSeason, wnEpisode, wnPoster, pos, dur);
    }
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
        { PlayerActivity old = live == null ? null : live.get(); live = new java.lang.ref.WeakReference<>(this);
          if (old != null && old != this && !old.isFinishing()) { old.reported = true; old.handler.removeCallbacksAndMessages(null); AppLog.add("PLAYER", "a new video replaced the one still opening"); old.finish(); } }
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
        wnProfile = in.getStringExtra("wnProfile"); wnItem = in.getStringExtra("wnItem"); wnKind = in.getStringExtra("wnKind");
        wnTitle = in.getStringExtra("wnTitle"); wnPoster = in.getStringExtra("wnPoster");
        wnSeason = in.getIntExtra("curSeason", 1); wnEpisode = in.getIntExtra("curEpisode", 0);
        long startMs = in.getLongExtra("startMs", 0L);
        String nt = in.getStringExtra("nextTitle"); nextTitle = nt == null ? "" : nt;
        autoRecover = in.getBooleanExtra("autoPick", false);
        try { alts = new JSONArray(in.getStringExtra("alts") == null ? "[]" : in.getStringExtra("alts")); } catch (Exception e) { alts = new JSONArray(); }
        autoNextOn = in.getBooleanExtra("autoNext", true); autoSkipOn = in.getBooleanExtra("autoSkip", false);
        isEpisode = in.getBooleanExtra("episode", false);
        try {                                                                  // intro / recap / credits times from the intro database
            String sg = in.getStringExtra("segs");
            if (sg != null && !sg.isEmpty()) {
                JSONObject so = new JSONObject(sg);
                segIntro = seg(so.optJSONArray("intro")); segRecap = seg(so.optJSONArray("recap")); segOutro = seg(so.optJSONArray("outro"));
            }
        } catch (Exception ignored) { }
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
        subsWanted = subLang != null && !subLang.isEmpty();                  // Subtitles Off in Settings: nothing turns them on later

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
                if (state == Player.STATE_READY && !resumeChecked) {                 // some files ignore the start position until they know their length: seek again once
                    resumeChecked = true;
                    long want = startMsIn, got = Math.max(0L, player.getCurrentPosition());
                    if (want > 20000) {
                        AppLog.add("RESUME", "wanted " + want / 1000 + " s, at " + got / 1000 + " s, seekable=" + player.isCurrentMediaItemSeekable());
                        if (got < want - 5000 && player.isCurrentMediaItemSeekable()) player.seekTo(want);
                    }
                }
                spinner.setVisibility(state == Player.STATE_BUFFERING || recovering ? View.VISIBLE : View.GONE);
                if (state == Player.STATE_READY && recovering) { recovering = false; spinner.setVisibility(View.GONE); handler.removeCallbacks(retryReset); handler.postDelayed(retryReset, 20000); }
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
                defaultRegularAudio();
                updateAvLabel();
            }

            @Override
            public void onIsPlayingChanged(boolean playing) {
                playIcon.setImageResource(playing ? R.drawable.ic_p_pause : R.drawable.ic_p_play);
                if (playing) played = true;
                if (playing) scheduleHide(); else if (controlsOn) handler.removeCallbacks(hideRun);
            }

            @Override
            public void onPlayerError(PlaybackException error) {
                int ec = error.errorCode;
                int http = httpCode(error);
                AppLog.add("EXO", error.getErrorCodeName() + " (" + ec + ")" + (http > 0 ? " HTTP " + http : "") + " " + String.valueOf(error.getMessage()) + (http > 0 ? " · " + hostOf(String.valueOf(finalOf(streamUrl) != null ? finalOf(streamUrl) : streamUrl)) : ""));
                boolean network = ec >= 2000 && ec < 3000;            // connection / HTTP problems: the other player would fail too
                lastHttp = http;
                if (http != 429 && http != 503 && network) forgetFinal(streamUrl);   // the real link may have expired: ask the addon again next time
                if (pendingReload) return;                             // a retry is already on its way: one at a time
                if (autoRecover && recover(network, error.getErrorCodeName() + (http > 0 ? " HTTP " + http : ""))) return;
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
        controls.setVisibility(View.GONE); controls.setAlpha(0f); controlsOn = false;           // the video starts clean: no controls until you press OK or tap
    }

    /* Addons like Torrentio hand out a link that redirects to the real file, and every opening of that link
       makes the addon ask the debrid service again. The player opens the file many times (start, cues, seeks,
       reconnects, preview frames), so the addon starts refusing (HTTP 429). The redirect is followed once and
       the real file link is reused for a few hours. */
    static final java.util.concurrent.ConcurrentHashMap<String, String> FINAL = new java.util.concurrent.ConcurrentHashMap<>();
    static final java.util.concurrent.ConcurrentHashMap<String, Long> FINAL_AT = new java.util.concurrent.ConcurrentHashMap<>();
    static String finalOf(String u) { Long t = u == null ? null : FINAL_AT.get(u); return t != null && System.currentTimeMillis() - t < 3 * 3600_000L ? FINAL.get(u) : null; }
    static void forgetFinal(String u) { if (u != null) { FINAL.remove(u); FINAL_AT.remove(u); } }
    static String resolveFinal(String u) {
        if (u == null || !u.startsWith("http")) return u;
        String hit = finalOf(u); if (hit != null) return hit;
        for (int attempt = 0; attempt < 3; attempt++) {
            String cur = u; int rc = -1; String retryAfter = null;
            try {
                for (int hop = 0; hop < 6; hop++) {
                    HttpURLConnection c = (HttpURLConnection) new URL(cur).openConnection();
                    c.setInstanceFollowRedirects(false); c.setConnectTimeout(10000); c.setReadTimeout(10000);
                    c.setRequestProperty("User-Agent", UA); c.setRequestProperty("Range", "bytes=0-0");
                    rc = c.getResponseCode();
                    if (rc / 100 == 3) { String loc = c.getHeaderField("Location"); c.disconnect(); if (loc == null) break; cur = new URL(new URL(cur), loc).toString(); continue; }
                    retryAfter = c.getHeaderField("Retry-After"); c.disconnect(); break;
                }
            } catch (Exception e) { AppLog.add("LINK", "couldn't follow the link: " + e.getClass().getSimpleName()); return u; }
            if (rc == 200 || rc == 206) {
                AppLog.add("LINK", cur.equals(u) ? "direct link, HTTP " + rc : "real file link found (" + hostOf(cur) + "), reused for this video");
                FINAL.put(u, cur); FINAL_AT.put(u, System.currentTimeMillis()); return cur;
            }
            if (rc != 429 && rc != 503) { AppLog.add("LINK", "the link answered HTTP " + rc + " (" + hostOf(cur) + ")"); return u; }
            long wait = 4000L * (attempt + 1);
            try { if (retryAfter != null) wait = Math.min(10000L, Math.max(1000L, Long.parseLong(retryAfter.trim()) * 1000L)); } catch (Exception ignored) { }
            AppLog.add("LINK", "addon busy (HTTP " + rc + "): waiting " + wait / 1000 + " s before asking again");
            try { Thread.sleep(wait); } catch (InterruptedException ie) { return u; }
        }
        return u;
    }
    static String hostOf(String u) { try { return new URL(u).getHost(); } catch (Exception e) { return "?"; } }
    static int httpCode(Throwable e) {                                       // the HTTP status behind a player error, or -1
        for (Throwable t = e; t != null; t = t.getCause()) if (t instanceof androidx.media3.datasource.HttpDataSource.InvalidResponseCodeException) return ((androidx.media3.datasource.HttpDataSource.InvalidResponseCodeException) t).responseCode;
        return -1;
    }
    /* only one player at a time: a second one (a double press, a relaunch) silences the first so they never retry side by side */
    private static java.lang.ref.WeakReference<PlayerActivity> live = null;

    private ExoPlayer makePlayer(boolean compat) {
        DefaultHttpDataSource.Factory http = new DefaultHttpDataSource.Factory()
                .setUserAgent(UA)
                .setAllowCrossProtocolRedirects(true)
                .setConnectTimeoutMs(15000)
                .setReadTimeoutMs(25000);
        DefaultExtractorsFactory ex = new DefaultExtractorsFactory();
        if (compat) ex.setMatroskaExtractorFlags(MatroskaExtractor.FLAG_DISABLE_SEEK_FOR_CUES);
        DefaultRenderersFactory rf = new DefaultRenderersFactory(this) {
            @Override protected AudioSink buildAudioSink(Context ctx, boolean enableFloatOutput, boolean enableAudioTrackPlaybackParams) {
                // speed changes need decoded sound: with Dolby/DTS passed straight to the TV the speed would stay 1x
                return new DefaultAudioSink.Builder(ctx)
                        .setAudioCapabilities(allowPassthrough ? AudioCapabilities.getCapabilities(ctx) : AudioCapabilities.DEFAULT_AUDIO_CAPABILITIES)
                        .setEnableFloatOutput(enableFloatOutput)
                        .setEnableAudioTrackPlaybackParams(true)
                        .build();
            }
        }.setEnableDecoderFallback(true);
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
                .setMediaSourceFactory(new DefaultMediaSourceFactory(new androidx.media3.datasource.ResolvingDataSource.Factory(new DefaultDataSource.Factory(this, http),
                        spec -> { String u = spec.uri.toString(); if (!u.equals(streamUrl)) return spec;   // only the video link itself (not subtitles or stream pieces)
                            String f = resolveFinal(u); return f == null || f.equals(u) ? spec : spec.withUri(Uri.parse(f)); }), ex))
                .build();
        p.setVideoChangeFrameRateStrategy(optFps ? C.VIDEO_CHANGE_FRAME_RATE_STRATEGY_ONLY_IF_SEAMLESS : C.VIDEO_CHANGE_FRAME_RATE_STRATEGY_OFF);
        return p;
    }

    /** Retry this source (3 times, a little longer each time), then move to the next one, at the same spot and behind the loading logo.
     *  A file this player can't read at all (never played, not a connection problem) still goes to the backup player. */
    private boolean recover(boolean network, String why) {
        if (reported || errOn || player == null) return false;
        if (!played && !network) return false;
        handler.removeCallbacks(stallRun); handler.removeCallbacks(retryReset);
        final long pos = seekTo >= 0 && System.currentTimeMillis() - seekAt < 20000 ? seekTo : goodPos > 0 ? goodPos : Math.max(0L, startMsIn);
        boolean busy = lastHttp == 429 || lastHttp == 503, dead = lastHttp == 401 || lastHttp == 403 || lastHttp == 404 || lastHttp == 410 || lastHttp == 451;
        int max = dead ? (played ? 1 : 0) : busy ? 2 : 3;                      // a refused / missing file won't come back by retrying: next source straight away
        if (retries < max) {
            retries++; recovering = true; pendingReload = true; spinner.setVisibility(View.VISIBLE); hideControls();
            long wait = busy ? 10000L * retries : 1500L * retries;               // a busy addon gets real breathing room
            AppLog.add("RECOVER", why + ": retrying this source (" + retries + "/" + max + ") in " + wait / 1000 + " s at " + pos / 1000 + " s");
            handler.postDelayed(() -> { pendingReload = false; reload(pos, null); }, wait);
            return true;
        }
        while (altAt + 1 < alts.length()) {
            altAt++;
            JSONObject a = alts.optJSONObject(altAt); String u = a == null ? "" : a.optString("url", "");
            if (u.isEmpty()) continue;
            retries = 0; recovering = true; spinner.setVisibility(View.VISIBLE); hideControls();
            AppLog.add("RECOVER", why + ": moving to the next source (" + (altAt + 1) + "/" + alts.length() + ") at " + pos / 1000 + " s");
            if (busy) { pendingReload = true; final String nu = u; handler.postDelayed(() -> { pendingReload = false; reload(pos, nu); }, 5000); }   // same addon, so still give it a moment
            else reload(pos, u);
            return true;
        }
        recovering = false;
        return false;                                                    // nothing left to try: the usual message
    }
    private void reload(long pos, String newUrl) {
        if (reported || player == null || mediaItem == null) return;
        if (newUrl != null) { streamUrl = newUrl; mediaItem = mediaItem.buildUpon().setUri(Uri.parse(newUrl)).build(); thumbsBroken = newUrl.toLowerCase(Locale.ROOT).contains(".m3u8"); thumbCache.evictAll(); try { if (thumbMmr != null) { final android.media.MediaMetadataRetriever old = thumbMmr; thumbMmr = null; if (thumbExec != null) thumbExec.execute(() -> { try { old.release(); } catch (Exception ignored) { } }); } } catch (Exception ignored) { } }
        player.setMediaItem(mediaItem, pos);
        player.prepare();
        player.play();
        handler.removeCallbacks(stallRun); handler.postDelayed(stallRun, 45000);
    }

    /** Hand the stream to the backup player (libVLC), keeping the position and the bridge call. */
    private void switchToVlc() {
        if (reported) return;
        snapshot();
        reported = true;
        AppLog.add("FALLBACK", "ExoPlayer could not play it, switching to the backup player");
        Intent v = new Intent(this, VlcActivity.class);
        v.putExtras(getIntent());
        v.putExtra("url", streamUrl);                                    // after a source change: the one in use now
        ExoPlayerPlugin.altUsed = altAt;
        v.putExtra("startMs", Math.max(lastPos, startMsIn));              // the failed first try may never have played: keep where the viewer was
        startActivity(v);
        finish();
    }


    /* ======================= Streamlet control layer ======================= */
    private int dp(float v) { return Math.round(v * getResources().getDisplayMetrics().density); }

    /* ---- seek preview: five frames around the point you are seeking to, read from the stream itself (not for HLS) ---- */
    private LinearLayout thumbStrip;
    private final ImageView[] seekThumbs = new ImageView[5];
    private final long[] thumbKeys = new long[5];
    private final LruCache<Long, Bitmap> thumbCache = new LruCache<>(32);
    private final Set<Long> thumbWant = Collections.synchronizedSet(new HashSet<>());
    private final Set<Long> thumbPending = Collections.synchronizedSet(new HashSet<>());
    private ExecutorService thumbExec;
    private android.media.MediaMetadataRetriever thumbMmr;
    private volatile boolean thumbsBroken = false;
    private int thumbFails = 0;
    private static final long THUMB_STEP = 10000;
    private final Runnable thumbHide = () -> { if (thumbStrip != null) thumbStrip.setVisibility(View.GONE); };

    private void buildThumbStrip(LinearLayout parent) {
        thumbStrip = new LinearLayout(this);
        thumbStrip.setOrientation(LinearLayout.HORIZONTAL);
        thumbStrip.setGravity(Gravity.CENTER);
        thumbStrip.setClipChildren(false); thumbStrip.setClipToPadding(false);
        for (int i = 0; i < 5; i++) {
            ImageView iv = new ImageView(this);
            iv.setScaleType(ImageView.ScaleType.CENTER_CROP);
            GradientDrawable bg = new GradientDrawable(); bg.setColor(0xFF15151C); bg.setCornerRadius(dp(10));
            if (i == 2) { bg.setStroke(dp(3), Color.WHITE); iv.setPadding(dp(3), dp(3), dp(3), dp(3)); }
            iv.setBackground(bg);
            iv.setClipToOutline(true);
            int th = i == 2 ? (phone ? 77 : 125) : (phone ? 65 : 106);                  // 16:9 frames; the outer ones run off the edges
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(th * 16f / 9f), dp(th));
            lp.leftMargin = dp(5); lp.rightMargin = dp(5);
            thumbStrip.addView(iv, lp);
            seekThumbs[i] = iv;
        }
        thumbStrip.setVisibility(View.GONE);
        if (streamUrl.toLowerCase(Locale.ROOT).contains(".m3u8") || streamUrl.isEmpty()) thumbsBroken = true;
        LinearLayout.LayoutParams sp = new LinearLayout.LayoutParams(-1, dp(phone ? 77 : 125));
        sp.bottomMargin = dp(14);
        parent.addView(thumbStrip, sp);
    }

    private void showThumbs(long pos) {
        if (thumbStrip == null || thumbsBroken || player == null) return;
        long dur = player.getDuration();
        if (dur == C.TIME_UNSET || dur <= 0) return;
        handler.removeCallbacks(thumbHide);
        thumbStrip.setVisibility(View.VISIBLE);
        thumbWant.clear();
        for (int i : new int[]{2, 1, 3, 0, 4}) {                              // the frame you are on first, then its neighbours
            long t = pos + (i - 2) * THUMB_STEP;
            ImageView iv = seekThumbs[i];
            if (t < 0 || t > dur) { iv.setVisibility(View.INVISIBLE); thumbKeys[i] = -1; continue; }
            iv.setVisibility(View.VISIBLE);
            long key = (t / 5000) * 5000;
            thumbKeys[i] = key;
            Bitmap b = thumbCache.get(key);
            iv.setImageBitmap(b);
            if (b == null) thumbWant.add(key);
        }
        handler.removeCallbacks(thumbKick); handler.postDelayed(thumbKick, 280);   // fetch once the scrubbing pauses, the frame you are on first
    }
    private final Runnable thumbKick = () -> {
        if (thumbsBroken || player == null || player.getPlaybackState() != Player.STATE_READY) return;   // the player is loading: it gets the connection, not the preview
        for (int i : new int[]{2, 1, 3, 0, 4}) { long k = thumbKeys[i]; if (k >= 0 && thumbWant.contains(k) && thumbCache.get(k) == null) requestThumb(k); }
    };

    private void refreshThumbs() {
        if (thumbStrip == null) return;
        if (thumbsBroken) { thumbStrip.setVisibility(View.GONE); return; }
        for (int i = 0; i < 5; i++) { if (thumbKeys[i] < 0) continue; Bitmap b = thumbCache.get(thumbKeys[i]); if (b != null) seekThumbs[i].setImageBitmap(b); }
    }

    private void requestThumb(final long key) {
        if (!thumbPending.add(key)) return;
        if (thumbExec == null) thumbExec = Executors.newSingleThreadExecutor();
        thumbExec.execute(() -> {
            try {
                if (thumbsBroken || !thumbWant.contains(key)) return;          // you have moved on: skip it
                if (thumbMmr == null) {
                    android.media.MediaMetadataRetriever m = new android.media.MediaMetadataRetriever();
                    if (streamUrl.startsWith("http")) { Map<String, String> hd = new HashMap<>(); hd.put("User-Agent", UA); String fu = finalOf(streamUrl); m.setDataSource(fu != null ? fu : streamUrl, hd); }   // the real file link: preview frames never go through the addon
                    else m.setDataSource(this, Uri.parse(streamUrl));
                    thumbMmr = m;
                }
                if (player == null) return;
                final long t0 = System.currentTimeMillis();
                Bitmap b = android.os.Build.VERSION.SDK_INT >= 27
                        ? thumbMmr.getScaledFrameAtTime(key * 1000L, android.media.MediaMetadataRetriever.OPTION_CLOSEST_SYNC, 384, 216)
                        : thumbMmr.getFrameAtTime(key * 1000L, android.media.MediaMetadataRetriever.OPTION_CLOSEST_SYNC);
                if (b == null) { if (++thumbFails >= 3) { thumbsBroken = true; AppLog.add("seekThumbs", "seek preview: no frames from this stream"); } }
                else { thumbFails = 0; thumbCache.put(key, b); }
                if (System.currentTimeMillis() - t0 > 3500) { thumbsBroken = true; AppLog.add("thumbs", "seek preview off: frames from this stream are too slow"); }
            } catch (Throwable e) { thumbsBroken = true; AppLog.add("seekThumbs", "seek preview unavailable: " + e); }
            finally { thumbPending.remove(key); }
            runOnUiThread(this::refreshThumbs);
        });
    }

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

    private boolean audioIsPassthroughType() {
        try {
            for (Tracks.Group g : player.getCurrentTracks().getGroups()) {
                if (g.getType() != C.TRACK_TYPE_AUDIO || !g.isSelected()) continue;
                for (int i = 0; i < g.length; i++) {
                    if (!g.isTrackSelected(i)) continue;
                    String m = g.getTrackFormat(i).sampleMimeType;
                    if (MimeTypes.AUDIO_AC3.equals(m) || MimeTypes.AUDIO_E_AC3.equals(m) || MimeTypes.AUDIO_E_AC3_JOC.equals(m) || MimeTypes.AUDIO_TRUEHD.equals(m)
                            || MimeTypes.AUDIO_DTS.equals(m) || MimeTypes.AUDIO_DTS_HD.equals(m) || MimeTypes.AUDIO_DTS_EXPRESS.equals(m)) return true;
                }
            }
        } catch (Exception ignored) { }
        return false;
    }

    /** a new player with the audio path switched (decoded sound can change speed, passed-through Dolby cannot); keeps position, tracks and speed */
    private void rebuildPlayer(boolean passthrough, float newSpeed) {
        if (player == null || mediaItem == null) return;
        long pos = Math.max(0L, player.getCurrentPosition());
        boolean playing = player.getPlayWhenReady();
        try { player.removeListener(playerListener); } catch (Exception ignored) { }
        player.release();
        allowPassthrough = passthrough;
        player = makePlayer(false);
        view.setPlayer(player);
        if (trackParams != null) player.setTrackSelectionParameters(trackParams);
        if (optTunnel && tsel != null) tsel.setParameters(tsel.buildUponParameters().setTunnelingEnabled(true));
        player.addListener(playerListener);
        player.setMediaItem(mediaItem, pos);
        player.prepare();
        player.setPlaybackParameters(new androidx.media3.common.PlaybackParameters(newSpeed, 1f));
        player.setPlayWhenReady(playing);
        AppLog.add("SPEED", "player rebuilt, passthrough=" + passthrough + ", speed=" + newSpeed);
    }

    private void setSpeed(float v) {
        speed = v;
        if (player == null) return;
        if (v != 1f && allowPassthrough && audioIsPassthroughType()) rebuildPlayer(false, v);
        else if (v == 1f && !allowPassthrough) rebuildPlayer(true, v);
        else player.setPlaybackParameters(new androidx.media3.common.PlaybackParameters(v, 1f));
        flash(v == 1f ? "Normal speed" : "Speed " + speedLabel());
    }

    /** small drop-up list above the speed button */
    private void openSpeed(View anchor) {
        menuOpener = anchor;
        menuOn = true;
        handler.removeCallbacks(hideRun);
        menuLayer.removeAllViews();
        menuLayer.setVisibility(View.VISIBLE);
        menuLayer.setBackgroundColor(0x00000000);
        menuLayer.setClickable(true);
        menuLayer.setOnClickListener(v -> closeMenu());
        final LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(dp(8), dp(8), dp(8), dp(8));
        GradientDrawable pbg = new GradientDrawable();
        pbg.setColor(0xEE12121C); pbg.setCornerRadius(dp(18)); pbg.setStroke(dp(1), 0x33FFFFFF);
        panel.setBackground(pbg);
        panel.setClickable(true);
        String[] names = {"0.5\u00d7  Slow", "0.75\u00d7", "1\u00d7  Normal", "1.25\u00d7", "1.5\u00d7", "2\u00d7  Fast"};
        View focus = null;
        for (int i = SPEEDS.length - 1; i >= 0; i--) {                         // fastest on top, like a drop-up
            final float sv = SPEEDS[i];
            boolean cur = sv == speed;
            TextView row = text((cur ? "\u2713  " : "     ") + names[i], 15, cur);
            row.setPadding(dp(16), dp(10), dp(22), dp(10));
            row.setBackground(fillBg(cur ? 0x22FFFFFF : 0x00000000, 0x55FFFFFF, 12, false));
            row.setFocusable(true); row.setClickable(true);
            row.setOnClickListener(v -> { setSpeed(sv); closeMenu(); });
            panel.addView(row, new LinearLayout.LayoutParams(-2, -2));
            if (cur || focus == null) focus = row;
        }
        int[] loc = new int[2];
        anchor.getLocationOnScreen(loc);
        int w = dp(210), rootH = Math.max(root.getHeight(), 1);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(w, -2, Gravity.BOTTOM | Gravity.START);
        lp.leftMargin = Math.max(dp(12), loc[0] + anchor.getWidth() / 2 - w / 2);
        lp.bottomMargin = Math.max(dp(8), rootH - loc[1] + dp(10));
        menuLayer.addView(panel, lp);
        final View f = focus;
        if (f != null) panel.post(f::requestFocus);
    }

    private final ExecutorService thumbPool = Executors.newFixedThreadPool(3);
    private final LruCache<String, Bitmap> thumbs = new LruCache<>(40);
    private void loadThumb(final ImageView iv, final String url) {
        if (url == null || url.isEmpty()) return;
        iv.setTag(url);
        Bitmap c = thumbs.get(url);
        if (c != null) { iv.setImageBitmap(c); return; }
        thumbPool.execute(() -> {
            try {
                HttpURLConnection cn = (HttpURLConnection) new URL(url).openConnection();
                cn.setConnectTimeout(8000); cn.setReadTimeout(8000);
                InputStream in = cn.getInputStream();
                BitmapFactory.Options o = new BitmapFactory.Options(); o.inSampleSize = 2;
                final Bitmap b = BitmapFactory.decodeStream(in, null, o);
                in.close();
                if (b != null) { thumbs.put(url, b); handler.post(() -> { if (url.equals(iv.getTag())) iv.setImageBitmap(b); }); }
            } catch (Exception ignored) { }
        });
    }

    /** side panel on the right: season chips and a list of episodes with their pictures */
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
        menuLayer.setBackgroundColor(0x00000000);
        menuLayer.setClickable(true);
        menuLayer.setOnClickListener(v -> closeMenu());
        final LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(dp(18), dp(22), dp(14), dp(14));
        GradientDrawable pbg = new GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT, new int[]{0xD8101018, 0xEE0B0B12});
        panel.setBackground(pbg);
        panel.setClickable(true);
        TextView ttl = text("Episodes", 22, true);
        ttl.setPadding(dp(4), 0, 0, dp(10));
        panel.addView(ttl);
        final List<Integer> seasons = new ArrayList<>();
        for (int i = 0; i < eps.length(); i++) { int sn = eps.optJSONObject(i).optInt("s", 1); if (!seasons.contains(sn)) seasons.add(sn); }
        final HorizontalScrollView hs = new HorizontalScrollView(this);
        hs.setHorizontalScrollBarEnabled(false);
        hs.setClipChildren(false); hs.setClipToPadding(false);
        final LinearLayout srow = new LinearLayout(this);
        srow.setOrientation(LinearLayout.HORIZONTAL);
        srow.setPadding(dp(8), dp(10), dp(8), dp(12));
        srow.setClipChildren(false);
        hs.addView(srow);
        panel.addView(hs);
        final ScrollView sc = new ScrollView(this);
        sc.setVerticalScrollBarEnabled(false);
        sc.setClipChildren(false); sc.setClipToPadding(false);
        final LinearLayout list = new LinearLayout(this);
        list.setOrientation(LinearLayout.VERTICAL);
        list.setClipChildren(false);
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
                final boolean cur = sn == curS && en == curE;
                String t = o.optString("t", "");
                LinearLayout row = new LinearLayout(this);
                row.setOrientation(LinearLayout.HORIZONTAL);
                row.setGravity(Gravity.CENTER_VERTICAL);
                row.setPadding(dp(8), dp(8), dp(12), dp(8));
                row.setBackground(fillBg(cur ? 0x26FFFFFF : 0x00000000, 0x44FFFFFF, 14, false));
                row.setFocusable(true); row.setClickable(true);
                final ImageView th = new ImageView(this);
                th.setScaleType(ImageView.ScaleType.CENTER_CROP);
                GradientDrawable ph = new GradientDrawable(); ph.setColor(0x33FFFFFF); ph.setCornerRadius(dp(10)); th.setBackground(ph);
                th.setClipToOutline(true);
                th.setOutlineProvider(new ViewOutlineProvider() { @Override public void getOutline(View v, Outline ol) { ol.setRoundRect(0, 0, v.getWidth(), v.getHeight(), dp(10)); } });
                row.addView(th, new LinearLayout.LayoutParams(dp(128), dp(72)));
                loadThumb(th, o.optString("th", ""));
                LinearLayout col = new LinearLayout(this);
                col.setOrientation(LinearLayout.VERTICAL);
                TextView n = text((cur ? "NOW PLAYING  \u00b7  " : "Episode ") + (cur ? "" : "") + en, 12, true); n.setAlpha(.7f);
                if (cur) n.setTextColor(accent);
                TextView tt = text(t.isEmpty() ? "Episode " + en : t, 15, true);
                tt.setSingleLine(false); tt.setMaxLines(2); tt.setEllipsize(TextUtils.TruncateAt.END);
                col.addView(n); col.addView(tt);
                LinearLayout.LayoutParams cl = new LinearLayout.LayoutParams(0, -2, 1f); cl.leftMargin = dp(12);
                row.addView(col, cl);
                row.setOnClickListener(v -> { if (cur) { closeMenu(); return; } ExoPlayerPlugin.pickSeason = sn; ExoPlayerPlugin.pickEpisode = en; finishWith(false); });
                LinearLayout.LayoutParams rl = new LinearLayout.LayoutParams(-1, -2); rl.bottomMargin = dp(6);
                list.addView(row, rl);
                if (cur || focus == null) focus = row;
            }
            final View f = focus;
            if (f != null) sc.post(() -> { sc.scrollTo(0, Math.max(0, f.getTop() - dp(40))); f.requestFocus(); });
        };
        draw[0].run();
        panel.addView(sc, new LinearLayout.LayoutParams(-1, 0, 1f));
        int pw = Math.min(dp(430), (int) (getResources().getDisplayMetrics().widthPixels * (phone ? 0.78f : 0.42f)));
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(pw, -1, Gravity.END);
        menuLayer.addView(panel, lp);
        panel.setTranslationX(pw);
        panel.animate().translationX(0).setDuration(220).start();
    }

    private static long[] seg(JSONArray a) { return a != null && a.length() == 2 && a.optLong(1) > a.optLong(0) ? new long[]{a.optLong(0), a.optLong(1)} : null; }

    /** the floating Skip intro / Skip recap / Next episode button, only while the real segment plays */
    private void updateSegments(long cp) {
        if (segBtn == null || (segIntro == null && segRecap == null && segOutro == null)) return;
        int mode = 0; String label = null; long target = 0;
        if (segIntro != null && cp >= segIntro[0] - 500 && cp < segIntro[1] - 1500) { mode = 1; label = "Skip intro"; target = segIntro[1]; }
        else if (segRecap != null && cp >= segRecap[0] - 500 && cp < segRecap[1] - 1500) { mode = 2; label = "Skip recap"; target = segRecap[1]; }
        if (autoSkipOn && player != null && !errOn && !nextOn && (mode == 1 || mode == 2)) {   // once per intro / recap: seeking back into it later plays it
            long key = mode == 1 ? segIntro[0] : segRecap[0];
            if ((mode == 1 ? skippedIntro : skippedRecap) != key) {
                if (mode == 1) skippedIntro = key; else skippedRecap = key;
                player.seekTo(target); flash(mode == 1 ? "Intro skipped" : "Recap skipped");
                segMode = 0; segTarget = 0; segBtn.setVisibility(View.GONE); return;
            }
        }
        if (autoSkipOn && player != null && !errOn && !nextOn && !creditsDismissed && segOutro != null && cp >= segOutro[0] && cp < segOutro[1] - 1500) {
            creditsDismissed = true;                         // credits skipped once; a bonus scene after them plays, then the next-episode card comes up at the end
            long d = player.getDuration();
            player.seekTo(d > 0 && segOutro[1] >= d - 3000 ? d : segOutro[1]); flash("Credits skipped");
            segMode = 0; segTarget = 0; segBtn.setVisibility(View.GONE); return;
        }
        if (mode == 0 && segOutro != null && !nextTitle.isEmpty() && cp >= segOutro[0] && !creditsDismissed) {
            mode = 3; label = "Next episode  \u25B6";
            if (creditsShownAt == 0) creditsShownAt = System.currentTimeMillis();
            else if (System.currentTimeMillis() - creditsShownAt > 15000) { creditsDismissed = true; mode = 0; }      // not taken: stay out of the way
        }
        if (mode == segMode && target == segTarget) return;
        segMode = mode; segTarget = target;
        if (mode == 0 || errOn || nextOn) { segBtn.setVisibility(View.GONE); segMode = 0; return; }
        segBtn.setText(label);
        segBtn.setVisibility(View.VISIBLE);
        if (!controlsOn && !menuOn) segBtn.requestFocus();
    }

    private void doSegment() {
        if (segMode == 1 || segMode == 2) { if (player != null) player.seekTo(segTarget); flash(segMode == 1 ? "Intro skipped" : "Recap skipped"); segBtn.setVisibility(View.GONE); segMode = 0; }
        else if (segMode == 3) { ExoPlayerPlugin.autoNext = true; finishWith(true); }
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
        if (!epsJson.isEmpty()) {                                              // top right: episodes list and next episode
            final FrameLayout ec = circleBtn(R.drawable.ic_p_episodes, 50, 28, null, false, null);
            ec.setOnClickListener(v -> openEpisodes(ec));
            ((LinearLayout.LayoutParams) ec.getLayoutParams()).leftMargin = dp(10);
            top.addView(ec);
        }
        if (!nextTitle.isEmpty()) {
            FrameLayout nx = circleBtn(R.drawable.ic_p_next, 50, 28, null, false, v -> { ExoPlayerPlugin.autoNext = true; finishWith(false); });
            ((LinearLayout.LayoutParams) nx.getLayoutParams()).leftMargin = dp(10);
            top.addView(nx);
        }
        top.setClipChildren(false); top.setClipToPadding(false);
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
                showThumbs(p);
                seekPending = true;
                handler.removeCallbacks(seekRun);
                handler.postDelayed(seekRun, 400);
                scheduleHide();
            }
            @Override public void onStart() { seekPending = true; handler.removeCallbacks(hideRun); }
            @Override public void onStop() { handler.removeCallbacks(seekRun); seekRun.run(); scheduleHide(); handler.removeCallbacks(thumbHide); handler.postDelayed(thumbHide, 1800); }
        });
        LinearLayout.LayoutParams pt = new LinearLayout.LayoutParams(-2, -2);
        pt.leftMargin = dp(14);
        LinearLayout.LayoutParams sl = new LinearLayout.LayoutParams(0, dp(30), 1f);
        sl.leftMargin = dp(16); sl.rightMargin = dp(16);
        row.addView(posTx, pt);
        row.addView(seek, sl);
        row.addView(durTx);
        buildThumbStrip(bottom);
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

        final TextView other = chip("Other\u2026", false, null);
        other.setOnClickListener(v -> openOther(other));
        ctl.addView(other);
        ctl.addView(overChip);
        final FrameLayout spd = circleBtn(R.drawable.ic_p_speed, 44, 24, null, false, null);
        spd.setOnClickListener(v -> openSpeed(spd));
        ctl.addView(spd);
        final FrameLayout gear = circleBtn(R.drawable.ic_p_gear, 44, 24, null, false, null);
        gear.setOnClickListener(v -> openOptions(gear));
        LinearLayout.LayoutParams gp = new LinearLayout.LayoutParams(dp(44), dp(44));
        gp.leftMargin = dp(6);
        ctl.addView(gear, gp);
        ctl.setClipChildren(false); ctl.setClipToPadding(false); presetBox.setClipChildren(false);
        bottom.setClipChildren(false); bottom.setClipToPadding(false); controls.setClipChildren(false); controls.setClipToPadding(false); root.setClipChildren(false);
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
        segBtn = new TextView(this);
        segBtn.setTextColor(0xFF12121C); segBtn.setTextSize(phone ? 15 : 17); segBtn.setTypeface(Typeface.DEFAULT_BOLD);
        segBtn.setGravity(Gravity.CENTER); segBtn.setPadding(dp(26), dp(13), dp(26), dp(13));
        segBtn.setBackground(fillBg(0xF2FFFFFF, 0xFFFFFFFF, 14, false));
        segBtn.setFocusable(true); segBtn.setClickable(true);
        segBtn.setOnFocusChangeListener((v, f) -> segBtn.setBackground(shape(false, f ? 0xFFFFFFFF : 0xE6FFFFFF, f ? 0xFF8B5CFF : 0, f ? dp(3) : 0, 14)));
        segBtn.setOnClickListener(v -> doSegment());
        segBtn.setVisibility(View.GONE);
        FrameLayout.LayoutParams sbp = new FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM | Gravity.END);
        sbp.rightMargin = dp(48); sbp.bottomMargin = dp(phone ? 110 : 150);
        root.addView(segBtn, sbp);

        final android.view.GestureDetector gd = new android.view.GestureDetector(this, new android.view.GestureDetector.SimpleOnGestureListener() {
            @Override public boolean onDown(MotionEvent e) { return true; }
            @Override public boolean onSingleTapUp(MotionEvent e) { if (controlsOn && !menuOn) { hideControls(); tapHid = true; return true; } return false; }
            @Override public boolean onSingleTapConfirmed(MotionEvent e) { if (tapHid) { tapHid = false; return true; } if (!controlsOn && !menuOn && !errOn && !nextOn) showControls(playBtn); return true; }
            @Override public boolean onDoubleTap(MotionEvent e) {                // controls hidden: double tap the left / right side to skip back / forward
                tapHid = false;
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
        updateSegments(cp);
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
        seekTo = Math.max(0, t); seekAt = System.currentTimeMillis();
        player.seekTo(seekTo);
        refreshProgress();
        showThumbs(Math.max(0, t)); handler.removeCallbacks(thumbHide); handler.postDelayed(thumbHide, 1800);
        flash(delta < 0 ? "\u2212" + Math.abs(delta / 1000) + " s" : "+" + (delta / 1000) + " s");
        scheduleHide();
    }

    private void togglePlay() {
        if (player == null) return;
        if (player.isPlaying()) player.pause(); else { player.play(); quickHideUntil = System.currentTimeMillis() + 1500; }   // pressing play with the controls up: they get out of the way almost at once
        scheduleHide();
    }
    private long quickHideUntil = 0;

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
        thumbHide.run();
        handler.removeCallbacks(hideRun);
        controls.animate().alpha(0f).setDuration(180).withEndAction(() -> { if (!controlsOn) controls.setVisibility(View.GONE); }).start();
    }

    private void scheduleHide() {
        handler.removeCallbacks(hideRun);
        if (controlsOn) handler.postDelayed(hideRun, System.currentTimeMillis() < quickHideUntil ? 700 : 4500);
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

    /** audio-description ("described video") tracks, such as Radio-Canada's audio0_frdv: kept out of the quick buttons */
    private static boolean isDescribed(String l) {
        if (l == null) return false;
        String x = l.toLowerCase(Locale.ROOT);
        return x.endsWith("dv") || x.contains("description") || x.contains("described") || x.contains("audiodesc");
    }
    private boolean avDefaulted = false;
    /** first time the tracks are known: if the stream has a described-video track, start on the regular one with subtitles on */
    private void defaultRegularAudio() {
        if (avDefaulted || player == null) return;
        List<TrackRef> aud = tracksOf(C.TRACK_TYPE_AUDIO), txt = tracksOf(C.TRACK_TYPE_TEXT);
        if (aud.size() < 2) return;
        int reg = -1; boolean hasDesc = false;
        for (int i = 0; i < aud.size(); i++) { if (isDescribed(aud.get(i).label)) hasDesc = true; else if (reg < 0) reg = i; }
        if (!hasDesc || reg < 0) return;
        avDefaulted = true;
        Combo c = new Combo(); c.a = reg; c.t = txt.isEmpty() || !subsWanted ? -1 : 0;     // the subtitles setting decides, not the audio track
        applyCombo(c);
    }

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
            if (isDescribed(aud.get(a).label) && a != curA) continue;
            if (!seen.add(l)) continue;
            Combo c = new Combo(); c.a = a; c.t = -1; c.label = l; c.sel = a == curA && curT < 0;
            ps.add(c);
        }
        if (!txt.isEmpty()) {
            int a = nA > 0 ? Math.max(curA, 0) : -1;
            if (a >= 0 && isDescribed(aud.get(a).label)) for (int i = 0; i < nA; i++) if (!isDescribed(aud.get(i).label)) { a = i; break; }
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
                        if (txt.contains("[Script Info]") || txt.contains("[V4+ Styles]") || txt.contains("[V4 Styles]")) {
                            // an ASS/SSA script behind an address that did not say so: read it as a script, not as SRT
                            // (the raw drawing commands showed up as numbers). Vector drawings (signs, title cards) are dropped; the dialogue stays
                            c.mime = MimeTypes.TEXT_SSA; c.shiftable = false;
                            StringBuilder kept = new StringBuilder();
                            for (String line : txt.split("\r?\n", -1)) if (!(line.startsWith("Dialogue:") && line.contains("\\p1"))) kept.append(line).append('\n');
                            File fa = new File(getCacheDir(), "sub" + i + ".ass");
                            try (FileOutputStream fo = new FileOutputStream(fa)) { fo.write(kept.toString().getBytes("UTF-8")); }
                            u = Uri.fromFile(fa);
                        } else {
                            File f = new File(getCacheDir(), "sub" + i + (c.vtt ? ".vtt" : ".srt"));
                            try (FileOutputStream fo = new FileOutputStream(f)) { fo.write((d == 0 ? txt : shiftSub(txt, d, c.vtt)).getBytes("UTF-8")); }
                            u = Uri.fromFile(f);
                        }
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
        ExoPlayerPlugin.altUsed = altAt;
        ExoPlayerPlugin.failed(lastPos, lastDur, next, errCode != null ? String.valueOf(errCode.getText()) : "");
        finish();
    }

    private void finishWith(boolean ended) {
        if (reported) return;
        snapshot();
        reported = true;
        wnSync(ended);
        ExoPlayerPlugin.subDelay = subDelayMs;
        ExoPlayerPlugin.altUsed = altAt; ExoPlayerPlugin.finished(ended && lastDur > 0 ? lastDur : lastPos, lastDur, ended);
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
        nextCount = text(autoNextOn ? "Starting in " + nextSecs + " s" : "Up next", 14, false); nextCount.setAlpha(.7f);
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
        if (autoNextOn) handler.postDelayed(nextTick, 1000);
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
                    if (segMode != 0) { doSegment(); return true; }              // Skip intro / Skip recap / Next episode takes the OK button while it is shown
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
        thumbWant.clear(); thumbsBroken = true;
        if (thumbExec != null) { thumbExec.execute(() -> { try { if (thumbMmr != null) thumbMmr.release(); } catch (Exception ignored) { } }); thumbExec.shutdown(); }
        if (!reported) {
            snapshot();
            reported = true;
            wnSync(false);
            ExoPlayerPlugin.altUsed = altAt; ExoPlayerPlugin.finished(lastPos, lastDur, false);
        }
        if (player != null) {
            player.release();
            player = null;
        }
        super.onDestroy();
    }
}
