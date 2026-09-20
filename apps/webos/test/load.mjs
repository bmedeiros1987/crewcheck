// Compila um modulo TypeScript do tv-core com o mesmo alvo do pacote
// (chrome53) e o importa. Assim o teste exercita exatamente o codigo que a TV
// recebe, sem precisar de runner de TypeScript.
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));

export async function loadModule(relativePath) {
  const bundle = await build({
    absWorkingDir: root, entryPoints: [relativePath],
    bundle: true, write: false, format: 'esm', target: 'chrome53', platform: 'neutral',
  });
  const code = bundle.outputFiles[0].text;
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
}

/** fetch falso controlavel, com registro das chamadas. */
export function fakeFetch(handler) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({url: String(url), init});
    return handler(String(url), init);
  };
  fn.calls = calls;
  return fn;
}

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}});
}

export function timeoutFetch() {
  return async () => {
    const error = new Error('aborted');
    error.name = 'TimeoutError';
    throw error;
  };
}

export function networkErrorFetch(message = 'Failed to fetch') {
  return async () => { throw new TypeError(message); };
}
