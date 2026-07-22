import fs from 'node:fs';

const appPath = 'client/src/App.tsx';
if (fs.existsSync(appPath)) {
  let app = fs.readFileSync(appPath, 'utf8');
  app = app
    .replace(/\n\s*\{isAuthenticated\(\) && currentPath !== '\/telegram' && <a[\s\S]*?>Telegram<\/a>\}/g, '')
    .replace(/\n\s*\{clientAdmin && currentPath !== '\/admin\/partners' && <a[\s\S]*?>Parceiros<\/a>\}/g, '')
    .replace(/crewcheck_last_loaded_version', '[^']+'/g, "crewcheck_last_loaded_version', '14.2.6'");
  if (/aria-label="Conectar Telegram"[\s\S]*?>Telegram<\/a>/.test(app)) throw new Error('[v1426] Atalho flutuante Telegram permaneceu no App.tsx.');
  if (/aria-label="Gerenciar contas de parceiros"[\s\S]*?>Parceiros<\/a>/.test(app)) throw new Error('[v1426] Atalho flutuante Parceiros permaneceu no App.tsx.');
  fs.writeFileSync(appPath, app, 'utf8');
}

const serverPath = 'server.mjs';
if (fs.existsSync(serverPath)) {
  let server = fs.readFileSync(serverPath, 'utf8');
  const style = '<style id="cc-no-floating-shortcuts">a[aria-label="Conectar Telegram"],a[aria-label="Gerenciar contas de parceiros"]{display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important}</style>';
  if (!server.includes('cc-no-floating-shortcuts')) {
    const normalAnchor = "    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store, no-cache, must-revalidate' });\n    res.end(data);";
    const normalReplacement = `    const guardedData = ext === '.html'\n      ? Buffer.from(data.toString('utf8').replace('</head>', ${JSON.stringify(style)} + '</head>'))\n      : data;\n    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store, no-cache, must-revalidate' });\n    res.end(guardedData);`;
    if (!server.includes(normalAnchor)) throw new Error('[v1426] Âncora do HTML estático não encontrada.');
    server = server.replace(normalAnchor, normalReplacement);

    const fallbackAnchor = "        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });\n        res.end(fallback);";
    const fallbackReplacement = `        const guardedFallback = Buffer.from(fallback.toString('utf8').replace('</head>', ${JSON.stringify(style)} + '</head>'));\n        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store, no-cache, must-revalidate' });\n        res.end(guardedFallback);`;
    if (!server.includes(fallbackAnchor)) throw new Error('[v1426] Âncora do fallback HTML não encontrada.');
    server = server.replace(fallbackAnchor, fallbackReplacement);
    fs.writeFileSync(serverPath, server, 'utf8');
  }
}

console.log('[v1426] Atalhos flutuantes removidos na origem e bloqueados no HTML legado.');
