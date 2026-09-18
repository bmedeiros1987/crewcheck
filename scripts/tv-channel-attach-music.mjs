import { createHash } from 'node:crypto';
import { readFile,writeFile,mkdir,copyFile,realpath } from 'node:fs/promises';
import path from 'node:path';
const stage=await realpath(process.argv[2]||'dist/lg-webos');
const source=await realpath(process.argv[3]||process.env.TV_SOUNDTRACK_DIR||'');
const manifest=JSON.parse(await readFile(new URL('../apps/tv-player/music-manifest.json',import.meta.url),'utf8'));
const app=JSON.parse(await readFile(path.join(stage,'appinfo.json'),'utf8'));
if(!['online.crewcheck.tv.demo','online.crewcheck.tv.pilot'].includes(app.id)||app.version!=='0.1.6') throw Error('Unexpected target: only the 0.1.6 test applications may be finalized');
const verified=[];
for(const track of manifest.tracks){
  if(path.basename(track.input)!==track.input||path.basename(track.file)!==track.file) throw Error('Unsafe music path');
  const input=path.join(source,track.input);
  const bytes=await readFile(input);
  const sha=createHash('sha256').update(bytes).digest('hex');
  if(sha!==track.sha256||bytes.length!==track.bytes) throw Error('Original soundtrack mismatch: '+track.input);
  verified.push({...track,inputPath:input});
}
await mkdir(path.join(stage,'music'),{recursive:true});
for(const track of verified) await copyFile(track.inputPath,path.join(stage,'music',track.file));
const meta=JSON.parse(await readFile(path.join(stage,'tv-build.json'),'utf8'));
meta.soundtrackBundled=true;meta.soundtrack=verified.map(({title,file,sha256,bytes})=>({title,file,sha256,bytes}));
meta.note='Restricted test build with four original owner-supplied MP3 files. No reencoding or external audio hosting. Physical LG playback and account authorization still required.';
await writeFile(path.join(stage,'tv-build.json'),JSON.stringify(meta,null,2));
console.log('Verified and attached four original MP3 files. Package this staging directory with the official webOS CLI.');
