import 'core-js/stable';
import 'abortcontroller-polyfill/dist/polyfill-patch-fetch';
// Keep the shared session's request timeout on pre-AbortController engines.
if (!AbortSignal.timeout) {
  AbortSignal.timeout = function(milliseconds:number):AbortSignal {
    const controller = new AbortController();
    setTimeout(()=>controller.abort(), milliseconds);
    return controller.signal;
  };
}
