#!/usr/bin/env bash
set -euo pipefail
mkdir -p dist/tv-emulator
adb logcat -c
capture_diagnostics() {
  adb exec-out screencap -p > dist/tv-emulator/android-tv-live.png || true
  adb logcat -d > dist/tv-emulator/logcat.txt || true
  adb shell getprop ro.build.fingerprint > dist/tv-emulator/device.txt || true
}
trap capture_diagnostics EXIT
gradle -p apps/android-tv --no-daemon -PtvDemo=true :app:connectedDebugAndroidTest
# UTP cleans up its test installation. Reinstall the exact packaged APK for evidence.
adb install -r dist/tv-packages/android/CrewCheck-TV-DEMO-debug.apk
adb shell am start -W -n online.crewcheck.tv.demo/online.crewcheck.tv.TvActivity | tee dist/tv-emulator/launch.txt
grep -q 'Status: ok' dist/tv-emulator/launch.txt
# Wait for the installed WebView to expose demo content before capturing evidence.
ready=false
for attempt in $(seq 1 30); do
  adb shell uiautomator dump /sdcard/tv-window.xml >/dev/null
  adb pull /sdcard/tv-window.xml dist/tv-emulator/window.xml >/dev/null
  if grep -q 'PRÓXIMA JORNADA' dist/tv-emulator/window.xml; then ready=true; break; fi
  sleep 1
done
test "$ready" = true
