import fs from 'node:fs';
const destination = 'client/src/components/wellness';
fs.mkdirSync(destination, { recursive: true });
for (const name of ['WellnessDashboard.tsx', 'wellness.ts', 'wellness.css']) fs.copyFileSync(`scripts/crewlife-wellness/${name}`, `${destination}/${name}`);
function patch(path, transform) {
  const source = fs.readFileSync(path, 'utf8');
  if (source.includes('// crewlife-wellness prepared')) return;
  const next = transform(source);
  fs.writeFileSync(path, '// crewlife-wellness prepared\n' + next);
}
function replace(source, before, after) {
  if (!source.includes(before)) throw new Error(`CrewLife source anchor missing: ${before.slice(0, 80)}`);
  return source.replace(before, after);
}
patch('client/src/components/v1434/CrewCheckLifeView.tsx', source => {
  source = "import WellnessDashboard from '@/components/wellness/WellnessDashboard';\n" + source;
  source = replace(source, 'const [manual, setManual]', 'const [wellnessEpoch, setWellnessEpoch] = useState(0);\n  const [manual, setManual]');
  source = replace(source, 'function revokeNative() {', 'function revokeNative() {\n    setWellnessEpoch(value => value + 1);');
  const start = source.indexOf('    <section className={`cc-life-recommendation');
  const end = source.indexOf('    <div className="cc-life-sync-strip">', start);
  if (start < 0 || end < start) throw new Error('CrewLife recommendation region missing');
  source = source.slice(0, start) + '    <WellnessDashboard key={wellnessEpoch} manual={readStored(KEYS.manual, DEFAULT_MANUAL)} sleepGoalHours={profile.sleepTarget}/>\n\n' + source.slice(end);
  source = replace(source, '<LifeConciergePanel nextProgram={nextProgram} healthSummary={nativeSummary} profile={profile}/>', '<details className="cw-habits"><summary>Hábitos, metas e histórico</summary><LifeConciergePanel hideRecommendation nextProgram={nextProgram} healthSummary={nativeSummary} profile={profile}/></details>');
  const metricsStart = source.indexOf('    <section className="cc-life-metrics"');
  const metricsEnd = source.indexOf('    <section className="cc-life-block cc-life-integrations">', metricsStart);
  if (metricsStart < 0 || metricsEnd < metricsStart) throw new Error('CrewLife metrics region missing');
  return source.slice(0, metricsStart) + source.slice(metricsEnd);
});
patch('client/src/components/v14313/LifeConciergePanel.tsx', source => {
  source = replace(source, '({ nextProgram, healthSummary, profile }: {', '({ nextProgram, healthSummary, profile, hideRecommendation = false }: { hideRecommendation?: boolean;');
  source = replace(source, '<article className={`cc-life-ai-recommendation', '{!hideRecommendation && <article className={`cc-life-ai-recommendation');
  return replace(source, '    </article>\n\n    <div className="cc-life-ai-dashboard">', '    </article>}\n\n    <div className="cc-life-ai-dashboard">');
});
