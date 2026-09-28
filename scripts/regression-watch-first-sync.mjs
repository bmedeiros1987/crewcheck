import assert from 'node:assert/strict';
import fs from 'node:fs';

const activity = fs.readFileSync('android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java', 'utf8');
const service = fs.readFileSync('android-wrapper/app/src/main/java/com/crewcheck/app/CrewCheckWatchSyncService.java', 'utf8');

assert.match(activity, /ACTION_WATCH_SYNC_REQUEST/, 'MainActivity deve expor ação privada de sync');
assert.match(activity, /registerWatchSyncRequestReceiver\(\)/, 'Activity deve registrar receiver enquanto está viva');
assert.match(activity, /requestCrewCheckWatchSnapshotFromWeb\("watch-data-layer-request"\)/, 'pedido do relógio deve gerar snapshot fresco na WebView');
assert.match(activity, /requestCrewCheckWatchSnapshotFromWeb\("watch-data-layer-request-retry"\)/, 'primeiro sync deve ter retry curto contra corrida de boot');
assert.match(activity, /unregisterWatchSyncRequestReceiver\(\)/, 'receiver deve ser removido no destroy');

assert.match(service, /CrewCheckWatchPublisher\.republishLast\(this\)/, 'serviço deve manter fast path de cache');
assert.match(service, /MainActivity\.ACTION_WATCH_SYNC_REQUEST/, 'serviço deve acionar geração fresca se Activity estiver aberta');
assert.match(service, /sendBroadcast\(syncRequest\)/, 'serviço deve encaminhar pedido para a Activity');

console.log('[watch-first-sync] cache + foreground bootstrap OK');
