# Supplemental Home acceptance diagnosis

Both tests are relevant to this visual change: the active FlyDeck source was edited, and the Pulse fixture renders the actual Cockpit/PersonalizedCockpit and shared Home shell with the new financial card. Passing older CI alone does not replace this acceptance coverage.

FlyDeck: string matching expected an obsolete isSmartDepartureEligible call and data-theme selector. The canonical chain now uses the airport-assignment-aware isAirportDepartureEligible policy and data-crew-theme. The old text slice also accidentally included PersonalizedCockpit; it is now bounded to the actual Cockpit AST node. The assertions still require route eligibility, briefing actions, official-source warnings, active calendar navigation, mobile/light/motion CSS and idempotent preparation. PASS after repair.

Pulse: the extracted fixture did not provide authenticated synthetic account notification preferences. Production now defaults Pulse off without an account-owned preference, so no notice was emitted. The fixture now explicitly seeds only its synthetic local account and denied system-notification stub. Real helpers/components referenced by current Home are bound. Current keyboard order is details trigger → readable text region → collapse → dismiss; each forward step and complete backward return is asserted. The compact count now shows the visible notice plus queue (3 for two queued), replacing the obsolete +2-only selector. Queue protections, dismissal/action focus, page/Popover overflow, rotation, scroll and theme checks remain enforced.

Final local result: 24 geometry/rotation/scroll/Tab cases and 12 keyboard/queue lifecycle cases PASS using real prepared Home and shipped styles. No production Pulse, navigation policy, flags or financial calculation was changed by these repairs.

Remote CI on original visual HEAD1b4fcd5952a5ee326427962c7a698bbb5968f042 completed48 success and1 skip, zero pending/failure. Subsequent commits only repair these test contracts; they require their own remote CI before integration. PR remains draft with no merge/deploy.
