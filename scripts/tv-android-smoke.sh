#!/usr/bin/env bash
set -euo pipefail
mkdir -p dist/tv-emulator
adb logcat -c
gradle -p apps/android-tv --no-daemon -PtvDemo=true :app:connectedDebugAndroidTest
adb shell am start -W -n online.crewcheck.tv.demo/online.crewcheck.tv.TvActivity
# Wait for the installed WebView to expose demo content before capturing evidence.
ready=false
for attempt in $(seq 1 30); do
  adb shell uiautomator dump /sdcard/tv-window.xml >/dev/null
  adb pull /sdcard/tv-window.xml dist/tv-emulator/window.xml >/dev/null
  if grep -q 'PRÓXIMA JORNADA' dist/tv-emulator/window.xml; then ready=true; break; fi
  sleep 1
done
adb exec-out screencap -p > dist/tv-emulator/android-tv-live.png
adb logcat -d > dist/tv-emulator/logcat.txt
adb shell getprop ro.build.fingerprint > dist/tv-emulator/device.txt
test "$ready" = true
