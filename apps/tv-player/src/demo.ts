import {
  monthDates,
  type TvSnapshot,
  type TvActivity,
} from "../../../packages/tv-core/src/index";
// Explicit synthetic projection for visual QA; never falls back from real API.
export function demoSnapshot(): TvSnapshot {
  const now = new Date();
  const generatedAt = now.toISOString();
  const activity = (day: number): TvActivity => {
    const dd = day < 10 ? `0${day}` : String(day);
    return {
    id: `demo-${day}`,
    journeyId: `demo-journey-${day}`,
    kind: "flight",
    date: `2026-09-${dd}`,
    startAt: `2026-09-${dd}T19:25:00Z`,
    endAt: `2026-09-${dd}T23:40:00Z`,
    presentation: "16:25",
    flight: "LA3301",
    origin: "BSB",
    destination: "GRU",
    groundBeforeMinutes: null,
    confidence: "alta",
  };
  };
  return {
    schemaVersion: 1,
    snapshotId: "synthetic",
    deviceId: "demo",
    sourceVersion: "synthetic-only",
    generatedAt,
    expiresAt: new Date(now.getTime() + 300000).toISOString(),
    privacy: "private",
    mode: "briefing",
    next: activity(18),
    days: monthDates("2026-09").map((date, i) => ({
      date,
      activities: [2, 3, 7, 8, 14, 15, 18, 19, 23, 24, 28].includes(i + 1)
        ? [activity(i + 1)]
        : [],
    })),
    summary: { month: "2026-09", flights: 11, journeys: 11, stays: 0 },
    leaveAt: {
      value: "14:52",
      source: "demo",
      observedAt: generatedAt,
      expiresAt: new Date(now.getTime() + 300000).toISOString(),
    },
    gate: {
      value: { label: "23", remoteStand: true },
      source: "demo",
      observedAt: generatedAt,
      expiresAt: new Date(now.getTime() + 300000).toISOString(),
    },
    weather: {
      value: {
        airport: "BSB",
        temperature: 26,
        label: "Céu parcialmente nublado",
      },
      source: "demo",
      observedAt: generatedAt,
      expiresAt: new Date(now.getTime() + 300000).toISOString(),
    },
    profile: { base: "BSB", airline: "LATAM" },
    weatherContexts: [{
      role: "base",
      airport: "BSB",
      city: "Brasília",
      temperature: 26,
      feelsLike: 25,
      minTemperature: 19,
      maxTemperature: 29,
      humidity: 48,
      label: "Parcialmente nublado",
      kind: "partly-cloudy",
      isDay: true,
      wind: 14,
      windGust: 28,
      rainChance: 32,
      hourly: [
        { at: "2026-09-20T01:00", temperature: 25, rainChance: 25, kind: "partly-cloudy", label: "Parcialmente nublado" },
        { at: "2026-09-20T02:00", temperature: 24, rainChance: 30, kind: "cloudy", label: "Nublado" },
        { at: "2026-09-20T03:00", temperature: 23, rainChance: 42, kind: "rain", label: "Chuva" },
        { at: "2026-09-20T04:00", temperature: 22, rainChance: 38, kind: "rain", label: "Chuva" },
        { at: "2026-09-20T05:00", temperature: 22, rainChance: 28, kind: "cloudy", label: "Nublado" }
      ],
      source: "demo",
      observedAt: generatedAt,
      expiresAt: new Date(now.getTime() + 300000).toISOString(),
    }],
    changes: ["Demonstração: apresentação atualizada para 16:25."],
    ticker: [
      "Confira a comunicação oficial antes da jornada.",
      "Sua próxima atividade, no seu ritmo.",
    ],
  };
}


export function demoNews(){
  const now=new Date().toISOString();
  return [
    {id:'demo-news-1',title:'Demonstração: notícias de aviação aparecem aqui quando o feed editorial está ativo.',source:'CrewCheck Demo',sourceKind:'demo',category:'industry',publishedAt:now,freshness:'current'},
    {id:'demo-news-2',title:'Demonstração: o ranking prioriza companhia e aeroportos presentes na próxima jornada.',source:'CrewCheck Demo',sourceKind:'demo',category:'airline',publishedAt:now,freshness:'current'},
  ];
}
