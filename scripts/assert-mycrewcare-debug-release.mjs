import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
const root='android-wrapper/app';
const debugClass='CrewCheckMyCrewCareDebugActivity';
const read=p=>readFileSync(p,'utf8');
assert.doesNotMatch(read(root+'/src/main/AndroidManifest.xml'),new RegExp(debugClass));
assert.match(read(root+'/src/debug/AndroidManifest.xml'),new RegExp(debugClass));
assert.equal(existsSync(root+'/src/main/java/com/crewcheck/app/'+debugClass+'.java'),false);
assert.match(read(root+'/build.gradle'),/debug\s*\{\s*applicationIdSuffix "\.mcctest"/);
assert.match(read(root+'/src/main/java/com/crewcheck/app/CrewCheckMyCrewCarePortalV3.java'),/RELEASE_ENABLED = false/);
if(process.argv.includes('--compiled')){
 const files=[];function walk(p){for(const f of readdirSync(p,{withFileTypes:true})){const next=join(p,f.name);if(f.isDirectory())walk(next);else files.push(next);}}
 walk(root+'/build/intermediates');
 const manifests=kind=>files.filter(p=>p.endsWith('/AndroidManifest.xml')&&p.includes('/'+kind+'/')&&/\/merged_manifests?\//.test(p));
 const release=manifests('release'),debug=manifests('debug');assert.ok(release.length>0&&debug.length>0,'both merged manifests must exist');
 for(const p of release){assert.doesNotMatch(read(p),new RegExp(debugClass));assert.match(read(p),/MainActivity/);assert.match(read(p),/package="com\.crewcheck\.app"/);}
 for(const p of debug){assert.match(read(p),new RegExp(debugClass));assert.doesNotMatch(read(p),/MainActivity|CrewCheckNotificationReceiver|CrewCheckWatchSyncService/);assert.match(read(p),/package="com\.crewcheck\.app\.mcctest"/);}
 const classes=kind=>files.filter(p=>p.includes('/javac/'+kind+'/')&&p.endsWith('.class'));
 assert.ok(classes('debug').some(p=>p.endsWith('/'+debugClass+'.class')),'debug class must compile');
 assert.ok(classes('release').some(p=>p.endsWith('/CrewCheckMyCrewCareRuntimeV3.class')),'release Java must compile');
 assert.equal(classes('release').some(p=>p.includes(debugClass)),false,'no debug class or nested class in release');
}
console.log('PASS debug action release exclusion'+(process.argv.includes('--compiled')?' (actual merged manifests + bytecode)':' (source sets; compiled gate is separate)'));
