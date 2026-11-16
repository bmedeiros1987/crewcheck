// Dependency-free source spans for this preparer's fixed declaration layout.
// Not a JS parser: only named declarations with a closing brace at their own
// indentation (or complete one-line declarations) are accepted. Contract tests
// compare selected spans against TypeScript when dependencies are installed.
function createSourceFile(_file,text){
 const statements=[];
 for(const match of text.matchAll(/^([ \t]*)(export\s+(?:default\s+)?)?(async\s+)?function\s+(\w+)\s*\(/gm)){
  const start=match.index+match[1].length,lineEnd=text.indexOf('\n',start),first=text.slice(start,lineEnd<0?text.length:lineEnd);let end;
  if(first.trimEnd().endsWith('}'))end=start+first.trimEnd().length;
  else{const closing=new RegExp('^'+match[1]+'\\}[;]?[ \\t]*(?=\\r?$)','gm');closing.lastIndex=lineEnd;const found=closing.exec(text);if(!found)throw Error('[telegram-binding] unsupported function layout '+match[4]);end=found.index+found[0].trimEnd().length;}
  const node={kind:'function',name:{text:match[4]},modifiers:match[2]?[{kind:'export'}]:[],end,getStart:()=>start,getText:()=>text.slice(start,end)};statements.push(node);
 }
 for(const match of (_file==='client/src/pages/TelegramConnectPage.tsx'?text:'').matchAll(/^([ \t]*)useEffect\(/gm)){
  const start=match.index+match[1].length,firstEnd=text.indexOf('\n',start),line=text.slice(start,firstEnd<0?text.length:firstEnd);let end;
  if(line.trimEnd().endsWith(');'))end=start+line.trimEnd().length;
  else{const tail=new RegExp('^'+match[1]+'\\}, \\[\\]\\);','gm');tail.lastIndex=firstEnd;const found=tail.exec(text);if(!found)throw Error('[telegram-binding] unsupported effect layout');end=found.index+found[0].length;}
  statements.push({kind:'effect',end,getStart:()=>start,expression:{expression:{getText:()=> 'useEffect'}}});
 }
 return {statements};
}
export default {createSourceFile,ScriptKind:{JS:1,TSX:2},SyntaxKind:{ExportKeyword:'export'},isFunctionDeclaration:n=>n?.kind==='function',isExpressionStatement:n=>n?.kind==='effect',isCallExpression:n=>Boolean(n?.expression),forEachChild(node,visit){for(const child of node.statements||[])visit(child);}};
