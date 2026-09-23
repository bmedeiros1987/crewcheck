import fs from 'node:fs';

function mustReplace(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`[crewlife-routine] anchor not found: ${label}`);
  return source.replace(before, after);
}

function update(path, transform) {
  const source = fs.readFileSync(path, 'utf8');
  const next = transform(source);
  if (next !== source) fs.writeFileSync(path, next);
}

update('client/src/components/v1434/CrewCheckLifeView.tsx', (source) => {
  let next = source;

  next = mustReplace(
    next,
    "import { toast } from 'sonner';",
    "import { toast } from 'sonner';\nimport { getLifeRoutineContext, type LifeRoutineContext } from '@/lib/lifeConcierge';",
    'lifeConcierge import',
  );

  next = mustReplace(
    next,
    `type LifeConsent = {\n  active: boolean;\n  acceptedAt: string;\n  policyVersion: '1.0';\n};\n\ntype LifeProfile = {`,
    `type LifeConsent = {\n  active: boolean;\n  acceptedAt: string;\n  policyVersion: '1.0';\n};\n\ntype RoutineIntegrationConsent = {\n  active: boolean;\n  acceptedAt: string;\n  policyVersion: '1.0';\n};\n\ntype LifeProfile = {`,
    'routine consent type',
  );

  next = mustReplace(
    next,
    `  nativeSummary: 'crewcheck:life:health-summary:v1',\n};`,
    `  nativeSummary: 'crewcheck:life:health-summary:v1',\n  routineIntegration: 'crewcheck:life:routine-integration:v1',\n};\n\nconst LIFE_COMPANION_PACKAGE = 'com.crewcheck.life';\nconst LIFE_COMPANION_WEB_URL = \`https://play.google.com/store/apps/details?id=\${LIFE_COMPANION_PACKAGE}\`;`,
    'routine key and Play URL',
  );

  next = mustReplace(
    next,
    `  const [companionStatus, setCompanionStatus] = useState<{ installed?: boolean; state?: string; automatic?: boolean }>({});\n  const [watchMirrorEnabled, setWatchMirrorEnabled] = useState(() => {`,
    `  const [companionStatus, setCompanionStatus] = useState<{ installed?: boolean; state?: string; automatic?: boolean }>({});\n  const [routineIntegration, setRoutineIntegration] = useState<RoutineIntegrationConsent>(() => readStored(KEYS.routineIntegration, { active: false, acceptedAt: '', policyVersion: '1.0' }));\n  const [routineContext, setRoutineContext] = useState<LifeRoutineContext | null>(null);\n  const [watchMirrorEnabled, setWatchMirrorEnabled] = useState(() => {`,
    'routine state',
  );

  next = mustReplace(
    next,
    `      window.removeEventListener('crewcheck:life-companion-summary', onCompanion);\n      window.removeEventListener('focus', readCompanion);\n    };\n  }, []);\n\n  const companionAgeMs`,
    `      window.removeEventListener('crewcheck:life-companion-summary', onCompanion);\n      window.removeEventListener('focus', readCompanion);\n    };\n  }, []);\n\n  useEffect(() => {\n    const refreshRoutineContext = () => setRoutineContext(routineIntegration.active ? getLifeRoutineContext() : null);\n    refreshRoutineContext();\n    window.addEventListener('crewcheck:life-adaptive-update', refreshRoutineContext);\n    window.addEventListener('storage', refreshRoutineContext);\n    return () => {\n      window.removeEventListener('crewcheck:life-adaptive-update', refreshRoutineContext);\n      window.removeEventListener('storage', refreshRoutineContext);\n    };\n  }, [routineIntegration.active]);\n\n  const companionAgeMs`,
    'routine context effect',
  );

  next = mustReplace(
    next,
    `  const metrics = useMemo(() => {\n    const sleepHours = numberOrZero(effectiveSummary.sleepMinutes) / 60 || numberOrZero(manual.sleepHours);\n    return {\n      sleepHours,\n      steps: numberOrZero(effectiveSummary.steps) || numberOrZero(manual.steps),\n      activityMinutes: numberOrZero(effectiveSummary.activityMinutes) || numberOrZero(manual.activityMinutes),\n      studyMinutes: numberOrZero(manual.studyMinutes),\n      leisureMinutes: numberOrZero(manual.leisureMinutes),\n    };\n  }, [manual, effectiveSummary]);`,
    `  const metrics = useMemo(() => {\n    const routineSleepHours = routineIntegration.active ? numberOrZero(routineContext?.sleep.latestMinutes) / 60 : 0;\n    const routineActivityMinutes = routineIntegration.active ? numberOrZero(routineContext?.exercise.minutesPeriod) : 0;\n    const routineStudyMinutes = routineIntegration.active ? numberOrZero(routineContext?.study.minutes7Days) : 0;\n    const routineLeisureMinutes = routineIntegration.active ? numberOrZero(routineContext?.leisure.minutes7Days) : 0;\n    const sleepHours = numberOrZero(effectiveSummary.sleepMinutes) / 60 || routineSleepHours || numberOrZero(manual.sleepHours);\n    return {\n      sleepHours,\n      steps: numberOrZero(effectiveSummary.steps) || numberOrZero(manual.steps),\n      activityMinutes: numberOrZero(effectiveSummary.activityMinutes) || routineActivityMinutes || numberOrZero(manual.activityMinutes),\n      studyMinutes: routineStudyMinutes || numberOrZero(manual.studyMinutes),\n      leisureMinutes: routineLeisureMinutes || numberOrZero(manual.leisureMinutes),\n    };\n  }, [manual, effectiveSummary, routineIntegration.active, routineContext]);`,
    'routine-aware metrics',
  );

  next = mustReplace(
    next,
    `  function setWatchMirror(enabled: boolean) {`,
    `  function setRoutineIntegrationEnabled(enabled: boolean) {\n    const nextConsent: RoutineIntegrationConsent = {\n      active: enabled,\n      acceptedAt: enabled ? new Date().toISOString() : '',\n      policyVersion: '1.0',\n    };\n    setRoutineIntegration(nextConsent);\n    writeStored(KEYS.routineIntegration, nextConsent);\n    setRoutineContext(enabled ? getLifeRoutineContext() : null);\n    toast.success(enabled\n      ? 'Minha Rotina agora pode contextualizar o CrewLife neste aparelho.'\n      : 'Integração com Minha Rotina desativada.');\n  }\n\n  function clearRoutineIntegration() {\n    try { localStorage.removeItem(KEYS.routineIntegration); } catch {}\n    setRoutineIntegration({ active: false, acceptedAt: '', policyVersion: '1.0' });\n    setRoutineContext(null);\n    toast.success('Integração com Minha Rotina limpa. Isso não apaga seus registros de Rotina.');\n  }\n\n  function openSamsungConnection() {\n    const native = (window as any).AndroidCrewCheckNative;\n    if (native?.openLifeCompanion) {\n      try {\n        const opened = native.openLifeCompanion();\n        if (opened !== false) return;\n      } catch {}\n    }\n    try {\n      window.open(LIFE_COMPANION_WEB_URL, '_blank', 'noopener,noreferrer');\n    } catch {\n      window.location.assign(LIFE_COMPANION_WEB_URL);\n    }\n    toast.info('A sincronização automática com Samsung Health exige Android. O CrewLife continua disponível no modo manual.');\n  }\n\n  function setWatchMirror(enabled: boolean) {`,
    'routine + Samsung actions',
  );

  next = mustReplace(
    next,
    `    setNativeStatus({});\n    setConsentChecked(false);`,
    `    setNativeStatus({});\n    setRoutineIntegration({ active: false, acceptedAt: '', policyVersion: '1.0' });\n    setRoutineContext(null);\n    setConsentChecked(false);`,
    'delete routine consent with Life',
  );

  next = mustReplace(
    next,
    `<Smartphone/><div><h3>CrewLife Companion Samsung</h3><p>Lê automaticamente passos, sono, atividade e Energy Score do Samsung Health, somente com sua autorização.</p><small>{automaticSamsung ? 'Samsung Health conectado · automático' : companionStatus.installed ? 'Instalado · concluir conexão' : 'Companion não instalado'}</small></div>`,
    `<Smartphone/><div><h3>Samsung Health</h3><p>O CrewLife Companion é um componente opcional para sincronização automática de passos, sono, atividade e Energy Score do Samsung Health, somente com sua autorização.</p><small>{automaticSamsung ? 'Samsung Health · conectado automaticamente' : companionStatus.installed ? 'Companion instalado · concluir conexão' : 'Samsung Health · não instalado'}</small></div>`,
    'Samsung connection copy',
  );

  next = mustReplace(
    next,
    `<button className={automaticSamsung ? '' : 'primary'} onClick={() => {\n            const ok = (window as any).AndroidCrewCheckNative?.openLifeCompanion?.();\n            if (!ok) toast.info('Instale o CrewLife Companion Samsung para ativar a sincronização automática.');\n          }}>{automaticSamsung ? 'Abrir Companion' : companionStatus.installed ? 'Conectar' : 'Como instalar'}</button>`,
    `<button className={automaticSamsung ? '' : 'primary'} onClick={openSamsungConnection}>{automaticSamsung ? 'Abrir Companion' : 'Conectar Samsung Health'}</button>`,
    'Samsung connection action',
  );

  next = mustReplace(
    next,
    `    <section className="cc-life-block">\n      <header><div><small>OBJETIVOS</small><h2>Preferências da sua rotina</h2></div><button onClick={saveProfile}>Salvar objetivos</button></header>`,
    `    <section className="cc-life-block cc-life-routine-integration">\n      <header><div><small>ROTINA INTEGRADA</small><h2>CrewLife + Minha Rotina</h2><p>Você escolhe se o CrewLife pode usar seus registros locais de estudo, treino, lazer, descanso e hábitos salvos para personalizar o painel.</p></div><ShieldCheck/></header>\n      <label className="cc-life-check"><input type="checkbox" checked={routineIntegration.active} onChange={(event) => setRoutineIntegrationEnabled(event.target.checked)}/><span><strong>Integrar minha Rotina ao CrewLife</strong><br/>Desativado por padrão. Este consentimento é separado do CrewLife e da conexão com Samsung Health.</span></label>\n      <p>Quando ativado, o CrewLife usa somente contexto local e suas próximas programações para sugestões pessoais. Não altera escala, APZ, jornada, compliance ou financeiro; não determina diagnóstico, aptidão ou fadiga operacional.</p>\n      {routineIntegration.active && <div className="cc-life-actions"><button onClick={clearRoutineIntegration}>Desativar e limpar integração</button><small>Limpar a integração não apaga seus registros de Rotina nem afeta o Companion Samsung.</small></div>}\n    </section>\n\n    <section className="cc-life-block">\n      <header><div><small>OBJETIVOS</small><h2>Preferências da sua rotina</h2></div><button onClick={saveProfile}>Salvar objetivos</button></header>`,
    'routine integrated section',
  );

  return next;
});

update('android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java', (source) => {
  return mustReplace(
    source,
    `        @JavascriptInterface\n        public boolean openLifeCompanion() {\n            try {\n                Intent launch = getPackageManager().getLaunchIntentForPackage("com.crewcheck.life");\n                if (launch == null) return false;\n                launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);\n                startActivity(launch);\n                return true;\n            } catch (Exception error) {\n                return false;\n            }\n        }`,
    `        @JavascriptInterface\n        public boolean openLifeCompanion() {\n            try {\n                Intent launch = getPackageManager().getLaunchIntentForPackage(LIFE_COMPANION_PACKAGE);\n                if (launch == null) {\n                    try {\n                        Intent market = new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + LIFE_COMPANION_PACKAGE));\n                        market.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);\n                        startActivity(market);\n                        return true;\n                    } catch (Exception marketError) {\n                        try {\n                            Intent web = new Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=" + LIFE_COMPANION_PACKAGE));\n                            web.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);\n                            startActivity(web);\n                            return true;\n                        } catch (Exception webError) {\n                            return false;\n                        }\n                    }\n                }\n                launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);\n                startActivity(launch);\n                return true;\n            } catch (Exception error) {\n                return false;\n            }\n        }`,
    'native Companion Play fallback',
  );
});

console.log('[crewlife-routine] source patch applied');
