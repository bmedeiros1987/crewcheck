import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import QRCode from "qrcode";
import {
  currentFact,
  freshness,
  remoteAction,
  type TvSnapshot,
  type TvActivity,
} from "../../../packages/tv-core/src/index";
import { TvSession } from "../../../packages/tv-core/src/session";
import { demoSnapshot } from "./demo";
import "./tv.css";

const config = import.meta.env;
const demo = config.VITE_TV_DEMO === "true";
const enabled = demo || config.VITE_CREWCHECK_TV_ENABLED === "true";
const platform = config.VITE_TV_PLATFORM || "android-tv";
const session = new TvSession(
  sessionStorage,
  fetch,
  config.VITE_TV_API_ORIGIN || "https://crewcheck.online",
);
type View = "Agora" | "Semana" | "Mês" | "Dia" | "Mudanças" | "Configurações";
const views: View[] = ["Agora", "Semana", "Mês", "Mudanças", "Configurações"];
const labels: Record<string, string> = {
  flight: "Voo",
  duty: "Programação",
  stay: "Pernoite",
  rest: "Descanso",
  "journey-rest": "Repouso",
};
const time = (value?: string | null) =>
  value
    ? new Date(value).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Sao_Paulo",
      })
    : "—";
function App() {
  const [exitRequested, setExitRequested] = useState(false);
  const [snapshot, setSnapshot] = useState<TvSnapshot | null>(() =>
    demo ? demoSnapshot() : null,
  );
  const [view, setView] = useState<View>("Agora"),
    [day, setDay] = useState(new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState(
    demo ? "Demonstração · dados fictícios" : "Vincule sua TV",
  );
  const [pairing, setPairing] = useState<any>(null),
    [qr, setQr] = useState("");
  const [clock, setClock] = useState(new Date()),
    [mode, setMode] = useState("live");
  const [news, setNews] = useState<any[]>([]);
  const lastInput = useRef(Date.now()),
    main = useRef<HTMLElement>(null),
    generation = useRef(0);
  const clear = () => {
    generation.current++;
    session.clear();
    setSnapshot(null);
    setNews([]);
    setPairing(null);
    setView("Agora");
    setStatus("Vincule sua TV");
  };
  async function begin() {
    clear();
    const run = generation.current;
    try {
      const p = await session.call("pair", { platform });
      if (run !== generation.current) return;
      setPairing({ ...p, deadline: Date.now() + p.expiresIn * 1000 });
      setQr(await QRCode.toDataURL(p.verificationUri));
      setStatus("Confirme no celular");
    } catch {
      setStatus("Não foi possível conectar. Tente novamente.");
    }
  }
  useEffect(() => {
    if (!pairing) return;
    let busy = false,
      cancelled = false;
    const timer = setInterval(
      async () => {
        if (Date.now() > pairing.deadline) {
          setPairing(null);
          setStatus("Código expirado. Gere outro.");
          return;
        }
        if (busy) return;
        busy = true;
        try {
          const result = await session.call("poll", {
            deviceCode: pairing.deviceCode,
          });
          if (cancelled) return;
          if (!result.pending) {
            session.pair(result);
            setPairing(null);
            setSnapshot(await session.sync());
            setStatus("Sincronizado");
          }
        } catch {
          if (!cancelled) setStatus("Aguardando confirmação ou conexão.");
        } finally {
          busy = false;
        }
      },
      Math.max(5, pairing.interval) * 1000,
    );
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [pairing]);
  useEffect(() => {
    let busy = false;
    async function sync() {
      if (demo || busy || !session.credential || document.hidden) return;
      busy = true;
      try {
        setSnapshot(await session.sync());
        setStatus("Sincronizado");
        await session.call("heartbeat", {});
        try {
          const feed = await session.call("news");
          setNews(feed.items || []);
        } catch {
          setNews([]);
        }
      } catch {
        setSnapshot(session.offline());
        setStatus(
          session.credential
            ? "Sem conexão · última informação"
            : "Vincule sua TV",
        );
      } finally {
        busy = false;
      }
    }
    const timer = setInterval(() => {
      setClock(new Date());
      if (Date.now() - lastInput.current > 120000) {
        setView("Agora");
        setMode("ambient");
      }
      if (!demo && session.credential) {
        const cached = session.offline();
        if (!cached) setSnapshot(null);
      }
    }, 1000);
    const refresh = setInterval(sync, 30000);
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("online", sync);
    window.addEventListener("webOSRelaunch", sync);
    return () => {
      clearInterval(timer);
      clearInterval(refresh);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("online", sync);
      window.removeEventListener("webOSRelaunch", sync);
    };
  }, []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const action = remoteAction(event.key) || remoteAction(event.keyCode);
      if (!action) return;
      lastInput.current = Date.now();
      if (action === "back") {
        event.preventDefault();
        if (exitRequested) {
          setExitRequested(false);
          return;
        }
        if (view === "Dia") {
          setView("Mês");
          return;
        }
        if (view !== "Agora") {
          setView("Agora");
          return;
        }
        const w = window as any;
        if (w.tizen) w.tizen.application.getCurrentApplication().exit();
        else if (w.webOS?.platformBack) w.webOS.platformBack();
        else if (platform === "lg-webos") setExitRequested(true);
        else w.dispatchEvent(new Event("tv-exit"));
        return;
      }
      if (action === "ok") return;
      event.preventDefault();
      const buttons = Array.from(
        document.querySelectorAll<HTMLElement>(
          exitRequested
            ? ".exit-dialog button"
            : "button:not(:disabled),a[href]",
        ),
      );
      const current = document.activeElement as HTMLElement;
      const rect = current?.getBoundingClientRect();
      if (!rect) {
        buttons[0]?.focus();
        return;
      }
      const x = rect.left + rect.width / 2,
        y = rect.top + rect.height / 2;
      const candidates = buttons
        .filter((b) => b !== current)
        .map((b) => {
          const r = b.getBoundingClientRect();
          return {
            b,
            dx: r.left + r.width / 2 - x,
            dy: r.top + r.height / 2 - y,
          };
        })
        .filter((p) =>
          action === "left"
            ? p.dx < -2
            : action === "right"
              ? p.dx > 2
              : action === "up"
                ? p.dy < -2
                : p.dy > 2,
        )
        .sort((a, b) => {
          const score = (p: typeof a) =>
            action === "left" || action === "right"
              ? Math.abs(p.dx) + Math.abs(p.dy) * 4
              : Math.abs(p.dy) + Math.abs(p.dx) * 4;
          return score(a) - score(b);
        });
      candidates[0]?.b.focus();
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [view, exitRequested]);
  useEffect(() => {
    if (exitRequested)
      document.querySelector<HTMLButtonElement>(".exit-dialog button")?.focus();
  }, [exitRequested]);
  useEffect(() => {
    main.current?.querySelector<HTMLElement>("button")?.focus();
  }, [view, !!snapshot]);
  if (!enabled)
    return (
      <main className="pair">
        <h1>CrewCheck TV</h1>
        <p>Piloto ainda não disponível.</p>
      </main>
    );
  const next = snapshot?.next,
    gate = currentFact(snapshot?.gate || null),
    weather = currentFact(snapshot?.weather || null),
    leave = currentFact(snapshot?.leaveAt || null);
  const activity = (a: TvActivity) => (
    <article className="activity" key={a.id}>
      <strong>{a.flight || labels[a.kind]}</strong>
      <span>{a.origin && `${a.origin} → ${a.destination}`}</span>
      <span>Apresentação {a.presentation || "indisponível"}</span>
      <span>
        {time(a.startAt)} — {time(a.endAt)}
      </span>
      {a.groundBeforeMinutes !== null && (
        <span>Em solo: {a.groundBeforeMinutes} min</span>
      )}
      <small>Confiança: {a.confidence}</small>
    </article>
  );
  const selected = snapshot?.days.find((d) => d.date === day);
  const offset = snapshot
    ? (new Date(snapshot.days[0].date + "T12:00:00Z").getUTCDay() + 6) % 7
    : 0;
  const week = Math.floor(
    (Math.max(0, snapshot?.days.findIndex((d) => d.date === day) ?? 0) +
      offset) /
      7,
  );
  const weekActivities =
    snapshot?.days
      .filter((_, i) => Math.floor((i + offset) / 7) === week)
      .flatMap((d) => d.activities) || [];
  const weekFlights = weekActivities.filter((a) => a.kind === "flight").length;
  const weekJourneys = new Set(
    weekActivities
      .filter((a) => a.kind === "flight" || a.kind === "duty")
      .map((a) => a.journeyId),
  ).size;
  return (
    <main
      ref={main}
      onPointerDown={() => {
        lastInput.current = Date.now();
      }}
    >
      {exitRequested && (
        <section
          role="dialog"
          aria-modal="true"
          aria-label="Sair do CrewCheck TV"
          className="exit-dialog"
        >
          <h2>Sair do CrewCheck TV?</h2>
          <button onClick={() => setExitRequested(false)}>Continuar</button>
          <button
            onClick={() => {
              clear();
              window.close();
            }}
          >
            Sair
          </button>
        </section>
      )}
      <header>
        <div className="brand">
          CREW<span>CHECK</span>
          <small>TV / VOYAGE</small>
        </div>
        <div className="header-status">
          <i />
          {demo
            ? "DEMONSTRAÇÃO"
            : snapshot?.privacy === "private"
              ? "PRIVADO"
              : "FAMÍLIA"}{" "}
          · {status}
          {snapshot &&
            ` · ${freshness(snapshot, clock.getTime()) === "current" ? "Atualizado" : "Dados antigos"}`}
        </div>
        <div className="clock">
          {clock.toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
          })}
          <small>
            {clock.toLocaleDateString("pt-BR", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </small>
        </div>
      </header>
      {!snapshot ? (
        <section className="pair">
          <div>
            <p className="eyebrow">BEM-VINDO A BORDO</p>
            <h1>
              Sua próxima jornada.
              <br />
              Na sua TV.
            </h1>
            <p>Use o celular para autorizar esta tela.</p>
            <button onClick={begin}>
              {pairing ? "Gerar novo código" : "Vincular TV"}
            </button>
            <p>{status}</p>
          </div>
          {pairing && (
            <aside>
              <img src={qr} alt="QR para confirmar TV no celular" />
              <h2>{pairing.userCode}</h2>
              <p>Código válido por 5 minutos</p>
            </aside>
          )}
        </section>
      ) : (
        <>
          <nav>
            {views.map((v) => (
              <button
                key={v}
                className={view === v ? "active" : ""}
                onClick={() => setView(v)}
              >
                {v}
              </button>
            ))}
            <span>ESCALA · {snapshot.summary.month}</span>
          </nav>
          {view === "Agora" && (
            <section className={`live ${mode === "ambient" ? "ambient" : ""}`}>
              <article className="hero">
                <div className="eyebrow">
                  {mode === "ambient"
                    ? "AMBIENT"
                    : mode === "briefing"
                      ? "BRIEFING"
                      : "PRÓXIMA JORNADA"}{" "}
                  <span>
                    • {snapshot.mode === "briefing" ? "BRIEFING" : "LIVE"}
                  </span>
                </div>
                <h1>
                  {next?.origin
                    ? `${next.origin} → ${next.destination}`
                    : next
                      ? "Sua próxima atividade"
                      : "Seu tempo, no seu ritmo."}
                </h1>
                <p className="flight">
                  {next?.flight ||
                    (next
                      ? labels[next.kind]
                      : "Nenhuma próxima atividade publicada")}
                </p>
                <div className="times">
                  <div>
                    <label>APRESENTAÇÃO</label>
                    <strong>{next?.presentation || "—"}</strong>
                  </div>
                  <div>
                    <label>SAIR DE CASA</label>
                    <strong>{leave || "—"}</strong>
                  </div>
                </div>
                <div className="gate">
                  <span>
                    PORTÃO <b>{gate?.label || "—"}</b>
                  </span>
                  {gate?.remoteStand === true && <em>REMOTA</em>}
                  <span>Escala oficial como referência</span>
                </div>
                <div className="hero-bottom">
                  <span>Última atualização {time(snapshot.generatedAt)}</span>
                  <button
                    onClick={() => {
                      setDay(next?.date || snapshot.days[0].date);
                      setView("Dia");
                    }}
                  >
                    Ver jornada →
                  </button>
                </div>
              </article>
              <aside className="side">
                <div className="side-top">
                  <article>
                    <p className="eyebrow">CLIMA · {weather?.airport || "—"}</p>
                    <h2>{weather ? `${weather.temperature}°` : "—"}</h2>
                    <p>{weather?.label || "Aguardando dados confirmados"}</p>
                  </article>
                  <article>
                    <p className="eyebrow">SUA SEMANA</p>
                    <h2>
                      {weekFlights}
                      <small>voos</small>
                    </h2>
                    <p>
                      {weekJourneys} jornadas ·{" "}
                      {weekActivities.filter((a) => a.kind === "stay").length}{" "}
                      pernoites
                    </p>
                  </article>
                </div>
                <article>
                  <p className="eyebrow">O QUE MUDOU</p>
                  <p>
                    {snapshot.changes[0] ||
                      "Nenhuma atualização confirmada disponível."}
                  </p>
                </article>
                <article className="news">
                  <p className="eyebrow">NOTÍCIAS DA AVIAÇÃO</p>
                  {news.length ? (
                    news.slice(0, 2).map((n) => (
                      <p key={n.id}>
                        {n.title}
                        <small>
                          {n.source} · {n.freshness}
                        </small>
                      </p>
                    ))
                  ) : (
                    <p>Manchetes indisponíveis no momento.</p>
                  )}
                  <small>
                    Informação editorial. Não substitui comunicações
                    operacionais.
                  </small>
                </article>
              </aside>
            </section>
          )}
          {(view === "Mês" || view === "Semana") && (
            <section className="calendar">
              <div className="calendar-title">
                <h1>{view === "Mês" ? "Sua escala completa" : "Sua semana"}</h1>
                <p>Selecione um dia para ver os detalhes</p>
                {view === "Semana" && (
                  <>
                    <button
                      onClick={() =>
                        setDay(
                          snapshot.days[
                            Math.max(
                              0,
                              snapshot.days.findIndex((d) => d.date === day) -
                                7,
                            )
                          ].date,
                        )
                      }
                    >
                      ← Semana anterior
                    </button>
                    <button
                      onClick={() =>
                        setDay(
                          snapshot.days[
                            Math.min(
                              snapshot.days.length - 1,
                              Math.max(
                                0,
                                snapshot.days.findIndex((d) => d.date === day),
                              ) + 7,
                            )
                          ].date,
                        )
                      }
                    >
                      Próxima semana →
                    </button>
                  </>
                )}
              </div>
              <div className="weekdays">
                {["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"].map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </div>
              <div className="days">
                {(view === "Mês" || week === 0) &&
                  Array.from({ length: offset }, (_, i) => (
                    <div key={`blank-${i}`} />
                  ))}
                {snapshot.days
                  .filter(
                    (_, i) =>
                      view === "Mês" || Math.floor((i + offset) / 7) === week,
                  )
                  .map((d) => (
                    <button
                      key={d.date}
                      className={
                        d.activities.length
                          ? "has-flight kind-" + d.activities[0].kind
                          : ""
                      }
                      onClick={() => {
                        setDay(d.date);
                        setView("Dia");
                      }}
                    >
                      <b>{Number(d.date.slice(-2))}</b>
                      <span>
                        {d.activities[0]?.flight ||
                          labels[d.activities[0]?.kind] ||
                          "Sem programação"}
                      </span>
                      <small>{d.activities[0]?.presentation || "—"}</small>
                    </button>
                  ))}
              </div>
              <p className="note">
                Dias sem programação não significam folga confirmada.
              </p>
            </section>
          )}
          {view === "Dia" && (
            <section className="detail">
              <button onClick={() => setView("Mês")}>← Voltar ao mês</button>
              <h1>{day.split("-").reverse().join("/")}</h1>
              <div className="activities">
                {selected?.activities.length ? (
                  selected.activities.map(activity)
                ) : (
                  <p>Nenhuma programação publicada para este dia.</p>
                )}
              </div>
            </section>
          )}
          {view === "Mudanças" && (
            <section className="detail">
              <h1>O que mudou</h1>
              {snapshot.changes.length ? (
                snapshot.changes.map((c, i) => <article key={i}>{c}</article>)
              ) : (
                <p>Nenhuma atualização confirmada disponível.</p>
              )}
            </section>
          )}
          {view === "Configurações" && (
            <section className="detail">
              <h1>Sua TV</h1>
              <p>
                Privacidade:{" "}
                {snapshot.privacy === "family" ? "Família" : "Privado"}. Para
                alterar, autorize novamente pelo celular.
              </p>
              <button
                onClick={() => {
                  setMode("ambient");
                  setView("Agora");
                }}
              >
                Modo Ambient
              </button>
              <button
                onClick={() => {
                  setMode("live");
                  setView("Agora");
                }}
              >
                Modo Live
              </button>
              <button
                onClick={() => {
                  setMode("briefing");
                  setView("Agora");
                }}
              >
                Modo Briefing
              </button>
              <button
                onClick={async () => {
                  try {
                    await session.call("logout", {});
                  } catch {
                  } finally {
                    clear();
                  }
                }}
              >
                Sair desta TV
              </button>
              <p>
                A autorização expira em até 24 horas. Uma nova sessão exige
                pareamento.
              </p>
            </section>
          )}
          <footer>
            <strong>✧ CREWCIERGE</strong>
            <div className="ticker">
              {snapshot.ticker.join("　 •　 ") ||
                "Confira sempre a escala e a comunicação oficial."}
            </div>
            <span>← ↑ ↓ → navegar · OK selecionar · Voltar</span>
          </footer>
        </>
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
