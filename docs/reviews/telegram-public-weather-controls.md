# Public weather controls after private-return ticketing

Base main: 8c36bb5f68bbf5ca3edf7ec1e475b9e484f65ab3. Separate from the reserve-label investigation, which changes only v14314 activity-label preparation. This patch is limited to outgoing telegram-menu markup, its existing synthetic suite and this packet. No domain weather handler, account auth, SOS/call flow, configuration, provider, credential, record or permission changes.

The review finding on PR1119 was reproduced with the actual prepared conciergeWeatherKeyboard and real prepared sendTelegramMessage, plus the raw menu module: an unlinked profile received remove_keyboard and zero public weather controls. Converting the freshly emitted legacy return to a navigation entry caused the whole mixed grid to take the unavailable-private-menu path. Functional priority assessed P2: public report controls are lost; typed commands remain available. No live messages were used to establish this finding.

For a mixed weather grid without a verified profile, remove only cc_nav return controls and preserve the public cc_weather buttons unchanged (labels, station, kind and modes). A lookup exception has the same output behavior. Owner-guarded output still fails closed, and a purely private root remains unavailable. Linked users keep a newly ticketed return. No received legacy callback is made valid and no new data or action authority is granted.

The existing real-producer raw/prepared navigation suite is extended for missing/revoked/linked profiles and lookup failure across METAR/TAF/ATIS report controls, plus negative private-root cases. The source producer and prepared sender are executed with synthetic identity/transport. No weather fetch or real account/provider/message action occurs. Existing replay, prompt lifecycle, emergency-priority, foundation and SOS regressions remain required.

Draft for independent review/CI only. No merge or deployment in this task. PR1115 remains unchanged/HOLD.
