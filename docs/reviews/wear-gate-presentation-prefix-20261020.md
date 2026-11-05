# Gate complication label — isolated Wear change

Base: main `95cfbc4b1dfbdaeb889c7a198d2332c81b6497c5`. Keep this change separate from PR1144. No store publication, Android build, installation or device access was performed.

`ComplicationText.gate` passed `P` + raw gate as the short text while `gateRendering` already supplied the title PORTÃO. The presentation now uses the existing gate value without that decorative prefix. Legitimate values A22, B12 and P22 are preserved, including the original snapshot and JSON value. Remote and stale/absent states remain unchanged.

`WatchContextSnapshot.complicationShortText` belongs to the generic next-step complication, whose titles depend on state (for example EMBARQUE or CREWCHECK), rather than PORTÃO. Its prefix remains unchanged, as explicitly coordinated. No watch face file or transport schema was edited.

Validation: existing pure-JVM ComplicationTextTest and WatchContextSnapshotTest, plus the new alphanumeric/raw-preservation assertions, passed: 25 JUnit tests. Compilation used the already available JDK17 and existing JUnit/JSON jars in /tmp; no dependencies or applications were installed.
