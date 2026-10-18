import { parentPort, workerData } from 'node:worker_threads';
import { parsePdfOnServer } from '../rosterParser.mjs';
try {
  const result = await parsePdfOnServer(workerData);
  parentPort.postMessage({ ok: true, result });
} catch { parentPort.postMessage({ ok: false }); }
