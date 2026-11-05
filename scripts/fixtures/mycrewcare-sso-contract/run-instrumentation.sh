#!/usr/bin/env bash
# Synthetic AVD only. No sudo, host security changes, license acceptance or device discovery.
set -euo pipefail
SELF="$(realpath "${BASH_SOURCE[0]}")"
FIXTURE="$(dirname "$SELF")"
IMAGE='system-images;android-36;google_apis;x86_64'
PACKAGE='lab.mcc.syntheticprofile'
SERIAL='emulator-5554'
block() { echo "::error::MCC LAB BLOCKED: $*; Android assertions NOT_EXECUTED"; exit 1; }
[[ "${GITHUB_ACTIONS:-}" == true && "${GITHUB_REPOSITORY:-}" == bmedeiros1987/crewcheck && "${RUNNER_OS:-}" == Linux ]] || block 'not the reviewed disposable GitHub runner'

namespace_check() {
  [[ "$(readlink /proc/self/ns/net)" != "$1" ]] || block 'network namespace was not isolated'
  # Only this new namespace changes. Never change host routes, firewall, KVM or sysctls.
  ip link set lo up
  [[ "$(ip -o link show | wc -l)" -eq 1 ]] || block 'unexpected network interface'
  ip -o link show lo >/dev/null
  [[ -z "$(ip -4 route show table main)" && -z "$(ip -6 route show table main)" ]] || block 'unexpected egress route'
  [[ -r /dev/kvm && -w /dev/kvm ]] || block 'KVM not already accessible inside isolated process'
}

case "${1:-}" in
  namespace-check) namespace_check "$2"; exit 0 ;;
  preflight)
    for tool in unshare ip timeout python3; do command -v "$tool" >/dev/null || block "missing existing tool: $tool"; done
    SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
    [[ -n "$SDK" && -x "$SDK/cmdline-tools/latest/bin/sdkmanager" && -x "$SDK/cmdline-tools/latest/bin/avdmanager" && -x "$SDK/platform-tools/adb" && -d "$SDK/licenses" ]] || block 'official SDK tools or existing accepted licenses unavailable'
    # A denied namespace/KVM check is terminal: no sudo/chmod/AppArmor workaround.
    unshare --user --map-root-user --net bash "$SELF" namespace-check "$(readlink /proc/self/ns/net)" || block 'existing unprivileged isolation/KVM unavailable'
    echo 'MCC LAB PREFLIGHT PASS: existing tools, isolated loopback namespace and KVM access'
    exit 0 ;;
  run)
    bash "$SELF" preflight
    SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
    export ANDROID_HOME="$SDK" ANDROID_SDK_ROOT="$SDK"
    WORK="$(mktemp -d "$RUNNER_TEMP/mcc-instrumentation.XXXXXX")"
    export ANDROID_USER_HOME="$WORK/android" ANDROID_EMULATOR_HOME="$WORK/android" ANDROID_AVD_HOME="$WORK/avd"
    export GRADLE_USER_HOME="$WORK/gradle"
    mkdir -p "$ANDROID_USER_HOME" "$ANDROID_AVD_HOME"
    # Debug signing and local ADB material exist only in this disposable directory.
    export JAVA_TOOL_OPTIONS="-Duser.home=$WORK/home"
    mkdir -p "$WORK/home"
    export HOME="$WORK/home" ANDROID_SDK_HOME="$WORK/home"
    trap 'rm -rf -- "$WORK" "$FIXTURE/build" "$FIXTURE/.gradle"' EXIT
    trap 'exit 130' INT
    trap 'exit 143' TERM
    license_snapshot() { (cd "$SDK/licenses" && find . -type f -print0 | sort -z | xargs -0 -r sha256sum); }
    license_snapshot > "$WORK/licenses.before"
    # EOF refuses every new agreement. No --licenses, yes-pipe, or license-file writes.
    if ! timeout 480 "$SDK/cmdline-tools/latest/bin/sdkmanager" --channel=0 'emulator' "$IMAGE" </dev/null >"$WORK/sdk.log" 2>&1; then
      block 'SDK package install failed; no new agreement accepted'
    fi
    license_snapshot > "$WORK/licenses.after"
    cmp -s "$WORK/licenses.before" "$WORK/licenses.after" || block 'accepted-license inventory changed'
    if grep -Eiq 'Accept\? \(y/N\)|license.*not accepted|licenses? that ha(s|ve) not been accepted' "$WORK/sdk.log"; then
      block 'new license acceptance required'
    fi
    [[ -x "$SDK/emulator/emulator" && -f "$SDK/system-images/android-36/google_apis/x86_64/package.xml" ]] || block 'reviewed official emulator/image unavailable'
    # SDK dependencies must already exist; Gradle cannot accept/download missing SDK packages.
    gradle -p "$FIXTURE" --no-daemon --console=plain -Pandroid.builder.sdkDownload=false assembleDebug
    APK="$FIXTURE/build/outputs/apk/debug/mycrewcare-synthetic-profile-lab-debug.apk"
    [[ -f "$APK" ]] || block 'isolated APK missing'
    sha256sum "$APK"
    printf 'no\n' | "$SDK/cmdline-tools/latest/bin/avdmanager" create avd -n mcc_synthetic -k "$IMAGE" -p "$ANDROID_AVD_HOME/mcc_synthetic.avd"
    # All runtime processes, including ADB server, start after entering the new namespace.
    # No network interface other than lo exists there; Android background traffic cannot egress.
    unshare --user --map-root-user --net bash "$SELF" inside "$(readlink /proc/self/ns/net)" "$WORK" "$APK"
    exit 0 ;;
  inside)
    namespace_check "$2"
    WORK="$3"; APK="$4"; SDK="$ANDROID_HOME"
    export ADB_SERVER_SOCKET='tcp:127.0.0.1:5037'
    ADB="$SDK/platform-tools/adb"
    EMULATOR_PID=''
    cleanup() {
      local status=$?
      trap - EXIT INT TERM
      # Fixed serial in our private ADB namespace, never an attached real device.
      if ! timeout 15 "$ADB" -s "$SERIAL" uninstall "$PACKAGE" >/dev/null 2>&1; then
        echo 'MCC LAB cleanup: uninstall unavailable; destroying the whole disposable AVD'
      fi
      timeout 10 "$ADB" -s "$SERIAL" emu kill >/dev/null 2>&1 || true
      if [[ -n "$EMULATOR_PID" ]]; then kill "$EMULATOR_PID" 2>/dev/null || true; wait "$EMULATOR_PID" 2>/dev/null || true; fi
      timeout 10 "$ADB" kill-server >/dev/null 2>&1 || true
      exit "$status"
    }
    trap cleanup EXIT
    trap 'exit 130' INT
    trap 'exit 143' TERM
    "$ADB" start-server >/dev/null
    "$SDK/emulator/emulator" -avd mcc_synthetic -port 5554 -no-window -no-audio -no-boot-anim -no-snapshot -wipe-data -accel on -gpu swiftshader -no-metrics >"$WORK/emulator.log" 2>&1 &
    EMULATOR_PID=$!
    deadline=$((SECONDS + 300))
    while [[ "$(timeout 5 "$ADB" -s "$SERIAL" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" != 1 ]]; do
      kill -0 "$EMULATOR_PID" 2>/dev/null || block 'emulator exited before boot'
      (( SECONDS < deadline )) || block 'emulator boot deadline'
      sleep 2
    done
    [[ "$("$ADB" -s "$SERIAL" shell getprop ro.kernel.qemu | tr -d '\r')" == 1 ]] || block 'target is not the disposable emulator'
    "$ADB" -s "$SERIAL" install -r "$APK" >/dev/null
    status=0
    timeout 180 "$ADB" -s "$SERIAL" shell am instrument -w "$PACKAGE/lab.mcc.RedirectInstrumentation" >"$WORK/instrumentation.txt" 2>&1 || status=$?
    node "$FIXTURE/verify-instrumentation.mjs" "$WORK/instrumentation.txt" "$status"
    exit 0 ;;
  *) block 'unknown runner phase' ;;
esac
