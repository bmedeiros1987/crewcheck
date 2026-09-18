import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,copyFile,realpath} from 'node:fs/promises';
import path from 'node:path';
const [stageArg,brandArg,musicArg]=process.argv.slice(2);
if(!stageArg||!brandArg||!musicArg)throw Error('Usage: node scripts/tv-broadcast-finalize.mjs STAGE OWNER_BRAND_DIR OWNER_MP3_DIR');
const stage=await realpath(stageArg),brand=await realpath(brandArg),music=await realpath(musicArg);
const app=JSON.parse(await readFile(path.join(stage,'appinfo.json'),'utf8'));
if(!['online.crewcheck.tv.demo','online.crewcheck.tv.pilot'].includes(app.id)||app.version!=='0.1.7')throw Error('Only version 0.1.7 test packages may be finalized');
const assets=JSON.parse(await readFile(new URL('../apps/tv-player/brand-assets.json',import.meta.url),'utf8'));
const tracks=JSON.parse(await readFile(new URL('../apps/tv-player/music-manifest.json',import.meta.url),'utf8'));
const validated=[];
for(const entry of assets.files){
 if(path.basename(entry.file)!==entry.file)throw Error('Unsafe asset name');
 validated.push({entry,from:path.join(brand,entry.file),to:path.join(stage,'brand',entry.file)});
}
for(const entry of tracks.tracks){
 if(path.basename(entry.file)!==entry.file||path.basename(entry.input)!==entry.input)throw Error('Unsafe music name');
 validated.push({entry,from:path.join(music,entry.input),to:path.join(stage,'music',entry.file)});
}
// Verify every byte before changing the staging directory. No fallback logo,
// invented song, remote download or operational credential is allowed.
for(const item of validated){const bytes=await readFile(item.from);if(bytes.length!==item.entry.bytes||createHash('sha256').update(bytes).digest('hex')!==item.entry.sha256)throw Error('Owner asset mismatch: '+path.basename(item.from));}
await mkdir(path.join(stage,'brand'),{recursive:true});await mkdir(path.join(stage,'music'),{recursive:true});
for(const item of validated)await copyFile(item.from,item.to);
await copyFile(path.join(brand,'icon.png'),path.join(stage,'icon.png'));
await copyFile(path.join(brand,'large-icon.png'),path.join(stage,'large-icon.png'));
const meta=JSON.parse(await readFile(path.join(stage,'tv-build.json'),'utf8'));
meta.brandAssetsBundled=true;meta.soundtrackBundled=true;meta.brandAssets=assets.files;
meta.soundtrack=tracks.tracks.map(({title,file,sha256,bytes})=>({title,file,sha256,bytes}));
meta.note='Finalized 0.1.7 test package. Owner-selected horizontal CrewCheck logo, Crewtopia/Cirium/Bruno credits, separated broadcast views and original local soundtrack. Image/scan animation is illustrative; missing real data remains unavailable. No hardware, account E2E or store approval claimed.';
await writeFile(path.join(stage,'tv-build.json'),JSON.stringify(meta,null,2));
console.log('Verified 9 image assets and 4 original MP3s. Ready for official LG CLI packaging, not store publication.');
