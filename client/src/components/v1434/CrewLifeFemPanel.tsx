import { useMemo, useState } from 'react';
import { CalendarDays, HeartHandshake, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

type FemComfort = 'neutral' | 'lighter' | 'rest';

type FemState = {
  enabled: boolean;
  acceptedAt: string;
  cycleStart: string;
  comfort: FemComfort;
  policyVersion: '1.0';
};

const KEY = 'crewcheck:life:fem:v1';

const DEFAULT_STATE: FemState = {
  enabled: false,
  acceptedAt: '',
  cycleStart: '',
  comfort: 'neutral',
  policyVersion: '1.0',
};

function readState(): FemState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_STATE,
      ...parsed,
      enabled: Boolean(parsed?.enabled),
      cycleStart: String(parsed?.cycleStart || '').slice(0, 10),
      comfort: ['neutral', 'lighter', 'rest'].includes(String(parsed?.comfort))
        ? parsed.comfort
        : 'neutral',
    };
  } catch {
    return DEFAULT_STATE;
  }
}

function writeState(value: FemState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent('crewcheck:life-fem-updated', {
      detail: {
        enabled: value.enabled,
        cycleStart: value.cycleStart,
        comfort: value.comfort,
        updatedAt: new Date().toISOString(),
      },
    }));
  } catch {}
}

function isoToday() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function cycleDay(start: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return null;
  const first = new Date(`${start}T12:00:00`);
  const now = new Date(`${isoToday()}T12:00:00`);
  if (Number.isNaN(first.getTime()) || first > now) return null;
  const day = Math.floor((now.getTime() - first.getTime()) / 86_400_000) + 1;
  return day >= 1 && day <= 90 ? day : null;
}

export default function CrewLifeFemPanel() {
  const [state, setState] = useState<FemState>(readState);
  const [consentChecked, setConsentChecked] = useState(false);
  const day = useMemo(() => cycleDay(state.cycleStart), [state.cycleStart]);

  function save(next: FemState, message?: string) {
    setState(next);
    writeState(next);
    if (message) toast.success(message);
  }

  function activate() {
    if (!consentChecked) return;
    save({
      ...DEFAULT_STATE,
      enabled: true,
      acceptedAt: new Date().toISOString(),
    }, 'CrewLife Fem ativado somente neste aparelho.');
  }

  function markToday() {
    save(
      { ...state, cycleStart: isoToday() },
      'Início do ciclo registrado para hoje.',
    );
  }

  function updateCycleStart(value: string) {
    const safe = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
    save({ ...state, cycleStart: safe });
  }

  function setComfort(comfort: FemComfort) {
    save({ ...state, comfort });
  }

  function pause() {
    save({ ...state, enabled: false }, 'CrewLife Fem pausado. O registro local foi mantido.');
  }

  function remove() {
    if (!window.confirm('Apagar todos os dados locais do CrewLife Fem neste aparelho?')) return;
    try { localStorage.removeItem(KEY); } catch {}
    setState(DEFAULT_STATE);
    setConsentChecked(false);
    window.dispatchEvent(new CustomEvent('crewcheck:life-fem-updated', {
      detail: { enabled: false, deleted: true, updatedAt: new Date().toISOString() },
    }));
    toast.success('Dados locais do CrewLife Fem apagados.');
  }

  if (!state.enabled) {
    return <section className="cc-life-fem cc-life-fem-consent" aria-labelledby="crewlife-fem-title">
      <header>
        <span><HeartHandshake/></span>
        <div>
          <small>OPCIONAL · CONSENTIMENTO SEPARADO</small>
          <h2 id="crewlife-fem-title">CrewLife Fem</h2>
          <p>Um espaço privado para contexto de rotina relacionado ao ciclo, sem misturar esses dados com a escala ou o CrewLife geral.</p>
        </div>
        <ShieldCheck/>
      </header>

      <div className="cc-life-fem-notice">
        <strong>Privacidade primeiro</strong>
        <p>Esta primeira versão fica somente neste aparelho. Não envia ciclo ao servidor, ao Concierge, ao relógio ou ao empregador. Não infere ovulação, fertilidade, gravidez, diagnóstico ou aptidão operacional.</p>
      </div>

      <label className="cc-life-check">
        <input
          type="checkbox"
          checked={consentChecked}
          onChange={(event) => setConsentChecked(event.target.checked)}
        />
        <span>Quero ativar o CrewLife Fem separadamente e entendo que o registro é opcional.</span>
      </label>

      <div className="cc-life-actions">
        <button type="button" className="primary" disabled={!consentChecked} onClick={activate}>
          <Sparkles/> Ativar CrewLife Fem
        </button>
      </div>
    </section>;
  }

  return <section className="cc-life-fem active" aria-labelledby="crewlife-fem-title">
    <header>
      <span><HeartHandshake/></span>
      <div>
        <small>CREWLIFE FEM · LOCAL</small>
        <h2 id="crewlife-fem-title">Seu contexto, do seu jeito</h2>
        <p>Registre só o mínimo que for útil para você. Nenhum dado Fem participa de compliance, aptidão ou decisão operacional.</p>
      </div>
      <b>Ativo</b>
    </header>

    <div className="cc-life-fem-grid">
      <article className="cc-life-fem-cycle">
        <CalendarDays/>
        <div>
          <small>INÍCIO REGISTRADO</small>
          <strong>{state.cycleStart || 'Ainda não informado'}</strong>
          <span>{day ? `Dia ${day} desde o início registrado` : 'Sem estimativa de fase ou fertilidade'}</span>
        </div>
        <div className="cc-life-fem-cycle-actions">
          <button type="button" className="primary" onClick={markToday}>Começou hoje</button>
          <label>
            Outra data
            <input
              type="date"
              max={isoToday()}
              value={state.cycleStart}
              onChange={(event) => updateCycleStart(event.target.value)}
            />
          </label>
        </div>
      </article>

      <article className="cc-life-fem-context">
        <small>COMO VOCÊ QUER CUIDAR DO DIA</small>
        <div>
          <button
            type="button"
            className={state.comfort === 'neutral' ? 'selected' : ''}
            onClick={() => setComfort('neutral')}
          >Tudo bem</button>
          <button
            type="button"
            className={state.comfort === 'lighter' ? 'selected' : ''}
            onClick={() => setComfort('lighter')}
          >Prefiro leveza</button>
          <button
            type="button"
            className={state.comfort === 'rest' ? 'selected' : ''}
            onClick={() => setComfort('rest')}
          >Priorizar descanso</button>
        </div>
        <p>Esse contexto é pessoal. Ele não altera escala, APZ, limites regulamentares ou qualquer status de aptidão.</p>
      </article>
    </div>

    <div className="cc-life-fem-source">
      <ShieldCheck/>
      <div>
        <strong>Sem inferência automática de ciclo</strong>
        <span>A integração Samsung Health Data SDK atual não fornece ciclo menstrual. O CrewLife Fem não tenta deduzir isso por sono, energia, temperatura ou outros sinais.</span>
      </div>
    </div>

    <div className="cc-life-actions">
      <button type="button" onClick={pause}>Pausar Fem</button>
      <button type="button" className="danger" onClick={remove}><Trash2/> Apagar dados Fem</button>
    </div>
  </section>;
}
