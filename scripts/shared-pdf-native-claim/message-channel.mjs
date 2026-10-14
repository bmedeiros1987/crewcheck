import fs from 'node:fs';
const path='android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java';
let source=fs.readFileSync(path,'utf8');
if (!source.includes('private void installPdfChannel()')) {
  // Remove only PDF operations from the global interface, including disabled legacy aliases.
  for(const name of ['readSharedPdfChunk','sharedPdfStatus','acknowledgeSharedPdf']) {
    const match=new RegExp('        @JavascriptInterface\\n        public (?:String|boolean) '+name+'\\(').exec(source);
    if(!match)throw Error('Legacy PDF method missing: '+name);
    let begin=source.indexOf('{',match.index),depth=0,quote=false,escape=false,end=-1;
    for(let i=begin;i<source.length;i++){
      const c=source[i];if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')quote=false;continue;}
      if(c==='"'){quote=true;continue;}if(c==='{')depth++;if(c==='}'&&!--depth){end=i+1;break;}
    }
    if(end<0)throw Error('PDF method end missing');source=source.slice(0,match.index)+source.slice(end);
  }
  const start=source.indexOf('        private boolean sharedPdfOwnerActive(');
  const end=source.indexOf('        @JavascriptInterface\n        public boolean requestLocation()',start);
  if(start<0||end<0)throw Error('PDF global interface boundary missing');
  source=source.slice(0,start)+source.slice(end);
  const marker='    public class CrewCheckNativeBridge {';
  source=source.replace(marker,fs.readFileSync(new URL('./message-channel.snippet',import.meta.url),'utf8')+'\n'+marker);
  const bridge='        webView.addJavascriptInterface(new CrewCheckNativeBridge(), "AndroidCrewCheckNative");';
  if(!source.includes(bridge))throw Error('Native interface installation missing');
  source=source.replace(bridge,bridge+'\n        installPdfChannel();');
  source=source.replaceAll('sharedPdfTrustedPage = isCrewCheckWebUrl(url);','invalidatePdfChannel(url);');
  const finished='public void onPageFinished(WebView view, String url) {\n                super.onPageFinished(view, url);\n                invalidatePdfChannel(url);';
  if(!source.includes(finished))throw Error('PDF page lifecycle missing');
  source=source.replace(finished,'public void onPageFinished(WebView view, String url) {\n                super.onPageFinished(view, url);\n                announcePdfChannel(url);');
  source=source.replace('if (!sharedPdfIncomingHandled) sharedPdfStartupIntent = getIntent();', 'if (!sharedPdfIncomingHandled) {\n            if (pdfChannelAvailable) sharedPdfStartupIntent = getIntent();\n            else handleIncomingPdfIntent(getIntent(), null);\n        }');
  source=source.replace('if (!sharedPdfSessionReported) { sharedPdfStartupIntent = intent; return; }\n        handleIncomingPdfIntent(intent, sharedPdfReceiptOwner);', 'String verifiedOwner = pdfChannelPolicy.owner(pdfChannelPolicy.epoch(), android.os.SystemClock.elapsedRealtime());\n        if (!pdfChannelAvailable) { handleIncomingPdfIntent(intent, null); return; }\n        if (verifiedOwner == null) { sharedPdfStartupIntent = intent; announcePdfChannel(webView.getUrl()); return; }\n        handleIncomingPdfIntent(intent, verifiedOwner);');
  source=source.replace('if (webView == null || !sharedPdfTrustedPage) return;', 'if (webView == null || !sharedPdfTrustedPage || pdfChannelPolicy.owner(pdfChannelPolicy.epoch(), android.os.SystemClock.elapsedRealtime()) == null) return;');
  const dispatchStart=source.indexOf('    private void dispatchPendingSharedPdf()');
  let dispatch=source.slice(dispatchStart);
  dispatch=dispatch.replace('if (pending == null) return;', 'if (pending == null || !java.util.Objects.equals(SharedPdfInbox.owner(this), pdfChannelPolicy.owner(pdfChannelPolicy.epoch(), android.os.SystemClock.elapsedRealtime()))) return;');
  source=source.slice(0,dispatchStart)+dispatch;
  source=source.replaceAll('explicit-account-claim-v1','mainframe-host-session-v2');
  source=source.replace('        super.onDestroy();','        pdfChannelPolicy.invalidate("","");\n        cancelPdfValidation();\n        pdfSessionTimeouts.shutdownNow();\n        pdfSessionExecutor.shutdownNow();\n        super.onDestroy();');
  source=source.replace('Toast.makeText(this, "PDF guardado. Confirme a conta antes de importar.", Toast.LENGTH_LONG).show();','Toast.makeText(this, initialOwner == null ? "PDF sem sessão confirmada. Entre e selecione o arquivo manualmente." : "PDF guardado. Confirme a conta antes de importar.", Toast.LENGTH_LONG).show();');
}
fs.writeFileSync(path,source);
