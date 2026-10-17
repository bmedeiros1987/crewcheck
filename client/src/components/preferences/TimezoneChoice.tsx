import { useMemo, useRef, useState } from "react";
import { getStoredUser } from "@/lib/authClient";
import {
  baseTimeZone,
  deviceTimeZone,
  resolveTimeZoneChoice,
  timeZoneChoices,
  validTimeZone,
  timeZoneOffsetLabel,
} from "@shared/timezone-choice.mjs";
import { presentStayInstant, resolveStayDisplayZone, type StayTimeZonePreference } from '@shared/stay-time-presentation.mjs';
const labels: Record<string, string> = {
  "America/Sao_Paulo": "Brasília / São Paulo",
  "America/Fortaleza": "Fortaleza",
  "America/Manaus": "Manaus",
  "America/Rio_Branco": "Rio Branco",
  "America/Noronha": "Fernando de Noronha",
  "Europe/Lisbon": "Lisboa",
  "Europe/Madrid": "Madri",
  "America/New_York": "Nova York",
  UTC: "UTC",
};
function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[_/\s]+/g, " ")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

/** Same reviewed IANA catalogue/search, with offset at the supplied event instant. */
export function IanaTimeZoneSelect({ value, onChange, label, instant }: { value: string; onChange: (value: string) => void; label: string; instant?: string | null }) {
  const [query, setQuery] = useState('');
  const choices = timeZoneChoices(value).filter(zone => normalizeSearch(`${labels[zone] || ''} ${zone}`).includes(normalizeSearch(query)));
  const option = (zone: string) => `${labels[zone] || zone.split('/').at(-1)?.replaceAll('_', ' ')} · ${zone}${timeZoneOffsetLabel(zone, instant) ? ` · ${timeZoneOffsetLabel(zone, instant)}` : ''}`;
  return <div className="cc139-form wide"><label>Buscar {label.toLocaleLowerCase('pt-BR')}<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Cidade ou zona IANA"/></label>
    <label>{label}<select value={value} onChange={event => onChange(event.target.value)}><option value="">Escolher zona IANA</option>{validTimeZone(value) && <option value={value}>{option(value)}</option>}{choices.filter(zone => zone !== value).map(zone => <option key={zone} value={zone}>{option(zone)}</option>)}</select></label>
    {choices.length === 0 && <p>Nenhum resultado. Sua escolha anterior foi preservada.</p>}</div>;
}

export function EventTimeZonePreference({ value, onChange, localZone, baseZone, instant }: { value: StayTimeZonePreference; onChange: (value: StayTimeZonePreference) => void; localZone: string; baseZone: string; instant?: string | null }) {
  const resolved = resolveStayDisplayZone(value, { localZone, baseZone });
  const original = instant ? presentStayInstant(instant, localZone) : null;
  const shown = instant ? presentStayInstant(instant, resolved.zone) : null;
  const different = original?.status === 'available' && shown?.status === 'available' && (original.date !== shown.date || original.clock !== shown.clock);
  return <fieldset className="cc-timezone-choice"><legend>Exibir horários</legend><label>Fuso de exibição<select value={value.source} onChange={event => onChange({ ...value, source: event.target.value as StayTimeZonePreference['source'] })}>
    <option value="local">Local do evento{localZone ? ` · ${localZone}` : ' · falta confirmar'}</option><option value="base">Base cadastrada{baseZone ? ` · ${baseZone}` : ' · falta cadastrar'}</option><option value="utc">UTC</option><option value="manual">Escolher na lista</option></select></label>
    {value.source === 'manual' && <IanaTimeZoneSelect label="Fuso manual de exibição" value={value.manualZone} instant={instant} onChange={manualZone => onChange({ ...value, manualZone })}/>}
    <p>A escolha de exibição é salva nesta conta e neste aparelho ao selecionar. Não muda a fonte, o instante ou o despertador; alterações do pernoite e da autorização continuam dependendo de Salvar.</p>
    {resolved.message ? <p role="status">{resolved.message}</p> : different ? <p role="status">Exibição em {resolved.zone} · {timeZoneOffsetLabel(resolved.zone, instant)}. Horário e data da fonte permanecem em {localZone}.</p> : null}
    <button type="button" onClick={() => onChange({ source: 'local', manualZone: '' })}>Restaurar padrão local do evento</button>
  </fieldset>;
}
export function TimezoneChoice({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [source, setSource] = useState(
      validTimeZone(value) ? "manual" : "device",
    ),
    [query, setQuery] = useState(""),
    [notice, setNotice] = useState("");
  const manual = useRef(validTimeZone(value) ? value : ""),
    device = deviceTimeZone(),
    base = baseTimeZone(getStoredUser()?.base);
  const current = validTimeZone(value) ? value : device;
  const choices = useMemo(
    () =>
      timeZoneChoices(current).filter((zone) =>
        normalizeSearch(`${labels[zone] || ""} ${zone}`).includes(
          normalizeSearch(query),
        ),
      ),
    [current, query],
  );
  function choose(next: string) {
    if (source === "manual" && validTimeZone(value)) manual.current = value;
    setSource(next);
    const result = resolveTimeZoneChoice(next, {
      device,
      base,
      manual: manual.current,
    });
    setNotice(result.message);
    onChange(result.zone);
  }
  return (
    <fieldset className="cc-timezone-choice">
      <legend>Fuso pessoal</legend>
      <label>
        Origem do fuso
        <select
          aria-label="Origem do fuso"
          value={source}
          onChange={(e) => choose(e.target.value)}
        >
          <option value="device">Usar fuso atual do aparelho · {device}</option>
          <option value="base">
            Da base{base ? ` · ${base}` : " · não confirmada"}
          </option>
          <option value="local">
            Local atual · indisponível, usar aparelho
          </option>
          <option value="manual">Escolher na lista</option>
        </select>
      </label>
      {source === "manual" && (
        <>
          <label>
            Buscar cidade ou fuso
            <input
              aria-label="Buscar cidade ou fuso"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cidade ou nome IANA"
            />
          </label>
          <label>
            Escolha o fuso
            <select
              aria-label="Escolha o fuso"
              value={current}
              onChange={(e) => {
                manual.current = e.target.value;
                setNotice("");
                onChange(e.target.value);
              }}
            >
              <option value={current}>
                {labels[current] || current} · {current}
              </option>
              {choices
                .filter((z) => z !== current)
                .map((z) => (
                  <option key={z} value={z}>
                    {labels[z] || z.split("/").at(-1)?.replaceAll("_", " ")} ·{" "}
                    {z}
                  </option>
                ))}
            </select>
          </label>
          {choices.length === 0 && (
            <p>Nenhum resultado. Sua escolha anterior foi preservada.</p>
          )}
        </>
      )}
      <p role="status">
        Ativo: {current} ·{" "}
        {source === "manual"
          ? "Escolha manual ou salva"
          : source === "device"
            ? "Aparelho · valor escolhido"
            : source === "base"
              ? "Da base"
              : "Local atual — fallback do aparelho"}
        . {notice}
      </p>
      <small>
        Preferência de apresentação e avisos pessoais. Instantes da escala e
        fuso operacional permanecem preservados. A escolha só é salva ao
        confirmar a tela. Salvar guarda o valor IANA escolhido; não acompanha
        viagens automaticamente.
      </small>
    </fieldset>
  );
}
export function CivilTimeChoice({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  const [hour = "00", minute = "00"] = value.split(":");
  return (
    <span className="cc-civil-time-choice">
      <select
        aria-label={`Hora · ${label}`}
        value={hour}
        onChange={(e) => onChange(`${e.target.value}:${minute}`)}
      >
        {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0")).map(
          (v) => (
            <option key={v}>{v}</option>
          ),
        )}
      </select>
      <span aria-hidden="true">:</span>
      <select
        aria-label={`Minuto · ${label}`}
        value={minute}
        onChange={(e) => onChange(`${hour}:${e.target.value}`)}
      >
        {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0")).map(
          (v) => (
            <option key={v}>{v}</option>
          ),
        )}
      </select>
      <small>24h</small>
    </span>
  );
}
