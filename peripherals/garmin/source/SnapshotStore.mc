using Toybox.Application as App;
using Toybox.Lang;
using Toybox.Time;

class SnapshotStore {
    private const STORAGE_KEY = "crewcheck.watch.v1";
    private const MAX_SCHEDULE_ITEMS = 8;
    private const MAX_CAPABILITY_MASK = 63;

    function initialize() {}

    function load() {
        return App.Storage.getValue(STORAGE_KEY);
    }

    function clear() {
        App.Storage.deleteValue(STORAGE_KEY);
    }

    function accept(payload) {
        if (!isValid(payload)) {
            return false;
        }

        var current = load();
        if (current != null && isValid(current)) {
            var currentGenerated = integerOrNull(current["g"]);
            var incomingGenerated = integerOrNull(payload["g"]);
            if (currentGenerated != null && incomingGenerated != null
                    && incomingGenerated < currentGenerated) {
                return false;
            }
        }

        App.Storage.setValue(STORAGE_KEY, payload);
        return true;
    }

    function freshness(snapshot) {
        if (snapshot == null) {
            return "missing";
        }

        var validUntilSeconds = integerOrNull(snapshot["u"]);
        if (validUntilSeconds == null || validUntilSeconds <= 0) {
            return "stale";
        }

        return Time.now().value() <= validUntilSeconds ? "fresh" : "stale";
    }

    function isValid(payload) {
        // Phone messages are external input. Validate the compact wire shape on
        // device as well as on the phone so malformed/oversized data never gets
        // persisted into the low-memory renderer path.
        if (!(payload instanceof Lang.Dictionary)) {
            return false;
        }

        var version = integerOrNull(payload["v"]);
        if (version == null || version != 1) {
            return false;
        }

        if (!boundedString(payload["i"], 96, true)
                || !validState(payload["s"])
                || !boundedString(payload["h"], 80, true)) {
            return false;
        }

        if (!boundedString(payload["t"], 16, false)
                || !boundedString(payload["f"], 24, false)
                || !boundedString(payload["r"], 64, false)
                || !boundedString(payload["p"], 16, false)
                || !boundedString(payload["a"], 24, false)
                || !boundedString(payload["k"], 24, false)
                || !boundedString(payload["o"], 120, false)
                || !boundedString(payload["n"], 24, false)
                || !boundedString(payload["d"], 120, false)) {
            return false;
        }

        // Bit zero is basicRoster and must always be enabled. Garmin Free users
        // keep their canonical roster even when every Premium bit is disabled.
        var capabilities = integerOrNull(payload["c"]);
        if (capabilities == null
                || (capabilities & 1) != 1
                || capabilities < 1
                || capabilities > MAX_CAPABILITY_MASK) {
            return false;
        }

        var generatedSeconds = integerOrNull(payload["g"]);
        var validUntilSeconds = integerOrNull(payload["u"]);
        if (generatedSeconds == null
                || validUntilSeconds == null
                || generatedSeconds <= 0
                || validUntilSeconds < generatedSeconds) {
            return false;
        }

        return validSchedule(payload["q"]);
    }

    private function validSchedule(rows) {
        if (!(rows instanceof Lang.Array) || rows.size() > MAX_SCHEDULE_ITEMS) {
            return false;
        }

        for (var i = 0; i < rows.size(); i += 1) {
            var row = rows[i];
            if (!(row instanceof Lang.Array) || row.size() != 4) {
                return false;
            }
            if (!boundedString(row[0], 16, false)
                    || !boundedString(row[1], 40, false)
                    || !boundedString(row[2], 64, false)
                    || !boundedString(row[3], 24, false)) {
                return false;
            }
        }

        return true;
    }

    private function boundedString(value, maxLength, required) {
        if (value == null) {
            return !required;
        }
        if (!(value instanceof Lang.String)) {
            return false;
        }
        var length = value.length();
        if (required && length == 0) {
            return false;
        }
        return length <= maxLength;
    }

    private function validState(value) {
        if (!(value instanceof Lang.String)) {
            return false;
        }
        return value == "OFF_DUTY"
                || value == "LEAVE_SOON"
                || value == "REPORTING"
                || value == "BOARDING"
                || value == "IN_FLIGHT"
                || value == "CONNECTION"
                || value == "OVERNIGHT"
                || value == "CHANGED"
                || value == "UNKNOWN";
    }

    private function integerOrNull(value) {
        // Do not coerce strings, symbols, floats or booleans received over BLE.
        // The compact wire contract requires real integer values for version,
        // capability mask and timestamps.
        if (value instanceof Lang.Number || value instanceof Lang.Long) {
            return value;
        }
        return null;
    }
}
