const RELEASE_WATCHER_PATTERN = /\s*<script id="crewcheck-release-watch-v\d+">[\s\S]*?<\/script>\s*/g;

export function hasReleaseWatcher(source) {
  return /<script id="crewcheck-release-watch-v\d+">/.test(source);
}

export function replaceReleaseWatchers(source, watcher) {
  const withoutWatchers = source.replace(RELEASE_WATCHER_PATTERN, '\n');
  if (!withoutWatchers.includes('</body>')) {
    throw new Error('[release-watcher] Elemento </body> não localizado.');
  }
  return withoutWatchers.replace('</body>', `  ${watcher}\n</body>`);
}
