import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronDown, ChevronUp, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import { getStoredUser } from '@/lib/authClient';
import {
  DEFAULT_HOME_LAYOUT,
  HOME_SLOT_ORDER,
  REQUIRED_HOME_SLOTS,
  readHomeLayout,
  resetHomeLayout,
  saveHomeLayout,
  visibleHomeSlots,
  type HomeLayoutPreference,
  type HomeMode,
  type HomeSlotId,
} from '@/lib/homeLayoutPreference';
import './home-layout.css';

export type HomeLayoutSlot = {
  id: HomeSlotId;
  label: string;
  description: string;
  content: ReactNode;
};

const modeCopy: Record<HomeMode, { label: string; detail: string }> = {
  roster: { label: 'Escala rápida', detail: 'Consulte o dia e abra a atividade na escala detalhada.' },
  shortcuts: { label: 'Atalhos', detail: 'Seus atalhos fixados e mais usados, com alertas essenciais.' },
  'roster-mixed': { label: 'Escala e atalhos', detail: 'Consulta rápida da escala e seus atalhos na mesma tela.' },
  standard: { label: 'Padrão CrewCheck', detail: 'Resumo e ações na ordem recomendada.' },
  personalized: { label: 'Personalizada', detail: 'Seus atalhos primeiro, com a programação e os alertas.' },
  mixed: { label: 'Mista', detail: 'Essenciais CrewCheck com seus favoritos.' },
};

function copyPreference(value: HomeLayoutPreference): HomeLayoutPreference {
  return { ...value, order: [...value.order], visible: [...value.visible] };
}

export function HomeLayoutShell({ slots, standardContent, shortcuts, quickRoster, editorOnly = false }: { slots: HomeLayoutSlot[]; standardContent?: ReactNode; shortcuts?: ReactNode; quickRoster?: ReactNode; editorOnly?: boolean }) {
  const accountId = (() => { try { return getStoredUser()?.id || null; } catch { return null; } })();
  const [saved, setSaved] = useState(() => readHomeLayout(window.localStorage, accountId));
  const [draft, setDraft] = useState(() => copyPreference(saved));
  const wasEditingRef = useRef(false);
  const personalizeRef = useRef<HTMLButtonElement>(null);
  const radioRefs = useRef<Partial<Record<HomeMode, HTMLButtonElement>>>({});
  const [editing, setEditing] = useState(editorOnly);
  const [status, setStatus] = useState('');
  const slotById = useMemo(() => new Map(slots.map((slot) => [slot.id, slot])), [slots]);
  const preference = editing ? draft : saved;
  const rendered = visibleHomeSlots(preference, slots.map((slot) => slot.id));
  useEffect(() => {
    const next = readHomeLayout(window.localStorage, accountId);
    setSaved(next); setDraft(copyPreference(next)); setEditing(editorOnly); setStatus('');
  }, [accountId, editorOnly]);
  useEffect(() => { const refresh = () => { if (!editorOnly) { const next = readHomeLayout(window.localStorage, accountId); setSaved(next); setDraft(copyPreference(next)); } }; window.addEventListener("crewcheck:personalization", refresh); return () => window.removeEventListener("crewcheck:personalization", refresh); }, [accountId, editorOnly]);

  useEffect(() => {
    if (editing) radioRefs.current[draft.mode]?.focus();
    else if (wasEditingRef.current) personalizeRef.current?.focus();
    wasEditingRef.current = editing;
  }, [editing]);

  function cancel() { setDraft(copyPreference(saved)); if (!editorOnly) setEditing(false); }

  function selectWithKeyboard(event: React.KeyboardEvent<HTMLButtonElement>, mode: HomeMode) {
    const modes = Object.keys(modeCopy) as HomeMode[];
    let target: HomeMode;
    if (event.key === 'Home') target = modes[0];
    else if (event.key === 'End') target = modes[modes.length - 1];
    else if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(event.key)) {
      const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
      target = modes[(modes.indexOf(mode) + step + modes.length) % modes.length];
    } else return;
    event.preventDefault();
    setDraft((current) => ({ ...current, mode: target }));
    radioRefs.current[target]?.focus();
  }

  function beginEdit() {
    if (!editorOnly) { window.dispatchEvent(new CustomEvent("crewcheck:open-menu", {detail:{personalize:true}})); return; }
    setDraft(copyPreference(saved));
    setStatus('');
    setEditing(true);
  }

  function move(id: HomeSlotId, direction: -1 | 1) {
    setDraft((current) => {
      const order = [...current.order];
      const index = order.indexOf(id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= order.length) return current;
      [order[index], order[target]] = [order[target], order[index]];
      return { ...current, order };
    });
  }

  function toggle(id: HomeSlotId) {
    if (REQUIRED_HOME_SLOTS.includes(id)) return;
    setDraft((current) => ({
      ...current,
      visible: current.visible.includes(id)
        ? current.visible.filter((slot) => slot !== id)
        : [...current.visible, id],
    }));
  }

  function save() {
    const next = copyPreference(draft);
    if (!saveHomeLayout(window.localStorage, accountId, next)) {
      setStatus(accountId ? 'Não foi possível salvar neste dispositivo.' : 'Entre na sua conta para salvar a personalização.');
      return;
    }
    setSaved(next);
    setEditing(editorOnly);
    window.dispatchEvent(new Event("crewcheck:personalization"));
    setStatus('Preferência salva nesta conta e neste dispositivo.');
  }

  function restore() {
    const next = copyPreference(DEFAULT_HOME_LAYOUT);
    if (!resetHomeLayout(window.localStorage, accountId)) {
      setStatus(accountId ? 'Não foi possível restaurar neste dispositivo.' : 'Entre na sua conta para restaurar o padrão.');
      return;
    }
    setSaved(next);
    setDraft(copyPreference(next));
    setEditing(editorOnly);
    window.dispatchEvent(new Event("crewcheck:personalization"));
    setStatus('Padrão CrewCheck restaurado.');
  }

  const editorHeading = <header className="cc-home-editor-fixed-heading"><div><small>PRÉVIA E PREFERÊNCIAS</small><h2 id="cc-home-layout-editor-title">Como você quer começar?</h2></div>{!editorOnly && <button type="button" className="icon" onClick={cancel} aria-label="Cancelar personalização"><X/></button>}</header>;
  const headingHost = editorOnly ? document.getElementById('cc-menu-fixed-heading') : null;
  return <section className="cc-home-layout" data-home-mode={preference.mode} data-home-preview={editing ? 'true' : 'false'}>
    <header className="cc-home-layout-heading">
      <div><small>INÍCIO</small><strong>{modeCopy[preference.mode].label}</strong><span>{modeCopy[preference.mode].detail}</span></div>
      <button type="button" ref={personalizeRef} onClick={beginEdit}><SlidersHorizontal aria-hidden="true"/> Personalizar início</button>
    </header>

    {editing && <section className="cc-home-layout-editor" aria-labelledby="cc-home-layout-editor-title">
      {headingHost ? createPortal(editorHeading, headingHost) : editorHeading}
      <div className="cc-home-mode-options" role="radiogroup" aria-label="Modo da tela inicial">
        {(Object.keys(modeCopy) as HomeMode[]).map((mode) => <button key={mode} type="button" role="radio" ref={(element) => { if (element) radioRefs.current[mode] = element; }} tabIndex={draft.mode === mode ? 0 : -1} onKeyDown={(event) => selectWithKeyboard(event, mode)} aria-checked={draft.mode === mode} data-active={draft.mode === mode ? 'true' : 'false'} onClick={() => setDraft((current) => ({ ...current, mode }))}>
          <span>{draft.mode === mode && <Check aria-hidden="true"/>}</span><b>{modeCopy[mode].label}</b><small>{modeCopy[mode].detail}</small>
        </button>)}
      </div>
      {draft.mode === 'personalized' && <div className="cc-home-slot-editor">
        {draft.order.map((id, index) => {
          const slot = slotById.get(id);
          if (!slot) return null;
          const required = REQUIRED_HOME_SLOTS.includes(id);
          const enabled = draft.visible.includes(id) || required;
          return <article key={id} data-enabled={enabled ? 'true' : 'false'}>
            <button type="button" className="toggle" aria-pressed={enabled} disabled={required} onClick={() => toggle(id)}><span>{enabled && <Check/>}</span><div><b>{slot.label}</b><small>{required ? 'Essencial · sempre visível' : slot.description}</small></div></button>
            <div><button type="button" aria-label={`Mover ${slot.label} para cima`} disabled={index === 0} onClick={() => move(id, -1)}><ChevronUp/></button><button type="button" aria-label={`Mover ${slot.label} para baixo`} disabled={index === draft.order.length - 1} onClick={() => move(id, 1)}><ChevronDown/></button></div>
          </article>;
        })}
      </div>}
      <footer><button type="button" onClick={restore}><RotateCcw/> Restaurar padrão</button><span/><button type="button" onClick={cancel}>Cancelar</button><button type="button" className="primary" onClick={save}><Check/> Salvar</button></footer>
    </section>}

    <p className="cc-home-layout-status" role="status" aria-live="polite">{status}</p>
    <div className="cc-home-layout-content">
      {(preference.mode === 'personalized' || preference.mode === 'shortcuts') && shortcuts}
      {preference.mode === 'shortcuts' ? <>{['summary', 'limits'].map(id => <div key={id} data-home-slot={id}>{slotById.get(id as HomeSlotId)?.content}</div>)}</>
        : (preference.mode === 'roster' || preference.mode === 'roster-mixed') && quickRoster
        ? <><div data-home-slot="next">{quickRoster}</div>{['summary', 'limits'].map(id => <div key={id} data-home-slot={id}>{slotById.get(id as HomeSlotId)?.content}</div>)}</>
        : (preference.mode === 'standard' || preference.mode === 'mixed' || preference.mode === 'roster') && standardContent
        ? standardContent
        : rendered.map((id) => <div key={id} data-home-slot={id}>{slotById.get(id)?.content}</div>)}
      {(preference.mode === 'mixed' || preference.mode === 'roster-mixed') && shortcuts}
    </div>
  </section>;
}
