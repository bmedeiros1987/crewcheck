package com.crewcheck.watch;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Formats existing presentation fields only; never computes hotel APZ or its date. */
final class StaySummary {
    private static final Pattern APZ = Pattern.compile("^APZ hotel ([0-3][0-9]/[01][0-9]) ([0-2][0-9]:[0-5][0-9]) ([A-Za-z_][A-Za-z0-9_+./:-]*)$");
    final String airport;
    final String date;
    final String time;
    final String zone;
    private StaySummary(String airport, String date, String time, String zone) {
        this.airport = airport; this.date = date; this.time = time; this.zone = zone;
    }
    static StaySummary from(WatchContextSnapshot snapshot) {
        String place = snapshot.presentationPlace.split("[ •·]", 2)[0];
        String airport = place.matches("[A-Z]{3}") ? place : "—";
        Matcher match = APZ.matcher(snapshot.hotelPickup);
        if (match.matches()) {
            try {
                java.time.MonthDay.parse(match.group(1), java.time.format.DateTimeFormatter.ofPattern("dd/MM"));
                java.time.LocalTime.parse(match.group(2));
                java.time.ZoneId.of(match.group(3));
                return new StaySummary(airport, match.group(1), match.group(2), match.group(3));
            } catch (java.time.DateTimeException ignored) { /* Unknown fields remain unknown. */ }
        }
        return new StaySummary(airport, "", "—", "");
    }
    String glance() {
        return "Pernoite · " + airport + " · APZ " + time + (date.isBlank() ? "" : " · " + date);
    }
}
