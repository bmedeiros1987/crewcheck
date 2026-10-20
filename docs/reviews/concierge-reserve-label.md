# Concierge reserve label correction

Base main: 8c36bb5f68bbf5ca3edf7ec1e475b9e484f65ab3. Isolated clone/branch; original checkout untouched. Inventoried existing open work before editing: #656 regulatory engine is separate, #909/#910 briefing consumers remain OFF, #956 roster auto-pull is separate, and #1115 financial read contract remains HOLD. No parser/canonical/Home/financial/writer/Telegram-menu source changes.

## Verified cause

The v14314 source preparer injects CREWCHECK_ACTIVITY_LABELS into server/v1404/telegram-language.mjs and replaces the non-flight summary's raw code with translatedActivityLabel(record.code). It explicitly mapped ASB to sobreaviso. The existing catalog rosterCodes.ts instead has ASB in RESERVE, HSB/HSBE in STANDBY; the separate program-title helper already calls ASB Reserva. The correction changes only the injected ASB label to reserva and repairs that exact old generated label on rerun. It does not reinterpret or rewrite a roster, enum, date, clock, financial value or account record. Other labels and unknown-code fallback are preserved.

Today selects records on the published civil day using America/Sao_Paulo. Program records read pairingCode/type and dutyReport/dutyDebrief. The snapshot minimizer removes rawText but preserves those fields; save/load persists the resulting roster. The final humanizer formats the response and retains the original clocks. The verified faulty stage is text translation after classification/storage, not a proven parser failure.

## Evidence limits

An already accessible October CrewCheck export describes the reported day as ASB with the reported six-hour window and calls it airport reserve. It is a CrewCheck-generated export, not the original company PDF. No original company source or actual persisted Telegram snapshot was read. Therefore the actual incident's ingestion/source revision is not certified. The exact missing evidence is the original published day row and the bot snapshot's type, pairingCode, dutyReport, dutyDebrief and source/revision at response time. No real record is silently corrected. No personal source file, identifier, account or neighboring itinerary is included in code, fixtures or artifacts.

## Synthetic verification

Raw mode runs the real narrow v14314 preparer in a disposable directory; prepared mode imports the fully prepared real formatter and calls actual buildTelegramConciergeReplyCore for /hoje. Both exercise actual snapshot save/load against injected memory storage, the canonical normalizer and generated synthetic PDFs parsed by the real server parser. Cases distinguish ASB/HSB/HSBE/RES/RSV, unknown codes, unchanged enum/clocks, Sao Paulo midnight/year boundaries, and repair/idempotence of an already materialized bad label. Synthetic PDF fixtures preserve ASB and HSB correctly; this is not proof about the actual user's import. Identity is injected and is not an authentication test. Zero real DB/provider/Telegram calls.

Draft only: independent review and exact-head CI required. No merge/deploy or changes to #1115.
