import { useMemo, useState, type ReactNode } from 'react';
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
  standard: { label: 'Padrão CrewCheck', detail: 'Resumo e ações na ordem recomendada.' },
  personalized: { label: 'Personalizada', detail: 'Você escolhe os blocos e a ordem.' },
  mixed: { label: 'Mista', detail: 'Essenciais CrewCheck com seus favoritos.' },
};

function copyPreference(value: HomeLayoutPreference): HomeLayoutPreference {
  return { ...value, order: [...value.order], visible: [...value.visible] };
}

export function HomeLayoutShell({ slots, standardContent }: { slots: HomeLayoutSlot[]; standardContent?: ReactNode }) {
  const accountId = (() => { try { return getStoredUser()?.id || null; } catch { return null; } })();
  const [saved, setSaved] = useState(() => readHomeLayout(window.localStorage, accountId));
  const [draft, setDraft] = useState(() => copyPreference(saved));
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState('');
  const slotById = useMemo(() => new Map(slots.map((slot) => [slot.id, slot])), [slots]);
  const rendered = visibleHomeSlots(saved, slots.map((slot) => slot.id));

  function beginEdit() {
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
    setEditing(false);
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
    setEditing(false);
    setStatus('Padrão CrewCheck restaurado.');
  }

  return <section className="cc-home-layout" data-home-mode={saved.mode}>
    <header className="cc-home-layout-heading">
      <div><small>INÍCIO</small><strong>{modeCopy[saved.mode].label}</strong><span>{modeCopy[saved.mode].detail}</span></div>
      <button type="button" onClick={beginEdit}><SlidersHorizontal aria-hidden="true"/> Personalizar início</button>
    </header>

    {editing && <section className="cc-home-layout-editor" aria-labelledby="cc-home-layout-editor-title">
      <header><div><small>PRÉVIA E PREFERÊNCIAS</small><h2 id="cc-home-layout-editor-title">Como você quer começar?</h2></div><button type="button" className="icon" onClick={() => setEditing(false)} aria-label="Cancelar personalização"><X/></button></header>
      <div className="cc-home-mode-options" role="radiogroup" aria-label="Modo da tela inicial">
        {(Object.keys(modeCopy) as HomeMode[]).map((mode) => <button key={mode} type="button" role="radio" aria-checked={draft.mode === mode} data-active={draft.mode === mode ? 'true' : 'false'} onClick={() => setDraft((current) => ({ ...current, mode }))}>
          <span>{draft.mode === mode && <Check aria-hidden="true"/>}</span><b>{modeCopy[mode].label}</b><small>{modeCopy[mode].detail}</small>
        </button>)}
      </div>
      <div className="cc-home-slot-editor">
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
      </div>
      <footer><button type="button" onClick={restore}><RotateCcw/> Restaurar padrão</button><span/><button type="button" onClick={() => setEditing(false)}>Cancelar</button><button type="button" className="primary" onClick={save}><Check/> Salvar</button></footer>
    </section>}

    <p className="cc-home-layout-status" role="status" aria-live="polite">{status}</p>
    <div className="cc-home-layout-content">{saved.mode === 'standard' && standardContent
      ? standardContent
      : rendered.map((id) => <div key={id} data-home-slot={id}>{slotById.get(id)?.content}</div>)}</div>
  </section>;
}
