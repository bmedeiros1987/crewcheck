// POSIX read-only snapshots, not a security boundary against their owner.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const fail=code=>{throw Object.assign(new Error(code),{code});};
export function snapshot(root,{seal=false,dependencyLink}={}){
 const rows={};const walk=relative=>{const file=path.join(root,relative),s=fs.lstatSync(file),mode=s.mode&0o7777;
  if(mode&0o7000)fail('SNAPSHOT_UNSAFE_MODE');
  if(s.isSymbolicLink()){const target=fs.realpathSync(file);if(relative==='node_modules'&&dependencyLink&&target===fs.realpathSync(dependencyLink))rows[relative]={type:'dependency-link',target};else if(target===root||target.startsWith(root+path.sep))rows[relative]={type:'link',target:fs.readlinkSync(file)};else fail('SNAPSHOT_LINK_ESCAPE');return;}
  if(!s.isFile()&&!s.isDirectory())fail('SNAPSHOT_SPECIAL_TYPE');
  if(s.isFile()&&s.nlink!==1)fail('SNAPSHOT_HARDLINK');
  const expected=s.isDirectory()?0o555:(mode&0o111?0o555:0o444);
  if(seal)fs.chmodSync(file,expected);else if(mode!==expected)fail('SNAPSHOT_WRITABLE_OR_MODE_CHANGED');
  rows[relative]={type:s.isDirectory()?'directory':'file',mode:expected,...(s.isFile()?{hash:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}:{})};
  if(s.isDirectory())for(const name of fs.readdirSync(file).sort())walk(relative?relative+'/'+name:name);
 };walk('');return rows;
}
export function verifySnapshot(root,record,options){if(JSON.stringify(snapshot(root,options))!==JSON.stringify(record))fail('SNAPSHOT_CHANGED');}
export function copyDependencies(from,to){fs.cpSync(from,to,{recursive:true,dereference:false,verbatimSymlinks:true,mode:fs.constants.COPYFILE_FICLONE});return snapshot(to,{seal:true});}
