package app.streamlet.tv;

import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import androidx.tvprovider.media.tv.TvContractCompat;
import androidx.tvprovider.media.tv.WatchNextProgram;

/** Continue watching on the Android TV / Google TV home screen (the Watch Next row). One entry per title and profile. */
final class WatchNext {
    private static final String PREFS = "streamlet_watchnext";
    private WatchNext() { }

    /** the link a tile opens: MainActivity hands it to the page, which resumes that title */
    static Uri intentFor(String profile, String item) {
        return new Uri.Builder().scheme("streamlet").authority("resume").appendQueryParameter("p", profile).appendQueryParameter("i", item).build();
    }

    /** only TVs have the "Continue watching" home row; on a phone there is nothing to write to */
    static boolean supported(Context c) { return c.getPackageManager().hasSystemFeature("android.software.leanback"); }

    static void publish(Context c, String profile, String item, boolean episode, String title, String description,
                        int season, int number, String poster, long pos, long dur) {
        if (!supported(c)) return;
        try {
            SharedPreferences sp = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String key = profile + "|" + item;
            long row = sp.getLong(key, -1L);
            WatchNextProgram.Builder b = new WatchNextProgram.Builder()
                    .setType(episode ? TvContractCompat.PreviewPrograms.TYPE_TV_EPISODE : TvContractCompat.PreviewPrograms.TYPE_MOVIE)
                    .setWatchNextType(TvContractCompat.WatchNextPrograms.WATCH_NEXT_TYPE_CONTINUE)
                    .setTitle(title == null ? "" : title)
                    .setDescription(description == null ? "" : description)
                    .setInternalProviderId(item)
                    .setIntentUri(intentFor(profile, item))
                    .setLastPlaybackPositionMillis((int) Math.min(Integer.MAX_VALUE, Math.max(0L, pos)))
                    .setDurationMillis((int) Math.min(Integer.MAX_VALUE, Math.max(0L, dur)))
                    .setLastEngagementTimeUtcMillis(System.currentTimeMillis());
            if (episode) b.setSeasonNumber(season).setEpisodeNumber(number);
            if (poster != null && !poster.isEmpty()) b.setPosterArtUri(Uri.parse(poster));
            WatchNextProgram p = b.build();
            ContentResolver cr = c.getContentResolver();
            if (row >= 0 && cr.update(TvContractCompat.buildWatchNextProgramUri(row), p.toContentValues(), null, null) > 0) return;
            Uri u = cr.insert(TvContractCompat.WatchNextPrograms.CONTENT_URI, p.toContentValues());
            if (u != null) sp.edit().putLong(key, ContentUris.parseId(u)).apply();
        } catch (Exception e) { AppLog.add("watchnext", "publish failed: " + e); }
    }

    /** the title is finished (or its entry was taken off): it leaves the row */
    static void remove(Context c, String profile, String item) {
        if (!supported(c)) return;
        try {
            SharedPreferences sp = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String key = profile + "|" + item;
            long row = sp.getLong(key, -1L);
            if (row < 0) return;
            c.getContentResolver().delete(TvContractCompat.buildWatchNextProgramUri(row), null, null);
            sp.edit().remove(key).apply();
        } catch (Exception e) { AppLog.add("watchnext", "remove failed: " + e); }
    }
}
