# CrewCheck Watch Face — selector previews

Owner: **CrewCheck Peripherals**. Build-only tooling; no renderer code in the WFF APK and no Mobile-owned implementation.

The picker uses `watch_face_info.xml` → `crewcheck_preview_signature`, the default style. The three native editor ListOptions have distinct 360×360 PNG icons: Signature, Flight Deck and Minimal. Icons use the default cyan palette; the actual face retains all three color choices. This is WFF v1 `icon`, not WFF v2 flavors, and does not raise the format version.

`preview-assets.gradle` runs the Java 17+ source launcher during `:watchface:preBuild`. It reads the current `watchface.xml` and unchanged `crewcheck_logo_neon.png`, generating only three PNG resources under `build/generated/res/watchfacePreviews`. Changes to those inputs invalidate the task. No pre-generated thumbnail can silently survive an XML edit. No additional library or font download is needed.

The renderer follows the current subset of WFF used by this face: list selection, positions, rounded cards, fonts/colors, clock, image, selected complication type and alpha/AOD variants. Unsupported drawing elements or expressions raise errors. It is **not Google's WFF renderer**: Java logical fonts, line metrics and rasterization approximate device behavior. It does not validate actual touch, TalkBack, 12/24h locale, text fit, refresh or battery life.

## Evidence generation

```sh
java -Djava.awt.headless=true android-wrapper/watchface/tools/PreviewGenerator.java \
  android-wrapper/watchface/src/main/res \
  /tmp/crewcheck-preview-res \
  /tmp/crewcheck-preview-gallery
```

The optional gallery argument creates 18 450×450 images (three styles × three palettes × active/AOD), provenance with input hashes, and runs metadata/icon/round-corner/AOD privacy checks plus an unknown-element negative case. Date/time and labels are illustrative selector content; gate, battery and wellbeing values are `--`, not invented successful sync or health readings. These examples are never provider defaults and never enter the live face.

CI generates before/after canonical preparation and requires byte-identical PNGs within the same environment. It builds the debug APK and resolves preview/editor references through the compiled resource table rather than guessing filenames. Debug is only a development artifact: AGP may include generated `R` resource classes, but any custom class is rejected.

The existing **signed** consolidated workflow separately runs `verify_preview_apk.py` in its strict default mode on the release: it requires `hasCode=false`, **zero DEX/class/Java/native-code entries**, correct default metadata and three distinct PNG resources. It keeps the original signing gate; the preview workflow receives no new secrets or permissions and cannot bypass store policy. Signed artifacts include the packaging report. The pinned official WFF v1 schema gate remains unchanged and required.

## Physical acceptance still required

On a Galaxy Watch 4, verify the initial picker shows Signature and native Edit offers all three named styles and their icons. Select each style/palette, exit/reopen, and verify persistence. Test all six complication slots with present/empty/stale data, 12/24h, accented/long text, touch and actual AOD. The static editor icons are presentation aids, not a promise that every OEM editor displays them identically.

Do not merge/publish solely on these thumbnails or the Java gallery. No runtime Android Auto/Mobile changes or production actions belong to this task.

Official references: https://developer.android.com/training/wearables/wff/setup and https://developer.android.com/reference/wear-os/wff/user-configuration/list-configuration .
