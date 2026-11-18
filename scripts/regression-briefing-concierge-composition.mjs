import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
// Read-only pinned #1203 source; test composition is a new disposable copy.
// This does not merge/publish that PR, start AI, or touch #1208/history.
const root=process.cwd(),source=process.env.CREWCHECK_CONCIERGE_COMPOSITION_SOURCE;
assert(source,'read-only #1203 fixture source required');
const homeSource=fs.readFileSync(path.join(source,'client/src/pages/Home.tsx'),'utf8');
assert(homeSource.includes('useCrewciergeConversation'));
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'crewcheck-briefing-composition-'));
for(const name of ['client','shared','scripts'])fs.cpSync(path.join(source,name),path.join(scratch,name),{recursive:true});
fs.symlinkSync(path.join(root,'node_modules'),path.join(scratch,'node_modules'),'dir');
const anchor='    <section className="cz-toolbox">\n      <h2>Enviar a escala pelo Telegram</h2>';
assert.equal(homeSource.split(anchor).length,2);
fs.writeFileSync(path.join(scratch,'client/src/pages/Home.tsx'),homeSource.replace(anchor,'    <div className="cc-notification-center"><OperationalBriefing/></div>\n'+anchor));
fs.copyFileSync(path.join(root,'client/src/components/notifications/OperationalBriefing.tsx'),path.join(scratch,'client/src/components/notifications/OperationalBriefing.tsx'));
const testFile=path.join(scratch,'scripts/regression-crewcierge-screen-browser.mjs');let test=fs.readFileSync(testFile,'utf8');
const imports="import{WellhubConciergeAnswer}";assert(test.includes(imports));test=test.replace(imports,"import{OperationalBriefing}from'./client/src/components/notifications/OperationalBriefing';\n"+imports);
const ready='await page.waitForFunction(()=>window.fixtureReady&&window.fixtureAsk&&window.fixtureSettled);';assert(test.includes(ready));test=test.replace(ready,ready+"await page.getByRole('status').filter({hasText:'Sem conexão.'}).waitFor();");
fs.writeFileSync(testFile,test);
const playwright=process.env.CREWCHECK_PLAYWRIGHT_PACKAGE||createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE||import.meta.url).resolve('playwright');
const output=execFileSync(process.execPath,[testFile],{cwd:scratch,env:{...process.env,CREWCHECK_PLAYWRIGHT_PACKAGE:playwright},encoding:'utf8',timeout:120000});
process.stdout.write(output);
console.log(JSON.stringify({status:'PASS',composition:'pinned #1203 actual screen + current briefing',offline:true,applicationHttpAttempts:0,aiStarted:false,physicalDelivery:false}));
