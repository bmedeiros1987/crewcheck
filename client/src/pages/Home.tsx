import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useLocation } from 'wouter';
import JSZip from 'jszip';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  Car,
  Check,
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
  MapPin,
  Plus,
  Search,
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
import { CREW_HOTEL_CATALOG, type CrewHotelCatalogEntry } from '@/data/crewHotels';
import ManualRegulationView from '@/components/v1392/ManualRegulationView';
import '@/components/v1393/weather.css';

type ZeroView =
  | 'cockpit' | 'roster' | 'alerts' | 'departure' | 'settings' | 'maintenance' | 'import' | 'features'
  | 'radar' | 'weather' | 'perdiem' | 'salary' | 'reports' | 'calendar' | 'exports' | 'routine' | 'database' | 'crew' | 'load' | 'wakeup' | 'hotels' | 'presentation' | 'map' | 'mycar' | 'gyms' | 'iflight' | 'updates' | 'concierge' | 'plans' | 'community' | 'compare' | 'regulation' | 'bids' | 'admin';

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

const DEFAULT_VERSION = '13.9.3';
const CREWCHECK_UI_CORE_NOTE = 'v13.9.3: REDEMET, pesquisa meteorológica e alertas críticos por escala';
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
  id?: string;
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
  manual?: boolean;
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

type PlaceCategory = 'hotel' | 'gym' | 'hospital' | 'pharmacy' | 'laundry';

const PLACE_CATEGORY_META: Record<PlaceCategory, { label: string; plural: string; query: string }> = {
  hotel: { label: 'Hotel', plural: 'Hotéis', query: 'hotel hospedagem' },
  gym: { label: 'Academia', plural: 'Academias', query: 'academia fitness' },
  hospital: { label: 'Hospital', plural: 'Hospitais', query: 'hospital pronto atendimento emergência' },
  pharmacy: { label: 'Farmácia', plural: 'Farmácias', query: 'farmácia drogaria' },
  laundry: { label: 'Lavanderia', plural: 'Lavanderias', query: 'lavanderia' },
};

const MANUAL_PLACES_STORAGE_KEY = 'crewcheck:manual-places-v1';

function normalizedSearch(value: unknown) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim();
}

function searchCrewHotels(query: string, airport = ''): CrewHotelCatalogEntry[] {
  const words = normalizedSearch(query).split(/\s+/).filter(Boolean);
  const airportCode = normalizedSearch(airport);
  return CREW_HOTEL_CATALOG
    .map((hotel) => {
      const haystack = normalizedSearch([hotel.name, hotel.airport, hotel.alternateAirport, hotel.city, hotel.region, hotel.country].join(' '));
      const wordScore = words.reduce((score, word) => score + (haystack.includes(word) ? 2 : -6), 0);
      const airportScore = airportCode && [normalizedSearch(hotel.airport), normalizedSearch(hotel.alternateAirport)].includes(airportCode) ? 12 : 0;
      const nameScore = words.length && normalizedSearch(hotel.name).includes(words.join(' ')) ? 8 : 0;
      return { hotel, score: wordScore + airportScore + nameScore };
    })
    .filter((item) => (!words.length && !airportCode) || item.score > 0)
    .sort((a, b) => b.score - a.score || a.hotel.name.localeCompare(b.hotel.name, 'pt-BR'))
    .slice(0, 24)
    .map((item) => item.hotel);
}

function loadManualPlaces(): NearbyPlace[] {
  try {
    const parsed = JSON.parse(storage.get(MANUAL_PLACES_STORAGE_KEY, '[]'));
    return Array.isArray(parsed) ? parsed.filter((place) => place && place.name && place.category) : [];
  } catch {
    return [];
  }
}

function saveManualPlaces(places: NearbyPlace[]) {
  storage.set(MANUAL_PLACES_STORAGE_KEY, JSON.stringify(places.slice(0, 120)));
}

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
function openNearbyPlaces(category: PlaceCategory, location = '', mode: 'layover' | 'current' = location ? 'layover' : 'current') {
  storage.set('crewcheck:places-category', category);
  storage.set('crewcheck:places-mode', mode);
  storage.set('crewcheck:places-location', mode === 'layover' ? location : '');
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
  const match = text.match(/(\d{1,2})[:hH](\d{2})/);
  return match ? `${pad2(Number(match[1]))}:${match[2]}` : fallback;
}
function parseDate(day?: RosterDay): Date {
  const rawAny = String((day as any)?.date || (day as any)?.data || '').trim();
  const monthNames: Record<string, number> = { JAN:1, FEV:2, FEB:2, MAR:3, ABR:4, APR:4, MAI:5, MAY:5, JUN:6, JUL:7, AGO:8, AUG:8, SET:9, SEP:9, OUT:10, OCT:10, NOV:11, DEZ:12, DEC:12 };
  let m = rawAny.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  m = rawAny.match(/^(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{2,4}))?/);
  if (m) {
    const inferredYear = Number((day as any)?.year || (m[3] ? (m[3].length === 2 ? `20${m[3]}` : m[3]) : new Date().getFullYear()));
    return new Date(inferredYear, Number(m[2]) - 1, Number(m[1]), 12, 0, 0);
  }
  m = rawAny.toUpperCase().match(/^(\d{1,2})\s*([A-ZÇ]{3})\s*(\d{2,4})?/);
  if (m && monthNames[m[2]]) {
    const inferredYear = Number((day as any)?.year || (m[3] ? (m[3].length === 2 ? `20${m[3]}` : m[3]) : new Date().getFullYear()));
    return new Date(inferredYear, monthNames[m[2]] - 1, Number(m[1]), 12, 0, 0);
  }
  const dayNumber = Number((day as any)?.dayNumber || (day as any)?.day || String(rawAny).slice(0,2) || 0);
  const month = Number((day as any)?.month || (day as any)?.mes || 0);
  const year = Number((day as any)?.year || (day as any)?.ano || new Date().getFullYear());
  if (dayNumber > 0 && month > 0) return new Date(year, month - 1, dayNumber, 12, 0, 0);
  return new Date(year, Math.max(0, month - 1), 1, 12, 0, 0);
}
function dateChip(date: Date) { return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}`; }
function weekday(date: Date) { return new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(date).replace('.', '').toUpperCase(); }
function monthLong(roster: CrewRoster) {
  try {
    const firstDate = Array.isArray(roster.days) && roster.days.length
      ? parseDate([...roster.days].sort((a, b) => parseDate(a).getTime() - parseDate(b).getTime())[0])
      : null;
    const month = firstDate && !Number.isNaN(firstDate.getTime()) ? firstDate.getMonth() + 1 : (roster.month || 7);
    const year = firstDate && !Number.isNaN(firstDate.getTime()) ? firstDate.getFullYear() : (roster.year || 2026);
    return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1));
  } catch {
    return 'Julho 2026';
  }
}
function dayTitle(day: RosterDay) {
  const d = parseDate(day);
  return `${weekday(d)} ${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
}

type PresentationLearningRule = {
  key: string;
  label: string;
  presentation: string;
  samples: number;
  confidence: number;
  lastUsedAt: string;
  updatedAt: string;
  source: 'manual' | 'aprendido';
};
const PRESENTATION_RULES_KEY = 'crewcheck_presentation_rules_v1341';
const PRESENTATION_OVERRIDES_KEY = 'crewcheck_presentation_overrides_v1341';

function parseTimeStrict(value?: string | null): string | null {
  const match = String(value || '').trim().match(/^(\d{1,2})[:hH](\d{2})$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${pad2(h)}:${pad2(m)}`;
}
function readJsonRecord<T>(key: string): Record<string, T> {
  try {
    const parsed = JSON.parse(storage.get(key, '{}'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}
function writeJsonRecord<T>(key: string, value: Record<string, T>) {
  storage.set(key, JSON.stringify(value));
}
function presentationLearningKey(event: Pick<ZeroLeg, 'hotel' | 'origin' | 'destination' | 'day'>): string {
  const hotel = String(event.hotel || (event.day as any)?.hotel || '').trim();
  if (hotel) return `hotel:${hotel.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')}`;
  const base = String((event.day as any)?.base || event.origin || event.destination || '').trim().toUpperCase();
  const cityName = city(base);
  return `local:${base || cityName}`.toLowerCase();
}
function presentationLearningLabel(event: Pick<ZeroLeg, 'hotel' | 'origin' | 'destination' | 'day'>): string {
  const hotel = String(event.hotel || (event.day as any)?.hotel || '').trim();
  if (hotel) return hotel;
  const base = String((event.day as any)?.base || event.origin || event.destination || '').trim().toUpperCase();
  return `${base || 'Local'} · ${city(base)}`;
}
function presentationOverrideKey(event: ZeroLeg): string {
  const d = event.canonical ? new Date(event.canonical.startDateTime) : event.date;
  return [dateChip(d), event.flightNumber, event.origin, event.destination, event.departure].join('|');
}
function loadPresentationRules() {
  return readJsonRecord<PresentationLearningRule>(PRESENTATION_RULES_KEY);
}
function loadPresentationOverrides() {
  return readJsonRecord<{ presentation: string; updatedAt: string; label: string }>(PRESENTATION_OVERRIDES_KEY);
}
function managedPresentationForEvent(event: ZeroLeg): { presentation: string; source: string } {
  if (event.placeholder) return { presentation: event.presentation, source: 'Escala' };
  if (!event.presentation || event.presentation === '—' || event.presentation === 'Conexão/Solo') return { presentation: event.presentation, source: 'Escala' };
  const override = loadPresentationOverrides()[presentationOverrideKey(event)];
  if (override?.presentation) return { presentation: override.presentation, source: 'Manual desta programação' };
  const rule = loadPresentationRules()[presentationLearningKey(event)];
  if (rule?.presentation) return { presentation: rule.presentation, source: `Aprendido: ${rule.label}` };
  return { presentation: event.presentation, source: 'Escala publicada' };
}
function savePresentationOverride(event: ZeroLeg, presentation: string, saveAsLearning = false) {
  const clean = parseTimeStrict(presentation);
  if (!clean) throw new Error('Informe um horário válido no formato HH:MM.');
  const overrides = loadPresentationOverrides();
  overrides[presentationOverrideKey(event)] = { presentation: clean, updatedAt: new Date().toISOString(), label: rosterEventTitle(event) };
  writeJsonRecord(PRESENTATION_OVERRIDES_KEY, overrides);

  if (saveAsLearning) {
    const rules = loadPresentationRules();
    const key = presentationLearningKey(event);
    const previous = rules[key];
    const samples = (previous?.samples || 0) + 1;
    rules[key] = {
      key,
      label: presentationLearningLabel(event),
      presentation: clean,
      samples,
      confidence: Math.min(0.98, 0.55 + samples * 0.08),
      lastUsedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: 'manual',
    };
    writeJsonRecord(PRESENTATION_RULES_KEY, rules);
  }
  window.dispatchEvent(new Event('crewcheck:presentation-updated'));
}
function clearPresentationOverride(event: ZeroLeg) {
  const overrides = loadPresentationOverrides();
  delete overrides[presentationOverrideKey(event)];
  writeJsonRecord(PRESENTATION_OVERRIDES_KEY, overrides);
  window.dispatchEvent(new Event('crewcheck:presentation-updated'));
}
function clearPresentationLearning(event: ZeroLeg) {
  const rules = loadPresentationRules();
  delete rules[presentationLearningKey(event)];
  writeJsonRecord(PRESENTATION_RULES_KEY, rules);
  window.dispatchEvent(new Event('crewcheck:presentation-updated'));
}
function applyPresentationManagement(event: ZeroLeg): ZeroLeg {
  const managed = managedPresentationForEvent(event);
  if (!managed.presentation || managed.presentation === event.presentation) {
    return { ...event, presentationSource: managed.source };
  }
  const updatedRoutine = Array.isArray(event.routine)
    ? event.routine.map((item) => item.startsWith('Despertador ') ? `Despertador ${addMinutesToTime(managed.presentation, -90)}` : item)
    : event.routine;
  const updatedSubtitle = String(event.subtitle || '').replace(/Apres\. \d{2}:\d{2}/, `Apres. ${managed.presentation}`);
  return {
    ...event,
    presentation: managed.presentation,
    presentationSource: managed.source,
    subtitle: updatedSubtitle,
    routine: updatedRoutine,
  };
}
function promptPresentation(event: ZeroLeg, saveAsLearning = false) {
  const current = managedPresentationForEvent(event).presentation || event.presentation || '';
  const label = saveAsLearning ? 'Salvar como padrão deste hotel/local' : 'Alterar somente esta programação';
  const next = window.prompt(`${label}\nInforme o horário no formato HH:MM`, current === 'Conexão/Solo' ? event.departure : current);
  if (!next) return false;
  savePresentationOverride(event, next, saveAsLearning);
  return true;
}

function programDateLabel(event: ZeroLeg): string {
  const d = event.canonical ? new Date(event.canonical.startDateTime) : event.date;
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return 'Data a confirmar';
  return `${weekday(d)} ${pad2(d.getDate())}/${pad2(d.getMonth()+1)}`;
}


type ImportGuardianDecision = {
  ok: boolean;
  summaryText: string;
  toastText: string;
  hasFuture: boolean;
  periodLabel: string;
};

function monthNameBR(month?: number | null): string {
  const names = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const index = Number(month || 0) - 1;
  return names[index] || 'Mês a confirmar';
}
function rosterPeriodFromDays(roster: CrewRoster): { month: number; year: number } {
  const days = Array.isArray(roster.days) ? roster.days : [];
  const counts = new Map<string, { month: number; year: number; score: number }>();
  for (const day of days) {
    const month = Number((day as any).month || roster.month || 0);
    const year = Number((day as any).year || roster.year || 0);
    if (!month || !year) continue;
    const key = `${month}|${year}`;
    const current = counts.get(key) || { month, year, score: 0 };
    current.score += Math.max(1, Array.isArray((day as any).legs) ? (day as any).legs.length : 1);
    counts.set(key, current);
  }
  const best = [...counts.values()].sort((a, b) => b.score - a.score)[0];
  return best || { month: Number(roster.month || new Date().getMonth() + 1), year: Number(roster.year || new Date().getFullYear()) };
}
function rosterPeriodLabel(roster: CrewRoster): string {
  const period = rosterPeriodFromDays(roster);
  return `${monthNameBR(period.month)}/${period.year}`;
}
function currentPeriodLabel(): string {
  const now = new Date();
  return `${monthNameBR(now.getMonth() + 1)}/${now.getFullYear()}`;
}
function isCurrentRosterPeriod(roster: CrewRoster): boolean {
  const period = rosterPeriodFromDays(roster);
  const now = new Date();
  return period.month === now.getMonth() + 1 && period.year === now.getFullYear();
}
function chronologicalNextRosterLeg(events: ZeroLeg[], now = new Date()): ZeroLeg | null {
  const real = events
    .filter((event) => !event.placeholder && isOperationalEvent(event))
    .sort((a, b) => eventStartDateTime(a).getTime() - eventStartDateTime(b).getTime());

  const active = real.find((event) => eventStartDateTime(event).getTime() <= now.getTime() && eventEndDateTime(event).getTime() >= now.getTime());
  if (active) return active;

  return real.find((event) => eventStartDateTime(event).getTime() > now.getTime()) || null;
}
function importGuardianSummary(roster: CrewRoster, sourceFileName: string): ImportGuardianDecision {
  const events = buildLegs(roster);
  const flights = events.filter((event) => event.kind === 'flight').length;
  const days = Array.isArray(roster.days) ? roster.days.length : 0;
  const activities = events.filter((event) => event.kind !== 'flight' && event.canonical?.kind !== 'rest').length;
  const rest = events.filter((event) => event.canonical?.kind === 'rest').length;
  const future = chronologicalNextRosterLeg(events);
  const periodLabel = rosterPeriodLabel(roster);
  const lines = [
    'CrewCheck detectou esta escala:',
    '',
    `Arquivo: ${sourceFileName}`,
    `Período: ${periodLabel}`,
    `Tripulante: ${safe(roster.crewName, 'Tripulante')}`,
    `Base: ${safe(roster.base, '—')}`,
    `Dias publicados: ${days}`,
    `Voos: ${flights}`,
    `Atividades: ${activities}`,
    `Folgas/descanso: ${rest}`,
    future ? `Próxima programação: ${rosterEventTitle(future)} · ${programDateLabel(future)} · ${safe(future.departure, '—')} → ${safe(future.arrival, '—')}` : 'Próxima programação: nenhuma programação futura detectada',
  ];

  if (!isCurrentRosterPeriod(roster)) {
    lines.push('', `Atenção: o período detectado é ${periodLabel}, mas o período atual é ${currentPeriodLabel()}.`);
  }
  if (!future) {
    lines.push('', 'Atenção: esta escala não possui evento operacional futuro após agora.');
  }
  lines.push('', 'Deseja ativar esta escala no CrewCheck?');

  return {
    ok: true,
    summaryText: lines.join('\n'),
    toastText: future ? `Escala ${periodLabel} importada.` : `Escala ${periodLabel} importada sem programação futura.`,
    hasFuture: Boolean(future),
    periodLabel,
  };
}
function confirmRosterImport(roster: CrewRoster, sourceFileName: string): ImportGuardianDecision {
  const decision = importGuardianSummary(roster, sourceFileName);
  const days = Array.isArray(roster.days) ? roster.days.length : 0;
  if (!days) {
    return {
      ...decision,
      ok: false,
      summaryText: 'O arquivo foi lido, mas nenhuma data de escala foi detectada. Verifique se é o PDF oficial da escala.',
      toastText: 'Nenhuma data de escala detectada.',
    };
  }

  const confirmed = window.confirm(decision.summaryText);
  return { ...decision, ok: confirmed };
}

function emptyRoster(): CrewRoster {
  return {
    crewName: getStoredUser()?.name || 'Tripulante',
    crewId: 'sem-escala',
    base: storage.get('crewcheck_virtual_base', 'BSB'),
    rank: 'Tripulante',
    airline: 'LATAM',
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    rawText: '',
    days: [] as any,
  } as CrewRoster;
}

function placeholderLeg(): ZeroLeg {
  const now = new Date();
  return {
    id: 'placeholder-import',
    day: { date: `${pad2(now.getDate())}/${pad2(now.getMonth()+1)}/${now.getFullYear()}`, dayNumber: now.getDate(), month: now.getMonth()+1, year: now.getFullYear(), type: 'IMPORTAR', legs: [] } as any,
    kind: 'duty',
    title: 'Importe sua escala real',
    subtitle: 'Nenhum dado fictício será exibido. Envie o PDF oficial para ativar Cockpit, escala completa, diárias, salário, rotina e alertas.',
    date: now,
    origin: safe(storage.get('crewcheck_virtual_base', 'BSB'), 'BSB'),
    destination: safe(storage.get('crewcheck_virtual_base', 'BSB'), 'BSB'),
    flightNumber: 'IMPORTAR',
    presentation: '—',
    departure: '—',
    arrival: '—',
    timeRange: 'Aguardando PDF',
    placeholder: true,
  };
}

function neutralCompliance(roster: CrewRoster): ComplianceResult {
  return {
    isCompliant: true,
    score: Array.isArray(roster.days) && roster.days.length ? 100 : 0,
    alerts: [],
    warnings: [],
    summary: Array.isArray(roster.days) && roster.days.length ? 'Nenhuma irregularidade confirmada.' : 'Carregue uma escala real para análise regulatória.',
  } as any;
}

function actionableComplianceAlerts(compliance: ComplianceResult | null): any[] {
  const source = Array.isArray((compliance as any)?.alerts) ? (compliance as any).alerts : [];
  const seen = new Set<string>();
  return source.filter((alert: any) => {
    if (!alert || alert.dismissed || alert.falsePositive || alert.active === false) return false;
    const title = String(alert.title || '').trim();
    const description = String(alert.description || '').trim();
    const severity = String(alert.severity || '').toLowerCase();
    if ((!title && !description) || !['error', 'warning'].includes(severity)) return false;
    const signature = `${severity}|${title}|${description}|${String(alert.legalReference || '')}`;
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

function analyzeSafe(roster: CrewRoster): ComplianceResult {
  try {
    if (!Array.isArray(roster.days) || !roster.days.length) return neutralCompliance(roster);
    return analyzeCompliance(roster);
  } catch { return neutralCompliance(roster); }
}
function loadRoster(): BundleState {
  const candidates = [
    () => sessionStorage.getItem('crewcheck_roster'),
    () => localStorage.getItem('crewcheck_latest_roster_bundle'),
    () => localStorage.getItem('crewcheck_roster_sync_latest_v108134'),
    () => localStorage.getItem('crewcheck_last_roster'),
  ];
  for (const read of candidates) {
    try {
      const raw = read();
      if (!raw) continue;
      const payload = JSON.parse(raw);
      const roster = payload?.roster ? payload.roster as CrewRoster : payload as CrewRoster;
      if (Array.isArray(roster.days) && roster.days.length) {
        // Recalcula sempre: versões antigas podiam manter contadores de alerta obsoletos.
        const compliance = analyzeSafe(roster);
        const source = payload?.sourceFileName || payload?.source || sessionStorage.getItem('crewcheck_source_file') || 'Escala ativa';
        return { roster, compliance, source };
      }
    } catch {}
  }
  const roster = emptyRoster();
  return { roster, compliance: neutralCompliance(roster), source: 'Nenhuma escala carregada' };
}
function saveRoster(roster: CrewRoster, source: string): ComplianceResult {
  const compliance = analyzeSafe(roster);
  try {
    sessionStorage.setItem('crewcheck_roster', JSON.stringify(roster));
    sessionStorage.setItem('crewcheck_compliance', JSON.stringify(compliance));
    sessionStorage.setItem('crewcheck_source_file', source);
    localStorage.setItem('crewcheck_latest_roster_bundle', JSON.stringify({ roster, compliance, sourceFileName: source, updatedAt: new Date().toISOString(), source: 'crewcheck-v13.8.0-canonical' }));
    localStorage.setItem('crewcheck_last_roster', JSON.stringify(roster));
    window.dispatchEvent(new CustomEvent('crewcheck:roster-updated', { detail: { roster, compliance, source } }));
  } catch {}
  return compliance;
}

type PlannedRosterSnapshot = {
  roster: CrewRoster;
  source: string;
  capturedAt: string;
  fingerprint: string;
};

const PLANNED_ROSTER_STORAGE_KEY = 'crewcheck_planned_roster_snapshot_v1';

function loadPlannedRoster(): PlannedRosterSnapshot | null {
  try {
    const parsed = JSON.parse(storage.get(PLANNED_ROSTER_STORAGE_KEY, 'null')) as PlannedRosterSnapshot | null;
    if (!parsed?.roster || !Array.isArray(parsed.roster.days) || !parsed.roster.days.length) return null;
    return {
      ...parsed,
      source: String(parsed.source || 'Escala planejada'),
      capturedAt: String(parsed.capturedAt || new Date().toISOString()),
      fingerprint: String(parsed.fingerprint || rosterFingerprint(parsed.roster)),
    };
  } catch {
    return null;
  }
}

function savePlannedRoster(roster: CrewRoster, source: string): PlannedRosterSnapshot {
  const snapshot: PlannedRosterSnapshot = {
    roster,
    source: source || 'Escala planejada',
    capturedAt: new Date().toISOString(),
    fingerprint: rosterFingerprint(roster),
  };
  storage.set(PLANNED_ROSTER_STORAGE_KEY, JSON.stringify(snapshot));
  window.dispatchEvent(new CustomEvent('crewcheck:planned-roster-updated', { detail: snapshot }));
  return snapshot;
}

function clearPlannedRoster(): void {
  try { localStorage.removeItem(PLANNED_ROSTER_STORAGE_KEY); } catch {}
  window.dispatchEvent(new CustomEvent('crewcheck:planned-roster-updated'));
}

function preservePlannedRosterBeforeImport(current: BundleState, incoming: CrewRoster): PlannedRosterSnapshot | null {
  const currentHasDays = Array.isArray(current.roster.days) && current.roster.days.length > 0;
  if (!currentHasDays || !sameRosterPeriod(current.roster, incoming)) return loadPlannedRoster();
  if (rosterFingerprint(current.roster) === rosterFingerprint(incoming)) return loadPlannedRoster();
  const existing = loadPlannedRoster();
  if (existing && sameRosterPeriod(existing.roster, incoming)) return existing;
  return savePlannedRoster(current.roster, current.source);
}

function currentCompliance(bundle: BundleState) { return bundle.compliance || analyzeSafe(bundle.roster); }
function currentGym(bundle: BundleState) { try { return getGymRecommendations(bundle.roster); } catch { return []; } }

function buildLegs(roster: CrewRoster): ZeroLeg[] {
  const normalized = normalizeRosterDays(roster);
  const canonicalEvents = buildCanonicalRosterEvents(normalized);

  const legs = canonicalEvents.map((event): ZeroLeg => {
    const day = event.publishedDay;
    const leg = event.leg;
    const d = event.startDateTime ? new Date(event.startDateTime) : parseDate(day);

    if (event.kind === 'flight' && leg) {
      const anyLeg = leg as any;
      const airlineCode = normalizedAirlineCode(anyLeg.airlineCode, anyLeg.carrierCode, anyLeg.marketingCarrier, anyLeg.operatingCarrier, event.flightNumber);
      const airlineName = airlineNameFor(airlineCode, anyLeg.airlineName || anyLeg.carrierName || anyLeg.operatorName);
      const suffix = event.isNextDay ? ' +1' : '';
      const workType = safe(anyLeg.workType || (leg as any).workType, 'OP').toUpperCase();
      const title = event.flightNumber + ' · ' + workTypeLabel(workType);
      const subtitle = event.showPresentation
        ? `Apres. ${event.presentation} · ${event.departure} → ${event.arrival}${suffix} · ${city(event.origin)} → ${city(event.destination)}`
        : `Conexão/Solo ${event.groundBeforeMinutes ?? '—'} min · ${event.departure} → ${event.arrival}${suffix} · ${city(event.origin)} → ${city(event.destination)}`;

      return {
        id: event.id,
        day,
        leg,
        kind: 'flight',
        date: d,
        title,
        subtitle,
        origin: event.origin,
        destination: event.destination,
        flightNumber: event.flightNumber,
        presentation: event.showPresentation ? event.presentation : 'Conexão/Solo',
        departure: event.departure,
        arrival: event.arrival,
        aircraft: safe(anyLeg.aircraft || anyLeg.aircraftType || anyLeg.equipment, 'A confirmar'),
        registration: safe(anyLeg.registration || anyLeg.tailNumber || anyLeg.matricula, 'A confirmar'),
        gate: safe(anyLeg.gate || (day as any).gate, 'A confirmar'),
        terminal: safe(anyLeg.terminal || (day as any).terminal, 'A confirmar'),
        status: safe(anyLeg.status || (day as any).status, 'Programado'),
        airlineCode,
        airlineName,
        hotel: safe((day as any).hotel || anyLeg.hotel, ''),
        crew: Array.isArray(anyLeg.crew) ? anyLeg.crew.map((c:any) => safe(c.name || c.employeeName || c.role || c, '')).filter(Boolean) : [],
        routine: [
          event.showPresentation ? `Despertador ${addMinutesToTime(event.presentation, -90)}` : '',
          anyLeg.hotel || (day as any).hotel ? `Hotel ${safe(anyLeg.hotel || (day as any).hotel)}` : '',
          `Descanso após chegada ${event.arrival}`,
          `Academia/restaurante/mercado/farmácia/lavanderia em ${city(event.destination)}`,
        ].filter(Boolean),
        timeRange: `${event.departure} → ${event.arrival}${suffix}`,
        canonical: event,
      };
    }

    const base = safe((day as any).base || (day as any).airport || (day as any).hotel || event.origin, roster.base || '—');
    const kind = event.kind === 'stay' ? 'stay' : 'duty';
    return {
      id: event.id,
      day,
      kind,
      date: d,
      title: kind === 'stay' ? `Estadia diurna · ${base}` : safe((day as any).pairingCode || (day as any).type || event.flightNumber, 'Programação'),
      subtitle: kind === 'stay' ? `Hotel/pernoite em ${safe((day as any).hotel || city(base), city(base))}` : safe((day as any).description || (day as any).rawText, 'Programação operacional'),
      origin: base,
      destination: base,
      flightNumber: event.flightNumber,
      presentation: event.presentation,
      departure: event.departure,
      arrival: event.arrival,
      hotel: safe((day as any).hotel, ''),
      timeRange: `${event.departure} → ${event.arrival}`,
      canonical: event,
    };
  });

  const projected = legs.map(applyPresentationManagement)
    .sort((a, b) => (a.canonical ? new Date(a.canonical.startDateTime).getTime() : a.date.getTime()) - (b.canonical ? new Date(b.canonical.startDateTime).getTime() : b.date.getTime()));
  return dedupeProjectedLegs(projected);
}

function projectedFlightQuality(event: ZeroLeg): number {
  const hours = durationHours(event);
  const plausibleDuration = hours > 0 && hours <= 16 ? 120 - hours : 0;
  const hasTimes = /^\d{2}:\d{2}$/.test(event.departure) && /^\d{2}:\d{2}$/.test(event.arrival) ? 10 : 0;
  const hasRoute = event.origin && event.destination && event.origin !== event.destination ? 10 : 0;
  return plausibleDuration + hasTimes + hasRoute;
}

function dedupeProjectedLegs(events: ZeroLeg[]): ZeroLeg[] {
  const output: ZeroLeg[] = [];
  const flightIndex = new Map<string, number>();
  for (const event of events) {
    if (event.kind !== 'flight') {
      output.push(event);
      continue;
    }
    const key = [
      dateChip(event.date),
      String(event.flightNumber || '').replace(/\s+/g, '').toUpperCase(),
      String(event.origin || '').toUpperCase(),
      String(event.destination || '').toUpperCase(),
    ].join('|');
    const existingIndex = flightIndex.get(key);
    if (existingIndex === undefined) {
      flightIndex.set(key, output.length);
      output.push(event);
      continue;
    }
    if (projectedFlightQuality(event) > projectedFlightQuality(output[existingIndex])) output[existingIndex] = event;
  }
  return output;
}

function eventStartDateTime(event: ZeroLeg): Date {
  return event.canonical ? new Date(event.canonical.startDateTime) : new Date(event.date);
}
function eventEndDateTime(event: ZeroLeg): Date {
  return event.canonical ? new Date(event.canonical.endDateTime) : eventStartDateTime(event);
}
function isOperationalEvent(event: ZeroLeg) {
  if (event.placeholder) return false;
  if (event.canonical?.kind === 'rest') return false;
  const code = `${event.flightNumber} ${(event.day as any)?.type || ''} ${(event.day as any)?.pairingCode || ''}`.toUpperCase();
  if (/(^|\s)(DO|DOF|DOP|OFF|FOLGA|FÉRIAS|FERIAS|EAD)(\s|$)/.test(code)) return false;
  if (code.includes('SOBREAVISO') && !/(VOO|RESERVA|ACION|CHAMAD|LA\d+)/.test(code)) return false;
  return ['flight', 'duty', 'stay'].includes(event.kind);
}
function eventIsNow(event: ZeroLeg, now = new Date()) {
  const start = eventStartDateTime(event).getTime();
  const end = eventEndDateTime(event).getTime();
  return now.getTime() >= start && now.getTime() <= end;
}
function noFutureLeg(events: ZeroLeg[]): ZeroLeg {
  const base = events.find((e) => !e.placeholder) || placeholderLeg();
  const today = new Date();
  return {
    ...base,
    id: 'no-future-canonical-event',
    placeholder: true,
    kind: 'duty',
    date: today,
    title: 'Nenhuma programação futura',
    subtitle: 'A escala carregada não possui evento operacional futuro após agora. Se houver divergência, confira o período importado ou reimporte o PDF oficial.',
    origin: safe((base as any).origin, '—'),
    destination: safe((base as any).destination, '—'),
    flightNumber: '—',
    presentation: '—',
    departure: '—',
    arrival: '—',
    timeRange: '—',
    canonical: undefined,
  };
}
function nextFlight(events: ZeroLeg[]) {
  const canonicalEvents = events
    .filter((event) => !event.placeholder && isOperationalEvent(event))
    .map((event) => event.canonical)
    .filter(Boolean) as CanonicalRosterEvent[];

  const selected = selectNextRosterEvent(canonicalEvents);
  if (selected) {
    const found = events.find((event) => event.canonical?.id === selected.id);
    if (found) return found;
  }

  const chronological = chronologicalNextRosterLeg(events);
  if (chronological) return chronological;

  return noFutureLeg(events);
}
function nextRealFlight(events: ZeroLeg[]) {
  const canonicalFlights = events
    .filter((event) => event.kind === 'flight' && !event.placeholder)
    .map((event) => event.canonical)
    .filter(Boolean) as CanonicalRosterEvent[];

  const selected = selectNextRosterEvent(canonicalFlights);
  if (selected) {
    const found = events.find((event) => event.canonical?.id === selected.id);
    if (found) return found;
  }

  return nextFlight(events);
}
function currentDayAnchor(events: ZeroLeg[]) {
  return nextFlight(events);
}


type AirportMapPoint = { code: string; lat: number; lon: number; label?: string };
const AIRPORT_MAP_POINTS: Record<string, AirportMapPoint> = {
  BSB:{code:'BSB',lat:-15.8711,lon:-47.9186}, GRU:{code:'GRU',lat:-23.4356,lon:-46.4731}, CGH:{code:'CGH',lat:-23.6261,lon:-46.6564}, VCP:{code:'VCP',lat:-23.0074,lon:-47.1345},
  SDU:{code:'SDU',lat:-22.9105,lon:-43.1631}, GIG:{code:'GIG',lat:-22.8099,lon:-43.2506}, CNF:{code:'CNF',lat:-19.6244,lon:-43.9719}, CWB:{code:'CWB',lat:-25.5317,lon:-49.1761},
  POA:{code:'POA',lat:-29.9944,lon:-51.1714}, FLN:{code:'FLN',lat:-27.6705,lon:-48.5525}, SSA:{code:'SSA',lat:-12.9086,lon:-38.3225}, REC:{code:'REC',lat:-8.1265,lon:-34.9236},
  FOR:{code:'FOR',lat:-3.7763,lon:-38.5326}, BEL:{code:'BEL',lat:-1.3793,lon:-48.4763}, MAO:{code:'MAO',lat:-3.0386,lon:-60.0497}, MAB:{code:'MAB',lat:-5.3686,lon:-49.1380},
  SLZ:{code:'SLZ',lat:-2.5854,lon:-44.2341}, NAT:{code:'NAT',lat:-5.7681,lon:-35.3761}, MCZ:{code:'MCZ',lat:-9.5108,lon:-35.7917}, AJU:{code:'AJU',lat:-10.9840,lon:-37.0703},
  PMW:{code:'PMW',lat:-10.2915,lon:-48.3569}, THE:{code:'THE',lat:-5.0599,lon:-42.8235}, VIX:{code:'VIX',lat:-20.2581,lon:-40.2864}, GYN:{code:'GYN',lat:-16.6320,lon:-49.2207},
  CGB:{code:'CGB',lat:-15.6529,lon:-56.1167}, CGR:{code:'CGR',lat:-20.4687,lon:-54.6725}, BVB:{code:'BVB',lat:2.8463,lon:-60.6901}, MCP:{code:'MCP',lat:0.0507,lon:-51.0722},
  RBR:{code:'RBR',lat:-9.8689,lon:-67.8981}, PVH:{code:'PVH',lat:-8.7093,lon:-63.9023}, IOS:{code:'IOS',lat:-14.8159,lon:-39.0332}, JPA:{code:'JPA',lat:-7.1458,lon:-34.9486}, RAO:{code:'RAO',lat:-21.1364,lon:-47.7767}, CXJ:{code:'CXJ',lat:-29.1971,lon:-51.1875},
  IGU:{code:'IGU',lat:-25.6003,lon:-54.4852}, NVT:{code:'NVT',lat:-26.8799,lon:-48.6514}, JOI:{code:'JOI',lat:-26.2245,lon:-48.7974}, LDB:{code:'LDB',lat:-23.3336,lon:-51.1301},
  MGF:{code:'MGF',lat:-23.4794,lon:-52.0122}, UDI:{code:'UDI',lat:-18.8836,lon:-48.2253}, SJP:{code:'SJP',lat:-20.8166,lon:-49.4065}, PNZ:{code:'PNZ',lat:-9.3624,lon:-40.5691},
  STM:{code:'STM',lat:-2.4247,lon:-54.7858}, IMP:{code:'IMP',lat:-5.5313,lon:-47.4600}, BPS:{code:'BPS',lat:-16.4386,lon:-39.0809}, AQA:{code:'AQA',lat:-21.8120,lon:-48.1320}, BAU:{code:'BAU',lat:-22.3450,lon:-49.0538},
};
function airportPoint(code?: string | null): AirportMapPoint | null {
  const key = String(code || '').trim().toUpperCase();
  return AIRPORT_MAP_POINTS[key] || null;
}
function projectSouthAmerica(point: AirportMapPoint): { x: number; y: number } {
  const minLon = -82, maxLon = -30, minLat = -35, maxLat = 14;
  const x = ((point.lon - minLon) / (maxLon - minLon)) * 100;
  const y = ((maxLat - point.lat) / (maxLat - minLat)) * 100;
  return { x: Math.max(3, Math.min(97, x)), y: Math.max(3, Math.min(97, y)) };
}
function routeDistanceKm(a: AirportMapPoint, b: AirportMapPoint): number {
  const rad = (value: number) => value * Math.PI / 180;
  const r = 6371;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const s1 = Math.sin(dLat / 2) ** 2;
  const s2 = Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(s1 + s2));
}
function monthlyRouteData(events: ZeroLeg[]) {
  const segments = events
    .filter((event) => event.kind === 'flight' && !event.placeholder)
    .map((event) => ({ event, from: airportPoint(event.origin), to: airportPoint(event.destination) }))
    .filter((item): item is { event: ZeroLeg; from: AirportMapPoint; to: AirportMapPoint } => Boolean(item.from && item.to));
  const destinations = new Map<string, AirportMapPoint & { count: number }>();
  segments.forEach(({ from, to }) => {
    [from, to].forEach((point) => {
      const current = destinations.get(point.code) || { ...point, count: 0 };
      current.count += 1;
      destinations.set(point.code, current);
    });
  });
  const totalKm = Math.round(segments.reduce((sum, segment) => sum + routeDistanceKm(segment.from, segment.to), 0));
  return { segments, destinations: [...destinations.values()].sort((a, b) => b.count - a.count || a.code.localeCompare(b.code)), totalKm };
}
function openMapRoute(event: ZeroLeg) {
  const origin = eventRouteOrigin(event);
  const destination = eventRouteDestination(event);
  window.open(buildGoogleMapsDirectionsUrl(origin, destination, 'driving'), '_blank', 'noopener,noreferrer');
}
function openRoadNetwork(event: ZeroLeg) {
  const point = airportPoint(event.origin) || airportPoint(event.destination) || AIRPORT_MAP_POINTS.BSB;
  const query = `[out:json][timeout:25];(way["highway"](around:4500,${point.lat},${point.lon});node["amenity"~"parking|fuel|taxi"](around:4500,${point.lat},${point.lon}););out geom;`;
  window.open(`https://overpass-turbo.eu/?Q=${encodeURIComponent(query)}&R`, '_blank', 'noopener,noreferrer');
}
function RouteVisual({ event, compact = false }: { event: ZeroLeg; compact?: boolean }) {
  const destination = `${safe(event.origin, 'Aeroporto')} · ${city(event.origin)}`;
  const origin = event.hotel ? `Hotel · ${event.hotel}` : 'Localização atual / hotel';
  return <div className={`cz-route-visual ${compact ? 'compact' : ''}`}>
    <svg viewBox="0 0 360 170" role="img" aria-label="Representação visual do trajeto hotel aeroporto">
      <defs>
        <linearGradient id="czRouteGradient" x1="0" x2="1" y1="0" y2="0"><stop offset="0%" stopColor="#a855f7"/><stop offset="52%" stopColor="#6366f1"/><stop offset="100%" stopColor="#22d3ee"/></linearGradient>
        <filter id="czRouteGlow"><feGaussianBlur stdDeviation="5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <path d="M62 112 C126 155, 234 155, 298 112" fill="none" stroke="url(#czRouteGradient)" strokeWidth="12" strokeLinecap="round" opacity=".95" filter="url(#czRouteGlow)"/>
      <circle cx="72" cy="78" r="30" fill="#a855f7" filter="url(#czRouteGlow)"/>
      <circle cx="288" cy="78" r="30" fill="#22d3ee" filter="url(#czRouteGlow)"/>
      <text x="72" y="130" textAnchor="middle">Origem</text>
      <text x="288" y="130" textAnchor="middle">Aeroporto</text>
    </svg>
    {!compact && <div className="cz-route-visual-copy"><strong>{origin}</strong><span>→</span><strong>{destination}</strong><small>Mapa apenas visual para rota. Tempo de trânsito fica separado quando o serviço estiver configurado.</small></div>}
  </div>;
}


function GoogleMapsRoutePreview({ event, mode = 'driving', onRoute }: { event: ZeroLeg; mode?: string; onRoute?: (route: RoutePreviewInfo | null) => void }) {
  const [origin, setOrigin] = useState(() => eventRouteOrigin(event));
  const [route, setRoute] = useState<RoutePreviewInfo | null>(null);
  const destination = eventRouteDestination(event);
  const mapsMode = mode.includes('transit') ? 'transit' : 'driving';
  const routeModeLabel = mode === 'automatic' ? 'mais rápido' : mode.includes('transit') ? 'transporte público' : mode.includes('uber') ? 'Uber/99' : mode.includes('flight') ? 'carro + voo' : 'carro';
  const embedUrl = buildGoogleMapsEmbedDirectionsUrl(origin, destination, mapsMode);
  useEffect(() => {
    let alive = true;
    fetchRoutePreviewInfo(origin, destination, mapsMode).then((info) => { if (alive) { setRoute(info); onRoute?.(info); } });
    return () => { alive = false; };
  }, [origin, destination, mode]);
  async function refreshLocation() {
    try {
      const position = await getCurrentGeoPosition();
      const next = coordsLabel(position.lat, position.lng);
      setOrigin(next);
      toast.success('Localização atualizada para a prévia da rota.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não consegui atualizar sua localização.');
    }
  }
  const mapsUrl = buildGoogleMapsDirectionsUrl(origin, destination, mapsMode);
  const staticRouteUrl = buildGoogleStaticRouteMapUrl(origin, destination, route);
  const trafficText = route?.trafficAware ? safe(route.durationInTrafficText || route.durationText, 'Tempo atualizado') : 'Ao abrir no Google Maps';
  const distanceKm = Number(route?.distanceMeters || 0) / 1000;
  const uberReference = distanceKm > 0 ? `R$ ${Math.max(8, distanceKm * 2.1 + 6).toFixed(0)} a R$ ${Math.max(12, distanceKm * 3.1 + 9).toFixed(0)}` : '';
  function openUber() {
    const params = new URLSearchParams({ action: 'setPickup', pickup: 'my_location' });
    params.set('dropoff[formatted_address]', destination);
    window.open(`https://m.uber.com/ul/?${params.toString()}`, '_blank', 'noopener,noreferrer');
  }
  return <article className="cz-google-route-card">
    <header><div><b>Rota inteligente</b><span>Prévia do mapa · {routeModeLabel} · ponto A → ponto B</span></div><button onClick={refreshLocation}><Radar/> Atualizar localização</button></header>
    <div className="cz-route-kpis">
      <div><small>Origem</small><strong>{origin === 'Minha localização' ? 'Minha localização' : origin}</strong></div>
      <div><small>Destino</small><strong>{safe(event.origin || event.destination, 'Aeroporto')}</strong></div>
      <div><small>Distância</small><strong>{route?.distanceText || 'Abrir Maps'}</strong></div>
      <div><small>Trânsito/Maps</small><strong>{trafficText}</strong></div>
      {mode.includes('uber') && <div><small>Uber/99 estimado</small><strong>{uberReference || 'Calcular rota'}</strong></div>}
    </div>
    <div className="cz-google-map-preview">
      {embedUrl ? <iframe title="Prévia da rota pelo Google Maps" loading="lazy" src={embedUrl} referrerPolicy="strict-origin-when-cross-origin"/> : staticRouteUrl ? <img className="cz-static-map-img" src={staticRouteUrl} alt="Mapa estático da rota" loading="lazy"/> : <div className="cz-map-fallback"><MapIcon/><strong>Mapa estático aguardando configuração.</strong><span>Abra a rota no Google Maps para visualizar caminho e trânsito pelo Maps.</span></div>}
    </div>
    {route?.message && <p className="cz-mini-status">{route.message}</p>}
    <footer><button onClick={() => window.open(mapsUrl, '_blank', 'noopener,noreferrer')}><MapIcon/> Abrir no Google Maps</button>{mode.includes('uber') && <button onClick={openUber}><Car/> Chamar Uber</button>}<button onClick={() => { const manual = window.prompt('Endereço de origem para a rota') || ''; if (manual.trim()) { storage.set('crewcheck_manual_route_origin', manual.trim()); setOrigin(manual.trim()); toast.success('Origem manual aplicada.'); } }}><HomeIcon/> Usar endereço manual</button></footer>
  </article>;
}

function isAdmin() {
  const u = getStoredUser();
  const role = String((u as any)?.role || storage.get('crewcheck_role')).toLowerCase();
  const email = String(u?.email || '').toLowerCase();
  return role.includes('admin') || ADMIN_EMAILS.includes(email);
}


async function openTelegramBinding() {
  const identity = telegramConciergeIdentity();
  try {
    const response = await fetch('/api/telegram/link/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(identity),
    });
    const payload = await response.json().catch(() => null);
    if (!payload || payload.ok === false) {
      const command = payload?.command ? ` Comando: ${payload.command}` : '';
      toast.message((payload?.message || 'Vínculo Telegram aguardando configuração.') + command);
      return;
    }
    if (payload.code) storage.set('crewcheck_telegram_link_code', String(payload.code));
    if (payload.link) {
      window.open(String(payload.link), '_blank', 'noopener,noreferrer');
      toast.success('Telegram aberto. Toque em Start no bot para concluir o vínculo.');
      return;
    }
    toast.message(payload.message || 'Use o comando gerado no bot do CrewCheck.');
  } catch {
    toast.error('Não consegui iniciar o vínculo Telegram agora.');
  }
}

function telegramConciergeIdentity() {
  const user = getStoredUser();
  let conciergeKey = storage.get('crewcheck_telegram_access_key', '');
  if (!conciergeKey) {
    conciergeKey = `${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`}-${globalThis.crypto?.randomUUID?.() || Math.random()}`;
    storage.set('crewcheck_telegram_access_key', conciergeKey);
  }
  return {
    email: String(user?.email || '').trim(),
    name: String(user?.name || user?.email || 'Tripulante CrewCheck').trim(),
    conciergeKey,
  };
}
async function syncRosterWithTelegramConcierge(roster: CrewRoster, source = 'CrewCheck app') {
  if (!Array.isArray(roster?.days) || !roster.days.length) throw new Error('Importe uma escala antes de sincronizar.');
  const response = await fetch('/api/telegram/roster-sync', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify({ ...telegramConciergeIdentity(), roster, source }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) throw new Error(payload?.message || 'Não consegui sincronizar a escala com o Concierge.');
  return payload;
}
async function fetchTelegramConciergeRoster() {
  const identity = telegramConciergeIdentity();
  const params = new URLSearchParams(identity);
  const response = await fetch(`/api/telegram/roster?${params.toString()}`, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message || 'Não consegui consultar a escala do Telegram.');
  return payload;
}
async function askTelegramConcierge(text: string) {
  const response = await fetch('/api/telegram/concierge/ask', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify({ ...telegramConciergeIdentity(), text }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) throw new Error(payload?.message || 'O Concierge não respondeu agora.');
  return payload;
}

function Brand({ back, onMenu }: { back?: boolean; onMenu?: () => void }) {
  const click = onMenu || (back ? (() => window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'cockpit' }))) : (() => window.dispatchEvent(new Event('crewcheck:open-menu'))));
  return <header className="cz-brand-row">
    <button className="cz-menu-btn" onClick={click} aria-label={back ? 'Voltar' : 'Menu'}>{back ? '←' : <Menu size={28}/>}</button>
    <div className="cz-brand-lockup"><span className="cz-logo"><Plane size={26}/></span><div><strong>CrewCheck</strong><small>ROSTER INTELLIGENCE</small></div></div>
  </header>;
}
function complianceAlertSignature(compliance: ComplianceResult | null): string {
  const alerts = actionableComplianceAlerts(compliance);
  return alerts.map((alert: any) => [alert?.severity, alert?.title, alert?.description, alert?.legalReference].map((item) => String(item || '').trim()).join('::')).sort().join('||');
}

function BottomNav({ view, setView, openMenu, alertCount = 0, alertSignature = '' }: { view: ZeroView; setView: (v: ZeroView) => void; openMenu: () => void; alertCount?: number; alertSignature?: string }) {
  const currentSignature = alertCount > 0 ? (alertSignature || `count:${alertCount}`) : '';
  const [seenSignature, setSeenSignature] = useState(() => storage.get('crewcheck_alerts_seen_signature', ''));
  useEffect(() => {
    if (alertCount === 0) {
      storage.set('crewcheck_alerts_seen_signature', '');
      storage.set('crewcheck_alerts_seen_count', '0');
      setSeenSignature('');
    }
  }, [alertCount]);
  const visibleAlertCount = currentSignature && currentSignature !== seenSignature ? alertCount : 0;
  const markAlertsRead = () => {
    storage.set('crewcheck_alerts_seen_signature', currentSignature);
    storage.set('crewcheck_alerts_seen_count', String(alertCount));
    setSeenSignature(currentSignature);
  };
  const items: Array<[ZeroView, string, any]> = [['cockpit','Cockpit',HomeIcon],['roster','Escala',CalendarDays],['alerts','Alertas',Bell],['load','Carga',BriefcaseBusiness],['settings','Menu',Menu]];
  return <nav className="cz-bottom-nav" aria-label="Navegação principal">{items.map(([v, label, Icon]) => {
    const isMenu = v === 'settings';
    const active = view===v || (isMenu && ['settings','features','exports','calendar','database','routine','crew','radar','weather','perdiem','salary','reports','wakeup','hotels','presentation','map','mycar','gyms','iflight','updates','plans','community','regulation','bids','admin','maintenance'].includes(view));
    return <button key={v} className={active ? 'active' : ''} onClick={() => { if (v === 'alerts') markAlertsRead(); isMenu ? openMenu() : setView(v); }}><Icon size={23}/><span>{label}</span>{v==='alerts' && visibleAlertCount > 0 && <em aria-label={`${visibleAlertCount} alerta(s) novo(s)`}>{visibleAlertCount}</em>}</button>;
  })}</nav>;
}
function KpiCard({ icon: Icon, title, value, detail, tone = '' }: { icon: any; title: string; value: string; detail: string; tone?: string }) {
  return <article className={`cz-kpi ${tone}`}><span><Icon size={24}/></span><div><small>{title}</small><strong>{value}</strong><p>{detail}</p></div></article>;
}
type RadarSnapshot = {
  ok?: boolean;
  flight?: string;
  gate?: string;
  terminal?: string;
  status?: string;
  departure?: string;
  arrival?: string;
  aircraft?: string;
  registration?: string;
  quality?: number;
  latencyMs?: number;
  alternatives?: number;
  message?: string;
  updatedAt?: number;
};
const RADAR_CARD_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const RADAR_CARD_REFRESH_MS = 5 * 60 * 1000;
function radarSnapshotKey(event: ZeroLeg): string {
  return ['crewcheck_radar_v2', event.id, event.flightNumber, event.origin, event.destination].map((part) => String(part || '').trim().toUpperCase().replace(/[^A-Z0-9_-]+/g, '_')).join(':');
}
function readRadarSnapshot(event: ZeroLeg): RadarSnapshot | null {
  if (event.kind !== 'flight' || event.placeholder) return null;
  try {
    const parsed = JSON.parse(storage.get(radarSnapshotKey(event), 'null')) as RadarSnapshot | null;
    if (!parsed || !parsed.updatedAt || Date.now() - parsed.updatedAt > RADAR_CARD_CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}
function saveRadarSnapshot(event: ZeroLeg, payload: RadarSnapshot): RadarSnapshot {
  const snapshot = { ...payload, updatedAt: Date.now() };
  const key = radarSnapshotKey(event);
  storage.set(key, JSON.stringify(snapshot));
  window.dispatchEvent(new CustomEvent('crewcheck:radar-updated', { detail: { key, snapshot } }));
  return snapshot;
}
async function fetchRadarSnapshot(event: ZeroLeg, force = false): Promise<RadarSnapshot> {
  const flight = String(event.flightNumber || '').trim();
  if (event.kind !== 'flight' || event.placeholder || !/\d/.test(flight)) return { ok: false, message: 'Radar disponível apenas para voo publicado.' };
  const identity = telegramConciergeIdentity();
  const params = new URLSearchParams({ flight, origin: String(event.origin || ''), destination: String(event.destination || ''), force: force ? '1' : '0', email: identity.email, name: identity.name, conciergeKey: identity.conciergeKey });
  const response = await fetch(`/api/radar-flight?${params.toString()}`, { cache: 'no-store' });
  const payload = await response.json().catch(() => ({ ok: false, message: 'Radar indisponível.' }));
  return saveRadarSnapshot(event, payload || { ok: false, message: 'Radar indisponível.' });
}
function useRadarSnapshot(event: ZeroLeg): RadarSnapshot | null {
  const [snapshot, setSnapshot] = useState<RadarSnapshot | null>(() => readRadarSnapshot(event));
  useEffect(() => {
    let alive = true;
    const key = radarSnapshotKey(event);
    const cached = readRadarSnapshot(event);
    setSnapshot(cached);
    const onRadar = (incoming: Event) => {
      const detail = (incoming as CustomEvent).detail;
      if (detail?.key === key && alive) setSnapshot(detail.snapshot || null);
    };
    window.addEventListener('crewcheck:radar-updated', onRadar as EventListener);
    const needsRefresh = event.kind === 'flight' && !event.placeholder && (!cached?.updatedAt || Date.now() - cached.updatedAt > RADAR_CARD_REFRESH_MS);
    if (needsRefresh) fetchRadarSnapshot(event, false).then((next) => { if (alive) setSnapshot(next); }).catch(() => undefined);
    return () => { alive = false; window.removeEventListener('crewcheck:radar-updated', onRadar as EventListener); };
  }, [event.id, event.kind, event.placeholder, event.flightNumber, event.origin, event.destination]);
  return snapshot;
}
function AirlineLogo({ code, name }: { code?: string; name: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [code]);
  const url = airlineLogoUrl(code);
  return <span className="cz-airline-logo" title={name}>{url && !failed ? <img src={url} alt={`Logo ${name}`} loading="lazy" onError={() => setFailed(true)}/> : <Plane size={24} aria-label={name}/>}</span>;
}
function FlightCard({ event, compact = false }: { event: ZeroLeg; compact?: boolean }) {
  const d = event.canonical ? new Date(event.canonical.startDateTime) : event.date;
  const radar = useRadarSnapshot(event);
  const airlineCode = event.airlineCode || normalizedAirlineCode(event.flightNumber);
  const airlineName = airlineNameFor(airlineCode, event.airlineName);
  const gate = safe(radar?.gate || event.gate, 'A confirmar');
  const terminal = safe(radar?.terminal || event.terminal, 'A confirmar');
  const status = safe(radar?.status || event.status, 'Programado');
  const aircraft = safe(radar?.aircraft || event.aircraft, 'A confirmar');
  const registration = safe(radar?.registration || event.registration, 'A confirmar');
  const isFlight = event.kind === 'flight';
  const workType = flightWorkType(event);
  return <article className={`cz-flight-card ${compact ? 'compact' : ''} ${isFlight ? 'is-flight' : 'is-activity'} ${flightWorkClass(event)}`}>
    <div className="cz-flight-head">{isFlight ? <div className="cz-airline"><AirlineLogo code={airlineCode} name={airlineName}/><span><strong>{airlineName}</strong><em>{event.flightNumber}</em></span></div> : <div className="cz-airline cz-activity-brand"><span className="cz-airline-logo"><BriefcaseBusiness size={24}/></span><span><strong>{rosterEventTitle(event)}</strong><em>{safe(rosterCode(event.day), 'ATIVIDADE')}</em></span></div>}<div className="cz-date-chip"><CalendarDays size={16}/><b>{dateChip(d)}</b><small>{weekday(d)}</small></div></div>
    <div className="cz-route"><div><strong>{event.origin}</strong><span>{city(event.origin)}</span></div><div className="cz-route-arc"><i/><Plane size={20}/><i/></div><div><strong>{event.destination}</strong><span>{city(event.destination)}</span></div></div>
    {isFlight ? <div className="cz-flight-pills"><span className="cz-work-type-badge"><b>Operação</b>{workTypeLabel(workType)}</span><span><b>Apresentação</b>{event.presentation}</span><span><b>METAR/TAF Origem</b>{event.origin}</span><span><b>METAR/TAF Destino</b>{event.destination}</span><span><b>Alerta meteo até pouso</b>{radar?.updatedAt ? 'Radar sincronizado' : event.arrival}</span></div> : <div className="cz-flight-pills"><span><b>Programação</b>{rosterEventTitle(event)}</span><span><b>Local</b>{city(event.origin)}</span><span><b>Status</b>{status}</span></div>}
    <div className="cz-time-trio"><div><span>Apresentação</span><strong>{event.presentation}</strong><small>◷ Local</small></div><div><span>{isFlight ? 'Decolagem' : 'Início'}</span><strong>{event.departure}</strong><small>◷ Prevista</small></div><div><span>{isFlight ? 'Chegada' : 'Fim'}</span><strong>{event.arrival}</strong><small>◷ Prevista</small></div></div>
    {!compact && <div className="cz-info-duo">{isFlight && <div><Lock size={25}/><span>Portão</span><strong>{gate}</strong><small>{terminal}{radar?.updatedAt ? ' · Radar' : ''}</small></div>}<div><Plane size={25}/><span>Status</span><strong className="ok">{status}</strong><small>{isFlight ? `Aeronave: ${aircraft} · Matrícula: ${registration}` : safe(event.subtitle, 'Programação publicada')}</small></div></div>}
    {!compact && Boolean(event.crew?.length) && <div className="cz-crew-line"><UserRound size={18}/><span>Tripulação</span><strong>{event.crew?.slice(0, 4).join(', ')}</strong></div>}
    {!compact && Boolean(event.hotel) && <div className="cz-crew-line"><Hotel size={18}/><span>Hotel</span><strong>{event.hotel}</strong></div>}
    {!compact && Boolean(event.routine?.length) && <div className="cz-routine-strip">{event.routine?.slice(0, 4).map((item) => <span key={item}>{item}</span>)}</div>}
    {!compact && <div className="cz-roster-actions"><button onClick={() => window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'weather' }))}><CloudSun/> Meteorologia</button>{isFlight && <button onClick={() => window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'radar' }))}><Radar/> Radar</button>}<button onClick={() => window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'map' }))}><MapIcon/> Mapa do mês</button><button onClick={() => window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'routine' }))}><Dumbbell/> Rotina</button><button onClick={() => window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'wakeup' }))}><Bell/> Despertador</button></div>}
  </article>;
}
function SmartCard({ event, setView }: { event: ZeroLeg; setView: (v: ZeroView) => void }) {
  if (event.placeholder) {
    return <article className="cz-smart-card" onClick={() => setView('import')}><div className="cz-smart-title"><span><Upload size={26}/></span><div><h2>Importar escala real</h2><p>PDF oficial de julho</p></div><ChevronRight/></div><div className="cz-smart-content"><strong>PDF</strong><em>REAL</em><p>Nenhum dado fictício será usado.</p><div><small>Status</small><b>Aguardando escala</b></div></div></article>;
  }
  return <article className="cz-smart-card" onClick={() => setView('departure')}><div className="cz-smart-title"><span><Car size={26}/></span><div><h2>Saída Inteligente</h2><p>Recomendado para sua programação</p></div><ChevronRight/></div><div className="cz-smart-content"><strong>{event.presentation !== '—' ? event.presentation : 'Calcular'}</strong><em>ROTA</em><p>Localização atual / hotel → {event.origin}</p><div><small>Tempo real</small><b>Trânsito</b></div></div></article>;
}



function UpdateCenterView() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [token, setToken] = useState(() => storage.get('crewcheck_update_token', ''));
  const [title, setTitle] = useState('Hotfix visual CrewCheck');
  const [version, setVersion] = useState('runtime');
  const [notes, setNotes] = useState('');
  const [css, setCss] = useState(DEFAULT_RUNTIME_MENU_SCROLL_CSS);
  const [current, setCurrent] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  async function refreshCurrent() {
    try {
      const response = await fetch('/api/admin/runtime-patch/current', { cache: 'no-store', credentials: 'include' });
      const payload = await response.json().catch(() => null);
      setCurrent(payload);
      if (payload?.css) injectCrewCheckRuntimePatch(String(payload.css));
    } catch {
      setCurrent({ ok: false, message: 'Não consegui consultar hotfix ativo.' });
    }
  }

  useEffect(() => { refreshCurrent(); }, []);

  async function loadUpdatePackage(file: File) {
    const name = file.name.toLowerCase();
    if (name.endsWith('.zip')) {
      const zip = await JSZip.loadAsync(file);
      const manifestEntry = zip.file('manifest.json') || Object.values(zip.files).find((entry) => entry.name.toLowerCase().endsWith('manifest.json') && !entry.dir);
      const cssEntry = zip.file('patch.css') || Object.values(zip.files).find((entry) => entry.name.toLowerCase().endsWith('.css') && !entry.dir);
      const notesEntry = zip.file('release-notes.md') || Object.values(zip.files).find((entry) => entry.name.toLowerCase().endsWith('.md') && !entry.dir);
      if (!cssEntry) throw new Error('Pacote sem patch.css ou arquivo .css.');
      const cssText = await cssEntry.async('string');
      setCss(cssText);
      if (manifestEntry) {
        const manifestText = await manifestEntry.async('string');
        const manifest = JSON.parse(manifestText);
        setTitle(String(manifest.title || manifest.name || 'Pacote CrewCheck'));
        setVersion(String(manifest.version || manifest.packageVersion || 'runtime'));
      }
      if (notesEntry) setNotes(await notesEntry.async('string'));
      toast.success('Pacote ZIP lido. Revise e aplique o hotfix.');
      return;
    }

    const text = await file.text();
    if (name.endsWith('.json')) {
      const payload = JSON.parse(text);
      setTitle(String(payload.title || 'Pacote CrewCheck'));
      setVersion(String(payload.version || 'runtime'));
      setNotes(String(payload.notes || ''));
      setCss(String(payload.css || payload.patchCss || ''));
      toast.success('Pacote JSON lido.');
      return;
    }

    setCss(text);
    setTitle(file.name.replace(/\.[^.]+$/, ''));
    toast.success('Arquivo CSS/TXT carregado.');
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try { await loadUpdatePackage(file); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Não consegui ler o pacote.'); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  }

  async function applyPatch() {
    setBusy(true);
    try {
      storage.set('crewcheck_update_token', token);
      const payload = await crewcheckUpdateFetch('/api/admin/runtime-patch', token, { title, version, notes, css });
      injectCrewCheckRuntimePatch(css);
      setCurrent(payload);
      toast.success(payload.message || 'Hotfix visual aplicado.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não consegui aplicar o hotfix.');
    } finally {
      setBusy(false);
    }
  }

  async function clearPatch() {
    setBusy(true);
    try {
      storage.set('crewcheck_update_token', token);
      const payload = await crewcheckUpdateFetch('/api/admin/runtime-patch/clear', token, {});
      injectCrewCheckRuntimePatch('');
      setCurrent(payload);
      toast.success(payload.message || 'Hotfix removido.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não consegui remover o hotfix.');
    } finally {
      setBusy(false);
    }
  }

  return <><Brand back/><section className="cz-panel-head"><h1>Atualizações internas</h1><p>Central Admin para hotfix visual, pacote ZIP seguro, rollback e correções rápidas sem novo deploy para ajustes de interface.</p></section>
    <section className="cz-finance-grid">
      <KpiCard icon={Upload} title="Pacote" value="ZIP/CSS" detail="manifest + patch.css"/>
      <KpiCard icon={ShieldCheck} title="Segurança" value="CSS only" detail="sem JS e sem token"/>
      <KpiCard icon={RotateCcw} title="Rollback" value="1 toque" detail="remove hotfix runtime"/>
    </section>
    <section className="cz-toolbox cz-update-upload">
      <h2>Leitor de pacote CrewCheck</h2>
      <p>Envie um .zip com manifest.json e patch.css, ou cole CSS diretamente. Para produção, configure CREWCHECK_ADMIN_UPDATE_TOKEN no Render e informe o token abaixo.</p>
      <input ref={fileRef} hidden type="file" accept=".zip,.json,.css,.txt,.crewcheck-update" onChange={handleFile}/>
      <div className="cz-form-grid">
        <label><span>Token de atualização</span><input type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder="CREWCHECK_ADMIN_UPDATE_TOKEN"/></label>
        <label><span>Título</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Hotfix visual CrewCheck"/></label>
        <label><span>Versão do pacote</span><input value={version} onChange={(event) => setVersion(event.target.value)} placeholder="13.7.4-menu-scroll"/></label>
      </div>
      <label><span>Notas do pacote</span><textarea className="cz-update-textarea" style={{ minHeight: 96 }} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Notas de atualização"/></label>
      <label><span>CSS runtime seguro</span><textarea className="cz-update-textarea" value={css} onChange={(event) => setCss(event.target.value)} placeholder="Cole o CSS do hotfix"/></label>
      <div className="cz-tool-actions">
        <button onClick={() => fileRef.current?.click()} disabled={busy}><Upload/> Enviar pacote ZIP/CSS</button>
        <button onClick={applyPatch} disabled={busy || !css.trim()}><Save/> Aplicar hotfix visual</button>
        <button onClick={refreshCurrent} disabled={busy}><RotateCcw/> Ver hotfix ativo</button>
        <button className="danger" onClick={clearPatch} disabled={busy}><LogOut/> Remover hotfix</button>
      </div>
    </section>
    <section className="cz-toolbox cz-update-status">
      <h2>Status runtime</h2>
      <p>{current?.message || 'Consulte o status atual para ver se há hotfix ativo.'}</p>
      <div className="cz-routine-strip">
        <span>{current?.configured ? 'Hotfix ativo' : 'Sem hotfix ativo'}</span>
        <span>{current?.patch?.version || 'Sem versão runtime'}</span>
        <span>{current?.patch?.cssLength ? `${current.patch.cssLength} caracteres` : 'CSS vazio'}</span>
      </div>
    </section>
  </>;
}


function MenuDrawer({ open, close, view, setView, actions }: { open: boolean; close: () => void; view: ZeroView; setView: (v: ZeroView) => void; actions: QuickActions }) {
  const storedUser = getStoredUser();
  const admin = isAdmin();
  const [profileName] = useState(() => storage.get('crewcheck_profile_display_name', String(storedUser?.name || storedUser?.email || 'Tripulante CrewCheck')));
  const [profileAvatar] = useState(() => storage.get('crewcheck_profile_avatar', ''));
  const initials = profileName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'CC';
  function openProfile() { setView('settings'); close(); }
  if (!open) return null;
  const nav: Array<[ZeroView, string, string, any]> = [
    ['cockpit','Cockpit','Próxima programação',HomeIcon], ['roster','Escala completa','Todos os dias e eventos',CalendarDays], ['compare','Planejado x atual','Mudanças e impacto financeiro',GitCompareArrows], ['bids','BIDS','Preferências para a próxima escala',CalendarDays], ['alerts','Irregularidades','Alertas confirmados',AlertTriangle], ['regulation','Regulamentação','RBAC 117, ACT e limites',ShieldCheck], ['load','Carga de trabalho','Horas usadas x limites',BriefcaseBusiness], ['plans','Assinaturas','Planos, recursos e ligações',ShieldCheck], ['community','Pessoas e compartilhar','QR, visitantes, comparação e chat',UserRound], ['departure','Saída Inteligente','Rota/hotel',Car], ['mycar','Meu carro','Estacionamento e rota',Car], ['iflight','Push iFlight','Importação assistida',Upload],
    ['concierge','Concierge Telegram','PDF, comandos e voz',Send], ['radar','Radar de voos','Portão e status',Radar], ['weather','Meteorologia','METAR/TAF e alertas',CloudSun], ['wakeup','Despertador','Alarmes inteligentes',Bell], ['presentation','Gerenciador de apresentação','Hotel/local e ajuste manual',Clock], ['hotels','Hotéis','Pernoite e entorno',Hotel], ['gyms','Locais próximos','Academias, saúde e serviços',MapIcon], ['perdiem','Diárias','Semanal/mensal',BriefcaseBusiness], ['salary','Salário','Previsões e adicionais',DollarSign],
    ['reports','Relatórios','Indicadores premium',FileText], ['routine','Rotina','Academia e descanso',ShieldCheck], ['crew','Crew / Chefe','Tripulação e adicional',UserRound], ['calendar','Calendário','Google/ICS',CalendarDays],
    ['exports','Exportar','PDF e compartilhamento',Share2], ['database','Histórico','Banco e sync',Database], ['updates','Atualizações','Hotfix e pacote ZIP',Upload], ['settings','Configurações','Perfil completo',Settings],
  ];
  if (admin) nav.push(['maintenance','Manutenção','Prévia administrativa',Lock], ['admin', 'Admin', 'Termos, usuários e operação', ShieldCheck]);
  const jump = (v: ZeroView) => { setView(v); close(); };
  return <div className="cz-menu-overlay" role="dialog" aria-modal="true">
    <button className="cz-menu-backdrop" onClick={close} aria-label="Fechar menu" />
    <aside className="cz-menu-panel" data-crew-menu-panel="true" onWheel={(event) => event.stopPropagation()} onTouchMove={(event) => event.stopPropagation()}>
      <header className="cz-menu-header">
        <div className="cz-menu-identity" aria-label="CrewCheck">
          <span className="cz-menu-brandmark" title="CrewCheck"><Plane size={22}/></span>
          <button className="cz-menu-profile" onClick={openProfile} type="button" aria-label="Abrir perfil">
            <span className="cz-menu-avatar">{profileAvatar ? <img src={profileAvatar} alt="" /> : initials}</span>
            <span><strong>{profileName}</strong><small>{admin ? 'Administrador · Premium Unlimited' : 'Abrir perfil'}</small></span>
          </button>
        </div>
        <button className="cz-menu-close" onClick={close} aria-label="Fechar menu"><X/></button>
      </header>
      <div className="cz-menu-scroll" data-crew-menu-scroll="true">
      <section className="cz-menu-section"><h3>Navegação</h3>{nav.map(([v, label, desc, Icon]) => <button key={v} className={view === v ? 'active' : ''} onClick={() => jump(v)}><Icon/><span><strong>{label}</strong><small>{desc}</small></span><ChevronRight/></button>)}</section>
      <section className="cz-menu-section"><h3>Ações rápidas</h3>
        <button onClick={() => { actions.upload(); close(); }}><Upload/><span><strong>Importar escala PDF</strong><small>AIMS/CrewRoster</small></span><ChevronRight/></button>
        <button onClick={() => { actions.pdf(); close(); }}><FileText/><span><strong>Exportar PDF</strong><small>Relatório completo</small></span><ChevronRight/></button>
        <button onClick={() => { actions.sharePdf(); close(); }}><Share2/><span><strong>Compartilhar PDF</strong><small>Anexo pelo sistema ou menu nativo</small></span><ChevronRight/></button>
        <button onClick={() => { actions.ics(); close(); }}><CalendarDays/><span><strong>Baixar ICS</strong><small>Arquivo calendário</small></span><ChevronRight/></button>
        <button onClick={() => { actions.google(); close(); }}><CalendarDays/><span><strong>Google Calendar</strong><small>Sincronizar agenda</small></span><ChevronRight/></button>
        <button onClick={() => { actions.whatsapp(); close(); }}><Send/><span><strong>WhatsApp</strong><small>Compartilhar resumo</small></span><ChevronRight/></button>
        <button onClick={() => jump('concierge')}><Send/><span><strong>Abrir Concierge Telegram</strong><small>Enviar PDF, consultar e vincular</small></span><ChevronRight/></button>
        <button onClick={() => { actions.email(); close(); }}><Mail/><span><strong>E-mail</strong><small>Enviar relatório</small></span><ChevronRight/></button>
        <button onClick={() => { actions.copy(); close(); }}><Copy/><span><strong>Copiar resumo</strong><small>Área de transferência</small></span><ChevronRight/></button>
        <button onClick={() => { actions.save(); close(); }}><Save/><span><strong>Salvar histórico</strong><small>Banco/offline</small></span><ChevronRight/></button>
        <button onClick={() => { actions.openActive(); close(); }}><RotateCcw/><span><strong>Abrir escala ativa</strong><small>Última sincronizada</small></span><ChevronRight/></button>
        <button className="danger" onClick={() => { actions.logout(); close(); }}><LogOut/><span><strong>Sair</strong><small>Encerrar sessão</small></span><ChevronRight/></button>
      </section>
      </div>
    </aside>
  </div>;
}

function Cockpit({ events, compliance, setView, onUpload, openMenu }: { events: ZeroLeg[]; compliance: ComplianceResult | null; setView: (v: ZeroView) => void; onUpload: () => void; openMenu: () => void }) {
  const event = nextFlight(events);
  const loaded = events.some((event) => !event.placeholder);
  const alertCount = actionableComplianceAlerts(compliance).length;
  const counters = loaded && events[0]?.day ? {
    days: new Set(events.map((e) => e.day.date)).size,
    flights: events.filter((e) => e.kind === 'flight').length,
    activities: events.filter((e) => e.kind !== 'flight' && e.canonical?.kind !== 'rest').length,
    rest: events.filter((e) => e.canonical?.kind === 'rest').length,
  } : { days: 0, flights: 0, activities: 0, rest: 0 };

  return <><Brand onMenu={openMenu}/><section className="cz-title"><small>Cockpit</small><i/></section><section className="cz-kpi-row"><KpiCard icon={CalendarDays} title="Dias publicados" value={String(counters.days)} detail="Datas reais"/><KpiCard icon={Plane} title="Voos" value={String(counters.flights)} detail="Pernas detectadas" tone="blue"/><KpiCard icon={BriefcaseBusiness} title="Atividades" value={String(counters.activities)} detail={`Folgas ${counters.rest}`} tone="blue"/><KpiCard icon={Bell} title="Alertas" value={String(alertCount)} detail="Confirmados" tone="pink"/></section><section className="cz-money-row"><div onClick={() => setView('perdiem')}><BriefcaseBusiness/><span>Diárias</span><strong>Abrir</strong></div><div onClick={() => setView('salary')}><DollarSign/><span>Salário</span><strong>Financeiro</strong></div></section><section className="cz-section-head"><h2>Próxima Programação</h2><button onClick={() => setView(loaded ? 'roster' : 'import')}>{loaded ? 'Ver todas' : 'Importar'} <ChevronRight size={18}/></button></section>{loaded && !event.placeholder ? <FlightCard event={event}/> : <article className="cz-empty-real"><Upload/><h2>{loaded ? 'Nenhuma programação futura' : 'Nenhuma escala real carregada'}</h2><p>{loaded ? 'A escala foi carregada, mas não há evento operacional futuro após agora. Confira se o período importado está correto.' : 'Suba o PDF oficial de julho para reativar escala completa, detalhes, diárias, radar, rotina, hotéis, academias, trânsito e saída inteligente com dados reais.'}</p><button onClick={onUpload}>Importar PDF agora</button></article>}<SmartCard event={event} setView={setView}/><section className="cz-shortcuts cz-shortcuts-full"><button onClick={() => setView('features')}><Settings/><strong>Funcionalidades</strong><small>Central completa</small></button><button onClick={() => setView('load')}><BriefcaseBusiness/><strong>Carga</strong><small>Jornada e limites</small></button><button onClick={() => setView('radar')}><Radar/><strong>Radar</strong><small>Gate e status</small></button><button onClick={() => setView('weather')}><CloudSun/><strong>Meteorologia</strong><small>METAR/TAF</small></button><button onClick={() => setView('perdiem')}><BriefcaseBusiness/><strong>Diárias</strong><small>Semanal/mensal</small></button><button onClick={() => setView('salary')}><DollarSign/><strong>Salário</strong><small>Ganhos previstos</small></button><button onClick={() => setView('reports')}><FileText/><strong>Relatórios</strong><small>Indicadores</small></button><button onClick={() => setView('routine')}><Dumbbell/><strong>Rotina</strong><small>Academias/hotéis</small></button><button onClick={onUpload}><Upload/><strong>Importar PDF</strong><small>Escala oficial</small></button></section></>;
}

function rosterCode(day?: RosterDay): string {
  return String((day as any)?.pairingCode || (day as any)?.type || '').trim().toUpperCase();
}
function workTypeLabel(value?: string | null): string {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'OP') return 'Operando (OP)';
  if (normalized === 'PS') return 'Extra / passageiro (PS)';
  if (normalized === 'DH') return 'Deslocamento (DH)';
  return normalized || 'Operação';
}
function flightWorkType(event: ZeroLeg): string {
  return String((event.leg as any)?.workType || '').trim().toUpperCase();
}
function flightWorkClass(event: ZeroLeg): string {
  const workType = flightWorkType(event);
  return workType === 'PS' ? 'work-ps' : workType === 'OP' ? 'work-op' : workType ? 'work-other' : '';
}
function rosterCodeLabel(code: string): string {
  const normalized = String(code || '').trim().toUpperCase();
  const labels: Record<string, string> = {
    DR: 'Descanso regulamentar',
    DO: 'Folga',
    DOF: 'Folga',
    DOP: 'Folga programada',
    OFF: 'Folga',
    FERIAS: 'Férias',
    FÉRIAS: 'Férias',
    HSB: 'Sobreaviso',
    SA: 'Sobreaviso',
    RES: 'Reserva',
    RSV: 'Reserva',
    RCFI: 'Treinamento',
    CRM: 'Treinamento',
    EAD: 'Treinamento EAD',
    MT: 'Reunião',
  };
  return labels[normalized] || normalized || 'Atividade';
}
function rosterTimeRange(day: RosterDay, fallback?: ZeroLeg): string {
  const start = time((day as any).dutyReport || (day as any).startTime || fallback?.departure || fallback?.presentation, '');
  const end = time((day as any).dutyDebrief || (day as any).endTime || fallback?.arrival, '');
  if (start && end) return `${start} → ${end}`;
  if (start) return `Início ${start}`;
  if (end) return `Fim ${end}`;
  return '';
}
function rosterDaySummary(day: RosterDay, dayEvents: ZeroLeg[]): string {
  const flights = dayEvents.filter((event) => event.kind === 'flight').length;
  const code = rosterCode(day);
  const label = rosterCodeLabel(code);
  const range = rosterTimeRange(day, dayEvents[0]);
  if (flights > 0) {
    const plural = flights === 1 ? 'voo' : 'voos';
    const pieces = [`${flights} ${plural}`];
    if (code) pieces.push(code);
    if (range) pieces.push(range);
    return pieces.join(' · ');
  }
  if (['DR', 'DO', 'DOF', 'DOP', 'OFF', 'FERIAS', 'FÉRIAS'].includes(code)) return label;
  if (['HSB', 'SA', 'RES', 'RSV'].includes(code)) return range ? `${label} · ${range}` : label;
  return range ? `${label} · ${range}` : label;
}
function rosterEventTitle(event: ZeroLeg): string {
  if (event.kind === 'flight') return event.title;
  const code = rosterCode(event.day);
  if (code === 'DR') return 'Descanso';
  return rosterCodeLabel(code);
}
function rosterEventLine(event: ZeroLeg): string {
  if (event.kind === 'flight') return `${event.origin} → ${event.destination} · ${event.timeRange} · ${city(event.origin)} → ${city(event.destination)}`;
  const code = rosterCode(event.day);
  const label = rosterCodeLabel(code);
  const range = rosterTimeRange(event.day, event);
  const base = safe(event.origin || (event.day as any)?.base, 'BSB');
  if (['DR', 'DO', 'DOF', 'DOP', 'OFF', 'FERIAS', 'FÉRIAS'].includes(code)) return `${label} · Sem programação operacional · Base ${base} · ${city(base)}`;
  if (['HSB', 'SA'].includes(code)) return `${label}${range ? ` · ${range}` : ''} · Base ${base} · ${city(base)}`;
  if (['RES', 'RSV'].includes(code)) return `${label}${range ? ` · ${range}` : ''} · Base ${base} · ${city(base)}`;
  return `${label}${range ? ` · ${range}` : ''} · ${city(base)}`;
}

function inlineEventEndDateTime(event: ZeroLeg): Date {
  if (event.canonical?.endDateTime) return new Date(event.canonical.endDateTime);
  const base = new Date(event.date);
  const raw = event.arrival || event.departure || event.presentation;
  const match = String(raw || '').match(/(\d{1,2}):(\d{2})/);
  if (match) base.setHours(Number(match[1]), Number(match[2]), 0, 0);
  else base.setHours(23, 59, 0, 0);
  if (base.getTime() < eventStartDateTime(event).getTime()) base.setDate(base.getDate() + 1);
  return base;
}
function inlineDurationLabel(event: ZeroLeg): string {
  const start = eventStartDateTime(event).getTime();
  const end = inlineEventEndDateTime(event).getTime();
  const total = Math.max(0, Math.round((end - start) / 60000));
  if (!total) return 'Duração a confirmar';
  return `${Math.floor(total / 60)}:${pad2(total % 60)}`;
}
function inlinePresentationSource(event: ZeroLeg): string {
  try { return managedPresentationForEvent(event).source || event.presentationSource || 'Escala publicada'; }
  catch { return event.presentationSource || 'Escala publicada'; }
}
function RosterInlineDetails({ event, setView }: { event: ZeroLeg; setView: (v: ZeroView) => void }) {
  const isFlight = event.kind === 'flight';
  const presentation = event.presentation === 'Conexão/Solo' ? event.departure : event.presentation;
  const base = safe(event.origin || (event.day as any)?.base, 'BSB');
  const route = isFlight ? `${event.origin} → ${event.destination}` : `${base} · ${city(base)}`;
  const date = programDateLabel(event);
  const source = inlinePresentationSource(event);
  const radar = useRadarSnapshot(event);
  const detailStyle = {
    margin: '-8px 0 18px 0',
    border: '1px solid rgba(126, 200, 255, .22)',
    background: 'linear-gradient(180deg, rgba(7, 19, 39, .94), rgba(5, 14, 29, .98))',
    borderRadius: 24,
    padding: 16,
    boxShadow: '0 22px 55px rgba(0,0,0,.28)',
  } as React.CSSProperties;

  return <section className="cz-inline-detail" style={detailStyle}>
    <header className="cz-day-group-head" style={{ marginBottom: 12 }}>
      <span className="cz-day-headline"><strong>{date}</strong>{' · '}{rosterEventTitle(event)}{' · '}{route}</span>
    </header>
    <div className="cz-detail-grid">
      <div><span>Apresentação</span><strong>{safe(presentation, 'A confirmar')}</strong></div>
      <div><span>Decolagem/Início</span><strong>{safe(event.departure, 'A confirmar')}</strong></div>
      <div><span>Chegada/Fim</span><strong>{safe(event.arrival, 'A confirmar')}</strong></div>
      <div><span>Duração</span><strong>{inlineDurationLabel(event)}</strong></div>
      <div><span>Fonte apresentação</span><strong>{source}</strong></div>
      <div><span>Status</span><strong>{safe(event.status, 'Programado')}</strong></div>
      <div><span>Aeronave</span><strong>{safe(event.aircraft, 'A confirmar')}</strong></div>
      <div><span>Matrícula</span><strong>{safe(event.registration, 'A confirmar')}</strong></div>
      <div><span>Portão/Terminal</span><strong>{safe(radar?.gate || event.gate, 'A confirmar')} · {safe(radar?.terminal || event.terminal, 'A confirmar')}</strong></div>
      <div><span>Hotel</span><strong>{safe(event.hotel, '—')}</strong></div>
    </div>
    <RosterInlineWeatherBlock event={event}/>
    {Boolean(event.crew?.length) && <p className="cz-mini-status"><strong>Tripulação:</strong> {event.crew?.slice(0, 8).join(' · ')}</p>}
    {Boolean(event.routine?.length) && <div className="cz-routine-strip">{event.routine?.slice(0, 4).map((item) => <span key={item}>{item}</span>)}</div>}
    <div className="cz-tool-actions" style={{ marginTop: 14 }}>
      <button onClick={() => setView('presentation')}><Clock/> Gerenciador de apresentação</button>
      <button onClick={() => setView('departure')}><Car/> Saída</button>
      <button onClick={() => setView('radar')}><Radar/> Radar</button>
      <button onClick={() => setView('weather')}><CloudSun/> Meteo</button>
      <button onClick={() => setView('map')}><MapIcon/> Mapa do mês</button>
      <button onClick={() => setView('perdiem')}><BriefcaseBusiness/> Diárias</button>
      <button onClick={() => setView('salary')}><DollarSign/> Salário</button>
    </div>
  </section>;
}

function airportIcao(code?: string): string {
  const map: Record<string, string> = {
    BSB:'SBBR', GRU:'SBGR', CGH:'SBSP', GIG:'SBGL', SDU:'SBRJ', CNF:'SBCF', CWB:'SBCT', POA:'SBPA', FOR:'SBFZ', SSA:'SBSV', REC:'SBRF', BEL:'SBBE', MAO:'SBEG', NAT:'SBSG', SLZ:'SBSL', PMW:'SBPJ', CXJ:'SBCX', RAO:'SBRP', VCP:'SBKP', MAB:'SBMA', THE:'SBTE', AJU:'SBAR', VIX:'SBVT', MCZ:'SBMO'
  };
  return map[String(code || '').toUpperCase()] || String(code || 'SB').toUpperCase();
}
function weatherStoredReport(airport: string, kind: 'metar' | 'taf'): string {
  const code = String(airport || '').toUpperCase();
  const icao = airportIcao(code);
  const key = `crewcheck_${kind}_${code}`;
  const stored = storage.get(key, '').trim();
  if (stored && !/TAF tendência operacional/i.test(stored)) return stored;
  const fallback = kind === 'metar'
    ? `${icao} METAR indisponível · aguardando atualização da fonte oficial`
    : `${icao} TAF indisponível · aguardando atualização da fonte oficial`;
  return fallback;
}
function weatherLooksWorse(report: string): boolean {
  const value = String(report || '').toUpperCase();
  return /\b(SPECI|TS|CB|RA|SHRA|FG|BR|BKN00|OVC00|WS|TEMPO|BECMG)\b/.test(value);
}
function compactWeatherLine(event: ZeroLeg): string {
  if (event.kind === 'flight') return `${airportIcao(event.origin)} METAR · ${airportIcao(event.destination)} TAF`;
  const base = safe(event.destination || event.origin || (event.day as any)?.base, 'BSB');
  return `Previsão ${city(base)} · atualização automática`;
}

function LayoverWeatherBadge({ event }: { event: ZeroLeg }) {
  const isStay = event.kind === 'stay' || Boolean(event.hotel);
  const airport = safe(event.destination || event.origin, '');
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  useEffect(() => {
    if (!isStay || !airport) return;
    let alive = true;
    fetchAirportWeatherSnapshot(airport).then((payload) => { if (alive) setWeather(payload); });
    return () => { alive = false; };
  }, [isStay, airport, event.id]);
  if (!isStay) return null;
  const condition = weather?.condition || 'Previsão local';
  const temp = weatherTemperatureText(weather?.temperature);
  const rain = Number.isFinite(Number(weather?.rainChance)) ? `${Math.round(Number(weather?.rainChance))}% chuva` : 'Chuva a confirmar';
  const wind = Number.isFinite(Number(weather?.wind)) ? `vento ${Math.round(Number(weather?.wind))} km/h` : 'vento a confirmar';
  return <div className="cz-layover-weather-badge" onClick={(click) => click.stopPropagation()}>
    <CloudSun size={16}/>
    <span><strong>{temp} · {condition}</strong><small>{city(airport)} · {rain} · {wind}</small></span>
  </div>;
}

function RosterEventChips({ event }: { event: ZeroLeg }) {
  const presentation = event.presentation === 'Conexão/Solo' ? event.departure : event.presentation;
  const isStay = event.kind === 'stay' || Boolean(event.hotel);
  return <div className="cz-roster-linked-chips" onClick={(click) => click.stopPropagation()}>
    <span><Clock size={14}/> Apresentação {safe(presentation, 'A confirmar')}</span>
    {isStay && <span><Hotel size={14}/> {safe(event.hotel, `Hotel em ${city(event.destination || event.origin)}`)}</span>}
    <span><CloudSun size={14}/> {compactWeatherLine(event)}</span>
    {event.kind === 'flight' && <span><Radar size={14}/> Alertas até pouso</span>}
  </div>;
}
function RosterInlineWeatherBlock({ event }: { event: ZeroLeg }) {
  const isFlight = event.kind === 'flight';
  const cityTarget = city(event.destination || event.origin);
  return <section className="cz-weather-inline">
    <header><CloudSun/><strong>{isFlight ? 'Meteorologia do voo' : 'Meteorologia do pernoite'}</strong><span>{cityTarget}</span></header>
    {isFlight ? <div className="cz-weather-metar-grid">
      <article><small>Origem · METAR</small><strong>{airportIcao(event.origin)}</strong><p>{weatherStoredReport(event.origin, 'metar')}</p></article>
      <article><small>Destino · TAF chegada</small><strong>{airportIcao(event.destination)}</strong><p>{weatherStoredReport(event.destination, 'taf')}</p></article>
    </div> : <div className="cz-weather-metar-grid">
      <article><small>Hotel/pernoite</small><strong>{safe(event.hotel, cityTarget)}</strong><p>Previsão local, chuva, vento e temperatura para descanso, deslocamento e apresentação.</p></article>
      <article><small>Apresentação</small><strong>{safe(event.presentation, 'A confirmar')}</strong><p>Use o Gerenciador de Apresentação para ajustar hotel, horário e padrão aprendido.</p></article>
    </div>}
    <footer><span>Notifica piora somente em novo METAR ou SPECI até o pouso.</span></footer>
  </section>;
}
function timelineStateClass(event: ZeroLeg): string {
  const now = new Date().getTime();
  const start = eventStartDateTime(event).getTime();
  const end = eventEndDateTime(event).getTime();
  if (now >= start && now <= end) return 'now';
  if (start > now) return 'future';
  return 'past';
}
function financeSnapshot(roster: CrewRoster) {
  const events = buildLegs(roster);
  const perdiem = calculatePerDiem(events, roster);
  const salary = calculateSalary(events, roster);
  return { perdiem, salary };
}
function notifyCrewCheck(title: string, body: string) {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(title, { body });
      return;
    }
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
  } catch {}
  toast.message(`${title}: ${body}`);
}
function useWeatherLandingMonitor(event: ZeroLeg) {
  useEffect(() => {
    if (!event || event.placeholder || event.kind !== 'flight') return;
    if (storage.get('crewcheck_weather_landing_alerts', '1') === '0') return;
    const airport = String(event.destination || '').toUpperCase();
    if (!airport) return;
    const signatureKey = `crewcheck_weather_signature_${airport}_${event.id}`;
    const check = () => {
      const report = storage.get(`crewcheck_latest_weather_report_${airport}`, '');
      const upper = String(report || '').toUpperCase();
      if (!upper.startsWith('METAR') && !upper.startsWith('SPECI')) return;
      const signature = `${airport}|${upper}`;
      const previous = storage.get(signatureKey, '');
      if (previous && previous !== signature && weatherLooksWorse(upper)) {
        notifyCrewCheck('Meteorologia mudou', `${airport}: novo ${upper.startsWith('SPECI') ? 'SPECI' : 'METAR'} com atenção operacional até o pouso.`);
      }
      storage.set(signatureKey, signature);
    };
    try { navigator.geolocation?.getCurrentPosition((pos) => storage.set('crewcheck_last_geo', `${pos.coords.latitude},${pos.coords.longitude}`), () => {}, { enableHighAccuracy: false, timeout: 2500 }); } catch {}
    check();
    const timer = window.setInterval(check, 60000);
    return () => window.clearInterval(timer);
  }, [event?.id, event?.destination, event?.kind]);
}

function Roster({ roster, events, setView }: { roster: CrewRoster; events: ZeroLeg[]; setView: (v: ZeroView) => void }) {
  const normalizedRoster = normalizeRosterDays(roster);
  const days = Array.isArray(normalizedRoster.days) ? normalizedRoster.days : [];
  const groupedEvents = days
    .map((day) => ({ day, events: events.filter((event) => event.day.date === day.date) }))
    .filter((group) => group.events.length);
  const first = currentDayAnchor(events);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const hasRoster = days.length > 0;
  const finance = financeSnapshot(normalizedRoster);
  const todayKey = todayRosterKey();
  const todayGroup = groupedEvents.find((group) => dateChip(parseDate(group.day)) === todayKey);
  function openToday() {
    const firstToday = todayGroup?.events?.[0];
    if (!firstToday) {
      toast.info('Não há programação publicada para hoje nesta escala.');
      return;
    }
    setExpandedId(firstToday.id);
    requestAnimationFrame(() => document.querySelector(`[data-roster-day="${todayKey}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  return <><Brand back/><section className="cz-panel-head"><h1>Escala completa</h1><p>{safe(roster.crewName, 'Tripulante')} · {hasRoster ? monthLong(normalizedRoster) : 'sem escala real'} · Base {safe(roster.base, '—')}</p></section>{hasRoster ? <><section className="cz-roster-date"><span>{weekday(first.date)}</span><strong>{pad2(first.date.getDate())}</strong><em>{new Intl.DateTimeFormat('pt-BR',{month:'short'}).format(first.date).replace('.','').toUpperCase()}</em><b>{first.date.toDateString() === new Date().toDateString() ? 'Hoje' : 'Próximo evento'}</b></section><section className="cz-money-row"><div><CalendarDays/><span>Dias</span><strong>{days.length}</strong></div><div><Plane/><span>Voos</span><strong>{events.filter(e => e.kind === 'flight').length}</strong></div><div onClick={() => setView('perdiem')}><BriefcaseBusiness/><span>Diárias</span><strong>{finance.perdiem.currencyCount > 1 ? finance.perdiem.currencyCount + ' moedas' : finance.perdiem.currencySummary || 'Sem previsão'}</strong></div><div onClick={() => setView('salary')}><DollarSign/><span>Salário</span><strong>{moneyBRL(finance.salary.gross)}</strong></div></section><section className="cz-roster-actions"><button onClick={openToday}><CalendarDays/> Hoje</button><button onClick={() => setView('compare')}><GitCompareArrows/> Comparar</button><button onClick={() => setView('import')}><Upload/> Importar PDF</button><button onClick={() => setView('map')}><MapIcon/> Mapa do mês</button><button onClick={() => setView('exports')}><Share2/> Exportar</button><button onClick={() => setView('calendar')}><CalendarDays/> Calendário</button></section><section className="cz-stack-list">{groupedEvents.map(({ day, events: dayEvents }) => { const d = parseDate(day); return <div className="cz-day-group cz-day-linked" data-roster-day={dateChip(d)} key={day.date}><header className="cz-day-group-head"><span className="cz-day-headline"><strong>{weekday(d)} {pad2(d.getDate())}/{pad2(d.getMonth()+1)}</strong>{' · '}{rosterDaySummary(day, dayEvents)}</span></header>{dayEvents.map(e => <div className="cz-roster-expand-wrap" key={e.id}><article className={`cz-roster-card compact ${e.kind === 'stay' ? 'stay' : ''} ${e.kind === 'flight' ? flightWorkClass(e) : ''} ${timelineStateClass(e)} ${expandedId === e.id ? 'expanded' : ''}`} onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}><div className="cz-roster-main"><span className="cz-roster-icon">{e.kind === 'flight' ? <Plane/> : e.kind === 'stay' ? <Hotel/> : <BriefcaseBusiness/>}</span><div className="cz-roster-copy"><h3>{rosterEventTitle(e)}</h3><p>{rosterEventLine(e)}</p></div><ChevronDown className="cz-roster-chevron"/></div><RosterEventChips event={e}/><LayoverWeatherBadge event={e}/></article>{expandedId === e.id && <RosterInlineDetails event={e} setView={setView}/>}</div>)}</div>; })}</section><section className="cz-complete-days"><h2>Todos os dias publicados</h2>{days.map((day, index) => { const dayEvents = events.filter(e => e.day.date === day.date); const d = parseDate(day); return <article key={`${day.date}-${index}`} onClick={() => dayEvents[0] && setExpandedId(expandedId === dayEvents[0].id ? null : dayEvents[0].id)}><header><strong>{weekday(d)} {pad2(d.getDate())}/{pad2(d.getMonth()+1)}</strong><span>{' · '}{rosterCodeLabel(rosterCode(day))}</span></header><p>{rosterDaySummary(day, dayEvents)}</p><small>{dayEvents.filter(e => e.kind === 'flight').length ? `Voos ${dayEvents.filter(e => e.kind === 'flight').length}` : 'Dia sem voo operacional'}</small></article>; })}</section></> : <article className="cz-empty-real"><Upload/><h2>Escala real não carregada</h2><p>Os dados fictícios foram removidos. Use o botão de importar para carregar o PDF oficial de julho e abrir os detalhes reais.</p><button onClick={() => setView('import')}>Importar escala PDF</button></article>}</>;
}

function comparisonEventSummary(event: ComparableRosterEvent | null): string {
  if (!event) return 'Não consta';
  const time = event.departure || event.arrival
    ? (event.departure || '—') + ' → ' + (event.arrival || '—')
    : 'sem horário publicado';
  if (event.kind === 'flight') {
    return (event.flightNumber || 'Voo') + ' · ' + (event.workType || 'função pendente') + ' · '
      + (event.origin || '—') + ' → ' + (event.destination || '—') + ' · ' + time;
  }
  return (event.pairingCode || event.dayType || 'Atividade') + ' · ' + time;
}

function comparisonChangeLabel(change: RosterChange): string {
  if (change.kind === 'added') return 'Adicionado';
  if (change.kind === 'removed') return 'Retirado';
  if (change.restImpact === 'lost') return 'Folga retirada';
  if (change.restImpact === 'gained') return 'Folga adicionada';
  return 'Alterado';
}

function CompareRosterView({ bundle, onUpload }: { bundle: BundleState; onUpload: () => void }) {
  const [planned, setPlanned] = useState<PlannedRosterSnapshot | null>(() => loadPlannedRoster());
  const [filter, setFilter] = useState<'all' | 'financial' | 'days_off'>('all');
  const hasCurrent = Array.isArray(bundle.roster.days) && bundle.roster.days.length > 0;
  const comparison = useMemo(
    () => planned && hasCurrent ? compareRosters(planned.roster, bundle.roster) : null,
    [planned, bundle.roster, hasCurrent]
  );
  const financial = useMemo(() => {
    if (!planned || !comparison?.summary.periodMatches) return null;
    const before = financeSnapshot(planned.roster);
    const after = financeSnapshot(bundle.roster);
    const beforeVariable = before.salary.production + before.salary.reserve + before.salary.standby
      + before.salary.chief + before.salary.instructorPay;
    const afterVariable = after.salary.production + after.salary.reserve + after.salary.standby
      + after.salary.chief + after.salary.instructorPay;
    const currencies = Array.from(new Set([
      ...Object.keys(before.perdiem.totalsByCurrency),
      ...Object.keys(after.perdiem.totalsByCurrency),
    ])) as PerDiemCurrency[];
    const perDiemDelta = currencies
      .map((currency) => ({
        currency,
        value: Number(after.perdiem.totalsByCurrency[currency] || 0)
          - Number(before.perdiem.totalsByCurrency[currency] || 0),
      }))
      .filter((item) => Math.abs(item.value) >= 0.005);
    return {
      variableDelta: afterVariable - beforeVariable,
      perDiemDelta,
      salaryReady: !before.salary.config.requiresManualFunction && !after.salary.config.requiresManualFunction,
    };
  }, [planned, bundle.roster, comparison?.summary.periodMatches]);

  function markCurrentAsPlanned() {
    if (!hasCurrent) return;
    const snapshot = savePlannedRoster(bundle.roster, bundle.source);
    setPlanned(snapshot);
    toast.success('Escala atual marcada como planejada. Importe a próxima versão para comparar.');
  }

  function resetPlanned() {
    if (!window.confirm('Remover a referência planejada deste dispositivo? A escala atual continuará ativa.')) return;
    clearPlannedRoster();
    setPlanned(null);
    toast.success('Referência planejada removida.');
  }

  if (!hasCurrent) {
    return <><Brand back/><section className="cz-panel-head"><h1>Planejado x atual</h1><p>Compare versões da mesma escala sem misturar períodos.</p></section><article className="cz-empty-real"><GitCompareArrows/><h2>Importe a primeira escala</h2><p>Ela poderá ser marcada como planejada antes da próxima publicação.</p><button onClick={onUpload}>Importar PDF</button></article></>;
  }

  if (!planned) {
    return <><Brand back/><section className="cz-panel-head"><h1>Planejado x atual</h1><p>Guarde uma referência e compare a próxima publicação do mesmo mês.</p></section><section className="cz-toolbox"><h2>Definir a referência planejada</h2><p>A escala ativa {rosterPeriodLabel(bundle.roster)} será guardada neste dispositivo. Na próxima importação do mesmo período, o CrewCheck mostrará mudanças de horários, voos, OP/PS, atividades e folgas.</p><div className="cz-tool-actions"><button onClick={markCurrentAsPlanned}><Save/> Marcar atual como planejada</button><button onClick={onUpload}><Upload/> Importar nova versão</button></div></section></>;
  }

  const filteredChanges = (comparison?.changes || []).filter((change) => {
    if (filter === 'financial') return change.affectsPay;
    if (filter === 'days_off') return change.restImpact !== 'none';
    return true;
  });
  const capturedDate = new Date(planned.capturedAt);
  const capturedAt = Number.isFinite(capturedDate.getTime())
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(capturedDate)
    : 'data não informada';
  const perDiemDeltaText = financial?.perDiemDelta.length
    ? financial.perDiemDelta.map((item) => moneyCurrency(item.value, item.currency)).join(' · ')
    : 'Sem diferença';

  return <><Brand back/>
    <section className="cz-panel-head">
      <h1>Planejado x atual</h1>
      <p>Referência {comparison?.plannedPeriod || '—'} comparada com a escala ativa {comparison?.currentPeriod || '—'}.</p>
    </section>
    {!comparison?.summary.periodMatches && <section className="cz-toolbox cz-compare-warning">
      <h2>Períodos diferentes</h2>
      <p>A referência é {comparison?.plannedPeriod}; a escala ativa é {comparison?.currentPeriod}. O CrewCheck não cruza meses diferentes para evitar alertas e valores incorretos.</p>
      <div className="cz-tool-actions"><button onClick={markCurrentAsPlanned}><Save/> Usar a atual como planejada</button><button onClick={onUpload}><Upload/> Importar outra versão</button><button onClick={resetPlanned}><RotateCcw/> Remover referência</button></div>
    </section>}
    {comparison?.summary.periodMatches && <>
      <section className="cz-compare-source">
        <div><span>Planejada</span><strong>{planned.source}</strong><small>Guardada em {capturedAt}</small></div>
        <GitCompareArrows/>
        <div><span>Atual importada</span><strong>{bundle.source}</strong><small>Não é marcada como realizada sem espelho de voo.</small></div>
      </section>
      <section className="cz-finance-grid cz-compare-kpis">
        <KpiCard icon={CalendarDays} title="Dias alterados" value={String(comparison.summary.changedDays)} detail={comparison.summary.unchanged ? 'Nenhuma diferença' : 'no período comparado'}/>
        <KpiCard icon={Plane} title="Incluídos / retirados" value={comparison.summary.addedEvents + ' / ' + comparison.summary.removedEvents} detail={comparison.summary.changedEvents + ' evento(s) alterado(s)'}/>
        <KpiCard icon={Clock} title="Horários" value={String(comparison.summary.timeChanges)} detail={comparison.summary.routeChanges + ' mudança(s) de rota'}/>
        <KpiCard icon={DollarSign} title="Revisar valores" value={String(comparison.summary.financialReviewCount)} detail={comparison.summary.workTypeChanges + ' mudança(s) OP/PS'}/>
      </section>
      {(comparison.summary.lostDaysOff.length > 0 || comparison.summary.gainedDaysOff.length > 0) && <section className="cz-compare-days-off">
        {comparison.summary.lostDaysOff.length > 0 && <p className="lost"><AlertTriangle/><span><strong>Folgas retiradas</strong>{comparison.summary.lostDaysOff.join(' · ')}</span></p>}
        {comparison.summary.gainedDaysOff.length > 0 && <p className="gained"><ShieldCheck/><span><strong>Folgas adicionadas</strong>{comparison.summary.gainedDaysOff.join(' · ')}</span></p>}
      </section>}
      <section className="cz-finance-table cz-compare-financial">
        <h2>Possível impacto financeiro</h2>
        <div className="cz-finance-row"><span>Parcela variável</span><strong>Diferença prevista</strong><small>KM diurno/noturno, reserva, sobreaviso e adicionais com as regras atuais</small><b>{financial?.salaryReady ? moneyBRL(financial.variableDelta) : 'Função pendente'}</b></div>
        <div className="cz-finance-row"><span>Diárias</span><strong>Diferença por moeda</strong><small>Sem somar moedas diferentes e sem presumir câmbio</small><b>{perDiemDeltaText}</b></div>
      </section>
      <div className="cz-compare-tabs" role="tablist" aria-label="Filtrar alterações">
        <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>Todas</button>
        <button className={filter === 'financial' ? 'active' : ''} onClick={() => setFilter('financial')}>Revisar valores</button>
        <button className={filter === 'days_off' ? 'active' : ''} onClick={() => setFilter('days_off')}>Folgas</button>
      </div>
      <section className="cz-compare-list">
        {filteredChanges.map((change) => <article className={'cz-compare-change ' + change.kind + (change.restImpact === 'lost' ? ' lost-rest' : '')} key={change.id}>
          <header><span>{change.dateLabel}</span><strong>{change.title}</strong><em>{comparisonChangeLabel(change)}</em></header>
          <p>{change.descriptions.join(' · ')}</p>
          <div><span><b>Planejado</b>{comparisonEventSummary(change.planned)}</span><span><b>Atual</b>{comparisonEventSummary(change.current)}</span></div>
          {change.affectsPay && <small><DollarSign/> Conferir salário, produtividade ou diária</small>}
        </article>)}
        {!filteredChanges.length && <article className="cz-empty-real"><ShieldCheck/><h2>{comparison.summary.unchanged ? 'Escalas idênticas' : 'Nada neste filtro'}</h2><p>{comparison.summary.unchanged ? 'Nenhuma mudança foi encontrada entre a referência planejada e a escala atual.' : 'As diferenças existem, mas não pertencem ao filtro selecionado.'}</p></article>}
      </section>
      <section className="cz-toolbox">
        <h2>Ações</h2>
        <p>A comparação usa os PDFs importados. Para transformar a coluna atual em “realizada”, será necessário confrontá-la com o espelho de voo.</p>
        <div className="cz-tool-actions"><button onClick={onUpload}><Upload/> Importar nova versão</button><button onClick={markCurrentAsPlanned}><Save/> Tornar atual a planejada</button><button onClick={resetPlanned}><RotateCcw/> Remover referência</button></div>
      </section>
    </>}
  </>;
}

function Alerts({ compliance }: { compliance: ComplianceResult | null }) {
  const list = actionableComplianceAlerts(compliance).slice(0, 12);
  return <><Brand back/><section className="cz-panel-head"><h1>Irregularidades e alertas</h1><p>RBAC 117, ACT, repouso, jornada, sobreaviso, reserva e acionamentos. Sem alertas fictícios.</p></section>{list.length ? <section className="cz-alert-stack">{list.map((a: any, idx: number) => <article className={a.severity === 'error' ? 'danger' : 'warn'} key={`${a.title}-${idx}`}><AlertTriangle/><div><h2>{a.title}</h2><p>{a.description}</p><span>{a.severity === 'error' ? 'Confirmada' : 'Atenção'}</span><b>Confiança: {a.severity === 'error' ? 'alta' : 'média'}</b></div><ChevronRight/></article>)}</section> : <article className="cz-empty-real"><ShieldCheck/><h2>Nenhuma irregularidade confirmada</h2><p>Carregue a escala real para que o motor regulatório refaça a análise completa.</p></article>}<article className="cz-alert-detail"><h2>Detalhes regulatórios <b>{list.length ? 'Ativo' : 'Aguardando escala'}</b></h2><div><p><strong>O que o sistema avalia</strong>Jornada, repouso, madrugadas, limites, reserva, sobreaviso, acionamento, pernoite e alterações.</p><p><strong>Dados usados</strong>Somente a escala importada ou sincronizada. Dados demonstrativos foram removidos.</p></div><footer><button>Ensinar falso positivo</button><button>Ver base regulatória</button></footer></article></>;
}
function routeDurationMinutes(route: RoutePreviewInfo | null): number {
  const text = String(route?.durationInTrafficText || route?.durationText || '').toLowerCase();
  const hours = Number(text.match(/(\d+(?:[.,]\d+)?)\s*h/)?.[1]?.replace(',', '.') || 0);
  const minutes = Number(text.match(/(\d+)\s*min/)?.[1] || 0);
  return Math.round(hours * 60 + minutes);
}
function eventClockDate(event: ZeroLeg, clock: string): Date {
  const base = eventStartDateTime(event);
  const match = String(clock || '').match(/(\d{1,2}):(\d{2})/);
  if (!match) return base;
  const target = new Date(base);
  target.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return target;
}
function Departure({ event }: { event: ZeroLeg }) {
  const departureModes = [
    { id: 'automatic', label: 'Automático', detail: 'Meio mais rápido', icon: Navigation },
    { id: 'car-flight', label: 'Carro + voo', detail: 'Casa até o aeroporto', icon: Car },
    { id: 'uber-flight', label: 'Uber/99 + voo', detail: 'Corrida até o aeroporto', icon: Car },
    { id: 'transit-flight', label: 'Transporte + voo', detail: 'Etapas até o aeroporto', icon: MapIcon },
    { id: 'driving', label: 'Carro', detail: 'Rota rodoviária', icon: Car },
    { id: 'uber', label: 'Uber/99', detail: 'Estimativa e chamada', icon: Car },
    { id: 'transit', label: 'Transporte público', detail: 'Itinerário detalhado', icon: MapIcon },
  ];
  const [mode, setMode] = useState(() => storage.get('crewcheck_departure_mode', 'automatic'));
  const [margin, setMargin] = useState(() => Number(storage.get('crewcheck_departure_margin', '25')) || 25);
  const [stopAlerts, setStopAlerts] = useState(() => storage.get('crewcheck_transit_stop_alerts', '0') === '1');
  const [route, setRoute] = useState<RoutePreviewInfo | null>(null);
  if (event.placeholder) return <><Brand back/><article className="cz-empty-real"><Car/><h2>Saída Inteligente aguardando escala real</h2><p>Importe o PDF para calcular saída com origem/hotel, aeroporto, mapa e trânsito.</p></article></>;
  const travelMinutes = routeDurationMinutes(route);
  const presentationDate = eventClockDate(event, event.presentation);
  const leaveDate = travelMinutes ? new Date(presentationDate.getTime() - (travelMinutes + margin) * 60000) : null;
  const leaveLabel = leaveDate ? new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(leaveDate) : 'Calcular';
  const modeLabel = departureModes.find((item) => item.id === mode)?.label || 'Automático';
  function chooseMode(next: string) { setMode(next); storage.set('crewcheck_departure_mode', next); }
  function chooseMargin(next: number) { setMargin(next); storage.set('crewcheck_departure_margin', String(next)); }
  return <><Brand back/><section className="cz-departure"><article className="cz-depart-hero"><span>SAÍDA PREVISTA</span><strong>{leaveLabel}</strong><em>{travelMinutes ? 'ATUALIZADA' : 'CALCULANDO ROTA'}</em><h2>{eventRouteOrigin(event)} → {event.origin}</h2><p>{modeLabel} · {travelMinutes ? `${travelMinutes} min de deslocamento` : 'aguardando trânsito'} · margem {margin} min</p></article><div className="cz-depart-kpis"><div><Navigation/>Sair às<strong>{leaveLabel}</strong></div><div><Clock/>Deslocamento<strong>{travelMinutes ? `${travelMinutes} min` : 'Calculando'}</strong></div><div><ShieldCheck/>Margem<strong>{margin} min</strong></div></div><section className="cz-toolbox"><h2>Como você vai sair</h2><p>Escolha o trajeto completo. Nos modos combinados, o trecho terrestre termina no aeroporto da programação real.</p><div className="cc-departure-mode-grid">{departureModes.map(({ id, label, detail, icon: Icon }) => <button key={id} className={mode === id ? 'active' : ''} onClick={() => chooseMode(id)}><Icon/><span><strong>{label}</strong><small>{detail}</small></span></button>)}</div>{mode.includes('transit') && <label className="cc-stop-alert"><input type="checkbox" checked={stopAlerts} onChange={(event) => { setStopAlerts(event.target.checked); storage.set('crewcheck_transit_stop_alerts', event.target.checked ? '1' : '0'); }}/><span><strong>Avisar o ponto de descida</strong><small>Notificação local; Telegram será usado quando vinculado e o navegador permitir localização em segundo plano.</small></span></label>}<div className="cz-tool-actions cz-margin-actions"><span>Margem operacional:</span>{[15, 25, 35, 45].map((value) => <button className={margin === value ? 'active' : ''} key={value} onClick={() => chooseMargin(value)}>{value} min</button>)}</div></section><GoogleMapsRoutePreview event={event} mode={mode} onRoute={setRoute}/></section></>;
}

function MonthlyMapView({ events, actions }: { events: ZeroLeg[]; actions: QuickActions }) {
  const data = monthlyRouteData(events);
  const destinations = monthlyMapDestinations(events);
  const currentMonth = events.find((event) => !event.placeholder)?.date || new Date();
  const query = monthlyMapQuery(destinations);
  const embedUrl = buildGoogleMapsEmbedSearchUrl(query);
  const staticMapUrl = buildGoogleStaticMonthlyMapUrl(destinations);
  return <><Brand back/><section className="cz-panel-head"><h1>Mapa do mês</h1><p>Disponível dentro de Escala · {new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(currentMonth)} · {destinations.length} cidade(s) · {data.totalKm.toLocaleString('pt-BR')} km estimados</p></section><section className="cz-month-map-card cz-google-month-card"><header><div><strong>Destinos da escala vigente</strong><span>Cidades do mês marcadas a partir da escala importada.</span></div><div className="cz-month-map-actions"><button onClick={() => openMonthlyGoogleMap(destinations)}><MapIcon/> Abrir mapa</button><button onClick={actions.sharePdf}><Share2/> Compartilhar PDF</button><button onClick={actions.email}><Mail/> Enviar por e-mail</button></div></header><div className="cz-google-map-preview cz-world-map">{staticMapUrl ? <img className="cz-static-map-img" src={staticMapUrl} alt="Mapa estático dos destinos do mês" loading="lazy"/> : embedUrl ? <iframe title="Mapa do mês pelo Google Maps" loading="lazy" src={embedUrl} referrerPolicy="no-referrer-when-downgrade"/> : <div className="cz-map-fallback"><Globe2/><strong>Mapa aguardando configuração.</strong><span>Use Abrir mapa para visualizar os destinos da escala vigente.</span></div>}</div><div className="cz-destination-strip">{destinations.slice(0, 18).map((point) => <span key={point.code}><b>{point.code}</b>{city(point.code)} · {point.count}</span>)}</div>{!destinations.length && <article className="cz-empty-real"><MapIcon/><h2>Sem destinos mapeáveis</h2><p>Importe a escala oficial para exibir e compartilhar as cidades do mês.</p></article>}</section></>;
}

function CarView({ event }: { event: ZeroLeg }) {
  const [parking, setParking] = useState<ParkingPosition | null>(() => loadCarParkingPosition());
  const [busy, setBusy] = useState(false);
  const [routeOrigin, setRouteOrigin] = useState(() => storage.get('crewcheck_last_geo', ''));
  const [details, setDetails] = useState(() => ({
    level: loadCarParkingPosition()?.level || '',
    spot: loadCarParkingPosition()?.spot || '',
    reference: loadCarParkingPosition()?.reference || loadCarParkingPosition()?.label || '',
    notes: loadCarParkingPosition()?.notes || '',
  }));

  useEffect(() => {
    getParkingPosition().then((payload: any) => {
      const cloud = payload?.position;
      if (!cloud || !Number.isFinite(Number(cloud.lat)) || !Number.isFinite(Number(cloud.lng))) return;
      const restored: ParkingPosition = { ...cloud, lat: Number(cloud.lat), lng: Number(cloud.lng), savedAt: cloud.savedAt || new Date().toISOString(), localOnly: Boolean(payload.localOnly) };
      saveCarParkingPosition(restored);
      setParking(restored);
      setDetails({ level: restored.level || '', spot: restored.spot || '', reference: restored.reference || restored.label || '', notes: restored.notes || '' });
    }).catch(() => undefined);
  }, []);

  async function markCar() {
    setBusy(true);
    try {
      const position = await getCurrentGeoPosition();
      const saved: ParkingPosition = { lat: position.lat, lng: position.lng, accuracy: position.accuracy, level: details.level.trim(), spot: details.spot.trim(), reference: details.reference.trim(), notes: details.notes.trim(), label: details.reference.trim(), savedAt: new Date().toISOString(), localOnly: true };
      setRouteOrigin(coordsLabel(position.lat, position.lng));
      const synced = await saveParkingPosition(saved).catch(() => ({ localOnly: true }));
      const next = { ...saved, localOnly: Boolean((synced as any)?.localOnly) };
      saveCarParkingPosition(next);
      setParking(next);
      toast.success(next.localOnly ? 'Carro marcado neste dispositivo. A nuvem sincronizará quando voltar.' : 'Carro marcado e sincronizado.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não consegui marcar a posição.');
    } finally {
      setBusy(false);
    }
  }
  async function updateWalkingOrigin() {
    if (!parking) { toast.info('Marque primeiro a posição atual do carro.'); return; }
    try {
      const current = await getCurrentGeoPosition();
      setRouteOrigin(coordsLabel(current.lat, current.lng));
      toast.success('Rota a pé atualizada dentro do CrewCheck.');
    } catch {
      toast.message('Usando a última localização disponível para a rota.');
    }
  }
  async function resetCar() {
    clearCarParkingPosition();
    setParking(null);
    await deleteParkingPosition().catch(() => undefined);
    toast.success('Posição do carro resetada. Você pode marcar uma nova.');
  }
  function parkingShareText() {
    if (!parking) return '';
    const detail = [parking.level && `nível ${parking.level}`, parking.spot && `vaga ${parking.spot}`, parking.reference, parking.notes].filter(Boolean).join(' · ');
    return `Meu carro está marcado aqui${detail ? ` (${detail})` : ''}: ${buildGoogleMapsSearchUrl(parking.lat, parking.lng)}`;
  }
  async function shareParkingNative() {
    const text = parkingShareText();
    if (!text) return;
    if (navigator.share) {
      try { await navigator.share({ title: 'Localização do meu carro', text }); return; } catch {}
    }
    try { await navigator.clipboard.writeText(text); toast.success('Localização copiada para compartilhar.'); } catch { toast.error('Não consegui abrir o compartilhamento.'); }
  }
  function shareParkingWhatsApp() { const text = parkingShareText(); if (text) window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer'); }
  function shareParkingTelegram() { const text = parkingShareText(); if (text) window.open(`https://t.me/share/url?url=${encodeURIComponent(buildGoogleMapsSearchUrl(parking!.lat, parking!.lng))}&text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer'); }
  const savedDate = parking ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(parking.savedAt)) : '';
  const destination = parking ? coordsLabel(parking.lat, parking.lng) : '';
  const mapUrl = parking ? (routeOrigin ? buildGoogleMapsEmbedDirectionsUrl(routeOrigin, destination, 'walking') : buildGoogleMapsEmbedSearchUrl(destination)) : '';
  return <><Brand back/><section className="cz-panel-head"><h1>Meu carro</h1><p>Marque a vaga, guarde os detalhes e volte a pé pelo mapa interno do CrewCheck.</p></section><section className="cz-car-grid cz-parking-grid">
    <article className="cz-car-card cz-parking-editor"><header><span className="cz-card-icon"><Car/></span><div><small>MARCAÇÃO DE ESTACIONAMENTO</small><h2>{parking ? 'Carro marcado' : 'Onde você estacionou?'}</h2><p>{parking ? `Marcado em ${savedDate}${parking.localOnly ? ' · salvo localmente' : ' · sincronizado'}` : 'Preencha os detalhes e use sua localização atual.'}</p></div></header><div className="cz-parking-form"><label><span>Nível / piso</span><input value={details.level} onChange={(e) => setDetails({ ...details, level: e.target.value })} placeholder="Ex.: G2"/></label><label><span>Vaga</span><input value={details.spot} onChange={(e) => setDetails({ ...details, spot: e.target.value })} placeholder="Ex.: B-214"/></label><label className="wide"><span>Ponto de referência</span><input value={details.reference} onChange={(e) => setDetails({ ...details, reference: e.target.value })} placeholder="Ex.: próximo ao elevador azul"/></label><label className="wide"><span>Observações</span><textarea value={details.notes} onChange={(e) => setDetails({ ...details, notes: e.target.value })} placeholder="Setor, entrada, foto mental ou outra indicação" rows={3}/></label></div><div className="cz-tool-actions cz-parking-primary-actions"><button className="primary" onClick={markCar} disabled={busy}><LocateFixed/> {busy ? 'Obtendo localização…' : parking ? 'Atualizar marcação' : 'Marcar localização do carro'}</button>{parking && <button className="danger" onClick={resetCar}><Trash2/> Apagar marcação</button>}</div></article>
    {parking && <article className="cz-car-card cz-parking-map-card"><header><div><Navigation/><span><small>ROTA A PÉ</small><h2>Voltar ao carro</h2></span></div><strong>{parking.accuracy ? `Precisão ~${Math.round(parking.accuracy)} m` : 'Ponto salvo'}</strong></header><div className="cz-google-map-preview cz-parking-map">{mapUrl ? <iframe title="Rota a pé até o carro" loading="lazy" src={mapUrl} referrerPolicy="no-referrer-when-downgrade"/> : <div className="cz-map-fallback"><MapIcon/><strong>Mapa interno</strong><span>Atualize sua localização para traçar a rota a pé.</span></div>}</div><div className="cz-parking-data"><span><b>Nível</b>{safe(parking.level, 'Não informado')}</span><span><b>Vaga</b>{safe(parking.spot, 'Não informada')}</span><span><b>Referência</b>{safe(parking.reference || parking.label, 'Sem referência')}</span><span><b>Coordenadas</b>{destination}</span></div><div className="cz-tool-actions"><button className="primary" onClick={updateWalkingOrigin}><Navigation/> Atualizar rota a pé</button><button onClick={() => window.open(buildGoogleMapsWalkingDestinationUrl(parking.lat, parking.lng), '_blank', 'noopener,noreferrer')}><MapIcon/> Google Maps</button></div></article>}
    {parking && <article className="cz-car-card cz-parking-share"><Share2/><h2>Compartilhar marcação</h2><p>Envie a localização com vaga e referência para quem você escolher.</p><div className="cz-tool-actions"><button onClick={shareParkingWhatsApp}><Share2/> WhatsApp</button><button onClick={shareParkingTelegram}><Send/> Telegram</button><button onClick={shareParkingNative}><Share2/> Outros apps</button></div></article>}
    <article className="cz-car-card"><ShieldCheck/><h2>Privacidade</h2><p>A marcação é local-first e o CrewCheck não rastreia você em segundo plano. A sincronização usa somente o ponto salvo e os detalhes informados.</p><small>A permissão de localização é solicitada apenas ao marcar ou atualizar a rota.</small></article><article className="cz-car-card"><Plane/><h2>Operação</h2><p>{event.placeholder ? 'Aguardando escala real para integrar aeroporto/hotel.' : `Próxima origem: ${event.origin} · ${city(event.origin)}`}</p><div className="cz-tool-actions"><button onClick={() => window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'departure' }))}><Car/> Saída Inteligente</button><button onClick={() => window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'map' }))}><Globe2/> Mapa do mês</button></div></article></section></>;
}

function IFlightPushView({ actions }: { actions: QuickActions }) {
  const [step, setStep] = useState<'ready' | 'portal' | 'local-time' | 'download'>('ready');
  function openPortal() {
    setStep('portal');
    window.open('https://iflightla.ibsplc.aero/iflight-cwp/web/getMainPage', 'crewcheck-iflight', 'noopener,noreferrer');
  }
  function importDownloaded() { setStep('download'); actions.upload(); }
  const steps = [
    ['portal', 'Login e MFA', 'Digite diretamente no portal corporativo.'],
    ['local-time', 'Calendário em LT', 'Confirme Local Time antes de gerar o arquivo.'],
    ['download', 'Importar arquivo', 'O parser canônico processa o PDF autorizado.'],
  ] as const;
  return <><Brand back/><section className="cz-panel-head"><h1>Importar do iFlight</h1><p>Fluxo assistido para Web e Android, sem armazenar usuário, senha, MFA, cookie ou sessão.</p></section>
    <section className="cz-toolbox cc-iflight-wizard"><header><ShieldCheck/><div><small>SESSÃO CORPORATIVA EFÊMERA</small><h2>Importação protegida</h2></div></header><div className="cc-iflight-steps">{steps.map(([id, title, detail], index) => <article className={step === id || (step === 'ready' && index === 0) ? 'active' : ''} key={id}><span>{index + 1}</span><div><strong>{title}</strong><small>{detail}</small></div></article>)}</div><div className="cz-tool-actions"><button className="primary" onClick={openPortal}><Globe2/> Abrir ambiente corporativo</button><button onClick={() => setStep('local-time')}><Clock/> Confirmar calendário em LT</button><button onClick={importDownloaded}><Upload/> Selecionar PDF baixado</button></div></section>
    <section className="cz-mini-status"><p><strong>Na Web:</strong> o portal abre em uma janela separada por proteção do navegador. Depois do download, volte ao CrewCheck e selecione o PDF.</p><p><strong>No Android:</strong> o mesmo fluxo pode usar WebView efêmera quando o wrapper corporativo estiver autorizado. O CrewCheck não lê os campos de login.</p></section>
  </>;
}


function dutyHoursForRosterDay(day: RosterDay): number {
  const minutes = (value: unknown) => { const match = String(value || '').match(/(\d{1,2}):(\d{2})/); return match ? Number(match[1]) * 60 + Number(match[2]) : null; };
  const start = minutes((day as any).dutyReport || (day as any).presentation || (day as any).startTime || (day as any).legs?.[0]?.departureTime);
  const end = minutes((day as any).dutyDebrief || (day as any).endTime || (day as any).legs?.at?.(-1)?.arrivalTime);
  if (start === null || end === null) return Number((day as any).dutyHours || 0) || 0;
  let total = end - start;
  if (total < 0) total += 24 * 60;
  return Math.round(total / 6) / 10;
}

function rosterDayIso(day: RosterDay): string {
  const raw = String((day as any).date || '');
  const br = raw.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
  if (br) return `${br[3].length === 2 ? `20${br[3]}` : br[3]}-${pad2(Number(br[2]))}-${pad2(Number(br[1]))}`;
  return raw.slice(0, 10);
}

function HourLimitBar({ title, used, limit, detail }: { title: string; used: number; limit: number; detail: string }) {
  const ratio = limit > 0 ? used / limit : 0;
  const tone = ratio >= 1 ? 'danger' : ratio >= .85 ? 'warn' : 'ok';
  return <article className={`cz-hour-limit ${tone}`}><header><span><strong>{title}</strong><small>{detail}</small></span><b>{used.toFixed(1).replace('.', ',')} h / {limit.toFixed(1).replace('.', ',')} h</b></header><div><i style={{ width: `${Math.min(100, Math.max(2, ratio * 100))}%` }}/></div><footer>{ratio >= 1 ? 'Limite de referência alcançado; revise a análise regulatória.' : `${Math.max(0, limit - used).toFixed(1).replace('.', ',')} h de margem na referência configurada.`}</footer></article>;
}

function LoadView({ bundle }: { bundle: BundleState }) {
  const [limitRevision, setLimitRevision] = useState(0);
  void limitRevision;
  const compliance = currentCompliance(bundle) as any;
  const days = Array.isArray(bundle.roster.days) ? bundle.roster.days : [];
  const auditedDays = Array.isArray(compliance.loadAnalysis?.days) ? compliance.loadAnalysis.days : [];
  const auditedDayByDate = new Map(auditedDays.map((item: any) => [String(item.date || ''), item]));
  const rows = days.map((day) => {
    const audited = auditedDayByDate.get(String((day as any).date || '')) as any;
    return {
      day,
      date: rosterDayIso(day),
      hours: Number.isFinite(Number(audited?.dutyHours)) ? Number(audited.dutyHours) : dutyHoursForRosterDay(day),
      sectors: Array.isArray((day as any).legs) ? (day as any).legs.length : 0,
    };
  }).filter((row) => row.date);
  const dailyLimit = readNumberSetting('crewcheck_limit_daily_hours', 11);
  const weeklyLimit = readNumberSetting('crewcheck_limit_weekly_hours', 44);
  const monthlyLimit = readNumberSetting('crewcheck_limit_monthly_hours', 176);
  const heaviest = [...rows].sort((a, b) => (b.hours + b.sectors * .35) - (a.hours + a.sectors * .35)).slice(0, 6);
  const peakDay = heaviest[0] || { hours: 0, date: '—', sectors: 0 };
  let peakWeek = { hours: 0, from: '—', to: '—' };
  rows.forEach((row, index) => { const start = new Date(`${row.date}T12:00:00`); const windowRows = rows.filter((candidate) => { const date = new Date(`${candidate.date}T12:00:00`); const diff = (date.getTime() - start.getTime()) / 86400000; return diff >= 0 && diff < 7; }); const hours = windowRows.reduce((sum, item) => sum + item.hours, 0); if (hours > peakWeek.hours) peakWeek = { hours, from: row.date, to: windowRows.at(-1)?.date || row.date }; });
  const monthlyHours = Number.isFinite(Number(compliance.metrics?.totalDutyHours))
    ? Number(compliance.metrics.totalDutyHours)
    : rows.reduce((sum, row) => sum + row.hours, 0);
  function configure() {
    const daily = prompt('Referência diária de jornada (horas)', String(dailyLimit)); if (daily !== null) storage.set('crewcheck_limit_daily_hours', daily.replace(',', '.'));
    const weekly = prompt('Referência semanal de jornada (horas)', String(weeklyLimit)); if (weekly !== null) storage.set('crewcheck_limit_weekly_hours', weekly.replace(',', '.'));
    const monthly = prompt('Referência mensal de jornada (horas)', String(monthlyLimit)); if (monthly !== null) storage.set('crewcheck_limit_monthly_hours', monthly.replace(',', '.'));
    setLimitRevision((value) => value + 1);
  }
  return <><Brand back/><section className="cz-panel-head"><h1>Carga e limites</h1><p>Relação direta de horas usadas x limite de referência, sem substituir a análise contextual de RBAC 117, ACT e escala oficial.</p></section><section className="cz-hour-limits"><HourLimitBar title="Jornada diária mais alta" used={peakDay.hours} limit={dailyLimit} detail={`${peakDay.date} · ${peakDay.sectors} trecho(s)`}/><HourLimitBar title="Pico em 7 dias" used={peakWeek.hours} limit={weeklyLimit} detail={`${peakWeek.from} a ${peakWeek.to}`}/><HourLimitBar title="Total mensal" used={monthlyHours} limit={monthlyLimit} detail={`${rows.length} dia(s) com dados de jornada`}/></section><section className="cz-toolbox"><h2>Referências e confiabilidade</h2><p>Os valores acima são referências configuráveis para visualização. Uma extrapolação visual não vira irregularidade sozinha: composição, horário, tripulação, operação, repouso, ACT e RBAC continuam sendo avaliados no motor de conformidade.</p><div className="cz-tool-actions"><button onClick={configure}><Settings/> Configurar limites de referência</button><button onClick={() => window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'alerts' }))}><AlertTriangle/> Abrir análise regulatória</button></div></section><section className="cz-finance-table"><h2>Dias mais puxados da escala</h2>{heaviest.length ? heaviest.map((row, index) => <div className="cz-finance-row" key={`${row.date}-${index}`}><span>#{index + 1}</span><strong>{row.date}</strong><small>{row.hours.toFixed(1).replace('.', ',')} h de jornada · {row.sectors} trecho(s){row.hours >= dailyLimit ? ' · acima da referência diária' : ''}</small><b>{row.hours.toFixed(1).replace('.', ',')} h / {dailyLimit.toFixed(1).replace('.', ',')} h</b></div>) : <article className="cz-empty-real"><BriefcaseBusiness/><h2>Sem jornada calculável</h2><p>Importe uma escala com apresentação e término para calcular as relações de horas.</p></article>}</section><section className="cz-report-grid"><article><h2>Score de conformidade</h2><strong>{compliance.score ?? '—'}</strong><p>{compliance.summary || 'Aguardando análise.'}</p></article><article><h2>Alertas válidos</h2><strong>{actionableComplianceAlerts(compliance).length}</strong><p>Sem contadores antigos ou duplicados.</p></article><article><h2>Fonte</h2><strong>Escala ativa</strong><p>Todos os cálculos usam o mesmo motor canônico.</p></article><article><h2>Solo entre etapas</h2><strong>{Number(compliance.metrics?.totalGroundHours || 0).toFixed(1).replace('.', ',')} h</strong><p>Maior intervalo: {Number(compliance.metrics?.maxGroundIntervalMinutes || 0)} min · {Number(compliance.metrics?.groundLimitExceedances || 0)} acima do ACT. Solo não entra na jornada.</p></article></section></>;
}

function ToggleSetting({ icon: Icon, label, storageKey, defaultOn = true, detail }: { icon: any; label: string; storageKey: string; defaultOn?: boolean; detail?: string }) {
  const [on, setOn] = useState(() => storage.get(storageKey, defaultOn ? '1' : '0') !== '0');
  const toggle = () => { const next = !on; setOn(next); storage.set(storageKey, next ? '1' : '0'); if (storageKey === 'crewcheck_light_premium') { localStorage.setItem('crewcheck_theme_mode', next ? 'light' : 'dark'); document.documentElement.dataset.crewTheme = next ? 'light' : 'dark'; document.documentElement.classList.toggle('dark', !next); document.documentElement.style.colorScheme = next ? 'light' : 'dark'; window.dispatchEvent(new Event('crewcheck:theme-change')); } toast.success(`${label}: ${next ? 'ativado' : 'desativado'}`); };
  return <button className="cz-setting" onClick={toggle}><Icon/><div><strong>{label}</strong><small>{detail || (on ? 'Ativo' : 'Inativo')}</small></div><span className={on ? 'on' : ''}/></button>;
}
function FieldSetting({ icon: Icon, label, storageKey, placeholder }: { icon: any; label: string; storageKey: string; placeholder: string }) {
  const [value, setValue] = useState(() => storage.get(storageKey, ''));
  return <label className="cz-setting cz-field-setting"><Icon/><div><strong>{label}</strong><input value={value} onChange={(event) => { setValue(event.target.value); storage.set(storageKey, event.target.value); }} placeholder={placeholder}/></div><ChevronRight/></label>;
}

function PlatformPreferences() {
  const deviceLocale = (() => { const value = String(navigator.language || 'pt-BR'); return value.startsWith('en') ? 'en-US' : value.startsWith('es') ? 'es-ES' : 'pt-BR'; })() as CrewCheckLocale;
  const deviceTimezone = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo'; } catch { return 'America/Sao_Paulo'; } })();
  const [profile, setProfile] = useState<PlatformProfile | null>(null);
  const [locale, setLocale] = useState<CrewCheckLocale>(() => (storage.get('crewcheck_language', deviceLocale) as CrewCheckLocale));
  const [timezone, setTimezone] = useState(() => storage.get('crewcheck_timezone', 'America/Sao_Paulo'));
  const [busy, setBusy] = useState(false);
  useEffect(() => { getPlatformProfile().then((result) => { setProfile(result.profile); setLocale(result.profile.locale || deviceLocale); setTimezone(result.profile.timezone || 'America/Sao_Paulo'); }).catch(() => undefined); }, []);
  async function save() {
    setBusy(true);
    try {
      const result = await savePlatformProfile({ locale, timezone });
      setProfile(result.profile);
      storage.set('crewcheck_language', locale);
      storage.set('crewcheck_timezone', timezone);
      document.documentElement.lang = locale;
      window.dispatchEvent(new CustomEvent('crewcheck:locale-change', { detail: { locale, timezone } }));
      toast.success('Idioma e fuso horário salvos na conta.');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Não consegui salvar idioma e fuso.'); }
    finally { setBusy(false); }
  }
  return <section className="cz-toolbox"><h2>Idioma e fuso horário</h2><p>O primeiro acesso segue o idioma do dispositivo. O padrão operacional é Brasília (UTC−3) e todo texto compatível é tratado em UTF-8.</p><div className="cz-form-grid"><label><span>Idioma</span><select value={locale} onChange={(event) => setLocale(event.target.value as CrewCheckLocale)}><option value="pt-BR">Português (Brasil)</option><option value="en-US">English (United States)</option><option value="es-ES">Español</option></select></label><label><span>Fuso do sistema</span><select value={timezone} onChange={(event) => setTimezone(event.target.value)}><option value="America/Sao_Paulo">Brasília · UTC−3</option><option value={deviceTimezone}>Dispositivo · {deviceTimezone}</option><option value="UTC">UTC</option><option value="America/Manaus">Manaus · UTC−4</option><option value="America/Rio_Branco">Rio Branco · UTC−5</option><option value="America/Noronha">Fernando de Noronha · UTC−2</option><option value="Europe/Lisbon">Lisboa</option><option value="Europe/Madrid">Madri</option><option value="America/New_York">Nova York</option></select></label></div><div className="cz-tool-actions"><button onClick={() => { setLocale(deviceLocale); setTimezone(deviceTimezone); }}><Globe2/> Usar padrão do dispositivo</button><button onClick={save} disabled={busy}><Save/> {busy ? 'Salvando...' : 'Salvar na conta'}</button></div><div className="cz-routine-strip"><span>Conta {profile?.publicId || 'sincronizando'}</span><span>UTF-8</span><span>{locale}</span><span>{timezone}</span></div></section>;
}
function DatabaseConnectionCard({ admin }: { admin: boolean }) {
  const [status, setStatus] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  async function refresh() {
    setBusy(true);
    try {
      setStatus(await getDatabaseStatus());
    } catch {
      setStatus({ ok: false, connected: false, message: 'Sincronização em nuvem indisponível. O histórico local continua ativo neste dispositivo.' });
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => { refresh(); }, []);
  const connected = Boolean(status?.connected);
  const degraded = Boolean(status?.degraded || status?.localOnly);
  return <section className={'cz-toolbox cz-database-status ' + (connected ? 'connected' : 'offline')}>
    <header><span><Database/></span><div><h2>{connected ? degraded ? 'Banco conectado · modo resiliente' : 'Banco conectado' : 'Modo local protegido'}</h2><p>{status?.message || (connected ? 'Sincronização segura disponível para os módulos internos.' : 'Seus dados permanecem neste dispositivo e serão sincronizados quando a conexão voltar.')}</p></div></header>
    <div className="cz-routine-strip">
      <span>{connected ? 'Aiven MySQL ativo' : 'Histórico local ativo'}</span>
      <span>{connected ? degraded ? 'Fallback local ativo' : 'Sincronização liberada' : 'Fila de sincronização'}</span>
      {admin && <span>{connected ? status?.migrationRequired ? `${status?.missingOptionalCount || 0} módulo(s) aguardando migration` : String(status?.database || 'Banco principal') : 'Verifique conexão e migration'}</span>}
    </div>
    <div className="cz-tool-actions"><button onClick={refresh} disabled={busy}><RotateCcw/> {busy ? 'Verificando…' : 'Verificar conexão'}</button></div>
  </section>;
}

function AdminFinancialCalibration() {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const listener = () => { setRevision((value) => value + 1); toast.success('Calibração confirmada e aplicada às próximas previsões.'); };
    window.addEventListener('crewcheck:finance-calibrated', listener);
    return () => window.removeEventListener('crewcheck:finance-calibrated', listener);
  }, []);
  return <section className="cz-admin-calibration" data-revision={revision}>
    <section className="cz-toolbox cz-admin-calibration-intro">
      <div><Lock/><span><small>Somente administrador</small><h2>Calibração financeira</h2></span></div>
      <p>Importe demonstrativos ou ajuste os valores efetivos. PDFs são processados no dispositivo e só as tarifas confirmadas ficam salvas.</p>
    </section>
    <div className="cz-admin-calibration-grid">
      <FinancialStatementImporter mode="payroll"/>
      <FinancialStatementImporter mode="per_diem"/>
    </div>
    <section className="cz-toolbox">
      <h2>Ajuste manual do cálculo</h2>
      <p>Os valores manuais têm prioridade sobre o demonstrativo confirmado e sobre a tabela-base do ACT.</p>
      <div className="cz-admin-field-grid">
        <FieldSetting icon={DollarSign} label="KM diurno" storageKey="crewcheck_act_day_km_metric_brl" placeholder="R$/km"/>
        <FieldSetting icon={Moon} label="KM noturno" storageKey="crewcheck_act_night_km_metric_brl" placeholder="R$/km"/>
        <FieldSetting icon={Clock} label="Hora de reserva" storageKey="crewcheck_act_reserve_hour_brl" placeholder="R$/h"/>
        <FieldSetting icon={Bell} label="Hora de sobreaviso" storageKey="crewcheck_act_standby_hour_brl" placeholder="R$/h"/>
        <FieldSetting icon={BriefcaseBusiness} label="Refeição nacional" storageKey="crewcheck_perdiem_rate_domestic" placeholder="R$"/>
        <FieldSetting icon={DollarSign} label="Salário-base" storageKey="crewcheck_salary_base_brl" placeholder="R$"/>
        <FieldSetting icon={UserRound} label="Adicional chefe/setor" storageKey="crewcheck_act_chief_sector_brl" placeholder="R$"/>
        <FieldSetting icon={GraduationCap} label="Adicional instrutor/setor" storageKey="crewcheck_act_instructor_sector_brl" placeholder="R$"/>
      </div>
    </section>
    <section className="cz-toolbox">
      <h2>Pesquisa interna de academias</h2>
      <p>Esta lista orienta a busca e não aparece para os demais usuários.</p>
      <FieldSetting icon={Dumbbell} label="Redes priorizadas" storageKey="crewcheck:gym-partner-chains" placeholder="Selfit, Bluefit, Bodytech…"/>
    </section>
  </section>;
}

function AdminControlView() {
  const [memberEmail, setMemberEmail] = useState('');
  const [memberName, setMemberName] = useState('');
  const [termsTitle, setTermsTitle] = useState('Termos de Uso e Privacidade CrewCheck');
  const [termsBody, setTermsBody] = useState('');
  const [busy, setBusy] = useState('');
  useEffect(() => {
    getCurrentTerms().then((terms) => {
      if (!terms) return;
      setTermsTitle(terms.title);
      setTermsBody(terms.body);
    }).catch(() => undefined);
  }, []);
  async function saveUnlimited() {
    if (!memberEmail.trim()) return toast.info('Informe o e-mail do usuário.');
    setBusy('unlimited');
    try {
      const payload = await grantUnlimited({ email: memberEmail.trim(), name: memberName.trim() });
      toast.success(payload.message || 'Premium Unlimited concedido.');
      setMemberEmail(''); setMemberName('');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Não consegui atualizar o plano.'); }
    finally { setBusy(''); }
  }
  async function saveTerms() {
    if (termsBody.trim().length < 300) return toast.info('O texto precisa ter pelo menos 300 caracteres.');
    if (!confirm('Publicar uma nova versão? Todos os usuários precisarão aceitá-la uma vez.')) return;
    setBusy('terms');
    try {
      const terms = await publishTerms({ title: termsTitle.trim(), body: termsBody.trim() });
      toast.success(`Termos versão ${terms.version} publicados.`);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Não consegui publicar os Termos.'); }
    finally { setBusy(''); }
  }
  if (!isAdmin()) return <><Brand back/><article className="cz-empty-real"><Lock/><h2>Acesso restrito</h2><p>Este painel é exclusivo da administração.</p></article></>;
  return <><Brand back/><section className="cz-panel-head"><h1>Admin CrewCheck</h1><p>Operação, termos e concessões protegidas. Sua conta possui Premium Unlimited como agradecimento por construir o CrewCheck.</p></section>
    <section className="cz-toolbox cc-admin-honor"><ShieldCheck/><div><small>CONDECORAÇÃO CREWCHECK</small><h2>Fundador · Premium Unlimited</h2><p>Obrigado por transformar a rotina de tripulantes em um produto mais seguro, humano e útil.</p></div></section>
    <section className="cz-toolbox"><h2>Conceder Premium Unlimited</h2><p>Este plano não aparece na vitrine pública. Somente a administração pode concedê-lo a uma conta cadastrada.</p><div className="cz-form-grid"><label><span>Nome</span><input value={memberName} onChange={(event) => setMemberName(event.target.value)} placeholder="Nome do usuário"/></label><label><span>E-mail</span><input type="email" value={memberEmail} onChange={(event) => setMemberEmail(event.target.value)} placeholder="usuario@exemplo.com"/></label></div><div className="cz-tool-actions"><button className="primary" onClick={saveUnlimited} disabled={Boolean(busy)}><ShieldCheck/> {busy === 'unlimited' ? 'Atualizando...' : 'Conceder acesso'}</button></div></section>
    <section className="cz-toolbox"><h2>Termos de Uso e Privacidade</h2><p>Edite com cuidado. Publicar cria uma nova versão e solicita novo aceite somente quando o conteúdo muda.</p><div className="cz-form-grid"><label><span>Título</span><input value={termsTitle} onChange={(event) => setTermsTitle(event.target.value)}/></label><label className="wide"><span>Texto completo</span><textarea className="cz-update-textarea" rows={16} value={termsBody} onChange={(event) => setTermsBody(event.target.value)}/></label></div><div className="cz-tool-actions"><button className="primary" onClick={saveTerms} disabled={Boolean(busy)}><FileText/> {busy === 'terms' ? 'Publicando...' : 'Publicar nova versão'}</button></div></section>
    <AdminFinancialCalibration/>
  </>;
}

function SettingsView({ setView, actions }: { setView: (v: ZeroView) => void; actions: QuickActions }) {
  const admin = isAdmin();
  const user = getStoredUser();
  const [profileAvatar, setProfileAvatar] = useState(() => storage.get('crewcheck_profile_avatar', ''));
  const [planLabel, setPlanLabel] = useState('Verificando assinatura…');
  useEffect(() => {
    getPlatformBilling().then((billing) => {
      const labels: Record<string, string> = { free: 'Plano gratuito', premium_monthly: 'Premium mensal', premium_annual: 'Premium anual', premium_unlimited: 'Premium Unlimited' };
      setPlanLabel(labels[billing.plan] || 'Plano gratuito');
    }).catch(() => setPlanLabel('Conta em modo local'));
  }, []);
  async function enableMaintenance(enabled: boolean) {
    try {
      const response = await fetch('/api/admin/maintenance', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled, title: 'Site em manutenção', message: 'Estamos realizando melhorias e atualizações no CrewCheck.' }) });
      if (!response.ok) throw new Error('Falhou');
      toast.success(enabled ? 'Modo manutenção ativado.' : 'Modo manutenção desativado.');
      window.dispatchEvent(new CustomEvent('crewcheck:maintenance-updated'));
    } catch {
      toast.error('Não consegui alterar o modo manutenção.');
    }
  }
  function saveProfile() { toast.success('Configurações salvas no CrewCheck.'); }
  function updateProfileAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 2 * 1024 * 1024) return toast.error('Escolha JPG, PNG ou WebP com até 2 MB.');
    const reader = new FileReader();
    reader.onload = () => {
      const data = String(reader.result || '');
      if (!data) return;
      storage.set('crewcheck_profile_avatar', data);
      setProfileAvatar(data);
      toast.success('Foto do perfil atualizada neste dispositivo.');
    };
    reader.onerror = () => toast.error('Não consegui ler a foto.');
    reader.readAsDataURL(file);
  }
  async function deleteAccount() {
    if (!confirm('Excluir permanentemente sua conta, escalas, visitantes, hotéis, chat e histórico? Esta ação não pode ser desfeita.')) return;
    const confirmation = prompt('Para confirmar, digite EXCLUIR') || '';
    if (confirmation.trim().toUpperCase() !== 'EXCLUIR') { toast.message('Exclusão cancelada.'); return; }
    try {
      const result = await deleteCrewCheckAccount(confirmation);
      if (result.manageGooglePlayUrl && confirm('Os dados foram excluídos. Deseja abrir a Play Store para cancelar a assinatura Google Play separadamente?')) window.open(result.manageGooglePlayUrl, '_blank', 'noopener,noreferrer');
      try { Object.keys(localStorage).filter((key) => key.startsWith('crewcheck_') || key.startsWith('crewcheck:')).forEach((key) => localStorage.removeItem(key)); } catch {}
      window.location.assign('/login');
    } catch {
      toast.error('Não foi possível concluir a exclusão agora. Nenhum dado foi removido.');
    }
  }
  const profileName = String(user?.name || user?.email?.split('@')[0] || storage.get('crewcheck_profile_display_name', '') || 'Tripulante CrewCheck');
  return <><Brand back/><section className="cz-settings">
    <article className="cz-profile"><label className="cc-profile-photo" title="Alterar foto"><span>{profileAvatar ? <img src={profileAvatar} alt="Foto do perfil"/> : <UserRound/>}</span><input hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={updateProfileAvatar}/></label><div><h2>{profileName}</h2><p>{safe((user as any)?.role, 'Tripulante')}</p><span>{planLabel}</span><small>Versão CrewCheck {DEFAULT_VERSION}</small></div><ChevronRight/></article>
    <DatabaseConnectionCard admin={admin}/>
    <PlatformPreferences/>
    <section className="cz-settings-actions"><button onClick={() => setView('plans')}><ShieldCheck/> Assinaturas e limites</button><button onClick={() => setView('community')}><UserRound/> Pessoas, visitantes e chat</button></section>

    <h3>Operacional</h3>
    <ToggleSetting icon={Radar} label="Mapa visual para rotas" storageKey="crewcheck_tomtom_primary"/>
    <ToggleSetting icon={MapIcon} label="Atualizar localização em rota" storageKey="crewcheck_live_location"/>
    <ToggleSetting icon={Plane} label="Pausar ao chegar no aeroporto" storageKey="crewcheck_pause_at_airport"/>
    <ToggleSetting icon={Building2} label="Após pouso calcular tempo até hotel" storageKey="crewcheck_after_landing_hotel"/>
    <ToggleSetting icon={CloudSun} label="Atualização de meteorologia" storageKey="crewcheck_weather_hourly" detail="Novo METAR/SPECI"/>
    <ToggleSetting icon={CloudSun} label="Alertar piora até o pouso" storageKey="crewcheck_weather_landing_alerts" detail="Somente novo METAR ou SPECI"/>
    <ToggleSetting icon={Upload} label="Push iFlight assistido" storageKey="crewcheck_iflight_push_enabled" detail="sem salvar credenciais"/>
    <ToggleSetting icon={Dumbbell} label="Autocheck-in em academia" storageKey="crewcheck:gym-auto-checkin" defaultOn={false} detail="Compartilha presença por 90 min somente ao entrar no raio configurado"/>
    <ToggleSetting icon={Sun} label="Modo claro premium" storageKey="crewcheck_light_premium" defaultOn={false}/>

    <h3>Perfil</h3>
    <FieldSetting icon={Globe2} label="País do telefone" storageKey="crewcheck_phone_country" placeholder="Brasil +55"/>
    <FieldSetting icon={Phone} label="Telefone do despertador" storageKey="crewcheck_wakeup_phone" placeholder="61996071663"/>
    <FieldSetting icon={Bell} label="Chat do Telegram" storageKey="crewcheck_telegram_chat_id" placeholder="Cole seu chat ID"/>
    <FieldSetting icon={Bell} label="Canal do despertador" storageKey="crewcheck_wakeup_channel" placeholder="telegram | ligação | ambos"/>
    <FieldSetting icon={Building2} label="Base virtual" storageKey="crewcheck_virtual_base" placeholder="Ex.: BSB / CGH / GRU"/>
    <ToggleSetting icon={GraduationCap} label="Sou instrutor" storageKey="crewcheck_instructor" defaultOn={false}/>

    <h3>Notificações e concierge</h3>
    <ToggleSetting icon={Bell} label="Notificações via Telegram" storageKey="crewcheck_telegram_notifications"/>
    <ToggleSetting icon={Car} label="Alertas de trânsito e saída" storageKey="crewcheck_traffic_alerts"/>
    <ToggleSetting icon={Wifi} label="Concierge operacional" storageKey="crewcheck_concierge"/>

    {admin && <><h3>Administração</h3><section className="cz-settings-actions"><button onClick={() => setView('admin')}><ShieldCheck/> Abrir painel Admin</button></section></>}

    <section className="cz-settings-actions">
      <button className="primary" onClick={saveProfile}><Save/> Salvar perfil</button>
      <button onClick={() => setView('features')}><Settings/> Central funcional</button>
      <button onClick={actions.replayIntro}><PlayCircle/> Reexibir introdução</button>
      <button onClick={actions.openActive}><RotateCcw/> Abrir escala ativa</button>
      <button onClick={actions.logout}><LogOut/> Sair</button>
      <button className="danger" onClick={deleteAccount}><AlertTriangle/> Excluir minha conta</button>
      {admin && <button onClick={() => setView('maintenance')}><Lock/> Prévia manutenção</button>}
      {admin && <button onClick={() => enableMaintenance(true)}><Lock/> Ativar manutenção</button>}
      {admin && <button onClick={() => enableMaintenance(false)}><ShieldCheck/> Desativar manutenção</button>}
    </section>
  </section></>;
}

function FeatureHub({ bundle, events, setBundle, setView, actions }: { bundle: BundleState; events: ZeroLeg[]; setBundle: (b: BundleState) => void; setView: (v: ZeroView) => void; actions: QuickActions }) {
  const compliance = currentCompliance(bundle);
  const gym = currentGym(bundle);
  return <><Brand back/><section className="cz-panel-head"><h1>Central funcional</h1><p>Operação, finanças, serviços próximos, mapas e histórico em uma experiência integrada. Versão {DEFAULT_VERSION}.</p></section><section className="cz-feature-grid"><button onClick={actions.upload}><Upload/><strong>Importar escala</strong><small>PDF AIMS / CrewRoster</small></button><button onClick={() => setView('roster')}><CalendarDays/><strong>Escala completa</strong><small>{events.length} eventos detectados</small></button><button onClick={() => setView('compare')}><GitCompareArrows/><strong>Planejado x atual</strong><small>Mudanças, folgas e valores</small></button><button onClick={() => setView('alerts')}><AlertTriangle/><strong>Irregularidades</strong><small>{actionableComplianceAlerts(compliance).length} alertas</small></button><button onClick={() => setView('load')}><BriefcaseBusiness/><strong>Carga</strong><small>Jornada e limites</small></button><button onClick={() => setView('departure')}><Navigation/><strong>Saída Inteligente</strong><small>Horário previsto e trânsito</small></button><button onClick={() => setView('mycar')}><Car/><strong>Meu carro</strong><small>Vaga, mapa e compartilhamento</small></button><button onClick={() => setView('iflight')}><Upload/><strong>Push iFlight</strong><small>Importação assistida</small></button><button onClick={() => setView('wakeup')}><Bell/><strong>Despertador Inteligente</strong><small>Antes da apresentação</small></button><button onClick={() => setView('radar')}><Radar/><strong>Radar de voos</strong><small>Portão e status</small></button><button onClick={() => setView('weather')}><CloudSun/><strong>Meteorologia</strong><small>METAR/TAF e Defesa Civil</small></button><button onClick={() => setView('perdiem')}><BriefcaseBusiness/><strong>Diárias</strong><small>Semanal e mensal</small></button><button onClick={() => setView('salary')}><DollarSign/><strong>Salário</strong><small>Chefe/instrutor/ganhos</small></button><button onClick={() => setView('routine')}><ShieldCheck/><strong>Rotina</strong><small>Academia e descanso</small></button><button onClick={() => setView('hotels')}><Hotel/><strong>Hotéis</strong><small>Pernoite e entorno</small></button><button onClick={() => setView('gyms')}><MapIcon/><strong>Locais próximos</strong><small>Academias, saúde e serviços</small></button><button onClick={() => setView('map')}><MapIcon/><strong>Mapa do mês</strong><small>Destinos da escala</small></button><button onClick={() => setView('crew')}><UserRound/><strong>Crew / Chefe</strong><small>Tripulação e adicional</small></button><button onClick={() => setView('calendar')}><CalendarDays/><strong>Calendário</strong><small>Google Calendar / ICS</small></button><button onClick={() => setView('exports')}><FileText/><strong>Exportar</strong><small>PDF, WhatsApp, e-mail</small></button><button onClick={() => setView('settings')}><Settings/><strong>Configurações</strong><small>Perfil completo</small></button><button onClick={() => setView('database')}><Database/><strong>Histórico</strong><small>Sincronização e offline</small></button></section><section className="cz-toolbox"><h2>Ações rápidas</h2><div className="cz-tool-actions"><button onClick={actions.pdf}>Gerar PDF</button><button onClick={actions.ics}>Gerar ICS</button><button onClick={actions.whatsapp}>WhatsApp</button><button onClick={actions.telegram}>Telegram</button><button onClick={actions.email}>E-mail</button><button onClick={actions.copy}>Copiar resumo</button><button onClick={actions.google}>Google Calendar</button><button onClick={actions.save}>Salvar histórico</button><button onClick={actions.openActive}>Abrir ativa</button></div></section><section className="cz-mini-status"><p><strong>Fonte:</strong> {bundle.source}</p><p><strong>Eventos:</strong> {events.length} · <strong>Alertas:</strong> {actionableComplianceAlerts(compliance).length} · <strong>Rotina:</strong> {gym.length}</p></section></>;
}


function RadarView({ event }: { event: ZeroLeg }) {
  const [state, setState] = useState<RadarSnapshot | null>(() => readRadarSnapshot(event));
  const [loading, setLoading] = useState(false);
  const flight = safe(event.flightNumber, '');
  const airlineCode = event.airlineCode || normalizedAirlineCode(flight);
  const airlineName = airlineNameFor(airlineCode, event.airlineName);
  async function refresh(force = false) {
    setLoading(true);
    try {
      const payload = await fetchRadarSnapshot(event, force);
      setState(payload || { ok: false, message: 'Radar indisponível.' });
    } catch {
      setState({ ok: false, message: 'Radar operacional aguardando fonte disponível.' });
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    const cached = readRadarSnapshot(event);
    setState(cached);
    refresh(false);
  }, [event.id, flight, event.origin, event.destination]);
  const status = state?.status || event.status || 'Monitorando';
  const gate = state?.gate || event.gate || 'A confirmar';
  const terminal = state?.terminal || event.terminal || 'A confirmar';
  const dep = state?.departure || event.departure;
  const arr = state?.arrival || event.arrival;
  const quality = state?.quality ? `${state.quality}%` : 'Aguardando';
  const latency = state?.latencyMs ? `${state.latencyMs} ms` : '—';
  return <><Brand back/><section className="cz-panel-head"><h1>Radar de voos</h1><p>{flight || 'Voo'} · {event.origin} → {event.destination} · portão e status sincronizados com a próxima programação.</p></section><section className="cz-radar-screen"><article><div className="cz-radar-airline"><AirlineLogo code={airlineCode} name={airlineName}/><strong>{airlineName}</strong></div><h2>{flight || 'Voo'}</h2><p>{event.origin} → {event.destination}</p><strong>Portão: {gate} · {terminal}</strong><span>Status: {status}</span></article><article><Plane/><h2>Horários</h2><p>Partida {safe(dep, 'A confirmar')} · Chegada {safe(arr, 'A confirmar')}</p><strong>{state?.ok ? 'Radar atualizado' : 'Radar aguardando fonte'}</strong><span>{state?.message || 'Consultando fontes operacionais disponíveis.'}</span></article><article><ShieldCheck/><h2>Qualidade</h2><p>Precisão {quality} · resposta {latency}</p><strong>{loading ? 'Atualizando...' : 'Seleção automática'}</strong><span>{state?.alternatives ? `${state.alternatives} fonte(s) responderam dentro do limite.` : 'Teste automático por disponibilidade.'}</span></article></section><section className="cz-toolbox"><h2>Ações</h2><div className="cz-tool-actions"><button onClick={() => refresh(true)} disabled={loading}><Radar/> Atualizar e exportar ao card</button><button onClick={() => window.open(`https://www.google.com/search?q=${encodeURIComponent(`${flight} flight status ${event.origin} ${event.destination}`)}`, '_blank', 'noopener,noreferrer')}><Globe2/> Consultar voo</button><button onClick={() => window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'weather' }))}><CloudSun/> Meteorologia</button></div></section></>;
}

type WeatherDisplayMode = 'both' | 'raw' | 'decoded';
type WeatherStationResult = {
  airport?: string;
  icao?: string;
  metar?: string;
  taf?: string;
  metarDecoded?: string[];
  tafDecoded?: string[];
  source?: { metar?: string; taf?: string };
  observedAt?: { metar?: string; taf?: string };
  monitoring?: { severity?: number; hazards?: Array<{ code: string; label: string }>; visibility?: number | null; ceiling?: number | null; windKt?: number; gustKt?: number };
  ok?: boolean;
};
function weatherSeverityLabel(value = 0) {
  if (value >= 3) return 'Mudança crítica';
  if (value >= 2) return 'Atenção operacional';
  if (value >= 1) return 'Acompanhar';
  return 'Sem critério crítico';
}
function WeatherDecoded({ lines }: { lines?: string[] }) {
  if (!lines?.length) return <p className="cc-weather-unavailable">Decodificação indisponível para este boletim.</p>;
  return <ul className="cc-weather-decoded">{lines.map((line, index) => <li key={`${line}-${index}`}>{line}</li>)}</ul>;
}
function WeatherReport({ title, raw, decoded, mode }: { title: string; raw?: string; decoded?: string[]; mode: WeatherDisplayMode }) {
  return <section className="cc-weather-report"><h3>{title}</h3>
    {mode !== 'decoded' && <pre>{raw || `${title} indisponível agora.`}</pre>}
    {mode !== 'raw' && <WeatherDecoded lines={decoded}/>}
  </section>;
}
function WeatherView({ event }: { event: ZeroLeg }) {
  const scheduled = [event.origin, event.destination].filter(Boolean).join(', ');
  const [query, setQuery] = useState(scheduled || 'SBBR');
  const [activeQuery, setActiveQuery] = useState(scheduled || 'SBBR');
  const [mode, setMode] = useState<WeatherDisplayMode>('both');
  const [weather, setWeather] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!scheduled) return;
    setQuery(scheduled);
    setActiveQuery(scheduled);
  }, [event.id, scheduled]);
  useEffect(() => {
    let alive = true;
    const airports = activeQuery.split(/[\s,;]+/).map((value) => value.trim().toUpperCase()).filter(Boolean).slice(0, 6).join(',');
    if (!airports) return;
    setLoading(true);
    fetch(`/api/aviation-weather?airports=${encodeURIComponent(airports)}&type=all&view=${mode}&v=1393`, { cache: 'no-store' })
      .then((response) => response.json())
      .then((payload) => { if (alive) setWeather(payload); })
      .catch((error) => { if (alive) setWeather({ ok: false, message: error?.message || 'Falha ao consultar meteorologia.' }); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [activeQuery, mode]);
  const requested = activeQuery.split(/[\s,;]+/).map((value) => value.trim().toUpperCase()).filter(Boolean).slice(0, 6);
  const stations: WeatherStationResult[] = requested.map((code) => weather?.stations?.[code]).filter(Boolean);
  const search = (submit: FormEvent) => {
    submit.preventDefault();
    const normalized = query.split(/[\s,;]+/).map((value) => value.trim().toUpperCase()).filter((value) => /^[A-Z]{3,4}$/.test(value)).slice(0, 6).join(', ');
    if (!normalized) return toast.error('Informe um código IATA ou ICAO válido, como BSB ou SBBR.');
    setQuery(normalized);
    setActiveQuery(normalized);
  };
  return <><Brand back/>
    <section className="cz-panel-head cc-weather-heading"><div><h1>Meteorologia</h1><p>METAR/SPECI oficial brasileiro com contingência internacional, TAF e leitura acessível.</p></div><span><ShieldCheck/> Consulta protegida no servidor</span></section>
    <section className="cc-weather-console">
      <form onSubmit={search} className="cc-weather-search"><label><span>Aeroporto(s)</span><div><Search/><input value={query} onChange={(change) => setQuery(change.target.value.toUpperCase())} placeholder="Ex.: BSB, GRU ou SBBR"/><button type="submit" disabled={loading}>{loading ? 'Consultando…' : 'Pesquisar'}</button></div></label></form>
      <div className="cc-weather-mode" role="group" aria-label="Formato da meteorologia">
        <span>Exibição</span>
        <button className={mode === 'raw' ? 'active' : ''} onClick={() => setMode('raw')}>Bruto</button>
        <button className={mode === 'decoded' ? 'active' : ''} onClick={() => setMode('decoded')}>Decodificado</button>
        <button className={mode === 'both' ? 'active' : ''} onClick={() => setMode('both')}>Ambos</button>
      </div>
      {scheduled && <div className="cc-weather-flight-window"><Plane/><div><strong>Ligado à próxima etapa</strong><span>{event.origin} {safe(event.departure, 'horário a confirmar')} → {event.destination} {safe(event.arrival, 'horário a confirmar')}</span></div><small>Origem: 3 h antes da partida · destino: 2 h antes da chegada</small></div>}
    </section>
    {stations.length > 0 && <section className="cc-weather-stations">{stations.map((station) => {
      const severity = Number(station.monitoring?.severity || 0);
      const hazards = station.monitoring?.hazards || [];
      return <article key={`${station.airport}-${station.icao}`} className={`cc-weather-station severity-${Math.min(3, severity)}`}>
        <header><div><small>{station.airport && station.airport !== station.icao ? `${station.airport} · ` : ''}AERÓDROMO</small><h2>{station.icao || station.airport}</h2></div><span className="cc-weather-status">{weatherSeverityLabel(severity)}</span></header>
        <div className="cc-weather-source"><span><Wifi/> METAR: {station.source?.metar || 'fonte indisponível'}</span><span><CloudSun/> TAF: {station.source?.taf || 'fonte indisponível'}</span></div>
        {hazards.length > 0 && <div className="cc-weather-hazards">{hazards.map((hazard) => <span key={hazard.code}>{hazard.label}</span>)}</div>}
        <WeatherReport title="METAR / SPECI" raw={station.metar} decoded={station.metarDecoded} mode={mode}/>
        <WeatherReport title="TAF" raw={station.taf} decoded={station.tafDecoded} mode={mode}/>
      </article>;
    })}</section>}
    {!loading && !weather?.ok && <article className="cz-empty-real cc-weather-empty"><CloudSun/><h2>METAR/TAF indisponível agora</h2><p>{weather?.message || 'A fonte não respondeu. Tente novamente sem recarregar o sistema.'}</p></article>}
    <section className="cc-weather-alert-policy"><Bell/><div><h2>Alertas sem excesso</h2><p>O Telegram avisa somente piora crítica dentro da janela do voo: cruzamento de teto/visibilidade, trovoada, cortante, granizo, fenômeno congelante ou vento forte. Boletim repetido, melhora e mudança leve ficam silenciosos.</p><code>/alertameteo on</code><code>/alertameteo off</code></div></section>
    <p className="cc-weather-disclaimer">A decodificação é apoio de leitura e não substitui METAR/SPECI, TAF, ATIS, despacho, NOTAM nem orientação operacional oficial.</p>
  </>;
}
function moneyBRL(value: number) {
  return `R$ ${Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function overlapsWindow(start: Date, end: Date, hourStart: number, hourEnd: number) {
  const a = new Date(start); a.setHours(hourStart, 0, 0, 0);
  const b = new Date(start); b.setHours(hourEnd, 0, 0, 0);
  if (hourEnd <= hourStart) b.setDate(b.getDate() + 1);
  return start.getTime() < b.getTime() && end.getTime() > a.getTime();
}
function durationHours(event: ZeroLeg) {
  const start = eventStartDateTime(event).getTime();
  const end = eventEndDateTime(event).getTime();
  return Math.max(0, (end - start) / 36e5);
}
function currentWeekBounds() {
  const now = new Date();
  const start = new Date(now); start.setHours(0, 0, 0, 0); start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const end = new Date(start); end.setDate(start.getDate() + 7);
  return { start, end };
}

type ActCompensationConfig = {
  kmMetric: number;
  dayKmMetric: number;
  nightKmMetric: number;
  reserveHourMetric: number;
  standbyHourMetric: number;
  chiefPerSector: number;
  instructorPerSector: number;
  nightHourMetric: number;
  basePay: number;
  fixedAdditions: number;
  inssDeduction: number;
  irrfDeduction: number;
  otherDeductions: number;
  fgtsRate: number;
  configured: boolean;
  source: string;
  requiresManualFunction: boolean;
};
type FlightEarningRow = {
  id: string;
  date: string;
  flight: string;
  route: string;
  workType: string;
  km: number;
  dayKm: number;
  nightKm: number;
  metric: number;
  production: number;
  dayProduction: number;
  nightProduction: number;
  chief: number;
  instructor: number;
  night: number;
  total: number;
  chiefEligible: boolean;
  dayRateApplied: number;
  nightRateApplied: number;
  payRule: string;
  extraFlight: boolean;
  source: string;
};
type PerDiemRow = {
  date: string;
  iso: string;
  label: string;
  value: number;
  currency: PerDiemCurrency;
  convertedBRL: number | null;
  source: string;
  airport: string;
  rateKey: PerDiemRateKey;
};
function readNumberSetting(key: string, fallback = 0): number {
  const raw = storage.get(key, String(fallback)).replace(',', '.');
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}
function readOptionalNumberSetting(key: string): number | null {
  const raw = storage.get(key, '').trim().replace(',', '.');
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}
function moneyCurrency(value: number, currency: PerDiemCurrency): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}
function loadAirportPerDiemOverrides(): AirportPerDiemOverrides {
  try {
    const parsed = JSON.parse(storage.get('crewcheck_perdiem_airport_rules_json', '{}'));
    return parsed && typeof parsed === 'object' ? parsed as AirportPerDiemOverrides : {};
  } catch {
    return {};
  }
}
function rosterFinancialDate(roster: CrewRoster): string {
  const year = Number(roster.year);
  const month = Number(roster.month);
  if (Number.isInteger(year) && year >= 2000 && Number.isInteger(month) && month >= 1 && month <= 12) {
    return year + '-' + String(month).padStart(2, '0') + '-01';
  }
  return new Date().toISOString().slice(0, 10);
}

function loadActCompensationConfig(roster: CrewRoster): ActCompensationConfig {
  const act = resolveActFinancialRules(roster);
  const effectiveDate = rosterFinancialDate(roster);
  const legacyMetric = readOptionalNumberSetting('crewcheck_act_km_metric_brl');
  const dayOverride = readOptionalNumberSetting('crewcheck_act_day_km_metric_brl');
  const nightOverride = readOptionalNumberSetting('crewcheck_act_night_km_metric_brl');
  const reserveOverride = readOptionalNumberSetting('crewcheck_act_reserve_hour_brl');
  const standbyOverride = readOptionalNumberSetting('crewcheck_act_standby_hour_brl');
  const learnedDay = confirmedRateValueAt('salary.dayKm', effectiveDate);
  const learnedNight = confirmedRateValueAt('salary.nightKm', effectiveDate);
  const learnedReserve = confirmedRateValueAt('salary.reserveHour', effectiveDate);
  const learnedStandby = confirmedRateValueAt('salary.standbyHour', effectiveDate);
  const learnedBase = confirmedRateValueAt('salary.base', effectiveDate);
  const dayKmMetric = dayOverride ?? legacyMetric ?? learnedDay ?? act.salary.dayKm;
  const nightKmMetric = nightOverride ?? learnedNight ?? act.salary.nightKm;
  const reserveHourMetric = reserveOverride ?? learnedReserve ?? act.salary.reserveHour;
  const standbyHourMetric = standbyOverride ?? learnedStandby ?? act.salary.standbyHour;
  const chiefPerSector = readNumberSetting('crewcheck_act_chief_sector_brl', 0);
  const instructorPerSector = readNumberSetting('crewcheck_act_instructor_sector_brl', 0);
  const basePay = readOptionalNumberSetting('crewcheck_salary_base_brl') ?? learnedBase ?? 0;
  const fixedAdditions = readNumberSetting('crewcheck_salary_fixed_additions_brl', 0);
  const inssDeduction = readNumberSetting('crewcheck_salary_inss_brl', 0);
  const irrfDeduction = readNumberSetting('crewcheck_salary_irrf_brl', 0);
  const otherDeductions = readNumberSetting('crewcheck_salary_other_deductions_brl', 0);
  const fgtsRate = Math.min(100, Math.max(0, readNumberSetting('crewcheck_salary_fgts_rate', 0)));
  const configured = dayKmMetric > 0 || nightKmMetric > 0 || reserveHourMetric > 0
    || standbyHourMetric > 0 || chiefPerSector > 0 || instructorPerSector > 0
    || basePay > 0 || fixedAdditions > 0;
  const hasOverride = [dayOverride, nightOverride, reserveOverride, standbyOverride, legacyMetric].some((value) => value !== null);
  const hasLearned = [learnedDay, learnedNight, learnedReserve, learnedStandby, learnedBase].some((value) => value !== null);
  return {
    kmMetric: dayKmMetric,
    dayKmMetric,
    nightKmMetric,
    reserveHourMetric,
    standbyHourMetric,
    chiefPerSector,
    instructorPerSector,
    nightHourMetric: 0,
    basePay,
    fixedAdditions,
    inssDeduction,
    irrfDeduction,
    otherDeductions,
    fgtsRate,
    configured,
    source: act.profileLabel + ' · ' + act.legalReference
      + (hasOverride ? ' · calibração manual do Admin' : hasLearned ? ' · demonstrativo confirmado pelo Admin' : ' · tabela ACT vigente')
      + ' · cada KM é classificado uma única vez pela janela local 22:00–05:00',
    requiresManualFunction: act.requiresManualFunction,
  };
}
function normalizeCrewNameForFinance(value: unknown): string {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
function currentUserNameTokens(roster: CrewRoster): string[] {
  const raw = normalizeCrewNameForFinance(getStoredUser()?.name || roster.crewName || '');
  return raw.split(' ').filter((part) => part.length >= 3);
}
function firstCrewListed(event: ZeroLeg): string {
  const crew = Array.isArray(event.crew) ? event.crew : [];
  return normalizeCrewNameForFinance(crew[0] || '');
}
function userIsFirstCcm(event: ZeroLeg, roster: CrewRoster): boolean {
  const first = firstCrewListed(event);
  if (!first) return false;
  const tokens = currentUserNameTokens(roster);
  if (!tokens.length) return false;
  return tokens.some((token) => first.includes(token));
}
function flightDistanceKmFromEvent(event: ZeroLeg): number {
  const from = airportPoint(event.origin);
  const to = airportPoint(event.destination);
  if (!from || !to) return 0;
  return Math.round(routeDistanceKm(from, to));
}
function perDiemConfig(roster: CrewRoster) {
  const act = resolveActFinancialRules(roster);
  const effectiveDate = rosterFinancialDate(roster);
  const learnedMeal = confirmedRateValueAt('per_diem.lunch', effectiveDate)
    ?? confirmedRateValueAt('per_diem.dinner', effectiveDate)
    ?? confirmedRateValueAt('per_diem.supper', effectiveDate);
  const learnedBreakfast = confirmedRateValueAt('per_diem.breakfast', effectiveDate);
  const rates = Object.fromEntries(act.perDiem.map((rule) => {
    const override = readOptionalNumberSetting('crewcheck_perdiem_rate_' + rule.key);
    const calibrated = rule.key === 'domestic' ? learnedMeal : null;
    return [rule.key, { ...rule, mainMeal: override ?? calibrated ?? rule.mainMeal }];
  })) as Record<PerDiemRateKey, { key: PerDiemRateKey; label: string; currency: PerDiemCurrency; mainMeal: number }>;
  const exchangeRates: Record<PerDiemCurrency, number> = {
    BRL: 1,
    USD: readNumberSetting('crewcheck_fx_usd_brl', 0),
    EUR: readNumberSetting('crewcheck_fx_eur_brl', 0),
    GBP: readNumberSetting('crewcheck_fx_gbp_brl', 0),
  };
  return {
    act,
    rates,
    exchangeRates,
    breakfastPercent: act.breakfastPercent,
    learnedBreakfast,
    airportOverrides: loadAirportPerDiemOverrides(),
    source: act.profileLabel + ' · ' + act.legalReference + (learnedMeal || learnedBreakfast ? ' · demonstrativo confirmado pelo Admin' : ''),
  };
}
function calculatePerDiem(events: ZeroLeg[], roster: CrewRoster) {
  const cfg = perDiemConfig(roster);
  const rows: PerDiemRow[] = [];
  const seen = new Set<string>();
  const pendingAirports = new Set<string>();
  const usedRateKeys = new Set<PerDiemRateKey>();
  const add = (event: ZeroLeg, slot: string, label: string, source: string) => {
    const classification = resolvePerDiemRule(event.origin, event.destination, cfg.airportOverrides);
    if (!classification.rateKey) {
      if (classification.airport) pendingAirports.add(classification.airport);
      return;
    }
    const iso = rosterDayIso(event.day)
      || event.date.getFullYear() + '-' + pad2(event.date.getMonth() + 1) + '-' + pad2(event.date.getDate());
    const key = iso + '-' + slot;
    if (seen.has(key)) return;
    seen.add(key);
    usedRateKeys.add(classification.rateKey);
    const rate = cfg.rates[classification.rateKey];
    const value = slot === 'breakfast' && rate.currency === 'BRL' && cfg.learnedBreakfast !== null
      ? cfg.learnedBreakfast
      : slot === 'breakfast' ? rate.mainMeal * cfg.breakfastPercent : rate.mainMeal;
    const fx = cfg.exchangeRates[rate.currency];
    rows.push({
      date: dateChip(event.date),
      iso,
      label,
      value,
      currency: rate.currency,
      convertedBRL: rate.currency === 'BRL' ? value : fx > 0 ? value * fx : null,
      source: source + ' · ' + rate.label + ' · ' + classification.reason,
      airport: classification.airport,
      rateKey: classification.rateKey,
    });
  };
  events.filter(isOperationalEvent).forEach((event) => {
    const start = eventStartDateTime(event);
    const end = new Date(eventEndDateTime(event).getTime() + 30 * 60 * 1000);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) return;
    const code = (event.flightNumber + ' ' + ((event.day as any)?.type || '') + ' '
      + ((event.day as any)?.pairingCode || '')).toUpperCase();
    const isReserve = /\b(ASB|RES|RESERVA|RSV)\b/.test(code);
    const source = event.kind === 'stay' || event.hotel
      ? 'Pernoite/hotel na janela'
      : isReserve ? 'Reserva operacional na janela' : 'Jornada na janela';
    const breakfastIncluded = Boolean(
      (event.day as any)?.breakfastIncluded
      || (event.day as any)?.hotelBreakfastIncluded
      || (event as any)?.breakfastIncluded
    );
    const breakfastSource = event.kind === 'stay' || event.hotel
      ? source + ' · 05:00-08:00 · confirmar se o café não está incluído no hotel'
      : source + ' · 05:00-08:00';
    if (overlapsWindow(start, end, 5, 8) && !breakfastIncluded) {
      add(event, 'breakfast', 'Café', breakfastSource);
    }
    if (overlapsWindow(start, end, 11, 13)) add(event, 'lunch', isReserve ? 'Diária reserva · almoço' : 'Almoço', source + ' · 11:00-13:00');
    if (overlapsWindow(start, end, 19, 20)) add(event, 'dinner', isReserve ? 'Diária reserva · jantar' : 'Jantar', source + ' · 19:00-20:00');
    const isTraining = /\b(CRM|TREIN|TRAIN|SIM|CHECK|CBF|EMER)\b/.test(code);
    const isExtra = flightWorkType(event) === 'PS';
    const ceiaEligible = event.kind === 'flight' || isReserve || isTraining || isExtra;
    if (ceiaEligible && overlapsWindow(start, end, 0, 1)) {
      add(event, 'supper', 'Ceia', source + ' · 00:00-01:00');
    }
  });
  const totalsByCurrency = rows.reduce((totals, row) => {
    totals[row.currency] = (totals[row.currency] || 0) + row.value;
    return totals;
  }, {} as Partial<Record<PerDiemCurrency, number>>);
  const pendingCurrencies = (Object.keys(totalsByCurrency) as PerDiemCurrency[])
    .filter((currency) => currency !== 'BRL' && totalsByCurrency[currency] && cfg.exchangeRates[currency] <= 0);
  const convertedTotalBRL = rows.reduce((sum, row) => sum + (row.convertedBRL || 0), 0);
  const bounds = currentWeekBounds();
  const weekly = rows.filter((row) => {
    const date = new Date(row.iso + 'T12:00:00');
    return date >= bounds.start && date < bounds.end;
  }).reduce((sum, row) => sum + (row.convertedBRL || 0), 0);
  const currencySummary = (Object.entries(totalsByCurrency) as Array<[PerDiemCurrency, number]>)
    .filter(([, value]) => value > 0)
    .map(([currency, value]) => moneyCurrency(value, currency))
    .join(' · ');
  return {
    rows,
    monthly: convertedTotalBRL,
    weekly,
    totalsByCurrency,
    currencySummary,
    currencyCount: Object.keys(totalsByCurrency).length,
    pendingCurrencies,
    pendingAirports: Array.from(pendingAirports).sort(),
    usedRateKeys: Array.from(usedRateKeys),
    convertedComplete: pendingCurrencies.length === 0,
    config: cfg,
    configured: true,
  };
}
function nightHoursInsideWindow(start: Date, end: Date): number {
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) return 0;
  const anchor = new Date(start);
  anchor.setDate(anchor.getDate() - 1);
  anchor.setHours(22, 0, 0, 0);
  let total = 0;
  while (anchor < end) {
    const windowEnd = new Date(anchor);
    windowEnd.setDate(windowEnd.getDate() + 1);
    windowEnd.setHours(5, 0, 0, 0);
    const overlapStart = Math.max(start.getTime(), anchor.getTime());
    const overlapEnd = Math.min(end.getTime(), windowEnd.getTime());
    if (overlapEnd > overlapStart) total += (overlapEnd - overlapStart) / 36e5;
    anchor.setDate(anchor.getDate() + 1);
  }
  return total;
}

function financialEventCode(event: ZeroLeg): string {
  return [
    event.flightNumber,
    event.title,
    flightWorkType(event),
    (event.day as any)?.type,
    (event.day as any)?.pairingCode,
    (event.day as any)?.rawText,
  ].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}

function financialFlightRule(event: ZeroLeg): { extra: boolean; reason: string } {
  const code = financialEventCode(event);
  const extra = flightWorkType(event) === 'PS' || /\b(DFS|EXTRA|EXTRAORDINARIO|EXTRAORDINARIA)\b/.test(code);
  const reserveActivation = /\b(ASB|RES|RESERVA|RSV|HSB|HSBE|SOBREAVISO)\b/.test(code)
    && /\b(ACION|ACIONADO|CHAMAD|VOO)\b/.test(code);
  if (extra) return { extra: true, reason: 'tarifa extra/DFS' };
  if (reserveActivation) return { extra: true, reason: 'tarifa de voo acionado' };
  return { extra: false, reason: 'tarifa regular' };
}

function calculateSalary(events: ZeroLeg[], roster: CrewRoster) {
  const cfg = loadActCompensationConfig(roster);
  const flightEvents = dedupeProjectedLegs(events.filter((event) => event.kind === 'flight' && !event.placeholder));
  const instructor = storage.get('crewcheck_instructor', '0') !== '0';
  const rows: FlightEarningRow[] = flightEvents.map((event) => {
    const km = event.origin && event.destination && event.origin !== event.destination ? flightDistanceKmFromEvent(event) : 0;
    const block = Math.max(0, durationHours(event));
    const nightHours = nightHoursInsideWindow(eventStartDateTime(event), eventEndDateTime(event));
    const nightFraction = block > 0 ? Math.min(1, nightHours / block) : 0;
    const nightKm = Math.min(km, Math.max(0, Math.round(km * nightFraction)));
    const dayKm = Math.max(0, km - nightKm);
    const payRule = financialFlightRule(event);
    const dayRateApplied = payRule.extra ? cfg.nightKmMetric : cfg.dayKmMetric;
    const nightRateApplied = cfg.nightKmMetric;
    const dayProduction = dayKm * dayRateApplied;
    const nightProduction = nightKm * nightRateApplied;
    const production = dayProduction + nightProduction;
    const chiefEligible = userIsFirstCcm(event, roster);
    const chief = chiefEligible ? cfg.chiefPerSector : 0;
    const instructorPay = instructor ? cfg.instructorPerSector : 0;
    const workType = flightWorkType(event) || 'OP';
    return {
      id: event.id,
      date: dateChip(event.date),
      flight: safe(event.flightNumber, 'Voo'),
      route: safe(event.origin, '—') + ' → ' + safe(event.destination, '—'),
      workType,
      km,
      dayKm,
      nightKm,
      metric: km > 0 ? production / km : 0,
      production,
      dayProduction,
      nightProduction,
      chief,
      instructor: instructorPay,
      night: nightProduction,
      total: production + chief + instructorPay,
      chiefEligible,
      dayRateApplied,
      nightRateApplied,
      payRule: payRule.reason,
      extraFlight: payRule.extra,
      source: cfg.source,
    };
  });
  const activityEvents = events.filter((event) => event.kind !== 'flight' && !event.placeholder);
  const reserveEvents = activityEvents.filter((event) => /\b(ASB|RES|RESERVA|RSV)\b/i.test(financialEventCode(event)));
  const standbyEvents = activityEvents.filter((event) => /\b(HSB|HSBE|SOBREAVISO)\b/i.test(financialEventCode(event)));
  const reserveHours = reserveEvents.reduce((sum, event) => sum + durationHours(event), 0);
  const standbyHours = standbyEvents.reduce((sum, event) => sum + durationHours(event), 0);
  const reserve = reserveHours * cfg.reserveHourMetric;
  const standby = standbyHours * cfg.standbyHourMetric;
  const sectors = flightEvents.length;
  const kmTotal = rows.reduce((sum, row) => sum + row.km, 0);
  const dayKmTotal = rows.reduce((sum, row) => sum + row.dayKm, 0);
  const nightKmTotal = rows.reduce((sum, row) => sum + row.nightKm, 0);
  const blockHours = flightEvents.reduce((sum, event) => sum + durationHours(event), 0);
  const chiefSectors = rows.filter((row) => row.chiefEligible).length;
  const nightHours = flightEvents.reduce((sum, event) => sum + nightHoursInsideWindow(eventStartDateTime(event), eventEndDateTime(event)), 0);
  const dayProduction = rows.reduce((sum, row) => sum + row.dayProduction, 0);
  const nightProduction = rows.reduce((sum, row) => sum + row.nightProduction, 0);
  const production = dayProduction + nightProduction;
  const chief = rows.reduce((sum, row) => sum + row.chief, 0);
  const instructorPay = rows.reduce((sum, row) => sum + row.instructor, 0);
  const gross = cfg.basePay + cfg.fixedAdditions + production + chief + instructorPay + reserve + standby;
  const inss = Math.max(0, cfg.inssDeduction);
  const irrf = Math.max(0, cfg.irrfDeduction);
  const otherDeductions = Math.max(0, cfg.otherDeductions);
  const fgts = gross * cfg.fgtsRate / 100;
  const net = Math.max(0, gross - inss - irrf - otherDeductions);
  return {
    rows,
    sectors,
    kmTotal,
    dayKmTotal,
    nightKmTotal,
    blockHours,
    chiefSectors,
    nightHours,
    reserveHours,
    standbyHours,
    production,
    dayProduction,
    nightProduction,
    reserve,
    standby,
    chief,
    instructorPay,
    night: nightProduction,
    gross,
    inss,
    irrf,
    otherDeductions,
    fgts,
    net,
    config: cfg,
    configured: cfg.configured,
  };
}
function PerDiemView({ bundle }: { bundle: BundleState }) {
  const events = buildLegs(bundle.roster);
  const [revision, setRevision] = useState(0);
  const forecast = useMemo(() => calculatePerDiem(events, bundle.roster), [bundle.roster, revision]);

  function configureExchange() {
    const currencies = (Object.keys(forecast.totalsByCurrency) as PerDiemCurrency[]).filter((currency) => currency !== 'BRL');
    currencies.forEach((currency) => {
      const key = 'crewcheck_fx_' + currency.toLowerCase() + '_brl';
      const value = prompt('Cotação informada: 1 ' + currency + ' em BRL', storage.get(key, ''));
      if (value !== null) storage.set(key, value.replace(',', '.'));
    });
    setRevision((value) => value + 1);
    toast.success('Câmbio atualizado para esta previsão.');
  }

  return <><Brand back/>
    <section className="cz-panel-head cz-panel-head-compact">
      <h1>Diárias</h1>
      <p>Valores previstos por janela e moeda.</p>
    </section>
    <section className="cz-finance-grid">
      <KpiCard icon={BriefcaseBusiness} title="Totais por moeda" value={String(forecast.currencyCount)} detail={forecast.currencySummary || 'Sem itens previstos'}/>
      <KpiCard icon={CalendarDays} title="Convertido previsto" value={forecast.pendingCurrencies.length ? 'Câmbio pendente' : moneyBRL(forecast.monthly)} detail={forecast.pendingCurrencies.length ? 'Informe ' + forecast.pendingCurrencies.join(', ') : 'Conversão conferível'}/>
      <KpiCard icon={Plane} title="Semana atual" value={moneyBRL(forecast.weekly)} detail="Somente valores convertidos"/>
    </section>
    {forecast.pendingCurrencies.length > 0 && <section className="cz-toolbox cz-finance-attention">
      <h2>Câmbio necessário</h2>
      <p>Informe a cotação para converter {forecast.pendingCurrencies.join(', ')} sem somar moedas diferentes.</p>
      <div className="cz-tool-actions"><button onClick={configureExchange}><DollarSign/> Informar câmbio</button></div>
    </section>}
    {forecast.pendingAirports.length > 0 && <section className="cz-toolbox cz-finance-attention">
      <h2>Classificação pendente</h2>
      <p>{forecast.pendingAirports.join(' · ')}. O valor permanece fora do total até a calibração administrativa.</p>
    </section>}
    <section className="cz-finance-table">
      <h2>Itens previstos</h2>
      {forecast.rows.length ? forecast.rows.slice(0, 40).map((row, index) =>
        <div className="cz-finance-row" key={row.iso + '-' + row.label + '-' + index}>
          <span>{row.date}</span>
          <strong>{row.label} · {row.airport}</strong>
          <small>{row.source}{row.convertedBRL === null ? ' · câmbio pendente' : ''}</small>
          <b>{moneyCurrency(row.value, row.currency)}</b>
        </div>
      ) : <article className="cz-empty-real"><BriefcaseBusiness/><h2>Sem diárias confirmadas</h2><p>Carregue uma escala com voos, reservas ou pernoites.</p></article>}
    </section>
  </>;
}

function SalaryReliableView({ bundle }: { bundle: BundleState }) {
  const events = buildLegs(bundle.roster);
  const compliance = currentCompliance(bundle);
  const salary = useMemo(() => calculateSalary(events, bundle.roster), [bundle.roster]);
  const variable = salary.production + salary.chief + salary.instructorPay + salary.reserve + salary.standby;
  const deductions = salary.inss + salary.irrf + salary.otherDeductions;

  return <><Brand back/>
    <section className="cz-panel-head cz-panel-head-compact">
      <h1>Salário</h1>
      <p>Previsão auditável por voo e função.</p>
    </section>
    <section className="cz-finance-grid">
      <KpiCard icon={DollarSign} title="Bruto previsto" value={salary.configured ? moneyBRL(salary.gross) : 'Calibração pendente'} detail={salary.kmTotal + ' km · ' + salary.sectors + ' setores'}/>
      <KpiCard icon={DollarSign} title="Líquido previsto" value={salary.configured ? moneyBRL(salary.net) : 'Calibração pendente'} detail={moneyBRL(deductions) + ' em descontos informados'}/>
      <KpiCard icon={Plane} title="Parcela variável" value={moneyBRL(variable)} detail="voos + reserva + sobreaviso + adicionais"/>
    </section>
    {salary.config.requiresManualFunction && <section className="cz-toolbox cz-finance-attention"><h2>Função pendente</h2><p>Confirme Comandante/Copiloto e aeronave nas configurações administrativas antes de usar a previsão.</p></section>}
    <section className="cz-finance-table">
      <h2>Ganhos variáveis por voo</h2>
      {salary.rows.length ? salary.rows.slice(0, 40).map((row) =>
        <div className={'cz-finance-row ' + (row.workType === 'PS' ? 'work-ps' : row.workType === 'OP' ? 'work-op' : '')} key={row.id}>
          <span>{row.date}</span>
          <strong>{row.flight} · {workTypeLabel(row.workType)} · {row.route}</strong>
          <small>{row.dayKm + ' km diurno × ' + moneyBRL(row.dayRateApplied)
            + '/km · ' + row.nightKm + ' km noturno × ' + moneyBRL(row.nightRateApplied)
            + '/km · ' + row.payRule
            + ' · ' + (row.chiefEligible ? '1º CCM identificado' : 'sem adicional de chefe')}</small>
          <b>{moneyBRL(row.total)}</b>
        </div>
      ) : <article className="cz-empty-real"><DollarSign/><h2>Sem voos detectados</h2><p>Importe a escala oficial para relacionar os setores aos valores vigentes.</p></article>}
    </section>
    <section className="cz-finance-table">
      <h2>Composição rastreável</h2>
      <div className="cz-finance-row"><span>Salário-base</span><strong>Calibrado</strong><small>valor confirmado pelo administrador</small><b>{moneyBRL(salary.config.basePay)}</b></div>
      <div className="cz-finance-row"><span>Adicionais fixos</span><strong>Calibrados</strong><small>valor vigente</small><b>{moneyBRL(salary.config.fixedAdditions)}</b></div>
      <div className="cz-finance-row"><span>Produtividade diurna</span><strong>{salary.dayKmTotal} km</strong><small>cada KM classificado uma única vez</small><b>{moneyBRL(salary.dayProduction)}</b></div>
      <div className="cz-finance-row"><span>Produtividade noturna</span><strong>{salary.nightKmTotal} km</strong><small>janela local 22:00–05:00</small><b>{moneyBRL(salary.nightProduction)}</b></div>
      <div className="cz-finance-row"><span>Reserva</span><strong>{salary.reserveHours.toFixed(1)} h</strong><small>{moneyBRL(salary.config.reserveHourMetric)}/h · sem dobra</small><b>{moneyBRL(salary.reserve)}</b></div>
      <div className="cz-finance-row"><span>Sobreaviso</span><strong>{salary.standbyHours.toFixed(1)} h</strong><small>{moneyBRL(salary.config.standbyHourMetric)}/h · sem dobra</small><b>{moneyBRL(salary.standby)}</b></div>
      <div className="cz-finance-row"><span>Chefe / instrutor</span><strong>{salary.chiefSectors} setor(es)</strong><small>atividade em solo não recebe dobra de KM</small><b>{moneyBRL(salary.chief + salary.instructorPay)}</b></div>
      <div className="cz-finance-row muted"><span>INSS</span><strong>Informado</strong><small>não calculado por tabela presumida</small><b>-{moneyBRL(salary.inss)}</b></div>
      <div className="cz-finance-row muted"><span>IRRF</span><strong>Informado</strong><small>não calculado por tabela presumida</small><b>-{moneyBRL(salary.irrf)}</b></div>
      <div className="cz-finance-row muted"><span>Outros descontos</span><strong>Informados</strong><small>benefícios, consignados ou ajustes</small><b>-{moneyBRL(salary.otherDeductions)}</b></div>
      {salary.config.fgtsRate > 0 && <div className="cz-finance-row"><span>FGTS</span><strong>{salary.config.fgtsRate}%</strong><small>informativo; não descontado do líquido</small><b>{moneyBRL(salary.fgts)}</b></div>}
    </section>
    <section className="cz-toolbox cz-finance-reliability">
      <ShieldCheck/><div><h2>Conferência</h2><p>{actionableComplianceAlerts(compliance).length} alerta(s) operacional(is). Reserva e sobreaviso permanecem em valor simples. Voo extra/DFS ou acionado usa a tarifa superior uma única vez, sem redobrar o trecho noturno.</p></div>
    </section>
  </>;
}

function ReportsView({ bundle }: { bundle: BundleState }) {
  const compliance = currentCompliance(bundle);
  return <><Brand back/><section className="cz-panel-head"><h1>Relatórios</h1><p>Indicadores premium de jornada, repouso, horas, carga, academia, rotina e alertas.</p></section><section className="cz-report-grid"><article><h2>Conformidade</h2><strong>{(compliance as any).score ?? '—'}/100</strong><p>{(compliance as any).summary || 'Resumo indisponível'}</p></article><article><h2>Carga</h2><strong>{(compliance as any).loadAnalysis?.intensityScore ?? '—'}</strong><p>Índice de intensidade da escala.</p></article><article><h2>Alertas</h2><strong>{actionableComplianceAlerts(compliance).length}</strong><p>Itens confirmados e para revisão.</p></article></section></>;
}
function CalendarToolsView({ actions, bundle, gym }: { actions: QuickActions; bundle: BundleState; gym: any[] }) {
  const [calendars, setCalendars] = useState<GoogleCalendarOption[]>([]);
  const [settings, setSettings] = useState<GoogleCalendarSettings>(() => loadGoogleCalendarSettings());
  const [busy, setBusy] = useState(false);
  async function loadCalendars() {
    setBusy(true);
    try {
      await connectGoogleCalendar();
      const list = await listGoogleCalendars();
      setCalendars(list);
      const current = list.find((item) => item.id === settings.selectedCalendarId) || list[0];
      if (current) {
        const saved = saveGoogleCalendarSettings({ ...settings, selectedCalendarId: current.id, selectedCalendarName: current.summary });
        setSettings(saved);
      }
      toast.success('Calendários carregados.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não consegui carregar seus calendários.');
    } finally {
      setBusy(false);
    }
  }
  function selectCalendar(id: string) {
    const selected = calendars.find((calendar) => calendar.id === id) || { id, summary: id };
    const saved = saveGoogleCalendarSettings({ ...settings, selectedCalendarId: selected.id, selectedCalendarName: selected.summary });
    setSettings(saved);
    toast.success(`Calendário selecionado: ${selected.summary}`);
  }
  async function syncSelected() {
    setBusy(true);
    try {
      await connectGoogleCalendar();
      const saved = loadGoogleCalendarSettings();
      const result = await syncRosterToGoogleCalendar(bundle.roster, saved, { gymRecommendations: gym });
      toast.success(`Google Calendar: ${(result as any).total || 0} eventos sincronizados em ${saved.selectedCalendarName || saved.selectedCalendarId}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não consegui sincronizar o Google Calendar.');
    } finally {
      setBusy(false);
    }
  }
  return <><Brand back/><section className="cz-panel-head"><h1>Calendário</h1><p>Escolha o calendário de destino, sincronize a escala e mantenha ICS como fallback.</p></section><section className="cz-toolbox"><h2>Calendário de destino</h2><p>{settings.selectedCalendarName || settings.selectedCalendarId || 'Calendário principal'}</p><div className="cz-tool-actions"><button onClick={loadCalendars} disabled={busy}><CalendarDays/> Carregar calendários</button><button onClick={syncSelected} disabled={busy}><CalendarDays/> Sincronizar selecionado</button><button onClick={actions.ics}>Baixar ICS</button></div>{calendars.length > 0 && <select className="cz-calendar-select" value={settings.selectedCalendarId} onChange={(event) => selectCalendar(event.target.value)}>{calendars.map((calendar) => <option key={calendar.id} value={calendar.id}>{calendar.summary}{calendar.primary ? ' · principal' : ''}</option>)}</select>}</section><section className="cz-diagnostics">{googleCalendarIntegrationDiagnostics().map((d: any) => <p key={d.label}><strong>{d.label}</strong><span>{d.value}</span></p>)}</section></>;
}
function ExportToolsView({ actions }: { actions: QuickActions }) {
  return <><Brand back/><section className="cz-panel-head"><h1>Exportar e compartilhar</h1><p>PDF, compartilhamento nativo, e-mail interno com anexo, WhatsApp, Telegram e calendário.</p></section><section className="cz-toolbox"><div className="cz-tool-actions"><button onClick={actions.pdf}>Baixar PDF</button><button onClick={actions.sharePdf}>Compartilhar PDF</button><button onClick={actions.email}>E-mail com PDF</button><button onClick={actions.whatsapp}>WhatsApp</button><button onClick={actions.telegram}>Telegram</button><button onClick={actions.copy}>Copiar</button><button onClick={actions.ics}>ICS</button><button onClick={actions.google}>Google Calendar</button></div></section></>;
}

function wakeupLeadMinutes(): number {
  const value = Number(storage.get('crewcheck_wakeup_lead_minutes', '90'));
  return Number.isFinite(value) && value >= 20 ? value : 90;
}
function wakeupChannel(): string {
  return storage.get('crewcheck_wakeup_channel', 'telegram') || 'telegram';
}
function wakeupChannelLabel(channel: string): string {
  const value = String(channel || '').toLowerCase();
  if (value === 'telegram-call') return 'Ligação via Telegram';
  if (value.includes('ambos') || value.includes('telegram+lig')) return 'Ligação telefônica + Telegram';
  if (value.includes('liga')) return 'Somente ligação telefônica';
  return 'Mensagem no Telegram';
}
function wakeupDateForEvent(event: ZeroLeg): Date | null {
  if (!event || event.placeholder) return null;
  const base = eventStartDateTime(event);
  const presentation = String(event.presentation || '').match(/(\d{1,2}):(\d{2})/);
  const d = new Date(base);
  if (presentation) d.setHours(Number(presentation[1]), Number(presentation[2]), 0, 0);
  d.setMinutes(d.getMinutes() - wakeupLeadMinutes());
  return d;
}
function wakeupDateLabel(date: Date | null): string {
  if (!date) return 'Aguardando escala';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}
async function postCrewCheckJson(url: string, payload: Record<string, unknown>): Promise<any> {
  return authFetch<any>(url, { method: 'POST', body: JSON.stringify(payload), cache: 'no-store' });
}

function WakeupView({ event }: { event: ZeroLeg }) {
  const [lead, setLead] = useState(() => String(wakeupLeadMinutes()));
  const [channel, setChannel] = useState(() => wakeupChannel());
  const [chatId, setChatId] = useState(() => storage.get('crewcheck_telegram_chat_id', ''));
  const [phone, setPhone] = useState(() => storage.get('crewcheck_wakeup_phone', ''));
  const [health, setHealth] = useState<any>(null);
  const [activeTest, setActiveTest] = useState('');
  const admin = isAdmin();
  const planned = wakeupDateForEvent(event);
  const hotel = safe(event.hotel, event.kind === 'stay' ? `Hotel em ${city(event.destination || event.origin)}` : 'Sem hotel informado');
  const presentation = safe(event.presentation, 'A confirmar');

  useEffect(() => {
    Promise.all([
      fetch('/api/alarm/health', { cache: 'no-store' }).then((r) => r.json()),
      getPlatformBilling().catch(() => null),
    ])
      .then(([alarm, billing]) => setHealth({ ...(alarm || {}), usage: billing?.usage || null }))
      .catch(() => setHealth({ ok: false, message: 'Despertador aguardando conexão.' }));
  }, []);

  function savePrefs() {
    storage.set('crewcheck_wakeup_lead_minutes', lead);
    storage.set('crewcheck_wakeup_channel', channel);
    storage.set('crewcheck_telegram_chat_id', chatId);
    if (admin) storage.set('crewcheck_wakeup_phone', phone);
    toast.success('Preferências do despertador salvas.');
  }

  async function testAlarm(testType: 'telegram-message' | 'telegram-call' | 'phone-call') {
    savePrefs();
    setActiveTest(testType);
    try {
      const payload = await postCrewCheckJson('/api/alarm/test', {
        testType,
        channel,
        chatId,
        phone: admin ? phone : '',
        message: `Teste do Despertador Inteligente CrewCheck. Próxima programação: ${rosterEventTitle(event)} · apresentação ${presentation}.`,
      });
      if (payload?.ok) toast.success(payload.message || 'Teste enviado.');
      else toast.message(payload?.message || 'Canal aguardando configuração.');
      setHealth((current: any) => ({ ...(current || {}), ...(payload?.health || {}), usage: payload?.usage || current?.usage || null, lastTest: payload }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não consegui testar o despertador agora.');
    } finally {
      setActiveTest('');
    }
  }

  function activateLocalReminder() {
    savePrefs();
    if (!planned) { toast.info('Importe uma escala para ativar o lembrete.'); return; }
    const delay = planned.getTime() - Date.now();
    if (delay <= 0) { toast.message('O horário calculado já passou para esta programação.'); return; }
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
      window.setTimeout(() => notifyCrewCheck('Despertador CrewCheck', `Hora de se preparar para ${rosterEventTitle(event)}. Apresentação ${presentation}.`), Math.min(delay, 2147483647));
      toast.success('Lembrete local ativado neste dispositivo.');
    } catch {
      toast.message('Preferência salva. Use Telegram/ligação quando o canal estiver configurado.');
    }
  }

  function snoozeTelegram() {
    const next = new Date(Date.now() + 10 * 60000);
    toast.success(`Soneca local de 10 min ativada até ${wakeupDateLabel(next)}.`);
    window.setTimeout(() => notifyCrewCheck('Soneca CrewCheck', 'Soneca encerrada. Confira sua apresentação.'), 10 * 60000);
  }

  return <><Brand back/><section className="cz-panel-head"><h1>Despertador Inteligente</h1><p>Mensagens Telegram ficam disponíveis para todos; ligações via Telegram respeitam a franquia mensal do plano. O teste telefônico segue exclusivo do administrador.</p></section><section className="cz-finance-grid"><KpiCard icon={Clock} title="Horário calculado" value={wakeupDateLabel(planned)} detail={`${lead} min antes da apresentação`}/><KpiCard icon={Bell} title="Canal" value={wakeupChannelLabel(channel)} detail={health?.message || 'Verificando configuração'}/><KpiCard icon={Hotel} title="Hotel/local" value={hotel} detail={`Apresentação ${presentation}`}/></section><section className="cz-toolbox cz-wakeup-card"><h2>Configuração do despertador</h2><p>Vincule o bot para liberar mensagens e ligações via Telegram. Cada ligação via Telegram consome uma unidade da franquia mensal; mensagens e lembretes locais não consomem. O teste telefônico usa as credenciais do servidor e só aparece para o administrador.</p><div className="cz-form-grid"><label><span>Canal preferido</span><select value={channel} onChange={(e) => setChannel(e.target.value)}><option value="telegram">Mensagem no Telegram</option><option value="telegram-call">Ligação via Telegram</option>{admin && <option value="ligacao">Ligação telefônica</option>}{admin && <option value="ambos">Ligação telefônica + Telegram</option>}</select></label><label><span>Antecedência</span><select value={lead} onChange={(e) => setLead(e.target.value)}><option value="60">60 min antes</option><option value="75">75 min antes</option><option value="90">90 min antes</option><option value="120">120 min antes</option></select></label><label><span>Chat do Telegram</span><input value={chatId} onChange={(e) => setChatId(e.target.value)} placeholder="Preenchido ao vincular o bot"/></label>{admin && <label><span>Telefone do administrador com DDI</span><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+5561999999999"/></label>}</div><div className="cz-tool-actions"><button onClick={savePrefs}><Save/> Salvar preferências</button><button onClick={openTelegramBinding}><Send/> Vincular Telegram</button><button onClick={() => testAlarm('telegram-message')} disabled={Boolean(activeTest)}><Send/> {activeTest === 'telegram-message' ? 'Enviando...' : 'Testar Telegram'}</button><button onClick={() => testAlarm('telegram-call')} disabled={Boolean(activeTest)}><Phone/> {activeTest === 'telegram-call' ? 'Ligando...' : 'Testar ligação via Telegram'}</button>{admin && <button onClick={() => testAlarm('phone-call')} disabled={Boolean(activeTest)}><Phone/> {activeTest === 'phone-call' ? 'Ligando...' : 'Teste de ligação do admin'}</button>}<button onClick={activateLocalReminder}><Bell/> Ativar lembrete local</button><button onClick={snoozeTelegram}><Clock/> Soneca 10 min</button></div></section><section className="cz-stack-list"><article className="cz-roster-card"><div className="cz-roster-main"><span className="cz-roster-icon"><Bell/></span><div className="cz-roster-copy"><h3>{rosterEventTitle(event)}</h3><p>{programDateLabel(event)} · apresentação {presentation}</p><small>{event.origin} → {event.destination} · {health?.telegram ? 'Telegram configurado' : 'Telegram aguardando vínculo'} · {health?.telegramCall ? 'Ligação Telegram disponível' : 'Ligação Telegram requer usuário autorizado'} · {health?.phoneCall ? 'Ligação admin configurada' : 'Ligação admin aguardando canal'}</small></div><ChevronRight className="cz-roster-chevron"/></div><div className="cz-routine-strip"><span>Telegram para todos</span><span>{health?.usage ? `${health.usage.used} / ${health.usage.limit} ligações no mês` : 'Franquia por plano'}</span><span>Teste admin protegido</span><span>Fallback local</span></div></article></section></>;
}

function PresentationManagerView({ events }: { events: ZeroLeg[] }) {
  const [revision, setRevision] = useState(0);
  const candidates = events.filter((event) => !event.placeholder && event.presentation && event.presentation !== '—' && event.presentation !== 'Conexão/Solo').slice(0, 40);
  const rules = useMemo(() => Object.values(loadPresentationRules()), [revision]);
  const overrides = useMemo(() => loadPresentationOverrides(), [revision]);
  const refresh = () => setRevision((value) => value + 1);
  function edit(event: ZeroLeg, learn: boolean) {
    try {
      if (!promptPresentation(event, learn)) return;
      refresh();
      toast.success(learn ? 'Horário aprendido para este hotel/local.' : 'Apresentação alterada nesta programação.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não consegui alterar a apresentação.');
    }
  }
  function resetOverride(event: ZeroLeg) {
    clearPresentationOverride(event);
    refresh();
    toast.success('Ajuste desta programação removido.');
  }
  function resetLearning(event: ZeroLeg) {
    clearPresentationLearning(event);
    refresh();
    toast.success('Aprendizado deste hotel/local removido.');
  }
  return <><Brand back/><section className="cz-panel-head"><h1>Gerenciador de Apresentação</h1><p>Ajuste um evento ou ensine um horário recorrente por hotel/local. A escala publicada continua preservada e pode ser restaurada a qualquer momento.</p></section><section className="cz-finance-grid"><KpiCard icon={Clock} title="Programações" value={String(candidates.length)} detail="Com apresentação"/><KpiCard icon={Save} title="Ajustes manuais" value={String(Object.keys(overrides).length)} detail="Somente eventos escolhidos"/><KpiCard icon={Building2} title="Locais aprendidos" value={String(rules.length)} detail="Hotel ou base"/></section><section className="cz-toolbox"><h2>Aprendizado ativo</h2><p>{rules.length ? rules.map((rule) => `${rule.label}: ${rule.presentation} (${Math.round(rule.confidence * 100)}%)`).join(' · ') : 'Nenhum padrão aprendido. Use “Aprender hotel/local” em uma programação.'}</p></section><section className="cz-stack-list">{candidates.length ? candidates.map((event) => { const managed = managedPresentationForEvent(event); const learned = loadPresentationRules()[presentationLearningKey(event)]; const overridden = loadPresentationOverrides()[presentationOverrideKey(event)]; return <article className="cz-roster-card" key={`presentation-${event.id}-${revision}`}><div className="cz-roster-main"><span className="cz-roster-icon"><Clock/></span><div className="cz-roster-copy"><h3>{rosterEventTitle(event)}</h3><p>{programDateLabel(event)} · {event.origin} → {event.destination}</p><small>{presentationLearningLabel(event)} · fonte: {managed.source}</small></div><strong className="cz-roster-time">{managed.presentation}</strong></div><div className="cz-tool-actions"><button onClick={() => edit(event, false)}><Clock/> Alterar esta programação</button><button onClick={() => edit(event, true)}><Building2/> Aprender hotel/local</button>{overridden && <button onClick={() => resetOverride(event)}><RotateCcw/> Restaurar escala publicada</button>}{learned && <button onClick={() => resetLearning(event)}><X/> Esquecer hotel/local</button>}</div></article>; }) : <article className="cz-empty-real"><Clock/><h2>Sem apresentações ajustáveis</h2><p>Importe uma escala com programações futuras para gerenciar horários.</p></article>}</section></>;
}

function HotelsView({ events }: { events: ZeroLeg[] }) {
  const stays = events.filter((event) => event.kind === 'stay' || event.hotel);
  const [saved, setSaved] = useState<any[]>([]);
  const [companions, setCompanions] = useState<Record<string, any[]>>({});
  const [selectedEventId, setSelectedEventId] = useState(() => stays[0]?.id || '');
  const [query, setQuery] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({ hotelName: '', airport: '', stayDate: '', room: '', presentationTime: '', leadMinutes: '90', shareSameHotel: false, shareWithVisitors: false });
  const selectedEvent = stays.find((event) => event.id === selectedEventId) || stays[0] || null;
  const targetAirport = selectedEvent?.destination || selectedEvent?.origin || '';
  const catalogResults = useMemo(() => searchCrewHotels(query, targetAirport), [query, targetAirport]);
  const refresh = () => listPlatformStays().then((payload) => setSaved(payload.stays || [])).catch(() => undefined);

  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    if (!selectedEventId && stays[0]) setSelectedEventId(stays[0].id);
  }, [selectedEventId, stays]);

  function savedFor(event: ZeroLeg) {
    const date = rosterDayIso(event.day);
    const name = safe(event.hotel, `Hotel em ${city(event.destination)}`);
    return saved.find((item) => String(item.stayDate || '').slice(0, 10) === date && String(item.hotelName || '').toLocaleLowerCase() === name.toLocaleLowerCase())
      || saved.find((item) => String(item.stayDate || '').slice(0, 10) === date);
  }

  function openEditor(event = selectedEvent, hotel?: CrewHotelCatalogEntry) {
    const current = event ? savedFor(event) : null;
    setDraft({
      hotelName: hotel?.name || current?.hotelName || safe(event?.hotel, ''),
      airport: hotel?.airport || event?.destination || event?.origin || current?.airport || '',
      stayDate: event ? rosterDayIso(event.day) : new Date().toISOString().slice(0, 10),
      room: current?.room || '',
      presentationTime: current?.presentationTime || safe(event?.presentation, ''),
      leadMinutes: String(current?.leadMinutes || 90),
      shareSameHotel: Boolean(current?.shareSameHotel),
      shareWithVisitors: Boolean(current?.shareWithVisitors),
    });
    if (event) setSelectedEventId(event.id);
    setEditorOpen(true);
  }

  async function saveDraft() {
    if (!draft.hotelName.trim() || !draft.stayDate) return toast.error('Informe o hotel e a data do pernoite.');
    const current = selectedEvent ? savedFor(selectedEvent) : null;
    setSaving(true);
    try {
      await updatePlatformStay({
        id: current?.id,
        stayDate: draft.stayDate,
        hotelName: draft.hotelName.trim(),
        airport: draft.airport.trim().toUpperCase(),
        room: draft.room.trim(),
        presentationTime: draft.presentationTime.trim(),
        leadMinutes: Number(draft.leadMinutes) || 90,
        learnRule: true,
        shareSameHotel: draft.shareSameHotel,
        shareWithVisitors: draft.shareWithVisitors,
      });
      await refresh();
      setEditorOpen(false);
      toast.success('Hotel salvo no pernoite. O CrewCheck vai lembrar desta escolha.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não consegui salvar o hotel.');
    } finally {
      setSaving(false);
    }
  }

  async function loadCompanions(event: ZeroLeg) {
    const current = savedFor(event);
    if (!current?.hotelKey) return toast.info('Salve primeiro este pernoite para consultar colegas.');
    try {
      const payload = await findHotelCompanions(current.hotelKey, String(current.stayDate).slice(0, 10));
      setCompanions((state) => ({ ...state, [event.id]: payload.companions || [] }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não consegui consultar colegas.');
    }
  }

  return <><Brand back/>
    <section className="cz-panel-head cz-panel-head-compact"><h1>Hotéis e pernoites</h1><p>Escolha pela escala, catálogo de aeroportos, localização atual ou informe o hotel manualmente.</p></section>
    <section className="cz-toolbox cz-hotel-finder">
      <header><div><Search/><span><small>CATÁLOGO CREWCHECK</small><h2>Encontrar hotel</h2></span></div><strong>{CREW_HOTEL_CATALOG.length} hotéis cadastrados</strong></header>
      {stays.length > 1 && <label className="cz-field-wide"><span>Pernoite que deseja atualizar</span><select value={selectedEvent?.id || ''} onChange={(event) => setSelectedEventId(event.target.value)}>{stays.map((stay) => <option key={stay.id} value={stay.id}>{dateChip(stay.date)} · {stay.destination || stay.origin} · {safe(stay.hotel, 'Hotel a definir')}</option>)}</select></label>}
      <div className="cz-search-row"><label><Search/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Hotel, cidade ou aeroporto"/></label><button className="primary" onClick={() => openNearbyPlaces('hotel', '', 'current')}><LocateFixed/> Perto de mim</button><button onClick={() => openEditor()}><Plus/> Informar manualmente</button></div>
      <div className="cz-hotel-catalog-results">{catalogResults.map((hotel) => <article key={`${hotel.name}-${hotel.airport}`}><div><span className="cz-card-icon"><Hotel/></span><span><strong>{hotel.name}</strong><small>{[hotel.city, hotel.region, hotel.country].filter(Boolean).join(' · ')}</small></span></div><b>{[hotel.airport, hotel.alternateAirport].filter(Boolean).join(' / ')}</b><div className="cz-tool-actions"><button className="primary" onClick={() => openEditor(selectedEvent, hotel)}><Check/> Usar neste pernoite</button><button onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${hotel.name} ${hotel.city}`)}`, '_blank', 'noopener,noreferrer')}><MapPin/> Ver localização</button></div></article>)}</div>
      {!catalogResults.length && <div className="cz-inline-empty"><Hotel/><span><strong>Hotel não encontrado na lista</strong><small>Você ainda pode procurar perto da sua localização ou informar os dados manualmente.</small></span><button onClick={() => openEditor()}><Plus/> Cadastrar hotel</button></div>}
    </section>

    {editorOpen && <section className="cz-toolbox cz-manual-hotel-form"><header><div><Plus/><span><small>CADASTRO MANUAL</small><h2>Dados do hotel</h2></span></div><button className="cz-icon-button" aria-label="Fechar cadastro" onClick={() => setEditorOpen(false)}><X/></button></header><div className="cz-form-grid"><label className="wide"><span>Nome do hotel</span><input value={draft.hotelName} onChange={(event) => setDraft({ ...draft, hotelName: event.target.value })} placeholder="Ex.: Hotel próximo ao aeroporto"/></label><label><span>Aeroporto</span><input value={draft.airport} onChange={(event) => setDraft({ ...draft, airport: event.target.value.toUpperCase() })} placeholder="BSB" maxLength={8}/></label><label><span>Data</span><input type="date" value={draft.stayDate} onChange={(event) => setDraft({ ...draft, stayDate: event.target.value })}/></label><label><span>Apresentação/saída</span><input type="time" value={draft.presentationTime} onChange={(event) => setDraft({ ...draft, presentationTime: event.target.value })}/></label><label><span>Antecedência</span><input type="number" min="0" max="720" value={draft.leadMinutes} onChange={(event) => setDraft({ ...draft, leadMinutes: event.target.value })}/></label><label className="wide"><span>Quarto <small>privado e criptografado</small></span><input value={draft.room} onChange={(event) => setDraft({ ...draft, room: event.target.value })} placeholder="Opcional"/></label></div><div className="cz-consent-row"><label><input type="checkbox" checked={draft.shareSameHotel} onChange={(event) => setDraft({ ...draft, shareSameHotel: event.target.checked })}/><span>Mostrar presença a colegas no mesmo hotel, sem exibir o quarto</span></label><label><input type="checkbox" checked={draft.shareWithVisitors} onChange={(event) => setDraft({ ...draft, shareWithVisitors: event.target.checked })}/><span>Compartilhar o hotel com visitantes autorizados</span></label></div><div className="cz-tool-actions"><button className="primary" onClick={saveDraft} disabled={saving}><Save/> {saving ? 'Salvando…' : 'Salvar hotel'}</button><button onClick={() => setEditorOpen(false)}><X/> Cancelar</button></div></section>}

    <section className="cz-stack-list cz-hotel-stays">{stays.length ? stays.map((event) => { const loc = hotelSearchLocation(event); const current = savedFor(event); const people = companions[event.id] || []; return <article className="cz-roster-card cz-hotel-stay-card" key={`hotel-${event.id}`}><div className="cz-roster-main"><span className="cz-roster-icon"><Hotel/></span><div className="cz-roster-copy"><h3>{current?.hotelName || safe(event.hotel, `Hotel em ${city(event.destination)}`)}</h3><p>{dateChip(event.date)} · {event.origin} → {event.destination}</p><small>{safe((event.day as any).hotelAddress || (event.day as any).address, 'Endereço a confirmar')}</small></div><ChevronRight className="cz-roster-chevron"/></div><div className="cz-detail-grid"><div><span>Quarto</span><strong>{current?.room || 'Privado · não informado'}</strong></div><div><span>Apresentação</span><strong>{current?.presentationTime || safe(event.presentation, 'A confirmar')}</strong></div><div><span>Antecedência</span><strong>{current?.leadMinutes ? `${current.leadMinutes} min` : 'Ainda não aprendida'}</strong></div><div><span>Visibilidade</span><strong>{current?.shareSameHotel ? 'Colegas autorizados' : 'Somente você'}</strong></div></div><div className="cz-tool-actions"><button className="primary" onClick={() => openEditor(event)}><Save/> Editar pernoite</button><button onClick={() => loadCompanions(event)}><UserRound/> Colegas no hotel</button><button onClick={() => openNearbyPlaces('gym', loc)}><Dumbbell/> Academias</button><button onClick={() => openNearbyPlaces('laundry', loc)}><WashingMachine/> Lavanderias</button><button onClick={() => openNearbyPlaces('pharmacy', loc)}><Pill/> Farmácias</button></div>{people.length > 0 && <div className="cz-routine-strip">{people.map((person) => <span key={person.publicId}>{person.displayName} · {person.publicId}</span>)}</div>}{companions[event.id] && !people.length && <p className="cz-mini-status">Nenhum colega compartilhou presença neste hotel e data.</p>}</article>; }) : <article className="cz-empty-real"><Hotel/><h2>Nenhum pernoite detectado</h2><p>Você pode cadastrar um hotel manualmente mesmo antes de importar a próxima escala.</p><button onClick={() => openEditor()}><Plus/> Informar hotel</button></article>}</section>
  </>;
}

function RoutineView({ bundle }: { bundle: BundleState }) {
  let suggestions: any[] = [];
  try { suggestions = buildRoutineSuggestions(analyzeDayLoads(bundle.roster).days, defaultRoutineActivities()).slice(0, 8); } catch {}
  const events = buildLegs(bundle.roster).filter((event) => !event.placeholder);
  const next = chronologicalNextRosterLeg(events);
  const hoursUntil = next ? Math.max(0, (eventStartDateTime(next).getTime() - Date.now()) / 36e5) : 0;
  const intensity = !next ? 'Aguardando' : hoursUntil <= 12 ? 'Recuperação' : hoursUntil <= 24 ? 'Leve' : 'Moderada';
  const nextDuty = next ? durationHours(next) : 0;
  return <><Brand back/><section className="cz-panel-head"><h1>Rotina inteligente</h1><p>Academia, recuperação, alimentação e descanso em função da carga real e da próxima apresentação.</p></section><section className="cz-finance-grid"><KpiCard icon={Dumbbell} title="Treino sugerido" value={intensity} detail={next ? `${Math.round(hoursUntil)} h até a programação` : 'Importe a escala'}/><KpiCard icon={Clock} title="Próxima jornada" value={next ? `${nextDuty.toFixed(1).replace('.', ',')} h` : '—'} detail={next ? `${rosterEventTitle(next)} · ${next.presentation}` : 'Sem programação'}/><KpiCard icon={Moon} title="Prioridade" value={hoursUntil <= 12 && next ? 'Sono' : 'Equilíbrio'} detail="sem competir com a escala"/></section><section className="cz-toolbox"><h2>Ações conectadas</h2><p>A rotina usa a mesma próxima programação do Radar, Despertador e Saída Inteligente.</p><div className="cz-tool-actions"><button onClick={() => openNearbyPlaces('gym', next ? hotelSearchLocation(next) : '')}><Dumbbell/> Academias próximas</button><button onClick={() => window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'wakeup' }))}><Bell/> Ajustar despertador</button><button onClick={() => window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'presentation' }))}><Clock/> Ver apresentação</button></div></section><section className="cz-stack-list">{suggestions.length ? suggestions.map((s:any, i:number) => <article className="cz-roster-card" key={i}><div className="cz-roster-main"><span className="cz-roster-icon"><ShieldCheck/></span><div className="cz-roster-copy"><h3>{s.title || s.activity || 'Sugestão de rotina'}</h3><p>{s.reason || s.description || 'Ajustado pela escala.'}</p></div></div><strong className="cz-roster-time">{s.suggestedTime || s.duration || '—'}</strong></article>) : <article className="cz-roster-card"><div className="cz-roster-copy"><h3>Rotina aguardando escala</h3><p>Carregue uma escala para receber recomendações sem dados fictícios.</p></div></article>}</section></>;
}

function BidsView({ events }: { events: ZeroLeg[] }) {
  const [daysOff, setDaysOff] = useState(() => storage.get('crewcheck:bids-days-off', ''));
  const [preferredBase, setPreferredBase] = useState(() => storage.get('crewcheck:bids-base', ''));
  const [avoidEarly, setAvoidEarly] = useState(() => storage.get('crewcheck:bids-avoid-early', '0') === '1');
  const [preferLayovers, setPreferLayovers] = useState(() => storage.get('crewcheck:bids-prefer-layovers', '0') === '1');
  const flights = events.filter((event) => event.kind === 'flight' && !event.placeholder);
  const layovers = events.filter((event) => event.kind === 'stay' || Boolean(event.hotel));
  const destinations = [...new Set(flights.map((event) => event.destination).filter(Boolean))];
  function saveBids() {
    storage.set('crewcheck:bids-days-off', daysOff.trim());
    storage.set('crewcheck:bids-base', preferredBase.trim().toUpperCase());
    storage.set('crewcheck:bids-avoid-early', avoidEarly ? '1' : '0');
    storage.set('crewcheck:bids-prefer-layovers', preferLayovers ? '1' : '0');
    toast.success('Preferências de BIDS salvas neste dispositivo.');
  }
  return <><Brand back/><section className="cz-panel-head"><h1>BIDS</h1><p>Organize preferências para a próxima escala sem alterar a programação oficial publicada.</p></section><section className="cz-finance-grid"><KpiCard icon={Plane} title="Voos atuais" value={String(flights.length)} detail={`${destinations.length} destino(s)`}/><KpiCard icon={Hotel} title="Pernoites atuais" value={String(layovers.length)} detail="referência da escala ativa"/><KpiCard icon={CalendarDays} title="Folgas desejadas" value={daysOff.trim() ? daysOff.trim().split(/[,;]+/).filter(Boolean).length.toString() : '0'} detail="preferências informadas"/></section><section className="cz-toolbox cc-bids-panel"><h2>Preferências da próxima escala</h2><p>O CrewCheck guarda sua intenção para comparação e planejamento. A aceitação final continua sendo feita no sistema oficial da companhia.</p><div className="cz-form-grid"><label><span>Dias de folga prioritários</span><input value={daysOff} onChange={(event) => setDaysOff(event.target.value)} placeholder="Ex.: 05, 12, 20 e 21"/></label><label><span>Base ou destino preferido</span><input value={preferredBase} onChange={(event) => setPreferredBase(event.target.value)} placeholder="Ex.: BSB, GRU"/></label></div><div className="cc-bids-options"><label><input type="checkbox" checked={avoidEarly} onChange={(event) => setAvoidEarly(event.target.checked)}/><span><strong>Evitar madrugadas</strong><small>Priorizar apresentações após o início da manhã.</small></span></label><label><input type="checkbox" checked={preferLayovers} onChange={(event) => setPreferLayovers(event.target.checked)}/><span><strong>Priorizar pernoites</strong><small>Usar os pernoites atuais como referência de preferência.</small></span></label></div><div className="cz-tool-actions"><button className="primary" onClick={saveBids}><Save/> Salvar preferências</button><button onClick={() => window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'compare' }))}><GitCompareArrows/> Comparar com escala publicada</button></div></section></>;
}

const DEFAULT_GYM_PARTNER_CHAINS = ['Selfit', 'Panobianco', 'Bluefit', 'Corpo e Saúde', 'Pratique', 'Fórmula', 'Bodytech', 'Fábrica de Monstros', 'Ultra'];

function configuredGymPartnerChains(): string[] {
  const custom = storage.get('crewcheck:gym-partner-chains', '').split(/[,;\n]/).map((item) => item.trim()).filter(Boolean);
  return custom.length ? custom.slice(0, 30) : DEFAULT_GYM_PARTNER_CHAINS;
}

function coordinateDistanceMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const radians = (value: number) => value * Math.PI / 180;
  const earth = 6_371_000;
  const dLat = radians(b.lat - a.lat);
  const dLon = radians(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * earth * Math.asin(Math.sqrt(h));
}

function GymsView({ events }: { events: ZeroLeg[] }) {
  const now = Date.now();
  const stays = events.filter((event) => event.kind === 'stay' || event.hotel)
    .sort((a, b) => eventStartDateTime(a).getTime() - eventStartDateTime(b).getTime());
  const currentStay = stays.find((event) => eventStartDateTime(event).getTime() <= now && eventEndDateTime(event).getTime() + 8 * 36e5 >= now);
  const upcomingStay = stays.find((event) => eventStartDateTime(event).getTime() > now);
  const target = currentStay || upcomingStay || null;
  const layoverLocation = target ? hotelSearchLocation(target) : '';
  const storedCategory = storage.get('crewcheck:places-category', 'gym') as PlaceCategory;
  const initialCategory: PlaceCategory = storedCategory in PLACE_CATEGORY_META ? storedCategory : 'gym';
  const storedLocation = storage.get('crewcheck:places-location', '');
  const storedMode = storage.get('crewcheck:places-mode', '') as 'layover' | 'current' | '';
  const [category, setCategory] = useState<PlaceCategory>(initialCategory);
  const [coordinates, setCoordinates] = useState<{ lat: number; lon: number } | null>(() => {
    const match = storage.get('crewcheck_last_geo', '').match(/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);
    return match ? { lat: Number(match[1]), lon: Number(match[2]) } : null;
  });
  const [locationMode, setLocationMode] = useState<'layover' | 'current'>(() => storedMode || ((storedLocation || target) ? 'layover' : 'current'));
  const [places, setPlaces] = useState<NearbyPlace[]>([]);
  const [manualPlaces, setManualPlaces] = useState<NearbyPlace[]>(() => loadManualPlaces());
  const [manualOpen, setManualOpen] = useState(false);
  const [manualDraft, setManualDraft] = useState({ name: '', address: '', openingHours: '' });
  const [searchTerm, setSearchTerm] = useState('');
  const [selected, setSelected] = useState<NearbyPlace | null>(null);
  const [crowding, setCrowding] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [amilProviders, setAmilProviders] = useState<AmilProvider[]>([]);
  const [amilMessage, setAmilMessage] = useState('');
  const [amilOnly24h, setAmilOnly24h] = useState(false);
  const [plan, setPlan] = useState(() => storage.get('crewcheck:gym-provider-plan', 'wellhub'));
  const [onlyOpen, setOnlyOpen] = useState(() => storage.get('crewcheck:gym-only-open', '1') !== '0');
  const partnerChains = configuredGymPartnerChains();
  const autoCheckIn = storage.get('crewcheck:gym-auto-checkin', '0') !== '0';
  const coordinateLabel = coordinates ? coordinates.lat.toFixed(6) + ',' + coordinates.lon.toFixed(6) : '';
  const resolvedLayoverLocation = storedLocation || layoverLocation;
  const location = locationMode === 'current' ? coordinateLabel || resolvedLayoverLocation || 'localização atual' : resolvedLayoverLocation || coordinateLabel || 'localização atual';
  const categoryMeta = PLACE_CATEGORY_META[category];

  function chooseCategory(value: PlaceCategory) {
    setCategory(value);
    storage.set('crewcheck:places-category', value);
    setSelected(null);
    setPlaces([]);
    setSearchTerm('');
  }
  function choosePlan(value: string) {
    setPlan(value);
    storage.set('crewcheck:gym-provider-plan', value);
  }
  async function requestCurrentLocation() {
    try {
      const position = await getCurrentGeoPosition();
      const next = { lat: position.lat, lon: position.lng };
      setCoordinates(next);
      setLocationMode('current');
      storage.set('crewcheck:places-location', '');
      toast.success('Busca ajustada à sua localização atual.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Autorize a localização para procurar serviços próximos.');
    }
  }
  async function search() {
    if (!location || (locationMode === 'current' && !coordinates)) return;
    setLoading(true);
    try {
      const gymQuery = category === 'gym'
        ? plan === 'wellhub'
          ? partnerChains.join(' ') + ' academia parceira Wellhub'
          : plan === 'smartfit' ? 'Smart Fit academia'
          : partnerChains.join(' ') + ' Smart Fit academia'
        : '';
      const customQuery = [searchTerm.trim(), gymQuery].filter(Boolean).join(' ');
      const found = await fetchNearbyPlaces(location, category, customQuery);
      setPlaces(found);
      setSelected((current) => current && found.some((place) => place.name === current.name) ? current : found[0] || null);
      if (category === 'gym') listGymCrowding().then((payload) => setCrowding(payload.gyms || [])).catch(() => undefined);
      if (category === 'hospital') {
        const amil = await fetchAmilProviders(location, coordinates, amilOnly24h);
        setAmilProviders(amil.providers);
        setAmilMessage(amil.message || '');
      } else {
        setAmilProviders([]);
        setAmilMessage('');
      }
      if (!found.length) toast.message(`A busca interna de ${categoryMeta.plural.toLocaleLowerCase()} não retornou opções agora.`);
    } finally {
      setLoading(false);
    }
  }

  function saveManualPlace() {
    if (!manualDraft.name.trim()) return toast.error(`Informe o nome do ${categoryMeta.label.toLocaleLowerCase()}.`);
    const item: NearbyPlace = {
      id: `manual-${Date.now()}`,
      name: manualDraft.name.trim(),
      category,
      address: manualDraft.address.trim(),
      openingHours: manualDraft.openingHours.trim() ? [manualDraft.openingHours.trim()] : [],
      latitude: coordinates?.lat,
      longitude: coordinates?.lon,
      manual: true,
    };
    const next = [item, ...manualPlaces];
    setManualPlaces(next);
    saveManualPlaces(next);
    setManualDraft({ name: '', address: '', openingHours: '' });
    setManualOpen(false);
    setSelected(item);
    toast.success(`${categoryMeta.label} adicionado por você.`);
  }

  function removeManualPlace(place: NearbyPlace) {
    const next = manualPlaces.filter((item) => item.id !== place.id);
    setManualPlaces(next);
    saveManualPlaces(next);
    if (selected?.id === place.id) setSelected(null);
    toast.success('Local removido da sua lista.');
  }

  useEffect(() => { search(); }, [location, category, plan, amilOnly24h]);

  useEffect(() => {
    if (locationMode !== 'current' || coordinates) return;
    getCurrentGeoPosition().then((position) => setCoordinates({ lat: position.lat, lon: position.lng })).catch(() => undefined);
  }, [locationMode, coordinates]);

  useEffect(() => {
    if (!autoCheckIn || category !== 'gym' || !navigator.geolocation) return;
    const watch = navigator.geolocation.watchPosition((position) => {
      const next = { lat: position.coords.latitude, lon: position.coords.longitude };
      setCoordinates(next);
      storage.set('crewcheck_last_geo', next.lat + ',' + next.lon);
    }, () => undefined, { enableHighAccuracy: true, maximumAge: 30_000, timeout: 15_000 });
    return () => navigator.geolocation.clearWatch(watch);
  }, [autoCheckIn, category]);

  useEffect(() => {
    if (!autoCheckIn || category !== 'gym' || !coordinates || !places.length) return;
    const nearby = places
      .filter((place) => Number.isFinite(Number(place.latitude)) && Number.isFinite(Number(place.longitude)))
      .map((place) => ({ place, distance: coordinateDistanceMeters(coordinates, { lat: Number(place.latitude), lon: Number(place.longitude) }) }))
      .sort((a, b) => a.distance - b.distance)[0];
    if (!nearby || nearby.distance > 140) return;
    const cooldownKey = 'crewcheck:gym-auto-checkin:' + nearby.place.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const last = Number(storage.get(cooldownKey, '0')) || 0;
    if (Date.now() - last < 6 * 36e5) return;
    const chain = partnerChains.find((item) => nearby.place.name.toLocaleLowerCase().includes(item.toLocaleLowerCase())) || '';
    storage.set(cooldownKey, String(Date.now()));
    gymCheckIn({ gymName: nearby.place.name, chainName: chain, location: coordinateLabel, sharePresence: true, durationMinutes: 90 })
      .then((payload) => {
        setCrowding(payload.gyms || []);
        toast.success(payload.localOnly ? 'Presença salva localmente. Ela só será compartilhada após sincronizar.' : 'Autocheck-in realizado por até 90 minutos.');
      })
      .catch(() => storage.set(cooldownKey, '0'));
  }, [autoCheckIn, category, coordinates, places]);

  const allPlaces = [...manualPlaces.filter((place) => place.category === category), ...places]
    .filter((place, index, values) => values.findIndex((candidate) => normalizedSearch(candidate.name) === normalizedSearch(place.name) && normalizedSearch(candidate.address) === normalizedSearch(place.address)) === index);
  const visiblePlaces = allPlaces
    .filter((place) => !onlyOpen || place.openNow !== false)
    .sort((a, b) => Number(a.distanceMeters || Infinity) - Number(b.distanceMeters || Infinity)
      || Number(b.openNow === true) - Number(a.openNow === true)
      || Number(b.rating || 0) - Number(a.rating || 0));

  async function checkIn(place: NearbyPlace) {
    const chain = partnerChains.find((item) => place.name.toLocaleLowerCase().includes(item.toLocaleLowerCase())) || '';
    const sharePresence = confirm('Compartilhar temporariamente com colegas que você está nesta academia?');
    const payload = await gymCheckIn({ gymName: place.name, chainName: chain, location, sharePresence, durationMinutes: 90 });
    setCrowding(payload.gyms || []);
    if (payload.localOnly) {
      toast.success('Check-in salvo neste dispositivo; a presença ainda não foi compartilhada.');
    } else {
      toast.success(sharePresence ? 'Check-in compartilhado por até 90 minutos.' : 'Check-in privado registrado por até 90 minutos.');
    }
  }
  function crowdFor(place: NearbyPlace) {
    return crowding.find((item) => String(item.gymName || '').toLocaleLowerCase() === place.name.toLocaleLowerCase());
  }
  function categoryIcon(value: PlaceCategory) {
    if (value === 'hotel') return Hotel;
    if (value === 'hospital') return Hospital;
    if (value === 'pharmacy') return Pill;
    if (value === 'laundry') return WashingMachine;
    return Dumbbell;
  }
  const SelectedIcon = categoryIcon(category);
  const selectedDestination = selected
    ? Number.isFinite(Number(selected.latitude)) && Number.isFinite(Number(selected.longitude))
      ? coordsLabel(Number(selected.latitude), Number(selected.longitude))
      : [selected.name, selected.address].filter(Boolean).join(' ')
    : '';
  const internalMapUrl = selected ? buildGoogleMapsEmbedDirectionsUrl(location, selectedDestination, 'walking') : '';
  const amilResultsSection = category === 'hospital' ? <section className="cc-amil-results"><header><div><Hospital/><span><small>REDE CREDENCIADA</small><h2>Amil dentro do CrewCheck</h2></span></div><strong>{amilProviders.length ? `${amilProviders.length} resultado(s)` : 'Consulta protegida'}</strong></header><div className="cz-tool-actions"><button className={amilOnly24h ? 'active' : ''} onClick={() => setAmilOnly24h((current) => !current)}><Hospital/> {amilOnly24h ? 'Somente PA 24h' : 'Hospitais e clínicas'}</button><button onClick={search}><ShieldCheck/> Consultar rede Amil</button></div>{amilProviders.length ? <div>{amilProviders.map((provider, index) => <article key={provider.id || `${provider.name}-${index}`}><div><strong>{provider.name}</strong><small>{[provider.serviceType, provider.address, provider.city, provider.state].filter(Boolean).join(' · ')}</small></div><span>{provider.open24Hours ? '24h' : 'Horário a confirmar'}</span>{provider.phone && <a href={`tel:${provider.phone}`}><Phone/> Ligar</a>}</article>)}</div> : <p>{amilMessage || 'A pesquisa geral de hospitais continua disponível. A rede Amil será exibida quando as credenciais oficiais forem configuradas no Render.'}</p>}<footer>Confirme cobertura, elegibilidade e atendimento com a operadora antes de sair.</footer></section> : null;

  return <><Brand back/>{amilResultsSection}
    <section className="cz-panel-head cz-panel-head-compact"><h1>Locais próximos</h1><p>Pesquise, compare e trace a rota dentro do CrewCheck. O Google Maps é opcional.</p></section>
    <section className="cz-toolbox cz-places-search">
      <div className="cz-place-category-tabs">{(Object.keys(PLACE_CATEGORY_META) as PlaceCategory[]).map((value) => {
        const Icon = categoryIcon(value);
        return <button key={value} className={category === value ? 'active' : ''} onClick={() => chooseCategory(value)}><Icon/><span>{PLACE_CATEGORY_META[value].plural}</span></button>;
      })}</div>
      <header><div><SelectedIcon/><span><small>ORIGEM DA BUSCA</small><h2>{locationMode === 'layover' ? 'Pernoite / hotel' : 'Localização atual'}</h2></span></div><strong>{locationMode === 'layover' ? resolvedLayoverLocation || 'Sem pernoite identificado' : coordinates ? 'GPS atualizado' : 'GPS pendente'}</strong></header>
      <div className="cz-location-selector">
        <button className={locationMode === 'layover' ? 'active' : ''} disabled={!resolvedLayoverLocation} onClick={() => setLocationMode('layover')}><Hotel/> Usar pernoite</button>
        <button className={locationMode === 'current' ? 'active' : ''} onClick={requestCurrentLocation}><LocateFixed/> Usar localização atual</button>
      </div>
      <div className="cz-place-query-row"><label><Search/><input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && search()} placeholder={`Nome de ${categoryMeta.label.toLocaleLowerCase()} ou referência`}/></label><button className="primary" onClick={search} disabled={loading}><Search/> {loading ? 'Pesquisando…' : 'Pesquisar'}</button><button onClick={() => setManualOpen((current) => !current)}><Plus/> Não encontrei</button></div>
      {category === 'gym' && <><p className="cz-gym-provider-note">Wellhub é um benefício corporativo que conecta empresas a academias parceiras; não é uma academia. A busca mostra os estabelecimentos dentro do CrewCheck. Confirme a elegibilidade no canal da empresa antes de sair.</p><div className="cz-tool-actions cz-provider-actions"><button className={plan === 'ambos' ? 'active' : ''} onClick={() => choosePlan('ambos')}>Todas</button><button className={plan === 'wellhub' ? 'active' : ''} onClick={() => choosePlan('wellhub')}>Wellhub</button><button className={plan === 'smartfit' ? 'active' : ''} onClick={() => choosePlan('smartfit')}>Smart Fit</button></div></>}
      <div className="cz-tool-actions"><button className={onlyOpen ? 'active' : ''} onClick={() => { const next = !onlyOpen; setOnlyOpen(next); storage.set('crewcheck:gym-only-open', next ? '1' : '0'); }}><Clock/> {onlyOpen ? 'Somente abertos' : 'Incluir fechados'}</button><button onClick={() => openPlacesInGoogleMaps(category, location)}><MapIcon/> Ver busca no Google Maps</button></div>
      {manualOpen && <div className="cz-manual-place-form"><header><Plus/><span><strong>Adicionar {categoryMeta.label.toLocaleLowerCase()}</strong><small>Use quando a pesquisa não encontrar o local correto.</small></span></header><div className="cz-form-grid"><label><span>Nome</span><input value={manualDraft.name} onChange={(event) => setManualDraft({ ...manualDraft, name: event.target.value })} placeholder={categoryMeta.label}/></label><label><span>Endereço</span><input value={manualDraft.address} onChange={(event) => setManualDraft({ ...manualDraft, address: event.target.value })} placeholder="Rua, número, cidade"/></label><label><span>Horário</span><input value={manualDraft.openingHours} onChange={(event) => setManualDraft({ ...manualDraft, openingHours: event.target.value })} placeholder="Ex.: aberto 24h"/></label></div><div className="cz-tool-actions"><button className="primary" onClick={saveManualPlace}><Save/> Salvar na minha lista</button><button onClick={() => setManualOpen(false)}><X/> Cancelar</button></div></div>}
      {autoCheckIn && category === 'gym' && <div className="cz-auto-checkin-note"><ShieldCheck/><span><strong>Autocheck-in ativo</strong><small>O GPS contínuo só é usado enquanto esta opção estiver habilitada. Você pode desligá-la em Configurações.</small></span></div>}
    </section>

    {selected && <section className="cz-place-detail-card"><header><span className="cz-card-icon"><SelectedIcon/></span><div><small>{categoryMeta.label.toLocaleUpperCase()}{selected.manual ? ' · ADICIONADO POR VOCÊ' : ''}</small><h2>{selected.name}</h2><p>{safe(selected.address, 'Endereço a confirmar')}</p></div><button aria-label="Fechar mapa" onClick={() => setSelected(null)}><X/></button></header><div className="cz-google-map-preview cz-place-map">{internalMapUrl ? <iframe title={`Rota a pé até ${selected.name}`} loading="lazy" src={internalMapUrl} referrerPolicy="no-referrer-when-downgrade"/> : <div className="cz-map-fallback"><MapIcon/><strong>Mapa interno indisponível</strong><span>Atualize a localização para recalcular a rota.</span></div>}</div><div className="cz-place-facts"><span><b>Status</b>{selected.openNow === true ? 'Aberto agora' : selected.openNow === false ? 'Fechado agora' : 'Horário a confirmar'}</span><span><b>Distância</b>{selected.distanceMeters ? (selected.distanceMeters / 1000).toFixed(1).replace('.', ',') + ' km' : 'A calcular'}</span><span><b>Avaliação</b>{selected.rating ? selected.rating.toFixed(1) : 'Sem nota'}</span>{selected.phone && <a href={`tel:${selected.phone}`}><Phone/> {selected.phone}</a>}</div>{selected.openingHours?.length ? <div className="cz-opening-hours">{selected.openingHours.slice(0, 3).map((line) => <span key={line}>{line}</span>)}</div> : null}<div className="cz-tool-actions"><button className="primary" onClick={requestCurrentLocation}><Navigation/> Traçar rota a pé</button><button onClick={() => window.open(selected.mapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedDestination)}`, '_blank', 'noopener,noreferrer')}><MapIcon/> Abrir no Google Maps</button>{category === 'gym' && <button onClick={() => checkIn(selected)}><UserRound/> Fazer check-in</button>}{selected.manual && <button className="danger" onClick={() => removeManualPlace(selected)}><Trash2/> Remover da lista</button>}</div></section>}

    <section className="cz-stack-list cz-places-results">{visiblePlaces.length ? visiblePlaces.map((place, index) => {
      const Icon = categoryIcon(category);
      const crowd = category === 'gym' ? crowdFor(place) : null;
      return <article className={`cz-roster-card cz-place-result-card ${selected?.name === place.name ? 'selected' : ''}`} key={place.name + '-' + index}>
        <button className="cz-place-select" onClick={() => setSelected(place)}><span className="cz-roster-icon"><Icon/></span><span className="cz-roster-copy"><h3>{place.name}</h3><p>{safe(place.address, 'Endereço a confirmar')}</p><small>{place.openNow === true ? 'Aberto agora' : place.openNow === false ? 'Fechado agora' : 'Horário a confirmar'}{place.distanceMeters ? ' · ' + (place.distanceMeters / 1000).toFixed(1).replace('.', ',') + ' km' : ''}{place.rating ? ' · avaliação ' + place.rating : ''}{crowd ? ' · ' + crowd.crowdLabel : ''}</small></span><ChevronRight/></button>
        <div className="cz-tool-actions"><button className="primary" onClick={() => setSelected(place)}><MapIcon/> Ver no app · rota e detalhes</button><button onClick={() => window.open(place.mapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([place.name, place.address].filter(Boolean).join(' '))}`, '_blank', 'noopener,noreferrer')}><Navigation/> Abrir mapa</button>{category === 'gym' && <button onClick={() => checkIn(place)}><UserRound/> Check-in</button>}{place.manual && <button className="danger" onClick={() => removeManualPlace(place)}><Trash2/> Remover</button>}</div>
      </article>;
    }) : <article className="cz-empty-real"><SelectedIcon/><h2>{onlyOpen && allPlaces.length ? `Nenhum ${categoryMeta.label.toLocaleLowerCase()} aberto` : `Nenhum resultado em ${categoryMeta.plural.toLocaleLowerCase()}`}</h2><p>Atualize a localização, use o pernoite ou informe o local manualmente.</p><div className="cz-tool-actions"><button className="primary" onClick={search}><Search/> Tentar novamente</button><button onClick={() => setManualOpen(true)}><Plus/> Informar manualmente</button></div></article>}</section>
  </>;
}
function TelegramConciergeView({ bundle, setBundle, setView }: { bundle: BundleState; setBundle: (b: BundleState) => void; setView: (v: ZeroView) => void }) {
  const [status, setStatus] = useState<any>(null);
  const [question, setQuestion] = useState('/proximo');
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState('');
  const hasLocalRoster = Array.isArray(bundle.roster?.days) && bundle.roster.days.length > 0;
  const commands = [
    ['/proximo', 'Próxima programação'],
    ['/hoje', 'Programação de hoje'],
    ['/radar', 'Radar do próximo voo'],
    ['/saida', 'Saída Inteligente'],
    ['/metar', 'METAR da origem'],
    ['/hoteis', 'Hotéis e pernoites'],
    ['/academias', 'Academias próximas'],
    ['/rotina', 'Rotina sugerida'],
  ];

  async function refresh() {
    try {
      const identity = telegramConciergeIdentity();
      const params = new URLSearchParams(identity);
      const [linkResponse, rosterPayload] = await Promise.all([
        fetch(`/api/telegram/link/status?${params.toString()}`, { credentials: 'include', cache: 'no-store' }).then((response) => response.json()),
        fetchTelegramConciergeRoster(),
      ]);
      setStatus({ ...(linkResponse || {}), roster: rosterPayload?.snapshot || null, hasRoster: Boolean(rosterPayload?.snapshot?.roster || linkResponse?.hasRoster), rosterMessage: rosterPayload?.message || '' });
    } catch {
      setStatus({ ok: false, linked: false, message: 'Concierge aguardando conexão.' });
    }
  }
  useEffect(() => { refresh(); }, []);

  async function syncCurrent() {
    setBusy('sync');
    try {
      const payload = await syncRosterWithTelegramConcierge(bundle.roster, bundle.source);
      toast.success(payload.message || 'Escala sincronizada com o Concierge.');
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não consegui sincronizar a escala.');
    } finally {
      setBusy('');
    }
  }
  async function importFromTelegram() {
    setBusy('import');
    try {
      const payload = await fetchTelegramConciergeRoster();
      const roster = payload?.snapshot?.roster as CrewRoster | undefined;
      if (!roster?.days?.length) throw new Error('Nenhuma escala recebida pelo Telegram. Envie o PDF ao bot primeiro.');
      const source = String(payload?.snapshot?.fileName || 'Escala recebida no Telegram');
      const decision = confirmRosterImport(roster, source);
      if (!decision.ok) return;
      const compliance = saveRoster(roster, source);
      setBundle({ roster, compliance, source });
      setView('roster');
      toast.success('Escala do Telegram importada e ativada no app.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não consegui importar a escala do Telegram.');
    } finally {
      setBusy('');
    }
  }
  async function ask(value = question) {
    const text = value.trim();
    if (!text) return;
    setQuestion(text);
    setBusy('ask');
    try {
      const payload = await askTelegramConcierge(text);
      setAnswer(String(payload.reply || 'Sem resposta.'));
      setStatus((current: any) => ({ ...(current || {}), linked: payload.linked, hasRoster: payload.hasRoster }));
    } catch (error) {
      setAnswer(error instanceof Error ? error.message : 'O Concierge não respondeu agora.');
    } finally {
      setBusy('');
    }
  }
  async function linkTelegram() {
    setBusy('link');
    try {
      await openTelegramBinding();
      window.setTimeout(() => refresh(), 2500);
    } finally {
      setBusy('');
    }
  }

  return <><Brand back/><section className="cz-panel-head"><h1>Concierge Telegram</h1><p>Envie sua escala em PDF ao bot, use os comandos antigos e consulte radar, portão, saída, meteorologia, hotéis, academias e rotina por texto ou voz.</p></section>
    <section className="cz-finance-grid">
      <KpiCard icon={Send} title="Telegram" value={status?.linked ? 'Vinculado' : 'Vincular'} detail={status?.message || 'Verificando bot'}/>
      <KpiCard icon={FileText} title="Escala no bot" value={status?.hasRoster ? 'Sincronizada' : 'Aguardando'} detail={status?.roster?.updatedAt ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(status.roster.updatedAt)) : 'Envie PDF ou sincronize'}/>
      <KpiCard icon={Wifi} title="Comandos" value="Restaurados" detail="texto, voz e localização"/>
    </section>
    <section className="cz-toolbox">
      <h2>Enviar a escala pelo Telegram</h2>
      <p>1. Vincule o bot. 2. Abra a conversa e envie o PDF oficial como documento. 3. O Concierge valida a escala e responde com o resumo e a próxima programação. Depois você pode importar essa mesma escala no app.</p>
      <div className="cz-tool-actions">
        <button onClick={linkTelegram} disabled={Boolean(busy)}><Send/> {status?.linked ? 'Abrir ou refazer vínculo' : 'Vincular e abrir Telegram'}</button>
        <button onClick={syncCurrent} disabled={Boolean(busy) || !hasLocalRoster}><RotateCcw/> {busy === 'sync' ? 'Sincronizando...' : 'Sincronizar escala atual'}</button>
        <button onClick={importFromTelegram} disabled={Boolean(busy)}><Upload/> {busy === 'import' ? 'Importando...' : 'Importar escala recebida'}</button>
        <button onClick={refresh} disabled={Boolean(busy)}><Radar/> Atualizar status</button>
      </div>
      {!hasLocalRoster && <p className="cz-mini-status">Você ainda pode enviar o PDF diretamente ao bot. Para sincronizar do app, importe uma escala primeiro.</p>}
    </section>
    <section className="cz-toolbox">
      <h2>Prévia dos comandos</h2>
      <p>Teste aqui a mesma resposta operacional que o bot usa. No Telegram, também funciona com perguntas naturais e mensagem de voz.</p>
      <div className="cz-tool-actions">{commands.map(([command, label]) => <button key={command} onClick={() => ask(command)} disabled={Boolean(busy)}><Send/> {label}</button>)}</div>
      <label><span>Pergunte ao Concierge</span><textarea className="cz-update-textarea" style={{ minHeight: 90 }} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ex.: qual o portão do LA3730?"/></label>
      <div className="cz-tool-actions"><button onClick={() => ask()} disabled={Boolean(busy) || !question.trim()}><Send/> {busy === 'ask' ? 'Consultando...' : 'Consultar'}</button></div>
      {answer && <article className="cz-roster-card"><div className="cz-roster-main"><span className="cz-roster-icon"><Wifi/></span><div className="cz-roster-copy"><h3>Resposta do Concierge</h3><p style={{ whiteSpace: 'pre-wrap' }}>{answer}</p></div></div></article>}
    </section>
    <section className="cz-stack-list"><article className="cz-roster-card"><div className="cz-roster-main"><span className="cz-roster-icon"><ShieldCheck/></span><div className="cz-roster-copy"><h3>Privacidade operacional</h3><p>O texto bruto do PDF não fica no snapshot do Concierge. Senhas, MFA, cookies e credenciais do iFlight não são solicitados nem armazenados.</p></div></div><div className="cz-routine-strip"><span>PDF AIMS</span><span>Crew Roster</span><span>Texto → texto</span><span>Áudio → áudio</span><span>Localização sob demanda</span></div></article></section>
  </>;
}

function DatabaseView({ setBundle, setView }: { setBundle: (b: BundleState) => void; setView: (v: ZeroView) => void }) {
  const [items, setItems] = useState<any[]>([]);
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    Promise.all([
      listSavedRosters(24).catch(() => []),
      getDatabaseStatus().catch(() => ({ ok: false, connected: false, message: 'Histórico local ativo' })),
    ]).then(([saved, database]) => {
      setItems(saved);
      setStatus(database);
    }).finally(() => setLoading(false));
  }, []);
  async function open(item: any) {
    try {
      const data = item?.id ? await openSavedRoster(item.id) : await openActiveRoster();
      if (data?.roster) {
        const compliance = data.compliance || analyzeSafe(data.roster);
        setBundle({ roster: data.roster, compliance, source: item?.sourceFileName || 'Histórico' });
        saveRoster(data.roster, item?.sourceFileName || 'Histórico');
        setView('cockpit');
        toast.success('Escala aberta.');
      }
    } catch {
      toast.error('Não consegui abrir este histórico.');
    }
  }
  return <><Brand back/>
    <section className="cz-panel-head cz-panel-head-compact"><h1>Histórico e sincronização</h1><p>{status?.connected ? 'Banco conectado' : 'Modo local protegido'}</p></section>
    <section className="cz-stack-list">
      {loading ? <article className="cz-empty-real cz-history-empty"><RotateCcw/><h2>Carregando histórico</h2><p>Verificando dados locais e sincronizados.</p></article>
        : items.length ? items.map((item: any) => <article className="cz-roster-card" key={item.id}><div className="cz-roster-copy"><h3>{item.sourceFileName || 'Escala ' + item.month + '/' + item.year}</h3><p>{item.createdAt || 'Histórico CrewCheck'}{item.isActive ? ' · ativa' : ''}</p></div><button onClick={() => open(item)}>Abrir</button></article>)
        : <article className="cz-empty-real cz-history-empty"><Database/><h2>Nenhum histórico salvo</h2><p>Importe uma escala ou salve a escala ativa. A cópia local continuará disponível mesmo quando o banco estiver fora do ar.</p></article>}
    </section>
  </>;
}

function CrewToolsView({ bundle }: { bundle: BundleState }) {
  const firstCrew = (bundle.roster.days || []).flatMap((d:any) => d.legs || []).flatMap((l:any) => l.crew || []).slice(0, 8);
  return <><Brand back/><section className="cz-panel-head"><h1>Crew e chefe de cabine</h1><p>Tripulação, adicional de chefe, instrutor e apoio operacional.</p></section><section className="cz-stack-list">{firstCrew.length ? firstCrew.map((c:any, i:number) => <article className="cz-roster-card" key={i}><div className="cz-roster-copy"><h3>{c.name || c.employeeName || 'Tripulante'}</h3><p>{c.role || c.function || 'Crew'}</p></div><strong className="cz-roster-time">{i===0 ? 'Chefe efetivo' : 'Tripulante'}</strong></article>) : <article className="cz-roster-card"><div className="cz-roster-copy"><h3>Regra preservada</h3><p>Quando houver lista de CCM, o primeiro CCM listado é considerado chefe efetivo do voo para fins de adicional.</p></div></article>}</section></>;
}
function MaintenancePreview() { return <><Brand/><section className="cz-maintenance"><article><div className="cz-maint-illu"><Settings size={72}/><Plane size={64}/></div><h1>Site em manutenção</h1><p>Estamos realizando melhorias e atualizações no CrewCheck. Em breve o sistema estará disponível novamente.</p><span><ShieldCheck/> Modo ativado pelo administrador</span><div><Lock/> Apenas administradores podem acessar o painel durante a manutenção.</div><button>Acessar painel admin <ChevronRight/></button><button>Ver status</button><a>Voltar mais tarde</a></article><section><h2>Status da operação <b>Em andamento</b></h2><div><p><CalendarDays/>Escala em atualização</p><p><Bell/>Alertas em revisão</p><p><CloudSun/>Meteorologia sincronizando</p></div></section></section></> }
function ImportPanel({ onUpload, onConcierge }: { onUpload: () => void; onConcierge: () => void }) { return <><Brand/><section className="cz-import"><div className="cz-import-icon"><Upload/></div><div className="cz-import-copy"><small>IMPORTAÇÃO SEGURA</small><h1>Importar escala oficial</h1><p>Envie o PDF da escala. O CrewCheck valida período, tripulante, base, dias, voos e próxima programação antes de ativar o mês.</p></div><div className="cz-import-actions"><button className="primary" onClick={onUpload}><FileText/> Escolher PDF no dispositivo</button><button onClick={onConcierge}><Send/> Importar pelo Telegram</button></div><span className="cz-import-privacy"><ShieldCheck/> O processamento protege credenciais e mantém a escala disponível no modo local.</span></section></>; }

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      result ? resolve(result) : reject(new Error('PDF vazio ou indisponível no dispositivo.'));
    };
    reader.onerror = () => reject(reader.error || new Error('Falha ao preparar o PDF.'));
    reader.readAsDataURL(file);
  });
}

function sanitizePdfImportError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error || '');
  const message = raw.replace(/\s+/g, ' ').trim();
  if (!message) return 'Não consegui interpretar o PDF.';
  if (/connector|constructor|worker|pdfjs|setting up fake worker|globalworkeroptions|hl/i.test(message)) {
    return 'O leitor local do navegador falhou. Tentei a leitura alternativa segura, mas o PDF ainda não pôde ser interpretado.';
  }
  return message;
}

async function parsePDFOnServer(file: File): Promise<CrewRoster> {
  const dataBase64 = await fileToDataUrl(file);
  const response = await fetch('/api/parse-pdf', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
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
  if (value === 'bids' || value === 'bid') return 'bids';
  if (value === 'alerts' || value === 'irregularities') return 'alerts';
  if (value === 'regulation' || value === 'regulamentacao' || value === 'regulamentação') return 'regulation';
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
    {view === 'bids' && <BidsView events={events}/>} 
    {view === 'alerts' && <Alerts compliance={compliance}/>}
    {view === 'regulation' && <ManualRegulationView compliance={compliance}/>}
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
