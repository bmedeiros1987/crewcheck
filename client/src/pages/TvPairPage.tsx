import { useEffect, useState } from "react";
import { authFetch } from "../lib/authClient";
export default function TvPairPage() {
  const [code, setCode] = useState(
    new URLSearchParams(location.search).get("code") || "",
  );
  const [privacy, setPrivacy] = useState("family"),
    [message, setMessage] = useState(""),
    [devices, setDevices] = useState<any[]>([]);
  const enabled = import.meta.env.VITE_CREWCHECK_TV_ENABLED === "true";
  const refresh = () =>
    authFetch<any[]>("/api/tv/devices")
      .then(setDevices)
      .catch(() => setMessage("Dispositivos indisponíveis."));
  useEffect(() => {
    if (enabled) void refresh();
  }, [enabled]);
  async function approve() {
    try {
      await authFetch("/api/tv/approve", {
        method: "POST",
        body: JSON.stringify({ userCode: code.toUpperCase().trim(), privacy }),
      });
      setMessage("TV autorizada. O vínculo aparecerá após a TV confirmar.");
      setCode("");
    } catch {
      setMessage(
        "Não foi possível autorizar. Confira o código e tente novamente.",
      );
    }
  }
  if (!enabled)
    return <main className="p-8">Piloto de TV ainda não disponível.</main>;
  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-3xl font-bold">Vincular CrewCheck TV</h1>
      <p className="my-4">
        Confira o código exibido na sua TV antes de autorizar.
      </p>
      <label>
        Código da TV
        <input
          className="block w-full rounded border p-3 text-black"
          value={code}
          maxLength={10}
          onChange={(e) => setCode(e.target.value)}
        />
      </label>
      <label className="my-4 block">
        Privacidade
        <select
          className="block p-3 text-black"
          value={privacy}
          onChange={(e) => setPrivacy(e.target.value)}
        >
          <option value="family">Família — sem rota e número de voo</option>
          <option value="private">
            Privado — mostrar rota e número de voo
          </option>
        </select>
      </label>
      <button
        className="rounded bg-cyan-700 p-3 text-white"
        onClick={approve}
        disabled={!/^[A-F0-9]{10}$/i.test(code)}
      >
        Autorizar esta TV por 24 horas
      </button>
      <p role="status" className="my-4">
        {message}
      </p>
      <h2 className="text-xl font-bold">Minhas TVs</h2>
      <button onClick={refresh}>Atualizar dispositivos</button>
      {devices.map((d) => (
        <article key={d.deviceId} className="my-4 rounded border p-4">
          <p>
            {d.platform} · {d.privacy} · {d.revoked ? "Revogada" : "Vinculada"}
          </p>
          <p>
            Último contato: {new Date(d.lastSeenAt).toLocaleString("pt-BR")}
          </p>
          <button
            disabled={d.revoked}
            onClick={async () => {
              try {
                await authFetch("/api/tv/revoke", {
                  method: "POST",
                  body: JSON.stringify({ deviceId: d.deviceId }),
                });
                await refresh();
              } catch {
                setMessage("Não foi possível revogar agora.");
              }
            }}
          >
            Revogar acesso
          </button>
        </article>
      ))}
    </main>
  );
}
