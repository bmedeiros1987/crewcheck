import assert from "node:assert/strict";
import {
  validTimeZone,
  deviceTimeZone,
  timeZoneChoices,
  baseTimeZone,
  resolveTimeZoneChoice,
} from "../shared/timezone-choice.mjs";
assert.equal(validTimeZone("bad/zone"), false);
assert.equal(
  deviceTimeZone({
    DateTimeFormat() {
      throw Error("unsupported");
    },
  }),
  "UTC",
);
assert.equal(baseTimeZone("for"), "America/Fortaleza");
assert.equal(baseTimeZone("UNKNOWN"), "");
assert.equal(
  resolveTimeZoneChoice("base", { device: "Europe/Lisbon", base: "" }).zone,
  "Europe/Lisbon",
);
const local = resolveTimeZoneChoice("local", { device: "America/Manaus" });
assert.equal(local.fallback, true);
assert.equal(local.zone, "America/Manaus");
assert.match(local.message, /nenhum GPS/);
assert.equal(
  resolveTimeZoneChoice("manual", { device: "UTC", manual: "Europe/Lisbon" })
    .zone,
  "Europe/Lisbon",
);
assert.ok(timeZoneChoices("America/Fortaleza").includes("America/Fortaleza"));
const stamps = ["2026-01-15T12:00:00Z", "2026-07-15T12:00:00Z"];
assert.deepEqual(
  stamps.map((s) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Lisbon",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date(s)),
  ),
  ["12", "13"],
);
assert.deepEqual(
  stamps,
  ["2026-01-15T12:00:00Z", "2026-07-15T12:00:00Z"],
  "Formatting never rewrites instants",
);
console.log(
  "PASS timezone: valid IANA choices, actual base only, explicit local/device fallback, manual preservation, Lisbon DST and unchanged canonical instants.",
);
