#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ZIP_PATH="${1:-}"
KEEP_AAR="${CREWLIFE_KEEP_AAR:-0}"

fail() {
  printf '\n[crewlife-samsung-test] ERRO: %s\n' "$*" >&2
  exit 1
}

command -v unzip >/dev/null 2>&1 || fail "unzip não encontrado."
command -v java >/dev/null 2>&1 || fail "Java não encontrado."
command -v gradle >/dev/null 2>&1 || fail "Gradle não encontrado."

if [[ -z "$ZIP_PATH" ]]; then
  cat >&2 <<'USAGE'
Uso:
  bash scripts/crewlife-samsung-local-test.sh "/caminho/para/samsung-health-data-sdk-1.1.0.zip"

Opcional:
  CREWLIFE_KEEP_AAR=1 mantém o AAR extraído após o build.
USAGE
  exit 2
fi

[[ -f "$ZIP_PATH" ]] || fail "ZIP não encontrado: $ZIP_PATH"

AAR_ENTRY="$(unzip -Z1 "$ZIP_PATH" | grep -E '(^|/)libs/samsung-health-data-api-[^/]+\.aar$' | head -n 1 || true)"
[[ -n "$AAR_ENTRY" ]] || fail "Não encontrei libs/samsung-health-data-api-*.aar dentro do ZIP."

LIB_DIR="$ROOT_DIR/android-wrapper/lifecompanion/libs"
mkdir -p "$LIB_DIR"
AAR_TARGET="$LIB_DIR/$(basename "$AAR_ENTRY")"

cleanup() {
  if [[ "$KEEP_AAR" != "1" ]]; then
    rm -f "$AAR_TARGET"
  fi
}
trap cleanup EXIT

printf '[crewlife-samsung-test] SDK encontrado: %s\n' "$AAR_ENTRY"
printf '[crewlife-samsung-test] Extraindo temporariamente para: %s\n' "$AAR_TARGET"
unzip -p "$ZIP_PATH" "$AAR_ENTRY" > "$AAR_TARGET"

[[ -s "$AAR_TARGET" ]] || fail "O AAR extraído está vazio."

printf '[crewlife-samsung-test] Gerando CrewLife Companion debug com o SDK real...\n'
gradle -p "$ROOT_DIR/android-wrapper" --no-daemon --console=plain \
  :lifecompanion:assembleDebug

APK="$ROOT_DIR/android-wrapper/lifecompanion/build/outputs/apk/debug/lifecompanion-debug.apk"
[[ -f "$APK" ]] || fail "APK não encontrado após o build: $APK"

cat <<DONE

✅ CrewLife Companion gerado com o Samsung Health Data SDK real.

APK:
$APK

Próximo passo:
  adb install -r "$APK"

Depois, no Galaxy:
1. Ative Samsung Health Developer Mode / Data Read.
2. Abra CrewLife Companion.
3. Toque em "Conectar Samsung Health".
4. Autorize somente Steps, Sleep, Activity Summary e Energy Score.
5. Toque em "Atualizar agora".
6. Compare os valores com o Samsung Health.
DONE
