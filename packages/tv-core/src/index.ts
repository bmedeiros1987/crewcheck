import {
  buildCanonicalRosterEvents,
  selectNextRosterEvent,
  type CanonicalRosterEvent,
} from "../../../client/src/lib/canonicalRoster";
import type { CrewRoster } from "../../../client/src/lib/pdfParser";

export type Privacy = "family" | "private";
export type TvActivity = {
  id: string;
  journeyId: string;
  kind: CanonicalRosterEvent["kind"];
  date: string;
  startAt: string;
  endAt: string;
  presentation: string | null;
  flight: string | null;
  origin: string | null;
  destination: string | null;
  groundBeforeMinutes: number | null;
  confidence: string;
  publishedCode?: string;
};
export type TvCalendarDay = { date: string; activities: TvActivity[] };
export type TvMonthSummary = {
  month: string;
  flights: number;
  journeys: number;
  stays: number;
};
export type TvFact<T> = {
  value: T;
  source: string;
  observedAt: string;
  expiresAt: string;
};
export type TvWeatherContext = {
  role: "base" | "stay";
  airport: string;
  city: string | null;
  temperature: number;
  label: string;
  wind: number | null;
  rainChance: number | null;
  source: string;
  observedAt: string;
  expiresAt: string;
};
export type TvProfileContext = {
  base: string | null;
  airline: string | null;
};
export type TvSnapshot = {
  schemaVersion: 1;
  snapshotId: string;
  deviceId: string;
  sourceVersion: string;
  generatedAt: string;
  expiresAt: string;
  privacy: Privacy;
  mode: "live" | "briefing" | "ambient";
  next: TvActivity | null;
  days: TvCalendarDay[];
  summary: TvMonthSummary;
  leaveAt: TvFact<string> | null;
  gate: TvFact<{ label: string; remoteStand: boolean | null }> | null;
  weather: TvFact<{
    airport: string;
    temperature: number;
    label: string;
  }> | null;
  profile?: TvProfileContext;
  weatherContexts?: TvWeatherContext[];
  changes: string[];
  ticker: string[];
};

function tvAirlineName(roster: CrewRoster, events: CanonicalRosterEvent[]): string | null {
  const declared = String(roster.airline || "").trim();
  if (declared) return declared.slice(0, 60);
  const numbers = events.map(event => String(event.flightNumber || "").trim().toUpperCase()).filter(Boolean);
  if (numbers.some(value => /^LA\s*\d/.test(value))) return "LATAM";
  if (numbers.some(value => /^G3\s*\d/.test(value))) return "GOL";
  if (numbers.some(value => /^AD\s*\d/.test(value))) return "AZUL";
  return null;
}
function calendarDate(date: string): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(date);
  if (!match) throw new Error("Invalid canonical date");
  return `${match[3]}-${match[2]}-${match[1]}`;
}
function projectEvent(e: CanonicalRosterEvent, privacy: Privacy): TvActivity {
  // Fail closed on the legacy canonical fallback: require published evidence,
  // but never calculate or substitute a presentation in this consumer.
  const publishedPresentation = [
    e.leg?.presentationTime,
    e.publishedDay?.dutyReport,
  ].includes(e.presentation);
  return {
    id: e.id,
    journeyId: e.journeyId,
    kind: e.kind,
    date: calendarDate(e.date),
    startAt: e.startDateTime,
    endAt: e.endDateTime,
    presentation:
      e.showPresentation && e.presentation && publishedPresentation
        ? e.presentation
        : null,
    flight: privacy === "private" ? e.flightNumber || null : null,
    origin: privacy === "private" ? e.origin || null : null,
    destination: privacy === "private" ? e.destination || null : null,
    groundBeforeMinutes: privacy === "private" ? e.groundBeforeMinutes : null,
    publishedCode: e.publishedDay.type,
    confidence: e.sourceConfidence,
  };
}
export function monthDates(month: string): string[] {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Invalid month");
  const [year, m] = month.split("-").map(Number);
  const count = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return Array.from(
    { length: count },
    (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`,
  );
}
// The only domain dependency is the existing canonical engine. No TV parser,
// APZ fallback, journey boundary inference, or chronological selector lives here.
export function projectRoster(
  roster: CrewRoster,
  options: {
    deviceId: string;
    snapshotId: string;
    sourceVersion: string;
    month: string;
    generatedAt: string;
    expiresAt: string;
    privacy?: Privacy;
    now?: Date;
  },
): TvSnapshot {
  const privacy = options.privacy === "private" ? "private" : "family";
  const events = buildCanonicalRosterEvents(roster);
  const next = selectNextRosterEvent(events, options.now ?? new Date());
  const journeyIds = [...new Set(events.map((e) => e.journeyId))];
  const activities = events.map((e, index) => ({
    ...projectEvent(e, privacy),
    // Canonical IDs can contain flight/airport strings. Family transport uses
    // source-version-scoped references so redaction covers identifiers too.
    ...(privacy === "family"
      ? {
          id: `activity-${index}`,
          journeyId: `journey-${journeyIds.indexOf(e.journeyId)}`,
        }
      : {}),
  }));
  const days = monthDates(options.month).map((date) => ({
    date,
    activities: activities.filter((a) => a.date === date),
  }));
  const selected = days.flatMap((d) => d.activities);
  return {
    schemaVersion: 1,
    snapshotId: options.snapshotId,
    deviceId: options.deviceId,
    sourceVersion: options.sourceVersion,
    generatedAt: options.generatedAt,
    expiresAt: options.expiresAt,
    privacy,
    mode: next ? "live" : "ambient",
    next: next ? activities[events.indexOf(next)] : null,
    days,
    summary: {
      month: options.month,
      flights: selected.filter((a) => a.kind === "flight").length,
      journeys: new Set(
        selected
          .filter((a) => ["flight", "duty"].includes(a.kind))
          .map((a) => a.journeyId),
      ).size,
      stays: selected.filter((a) => a.kind === "stay").length,
    },
    leaveAt: null,
    gate: null,
    weather: null,
    profile: {
      base: privacy === "private" && /^[A-Z]{3}$/.test(String(roster.base || "").trim().toUpperCase()) ? String(roster.base).trim().toUpperCase() : null,
      airline: tvAirlineName(roster, events),
    },
    weatherContexts: [],
    changes: [],
    ticker: [],
  };
}
export function freshness(
  value: { generatedAt: string; expiresAt: string },
  now = Date.now(),
) {
  const start = Date.parse(value.generatedAt),
    end = Date.parse(value.expiresAt);
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start > now ||
    end <= start
  )
    return "unknown";
  return now < end ? "current" : "stale";
}
export function currentFact<T>(
  fact: TvFact<T> | null,
  now = Date.now(),
): T | null {
  return fact &&
    fact.source &&
    freshness(
      { generatedAt: fact.observedAt, expiresAt: fact.expiresAt },
      now,
    ) === "current"
    ? fact.value
    : null;
}
export function remoteAction(
  key: string | number,
): "left" | "right" | "up" | "down" | "ok" | "back" | null {
  const keys: Record<string, "left" | "right" | "up" | "down" | "ok" | "back"> =
    {
      ArrowLeft: "left",
      ArrowRight: "right",
      ArrowUp: "up",
      ArrowDown: "down",
      Enter: "ok",
      Escape: "back",
      Backspace: "back",
      "37": "left",
      "39": "right",
      "38": "up",
      "40": "down",
      "13": "ok",
      "10009": "back",
      "461": "back",
      "4": "back",
    };
  return keys[String(key)] ?? null;
}
