# CrewCheck Face

Resource-only Watch Face Format v1 package for Wear OS 4+ / Galaxy Watch 4+.

It is intentionally a different Android App Bundle from `:wear`. Watch Face Format does not permit
application logic in the watch-face bundle. The central editable slot accepts LONG_TEXT or
SHORT_TEXT complications; select **Próximo passo CrewCheck** once in the face editor to display the
encrypted snapshot supplied by `:wear`.

## Build

```bash
cd android-wrapper
gradle :watchface:assembleDebug :watchface:bundleRelease
```

The package id is `com.crewcheck.face`. WFF v1 and minSdk 33 were selected to preserve Galaxy Watch
4 compatibility while providing a modern resource-only face and ambient mode.
