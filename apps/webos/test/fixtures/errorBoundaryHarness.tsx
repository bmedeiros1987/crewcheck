// Harness que força um erro de render para fotografar a fronteira de erro.
// Não entra no pacote: o build dele sai em dist/webos-harness, e o verify.mjs
// reprova qualquer arquivo extra dentro de dist/webos.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {ErrorBoundary} from '../../../tv-player/src/ErrorBoundary';
import '../../boot.css';

function Exploding(): React.ReactElement {
  throw new Error('falha sintetica de render');
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary onError={(code) => {(window as unknown as Record<string, unknown>).__code = code;}}>
    <Exploding/>
  </ErrorBoundary>,
);
