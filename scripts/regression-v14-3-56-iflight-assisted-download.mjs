import assert from 'node:assert/strict';

process.env.CREWCHECK_V14356_SKIP_APPLY = '1';
const { patchIFlightSemiAutomaticV14356, patchIFlightAndroidAuthorizationLockV14356 } = await import('./v14356/apply.mjs');

const before = `function IFlightPushView({ actions }: { actions: QuickActions }) {
  function openPortal() { window.open('https://iflight.example'); }
  return <button onClick={openPortal}>Abrir</button>;
}

function dutyHoursForRosterDay(day: RosterDay): number { return 0; }`;
const after = patchIFlightSemiAutomaticV14356(before);
assert.match(after, /const admin = isAdmin\(\)/);
assert.match(after, /automaticIFlightAuthorized = false/);
assert.match(after, /Acesso restrito/);
assert.match(after, /LABORATÓRIO DO ADMINISTRADOR/);
assert.match(after, /AGUARDANDO AUTORIZAÇÃO FORMAL/);
assert.match(after, /disabled=\{!automaticIFlightAuthorized\}/);
assert.match(after, /Importar PDF manualmente/);
assert.doesNotMatch(after, /window\.open/);
assert.equal(patchIFlightSemiAutomaticV14356(after), after, 'o patch web deve ser idempotente');

const androidBefore = `public class MainActivity extends Activity {
  private WebView webView;
  public class CrewCheckIFlightBridge {
    @JavascriptInterface
    public void openPortalAndImport(final String url, final String configJson, final String requestId) {
      runOnUiThread(() -> openIFlightPortal(url, configJson, requestId));
    }
  }
  private String escapeJs(String value) { return value; }
}`;
const androidAfter = patchIFlightAndroidAuthorizationLockV14356(androidBefore);
assert.match(androidAfter, /IFLIGHT_AUTOPULL_AUTHORIZED = false/);
assert.match(androidAfter, /IFLIGHT_AUTHORIZATION_PENDING/);
assert.match(androidAfter, /if \(!IFLIGHT_AUTOPULL_AUTHORIZED\)/);
assert.match(androidAfter, /return;/);
assert.equal(patchIFlightAndroidAuthorizationLockV14356(androidAfter), androidAfter, 'a trava Android deve ser idempotente');

console.log('[v14.3.56-iflight-assisted-download] acesso admin e kill switch de autorização validados.');
