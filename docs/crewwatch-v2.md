# CrewWatch v2 — premium glance-first pilot

CrewWatch v2 is a read-only Wear OS projection of canonical CrewCheck context.

## What changed

- One primary action per glance instead of a vertically stacked mobile dashboard.
- The duplicate oversized in-app clock was removed; the time remains a small header affordance.
- At most two supporting facts are shown below the primary action.
- Round-screen padding was increased so text and cards do not collide with the circular bezel.
- State hierarchy is explicit: leave-by, presentation, boarding, current flight, connection, overnight, change and off-duty.
- Sync is a compact secondary action instead of the largest button on screen.
- Demo controls remain debug-only.

## Rotation and apparent closing

The watch Activity is locked to portrait in both manifest and runtime and handles orientation configuration changes without recreation.

The app also opts into Wear ambient support. On Wear OS 5 and older, this lets the Activity render a low-power ambient UI rather than immediately behaving like a paused phone Activity when the wrist lowers. Wear OS still controls the eventual transition back to the selected watch face after longer inactivity; CrewWatch must not abuse keep-screen-on or an ongoing activity for an upcoming roster event.

The separate CrewCheck Face remains the durable glance surface. Its complication is the bridge back into CrewWatch and continues to show the next canonical action.

## Hardware validation still required

- Galaxy Watch 4 40 mm and 44 mm.
- Wrist raise/lower and ambient transitions.
- Auto-rotate enabled at system level: CrewWatch must remain upright.
- 5+ minute idle behavior and return-to-face behavior.
- Burn-in/low-bit ambient inspection.
- D-pad/touch scrolling and text clipping.
- Real Data Layer sync signed with the companion phone app.

No parser, APZ, journey, compliance or roster reconstruction is performed on the watch.
