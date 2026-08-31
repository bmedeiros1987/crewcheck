import { useState } from 'react';
import { Check, SlidersHorizontal, Sparkles } from 'lucide-react';
import {
  saveExperiencePreferences,
  setExperienceLevel,
  type CrewExperienceGroup,
  type CrewExperienceLevel,
  type CrewExperiencePreferences,
  loadExperiencePreferences,
} from '@/lib/experiencePreferences';

const LEVELS: Array<{ level: CrewExperienceLevel; title: string; description: string }> = [
  { level: 'essential', title: 'Essencial', description: 'Mostra o necessário para acompanhar escala, apresentação e operação sem excesso de opções.' },
  { level: 'complete', title: 'Completo', description: 'Equilibra operação, financeiro, regulamentação e recursos do dia a dia.' },
  { level: 'advanced', title: 'Avançado', description: 'Exibe todas as áreas e ferramentas disponíveis no CrewCheck.' },
  { level: 'custom', title: 'Personalizado', description: 'Você decide quais famílias de recursos ficam visíveis na navegação.' },
];

const GROUPS: Array<{ key: CrewExperienceGroup; title: string; description: string }> = [
  { key: 'operations', title: 'Operação', description: 'Saída, portão, radar, meteorologia e apresentação.' },
  { key: 'finance', title: 'Financeiro', description: 'Ganhos, salário, diárias e relatórios.' },
  { key: 'regulation', title: 'Regulamentação', description: 'Carga, limites, RBAC e ACT.' },
  { key: 'lifestyle', title: 'Pernoite e rotina', description: 'Hotel, academia, rotina e tripulação.' },
  { key: 'sharing', title: 'Integrações e compartilhamento', description: 'Calendário, exportação, Concierge, comunidade e histórico.' },
  { key: 'advancedTools', title: 'Ferramentas avançadas', description: 'BIDS, importações assistidas e utilitários especializados.' },
];

export default function ExperiencePreferencesCard() {
  const [preferences, setPreferences] = useState<CrewExperiencePreferences>(loadExperiencePreferences);

  function choose(level: CrewExperienceLevel) {
    const next = setExperienceLevel(level);
    setPreferences(next);
  }

  function toggle(group: CrewExperienceGroup) {
    const next = saveExperiencePreferences({
      level: 'custom',
      groups: { ...preferences.groups, [group]: !preferences.groups[group] },
    });
    setPreferences(next);
  }

  return <section className="cc-experience-card" aria-labelledby="cc-experience-title">
    <header>
      <span className="cc-experience-icon"><Sparkles size={22}/></span>
      <div><small>EXPERIÊNCIA ADAPTATIVA</small><h2 id="cc-experience-title">Quanto do CrewCheck você quer ver?</h2><p>Os recursos continuam disponíveis quando o contexto pedir. Esta preferência reduz a quantidade de opções fixas na navegação.</p></div>
    </header>
    <div className="cc-experience-levels" role="radiogroup" aria-label="Nível de experiência">
      {LEVELS.map((item) => <button
        type="button"
        key={item.level}
        role="radio"
        aria-checked={preferences.level === item.level}
        className={preferences.level === item.level ? 'active' : ''}
        onClick={() => choose(item.level)}
      >
        <span><strong>{item.title}</strong><small>{item.description}</small></span>
        {preferences.level === item.level ? <Check size={18}/> : <SlidersHorizontal size={18}/>}
      </button>)}
    </div>
    {preferences.level === 'custom' && <div className="cc-experience-groups">
      {GROUPS.map((group) => <label key={group.key}>
        <span><strong>{group.title}</strong><small>{group.description}</small></span>
        <input type="checkbox" checked={preferences.groups[group.key]} onChange={() => toggle(group.key)}/>
      </label>)}
    </div>}
    <p className="cc-experience-note">A visualização e os filtros da Escala permanecem configurados dentro da própria Escala, para não criar duas fontes de preferência.</p>
  </section>;
}
