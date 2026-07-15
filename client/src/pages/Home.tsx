import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useLocation } from 'wouter';
import JSZip from 'jszip';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  Car,
  ChevronDown,
  ChevronRight,
  Clock,
  CloudSun,
  DollarSign,
  FileText,
  Home as HomeIcon,
  Lock,
  LogOut,
  Map as MapIcon,
  Menu,
  Moon,
  Plane,
  Radar,
  Settings,
  ShieldCheck,
  Sun,
  Upload,
  UserRound,
  Wifi,
  X,
  Database,
  Mail,
  Share2,
  Copy,
  Send,
  Save,
  RotateCcw,
  Building2,
  Phone,
  Globe2,
  GraduationCap,
  GitCompareArrows,
  ToggleRight,
  PlayCircle,
  Dumbbell,
  Hotel,
  Hospital,
  Pill,
  WashingMachine,
  Navigation,
  Trash2,
  LocateFixed,
} from 'lucide-react';
import { analyzeCompliance, analyzeDayLoads, getGymRecommendations, type ComplianceResult } from '@/lib/complianceEngine';
import { parsePDF, type CrewRoster, type FlightLeg, type RosterDay } from '@/lib/pdfParser';
import { authFetch, getStoredUser, logout } from '@/lib/authClient';
import { exportReport } from '@/lib/pdfExport';
import { generateICalendar, downloadCalendarFile } from '@/lib/calendarExport';
import { shareToWhatsApp, shareToTelegram, copyToClipboard, shareExportedPdfNative } from '@/lib/sharing';
import { buildRoutineSuggestions, defaultRoutineActivities } from '@/lib/routinePlanner';
import { sendRosterByEmail } from '@/lib/emailClient';
import { connectGoogleCalendar, syncRosterToGoogleCalendar, loadGoogleCalendarSettings, saveGoogleCalendarSettings, listGoogleCalendars, googleCalendarIntegrationDiagnostics, type GoogleCalendarOption, type GoogleCalendarSettings } from '@/lib/googleCalendarSync';
import { saveRosterAnalysis, listSavedRosters, openSavedRoster, openActiveRoster, getDatabaseStatus } from '@/lib/databaseClient';
import { airportCity } from '@/lib/airports';
import { buildCanonicalRosterEvents, normalizeRosterDays, selectNextRosterEvent, rosterCounters, type CanonicalRosterEvent } from '@/lib/canonicalRoster';
import { resolveActFinancialRules, resolvePerDiemRule, type AirportPerDiemOverrides, type PerDiemCurrency, type PerDiemRateKey } from '@/lib/financialRules';
import FinancialStatementImporter from '@/components/finance/FinancialStatementImporter';
import { confirmedRateValueAt } from '@/lib/financialStatementLearning';
import { compareRosters, rosterFingerprint, sameRosterPeriod, type ComparableRosterEvent, type RosterChange } from '@/lib/rosterComparison';
import PlatformCenter from '@/components/platform/PlatformCenter';
import { getPlatformProfile, getPlatformBilling, savePlatformProfile, syncPlatformRoster, listPlatformStays, updatePlatformStay, findHotelCompanions, gymCheckIn, listGymCrowding, getParkingPosition, saveParkingPosition, deleteParkingPosition, deleteCrewCheckAccount, type CrewCheckLocale, type PlatformProfile } from '@/lib/platformClient';
import { getCurrentTerms, grantUnlimited, publishTerms } from '@/lib/termsClient';

type ZeroView =
  | 'cockpit' | 'roster' | 'alerts' | 'departure' | 'settings' | 'maintenance' | 'import' | 'features'
  | 'radar' | 'weather' | 'perdiem' | 'salary' | 'reports' | 'calendar' | 'exports' | 'routine' | 'database' | 'crew' | 'load' | 'wakeup' | 'hotels' | 'presentation' | 'map' | 'mycar' | 'gyms' | 'iflight' | 'updates' | 'concierge' | 'plans' | 'community' | 'compare' | 'admin';

type ZeroLeg = {
  id: string;
  day: RosterDay;
  leg?: FlightLeg;
  kind: 'flight' | 'stay' | 'duty';
  title: string;
  subtitle: string;
  date: Date;
  origin: string;
  destination: string;
  flightNumber: string;
  presentation: string;
  departure: string;
  arrival: string;
  aircraft?: string;
  registration?: string;
  gate?: string;
  terminal?: string;
  status?: string;
  airlineCode?: string;
  airlineName?: string;
  hotel?: string;
  crew?: string[];
  routine?: string[];
  timeRange: string;
  placeholder?: boolean;
  canonical?: CanonicalRosterEvent;
  presentationSource?: string;
};

type BundleState = { roster: CrewRoster; compliance: ComplianceResult | null; source: string };
type QuickActions = {
  upload: () => void;
  pdf: () => void;
  ics: () => void;
  whatsapp: () => void;
  telegram: () => void;
  copy: () => void;
  email: () => void;
  sharePdf: () => void;
  google: () => void;
  save: () => void;
  openActive: () => void;
  logout: () => void;
  replayIntro: () => void;
};

const DEFAULT_VERSION = '13.8.8';
const CREWCHECK_UI_CORE_NOTE = 'v13.8.8: auditoria visual, termos, admin e serviços assistidos';
const ADMIN_EMAILS = ['bmedeiros1987@gmail.com', 'bruno@crewcheck.local'];

const storage = {
  get(key: string, fallback = '') {
    try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
  },
  set(key: string, value: string) {
    try { localStorage.setItem(key, value); } catch {}
  },
};

function pad2(n: number) { return String(n).padStart(2, '0'); }
function safe(value: unknown, fallback = '—') { const text = String(value ?? '').trim(); return text || fallback; }
function city(code?: string) { return airportCity(code); }

const AIRLINE_NAMES: Record<string, string> = {
  LA: 'LATAM', JJ: 'LATAM Brasil', G3: 'GOL', AD: 'Azul', '2Z': 'VOEPASS',
  AA: 'American Airlines', DL: 'Delta', UA: 'United', AC: 'Air Canada',
  TP: 'TAP Air Portugal', AV: 'Avianca', CM: 'Copa Airlines', AR: 'Aerolíneas Argentinas',
  H2: 'SKY Airline', JA: 'JetSMART', FO: 'Flybondi', UX: 'Air Europa',
  IB: 'Iberia', BA: 'British Airways', AF: 'Air France', KL: 'KLM',
  LH: 'Lufthansa', LX: 'SWISS', EK: 'Emirates', QR: 'Qatar Airways',
};
function normalizedAirlineCode(...values: unknown[]): string {
  for (const rawValue of values) {
    const raw = String(rawValue || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!raw) continue;
    if (/^(LAN|LATAM)/.test(raw)) return 'LA';
    if (/^(TAM)/.test(raw)) return 'JJ';
    const explicit = raw.match(/^([A-Z0-9]{2})(?=\d|$)/)?.[1];
    if (explicit) return explicit;
    if (/^[A-Z0-9]{2}$/.test(raw)) return raw;
  }
  return '';
}
function airlineNameFor(code?: string, explicit?: unknown): string {
  const given = String(explicit || '').trim();
  return given || AIRLINE_NAMES[String(code || '').toUpperCase()] || 'Companhia aérea';
}
function airlineLogoUrl(code?: string): string {
  const normalized = String(code || '').trim().toUpperCase();
  return normalized ? `https://images.kiwi.com/airlines/64/${encodeURIComponent(normalized)}.png` : '';
}
function addMinutesToTime(value: string, minutes: number) {
  const m = String(value || '').match(/(\d{1,2}):(\d{2})/);
  if (!m) return '—';
  const d = new Date();
  d.setHours(Number(m[1]), Number(m[2]) + minutes, 0, 0);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}


type ParkingPosition = {
  lat: number;
  lng: number;
  accuracy?: number;
  label?: string;
  level?: string;
  spot?: string;
  reference?: string;
  notes?: string;
  savedAt: string;
  localOnly?: boolean;
};

const CAR_PARKING_STORAGE_KEY = 'crewcheck_my_car_parking_position_v1';

function mapsBrowserKey(): string {
  try {
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env || {};
    return String(env.VITE_GOOGLE_MAPS_API_KEY || env.VITE_GOOGLE_MAPS_EMBED_KEY || env.VITE_GOOGLE_MAPS_BROWSER_KEY || '').trim();
  } catch {
    return '';
  }
}
function coordsLabel(lat: number, lng: number) {
  return `${Number(lat).toFixed(6)},${Number(lng).toFixed(6)}`;
}
function buildGoogleMapsSearchUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coordsLabel(lat, lng))}`;
}
function buildGoogleMapsWalkingDirectionsUrl(originLat: number, originLng: number, destLat: number, destLng: number): string {
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(coordsLabel(originLat, originLng))}&destination=${encodeURIComponent(coordsLabel(destLat, destLng))}&travelmode=walking`;
}
function buildGoogleMapsWalkingDestinationUrl(destLat: number, destLng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(coordsLabel(destLat, destLng))}&travelmode=walking`;
}
function buildGoogleMapsDirectionsUrl(origin: string, destination: string, travelmode: 'driving' | 'walking' | 'transit' = 'driving'): string {
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=${travelmode}`;
}
function buildGoogleMapsEmbedDirectionsUrl(origin: string, destination: string, travelmode: 'driving' | 'walking' | 'transit' = 'driving'): string {
  const key = mapsBrowserKey();
  if (!origin || !destination) return '';
  if (key) return `https://www.google.com/maps/embed/v1/directions?key=${encodeURIComponent(key)}&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&mode=${travelmode}`;
  const dirFlag = travelmode === 'walking' ? 'w' : travelmode === 'transit' ? 'r' : 'd';
  return `https://www.google.com/maps?output=embed&saddr=${encodeURIComponent(origin)}&daddr=${encodeURIComponent(destination)}&dirflg=${dirFlag}`;
}
function buildGoogleMapsEmbedSearchUrl(query: string): string {
  const key = mapsBrowserKey();
  if (!query) return '';
  if (key) return `https://www.google.com/maps/embed/v1/search?key=${encodeURIComponent(key)}&q=${encodeURIComponent(query)}`;
  return `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
}
function getCurrentGeoPosition(): Promise<{ lat: number; lng: number; accuracy?: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Permissão de localização indisponível neste dispositivo.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = Number(position.coords.latitude);
        const lng = Number(position.coords.longitude);
        const accuracy = Number(position.coords.accuracy || 0);
        storage.set('crewcheck_last_geo', coordsLabel(lat, lng));
        resolve({ lat, lng, accuracy: Number.isFinite(accuracy) ? accuracy : undefined });
      },
      () => reject(new Error('Não consegui acessar sua localização. Ative a permissão e tente novamente.')),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 }
    );
  });
}
function saveCarParkingPosition(position: ParkingPosition): void {
  storage.set(CAR_PARKING_STORAGE_KEY, JSON.stringify(position));
}
function loadCarParkingPosition(): ParkingPosition | null {
  try {
    const parsed = JSON.parse(storage.get(CAR_PARKING_STORAGE_KEY, 'null')) as ParkingPosition | null;
    if (!parsed || !Number.isFinite(Number(parsed.lat)) || !Number.isFinite(Number(parsed.lng))) return null;
    return { ...parsed, lat: Number(parsed.lat), lng: Number(parsed.lng) };
  } catch {
    return null;
  }
}
function clearCarParkingPosition(): void {
  try { localStorage.removeItem(CAR_PARKING_STORAGE_KEY); } catch {}
}
function airportRouteQuery(code?: string): string {
  const point = airportPoint(code);
  if (point) return coordsLabel(point.lat, point.lon);
  const clean = String(code || '').trim().toUpperCase();
  return clean ? `${clean} aeroporto` : 'aeroporto';
}
function eventRouteOrigin(event: ZeroLeg): string {
  const manual = storage.get('crewcheck_manual_route_origin', '');
  if (manual) return manual;
  const saved = storage.get('crewcheck_last_geo', '');
  if (saved) return saved;
  if (event.hotel) return event.hotel;
  return 'Minha localização';
}
function eventRouteDestination(event: ZeroLeg): string {
  return airportRouteQuery(event.origin || event.destination);
}
function monthlyMapDestinations(events: ZeroLeg[]) {
  const data = monthlyRouteData(events);
  const byCode = new Map<string, AirportMapPoint & { count: number }>();
  data.destinations.forEach((point) => byCode.set(point.code, point));
  events.filter((event) => !event.placeholder && (event.kind === 'stay' || event.hotel)).forEach((event) => {
    [event.origin, event.destination].forEach((code) => {
      const point = airportPoint(code);
      if (!point) return;
      const current = byCode.get(point.code) || { ...point, count: 0 };
      current.count += 1;
      byCode.set(point.code, current);
    });
  });
  return [...byCode.values()].sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
}
function monthlyMapQuery(destinations: Array<AirportMapPoint & { count: number }>): string {
  if (!destinations.length) return 'Brasil aeroportos';
  return destinations.slice(0, 8).map((point) => `${point.code} ${city(point.code)}`).join(' | ');
}
function openMonthlyGoogleMap(destinations: Array<AirportMapPoint & { count: number }>) {
  const query = monthlyMapQuery(destinations);
  window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`, '_blank', 'noopener,noreferrer');
}


function buildGoogleStaticMonthlyMapUrl(destinations: Array<AirportMapPoint & { count: number }>): string {
  const key = mapsBrowserKey();
  if (!key || !destinations.length) return '';
  const points = destinations.slice(0, 18);
  const markers = points.map((point, index) => `markers=${encodeURIComponent(`color:${index === 0 ? 'blue' : 'red'}|label:${point.code.slice(0, 1)}|${point.lat},${point.lon}`)}`).join('&');
  const path = points.length > 1 ? `&path=${encodeURIComponent(`color:0x2563ebff|weight:3|${points.map((point) => `${point.lat},${point.lon}`).join('|')}`)}` : '';
  return `https://maps.googleapis.com/maps/api/staticmap?size=900x520&scale=2&maptype=roadmap&${markers}${path}&key=${encodeURIComponent(key)}`;
}
function buildGoogleStaticRouteMapUrl(origin: string, destination: string, route?: RoutePreviewInfo | null): string {
  const key = mapsBrowserKey();
  if (!key || !origin || !destination) return '';
  const markers = [
    `markers=${encodeURIComponent(`color:blue|label:A|${origin}`)}`,
    `markers=${encodeURIComponent(`color:red|label:B|${destination}`)}`,
  ].join('&');
  const path = route?.polyline
    ? `&path=${encodeURIComponent(`color:0x22d3eeff|weight:5|enc:${route.polyline}`)}`
    : '';
  return `https://maps.googleapis.com/maps/api/staticmap?size=900x520&scale=2&maptype=roadmap&${markers}${path}&key=${encodeURIComponent(key)}`;
}

type WeatherSnapshot = {
  ok?: boolean;
  airport?: string;
  city?: string;
  temperature?: number;
  wind?: number;
  rainChance?: number;
  condition?: string;
  updatedAt?: string;
  message?: string;
};

async function fetchAirportWeatherSnapshot(airport: string): Promise<WeatherSnapshot | null> {
  const code = String(airport || '').trim().toUpperCase();
  if (!code) return null;
  try {
    const response = await fetch(`/api/weather/airport?airport=${encodeURIComponent(code)}`, { cache: 'no-store' });
    const payload = await response.json().catch(() => null);
    if (payload && typeof payload === 'object') return payload as WeatherSnapshot;
  } catch {}
  return null;
}
function weatherTemperatureText(value?: number) {
  return Number.isFinite(Number(value)) ? `${Math.round(Number(value))}°C` : 'A confirmar';
}


type RoutePreviewInfo = {
  ok?: boolean;
  configured?: boolean;
  distanceText?: string;
  durationText?: string;
  durationInTrafficText?: string;
  trafficAware?: boolean;
  message?: string;
  polyline?: string;
  distanceMeters?: number;
};

type NearbyPlace = {
  name: string;
  category?: PlaceCategory;
  address?: string;
  rating?: number;
  mapsUrl?: string;
  openNow?: boolean;
  latitude?: number;
  longitude?: number;
  distanceMeters?: number;
  phone?: string;
  website?: string;
  openingHours?: string[];
};

type AmilProvider = {
  id?: string;
  name: string;
  serviceType?: string;
  address?: string;
  city?: string;
  state?: string;
  phone?: string;
  open24Hours?: boolean;
};

type PlaceCategory = 'gym' | 'hospital' | 'pharmacy' | 'laundry';

const PLACE_CATEGORY_META: Record<PlaceCategory, { label: string; plural: string; query: string }> = {
  gym: { label: 'Academia', plural: 'Academias', query: 'academia fitness' },
  hospital: { label: 'Hospital', plural: 'Hospitais', query: 'hospital pronto atendimento emergência' },
  pharmacy: { label: 'Farmácia', plural: 'Farmácias', query: 'farmácia drogaria' },
  laundry: { label: 'Lavanderia', plural: 'Lavanderias', query: 'lavanderia' },
};

function todayRosterKey(now = new Date()) {
  return dateChip(now);
}
async function fetchRoutePreviewInfo(origin: string, destination: string, mode: 'driving' | 'transit' = 'driving'): Promise<RoutePreviewInfo | null> {
  try {
    const params = new URLSearchParams({ origin, destination, mode });
    const response = await fetch(`/api/maps/route-preview?${params.toString()}`, { cache: 'no-store' });
    const payload = await response.json().catch(() => null);
    if (payload && typeof payload === 'object') return payload as RoutePreviewInfo;
  } catch {}
  return null;
}
async function fetchNearbyPlaces(location: string, category: PlaceCategory, query = ''): Promise<NearbyPlace[]> {
  try {
    const params = new URLSearchParams({ location, category });
    if (query) params.set('query', query);
    const response = await fetch(`/api/places/search?${params.toString()}`, { cache: 'no-store' });
    const payload = await response.json().catch(() => null) as { places?: NearbyPlace[] } | null;
    return Array.isArray(payload?.places) ? payload!.places!.slice(0, 12) : [];
  } catch {
    return [];
  }
}
async function fetchAmilProviders(location: string, coordinates: { lat: number; lon: number } | null, open24Hours = false): Promise<{ providers: AmilProvider[]; configured: boolean; message?: string }> {
  try {
    const params = new URLSearchParams({ serviceType: open24Hours ? 'pronto atendimento' : 'hospital clinica', open24Hours: String(open24Hours) });
    if (coordinates) { params.set('latitude', String(coordinates.lat)); params.set('longitude', String(coordinates.lon)); }
    else if (location) params.set('city', location);
    const response = await authFetch<any>(`/api/platform/health/amil/search?${params.toString()}`, { cache: 'no-store' });
    return { providers: Array.isArray(response.providers) ? response.providers : [], configured: true, message: response.disclaimer };
  } catch (error) {
    return { providers: [], configured: false, message: error instanceof Error ? error.message : 'Rede Amil aguardando configuração.' };
  }
}
function hotelSearchLocation(event: ZeroLeg): string {
  return event.hotel || `${city(event.destination || event.origin)} ${event.destination || event.origin}`;
}
function openNearbyPlaces(category: PlaceCategory, location = '') {
  storage.set('crewcheck:places-category', category);
  if (location) storage.set('crewcheck:places-location', location);
  window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'gyms' }));
}
function openPlacesInGoogleMaps(category: PlaceCategory, location: string) {
  const meta = PLACE_CATEGORY_META[category];
  window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${meta.query} perto de ${location}`)}`, '_blank', 'noopener,noreferrer');
}
function operationalAuditScore(bundle: BundleState) {
  const events = buildLegs(bundle.roster);
  const compliance = currentCompliance(bundle) as any;
  const finance = financeSnapshot(bundle.roster);
  return {
    events: events.filter((event) => !event.placeholder).length,
    flights: events.filter((event) => event.kind === 'flight' && !event.placeholder).length,
    stays: events.filter((event) => event.kind === 'stay' || event.hotel).length,
    alerts: actionableComplianceAlerts(compliance).length,
    perdiem: finance.perdiem.monthly,
    salary: finance.salary.gross,
    routine: currentGym(bundle).length,
  };
}
function time(value?: string | null, fallback = '—') {
  const text = String(value || '').trim();
  const match = text.match(/(\d{1,2})[…60359 tokens truncated…tent-type': 'application/json' },
    body: JSON.stringify({ filename: file.name || 'escala.pdf', dataBase64 }),
  });
  let payload: any = null;
  try { payload = await response.json(); } catch {}
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.detail || payload?.message || 'Leitura alternativa do PDF indisponível.');
  }
  const roster = payload?.roster;
  if (!roster || !Array.isArray(roster.days)) {
    throw new Error('A leitura alternativa não retornou uma escala válida.');
  }
  return roster as CrewRoster;
}

async function parsePDFResilient(file: File): Promise<{ roster: CrewRoster; source: 'local' | 'server-fallback' }> {
  try {
    return { roster: await parsePDF(file), source: 'local' };
  } catch (localError) {
    storage.set('crewcheck_last_pdf_local_error', sanitizePdfImportError(localError));
    const roster = await parsePDFOnServer(file);
    return { roster, source: 'server-fallback' };
  }
}

function OpeningVideo({ onDone }: { onDone: () => void }) {
  const finish = () => { storage.set('crewcheck_intro_seen_v1278', '1'); onDone(); };
  return <section className="cz-opening-video"><video src="/assets/opening/crewcheck-opening.mp4" autoPlay muted playsInline onEnded={finish}/><div><span><Plane/> CrewCheck</span><h1>Roster Intelligence</h1><p>Escala real, rotina, hotéis, academias, trânsito, radar, meteorologia e saída inteligente em um cockpit premium.</p><button onClick={finish}>Entrar no app <ChevronRight/></button></div></section>;
}

function normalizeInitialView(value: string | null): ZeroView {
  if (value === 'roster' || value === 'results' || value === 'result') return 'roster';
  if (value === 'compare' || value === 'comparar' || value === 'planned-vs-current') return 'compare';
  if (value === 'alerts' || value === 'irregularities') return 'alerts';
  if (value === 'manual' || value === 'departure' || value === 'smartDeparture') return 'departure';
  if (value === 'settings') return 'settings';
  if (value === 'import') return 'import';
  if (value === 'features') return 'features';
  if (value === 'radar') return 'radar';
  if (value === 'weather' || value === 'meteo') return 'weather';
  if (value === 'perdiem' || value === 'diarias') return 'perdiem';
  if (value === 'salary' || value === 'salario') return 'salary';
  if (value === 'reports' || value === 'relatorios') return 'reports';
  if (value === 'load' || value === 'carga') return 'load';
  if (value === 'calendar') return 'calendar';
  if (value === 'exports') return 'exports';
  if (value === 'routine') return 'routine';
  if (value === 'wakeup' || value === 'despertador') return 'wakeup';
  if (value === 'hotels' || value === 'hoteis') return 'hotels';
  if (value === 'gyms' || value === 'academias' || value === 'academia' || value === 'wellhub') return 'gyms';
  if (value === 'presentation' || value === 'apresentacao') return 'presentation';
  if (value === 'map' || value === 'mapa') return 'map';
  if (value === 'mycar' || value === 'meucarro' || value === 'carro' || value === 'car') return 'mycar';
  if (value === 'iflight' || value === 'push-iflight') return 'iflight';
  if (value === 'database') return 'database';
  if (value === 'updates' || value === 'atualizacoes' || value === 'atualizações') return 'updates';
  if (value === 'plans' || value === 'assinaturas' || value === 'subscription') return 'plans';
  if (value === 'community' || value === 'pessoas' || value === 'visitantes' || value === 'chat') return 'community';
  if (value === 'admin' || value === 'administracao') return 'admin';
  if (value === 'crew') return 'crew';
  return 'cockpit';
}


const CREWCHECK_RUNTIME_PATCH_STYLE_ID = 'crewcheck-runtime-patch-style';

function injectCrewCheckRuntimePatch(css: string) {
  try {
    let style = document.getElementById(CREWCHECK_RUNTIME_PATCH_STYLE_ID) as HTMLStyleElement | null;
    if (!css.trim()) {
      style?.remove();
      return;
    }
    if (!style) {
      style = document.createElement('style');
      style.id = CREWCHECK_RUNTIME_PATCH_STYLE_ID;
      style.setAttribute('data-crewcheck-runtime-patch', 'true');
      document.head.appendChild(style);
    }
    style.textContent = css;
  } catch {}
}

async function loadCrewCheckRuntimePatch() {
  try {
    const response = await fetch('/api/admin/runtime-patch/current', { cache: 'no-store', credentials: 'include' });
    const payload = await response.json().catch(() => null);
    if (payload?.ok) { const runtimeCss = String(payload.css || ''); const runtimeVersion = String(payload?.patch?.version || payload?.version || ''); const legacyRuntime = /CrewCheck runtime hotfix|MOBILE_FIT|Menu scroll|v13\\.7\\.(?:[0-9]|1[0-3])\\b/i.test(runtimeCss + ' ' + runtimeVersion); if (legacyRuntime) { injectCrewCheckRuntimePatch(''); return; } injectCrewCheckRuntimePatch(runtimeCss); }
  } catch {}
}

async function crewcheckUpdateFetch(path: string, token: string, payload: Record<string, unknown> = {}) {
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      'x-crewcheck-update-token': token,
    },
    body: JSON.stringify({ ...payload, token }),
  });
  const data = await response.json().catch(() => ({ ok: false, message: 'Resposta inválida do servidor.' }));
  if (!response.ok || !data?.ok) throw new Error(String(data?.message || `Erro HTTP ${response.status}`));
  return data;
}

const DEFAULT_RUNTIME_MENU_SCROLL_CSS = `/* CrewCheck runtime hotfix — Menu scroll */
html.crewcheck-menu-open,
body.crewcheck-menu-open {
  height: 100dvh !important;
  max-height: 100dvh !important;
  overflow: hidden !important;
  overscroll-behavior: none !important;
}
.cz-menu-overlay {
  position: fixed !important;
  inset: 0 !important;
  z-index: 9999 !important;
  width: 100vw !important;
  height: 100dvh !important;
  max-height: 100dvh !important;
  overflow: hidden !important;
  display: flex !important;
  align-items: stretch !important;
  justify-content: flex-end !important;
  overscroll-behavior: none !important;
  touch-action: none !important;
}
.cz-menu-backdrop {
  position: fixed !important;
  inset: 0 !important;
  z-index: 0 !important;
  touch-action: none !important;
}
.cz-menu-panel {
  position: relative !important;
  z-index: 1 !important;
  width: min(96vw, 420px) !important;
  height: 100dvh !important;
  max-height: 100dvh !important;
  min-height: 0 !important;
  margin: 0 !important;
  overflow-y: auto !important;
  overflow-x: hidden !important;
  -webkit-overflow-scrolling: touch !important;
  overscroll-behavior-y: contain !important;
  overscroll-behavior-x: none !important;
  touch-action: pan-y !important;
  display: flex !important;
  flex-direction: column !important;
  padding-bottom: calc(5rem + env(safe-area-inset-bottom, 0px)) !important;
}
.cz-menu-panel header {
  position: sticky !important;
  top: 0 !important;
  z-index: 4 !important;
  flex: 0 0 auto !important;
}
.cz-menu-section {
  flex: 0 0 auto !important;
  min-height: auto !important;
  overflow: visible !important;
  display: flex !important;
  flex-direction: column !important;
}
.cz-menu-section h3,
.cz-menu-section button {
  flex: 0 0 auto !important;
}
.cz-menu-section:last-child {
  padding-bottom: calc(5rem + env(safe-area-inset-bottom, 0px)) !important;
}
`;

export default function Home() {
  const [, setLocation] = useLocation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<ZeroView>(() => new URLSearchParams(window.location.search).has('connect') ? 'community' : normalizeInitialView(sessionStorage.getItem('crewcheck_force_view_once') || sessionStorage.getItem('crewcheck_initial_view')));
  const [bundle, setBundle] = useState<BundleState>(loadRoster());
  const [busy, setBusy] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [showIntro, setShowIntro] = useState(false);
  const [presentationRevision, setPresentationRevision] = useState(0);
  const events = useMemo(() => buildLegs(bundle.roster), [bundle.roster, presentationRevision]);
  const event = nextFlight(events);
  const flightEvent = nextRealFlight(events);
  const compliance = currentCompliance(bundle);
  const gym = currentGym(bundle);
  useWeatherLandingMonitor(flightEvent);

  useEffect(() => {
    const mode = storage.get('crewcheck_theme_mode', storage.get('crewcheck_light_premium', '0') === '1' ? 'light' : 'dark');
    const effective = mode === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.crewTheme = effective;
    document.documentElement.classList.toggle('dark', effective === 'dark');
    document.documentElement.style.colorScheme = effective;
    storage.set('crewcheck_last_loaded_version', DEFAULT_VERSION);
    const open = () => setDrawer(true);
    const setViewFromEvent = (event: Event) => { const next = (event as CustomEvent).detail; if (next) setView(normalizeInitialView(String(next))); };
    const refreshPresentation = () => setPresentationRevision((value) => value + 1);
    const syncTheme = () => {
      const next = storage.get('crewcheck_theme_mode', 'dark') === 'light' || storage.get('crewcheck_light_premium', '0') === '1' ? 'light' : 'dark';
      document.documentElement.dataset.crewTheme = next;
      document.documentElement.classList.toggle('dark', next === 'dark');
      document.documentElement.style.colorScheme = next;
    };
    const forced = sessionStorage.getItem('crewcheck_force_view_once');
    if (forced) { setView(normalizeInitialView(forced)); sessionStorage.removeItem('crewcheck_force_view_once'); }
    window.addEventListener('crewcheck:open-menu', open);
    window.addEventListener('crewcheck:set-view', setViewFromEvent as EventListener);
    window.addEventListener('crewcheck:theme-change', syncTheme);
    window.addEventListener('crewcheck:presentation-updated', refreshPresentation);
    return () => { window.removeEventListener('crewcheck:open-menu', open); window.removeEventListener('crewcheck:set-view', setViewFromEvent as EventListener); window.removeEventListener('crewcheck:theme-change', syncTheme); window.removeEventListener('crewcheck:presentation-updated', refreshPresentation); };
  }, []);


  useEffect(() => {
    try {
      document.documentElement.classList.toggle('crewcheck-menu-open', drawer);
      document.body.classList.toggle('crewcheck-menu-open', drawer);
    } catch {}
    return () => {
      try {
        document.documentElement.classList.remove('crewcheck-menu-open');
        document.body.classList.remove('crewcheck-menu-open');
      } catch {}
    };
  }, [drawer]);

  useEffect(() => { loadCrewCheckRuntimePatch(); }, []);

  async function handleFile(inputEvent: ChangeEvent<HTMLInputElement>) {
    const file = inputEvent.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const parsed = await parsePDFResilient(file);
      const roster = parsed.roster;
      const decision = confirmRosterImport(roster, file.name);
      if (!decision.ok) {
        toast.message(decision.toastText || 'Importação cancelada.');
        return;
      }
      const plannedSnapshot = preservePlannedRosterBeforeImport(bundle, roster);
      const importComparison = plannedSnapshot && sameRosterPeriod(plannedSnapshot.roster, roster)
        ? compareRosters(plannedSnapshot.roster, roster)
        : null;
      const opensComparison = Boolean(importComparison && !importComparison.summary.unchanged);
      const newCompliance = saveRoster(roster, file.name);
      storage.set('crewcheck_last_import_guardian_summary', decision.summaryText);
      storage.set('crewcheck_last_import_guardian_period', decision.periodLabel);
      storage.set('crewcheck_last_pdf_import_source', parsed.source);
      setBundle({ roster, compliance: newCompliance, source: file.name });
      syncRosterWithTelegramConcierge(roster, file.name).catch(() => undefined);
      syncPlatformRoster(roster, newCompliance, file.name).catch(() => toast.message('Escala salva neste dispositivo; a sincronização com o banco será tentada novamente.'));
      sessionStorage.setItem('crewcheck_force_view_once', opensComparison ? 'compare' : 'roster');
      setView(opensComparison ? 'compare' : 'roster');
      toast.success(`${decision.toastText || 'Escala real importada e detalhes liberados.'}${parsed.source === 'server-fallback' ? ' Leitura alternativa concluída.' : ''}`);
      if (opensComparison) toast.info(`${importComparison?.summary.changedDays || 0} dia(s) com mudanças em relação à escala planejada.`);
      if (!decision.hasFuture) toast.error('A escala importada não possui programação futura após agora.');
      setLocation('/result');
    } catch (error) {
      toast.error(sanitizePdfImportError(error));
    } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  }

  async function copyCurrentSummarySilently() {
    try { await copyToClipboard(bundle.roster, compliance); return true; } catch { return false; }
  }

  const actions: QuickActions = {
    upload: () => fileRef.current?.click(),
    pdf: () => { try { const pdf = exportReport(bundle.roster, compliance, gym); pdf.download(); toast.success(`PDF gerado: ${pdf.fileName}`); } catch { toast.error('Não consegui gerar o PDF agora.'); } },
    ics: () => { try { const ics = generateICalendar(bundle.roster, gym); downloadCalendarFile(ics, `crewcheck-${bundle.roster.year}-${String(bundle.roster.month).padStart(2,'0')}.ics`); toast.success('Arquivo ICS gerado.'); } catch { toast.error('Não consegui gerar o ICS.'); } },
    whatsapp: () => { try { copyCurrentSummarySilently(); shareToWhatsApp(bundle.roster, compliance); toast.success('Resumo enviado para o WhatsApp.'); } catch { toast.error('Não consegui abrir WhatsApp.'); } },
    telegram: () => { openTelegramBinding(); },
    copy: () => { copyToClipboard(bundle.roster, compliance).then(ok => ok ? toast.success('Resumo copiado.') : toast.error('Não consegui copiar.')); },
    email: async () => { const to = window.prompt('Enviar relatório com PDF para qual e-mail?') || ''; if (!to.trim()) return; try { const pdf = exportReport(bundle.roster, compliance, gym); const result = await sendRosterByEmail({ to: to.trim(), roster: bundle.roster, compliance, gym, attachment: { fileName: pdf.fileName, blob: pdf.blob } }); toast.success(result.message || `Relatório e PDF enviados para ${to.trim()}.`); } catch (error) { toast.error(error instanceof Error ? error.message : 'Não consegui enviar o relatório pelo CrewCheck.'); } },
    sharePdf: async () => { try { const pdf = exportReport(bundle.roster, compliance, gym); const result = await shareExportedPdfNative(pdf, `CrewCheck · ${bundle.roster.crewName} · ${String(bundle.roster.month).padStart(2, '0')}/${bundle.roster.year}`); toast.success(result === 'shared' ? 'PDF compartilhado.' : 'PDF salvo para compartilhar.'); } catch (error) { if ((error as any)?.name !== 'AbortError') toast.error('Não consegui compartilhar o PDF agora.'); } },
    google: async () => { try { await connectGoogleCalendar(); const result = await syncRosterToGoogleCalendar(bundle.roster, loadGoogleCalendarSettings(), { gymRecommendations: gym }); toast.success(`Google Calendar: ${(result as any).total || (result as any).created + (result as any).updated || 0} eventos sincronizados.`); } catch { try { googleCalendarIntegrationDiagnostics?.(); } catch {} toast.error('Google Calendar indisponível. Confira login/permissões e ENV do Render.'); } },
    save: () => { saveRoster(bundle.roster, bundle.source); Promise.allSettled([saveRosterAnalysis({ roster: bundle.roster, compliance, gym, sourceFileName: bundle.source } as any), syncPlatformRoster(bundle.roster, compliance, bundle.source)]).then((results) => results.some((result) => result.status === 'fulfilled') ? toast.success('Escala salva e sincronização atualizada.') : toast.success('Escala salva neste dispositivo; a nuvem será tentada novamente.')); },
    openActive: () => { openActiveRoster().then(active => { if (active?.roster) { const c = active.compliance || analyzeSafe(active.roster); setBundle({ roster: active.roster, compliance: c, source: 'Escala ativa do banco' }); saveRoster(active.roster, 'Escala ativa do banco'); setView('cockpit'); toast.success('Escala ativa carregada.'); } else { toast.message('Nenhuma escala ativa encontrada. Use Importar escala.'); setView('import'); } }).catch(()=>{ toast.error('Não encontrei escala ativa sincronizada.'); setView('import'); }); },
    logout: () => { logout().finally(() => { window.location.href = '/login'; }); },
    replayIntro: () => { storage.set('crewcheck_intro_seen_v1278', '0'); setShowIntro(true); },
  };

  return <main className="cz-app" data-version={DEFAULT_VERSION} data-view={view}>
    <div className="cz-wallpaper"/>
    <input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden onChange={handleFile}/>
    {busy && <div className="cz-busy"><Plane/><strong>Interpretando escala...</strong></div>}
    {showIntro && <OpeningVideo onDone={() => setShowIntro(false)}/>}
    <MenuDrawer open={drawer} close={() => setDrawer(false)} view={view} setView={setView} actions={actions}/>
    {view === 'cockpit' && <Cockpit events={events} compliance={compliance} setView={setView} onUpload={actions.upload} openMenu={() => setDrawer(true)}/>} 
    {view === 'roster' && <Roster roster={bundle.roster} events={events} setView={setView}/>} 
    {view === 'compare' && <CompareRosterView bundle={bundle} onUpload={actions.upload}/>} 
    {view === 'alerts' && <Alerts compliance={compliance}/>}
    {view === 'departure' && <Departure event={event}/>}
    {view === 'mycar' && <CarView event={event}/>}
    {view === 'iflight' && <IFlightPushView actions={actions}/>}
    {view === 'settings' && <SettingsView setView={setView} actions={actions}/>}
    {view === 'admin' && <AdminControlView/>}
    {view === 'updates' && <UpdateCenterView/>}
    {view === 'maintenance' && <MaintenancePreview/>}
    {view === 'import' && <ImportPanel onUpload={actions.upload} onConcierge={() => setView('concierge')}/>}
    {view === 'features' && <FeatureHub bundle={bundle} events={events} setBundle={setBundle} setView={setView} actions={actions}/>}
    {view === 'plans' && <PlatformCenter mode="plans" onBack={() => setView('cockpit')}/>} 
    {view === 'community' && <PlatformCenter mode="community" rosterKey={`${Number(bundle.roster.year || 0)}-${String(Number(bundle.roster.month || 0)).padStart(2, '0')}`} onBack={() => setView('cockpit')} onEmailPdf={actions.email}/>} 
    {view === 'concierge' && <TelegramConciergeView bundle={bundle} setBundle={setBundle} setView={setView}/>}
    {view === 'radar' && <RadarView event={flightEvent}/>}
    {view === 'weather' && <WeatherView event={flightEvent}/>}
    {view === 'perdiem' && <PerDiemView bundle={bundle}/>}
    {view === 'salary' && <SalaryReliableView bundle={bundle}/>}
    {view === 'reports' && <ReportsView bundle={bundle}/>}
    {view === 'load' && <LoadView bundle={bundle}/>}
    {view === 'calendar' && <CalendarToolsView actions={actions} bundle={bundle} gym={gym}/>}
    {view === 'exports' && <ExportToolsView actions={actions}/>}
    {view === 'routine' && <RoutineView bundle={bundle}/>}
    {view === 'wakeup' && <WakeupView event={event}/>}
    {view === 'hotels' && <HotelsView events={events}/>}
    {view === 'gyms' && <GymsView events={events}/>}
    {view === 'presentation' && <PresentationManagerView events={events}/>}
    {view === 'map' && <MonthlyMapView events={events} actions={actions}/>}
    {view === 'database' && <DatabaseView setBundle={setBundle} setView={setView}/>}
    {view === 'crew' && <CrewToolsView bundle={bundle}/>}
    <BottomNav view={view} setView={setView} openMenu={() => setDrawer(true)} alertCount={actionableComplianceAlerts(compliance).length} alertSignature={complianceAlertSignature(compliance)}/>
  </main>;
}
