import fs from 'node:fs';

const imports = "import { applyCrewCheckTheme, getCrewCheckThemePreference, getEffectiveCrewCheckTheme, setCrewCheckThemePreference } from './lib/themeRuntime';";
const appPath = 'client/src/App.tsx';
let app = fs.readFileSync(appPath, 'utf8');
if (!app.includes(imports)) app = imports + '\n' + app;
const oldStart = app.indexOf('function loadCrewThemeMode():');
const oldEnd = app.indexOf('\nfunction CrewCheckOpeningSplash', oldStart);
if (oldStart < 0 || oldEnd < 0) throw new Error('Theme App initialization anchor missing');
app = app.slice(0, oldStart) + `function loadCrewThemeMode(): CrewThemeMode { return getCrewCheckThemePreference(); }
function getEffectiveCrewTheme(mode: CrewThemeMode): 'light' | 'dark' { return getEffectiveCrewCheckTheme(mode); }
function applyCrewThemeMode(mode: CrewThemeMode) { applyCrewCheckTheme(mode); }
` + app.slice(oldEnd);
fs.writeFileSync(appPath, app);

const homePath = 'client/src/pages/Home.tsx';
let home = fs.readFileSync(homePath, 'utf8');
const homeImports = imports.replace("'./lib/themeRuntime'", "'../lib/themeRuntime'");
if (!home.includes(homeImports)) home = homeImports + '\n' + home;
const toggleStart = home.indexOf('function ToggleSetting(');
const toggleEnd = home.indexOf('\nfunction NotificationPermissionSetting', toggleStart);
if (toggleStart < 0 || toggleEnd < 0) throw new Error('Theme setting anchor missing');
home = home.slice(0, toggleStart) + `function ToggleSetting({ icon: Icon, label, storageKey, defaultOn = true, detail }: { icon: any; label: string; storageKey: string; defaultOn?: boolean; detail?: string }) {
  const isTheme = storageKey === 'crewcheck_light_premium';
  const [on, setOn] = useState(() => isTheme ? getEffectiveCrewCheckTheme() === 'light' : storage.get(storageKey, defaultOn ? '1' : '0') !== '0');
  useEffect(() => {
    if (!isTheme) return;
    const refresh = () => setOn(getEffectiveCrewCheckTheme() === 'light');
    refresh();
    window.addEventListener('crewcheck:theme-change', refresh);
    window.addEventListener('storage', refresh);
    return () => { window.removeEventListener('crewcheck:theme-change', refresh); window.removeEventListener('storage', refresh); };
  }, [isTheme]);
  const toggle = () => {
    const next = isTheme ? getEffectiveCrewCheckTheme() !== 'light' : !on;
    setOn(next);
    storage.set(storageKey, next ? '1' : '0');
    if (isTheme) setCrewCheckThemePreference(next ? 'light' : 'dark');
    toast.success(label + ': ' + (next ? 'ativado' : 'desativado'));
  };
  return <button className="cz-setting" onClick={toggle}><Icon/><div><strong>{label}</strong><small>{detail || (on ? 'Ativo' : 'Inativo')}</small></div><span className={on ? 'on' : ''}/></button>;
}
` + home.slice(toggleEnd);
// Replace only theme initialization and synchronization; retain navigation listeners.
home = home.replace(/    const mode = storage\.get\('crewcheck_theme_mode',[\s\S]*?document\.documentElement\.style\.colorScheme = effective;/, '    applyCrewCheckTheme();');
home = home.replace(/    const syncTheme = \(\) => \{[\s\S]*?document\.documentElement\.style\.colorScheme = next;\n    \};/, '    const syncTheme = () => applyCrewCheckTheme();');
home = home.replace("if (storage.get('crewcheck_theme_mode', 'auto') === 'auto') syncTheme();", "if (getCrewCheckThemePreference() === 'system') syncTheme();");
if (home.includes("const mode = storage.get('crewcheck_theme_mode'") || home.includes("const selected = storage.get('crewcheck_theme_mode'")) throw new Error('Independent Home theme writer remains');
fs.writeFileSync(homePath, home);

const authPath = 'client/src/pages/AuthPage.tsx';
let auth = fs.readFileSync(authPath, 'utf8');
if (!auth.includes(homeImports)) auth = homeImports + '\n' + auth;
if (!auth.includes('function chooseCrewTheme(')) {
  const statePattern = /  const \[themeMode, setThemeMode\] = useState<'light' \| 'dark' \| 'system'>\(\(\) => \{[\s\S]*?\n  \}\);/;
  if (!statePattern.test(auth)) throw new Error('Auth theme state anchor missing');
  auth = auth.replace(statePattern, `  const [themeMode, setThemeMode] = useState(getCrewCheckThemePreference);
  function chooseCrewTheme(next: 'light' | 'dark' | 'system') {
    setCrewCheckThemePreference(next);
    setThemeMode(next);
  }`);
  const effectPattern = /  useEffect\(\(\) => \{\n    const media = window\.matchMedia\?\.\('\(prefers-color-scheme: dark\)'\);[\s\S]*?\n  \}, \[themeMode\]\);/;
  if (!effectPattern.test(auth)) throw new Error('Auth theme effect anchor missing');
  const version = auth.match(/localStorage\.setItem\('crewcheck_last_loaded_version', '([^']+)'\)/)?.[1];
  if (!version) throw new Error('Auth version marker missing');
  auth = auth.replace(effectPattern, `  useEffect(() => {
    const refresh = () => { applyCrewCheckTheme(); setThemeMode(getCrewCheckThemePreference()); };
    refresh();
    localStorage.setItem('crewcheck_last_loaded_version', '${version}');
    window.addEventListener('crewcheck:theme-change', refresh);
    window.addEventListener('storage', refresh);
    return () => { window.removeEventListener('crewcheck:theme-change', refresh); window.removeEventListener('storage', refresh); };
  }, []);`);
  auth = auth.replaceAll("onClick={() => setThemeMode('", "onClick={() => chooseCrewTheme('");
}
fs.writeFileSync(authPath, auth);
