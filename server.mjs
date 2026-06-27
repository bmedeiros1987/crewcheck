import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Pool as PgPool } from 'pg';
import mysql from 'mysql2/promise';

/* CREWCHECK_MAPS_AUTO_CONFIG_START */
// Configuração temporária Premium Trust para facilitar a validação da Saída Inteligente Reliable.
// Prioridade: variáveis do Render. Fallback: chave fornecida pelo proprietário para teste.
// Recomendado para produção: mover esta chave para as Environment Variables do Render e trocar por uma chave restrita.
const CREWCHECK_EMBEDDED_GOOGLE_MAPS_KEY = '';
for (const name of ['GOOGLE_ROUTES_API_KEY', 'GOOGLE_MAPS_API_KEY', 'GOOGLE_PLACES_API_KEY', 'GOOGLE_GEOCODING_API_KEY']) {
 if (!process.env[name] && CREWCHECK_EMBEDDED_GOOGLE_MAPS_KEY) process.env[name] = CREWCHECK_EMBEDDED_GOOGLE_MAPS_KEY;
}
if (!process.env.CREWCHECK_COMMUTE_CACHE_TTL_MS) process.env.CREWCHECK_COMMUTE_CACHE_TTL_MS = '60000';
if (!process.env.CREWCHECK_LOCAL_TIMEZONE) process.env.CREWCHECK_LOCAL_TIMEZONE = 'America/Sao_Paulo';
if (!process.env.CREWCHECK_SMART_DEPARTURE_ENABLED) process.env.CREWCHECK_SMART_DEPARTURE_ENABLED = 'true';
if (!process.env.CREWCHECK_COMMUTE_TRANSIT_ENABLED) process.env.CREWCHECK_COMMUTE_TRANSIT_ENABLED = 'true';
if (!process.env.CREWCHECK_MAPS_PROVIDER) process.env.CREWCHECK_MAPS_PROVIDER = 'google-routes';
if (!process.env.CREWCHECK_LONG_DISTANCE_THRESHOLD_KM) process.env.CREWCHECK_LONG_DISTANCE_THRESHOLD_KM = '250';
/* CREWCHECK_MAPS_AUTO_CONFIG_END */
/* CREWCHECK_RIDE_APPS_CONFIG_START */
if (!process.env.CREWCHECK_COMMUTE_ENABLE_RIDES) process.env.CREWCHECK_COMMUTE_ENABLE_RIDES = 'true';
if (!process.env.CREWCHECK_COMMUTE_COMPARE_MODES) process.env.CREWCHECK_COMMUTE_COMPARE_MODES = 'DRIVE,TRANSIT,RIDE_APP';
if (!process.env.UBER_ENV) process.env.UBER_ENV = 'testing';
if (!process.env.UBER_RIDE_DEEPLINK_ENABLED) process.env.UBER_RIDE_DEEPLINK_ENABLED = 'true';
if (!process.env.UBER_ESTIMATES_ENABLED) process.env.UBER_ESTIMATES_ENABLED = 'true';
if (!process.env.UBER_GUEST_ESTIMATES_ENABLED) process.env.UBER_GUEST_ESTIMATES_ENABLED = 'true';
if (!process.env.UBER_FORCE_MULTI_ENDPOINTS) process.env.UBER_FORCE_MULTI_ENDPOINTS = 'true';
if (!process.env.APP99_DEEPLINK_ENABLED) process.env.APP99_DEEPLINK_ENABLED = 'true';
/* CREWCHECK_RIDE_APPS_CONFIG_END */


const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, 'dist');
const port = Number(process.env.PORT || 4173);

const DATABASE_URL = (process.env.DATABASE_URL || process.env.MYSQL_URL || process.env.POSTGRES_URL || process.env.SUPABASE_DATABASE_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL_NON_POOLING || '').trim();
const DB_KIND = DATABASE_URL.toLowerCase().startsWith('mysql://') || DATABASE_URL.toLowerCase().startsWith('mysql2://') ? 'mysql' : 'postgres';
const AUTO_MIGRATE = String(process.env.CREWCHECK_AUTO_MIGRATE || 'true').toLowerCase() !== 'false';
const AUTH_REQUIRED = String(process.env.CREWCHECK_AUTH_REQUIRED || 'true').toLowerCase() !== 'false';
const SESSION_DAYS = Number(process.env.CREWCHECK_SESSION_DAYS || 30);

const BILLING_TRIAL_DAYS = Math.max(1, Number(process.env.CREWCHECK_TRIAL_DAYS || 7));
const BILLING_CURRENCY = 'BRL';
const CREWCHECK_DIARIA_REFERENCE_VALUE = Number(process.env.CREWCHECK_DIARIA_REFERENCE_VALUE || process.env.CREWCHECK_DIARIA_PRINCIPAL_VALUE || 109.44);
const CREWCHECK_PREMIUM_ANNUAL_DISCOUNT_PERCENT = Math.max(0, Math.min(60, Number(process.env.CREWCHECK_PREMIUM_ANNUAL_DISCOUNT_PERCENT || 50)));
const BILLING_LAUNCH_PROMO_END_DATE = String(process.env.CREWCHECK_LAUNCH_PROMO_END_DATE || '2026-07-19').slice(0, 10);
const BILLING_MONTHLY_ORIGINAL_VALUE = Number(process.env.CREWCHECK_BILLING_MONTHLY_ORIGINAL_VALUE || 19.90);
const BILLING_YEARLY_ORIGINAL_VALUE = Number(process.env.CREWCHECK_BILLING_YEARLY_ORIGINAL_VALUE || 179.90);
const BILLING_MONTHLY_PROMO_VALUE = Number(process.env.CREWCHECK_BILLING_MONTHLY_PROMO_VALUE || 9.90);
const BILLING_YEARLY_PROMO_VALUE = Number(process.env.CREWCHECK_BILLING_YEARLY_PROMO_VALUE || 89.95);
const BILLING_MONTHLY_PROMO_MONTHS = Math.max(1, Number(process.env.CREWCHECK_BILLING_MONTHLY_PROMO_MONTHS || 6));
function addMonthsIsoDate(baseDate = new Date(), months = 0) {
 const date = new Date(baseDate);
 const day = date.getDate();
 date.setMonth(date.getMonth() + Number(months || 0));
 if (date.getDate() < day) date.setDate(0);
 return date.toISOString().slice(0, 10);
}
function isLaunchPromoActive() {
 const today = new Date().toISOString().slice(0, 10);
 return String(process.env.CREWCHECK_LAUNCH_PROMO_ENABLED || 'true').toLowerCase() !== 'false' && today <= BILLING_LAUNCH_PROMO_END_DATE;
}
const BILLING_PROMO_ACTIVE = isLaunchPromoActive();
const BILLING_MONTHLY_VALUE = Number(process.env.CREWCHECK_BILLING_MONTHLY_VALUE || (BILLING_PROMO_ACTIVE ? BILLING_MONTHLY_PROMO_VALUE : BILLING_MONTHLY_ORIGINAL_VALUE));
const BILLING_YEARLY_VALUE = Number(process.env.CREWCHECK_BILLING_YEARLY_VALUE || (BILLING_PROMO_ACTIVE ? BILLING_YEARLY_PROMO_VALUE : BILLING_YEARLY_ORIGINAL_VALUE));
const BILLING_PRICE_POLICY_NOTICE = `Preço promocional de lançamento válido para contratação até ${BILLING_LAUNCH_PROMO_END_DATE}. No mensal, quem contratar na promoção mantém o valor promocional pelos ${BILLING_MONTHLY_PROMO_MONTHS} primeiros meses; depois, passa ao valor regular de R$ ${BILLING_MONTHLY_ORIGINAL_VALUE.toFixed(2).replace('.', ',')}/mês. No anual, o desconto vale para o primeiro ano; a renovação segue o valor regular de R$ ${BILLING_YEARLY_ORIGINAL_VALUE.toFixed(2).replace('.', ',')}/ano, salvo nova promoção vigente. O CrewCheck está focado em tripulantes LATAM neste lançamento e aberto à expansão para outras empresas.`;
const CREWCHECK_SUPPORT_DESTINATION_EMAIL = normalizeEmail(process.env.SUPPORT_DESTINATION_EMAIL || process.env.CREWCHECK_SUPPORT_EMAIL || '');
const CREWCHECK_SUPPORT_FROM_LABEL = process.env.CREWCHECK_SUPPORT_FROM_LABEL || 'Equipe CrewCheck';
const CREWCHECK_SUPPORT_WHATSAPP_URL = String(process.env.SUPPORT_WHATSAPP_URL || process.env.CREWCHECK_SUPPORT_WHATSAPP_URL || '').trim();
const CREWCHECK_COST_RENDER_MONTHLY = Number(process.env.CREWCHECK_COST_RENDER_MONTHLY || 0);
const CREWCHECK_COST_FLIGHT_DATA_MONTHLY = Number(process.env.CREWCHECK_COST_FLIGHT_DATA_MONTHLY || 0);
const CREWCHECK_COST_EMAIL_MONTHLY = Number(process.env.CREWCHECK_COST_EMAIL_MONTHLY || 0);
const CREWCHECK_COST_MAPS_MONTHLY = Number(process.env.CREWCHECK_COST_MAPS_MONTHLY || 0);
const CREWCHECK_COST_DOMAIN_MONTHLY = Number(process.env.CREWCHECK_COST_DOMAIN_MONTHLY || 0);
const CREWCHECK_COST_OTHER_MONTHLY = Number(process.env.CREWCHECK_COST_OTHER_MONTHLY || 0);
const CREWCHECK_ASAAS_FEE_PERCENT = Number(process.env.CREWCHECK_ASAAS_FEE_PERCENT || 0);
const CREWCHECK_ASAAS_FIXED_FEE = Number(process.env.CREWCHECK_ASAAS_FIXED_FEE || 0);
const ASAAS_API_KEY = String(process.env.ASAAS_API_KEY || '').trim();
const ASAAS_ENV = String(process.env.ASAAS_ENV || '').trim().toLowerCase();
const ASAAS_API_BASE = String(
 process.env.ASAAS_API_BASE ||
 (ASAAS_ENV === 'production' || /\$aact_prod_/i.test(ASAAS_API_KEY) ? 'https://api.asaas.com/v3' : 'https://api-sandbox.asaas.com/v3')
).replace(/\/+$/, '');
const ASAAS_WEBHOOK_TOKEN = String(process.env.ASAAS_WEBHOOK_TOKEN || process.env.ASAAS_WEBHOOK_SECRET || '').trim();
const ASAAS_WEBHOOK_TOKENS = Array.from(new Set([
 ASAAS_WEBHOOK_TOKEN,
 process.env.ASAAS_WEBHOOK_TOKEN_SANDBOX,
 process.env.ASAAS_WEBHOOK_TOKEN_PRODUCTION,
 process.env.ASAAS_WEBHOOK_TOKEN_PREVIOUS,
 process.env.ASAAS_WEBHOOK_AUTH_TOKEN,
].map((value) => String(value || '').trim()).filter(Boolean)));
const ASAAS_WEBHOOK_STRICT = String(process.env.ASAAS_WEBHOOK_STRICT || '').toLowerCase() === 'true';
const ASAAS_WEBHOOK_ALLOW_SANDBOX_WITHOUT_TOKEN = String(process.env.ASAAS_WEBHOOK_ALLOW_SANDBOX_WITHOUT_TOKEN || 'true').toLowerCase() !== 'false';

// SearchAPI.io / Google Flights: fonte estruturada para Vivo de Extra.
// Mantém a chave apenas em variável de ambiente para não expor segredo no GitHub.
const SEARCHAPI_API_KEY = String(process.env.SEARCHAPI_API_KEY || process.env.SEARCHAPI_IO_API_KEY || '').trim();
const SEARCHAPI_API_BASE = String(process.env.SEARCHAPI_API_BASE || 'https://www.searchapi.io/api/v1/search').replace(/\/+$/, '');
const SEARCHAPI_EXTRA_ENABLED = String(process.env.SEARCHAPI_EXTRA_ENABLED || 'true').toLowerCase() !== 'false';
const SEARCHAPI_EXTRA_INCLUDED_AIRLINES = String(process.env.SEARCHAPI_EXTRA_INCLUDED_AIRLINES || 'LA,G3,AD,TP,TOTAL,SIDERAL,TTL,SID').toUpperCase().replace(/[^A-Z0-9,]/g, '');
const SEARCHAPI_EXTRA_ENRICH_RADAR = String(process.env.SEARCHAPI_EXTRA_ENRICH_RADAR || 'true').toLowerCase() !== 'false';

// SerpAPI / Google Flights: fonte que vinha funcionando melhor no Vivo de Extra.
// Fica backend-only e pode operar como fonte principal, com SearchAPI.io como fallback.
const SERPAPI_API_KEY = String(process.env.SERPAPI_API_KEY || process.env.GOOGLE_FLIGHTS_SERPAPI_KEY || '').trim();
const SERPAPI_API_BASE = String(process.env.SERPAPI_API_BASE || 'https://serpapi.com/search.json').replace(/\/+$/, '');
const SERPAPI_EXTRA_ENABLED = String(process.env.SERPAPI_EXTRA_ENABLED || 'true').toLowerCase() !== 'false';
const SERPAPI_EXTRA_INCLUDED_AIRLINES = String(process.env.SERPAPI_EXTRA_INCLUDED_AIRLINES || SEARCHAPI_EXTRA_INCLUDED_AIRLINES || 'LA,G3,AD,TP,TOTAL,SIDERAL,TTL,SID').toUpperCase().replace(/[^A-Z0-9,]/g, '');

// Sabre API: autenticação sessionless preparada para uso futuro no Vivo de Extra/Shopping.
// Nunca grave credenciais no código; use variáveis de ambiente no Render.
const SABRE_ENABLED = String(process.env.SABRE_ENABLED || 'true').toLowerCase() !== 'false';
const SABRE_ENV = String(process.env.SABRE_ENV || process.env.SABRE_ENVIRONMENT || 'test').toLowerCase();
const SABRE_AUTH_VERSION = String(process.env.SABRE_AUTH_VERSION || (process.env.SABRE_CLIENT_ID && process.env.SABRE_CLIENT_SECRET ? 'v3' : 'v2')).toLowerCase();
const SABRE_TOKEN_URL = String(process.env.SABRE_TOKEN_URL || (SABRE_ENV === 'production' || SABRE_ENV === 'prod' ? 'https://api.platform.sabre.com/v3/auth/token' : 'https://api-crt.cert.havail.sabre.com/v3/auth/token')).trim();
const SABRE_REST_BASE = String(process.env.SABRE_REST_BASE || (SABRE_ENV === 'production' || SABRE_ENV === 'prod' ? 'https://api.platform.sabre.com' : 'https://api-crt.cert.havail.sabre.com')).replace(/\/+$/, '');
const SABRE_USERNAME = String(process.env.SABRE_USERNAME || process.env.SABRE_EPR_USERNAME || '').trim();
const SABRE_PASSWORD = String(process.env.SABRE_PASSWORD || process.env.SABRE_EPR_PASSWORD || '').trim();
const SABRE_CLIENT_ID = String(process.env.SABRE_CLIENT_ID || '').trim();
const SABRE_CLIENT_SECRET = String(process.env.SABRE_CLIENT_SECRET || '').trim();
const SABRE_TIMEOUT_MS = Number(process.env.SABRE_TIMEOUT_MS || 15000);
let sabreTokenCache = { token: '', expiresAt: 0, source: '' };
const EXTRA_FLIGHT_PROVIDER_ORDER = String(process.env.EXTRA_FLIGHT_PROVIDER_ORDER || 'SERPAPI,SEARCHAPI,SABRE,AMADEUS')
 .split(',')
 .map((item) => item.trim().toUpperCase())
 .filter(Boolean);
const CREWCHECK_DEFAULT_LIFETIME_EMAILS = String(process.env.CREWCHECK_DEFAULT_LIFETIME_EMAILS || '').split(',').map((email) => email.trim()).filter(Boolean);
const CREWCHECK_LIFETIME_EMAILS_RAW = String(process.env.CREWCHECK_LIFETIME_EMAILS || CREWCHECK_DEFAULT_LIFETIME_EMAILS.join(',')).trim();
const CREWCHECK_TEST_ACCOUNT_EMAIL = normalizeEmail(process.env.CREWCHECK_TEST_ACCOUNT_EMAIL || 'teste@crewcheck.app');
const CREWCHECK_TEST_ACCOUNT_PASSWORD = String(process.env.CREWCHECK_TEST_ACCOUNT_PASSWORD || 'CrewCheck@2026');
const CREWCHECK_TEST_ACCOUNT_ENABLED = String(process.env.CREWCHECK_TEST_ACCOUNT_ENABLED || 'true').toLowerCase() !== 'false';

const TURNSTILE_SITE_KEY = String(process.env.TURNSTILE_SITE_KEY || process.env.CLOUDFLARE_TURNSTILE_SITE_KEY || '').trim();
const TURNSTILE_SECRET_KEY = String(process.env.TURNSTILE_SECRET_KEY || process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY || '').trim();
const CREWCHECK_CAPTCHA_REQUIRED = String(process.env.CREWCHECK_CAPTCHA_REQUIRED || (TURNSTILE_SECRET_KEY ? 'true' : 'false')).toLowerCase() !== 'false';
const EMAIL_VERIFICATION_REQUIRED = String(process.env.CREWCHECK_EMAIL_VERIFICATION_REQUIRED || 'true').toLowerCase() !== 'false';
const EMAIL_VERIFICATION_TTL_MINUTES = Math.max(10, Number(process.env.CREWCHECK_EMAIL_VERIFICATION_TTL_MINUTES || 30));
const EXTRA_FLIGHT_DB_CACHE_ENABLED = String(process.env.EXTRA_FLIGHT_DB_CACHE_ENABLED || 'true').toLowerCase() !== 'false';
const EXTRA_FLIGHT_DB_CACHE_TTL_MS = Math.max(60_000, Number(process.env.EXTRA_FLIGHT_DB_CACHE_TTL_MS || 6 * 60 * 60 * 1000));
const AIRPORT_BOARD_DB_CACHE_ENABLED = String(process.env.AIRPORT_BOARD_DB_CACHE_ENABLED || 'true').toLowerCase() !== 'false';
const AIRPORT_BOARD_DB_CACHE_TTL_MS = Math.max(5 * 60_000, Number(process.env.AIRPORT_BOARD_DB_CACHE_TTL_MS || 3 * 60 * 60 * 1000));
const AIRPORT_BOARD_CACHE_CURRENT_DAY_ONLY = String(process.env.AIRPORT_BOARD_CACHE_CURRENT_DAY_ONLY || 'true').toLowerCase() !== 'false';
const AIRPORT_BOARD_DEFAULT_AIRPORTS = String(process.env.AIRPORT_BOARD_DEFAULT_AIRPORTS || 'BSB,GRU,CGH,GIG,SDU,VCP,CNF,POA,REC,SSA,FOR,NAT').split(',').map((item) => item.trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3)).filter(Boolean);
const AIRPORT_BOARD_API_FIRST = String(process.env.AIRPORT_BOARD_API_FIRST || 'true').toLowerCase() !== 'false';
const AIRPORT_BOARD_STORE_EMPTY_CACHE = String(process.env.AIRPORT_BOARD_STORE_EMPTY_CACHE || 'false').toLowerCase() === 'true';
const AIRPORT_BOARD_API_PROVIDER_ORDER = String(process.env.AIRPORT_BOARD_API_PROVIDER_ORDER || 'FLIGHTAWARE,FLIGHTSTATS,AERODATABOX,AVIATIONSTACK,OFFICIAL').split(',').map((item) => item.trim().toUpperCase()).filter(Boolean);
const PUBLIC_APP_URL = String(process.env.PUBLIC_APP_URL || process.env.RENDER_EXTERNAL_URL || process.env.CREWCHECK_PUBLIC_URL || 'https://crewcheck.online').replace(/\/+$/, '');
const TELEGRAM_BOT_TOKEN = String(process.env.TELEGRAM_BOT_TOKEN || process.env.CREWCHECK_TELEGRAM_BOT_TOKEN || '').trim();
const TELEGRAM_WEBHOOK_SECRET = String(process.env.TELEGRAM_WEBHOOK_SECRET || process.env.CREWCHECK_TELEGRAM_WEBHOOK_SECRET || '').trim();
const TELEGRAM_API_BASE = TELEGRAM_BOT_TOKEN ? `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}` : '';
const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || process.env.CREWCHECK_OPENAI_API_KEY || '').trim();
const OPENAI_AUDIO_API_BASE = String(process.env.OPENAI_AUDIO_API_BASE || 'https://api.openai.com/v1').replace(/\/+$/, '');
const OPENAI_TRANSCRIBE_MODEL = String(process.env.OPENAI_TRANSCRIBE_MODEL || process.env.OPENAI_STT_MODEL || 'gpt-4o-mini-transcribe').trim();
const OPENAI_TTS_MODEL = String(process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts').trim();
const OPENAI_TTS_VOICE = String(process.env.OPENAI_TTS_VOICE || 'nova').trim();
const OPENAI_TTS_SPEED = Math.min(1.15, Math.max(0.85, Number(process.env.OPENAI_TTS_SPEED || 1.02)));
const TELEGRAM_CONCIERGE_SPEECH_PROVIDER = String(process.env.TELEGRAM_CONCIERGE_SPEECH_PROVIDER || process.env.CREWCHECK_SPEECH_PROVIDER || process.env.SPEECH_PROVIDER || process.env.TTS_PROVIDER || 'auto').trim().toLowerCase();
const AZURE_SPEECH_KEY = String(process.env.AZURE_SPEECH_KEY || process.env.CREWCHECK_AZURE_SPEECH_KEY || process.env.SPEECH_KEY || '').trim();
const AZURE_SPEECH_REGION = String(process.env.AZURE_SPEECH_REGION || process.env.CREWCHECK_AZURE_SPEECH_REGION || process.env.SPEECH_REGION || 'brazilsouth').trim().toLowerCase();
const AZURE_SPEECH_ENDPOINT = String(process.env.AZURE_SPEECH_ENDPOINT || process.env.CREWCHECK_AZURE_SPEECH_ENDPOINT || '').trim().replace(/\/+$/, '');
const AZURE_STT_LANGUAGE = String(process.env.AZURE_STT_LANGUAGE || 'pt-BR').trim();
const AZURE_TTS_VOICE = String(process.env.AZURE_TTS_VOICE || 'pt-BR-FranciscaNeural').trim();
const AZURE_TTS_STYLE = String(process.env.AZURE_TTS_STYLE || 'calm').trim();
const AZURE_TTS_RATE = String(process.env.AZURE_TTS_RATE || '+2%').trim();
const AZURE_TTS_PITCH = String(process.env.AZURE_TTS_PITCH || '+0%').trim();
const AZURE_TTS_OUTPUT_FORMAT = String(process.env.AZURE_TTS_OUTPUT_FORMAT || 'audio-24khz-48kbitrate-mono-mp3').trim();
const ELEVENLABS_API_KEY = String(process.env.ELEVENLABS_API_KEY || process.env.CREWCHECK_ELEVENLABS_API_KEY || process.env.XI_API_KEY || '').trim();
const ELEVENLABS_API_BASE = String(process.env.ELEVENLABS_API_BASE || 'https://api.elevenlabs.io/v1').replace(/\/+$/, '');
const ELEVENLABS_STT_MODEL = String(process.env.ELEVENLABS_STT_MODEL || 'scribe_v2').trim();
const ELEVENLABS_STT_LANGUAGE = String(process.env.ELEVENLABS_STT_LANGUAGE || 'pt').trim();
const ELEVENLABS_TTS_MODEL = String(process.env.ELEVENLABS_TTS_MODEL || 'eleven_multilingual_v2').trim();
const ELEVENLABS_TTS_VOICE_ID = String(process.env.ELEVENLABS_TTS_VOICE_ID || process.env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb').trim();
const ELEVENLABS_TTS_OUTPUT_FORMAT = String(process.env.ELEVENLABS_TTS_OUTPUT_FORMAT || 'mp3_22050_32').trim();
const ELEVENLABS_TTS_STABILITY = Math.min(1, Math.max(0, Number(process.env.ELEVENLABS_TTS_STABILITY || 0.42))); 
const ELEVENLABS_TTS_SIMILARITY_BOOST = Math.min(1, Math.max(0, Number(process.env.ELEVENLABS_TTS_SIMILARITY_BOOST || 0.82))); 
const ELEVENLABS_TTS_STYLE = Math.min(1, Math.max(0, Number(process.env.ELEVENLABS_TTS_STYLE || 0.34))); 
const ELEVENLABS_TTS_SPEAKER_BOOST = String(process.env.ELEVENLABS_TTS_SPEAKER_BOOST || 'true').toLowerCase() !== 'false';
const TELEGRAM_CONCIERGE_AUDIO_SEND_MODE = String(process.env.TELEGRAM_CONCIERGE_AUDIO_SEND_MODE || 'voice').trim().toLowerCase();
const TELEGRAM_CONCIERGE_AUDIO_MAX_CHARS = Math.max(420, Number(process.env.TELEGRAM_CONCIERGE_AUDIO_MAX_CHARS || 1150));
const TELEGRAM_CONCIERGE_AUDIO_VARIATION = String(process.env.TELEGRAM_CONCIERGE_AUDIO_VARIATION || 'true').toLowerCase() !== 'false';
const TELEGRAM_CONCIERGE_AUDIO_SMART_TIPS = String(process.env.TELEGRAM_CONCIERGE_AUDIO_SMART_TIPS || 'true').toLowerCase() !== 'false';
const TELEGRAM_CONCIERGE_AUDIO_PERSONALITY = String(process.env.TELEGRAM_CONCIERGE_AUDIO_PERSONALITY || 'casual-premium').trim().toLowerCase();
const TELEGRAM_CONCIERGE_VOICE_ENABLED = String(process.env.TELEGRAM_CONCIERGE_VOICE_ENABLED || 'true').toLowerCase() !== 'false';
const TELEGRAM_CONCIERGE_VOICE_PREMIUM_ONLY = String(process.env.TELEGRAM_CONCIERGE_VOICE_PREMIUM_ONLY || 'false').toLowerCase() === 'true';
const TELEGRAM_CONCIERGE_AUDIO_MAX_SECONDS_DEFAULT = (TELEGRAM_CONCIERGE_SPEECH_PROVIDER.includes('eleven') || TELEGRAM_CONCIERGE_SPEECH_PROVIDER.includes('openai')) ? 180 : 60;
const TELEGRAM_CONCIERGE_AUDIO_MAX_SECONDS = Math.max(20, Number(process.env.TELEGRAM_CONCIERGE_AUDIO_MAX_SECONDS || TELEGRAM_CONCIERGE_AUDIO_MAX_SECONDS_DEFAULT));
const TELEGRAM_DEFAULT_CONCIERGE_NAME = 'CrewCheck Concierge';
const TELEGRAM_WELCOME_CONCIERGE_NAME = String(process.env.TELEGRAM_WELCOME_CONCIERGE_NAME || process.env.CREWCHECK_TELEGRAM_WELCOME_CONCIERGE_NAME || 'Bruno Saraiva').replace(/\s+/g, ' ').trim().slice(0, 48) || 'Bruno Saraiva';
const TELEGRAM_PREMIUM_SUPPORT_USERNAME = normalizeTelegramUsername(process.env.TELEGRAM_PREMIUM_SUPPORT_USERNAME || process.env.CREWCHECK_PREMIUM_SUPPORT_USERNAME || 'bmedeiros1987');
const TELEGRAM_DEFAULT_PREFERENCES = {
 smartDeparture: true,
 roster: true,
 radar: true,
 gateStatus: true,
 traffic: true,
 irregularities: true,
 dailySummary: false,
 weeklySummary: false,
 concierge: true,
 conciergePremiumText: true,
 conciergeFreeDailyLimit: true,
 conciergeVoice: true,
 conciergeAudioReplies: true,
 conciergeName: TELEGRAM_DEFAULT_CONCIERGE_NAME,
 radarImportantOnly: true,
 radarQuiet: false,
 admin: false,
};

const TELEGRAM_DEDUP_TTL_MS = Number(process.env.TELEGRAM_DEDUP_TTL_MS || 10 * 60 * 1000);
const TELEGRAM_RADAR_UNCHANGED_TTL_MS = Number(process.env.TELEGRAM_RADAR_UNCHANGED_TTL_MS || 90 * 60 * 1000);
const TELEGRAM_RADAR_STATE_TTL_MS = Number(process.env.TELEGRAM_RADAR_STATE_TTL_MS || 14 * 60 * 60 * 1000);
const telegramNotificationDedupe = new Map();
const telegramRadarState = new Map();
const telegramConciergeUsage = new Map();

function telegramNormalizeDedupePart(value) {
 return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 600);
}

function telegramDedupeKey(row, category, title, lines = []) {
 const body = (Array.isArray(lines) ? lines : [lines])
  .map(telegramNormalizeDedupePart)
  .filter(Boolean)
  .join(' | ');
 return [row?.user_id || row?.userId || '', row?.chat_id || '', category || 'default', telegramNormalizeDedupePart(title), body].join('::');
}

function telegramCategoryDedupeTtl(category) {
 if (category === 'radar' || category === 'gateStatus') return Math.max(30 * 60 * 1000, TELEGRAM_RADAR_UNCHANGED_TTL_MS);
 if (category === 'smartDeparture') return Number.isFinite(TELEGRAM_DEDUP_TTL_MS) && TELEGRAM_DEDUP_TTL_MS > 0 ? TELEGRAM_DEDUP_TTL_MS : 10 * 60 * 1000;
 return Math.max(10 * 60 * 1000, Number.isFinite(TELEGRAM_DEDUP_TTL_MS) && TELEGRAM_DEDUP_TTL_MS > 0 ? TELEGRAM_DEDUP_TTL_MS : 10 * 60 * 1000);
}

function telegramShouldSkipDuplicate(row, category, title, lines = []) {
 if (/Telegram Premium ativo/i.test(String(title || ''))) return false;
 const now = Date.now();
 const ttl = telegramCategoryDedupeTtl(category || 'default');
 for (const [key, at] of telegramNotificationDedupe.entries()) {
  if (!Number.isFinite(at) || now - at > ttl) telegramNotificationDedupe.delete(key);
 }
 const key = telegramDedupeKey(row, category, title, lines);
 const previous = telegramNotificationDedupe.get(key);
 if (previous && now - previous < ttl) return true;
 telegramNotificationDedupe.set(key, now);
 return false;
}

function normalizeRadarTelegramValue(value) {
 return String(value || '').replace(/\s+/g, ' ').trim();
}

function radarTelegramStatusIsScheduledOnly(status = '') {
 return /^(scheduled|programado|previsto|on time|no horário|pontual)$/i.test(normalizeRadarTelegramValue(status));
}

function radarTelegramStatusIsCritical(status = '') {
 return /(embarque|boarding|última chamada|ultima chamada|last call|cancel|cancelado|delayed|atras|final call|gate closing|fechado|alterado|changed|divert|retido)/i.test(normalizeRadarTelegramValue(status));
}

function radarTelegramStableFingerprint(status = {}) {
 const estimate = normalizeRadarTelegramValue(status.estimatedDeparture || status.confirmedTime || status.scheduledDeparture || status.scheduledTime || '');
 return [
  normalizeRadarTelegramValue(status.status || '').toUpperCase(),
  normalizeRadarTelegramValue(status.gate || '').toUpperCase(),
  normalizeRadarTelegramValue(status.terminal || '').toUpperCase(),
  estimate.toUpperCase(),
 ].join('|');
}

function radarTelegramHasUsefulOperationalData(status = {}) {
 const st = normalizeRadarTelegramValue(status.status || '');
 if (normalizeRadarTelegramValue(status.gate || '') || normalizeRadarTelegramValue(status.terminal || '')) return true;
 if (normalizeRadarTelegramValue(status.estimatedDeparture || status.confirmedTime || '')) return true;
 if (radarTelegramStatusIsCritical(st)) return true;
 return Boolean(st && !radarTelegramStatusIsScheduledOnly(st));
}

function telegramRadarRequestWantsPush(params = {}) {
 const get = (key) => typeof params.get === 'function' ? params.get(key) : params?.[key];
 return /^(1|true|yes|sim)$/i.test(String(get('notifyTelegram') || get('telegramPush') || get('telegram') || '').trim());
}

function radarTelegramIsPastOrClosed(status = {}, params = {}) {
 const get = (key) => typeof params.get === 'function' ? params.get(key) : params?.[key];
 const origin = normalizeRadarTelegramValue(get('origin') || status.origin || status.departureAirport || 'BSB').toUpperCase();
 const dateKey = radarIsoDate(get('date') || status.date || '');
 const today = todayIsoForAirportServer(origin || 'BSB');
 if (dateKey < today) return true;
 const statusLabel = normalizeRadarTelegramValue(status.status || '');
 if (/(pousou|landed|arrived|chegou|finalizado|finished|completed|encerrado|closed)$/i.test(statusLabel)) return true;
 return false;
}

async function notifyTelegramRadarForUser(db, userId, status = {}, params = {}) {
 if (!telegramIsConfigured() || !db || !userId) return { ok: false, skipped: true };
 const row = await telegramLinkForUser(db, userId).catch(() => null);
 if (!row?.is_active || !row?.chat_id) return { ok: false, skipped: true, reason: 'telegram não conectado' };
 const preferences = normalizeTelegramPreferences(row.preferences_json || {});
 if (preferences.radar === false || preferences.radarQuiet === true) return { ok: false, skipped: true, reason: 'radar silenciado' };
 const flight = normalizeFlightToken(params.flight || params.flightNumber || status.flightNumber || status.matchedFlight || '');
 const statusLabel = normalizeRadarTelegramValue(status.status || '');
 if (!telegramRadarRequestWantsPush(params)) return { ok: false, skipped: true, reason: 'consulta radar sem push Telegram' };
 if (radarTelegramIsPastOrClosed(status, params)) return { ok: false, skipped: true, reason: 'voo passado/finalizado não notificado' };
 const importantOnly = preferences.radarImportantOnly !== false;
 if (importantOnly && !radarTelegramHasUsefulOperationalData(status)) return { ok: false, skipped: true, reason: 'sem mudança operacional relevante' };
 const dateKey = radarIsoDate(params.date || status.date || new Date().toISOString().slice(0, 10));
 const key = [row.user_id || userId, row.chat_id, flight || 'voo', dateKey, normalizeRadarTelegramValue(params.origin || ''), normalizeRadarTelegramValue(params.destination || '')].join('::');
 const now = Date.now();
 for (const [itemKey, item] of telegramRadarState.entries()) {
  if (!item?.at || now - item.at > TELEGRAM_RADAR_STATE_TTL_MS) telegramRadarState.delete(itemKey);
 }
 const fingerprint = radarTelegramStableFingerprint(status);
 const previous = telegramRadarState.get(key);
 if (previous?.fingerprint === fingerprint && now - previous.at < TELEGRAM_RADAR_UNCHANGED_TTL_MS) {
  return { ok: false, skipped: true, reason: 'radar sem mudança desde último aviso' };
 }
 telegramRadarState.set(key, { fingerprint, at: now });
 const lines = [
  flight ? `Voo: ${flight}` : '',
  statusLabel ? `Status: ${statusLabel}` : '',
  status.gate ? `Portão: ${status.gate}` : '',
  status.terminal ? `Terminal: ${status.terminal}` : '',
  status.estimatedDeparture || status.confirmedTime ? `Previsão: ${status.estimatedDeparture || status.confirmedTime}` : '',
  status.sourceLabel || status.source ? `Fonte: ${status.sourceLabel || status.source}` : '',
  radarTelegramStatusIsCritical(statusLabel) ? 'Alerta operacional: confira o monitor do aeroporto e a companhia.' : 'Sem nova notificação até haver mudança relevante.',
 ];
 return notifyTelegramForUser(db, userId, 'radar', `Radar CrewCheck · ${flight || 'voo'}`, lines);
}
const CREWCHECK_ANDROID_PLAY_URL = String(process.env.CREWCHECK_ANDROID_PLAY_URL || 'https://play.google.com/apps/testing/com.crewcheck.app').trim();
const CREWCHECK_ANDROID_APK_URL = String(process.env.CREWCHECK_ANDROID_APK_URL || CREWCHECK_ANDROID_PLAY_URL).trim();
const AUTH_REGISTER_RATE_LIMIT_MAX = Math.max(3, Number(process.env.CREWCHECK_REGISTER_RATE_LIMIT_MAX || 10));
const AUTH_REGISTER_RATE_LIMIT_WINDOW_MS = Math.max(60_000, Number(process.env.CREWCHECK_REGISTER_RATE_LIMIT_WINDOW_MS || 60 * 60 * 1000));
const authRateBuckets = new Map();

let pool = null;
let schemaPromise = null;

function getPool() {
 if (!DATABASE_URL) return null;
 if (!pool) {
  if (DB_KIND === 'mysql') {
   const url = new URL(DATABASE_URL.replace(/^mysql2:/i, 'mysql:'));
   const sslRequired = /ssl-mode=required/i.test(url.search) || /aivencloud\.com$/i.test(url.hostname) || process.env.MYSQL_SSL === 'true' || process.env.MYSQL_SSL_MODE === 'REQUIRED';
   pool = createMysqlAdapter(mysql.createPool({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username || ''),
    password: decodeURIComponent(url.password || ''),
    database: (url.pathname || '/defaultdb').replace(/^\//, '') || 'defaultdb',
    waitForConnections: true,
    connectionLimit: Number(process.env.MYSQL_POOL_MAX || 5),
    queueLimit: 0,
    timezone: '+00:00',
    dateStrings: false,
    ssl: sslRequired ? { rejectUnauthorized: false } : undefined,
   }));
  } else {
   pool = new PgPool({
    connectionString: DATABASE_URL,
    max: Number(process.env.PG_POOL_MAX || 5),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 8_000,
    ssl: DATABASE_URL.includes('supabase.co') || process.env.PGSSLMODE === 'require'
     ? { rejectUnauthorized: false }
     : undefined,
   });
  }
 }
 return pool;
}

function createMysqlAdapter(mysqlPool) {
 return {
  kind: 'mysql',
  async query(sql, params = []) {
   return mysqlQuery(mysqlPool, sql, params);
  },
 };
}

function convertPgPlaceholders(sql, params) {
 const ordered = [];
 let converted = sql
  .replace(/::jsonb/g, '')
  .replace(/::uuid/g, '')
  .replace(/now\(\)/gi, 'CURRENT_TIMESTAMP')
  .replace(/\btrue\b/gi, '1')
  .replace(/\bfalse\b/gi, '0');
 converted = converted.replace(/\$(\d+)/g, (_, n) => {
  ordered.push(params[Number(n) - 1]);
  return '?';
 });
 return { sql: normalizeMysqlSql(converted), params: normalizeMysqlParams(ordered.length ? ordered : params) };
}

function normalizeMysqlSql(sql) {
 // MySQL 8 treats RANK as a reserved window function. Keep the JS/API field named
 // "rank", but always escape the SQL identifier when talking to MySQL/Aiven.
 return sql
  .replace(/\`rank\`/gi, '__CREWCHECK_RANK__')
  .replace(/\brank\b/gi, '\`rank\`')
  .replace(/__CREWCHECK_RANK__/g, '\`rank\`');
}

function mysqlDateTime(value) {
 if (value instanceof Date) {
  return value.toISOString().slice(0, 19).replace('T', ' ');
 }
 if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) {
  return value.slice(0, 19).replace('T', ' ');
 }
 return value;
}

function normalizeMysqlParams(params = []) {
 return params.map((param) => mysqlDateTime(param));
}

function normalizeMysqlRow(row) {
 if (!row || typeof row !== 'object') return row;
 for (const key of ['roster_json', 'compliance_json', 'gym_json', 'metadata', 'preferences_json']) {
  if (typeof row[key] === 'string') {
   try { row[key] = JSON.parse(row[key]); } catch {}
  }
 }
 for (const key of ['is_active', 'billing_cancel_at_period_end', 'email_verified']) {
  if (key in row) row[key] = Boolean(row[key]);
 }
 return row;
}

async function mysqlQuery(mysqlPool, originalSql, params = []) {
 const compact = originalSql.replace(/\s+/g, ' ').trim().toLowerCase();
 const { sql, params: mysqlParams } = convertPgPlaceholders(originalSql, params);

 if (compact.startsWith('insert into crewcheck_users')) {
  await mysqlPool.execute(normalizeMysqlSql(sql.replace(/\s+returning \*/i, '')), normalizeMysqlParams(mysqlParams));
  const [rows] = await mysqlPool.execute(normalizeMysqlSql('select * from crewcheck_users where id = ? limit 1'), normalizeMysqlParams([params[0]]));
  return { rows: rows.map(normalizeMysqlRow), rowCount: rows.length };
 }

 if (compact.startsWith('insert into crewcheck_rosters')) {
  const id = params[17];
  await mysqlPool.execute(normalizeMysqlSql(sql.replace(/\s+returning[\s\S]*$/i, '')), normalizeMysqlParams(mysqlParams));
  const [rows] = await mysqlPool.execute(normalizeMysqlSql(`select id, created_at, updated_at, crew_name, crew_id, base, \`rank\`, airline, period_year, period_month,
   source_file_name, score, intensity_score, alerts_count, critical_alerts_count, checksum from crewcheck_rosters where id = ? limit 1`), normalizeMysqlParams([id]));
  return { rows: rows.map(normalizeMysqlRow), rowCount: rows.length };
 }

 if (compact.startsWith('update crewcheck_rosters') && /returning/i.test(originalSql)) {
  const id = params[17];
  await mysqlPool.execute(normalizeMysqlSql(sql.replace(/\s+returning[\s\S]*$/i, '')), normalizeMysqlParams(mysqlParams));
  const [rows] = await mysqlPool.execute(normalizeMysqlSql(`select id, created_at, updated_at, crew_name, crew_id, base, \`rank\`, airline, period_year, period_month,
   source_file_name, score, intensity_score, alerts_count, critical_alerts_count, checksum from crewcheck_rosters where id = ? limit 1`), normalizeMysqlParams([id]));
  return { rows: rows.map(normalizeMysqlRow), rowCount: rows.length };
 }

 if (compact.startsWith('delete from crewcheck_rosters') && /returning/i.test(originalSql)) {
  const rosterId = params[0];
  const userId = params[1];
  const [before] = await mysqlPool.execute(normalizeMysqlSql('select id from crewcheck_rosters where id = ? and (? is null or user_id = ?) limit 1'), normalizeMysqlParams([rosterId, userId, userId]));
  if (!before.length) return { rows: [], rowCount: 0 };
  await mysqlPool.execute(normalizeMysqlSql('delete from crewcheck_rosters where id = ? and (? is null or user_id = ?)'), normalizeMysqlParams([rosterId, userId, userId]));
  return { rows: before, rowCount: before.length };
 }

 const [result] = await mysqlPool.execute(normalizeMysqlSql(sql), normalizeMysqlParams(mysqlParams));
 if (Array.isArray(result)) return { rows: result.map(normalizeMysqlRow), rowCount: result.length };
 return { rows: [], rowCount: result.affectedRows || 0 };
}

const mimeTypes = new Map([
 ['.html', 'text/html; charset=utf-8'],
 ['.js', 'text/javascript; charset=utf-8'],
 ['.mjs', 'text/javascript; charset=utf-8'],
 ['.css', 'text/css; charset=utf-8'],
 ['.json', 'application/json; charset=utf-8'],
 ['.svg', 'image/svg+xml'],
 ['.png', 'image/png'],
 ['.jpg', 'image/jpeg'],
 ['.jpeg', 'image/jpeg'],
 ['.webp', 'image/webp'],
 ['.ico', 'image/x-icon'],
 ['.woff', 'font/woff'],
 ['.woff2', 'font/woff2'],
 ['.ttf', 'font/ttf'],
 ['.map', 'application/json; charset=utf-8'],
 ['.txt', 'text/plain; charset=utf-8'],
 ['.pdf', 'application/pdf'],
 ['.ics', 'text/calendar; charset=utf-8'],
]);

function safeJoin(root, requestedPath) {
 const decoded = decodeURIComponent(requestedPath.split('?')[0]);
 const cleanPath = decoded === '/' ? '/index.html' : decoded;
 const target = path.normalize(path.join(root, cleanPath));
 if (!target.startsWith(root)) return null;
 return target;
}

async function exists(filePath) {
 try {
  const stat = await fsp.stat(filePath);
  return stat.isFile();
 } catch {
  return false;
 }
}

function sendJson(res, status, payload) {
 res.writeHead(status, {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
 });
 res.end(JSON.stringify(payload));
}

function requireDatabase(res) {
 const db = getPool();
 if (!db) {
  sendJson(res, 503, {
   ok: false,
   code: 'DATABASE_URL_NOT_CONFIGURED',
   message: 'Configure a variável DATABASE_URL no Render para ativar a base de dados.',
  });
  return null;
 }
 return db;
}

async function ensureSchema() {
 const db = getPool();
 if (!db || !AUTO_MIGRATE) return;
 if (!schemaPromise) {
  schemaPromise = (async () => {
   if (DB_KIND === 'mysql') {
    await db.query(`
     create table if not exists crewcheck_users (
      id char(36) primary key,
      created_at timestamp not null default current_timestamp,
      updated_at timestamp not null default current_timestamp on update current_timestamp,
      name varchar(255) not null default 'Tripulante',
      email varchar(320) not null,
      password_hash text not null,
      role varchar(64) not null default 'crew',
      crew_id varchar(64),
      base varchar(16),
      \`rank\` varchar(64),
      is_active tinyint(1) not null default 1,
      last_login_at timestamp null,
      temp_password_hash text,
      temp_password_expires_at timestamp null,
      subscription_plan varchar(64) not null default 'free',
      subscription_status varchar(64) not null default 'free',
      billing_cycle varchar(32),
      trial_started_at timestamp null,
      trial_expires_at timestamp null,
      premium_expires_at timestamp null,
      asaas_customer_id varchar(128),
      asaas_subscription_id varchar(128),
      billing_cancel_at_period_end tinyint(1) not null default 0,
      billing_tax_id varchar(32),
      trial_identity_hash varchar(128),
      email_verified tinyint(1) not null default 1,
      email_verified_at timestamp null,
      email_verification_token_hash varchar(128),
      email_verification_expires_at timestamp null,
      email_verification_sent_at timestamp null,
      registration_ip varchar(128),
      registration_user_agent text,
      registration_captcha_provider varchar(64),
      virtual_base_enabled tinyint(1) not null default 0,
      virtual_base_airport varchar(16),
      unique key crewcheck_users_email_uidx (email)
     ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
    `);

    const mysqlBillingUserColumns = [
     "alter table crewcheck_users add column subscription_plan varchar(64) not null default 'free'",
     "alter table crewcheck_users add column subscription_status varchar(64) not null default 'free'",
     "alter table crewcheck_users add column billing_cycle varchar(32) null",
     "alter table crewcheck_users add column trial_started_at timestamp null",
     "alter table crewcheck_users add column trial_expires_at timestamp null",
     "alter table crewcheck_users add column premium_expires_at timestamp null",
     "alter table crewcheck_users add column asaas_customer_id varchar(128) null",
     "alter table crewcheck_users add column asaas_subscription_id varchar(128) null",
     "alter table crewcheck_users add column billing_cancel_at_period_end tinyint(1) not null default 0",
     "alter table crewcheck_users add column billing_tax_id varchar(32) null",
     "alter table crewcheck_users add column trial_identity_hash varchar(128) null",
     "alter table crewcheck_users add column email_verified tinyint(1) not null default 1",
     "alter table crewcheck_users add column email_verified_at timestamp null",
     "alter table crewcheck_users add column email_verification_token_hash varchar(128) null",
     "alter table crewcheck_users add column email_verification_expires_at timestamp null",
     "alter table crewcheck_users add column email_verification_sent_at timestamp null",
     "alter table crewcheck_users add column registration_ip varchar(128) null",
     "alter table crewcheck_users add column registration_user_agent text null",
     "alter table crewcheck_users add column registration_captcha_provider varchar(64) null",
     "alter table crewcheck_users add column virtual_base_enabled tinyint(1) not null default 0",
     "alter table crewcheck_users add column virtual_base_airport varchar(16) null",
    ];
    for (const stmt of mysqlBillingUserColumns) await db.query(stmt).catch(() => null);

    await db.query(`
     create table if not exists crewcheck_billing_events (
      id char(36) primary key,
      created_at timestamp not null default current_timestamp,
      user_id char(36),
      provider varchar(64) not null default 'asaas',
      event_type varchar(128),
      provider_event_id varchar(128),
      subscription_id varchar(128),
      payment_id varchar(128),
      status varchar(128),
      payload json not null,
      key crewcheck_billing_user_idx (user_id, created_at),
      key crewcheck_billing_subscription_idx (subscription_id),
      key crewcheck_billing_payment_idx (payment_id)
     ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
    `).catch(() => null);


    await db.query(`
     create table if not exists crewcheck_trial_locks (
      identity_hash varchar(128) primary key,
      created_at timestamp not null default current_timestamp,
      user_id char(36),
      source varchar(64),
      metadata json not null,
      key crewcheck_trial_locks_user_idx (user_id, created_at)
     ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
    `).catch(() => null);

    await db.query(`
     create table if not exists crewcheck_extra_flight_search_cache (
      cache_key varchar(128) primary key,
      created_at timestamp not null default current_timestamp,
      updated_at timestamp not null default current_timestamp on update current_timestamp,
      origin varchar(8) not null,
      destination varchar(8) not null,
      flight_date date not null,
      target_iso varchar(64),
      payload_json json not null,
      source varchar(255),
      options_count int not null default 0,
      unique key crewcheck_extra_flight_search_cache_route_uidx (origin, destination, flight_date, target_iso),
      key crewcheck_extra_flight_search_cache_date_idx (flight_date, updated_at)
     ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
    `).catch(() => null);

    await db.query(`
     create table if not exists crewcheck_airport_board_cache (
      cache_key varchar(128) primary key,
      created_at timestamp not null default current_timestamp,
      updated_at timestamp not null default current_timestamp on update current_timestamp,
      airport varchar(8) not null,
      board_type varchar(16) not null,
      airline varchar(8),
      flight_date date not null,
      payload_json json not null,
      source varchar(255),
      rows_count int not null default 0,
      unique key crewcheck_airport_board_cache_route_uidx (airport, board_type, airline, flight_date),
      key crewcheck_airport_board_cache_date_idx (flight_date, updated_at)
     ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
    `).catch(() => null);

    await db.query(`
     create table if not exists crewcheck_sessions (
      id char(36) primary key,
      created_at timestamp not null default current_timestamp,
      expires_at timestamp not null,
      user_id char(36),
      token_hash varchar(128) not null unique,
      user_agent text,
      ip varchar(128),
      key crewcheck_sessions_user_idx (user_id, created_at),
      constraint crewcheck_sessions_user_fk foreign key (user_id) references crewcheck_users(id) on delete cascade
     ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
    `).catch(async () => {
     await db.query(`
      create table if not exists crewcheck_sessions (
       id char(36) primary key,
       created_at timestamp not null default current_timestamp,
       expires_at timestamp not null,
       user_id char(36),
       token_hash varchar(128) not null unique,
       user_agent text,
       ip varchar(128),
       key crewcheck_sessions_user_idx (user_id, created_at)
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
     `);
    });

    await db.query(`
     create table if not exists crewcheck_rosters (
      id char(36) primary key,
      created_at timestamp not null default current_timestamp,
      updated_at timestamp not null default current_timestamp on update current_timestamp,
      user_id char(36),
      crew_name varchar(255),
      crew_id varchar(64),
      base varchar(16),
      \`rank\` varchar(64),
      airline varchar(128),
      period_year int,
      period_month int,
      source_file_name varchar(255),
      roster_json json not null,
      compliance_json json,
      gym_json json,
      score int,
      intensity_score int,
      alerts_count int not null default 0,
      critical_alerts_count int not null default 0,
      checksum varchar(128),
      key crewcheck_rosters_created_at_idx (created_at),
      key crewcheck_rosters_crew_id_idx (crew_id),
      key crewcheck_rosters_period_idx (period_year, period_month),
      key crewcheck_rosters_user_idx (user_id, created_at),
      key crewcheck_rosters_checksum_idx (checksum)
     ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
    `);

    await db.query(`
     create table if not exists crewcheck_audit_logs (
      id char(36) primary key,
      created_at timestamp not null default current_timestamp,
      user_id char(36),
      action varchar(160) not null,
      entity_id char(36),
      metadata json not null,
      key crewcheck_audit_user_idx (user_id, created_at),
      key crewcheck_audit_action_idx (action)
     ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
    `);

    await db.query(`
     create table if not exists crewcheck_telegram_links (
      id char(36) primary key,
      created_at timestamp not null default current_timestamp,
      updated_at timestamp not null default current_timestamp on update current_timestamp,
      user_id char(36) not null,
      connect_code varchar(32) not null,
      expected_username varchar(64),
      chat_id varchar(64),
      chat_username varchar(255),
      chat_first_name varchar(255),
      chat_last_name varchar(255),
      preferences_json json not null,
      is_active tinyint(1) not null default 0,
      connected_at timestamp null,
      last_message_at timestamp null,
      unique key crewcheck_telegram_user_uidx (user_id),
      unique key crewcheck_telegram_code_uidx (connect_code),
      key crewcheck_telegram_chat_idx (chat_id)
     ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
    `).catch(() => null);
    await db.query(`alter table crewcheck_telegram_links add column expected_username varchar(64) null`).catch(() => null);

    await db.query(`
     create table if not exists crewcheck_calendar_feeds (
      id char(36) primary key,
      created_at timestamp not null default current_timestamp,
      updated_at timestamp not null default current_timestamp on update current_timestamp,
      user_id char(36),
      token varchar(128) not null unique,
      ics_content mediumtext,
      period_label varchar(64),
      mode varchar(32),
      events_count int not null default 0,
      key crewcheck_calendar_feeds_user_idx (user_id),
      key crewcheck_calendar_feeds_token_idx (token)
     ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
    `);
    return;
   }

   // Migração tolerante PostgreSQL/Aiven legacy.
   await db.query(`
    create table if not exists crewcheck_users (
     id uuid primary key,
     created_at timestamptz not null default now(),
     updated_at timestamptz not null default now(),
     name text not null default 'Tripulante',
     email text not null unique,
     password_hash text not null,
     role text not null default 'crew',
     crew_id text,
     base text,
     rank text,
     is_active boolean not null default true,
     last_login_at timestamptz,
     temp_password_hash text,
     temp_password_expires_at timestamptz,
     subscription_plan text not null default 'free',
     subscription_status text not null default 'free',
     billing_cycle text,
     trial_started_at timestamptz,
     trial_expires_at timestamptz,
     premium_expires_at timestamptz,
     asaas_customer_id text,
     asaas_subscription_id text,
     billing_cancel_at_period_end boolean not null default false,
     billing_tax_id text,
     trial_identity_hash text,
     email_verified boolean not null default true,
     email_verified_at timestamptz,
     email_verification_token_hash text,
     email_verification_expires_at timestamptz,
     email_verification_sent_at timestamptz,
     registration_ip text,
     registration_user_agent text,
     registration_captcha_provider text,
     virtual_base_enabled boolean not null default false,
     virtual_base_airport text
    );
   `);

   await db.query(`alter table crewcheck_users add column if not exists updated_at timestamptz not null default now();`);
   await db.query(`alter table crewcheck_users add column if not exists name text not null default 'Tripulante';`);
   await db.query(`alter table crewcheck_users add column if not exists role text not null default 'crew';`);
   await db.query(`alter table crewcheck_users add column if not exists crew_id text;`);
   await db.query(`alter table crewcheck_users add column if not exists base text;`);
   await db.query(`alter table crewcheck_users add column if not exists rank text;`);
   await db.query(`alter table crewcheck_users add column if not exists is_active boolean not null default true;`);
   await db.query(`alter table crewcheck_users add column if not exists last_login_at timestamptz;`);
   await db.query(`alter table crewcheck_users add column if not exists temp_password_hash text;`);
   await db.query(`alter table crewcheck_users add column if not exists temp_password_expires_at timestamptz;`);
   await db.query(`alter table crewcheck_users add column if not exists subscription_plan text not null default 'free';`);
   await db.query(`alter table crewcheck_users add column if not exists subscription_status text not null default 'free';`);
   await db.query(`alter table crewcheck_users add column if not exists billing_cycle text;`);
   await db.query(`alter table crewcheck_users add column if not exists trial_started_at timestamptz;`);
   await db.query(`alter table crewcheck_users add column if not exists trial_expires_at timestamptz;`);
   await db.query(`alter table crewcheck_users add column if not exists premium_expires_at timestamptz;`);
   await db.query(`alter table crewcheck_users add column if not exists asaas_customer_id text;`);
   await db.query(`alter table crewcheck_users add column if not exists asaas_subscription_id text;`);
   await db.query(`alter table crewcheck_users add column if not exists billing_cancel_at_period_end boolean not null default false;`);
   await db.query(`alter table crewcheck_users add column if not exists billing_tax_id text;`);
   await db.query(`alter table crewcheck_users add column if not exists trial_identity_hash text;`);
   await db.query(`alter table crewcheck_users add column if not exists email_verified boolean not null default true;`);
   await db.query(`alter table crewcheck_users add column if not exists email_verified_at timestamptz;`);
   await db.query(`alter table crewcheck_users add column if not exists email_verification_token_hash text;`);
   await db.query(`alter table crewcheck_users add column if not exists email_verification_expires_at timestamptz;`);
   await db.query(`alter table crewcheck_users add column if not exists email_verification_sent_at timestamptz;`);
   await db.query(`alter table crewcheck_users add column if not exists registration_ip text;`);
   await db.query(`alter table crewcheck_users add column if not exists registration_user_agent text;`);
   await db.query(`alter table crewcheck_users add column if not exists registration_captcha_provider text;`);
   await db.query(`alter table crewcheck_users add column if not exists virtual_base_enabled boolean not null default false;`);
   await db.query(`alter table crewcheck_users add column if not exists virtual_base_airport text;`);
   await db.query(`create unique index if not exists crewcheck_users_email_uidx on crewcheck_users (lower(email));`).catch(() => null);

   await db.query(`
    create table if not exists crewcheck_billing_events (
     id uuid primary key,
     created_at timestamptz not null default now(),
     user_id uuid references crewcheck_users(id) on delete set null,
     provider text not null default 'asaas',
     event_type text,
     provider_event_id text,
     subscription_id text,
     payment_id text,
     status text,
     payload jsonb not null default '{}'::jsonb
    );
   `).catch(() => null);
   await db.query(`alter table crewcheck_billing_events add column if not exists user_id uuid references crewcheck_users(id) on delete set null;`).catch(() => null);
   await db.query(`alter table crewcheck_billing_events add column if not exists payload jsonb not null default '{}'::jsonb;`).catch(() => null);
   await db.query(`create index if not exists crewcheck_billing_user_idx on crewcheck_billing_events (user_id, created_at desc);`).catch(() => null);
   await db.query(`create index if not exists crewcheck_billing_subscription_idx on crewcheck_billing_events (subscription_id);`).catch(() => null);
   await db.query(`create index if not exists crewcheck_billing_payment_idx on crewcheck_billing_events (payment_id);`).catch(() => null);


   await db.query(`
    create table if not exists crewcheck_trial_locks (
     identity_hash text primary key,
     created_at timestamptz not null default now(),
     user_id uuid references crewcheck_users(id) on delete set null,
     source text,
     metadata jsonb not null default '{}'::jsonb
    );
   `).catch(() => null);
   await db.query(`create index if not exists crewcheck_trial_locks_user_idx on crewcheck_trial_locks (user_id, created_at desc);`).catch(() => null);

   await db.query(`
    create table if not exists crewcheck_extra_flight_search_cache (
     cache_key text primary key,
     created_at timestamptz not null default now(),
     updated_at timestamptz not null default now(),
     origin text not null,
     destination text not null,
     flight_date date not null,
     target_iso text,
     payload_json jsonb not null,
     source text,
     options_count int not null default 0
    );
   `).catch(() => null);
   await db.query(`create unique index if not exists crewcheck_extra_flight_search_cache_route_uidx on crewcheck_extra_flight_search_cache (origin, destination, flight_date, coalesce(target_iso,''));`).catch(() => null);
   await db.query(`create index if not exists crewcheck_extra_flight_search_cache_date_idx on crewcheck_extra_flight_search_cache (flight_date, updated_at desc);`).catch(() => null);

   await db.query(`
    create table if not exists crewcheck_airport_board_cache (
     cache_key text primary key,
     created_at timestamptz not null default now(),
     updated_at timestamptz not null default now(),
     airport text not null,
     board_type text not null,
     airline text,
     flight_date date not null,
     payload_json jsonb not null,
     source text,
     rows_count int not null default 0
    );
   `).catch(() => null);
   await db.query(`create unique index if not exists crewcheck_airport_board_cache_route_uidx on crewcheck_airport_board_cache (airport, board_type, coalesce(airline,''), flight_date);`).catch(() => null);
   await db.query(`create index if not exists crewcheck_airport_board_cache_date_idx on crewcheck_airport_board_cache (flight_date, updated_at desc);`).catch(() => null);

   await db.query(`
    create table if not exists crewcheck_sessions (
     id uuid primary key,
     created_at timestamptz not null default now(),
     expires_at timestamptz not null,
     user_id uuid references crewcheck_users(id) on delete cascade,
     token_hash text not null unique,
     user_agent text,
     ip text
    );
   `);
   await db.query(`alter table crewcheck_sessions add column if not exists user_id uuid references crewcheck_users(id) on delete cascade;`);
   await db.query(`alter table crewcheck_sessions add column if not exists user_agent text;`);
   await db.query(`alter table crewcheck_sessions add column if not exists ip text;`);
   await db.query(`create index if not exists crewcheck_sessions_user_idx on crewcheck_sessions (user_id, created_at desc);`).catch(() => null);

   await db.query(`
    create table if not exists crewcheck_rosters (
     id uuid primary key,
     created_at timestamptz not null default now(),
     updated_at timestamptz not null default now(),
     user_id uuid references crewcheck_users(id) on delete set null,
     crew_name text,
     crew_id text,
     base text,
     rank text,
     airline text,
     period_year integer,
     period_month integer,
     source_file_name text,
     roster_json jsonb not null,
     compliance_json jsonb,
     gym_json jsonb,
     score integer,
     intensity_score integer,
     alerts_count integer not null default 0,
     critical_alerts_count integer not null default 0,
     checksum text
    );
   `);
   await db.query(`alter table crewcheck_rosters add column if not exists updated_at timestamptz not null default now();`);
   await db.query(`alter table crewcheck_rosters add column if not exists user_id uuid references crewcheck_users(id) on delete set null;`);
   await db.query(`alter table crewcheck_rosters add column if not exists source_file_name text;`);
   await db.query(`alter table crewcheck_rosters add column if not exists checksum text;`);
   await db.query(`alter table crewcheck_rosters add column if not exists gym_json jsonb;`);
   await db.query(`alter table crewcheck_rosters add column if not exists intensity_score integer;`);
   await db.query(`alter table crewcheck_rosters add column if not exists alerts_count integer not null default 0;`);
   await db.query(`alter table crewcheck_rosters add column if not exists critical_alerts_count integer not null default 0;`);
   await db.query(`create index if not exists crewcheck_rosters_created_at_idx on crewcheck_rosters (created_at desc);`).catch(() => null);
   await db.query(`create index if not exists crewcheck_rosters_crew_id_idx on crewcheck_rosters (crew_id);`).catch(() => null);
   await db.query(`create index if not exists crewcheck_rosters_period_idx on crewcheck_rosters (period_year, period_month);`).catch(() => null);
   await db.query(`create index if not exists crewcheck_rosters_user_idx on crewcheck_rosters (user_id, created_at desc);`).catch(() => null);
   await db.query(`create index if not exists crewcheck_rosters_checksum_idx on crewcheck_rosters (checksum);`).catch(() => null);

   await db.query(`
    create table if not exists crewcheck_audit_logs (
     id uuid primary key,
     created_at timestamptz not null default now(),
     user_id uuid references crewcheck_users(id) on delete set null,
     action text not null,
     entity_id uuid,
     metadata jsonb not null default '{}'::jsonb
    );
   `);
   await db.query(`alter table crewcheck_audit_logs add column if not exists user_id uuid references crewcheck_users(id) on delete set null;`);
   await db.query(`alter table crewcheck_audit_logs add column if not exists entity_id uuid;`);
   await db.query(`alter table crewcheck_audit_logs add column if not exists metadata jsonb not null default '{}'::jsonb;`);


   await db.query(`
    create table if not exists crewcheck_telegram_links (
     id uuid primary key,
     created_at timestamptz not null default now(),
     updated_at timestamptz not null default now(),
     user_id uuid not null references crewcheck_users(id) on delete cascade,
     connect_code text not null unique,
     expected_username text,
     chat_id text,
     chat_username text,
     chat_first_name text,
     chat_last_name text,
     preferences_json jsonb not null default '{}'::jsonb,
     is_active boolean not null default false,
     connected_at timestamptz,
     last_message_at timestamptz
    );
   `).catch(() => null);
   await db.query(`alter table crewcheck_telegram_links add column if not exists expected_username text;`).catch(() => null);
   await db.query(`create unique index if not exists crewcheck_telegram_user_uidx on crewcheck_telegram_links (user_id);`).catch(() => null);
   await db.query(`create index if not exists crewcheck_telegram_chat_idx on crewcheck_telegram_links (chat_id);`).catch(() => null);

   await db.query(`
    create table if not exists crewcheck_calendar_feeds (
     id uuid primary key,
     created_at timestamptz not null default now(),
     updated_at timestamptz not null default now(),
     user_id uuid references crewcheck_users(id) on delete cascade,
     token text not null unique,
     ics_content text,
     period_label text,
     mode text,
     events_count integer not null default 0
    );
   `);
   await db.query(`alter table crewcheck_calendar_feeds add column if not exists updated_at timestamptz not null default now();`);
   await db.query(`alter table crewcheck_calendar_feeds add column if not exists ics_content text;`);
   await db.query(`alter table crewcheck_calendar_feeds add column if not exists period_label text;`);
   await db.query(`alter table crewcheck_calendar_feeds add column if not exists mode text;`);
   await db.query(`alter table crewcheck_calendar_feeds add column if not exists events_count integer not null default 0;`);
   await db.query(`create index if not exists crewcheck_calendar_feeds_user_idx on crewcheck_calendar_feeds (user_id);`).catch(() => null);
   await db.query(`create index if not exists crewcheck_calendar_feeds_token_idx on crewcheck_calendar_feeds (token);`).catch(() => null);
  })().catch((error) => {
   schemaPromise = null;
   throw error;
  });
 }
 await schemaPromise;
}



// --- CrewCheck server-side PDF parser (mobile-safe) ---
const AIRPORTS = new Set(['BSB','GRU','CGH','VCP','NAT','MCZ','FOR','CNF','PMW','FLN','MAB','CPV','GYN','JPA','EZE','VIX','SSA','GIG','SDU','REC','AJU','BEL','SLZ','CGB','POA','CUR']);
const MONTHS = { jan:1, feb:2, fev:2, mar:3, apr:4, abr:4, may:5, mai:5, ma:5, jun:6, jul:7, aug:8, ago:8, sep:9, set:9, oct:10, out:10, nov:11, dec:12, dez:12 };
const WEEKDAYS_PT = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];


async function parsePayslipOnServer({ filename, dataBase64 }) {
 if (!dataBase64) throw new Error('PDF não informado.');
 const buffer = Buffer.from(String(dataBase64).replace(/^data:application\/pdf;base64,/, ''), 'base64');
 if (!buffer.length) throw new Error('PDF vazio.');
 let text = '';
 try {
  const mod = await import('pdf-parse');
  const parse = mod.default || mod;
  const out = await parse(buffer);
  text = String(out?.text || '');
 } catch (error) {
  throw new Error(`Falha ao extrair texto do holerite: ${error?.message || error}`);
 }
 const compact = normalizePayslipText(text);
 const totals = compact.match(/TOTAIS\s+([\d\.]+,\d{2})\s+([\d\.]+,\d{2})/i);
 const gross = totals ? parseBrazilMoney(totals[1]) : null;
 const discounts = totals ? parseBrazilMoney(totals[2]) : null;
 const net = parseMoneyAfterLabel(compact, /L[ií]quido\s+/i);
 const baseSalary = parseMoneyAfterLabel(compact, /Sal[aá]rio Base\s+/i) || parseRubricValue(compact, /1000\s+30,00\s+Sal[aá]rio\s+/i);
 const lines = [
  ['INSS remuneração', parseRubricValue(compact, /\/314\s+14,00\s+INSS\s+Remunera[cç][aã]o\s+/i)],
  ['IRRF salário', parseRubricValue(compact, /\/401\s+27,50\s+IRRF\s+Sal[aá]rio\s+/i)],
  ['Previdência Privada VGBL', parseRubricValue(compact, /7522\s+3,00\s+Previd[eê]ncia\s+Privada\s+VGBL\s+/i)],
  ['Assistência Médica Amil', parseRubricValue(compact, /7130\s+Assistencia\s+Medica\s+Amil\s+/i)],
  ['Coparticipação Amil', parseRubricValue(compact, /7114\s+Coparticipa[cç][aã]o\s+Amil\s+Pos\s+/i)],
  ['Gympass', parseRubricValue(compact, /7215\s+Mensalidade\s+Gympass\s+/i)],
  ['Staff Travel', parseRubricValue(compact, /7620\s+Cota\s+adic\.\s+Staff\s+Travel\s+/i)],
  ['MCT1', parseRubricValue(compact, /MCT1\s+Parcela\/cr[eé]d\.\s+Trabalhador\s+/i)],
  ['MCT2', parseRubricValue(compact, /MCT2\s+Parcela\/cr[eé]d\.\s+Trabalhador\s+/i)],
 ].filter(([, value]) => Number.isFinite(value)).map(([label, value]) => ({ label, value }));
 const recurringDeductions = lines
  .filter((line) => !/INSS|IRRF|VGBL/i.test(line.label))
  .reduce((sum, line) => sum + Number(line.value || 0), 0);
 return { filename, gross, discounts, net, baseSalary, recurringDeductions, lines, parsedAt: new Date().toISOString() };
}

function normalizePayslipText(text) {
 return String(text || '').replace(/\r/g, ' ').replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseBrazilMoney(value) {
 if (!value) return null;
 const normalized = String(value).replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
 const number = Number(normalized);
 return Number.isFinite(number) ? number : null;
}

function parseMoneyAfterLabel(text, labelRegex) {
 const match = String(text || '').match(new RegExp(labelRegex.source + '([\d\.]+,\d{2})', labelRegex.flags));
 return match ? parseBrazilMoney(match[1]) : null;
}

function parseRubricValue(text, regex) {
 const match = String(text || '').match(new RegExp(regex.source + '([\d\.]+,\d{2})', regex.flags));
 return match ? parseBrazilMoney(match[1]) : null;
}


function decodeBase64PdfPayload(dataBase64) {
 const payload = String(dataBase64 || '').trim();
 if (!payload) return Buffer.alloc(0);
 const commaIndex = payload.indexOf(',');
 const base64 = payload.startsWith('data:') && commaIndex >= 0 ? payload.slice(commaIndex + 1) : payload;
 const cleaned = base64.replace(/\s+/g, '');
 const bytes = Buffer.from(cleaned, 'base64');
 if (bytes.slice(0, 4).toString('utf8') !== '%PDF') {
  const direct = Buffer.from(payload);
  if (direct.slice(0, 4).toString('utf8') === '%PDF') return direct;
 }
 return bytes;
}

async function parsePdfOnServer({ filename, dataBase64 }) {
 if (!dataBase64 || typeof dataBase64 !== 'string') throw new Error('PDF não recebido pelo servidor.');
 const bytes = decodeBase64PdfPayload(dataBase64);
 if (!bytes.length) throw new Error('PDF vazio.');
 const pdfjsImport = await import('pdfjs-dist/legacy/build/pdf.js');
 const pdfjs = pdfjsImport.default || pdfjsImport;
 const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes), disableWorker: true, isEvalSupported: false, disableFontFace: true }).promise;
 const pages = [];
 const allItems = [];
 for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
  const page = await pdf.getPage(pageNo);
  const tc = await page.getTextContent();
  const items = tc.items.map((it) => ({
   str: String(it.str || '').trim(),
   x: Number(it.transform?.[4] || 0),
   y: Number(it.transform?.[5] || 0),
   page: pageNo,
  })).filter((it) => it.str);
  allItems.push(...items);
  pages.push({ pageNo, items });
 }
 const fullText = buildServerFullText(pages);
 const isAims = /Convertida para padr/i.test(fullText) || /Tripulante:/i.test(fullText);
 const roster = isAims ? parseServerAims(fullText, pages) : parseServerRosterReport(fullText, pages, filename);
 roster.rawText = fullText;
 roster.days = finalizeServerDays(roster.days, roster.month, roster.year, roster.base);
 const diagnostics = buildParseDiagnostics(roster, isAims ? 'AIMS' : 'CrewRosterReport');
 return { roster, diagnostics };
}

function buildServerFullText(pages) {
 return pages.map(({ items }) => {
  const rows = [];
  const sorted = [...items].sort((a,b) => b.y - a.y || a.x - b.x);
  for (const item of sorted) {
   let row = rows.find((r) => Math.abs(r.y - item.y) <= 3);
   if (!row) { row = { y: item.y, items: [] }; rows.push(row); }
   row.items.push(item);
  }
  return rows.sort((a,b)=>b.y-a.y).map((r)=>r.items.sort((a,b)=>a.x-b.x).map((i)=>i.str).join(' ').replace(/\s+/g,' ').trim()).join('\n');
 }).join('\n');
}

function parseServerHeader(fullText, filename='') {
 const compact = fullText.replace(/\s+/g, ' ');
 let crewName = 'Tripulante', crewId = '', base = 'BSB', rank = 'CCM', month = new Date().getMonth()+1, year = new Date().getFullYear();
 const a = compact.match(/Tripulante:\s*([^-]+?)\s*-\s*BP:\s*(\d+)\s*-\s*Base:\s*([A-Z]{3})\s*-\s*(\d{2})\/(\d{2})\/(\d{4})\s*at[ée]\s*(\d{2})\/(\d{2})\/(\d{4})/i);
 if (a) { crewName=a[1].trim(); crewId=a[2]; base=a[3]; month=Number(a[5]); year=Number(a[6]); }
 const r = compact.match(/Roster\s+Report\s+(\d{2})-([A-Za-z]{3})-(\d{4})\s+to\s+(\d{2})-([A-Za-z]{3})-(\d{4})\s+(.+?)\s*\|\s*(\d{6,})\s*\|\s*([A-Z0-9]+)\s*\|\s*([A-Z]{3})\s*\|\s*([A-Z]{2,5})/i);
 if (r) { month=monthNameToNum(r[2]); year=Number(r[3]); crewName=r[7].trim(); crewId=r[8]; base=r[10]; rank=r[11]; }
 return { crewName, crewId, base, rank, month, year, airline: /\bLA\s?\d{3,4}\b/i.test(fullText) ? 'LATAM' : 'Companhia aérea' };
}
function monthNameToNum(v) { return MONTHS[String(v||'').slice(0,3).toLowerCase()] || 0; }
function dateObj(day, month, year) { const d = new Date(year, month-1, day); return { date: `${String(day).padStart(2,'0')}/${String(month).padStart(2,'0')}/${year}`, dayOfWeek: WEEKDAYS_PT[d.getDay()] }; }
function makeDay(day, month, year, base) { const d = dateObj(day, month, year); return { date:d.date, dayOfWeek:d.dayOfWeek, dayNumber:day, month, year, type:'OTHER', pairingCode:'', dutyReport:null, dutyDebrief:null, legs:[], dutyHours:null, flyingHours:null, isNextDay:false, hotel:null, base, rawText:'' }; }



function buildRosterDateBlocksV3(fullText) {
 const lines = fullText.split(/\n+/).map((line) => cleanRosterLineV3(line)).filter(Boolean);
 const blocks = [];
 let current = null;
 const dateAtStart = /^\s*(\d{2})-([A-Za-z]{3})-(\d{4})\b\s*(.*)$/;
 for (const line of lines) {
  if (/^(Roster Report|Date\s+|Duty\s+|Report\s+|Updated By|Updated Date|A\/C|Type\s*$)/i.test(line)) continue;
  const match = line.match(dateAtStart);
  if (match) {
   if (current) blocks.push(current);
   current = { dayToken: match[1], monthToken: match[2], yearToken: match[3], text: match[4] || '' };
   continue;
  }
  if (current && isRosterContinuationV3(line)) {
   current.text += ' ' + line;
  }
 }
 if (current) blocks.push(current);
 return blocks;
}

function cleanRosterLineV3(line) {
 return String(line || '')
  .replace(/\u000c/g, ' ')
  .replace(/\uFFFE/g, ' ')
  .replace(/\b\d{2}-[A-Za-z]{3}-\d{4}\s+\d{2}\.\d{2}\b/g, ' ')
  .replace(/\b(SCHEDULER|msgsys|\d{6,})\b/gi, ' ')
  .replace(/\s+/g, ' ')
  .trim();
}

function isRosterContinuationV3(line) {
 return /\b(LA\s?\d{3,4}|DOPR|DOP|DOF?|DR|OFF|VC|HSBE?|ASB|CBF|EMER|MT|CRM|C\d{2,3}F|NSJ?|IJ|DM|[A-Z]{3}\s+\d{1,2}:\d{2}|\d{1,2}:\d{2}\(\+1\))\b/i.test(line);
}

function parseCrewRosterBlockV3(dayNumber, month, year, base, blockText) {
 const raw = cleanRosterLineV3(blockText);
 const upper = raw.toUpperCase();
 const events = [];
 const hasFlight = /\bLA\s?\d{3,4}\b/i.test(raw);
 const activityCodes = [...upper.matchAll(/\b(HSBE|HSB|ASB|CBF|EMER|C\d{2,3}F|MT|CRM|NSJ|NS|IJ|DM)\b/g)].map((m) => m[1]);
 const restMatch = upper.match(/\b(DOPR|DOP|DOF|DO|DR|OFF|VC)\b/);

 // Operational activities always win over rest markers in the same visual column/block.
 // This prevents ASB after an ellipsis/rest artifact from being converted to inativo/folga.
 for (const code of [...new Set(activityCodes)]) {
  const activity = makeDay(dayNumber, month, year, base);
  activity.rawText = raw;
  activity.pairingCode = code;
  activity.type = code === 'ASB' || code === 'HSB' || code === 'HSBE' ? code : (code === 'CRM' || /^C\d{2,3}F$/.test(code) || code === 'CBF' || code === 'EMER' ? 'CRM' : 'OTHER');
  const window = pickDutyWindowForCodeV3(raw, code);
  activity.dutyReport = window.start;
  activity.dutyDebrief = window.end;
  activity.dutyHours = window.start && window.end ? diffHours(window.start, window.end) : null;
  activity.flyingHours = 0;
  events.push(activity);
 }

 if (hasFlight) {
  const flightDay = makeDay(dayNumber, month, year, base);
  flightDay.rawText = raw;
  parseFlightsFromRosterTextV3(flightDay, raw);
  if (flightDay.legs.length) events.push(flightDay);
 }

 if (!events.length && restMatch) {
  const restDay = makeDay(dayNumber, month, year, base);
  restDay.rawText = raw;
  restDay.type = restMatch[1];
  restDay.pairingCode = restMatch[1];
  restDay.dutyHours = 0;
  restDay.flyingHours = 0;
  events.push(restDay);
 }

 if (!events.length && raw) {
  const other = makeDay(dayNumber, month, year, base);
  other.rawText = raw;
  events.push(other);
 }
 return events;
}

function pickDutyWindowForCodeV3(text, code) {
 const upper = String(text || '').toUpperCase();
 const codeIndex = upper.indexOf(String(code).toUpperCase());
 const fragment = codeIndex >= 0 ? text.slice(Math.max(0, codeIndex - 35), codeIndex + 180) : text;
 const stationTimes = [...fragment.matchAll(/\b[A-Z]{3}\s+(\d{1,2}:\d{2}(?:\(\+1\))?)\b/g)].map((m) => normalizeTimeToken(m[1]));
 if (stationTimes.length >= 2) return { start: stationTimes[0], end: stationTimes[stationTimes.length - 1] };
 const allTimes = uniqueTimesV3([...fragment.matchAll(/\b\d{1,2}:\d{2}(?:\(\+1\))?\b/g)].map((m) => normalizeTimeToken(m[0])));
 if (!allTimes.length) return { start: null, end: null };
 const start = allTimes[0];
 let end = allTimes[1] || allTimes[0];
 for (const time of allTimes.slice(1)) {
  const hours = diffHours(start, time);
  if (hours >= 0.25 && hours <= 14 && !looksLikeDurationV3(time)) end = time;
 }
 return { start, end };
}

function looksLikeDurationV3(time) {
 const normalized = normalizeTimeToken(time);
 // Common duration columns in CrewRosterReport/AIMS. They should never be used
 // as the end time for MT/ASB/HSB/HSBE.
 return ['00:59','01:25','01:40','01:45','01:50','02:00','02:05','02:10','02:15','02:25','02:30','02:40','02:45','02:50','03:10','03:15','03:25','03:35','03:38','03:59','04:00','04:35','04:42','05:20','06:00','06:25','07:30','07:35','07:40','07:55','08:10','08:20','08:55','10:30','10:45','10:55','11:15','11:25','11:30'].includes(normalized);
}

function uniqueTimesV3(times) {
 const out = [];
 for (const time of times) {
  if (/^\d{2}:\d{2}/.test(time) && !out.includes(time)) out.push(time);
 }
 return out;
}

function parseFlightsFromRosterTextV3(day, text) {
 const normalized = cleanRosterLineV3(text);
 const flightRe = /\b(LA\s?\d{3,4}|LA\d{3,4})\b([\s\S]*?)(?=\bLA\s?\d{3,4}\b|$)/gi;
 let match;
 while ((match = flightRe.exec(normalized)) !== null) {
  const flightNumber = match[1].replace(/\s+/g, '');
  const segment = match[2] || '';
  const leg = parseRosterFlightSegmentV3(flightNumber, segment);
  if (leg && !day.legs.some((item) => item.flightNumber === leg.flightNumber && item.origin === leg.origin && item.departureTime === leg.departureTime)) {
   day.legs.push(leg);
  }
 }
 if (day.legs.length) {
  day.type = 'VOO';
  day.pairingCode = day.legs[0].flightNumber;
  const firstIdx = normalized.indexOf(day.legs[0].flightNumber);
  const beforeFirst = firstIdx > 0 ? normalized.slice(0, firstIdx) : normalized;
  const report = [...beforeFirst.matchAll(/\b\d{1,2}:\d{2}\b/g)].map((m) => normalizeTimeToken(m[0])).at(-1);
  day.dutyReport = report || day.legs[0].departureTime;
  const afterLast = normalized.slice(Math.max(0, normalized.lastIndexOf(day.legs.at(-1).arrivalTime)));
  const timesAfter = uniqueTimesV3([...afterLast.matchAll(/\b\d{1,2}:\d{2}(?:\(\+1\))?\b/g)].map((m) => normalizeTimeToken(m[0])));
  day.dutyDebrief = timesAfter.length >= 2 ? timesAfter[1] : (timesAfter[0] || day.legs.at(-1).arrivalTime);
  day.isNextDay = day.legs.some((leg) => leg.isNextDay) || diffHours(day.dutyReport, day.dutyDebrief) > 18;
  day.flyingHours = day.legs.reduce((sum, leg) => sum + (leg.duration || diffHours(leg.departureTime, leg.arrivalTime)), 0);
  day.dutyHours = diffHours(day.dutyReport, day.dutyDebrief);
 }
}

function parseRosterFlightSegmentV3(flightNumber, segment) {
 const tokens = String(segment || '').split(/\s+/).filter(Boolean);
 let workType = 'OP';
 let aircraftType = undefined;
 for (const token of tokens) {
  const upper = token.toUpperCase();
  if (['OP','PS','DH'].includes(upper)) workType = upper;
  if (/^(32S|31R|39R|328|319|320|321|32N)$/.test(upper)) aircraftType = upper;
 }
 const pattern = findBestFlightPatternV3(tokens);
 if (!pattern) return null;
 const { origin, destination, departureTime, arrivalTime } = pattern;
 const isNextDay = /\(\+1\)/.test(arrivalTime) || toMin(arrivalTime) < toMin(departureTime);
 return { flightNumber, origin, destination, departureTime, arrivalTime: normalizeTimeToken(arrivalTime), workType, aircraftType, isNextDay, duration: diffHours(departureTime, arrivalTime) };
}

function findBestFlightPatternV3(tokens) {
 const upper = tokens.map((token) => String(token || '').toUpperCase());
 const candidates = [];
 for (let i = 0; i < upper.length; i++) {
  if (!AIRPORTS.has(upper[i])) continue;
  for (let j = i + 1; j < Math.min(upper.length, i + 5); j++) {
   if (!isTimeToken(tokens[j])) continue;
   for (let k = j + 1; k < Math.min(upper.length, j + 5); k++) {
    if (!AIRPORTS.has(upper[k])) continue;
    for (let l = k + 1; l < Math.min(upper.length, k + 5); l++) {
     if (!isTimeToken(tokens[l])) continue;
     const departureTime = normalizeTimeToken(tokens[j]);
     const arrivalTime = normalizeTimeToken(tokens[l]);
     const duration = diffHours(departureTime, arrivalTime);
     if (duration < 0.25 || duration > 7.5) continue;
     // Prefer realistic airport-time-airport-time patterns and avoid same-airport
     // duplicates caused by Duty Report/Debrief columns in AIMS/CrewRoster PDFs.
     const samePenalty = upper[i] === upper[k] ? 20 : 0;
     const score = 100 - samePenalty - Math.abs(duration - 1.8) - (j - i - 1) * 2 - (k - j - 1) * 2 - (l - k - 1) * 2;
     candidates.push({ origin: upper[i], destination: upper[k], departureTime, arrivalTime, score });
    }
   }
  }
 }
 candidates.sort((a, b) => b.score - a.score);
 return candidates[0] || null;
}

function parseAimsTokensIntoEventsV3(tokens, dayNum, month, year, base) {
 const normalized = tokens.map((token) => String(token || '').trim()).filter(Boolean);
 const upperTokens = normalized.map((token) => token.toUpperCase());
 const joined = upperTokens.join(' ');
 const events = [];
 const activityCodes = [];
 for (let i = 0; i < upperTokens.length; i++) {
  const token = upperTokens[i];
  if (['HSB','HSBE','ASB','CBF','EMER','MT','CRM','NS','NSJ','IJ','DM'].includes(token) || /^C\d{2,3}F$/.test(token)) activityCodes.push({ code: token, index: i });
 }
 for (const { code, index } of activityCodes) {
  const day = makeDay(dayNum, month, year, base);
  day.rawText = normalized.join(' ');
  day.pairingCode = code;
  day.type = code === 'HSB' || code === 'HSBE' || code === 'ASB' ? code : (code === 'CRM' || /^C\d{2,3}F$/.test(code) || code === 'CBF' || code === 'EMER' ? 'CRM' : 'OTHER');
  const window = pickDutyWindowFromAimsTokensV3(normalized, index);
  day.dutyReport = window.start;
  day.dutyDebrief = window.end;
  day.dutyHours = window.start && window.end ? diffHours(window.start, window.end) : null;
  day.flyingHours = 0;
  events.push(day);
 }
 const flightDay = makeDay(dayNum, month, year, base);
 flightDay.rawText = normalized.join(' ');
 for (let i = 0; i < upperTokens.length; i++) {
  if (upperTokens[i] === 'LA' && /^\d{3,4}$/.test(upperTokens[i+1] || '')) {
   const next = upperTokens.findIndex((token, idx) => idx > i + 1 && token === 'LA');
   const seq = normalized.slice(i + 2, next > 0 ? next : normalized.length);
   const leg = parseAimsFlightSeq('LA' + upperTokens[i+1], seq);
   if (leg) flightDay.legs.push(leg);
  }
 }
 if (flightDay.legs.length) {
  flightDay.type = 'VOO';
  flightDay.pairingCode = flightDay.legs[0].flightNumber;
  const firstLaIndex = upperTokens.findIndex((token) => token === 'LA');
  const beforeFirst = normalized.slice(0, firstLaIndex).filter(isTimeToken).map(normalizeTimeToken);
  const firstSeqStart = upperTokens.findIndex((token) => token === 'LA') + 2;
  const firstOrigin = flightDay.legs[0].origin;
  const firstOriginIdx = upperTokens.findIndex((token, idx) => idx >= firstSeqStart && token === firstOrigin);
  const firstTimesBeforeOrigin = normalized.slice(firstSeqStart, firstOriginIdx).filter(isTimeToken).map(normalizeTimeToken);
  flightDay.dutyReport = beforeFirst[0] || (firstTimesBeforeOrigin.length >= 2 ? firstTimesBeforeOrigin[0] : null) || flightDay.legs[0].departureTime;
  flightDay.dutyDebrief = inferAimsDebriefV3(normalized, flightDay.legs.at(-1)) || flightDay.legs.at(-1).arrivalTime;
  flightDay.isNextDay = flightDay.legs.some((leg) => leg.isNextDay) || diffHours(flightDay.dutyReport, flightDay.dutyDebrief) > 18;
  flightDay.flyingHours = flightDay.legs.reduce((sum, leg) => sum + (leg.duration || diffHours(leg.departureTime, leg.arrivalTime)), 0);
  flightDay.dutyHours = diffHours(flightDay.dutyReport, flightDay.dutyDebrief);
  events.push(flightDay);
 }
 if (!events.length) {
  const rest = joined.match(/\b(DOPR|DOP|DOF|DO|DR|OFF|VC)\b/);
  if (rest) {
   const day = makeDay(dayNum, month, year, base);
   day.rawText = normalized.join(' ');
   day.type = rest[1]; day.pairingCode = rest[1]; day.dutyHours = 0; day.flyingHours = 0;
   events.push(day);
  }
 }
 return events.length ? events : [makeDay(dayNum, month, year, base)];
}

function pickDutyWindowFromAimsTokensV3(tokens, index) {
 const slice = tokens.slice(index, Math.min(tokens.length, index + 18));
 const stationTimes = [];
 for (let i = 0; i < slice.length - 1; i++) {
  if (AIRPORTS.has(String(slice[i]).toUpperCase()) && isTimeToken(slice[i + 1])) stationTimes.push(normalizeTimeToken(slice[i + 1]));
 }
 if (stationTimes.length >= 2) return { start: stationTimes[0], end: stationTimes[stationTimes.length - 1] };
 const times = uniqueTimesV3(slice.filter(isTimeToken).map(normalizeTimeToken));
 if (!times.length) return { start: null, end: null };
 const start = times[0];
 let end = times[1] || times[0];
 for (const time of times.slice(1)) {
  const hours = diffHours(start, time);
  if (hours >= 0.25 && hours <= 14 && !looksLikeDurationV3(time)) end = time;
 }
 return { start, end };
}

function inferAimsDebriefV3(tokens, lastLeg) {
 if (!lastLeg) return null;
 const upper = tokens.map((token) => String(token).toUpperCase());
 const destIdx = upper.findLastIndex ? upper.findLastIndex((token) => token === lastLeg.destination) : (() => { for (let i=upper.length-1;i>=0;i--) if (upper[i]===lastLeg.destination) return i; return -1; })();
 if (destIdx < 0) return null;
 const after = tokens.slice(destIdx + 1).filter(isTimeToken).map(normalizeTimeToken);
 if (after.length >= 2) return after[1];
 return after[0] || null;
}


function buildServerRosterColumnGroups(pages) {
 const groups = [];
 for (const page of pages || []) {
  const relevant = (page.items || [])
   .map((item) => ({ ...item, str: cleanRosterLineV3(item.str) }))
   .filter((item) => item.str && item.x > 70 && item.y > 10 && !/^(LEGEND)$/i.test(item.str));
  const columns = [];
  for (const item of relevant.sort((a, b) => a.x - b.x || b.y - a.y)) {
   let column = columns.find((col) => Math.abs(col.x - item.x) <= 18);
   if (!column) {
    column = { x: item.x, page: item.page || page.pageNo, items: [] };
    columns.push(column);
   }
   column.items.push(item);
   column.x = column.items.reduce((sum, it) => sum + it.x, 0) / column.items.length;
  }
  for (const column of columns.sort((a, b) => a.x - b.x)) {
   const items = column.items.sort((a, b) => b.y - a.y || a.x - b.x);
   const text = cleanRosterLineV3(items.map((item) => item.str).join(' '));
   if (!text || /Roster Report|BRUNO|DH\s*:|FH\s*:|01-Jul-2026 to/i.test(text)) continue;
   if (!/\b(LA\s?\d{3,4}|OP|PS|DH|HSBE?|ASB|RCFI|DOPR|DOP|DOF?|DR|OFF|VC|BSB|GRU|CGH|FOR|CNF|MAB|CPV|VCP|JPA|GYN|FLN|PMW|MAO|BEL|NAT|SSA|CWB|CXJ)\b/i.test(text)) continue;
   groups.push({ page: column.page, x: column.x, items, text });
  }
 }
 return groups;
}

function serverDateFromToken(token, fallbackMonth, fallbackYear) {
 const match = String(token || '').match(/(\d{2})-([A-Za-z]{3})-(\d{4})/);
 if (!match) return null;
 return { day: Number(match[1]), month: monthNameToNum(match[2]) || fallbackMonth, year: Number(match[3]) || fallbackYear };
}

function addDaysToServerDate(marker, days) {
 const d = new Date(marker.year, marker.month - 1, marker.day, 12, 0, 0, 0);
 d.setDate(d.getDate() + Number(days || 0));
 return { day: d.getDate(), month: d.getMonth() + 1, year: d.getFullYear() };
}

function serverDayOffsetFromToken(value) {
 const m = String(value || '').match(/\(\+(\d+)\)/);
 return m ? Number(m[1]) || 0 : 0;
}

function parseServerColumnarGroupToDay(group, currentMarker, base) {
 const items = group.items || [];
 const text = group.text || '';
 if (!currentMarker) return null;
 const flight = items.find((item) => /^LA\s?\d{3,4}$/i.test(item.str))?.str?.replace(/\s+/g, '').toUpperCase();
 const activity = text.match(/\b(HSBE|HSB|ASB|RCFI|CRMBSB|CRMB|CRM|C\d{2,3}F|MT|CBF|EMER)\b/i)?.[1]?.toUpperCase();
 const rest = text.match(/\b(DOPR|DOP|DOF|DO|DR|OFF|VC)\b/i)?.[1]?.toUpperCase();
 if (flight) return parseServerColumnarFlightDay(group, currentMarker, base, flight);
 if (activity) return parseServerColumnarActivityDay(group, currentMarker, base, activity);
 if (rest) {
  const marker = currentMarker;
  const day = makeDay(marker.day, marker.month, marker.year, base);
  day.rawText = text;
  day.type = rest === 'OFF' || rest === 'VC' || rest.startsWith('DOP') ? 'DO' : rest;
  day.pairingCode = rest;
  day.dutyHours = 0;
  day.flyingHours = 0;
  return day;
 }
 return null;
}

function parseServerColumnarFlightDay(group, currentMarker, base, flightNumber) {
 const items = group.items || [];
 const text = group.text || '';
 const flightIndex = items.findIndex((item) => /^LA\s?\d{3,4}$/i.test(item.str));
 const depIndex = items.findIndex((item) => /^[A-Z]{3}\s+\d{1,2}:\d{2}(?:\(\+\d+\))?$/i.test(item.str));
 if (depIndex < 0) return null;
 const depMatch = items[depIndex].str.match(/^([A-Z]{3})\s+(\d{1,2}:\d{2}(?:\(\+\d+\))?)$/i);
 if (!depMatch) return null;
 const origin = depMatch[1].toUpperCase();
 const rawDeparture = depMatch[2];
 let destination = '';
 let rawArrival = '';
 for (let i = depIndex - 1; i >= 0; i--) {
  const value = String(items[i].str || '').toUpperCase();
  if (!destination && /^[A-Z]{3}$/.test(value) && AIRPORTS.has(value)) {
   destination = value;
   continue;
  }
  if (destination && !rawArrival && /^\d{1,2}:\d{2}(?:\(\+\d+\))?$/.test(value)) {
   rawArrival = value;
   break;
  }
 }
 if (!destination || !rawArrival) return null;
 const offset = Math.max(serverDayOffsetFromToken(rawDeparture), serverDayOffsetFromToken(rawArrival), serverDayOffsetFromToken(items.slice(Math.max(0, flightIndex)).map((item) => item.str).join(' ')));
 const marker = addDaysToServerDate(currentMarker, offset);
 const day = makeDay(marker.day, marker.month, marker.year, base);
 const departureTime = normalizeTimeToken(rawDeparture);
 const arrivalTime = normalizeTimeToken(rawArrival);
 const workType = items.find((item) => /^(OP|PS|DH)$/i.test(item.str))?.str?.toUpperCase() || 'OP';
 const aircraftType = items.find((item) => /^(32S|31R|39R|328|319|320|321|32N)$/i.test(item.str))?.str?.toUpperCase();
 const reportRaw = flightIndex >= 0 ? items.slice(flightIndex + 1).find((item) => /^\d{1,2}:\d{2}(?:\(\+\d+\))?$/.test(item.str))?.str : null;
 const debriefRaw = items.slice(0, Math.max(0, depIndex - 1)).find((item) => /^\d{1,2}:\d{2}(?:\(\+\d+\))?$/.test(item.str) && !looksLikeDurationV3(normalizeTimeToken(item.str)) && normalizeTimeToken(item.str) !== arrivalTime)?.str || null;
 const isNextDay = serverDayOffsetFromToken(rawArrival) > serverDayOffsetFromToken(rawDeparture) || toMin(arrivalTime) < toMin(departureTime);
 day.rawText = text;
 day.type = 'VOO';
 day.pairingCode = flightNumber;
 day.dutyReport = reportRaw ? normalizeTimeToken(reportRaw) : departureTime;
 day.dutyDebrief = debriefRaw ? normalizeTimeToken(debriefRaw) : arrivalTime;
 day.isNextDay = isNextDay || offset > 0;
 day.legs = [{ flightNumber, origin, destination, departureTime, arrivalTime, workType, aircraftType, isNextDay, duration: diffHours(departureTime, arrivalTime) }];
 day.flyingHours = day.legs[0].duration;
 day.dutyHours = day.dutyReport && day.dutyDebrief ? diffHours(day.dutyReport, day.dutyDebrief) : null;
 return day;
}

function parseServerColumnarActivityDay(group, currentMarker, base, rawCode) {
 const text = group.text || '';
 const code = rawCode === 'CRMBSB' || rawCode === 'CRMB' || /^C\d{2,3}F$/.test(rawCode) ? 'CRM' : rawCode;
 const marker = currentMarker;
 const day = makeDay(marker.day, marker.month, marker.year, base);
 day.rawText = text;
 day.pairingCode = code;
 day.type = code === 'ASB' || code === 'HSB' || code === 'HSBE' ? code : (code === 'RCFI' || code === 'CRM' || code === 'MT' || code === 'CBF' || code === 'EMER' ? 'CRM' : 'OTHER');
 const times = [...text.matchAll(/\b\d{1,2}:\d{2}(?:\(\+\d+\))?\b/g)]
  .map((m) => normalizeTimeToken(m[0]))
  .filter((time) => time !== '00:00' && !looksLikeDurationV3(time));
 const unique = uniqueTimesV3(times).sort((a, b) => toMin(a) - toMin(b));
 day.dutyReport = unique[0] || null;
 day.dutyDebrief = unique.length > 1 ? unique[unique.length - 1] : null;
 day.flyingHours = 0;
 day.dutyHours = day.dutyReport && day.dutyDebrief ? diffHours(day.dutyReport, day.dutyDebrief) : null;
 return day;
}

function parseServerRosterReportColumnGroups(pages, h) {
 const groups = buildServerRosterColumnGroups(pages);
 const days = [];
 let currentMarker = null;
 for (const group of groups) {
  const dateToken = group.text.match(/\d{2}-[A-Za-z]{3}-\d{4}/)?.[0] || null;
  if (dateToken) currentMarker = serverDateFromToken(dateToken, h.month, h.year);
  if (!currentMarker) continue;
  if (group.text.includes('<==') && !dateToken) continue;
  const day = parseServerColumnarGroupToDay(group, currentMarker, h.base);
  if (!day) continue;
  if (day.month < h.month - 6) day.year = h.year + 1;
  days.push(day);
 }
 return mergeServerRosterColumnDays(days, h.month, h.year);
}

function mergeServerRosterColumnDays(days, referenceMonth, referenceYear) {
 const buckets = new Map();
 for (const day of days) {
  if (!day || day.month !== referenceMonth || day.year !== referenceYear) continue;
  const dateKey = day.date;
  const minuteKey = day.dutyReport || (day.legs?.[0]?.departureTime) || '99:99';
  const isFlight = day.type === 'VOO' && day.legs?.length;
  const key = isFlight ? `${dateKey}|VOO|${minuteKey}` : `${dateKey}|${day.pairingCode || day.type}|${minuteKey}`;
  const existing = buckets.get(key);
  if (existing && isFlight) {
   for (const leg of day.legs) if (!existing.legs.some((old) => old.flightNumber === leg.flightNumber && old.origin === leg.origin && old.departureTime === leg.departureTime)) existing.legs.push(leg);
   existing.legs.sort((a, b) => toMin(a.departureTime) - toMin(b.departureTime));
   existing.rawText = `${existing.rawText || ''} ${day.rawText || ''}`.trim();
   existing.pairingCode = existing.legs[0]?.flightNumber || existing.pairingCode;
   existing.flyingHours = existing.legs.reduce((sum, leg) => sum + (leg.duration || 0), 0);
   buckets.set(key, existing);
  } else if (!existing) {
   buckets.set(key, day);
  }
 }
 return Array.from(buckets.values());
}

function scoreServerRosterDays(days) {
 return (days || []).reduce((score, day) => score + (day.legs?.length || 0) * 3 + (day.pairingCode ? 1 : 0) + (day.type !== 'OTHER' ? 1 : 0), 0);
}

function parseServerRosterReport(fullText, pages, filename='') {
 const h = parseServerHeader(fullText, filename);
 const blocks = buildRosterDateBlocksV3(fullText);
 const textDays = [];
 for (const block of blocks) {
  const month = monthNameToNum(block.monthToken) || h.month;
  const year = Number(block.yearToken) || h.year;
  const parsed = parseCrewRosterBlockV3(Number(block.dayToken), month, year, h.base, block.text);
  textDays.push(...parsed);
 }
 const columnDays = parseServerRosterReportColumnGroups(pages, h);
 const columnFlightCount = columnDays.reduce((sum, day) => sum + (day.legs?.length || 0), 0);
 const textFlightCount = textDays.reduce((sum, day) => sum + (day.legs?.length || 0), 0);
 const days = columnDays.length >= 8 && columnFlightCount >= Math.max(4, textFlightCount * 0.55) ? columnDays : (scoreServerRosterDays(columnDays) >= scoreServerRosterDays(textDays) ? columnDays : textDays);
 return { ...h, days, rawText: fullText, totals: extractTotals(fullText) };
}

function parseServerLineIntoDay(day, line) {
 const parsed = parseCrewRosterBlockV3(day.dayNumber, day.month, day.year, day.base, line);
 const best = parsed.find((item) => item.legs?.length) || parsed.find((item) => item.pairingCode) || parsed[0];
 if (!best) return;
 Object.assign(day, best, { rawText: `${day.rawText || ''}\n${line}`.trim() });
}

function parseServerAims(fullText, pages) {
 const h = parseServerHeader(fullText);
 const days = [];
 for (const page of pages) {
  const markers = page.items.map(item=>({ item, marker: parseAimsDateMarkerServer(item.str, h.month, h.year) })).filter(x=>x.marker);
  if (!markers.length) continue;
  markers.sort((a,b)=>a.item.x-b.item.x);
  for (let i=0;i<markers.length;i++) {
   const { item, marker } = markers[i];
   if (marker.month !== h.month || marker.year !== h.year) continue;
   const left = i ? (markers[i-1].item.x + item.x)/2 : item.x - 999;
   const right = i < markers.length-1 ? (item.x + markers[i+1].item.x)/2 : item.x + 999;
   const tokens = page.items.filter(it=>it !== item && it.x >= left && it.x < right && it.y < item.y - 1)
    .sort((a,b)=> b.y-a.y || a.x-b.x)
    .flatMap(it=>String(it.str||'').split(/\s+/))
    .map(t=>t.trim()).filter(Boolean)
    .filter(t=>!ignoreAimsTokenServer(t));
   days.push(...parseAimsTokensIntoEventsV3(tokens, marker.day, marker.month, marker.year, h.base));
  }
 }
 return { ...h, days, rawText: fullText, totals: extractTotals(fullText) };
}
function parseAimsDateMarkerServer(value, baseMonth, baseYear) {
 const m = String(value||'').trim().match(/^(\d{2})(Jan|Feb|Mar|Apr|May|Ma|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Fev|Abr|Mai|Ago|Set|Out|Dez)$/i);
 if (!m) return null;
 const day=Number(m[1]); let month=monthNameToNum(m[2]); if (m[2].toLowerCase()==='ma') month = baseMonth===6 ? 5 : 3;
 let year=baseYear; if (month < baseMonth-6) year++; if (month > baseMonth+6) year--;
 return { day, month, year };
}
function ignoreAimsTokenServer(t) { const u=String(t).toUpperCase(); return !t || ['MON','TUE','WED','THU','FRI','SAT','SUN','SEG','TER','QUA','QUI','SEX','SAB','SÁB','DOM','Y'].includes(u) || /^(TIMEZONE|CONFIRA|TRIPULAÇÕES|TRIPULACOES)/i.test(u) || /^\d{2}(JAN|FEB|MAR|APR|MAY|MA|JUN|JUL|AUG|SEP|OCT|NOV|DEC)$/i.test(t); }
function parseAimsTokensIntoDay(tokens, dayNum, month, year, base) {
 return parseAimsTokensIntoEventsV3(tokens, dayNum, month, year, base)[0] || makeDay(dayNum, month, year, base);
}
function parseAimsFlightSeq(flightNumber, seq) {
 const tokens = seq.map((t) => String(t || '').trim()).filter(Boolean);
 const upper = tokens.map((t) => t.toUpperCase());
 const pattern = findBestFlightPatternV3(tokens);
 if (!pattern) return null;
 const aircraft = upper.find((token) => /^\([A-Z0-9]{3}\)$/.test(token))?.replace(/[()]/g, '') || upper.find((token) => /^(32S|31R|39R|328|319|320|321|32N)$/.test(token)) || undefined;
 const { origin, destination, departureTime, arrivalTime } = pattern;
 return { flightNumber, origin, destination, departureTime, arrivalTime, workType:'OP', aircraftType: aircraft, isNextDay:/\(\+1\)/.test(arrivalTime) || toMin(arrivalTime) < toMin(departureTime), duration: diffHours(departureTime, arrivalTime) };
}
function firstTimeBeforeFirstFlight(tokens) { const idx=tokens.findIndex(t=>String(t).toUpperCase()==='LA'); const arr=(idx>=0?tokens.slice(0, idx):tokens).filter(isTimeToken); return arr[0] ? normalizeTimeToken(arr[0]) : null; }
function isTimeToken(t) { return /^\d{1,2}:\d{2}(?:\(\+1\))?$/.test(String(t)); }
function normalizeTimeToken(t) { return String(t).replace(/^([0-9]):/,'0$1:'); }
function diffHours(a,b) { const ma=toMin(a), mb=toMin(b); return ((mb<=ma?mb+1440:mb)-ma)/60; }
function toMin(t) { const [h,m]=normalizeTimeToken(t).replace('(＋1)','').replace('( +1 )','').replace('( +1)','').replace('(+1)','').split(':').map(Number); return h*60+m; }
function findAircraftAfter(text, idx) { const part=text.slice(idx, idx+160); return part.match(/\b(32S|31R|39R|328|319|320|321|32N)\b/i)?.[1]; }
function extractTotals(fullText) { const m=fullText.match(/FH\s*:\s*(\d{1,3}:\d{2})\s*\|\s*DH\s*:\s*(\d{1,3}:\d{2})/i); return m ? { flightHours: timeToHours(m[1]), dutyHours: timeToHours(m[2]) } : {}; }
function timeToHours(s) { const [h,m]=s.split(':').map(Number); return h + m/60; }
function finalizeServerDays(days, month, year, base) {
 const good = days.filter(d => d && d.month === month && d.year === year && (d.type !== 'OTHER' || d.legs?.length || d.pairingCode));
 const byKey = new Map();
 for (const d of good) {
  const legKey = (d.legs || []).map((leg) => `${leg.flightNumber}-${leg.origin}-${leg.destination}-${leg.departureTime}`).join(',');
  const key = `${d.date}|${d.pairingCode || d.type}|${d.dutyReport || ''}|${legKey}`;
  if (!byKey.has(key)) byKey.set(key, d);
 }
 return [...byKey.values()].sort((a,b)=> new Date(a.year,a.month-1,a.dayNumber).getTime()-new Date(b.year,b.month-1,b.dayNumber).getTime() || (toMin(a.dutyReport || '23:59') - toMin(b.dutyReport || '23:59')) || String(a.pairingCode).localeCompare(String(b.pairingCode)));
}
function buildParseDiagnostics(roster, sourceFormat) {
 const days = roster.days || [];
 const uniqueDays = new Set(days.map(d=>d.date)).size;
 const flights = days.reduce((s,d)=>s+(d.legs?.length||0),0);
 const reserve = days.filter((d)=>d.type==='ASB').length;
 const meetings = days.filter((d)=>(d.pairingCode||'')==='MT').length;
 const activities = days.filter(d=>d.pairingCode || d.legs?.length).length;
 const confidence = uniqueDays >= 25 && flights >= 20 && reserve >= 2 && meetings >= 1 ? 'alta' : uniqueDays >= 20 && flights >= 15 ? 'média' : 'baixa';
 return { sourceFormat, uniqueDays, totalEvents: days.length, flights, reserve, meetings, activities, confidence, message: confidence === 'baixa' ? 'Poucos eventos foram lidos; use o modo de reprocessamento ou confira o PDF.' : 'Escala lida com auditoria de servidor: ASB/MT/voos validados.' };
}
// --- end CrewCheck server-side PDF parser ---

async function readJsonBody(req, maxBytes = 16 * 1024 * 1024) {
 let total = 0;
 const chunks = [];
 for await (const chunk of req) {
  total += chunk.length;
  if (total > maxBytes) {
   const err = new Error('Payload muito grande.');
   err.statusCode = 413;
   throw err;
  }
  chunks.push(chunk);
 }
 const raw = Buffer.concat(chunks).toString('utf8');
 if (!raw.trim()) return {};
 return JSON.parse(raw);
}

function checksumPayload(payload) {
 const roster = payload?.roster;
 const periodKey = roster?.year && roster?.month
  ? `period:${roster?.crewId || roster?.crewName || 'crew'}:${roster.year}-${String(roster.month).padStart(2, '0')}`
  : null;
 return crypto.createHash('sha256').update(periodKey || JSON.stringify(payload)).digest('hex');
}

function tokenHash(token) {
 return crypto.createHash('sha256').update(token).digest('hex');
}

function normalizeEmail(email) {
 return String(email || '').trim().toLowerCase();
}

function getRequestIp(req) {
 const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
 return forwarded || req.socket.remoteAddress || '';
}

function maskEmailForLog(email) {
 const normalized = normalizeEmail(email);
 const [name, domain] = normalized.split('@');
 if (!name || !domain) return normalized;
 return `${name.slice(0, 2)}***@${domain}`;
}

function rateLimitKey(parts) {
 return parts.map((part) => String(part || '').toLowerCase().trim()).filter(Boolean).join('|');
}

function assertAuthRateLimit(parts) {
 const key = rateLimitKey(parts);
 if (!key) return;
 const now = Date.now();
 const bucket = authRateBuckets.get(key) || { count: 0, resetAt: now + AUTH_REGISTER_RATE_LIMIT_WINDOW_MS };
 if (bucket.resetAt < now) {
  bucket.count = 0;
  bucket.resetAt = now + AUTH_REGISTER_RATE_LIMIT_WINDOW_MS;
 }
 bucket.count += 1;
 authRateBuckets.set(key, bucket);
 if (bucket.count > AUTH_REGISTER_RATE_LIMIT_MAX) {
  const err = new Error('Muitas tentativas em pouco tempo. Aguarde alguns minutos antes de tentar novamente.');
  err.statusCode = 429;
  err.code = 'RATE_LIMITED';
  throw err;
 }
 if (authRateBuckets.size > 2500) {
  for (const [bucketKey, value] of authRateBuckets) {
   if (value.resetAt < now) authRateBuckets.delete(bucketKey);
  }
 }
}

function generateEmailVerificationCode() {
 return String(crypto.randomInt(100000, 1000000));
}

function emailVerificationHash(email, code) {
 return tokenHash(`${normalizeEmail(email)}:${String(code || '').trim()}`);
}

function makeEmailVerificationPayload(email) {
 const code = generateEmailVerificationCode();
 const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MINUTES * 60 * 1000).toISOString();
 return { code, tokenHash: emailVerificationHash(email, code), expiresAt };
}

async function verifyTurnstileToken({ token, remoteIp }) {
 if (!CREWCHECK_CAPTCHA_REQUIRED && !TURNSTILE_SECRET_KEY) {
  return { ok: true, skipped: true, provider: 'turnstile-disabled' };
 }
 if (!TURNSTILE_SECRET_KEY) {
  const err = new Error('Captcha não configurado no servidor. Configure TURNSTILE_SECRET_KEY no Render.');
  err.statusCode = 503;
  err.code = 'CAPTCHA_NOT_CONFIGURED';
  throw err;
 }
 if (!token) {
  const err = new Error('Confirme o captcha para continuar o cadastro.');
  err.statusCode = 400;
  err.code = 'CAPTCHA_REQUIRED';
  throw err;
 }
 const body = new URLSearchParams();
 body.set('secret', TURNSTILE_SECRET_KEY);
 body.set('response', String(token));
 if (remoteIp) body.set('remoteip', String(remoteIp));
 const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body,
  signal: AbortSignal.timeout(9000),
 });
 const payload = await response.json().catch(() => ({}));
 if (!response.ok || !payload?.success) {
  const err = new Error('Captcha inválido ou expirado. Atualize a página e tente novamente.');
  err.statusCode = 400;
  err.code = 'CAPTCHA_INVALID';
  err.detail = Array.isArray(payload?.['error-codes']) ? payload['error-codes'].join(', ') : null;
  throw err;
 }
 return { ok: true, provider: 'cloudflare-turnstile', challengeTs: payload.challenge_ts || null, hostname: payload.hostname || null };
}

function buildEmailVerificationEmail({ email, code }) {
 const safeEmail = escapeHtml(email);
 const link = `${PUBLIC_APP_URL}/login?email=${encodeURIComponent(email)}&verify=${encodeURIComponent(code)}`;
 const safeLink = escapeHtml(link);
 const subject = 'Confirme seu e-mail no CrewCheck';
 const text = [
  'CrewCheck — confirmação de e-mail.',
  '',
  `Conta: ${email}`,
  '',
  `Confirme pelo botão/link: ${link}`,
  '',
  `O link expira em ${EMAIL_VERIFICATION_TTL_MINUTES} minutos.`,
  'Se você não criou essa conta, ignore este e-mail.',
 ].join('\n');
 const html = `<div style="margin:0;padding:0;background:#f4f8fb;font-family:Inter,Arial,sans-serif;color:#092846">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f8fb;padding:28px 0"><tr><td align="center">
   <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border-radius:28px;overflow:hidden;border:1px solid #dbeafe;box-shadow:0 24px 70px rgba(8,47,73,.16)">
    <tr><td style="padding:28px 30px;background:linear-gradient(135deg,#082f49,#0f766e);color:white">
     <div style="font-size:12px;letter-spacing:.22em;text-transform:uppercase;color:#bae6fd;font-weight:800">CrewCheck Premium</div>
     <h1 style="margin:10px 0 0;font-size:28px;line-height:1.15">Confirme seu e-mail</h1>
    </td></tr>
    <tr><td style="padding:30px;color:#092846;font-size:15px;line-height:1.7">
     <p style="margin:0 0 18px">Recebemos um cadastro para <strong>${safeEmail}</strong>.</p>
     <p style="margin:0 0 22px;color:#475569">Para liberar o acesso, toque no botão abaixo. Não exibimos código manual neste e-mail.</p>
     <a href="${safeLink}" style="display:inline-block;border-radius:18px;background:#0891b2;color:white;text-decoration:none;font-weight:900;padding:15px 22px">Confirmar e-mail</a>
     <p style="margin:22px 0 0;color:#64748b;font-size:13px">Se você não criou essa conta, ignore esta mensagem.</p>
    </td></tr>
   </table>
  </td></tr></table>
 </div>`;
 return { subject, text, html };
}

async function sendVerificationEmailForUser(db, user, reason = 'manual') {
 const verification = makeEmailVerificationPayload(user.email);
 await db.query(
  `update crewcheck_users
    set email_verification_token_hash = $1,
      email_verification_expires_at = $2,
      email_verification_sent_at = now(),
      updated_at = now()
   where id = $3`,
  [verification.tokenHash, verification.expiresAt, user.id],
 );
 const emailPayload = buildEmailVerificationEmail({ email: user.email, code: verification.code });
 const emailResult = await sendEmail({ to: user.email, ...emailPayload });
 await db.query('insert into crewcheck_audit_logs (id, user_id, action, metadata) values ($1, $2, $3, $4::jsonb)', [
  newId(),
  user.id,
  'auth.email_verification.sent',
  JSON.stringify({ email: maskEmailForLog(user.email), reason, sent: Boolean(emailResult.ok), provider: emailResult.provider || null, configured: emailResult.configured !== false }),
 ]).catch(() => null);
 return emailResult;
}

function configuredLifetimeEmails() {
 return new Set(
  CREWCHECK_LIFETIME_EMAILS_RAW
   .split(/[\s,;]+/)
   .map((email) => normalizeEmail(email))
   .filter(Boolean),
 );
}

function isLifetimePremiumUser(userOrEmail) {
 const email = typeof userOrEmail === 'string' ? normalizeEmail(userOrEmail) : normalizeEmail(userOrEmail?.email);
 return Boolean(email && configuredLifetimeEmails().has(email));
}

function hasLifetimePremiumAccess(userOrEmail) {
 if (isLifetimePremiumUser(userOrEmail)) return true;
 if (!userOrEmail || typeof userOrEmail === 'string') return false;
 const plan = String(userOrEmail.subscription_plan || '').toLowerCase();
 const status = String(userOrEmail.subscription_status || '').toLowerCase();
 const cycle = String(userOrEmail.billing_cycle || '').toUpperCase();
 return plan === 'premium_lifetime' || status === 'lifetime' || cycle === 'LIFETIME';
}

async function ensureLifetimeBillingState(db, user) {
 if (!db || !hasLifetimePremiumAccess(user)) return user;
 try {
  await db.query(
   `update crewcheck_users
     set subscription_plan = 'premium_lifetime',
       subscription_status = 'lifetime',
       billing_cycle = 'LIFETIME',
       premium_expires_at = null,
       billing_cancel_at_period_end = false,
       updated_at = now()
    where id = $1`,
   [user.id],
  );
  return await reloadUserById(db, user.id) || { ...user, subscription_plan: 'premium_lifetime', subscription_status: 'lifetime', billing_cycle: 'LIFETIME', premium_expires_at: null };
 } catch {
  return { ...user, subscription_plan: 'premium_lifetime', subscription_status: 'lifetime', billing_cycle: 'LIFETIME', premium_expires_at: null };
 }
}

function isLatamCorporateEmail(email) {
 return normalizeEmail(email).endsWith('@latam.com');
}

const C32F_ADMIN_EMAIL = normalizeEmail(process.env.CREWCHECK_ADMIN_EMAIL || process.env.VITE_CREWCHECK_ADMIN_EMAIL || '');

function isC32FAdminEmail(email) {
 return normalizeEmail(email) === C32F_ADMIN_EMAIL;
}

function newId() {
 return crypto.randomUUID();
}

function dbErrorInfo(error) {
 return {
  message: error?.message || String(error),
  code: error?.code || null,
  detail: error?.detail || null,
  hint: error?.hint || null,
  constraint: error?.constraint || null,
 };
}


function publicBillingErrorPayload(error, fallbackMessage = 'Não foi possível concluir o pagamento agora.') {
 const rawCode = String(error?.code || '').trim().toUpperCase();
 const rawMessage = String(error?.message || '').trim();
 const joined = `${rawCode} ${rawMessage}`.toLowerCase();
 const safeCodes = new Set(['CPF_REQUIRED', 'CPF_INVALID', 'SAFETY_NOTICE_REQUIRED', 'TRIAL_IDENTITY_ALREADY_USED', 'REGULARIZATION_NOT_REQUIRED']);
 let message = fallbackMessage;
 let code = safeCodes.has(rawCode) ? rawCode : 'BILLING_UNAVAILABLE';
 if (rawCode === 'CPF_REQUIRED') message = 'Informe o CPF para continuar.';
 else if (rawCode === 'CPF_INVALID') message = 'CPF inválido. Confira os números e tente novamente.';
 else if (rawCode === 'SAFETY_NOTICE_REQUIRED') message = 'Confirme a ciência de uso antes de continuar.';
 else if (rawCode === 'TRIAL_IDENTITY_ALREADY_USED') message = 'Este teste grátis já foi usado para esta escala. Escolha um plano Premium para continuar.';
 else if (rawCode === 'REGULARIZATION_NOT_REQUIRED') message = 'Esta conta não precisa de regularização. Escolha um plano ou atualize o status.';
 else if (joined.includes('invalid_customer') || joined.includes('cliente inválido') || joined.includes('cliente invalido')) message = 'Não foi possível validar o cadastro de cobrança. Tente novamente.';
 else if (error?.statusCode === 400 && rawMessage && rawMessage.length < 120 && !/[{}]/.test(rawMessage) && !joined.includes('asaas')) message = rawMessage;
 return { ok: false, code, message };
}

function hashPassword(password) {
 const salt = crypto.randomBytes(16).toString('hex');
 const hash = crypto.pbkdf2Sync(String(password), salt, 210_000, 32, 'sha256').toString('hex');
 return `pbkdf2_sha256$210000$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
 const [scheme, iterStr, salt, expected] = String(stored || '').split('$');
 if (scheme !== 'pbkdf2_sha256' || !salt || !expected) return false;
 const iterations = Number(iterStr || 210_000);
 const hash = crypto.pbkdf2Sync(String(password), salt, iterations, 32, 'sha256').toString('hex');
 return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(expected, 'hex'));
}

function generateTemporaryPassword() {
 const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
 let out = '';
 const bytes = crypto.randomBytes(10);
 for (const byte of bytes) out += alphabet[byte % alphabet.length];
 return out.slice(0, 10);
}

function canUseTemporaryPassword(password, user) {
 if (!user?.temp_password_hash || !user?.temp_password_expires_at) return false;
 if (new Date(user.temp_password_expires_at).getTime() < Date.now()) return false;
 return verifyPassword(password, user.temp_password_hash);
}

const BILLING_PLAN_DEFINITIONS = Object.freeze({
 free: {
  id: 'free',
  name: 'Básico gratuito',
  cycle: 'FREE',
  value: 0,
  currency: BILLING_CURRENCY,
  description: 'Escala, cockpit, cálculo local, rotina, relatórios básicos e importação manual.',
  notice: BILLING_PRICE_POLICY_NOTICE,
 },
 premium_monthly: {
  id: 'premium_monthly',
  name: 'Premium mensal',
  cycle: 'MONTHLY',
  value: BILLING_MONTHLY_VALUE,
  currency: BILLING_CURRENCY,
  description: 'Recursos com suporte, radar atualizado quando disponível, agenda, histórico e melhorias contínuas.',
  reference: `Preço promocional de lançamento por ${BILLING_MONTHLY_PROMO_MONTHS} meses para assinaturas realizadas até ${BILLING_LAUNCH_PROMO_END_DATE}. Depois, valor regular mensal.`,
  originalValue: BILLING_MONTHLY_ORIGINAL_VALUE,
  promoValue: BILLING_MONTHLY_PROMO_VALUE,
  promoActive: BILLING_PROMO_ACTIVE,
  promoEndsAt: BILLING_LAUNCH_PROMO_END_DATE,
  promoDurationMonths: BILLING_MONTHLY_PROMO_MONTHS,
  regularValueAfterPromo: BILLING_MONTHLY_ORIGINAL_VALUE,
  diariaReferenceValue: CREWCHECK_DIARIA_REFERENCE_VALUE,
  annualDiscountPercent: 0,
  notice: BILLING_PRICE_POLICY_NOTICE,
 },
 premium_annual: {
  id: 'premium_annual',
  name: 'Premium anual',
  cycle: 'YEARLY',
  value: BILLING_YEARLY_VALUE,
  currency: BILLING_CURRENCY,
  description: 'Premium por 12 meses, com suporte prioritário, melhorias priorizadas e desconto de lançamento no primeiro ano.',
  reference: `Preço promocional de lançamento no primeiro ano para assinaturas realizadas até ${BILLING_LAUNCH_PROMO_END_DATE}. Renovação pelo valor anual regular, salvo nova promoção vigente.`,
  originalValue: BILLING_YEARLY_ORIGINAL_VALUE,
  promoValue: BILLING_YEARLY_PROMO_VALUE,
  promoActive: BILLING_PROMO_ACTIVE,
  promoEndsAt: BILLING_LAUNCH_PROMO_END_DATE,
  firstYearPromoOnly: true,
  regularValueAfterPromo: BILLING_YEARLY_ORIGINAL_VALUE,
  annualGift: 'Suporte prioritário e prioridade para recomendações de melhorias.',
  diariaReferenceValue: CREWCHECK_DIARIA_REFERENCE_VALUE,
  annualDiscountPercent: CREWCHECK_PREMIUM_ANNUAL_DISCOUNT_PERCENT,
  notice: BILLING_PRICE_POLICY_NOTICE,
 },
 premium_lifetime: {
  id: 'premium_lifetime',
  name: 'Premium Unlimited',
  cycle: 'LIFETIME',
  value: 0,
  currency: BILLING_CURRENCY,
  description: 'Plano especial Premium Unlimited para contas autorizadas pelo administrador, sem cobrança.',
  notice: 'Plano especial Premium Unlimited para contas autorizadas pelo administrador.',
 },
});

function addDaysIso(days) {
 return new Date(Date.now() + Number(days || 0) * 24 * 60 * 60 * 1000).toISOString();
}

function formatAsaasDueDate(date = new Date()) {
 return new Date(date).toISOString().slice(0, 10);
}

function normalizeBrazilianTaxId(value) {
 return String(value || '').replace(/\D+/g, '');
}

function maskBrazilianTaxId(value) {
 const digits = normalizeBrazilianTaxId(value);
 if (digits.length === 11) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
 if (digits.length === 14) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
 return digits;
}

function isValidCpf(value) {
 const cpf = normalizeBrazilianTaxId(value);
 if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
 let sum = 0;
 for (let i = 0; i < 9; i += 1) sum += Number(cpf[i]) * (10 - i);
 let check = (sum * 10) % 11;
 if (check === 10) check = 0;
 if (check !== Number(cpf[9])) return false;
 sum = 0;
 for (let i = 0; i < 10; i += 1) sum += Number(cpf[i]) * (11 - i);
 check = (sum * 10) % 11;
 if (check === 10) check = 0;
 return check === Number(cpf[10]);
}

function validateBillingCpf(value) {
 const digits = normalizeBrazilianTaxId(value);
 if (!digits) {
  const err = new Error('Informe o CPF para continuar.');
  err.statusCode = 400;
  err.code = 'CPF_REQUIRED';
  throw err;
 }
 if (!isValidCpf(digits)) {
  const err = new Error('CPF inválido. Confira os 11 dígitos antes de assinar.');
  err.statusCode = 400;
  err.code = 'CPF_INVALID';
  throw err;
 }
 return digits;
}

function daysUntilDate(value, fallback = BILLING_TRIAL_DAYS) {
 const time = new Date(value || 0).getTime();
 if (!Number.isFinite(time) || time <= 0) return Number(fallback || 0);
 return Math.max(0, Math.ceil((time - Date.now()) / (24 * 60 * 60 * 1000)));
}

function billingNeedsAsaasRegularization(user) {
 if (!user || hasLifetimePremiumAccess(user) || isBillingAdmin(user)) return false;
 if (user.asaas_subscription_id) return false;
 const status = String(user.subscription_status || 'free').toLowerCase();
 const plan = String(user.subscription_plan || 'free').toLowerCase();
 const trialActive = status === 'trialing' && hasFutureDate(user.trial_expires_at);
 const paidLike = ['active', 'paid', 'received', 'pending'].includes(status) && plan.includes('premium');
 return Boolean(trialActive || paidLike);
}

function billingRegularizationInfo(user) {
 const needs = billingNeedsAsaasRegularization(user);
 const remainingDays = daysUntilDate(user?.trial_expires_at || user?.premium_expires_at, BILLING_TRIAL_DAYS);
 const firstDueDate = formatAsaasDueDate(new Date(Date.now() + Math.max(0, remainingDays) * 24 * 60 * 60 * 1000));
 return {
  needsAsaasRegularization: needs,
  regularizationTrialDaysRemaining: needs ? remainingDays : 0,
  regularizationFirstDueDate: needs ? firstDueDate : null,
  regularizationMessage: needs
   ? (remainingDays > 0
    ? `Atualização necessária: confirme seus dados para manter o Premium. A primeira cobrança ficará programada para ${firstDueDate}.`
    : 'Atualização necessária: confirme seus dados para manter o Premium ativo.')
   : null,
 };
}

async function createTrialAsaasSubscriptionForExistingUser(db, user, { cpfCnpj, safetyNoticeVersion = 'premium-safety-notice-v1-short-2026-06-20', source = 'user_regularization' } = {}) {
 const plan = getBillingPlan('premium_monthly');
 const taxId = validateBillingCpf(cpfCnpj || user.billing_tax_id);
 const customerId = await ensureAsaasCustomer(db, { ...user, billing_tax_id: taxId }, taxId);
 const remainingDays = daysUntilDate(user.trial_expires_at || user.premium_expires_at, BILLING_TRIAL_DAYS);
 const firstDueDate = formatAsaasDueDate(new Date(Date.now() + Math.max(0, remainingDays) * 24 * 60 * 60 * 1000));
 const nextPremiumExpiresAt = remainingDays > 0 ? addDaysIso(remainingDays) : new Date().toISOString();
 const nextStatus = remainingDays > 0 ? 'trialing' : 'pending';
 const description = remainingDays > 0
  ? `CrewCheck Premium mensal - regularização do teste; primeira cobrança em ${firstDueDate}`
  : `CrewCheck Premium mensal - regularização de assinatura`;
 const subscription = await asaasRequest('/subscriptions', {
  method: 'POST',
  body: {
   customer: customerId,
   billingType: 'UNDEFINED',
   nextDueDate: firstDueDate,
   value: Number(plan.value.toFixed(2)),
   cycle: plan.cycle,
   description,
   externalReference: `crewcheck:${user.id}:trial_regularization:${Date.now()}`,
  },
 });
 if (!subscription?.id) throw new Error('Asaas não retornou o ID da assinatura recorrente.');
 await db.query('update crewcheck_users set billing_tax_id = $1, subscription_plan = $2, subscription_status = $3, billing_cycle = $4, asaas_customer_id = $5, asaas_subscription_id = $6, billing_cancel_at_period_end = false, trial_started_at = coalesce(trial_started_at, now()), trial_expires_at = coalesce(trial_expires_at, $7), premium_expires_at = $7, updated_at = now() where id = $8', [taxId, 'premium_monthly', nextStatus, plan.cycle, customerId, subscription.id, nextPremiumExpiresAt, user.id]);
 const payments = await asaasRequest(`/subscriptions/${encodeURIComponent(subscription.id)}/payments`, { query: { limit: 5 } }).catch(() => null);
 const checkoutUrl = firstCheckoutUrlFromPayments(payments) || subscription.invoiceUrl || subscription.paymentLink || null;
 await db.query('insert into crewcheck_audit_logs (id, user_id, action, metadata) values ($1, $2, $3, $4::jsonb)', [newId(), user.id, 'billing.trial.regularized_asaas_subscription', JSON.stringify({ source, remainingDays, firstDueDate, subscriptionId: subscription.id, customerId, checkoutUrl: Boolean(checkoutUrl), cpfMasked: maskBrazilianTaxId(taxId), safetyNotice: { acknowledged: true, version: safetyNoticeVersion, acknowledgedAt: new Date().toISOString() } })]).catch(() => null);
 const refreshed = await reloadUserById(db, user.id);
 return { user: refreshed, subscription, payments, checkoutUrl, firstDueDate, remainingDays };
}

function getBillingPlan(planId) {
 return BILLING_PLAN_DEFINITIONS[planId] || BILLING_PLAN_DEFINITIONS.free;
}

function hasFutureDate(value) {
 if (!value) return false;
 const time = new Date(value).getTime();
 return Number.isFinite(time) && time > Date.now();
}

function isBillingAdmin(user) {
 const role = String(user?.role || '').toLowerCase();
 const email = normalizeEmail(user?.email);
 return role.includes('admin') || email === C32F_ADMIN_EMAIL || email === 'bruno@crewcheck.local';
}

function billingStatusFromUser(user) {
 if (!user) return { ok: true, plan: BILLING_PLAN_DEFINITIONS.free, status: 'free', premiumAccess: false, trialEligible: false, asaasConfigured: Boolean(ASAAS_API_KEY), plans: Object.values(BILLING_PLAN_DEFINITIONS) };
 if (hasLifetimePremiumAccess(user)) {
  return {
   ok: true,
   plan: BILLING_PLAN_DEFINITIONS.premium_lifetime,
   status: 'lifetime',
   premiumAccess: true,
   trialEligible: false,
   trialDays: BILLING_TRIAL_DAYS,
   trialExpiresAt: null,
   premiumExpiresAt: null,
   billingCycle: 'LIFETIME',
   cancelAtPeriodEnd: false,
   asaasConfigured: Boolean(ASAAS_API_KEY),
   hasBillingSubscription: false,
   plans: Object.values(BILLING_PLAN_DEFINITIONS),
   pricePolicy: billingPricePolicy(),
   misusePolicy: rosterMisusePolicy(),
   message: 'Premium Unlimited liberado para esta conta. Nenhuma cobrança será criada.',
  };
 }
 if (isBillingAdmin(user)) {
  return {
   ok: true,
   plan: { id: 'admin', name: 'Administrador Premium', cycle: 'ADMIN', value: 0, currency: BILLING_CURRENCY, description: 'Acesso completo administrativo.' },
   status: 'active',
   premiumAccess: true,
   trialEligible: false,
   trialExpiresAt: user.trial_expires_at || null,
   premiumExpiresAt: null,
   cancelAtPeriodEnd: false,
   asaasConfigured: Boolean(ASAAS_API_KEY),
   plans: Object.values(BILLING_PLAN_DEFINITIONS),
   pricePolicy: billingPricePolicy(),
   misusePolicy: rosterMisusePolicy(),
  };
 }
 const status = String(user.subscription_status || 'free').toLowerCase();
 const planId = String(user.subscription_plan || 'free');
 const plan = getBillingPlan(planId);
 const trialActive = status === 'trialing' && hasFutureDate(user.trial_expires_at);
 const paidActive = ['active', 'paid', 'received'].includes(status) && (!user.premium_expires_at || hasFutureDate(user.premium_expires_at));
 const graceActive = status === 'canceled' && hasFutureDate(user.premium_expires_at);
 const premiumAccess = trialActive || paidActive || graceActive;
 const regularization = billingRegularizationInfo(user);
 return {
  ok: true,
  plan,
  status: premiumAccess ? status : (status === 'trialing' ? 'trial_expired' : status),
  premiumAccess,
  trialEligible: !user.trial_started_at && !trialActive && !paidActive,
  trialDays: BILLING_TRIAL_DAYS,
  trialExpiresAt: user.trial_expires_at || null,
  premiumExpiresAt: user.premium_expires_at || null,
  billingCycle: user.billing_cycle || plan.cycle || null,
  cancelAtPeriodEnd: Boolean(user.billing_cancel_at_period_end),
  asaasConfigured: Boolean(ASAAS_API_KEY),
  hasBillingSubscription: Boolean(user.asaas_subscription_id),
  plans: Object.values(BILLING_PLAN_DEFINITIONS),
  pricePolicy: billingPricePolicy(),
  misusePolicy: rosterMisusePolicy(),
  ...regularization,
 };
}

function billingPricePolicy() {
 return {
  diariaReferenceValue: CREWCHECK_DIARIA_REFERENCE_VALUE,
  monthlyValue: BILLING_MONTHLY_VALUE,
  annualValue: BILLING_YEARLY_VALUE,
  monthlyOriginalValue: BILLING_MONTHLY_ORIGINAL_VALUE,
  annualOriginalValue: BILLING_YEARLY_ORIGINAL_VALUE,
  monthlyPromoValue: BILLING_MONTHLY_PROMO_VALUE,
  annualPromoValue: BILLING_YEARLY_PROMO_VALUE,
  promoActive: BILLING_PROMO_ACTIVE,
  promoEndsAt: BILLING_LAUNCH_PROMO_END_DATE,
  monthlyPromoMonths: BILLING_MONTHLY_PROMO_MONTHS,
  monthlyRegularValueAfterPromo: BILLING_MONTHLY_ORIGINAL_VALUE,
  annualRegularValueAfterPromo: BILLING_YEARLY_ORIGINAL_VALUE,
  annualDiscountPercent: CREWCHECK_PREMIUM_ANNUAL_DISCOUNT_PERCENT,
  notice: BILLING_PRICE_POLICY_NOTICE,
  monthlyRule: `Assinando até ${BILLING_LAUNCH_PROMO_END_DATE}, o Premium mensal fica no valor promocional por ${BILLING_MONTHLY_PROMO_MONTHS} meses. Depois, passa ao valor regular de R$ ${BILLING_MONTHLY_ORIGINAL_VALUE.toFixed(2).replace('.', ',')}/mês.`,
  annualRule: `No anual, a promoção vale para o primeiro ano. A renovação segue o valor regular de R$ ${BILLING_YEARLY_ORIGINAL_VALUE.toFixed(2).replace('.', ',')}/ano, salvo nova promoção vigente.`,
 };
}

function rosterMisusePolicy() {
 return 'O Premium é individual. O envio recorrente de escala de outra pessoa, fraude de teste ou uso indevido pode gerar bloqueio preventivo da conta, com revisão administrativa.';
}


function normalizeRosterIdentityText(value) {
 return String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toUpperCase()
  .replace(/\b(DE|DA|DO|DOS|DAS|E|A|O)\b/g, ' ')
  .replace(/[^A-Z0-9]+/g, ' ')
  .trim();
}

function rosterNameLooksDifferent(expected, received) {
 const a = normalizeRosterIdentityText(expected);
 const b = normalizeRosterIdentityText(received);
 if (!a || !b || a.length < 5 || b.length < 5) return false;
 if (a === b || a.includes(b) || b.includes(a)) return false;
 const aTokens = new Set(a.split(/\s+/).filter((x) => x.length > 2));
 const bTokens = new Set(b.split(/\s+/).filter((x) => x.length > 2));
 let overlap = 0;
 for (const token of aTokens) if (bTokens.has(token)) overlap += 1;
 const min = Math.min(aTokens.size, bTokens.size);
 return min >= 2 && overlap === 0;
}

function isPremiumPlanUser(user) {
 return Boolean(billingStatusFromUser(user)?.premiumAccess) && !isBillingAdmin(user);
}

async function assertRosterBelongsToPremiumUser(db, user, roster, sourceFileName) {
 if (!user?.id || !isPremiumPlanUser(user)) return;
 const rosterCrewId = String(roster?.crewId || '').trim();
 const rosterCrewName = String(roster?.crewName || '').trim();
 let expectedCrewId = String(user.crew_id || '').trim();
 let expectedName = String(user.name || '').trim();
 if (!expectedCrewId && !expectedName) {
  const prior = await db.query(
   `select crew_id, crew_name from crewcheck_rosters where user_id = $1 and (crew_id is not null or crew_name is not null) order by created_at asc limit 1`,
   [user.id],
  ).catch(() => ({ rows: [] }));
  expectedCrewId = String(prior.rows?.[0]?.crew_id || '').trim();
  expectedName = String(prior.rows?.[0]?.crew_name || '').trim();
 }
 const crewIdMismatch = expectedCrewId && rosterCrewId && normalizeRosterIdentityText(expectedCrewId) !== normalizeRosterIdentityText(rosterCrewId);
 const nameMismatch = !crewIdMismatch && rosterNameLooksDifferent(expectedName, rosterCrewName);
 if (!crewIdMismatch && !nameMismatch) return;
 const metadata = { sourceFileName, expectedCrewId: expectedCrewId || null, receivedCrewId: rosterCrewId || null, expectedName: expectedName || null, receivedName: rosterCrewName || null, reason: crewIdMismatch ? 'crew_id_mismatch' : 'crew_name_mismatch' };
 await db.query('insert into crewcheck_audit_logs (id, user_id, action, metadata) values ($1, $2, $3, $4::jsonb)', [newId(), user.id, 'roster.identity_mismatch.blocked', JSON.stringify(metadata)]).catch(() => null);
 const err = new Error('Esta escala parece pertencer a outro tripulante. Por segurança, contas Premium só podem salvar a própria escala. Se for falso positivo, revise seu perfil ou fale com o suporte. O uso indevido pode gerar bloqueio preventivo da conta.');
 err.statusCode = 409;
 err.code = 'ROSTER_IDENTITY_MISMATCH';
 err.metadata = metadata;
 throw err;
}

function requireAsaasConfigured(res) {
 if (!ASAAS_API_KEY) {
  sendJson(res, 503, { ok: false, code: 'PAYMENT_UNAVAILABLE', message: 'Pagamento online temporariamente indisponível. Tente novamente mais tarde.' });
  return false;
 }
 return true;
}

async function asaasRequest(pathname, { method = 'GET', body, query } = {}) {
 if (!ASAAS_API_KEY) throw new Error('ASAAS_API_KEY não configurada.');
 const url = new URL(`${ASAAS_API_BASE}${pathname.startsWith('/') ? pathname : `/${pathname}`}`);
 if (query && typeof query === 'object') {
  Object.entries(query).forEach(([key, value]) => {
   if (value !== undefined && value !== null && String(value) !== '') url.searchParams.set(key, String(value));
  });
 }
 const response = await fetch(url, {
  method,
  headers: {
   accept: 'application/json',
   'content-type': 'application/json',
   access_token: ASAAS_API_KEY,
   'user-agent': `CrewCheck/${process.env.npm_package_version || '10.8'} billing`,
  },
  body: body ? JSON.stringify(body) : undefined,
  signal: AbortSignal.timeout(Number(process.env.ASAAS_TIMEOUT_MS || 15000)),
 });
 const payload = await response.json().catch(() => ({}));
 if (!response.ok) {
  const message = payload?.errors?.map?.((item) => item?.description || item?.message).filter(Boolean).join(' | ') || payload?.message || `Asaas HTTP ${response.status}`;
  const error = new Error(message);
  error.statusCode = response.status;
  error.payload = payload;
  throw error;
 }
 return payload;
}

async function reloadUserById(db, userId) {
 if (!userId) return null;
 const result = await db.query('select * from crewcheck_users where id = $1 limit 1', [userId]);
 return result.rows[0] || null;
}


async function checkAsaasBillingHealth() {
 const result = {
  ok: false,
  configured: Boolean(ASAAS_API_KEY),
  environment: ASAAS_ENV || (ASAAS_API_BASE.includes('sandbox') ? 'homologation' : 'production'),
  baseUrl: ASAAS_API_BASE.replace(/access_token=[^&]+/gi, 'access_token=***'),
  webhookTokenConfigured: Boolean(ASAAS_WEBHOOK_TOKENS.length),
  webhookTokenCount: ASAAS_WEBHOOK_TOKENS.length,
  webhookStrict: ASAAS_WEBHOOK_STRICT,
  webhookSandboxRelaxed: ASAAS_WEBHOOK_ALLOW_SANDBOX_WITHOUT_TOKEN && /sandbox/i.test(ASAAS_API_BASE),
  checkedAt: new Date().toISOString(),
 };
 if (!ASAAS_API_KEY) return { ...result, message: 'ASAAS_API_KEY ausente no Render.' };
 try {
  const payload = await asaasRequest('/customers', { query: { limit: 1 } });
  const count = Array.isArray(payload?.data) ? payload.data.length : 0;
  return { ...result, ok: true, apiReachable: true, customersReadable: true, sampleCount: count, message: 'Asaas respondeu com sucesso. Cobrança automática pronta para criar checkout quando CPF for informado.' };
 } catch (error) {
  return { ...result, ok: false, apiReachable: false, message: error?.message || 'Falha ao consultar Asaas.', code: error?.code || null, statusCode: error?.statusCode || null };
 }
}

async function persistAsaasCustomerId(db, userId, customerId, taxId = null) {
 if (!userId || !customerId) return;
 await db.query('update crewcheck_users set asaas_customer_id = $1, billing_tax_id = coalesce($2, billing_tax_id), updated_at = now() where id = $3', [customerId, taxId || null, userId]);
}

async function clearStoredAsaasCustomerId(db, userId, reason = 'asaas_customer_invalid') {
 if (!userId) return;
 await db.query('update crewcheck_users set asaas_customer_id = null, updated_at = now() where id = $1', [userId]).catch(() => null);
 await db.query('insert into crewcheck_audit_logs (id, user_id, action, metadata) values ($1, $2, $3, $4::jsonb)', [newId(), userId, 'billing.asaas_customer_id_cleared', JSON.stringify({ reason, at: new Date().toISOString() })]).catch(() => null);
}

function isAsaasInvalidCustomerError(error) {
 const raw = [
  error?.code,
  error?.message,
  error?.payload?.errors?.map?.((item) => `${item?.code || ''} ${item?.description || item?.message || ''}`).join(' '),
  error?.payload?.message,
 ].filter(Boolean).join(' ').toLowerCase();
 return error?.statusCode === 404
  || raw.includes('invalid_customer')
  || raw.includes('cliente inválido')
  || raw.includes('customer inválido')
  || raw.includes('cliente invalido')
  || raw.includes('customer invalido')
  || raw.includes('não encontrado')
  || raw.includes('nao encontrado')
  || raw.includes('not found');
}

async function findAsaasCustomerByReferenceOrCpf(externalReference, taxId) {
 const byReference = await asaasRequest('/customers', { query: { externalReference, limit: 1 } }).catch(() => null);
 const referenced = Array.isArray(byReference?.data) ? byReference.data.find((item) => String(item?.externalReference || '') === externalReference) || byReference.data[0] : null;
 if (referenced?.id) return referenced;
 const byCpf = taxId ? await asaasRequest('/customers', { query: { cpfCnpj: taxId, limit: 1 } }).catch(() => null) : null;
 return Array.isArray(byCpf?.data) ? byCpf.data[0] || null : null;
}

async function ensureAsaasCustomer(db, user, taxIdInput = null) {
 const taxId = normalizeBrazilianTaxId(taxIdInput || user.billing_tax_id);
 if (!taxId) {
  const err = new Error('CPF necessário para iniciar teste, assinatura ou cobrança.');
  err.statusCode = 400;
  err.code = 'CPF_REQUIRED';
  throw err;
 }
 const externalReference = `crewcheck:${user.id}`;
 const customerPayload = {
  name: user.name || user.email || 'Tripulante CrewCheck',
  email: user.email || undefined,
  cpfCnpj: taxId,
  externalReference,
  groupName: 'CrewCheck',
  notificationDisabled: false,
  observations: `Cliente CrewCheck para cobrança recorrente. CPF/CNPJ cadastrado: ${maskBrazilianTaxId(taxId)}.`,
 };

 if (user.asaas_customer_id) {
  try {
   const updated = await asaasRequest(`/customers/${encodeURIComponent(user.asaas_customer_id)}`, { method: 'PUT', body: customerPayload });
   const validCustomerId = updated?.id || user.asaas_customer_id;
   await persistAsaasCustomerId(db, user.id, validCustomerId, taxId);
   return validCustomerId;
  } catch (error) {
   if (!isAsaasInvalidCustomerError(error)) throw error;
   await clearStoredAsaasCustomerId(db, user.id, 'stored_customer_not_found_in_current_asaas_environment');
  }
 }

 const existing = await findAsaasCustomerByReferenceOrCpf(externalReference, taxId);
 if (existing?.id) {
  const updated = await asaasRequest(`/customers/${encodeURIComponent(existing.id)}`, { method: 'PUT', body: customerPayload }).catch(() => existing);
  const validCustomerId = updated?.id || existing.id;
  await persistAsaasCustomerId(db, user.id, validCustomerId, taxId);
  return validCustomerId;
 }
 const created = await asaasRequest('/customers', {
  method: 'POST',
  body: customerPayload,
 });
 if (!created?.id) throw new Error('Asaas não retornou o ID do cliente.');
 await persistAsaasCustomerId(db, user.id, created.id, taxId);
 return created.id;
}

async function latestRosterIdentityForTrial(db, user) {
 if (!db || !user?.id) return null;
 const result = await db.query(
  `select id, crew_name, crew_id, base, rank, period_year, period_month, checksum
    from crewcheck_rosters
   where user_id = $1
   order by period_year desc nulls last, period_month desc nulls last, updated_at desc, created_at desc
   limit 1`,
  [user.id],
 ).catch(async () => db.query(
  `select id, crew_name, crew_id, base, rank, period_year, period_month, checksum
    from crewcheck_rosters
   where user_id = $1
   order by updated_at desc, created_at desc
   limit 1`,
  [user.id],
 ));
 const row = result.rows[0];
 if (!row) return null;
 const crewId = String(row.crew_id || user.crew_id || '').replace(/\D+/g, '');
 const nameBase = `${row.crew_name || user.name || ''}|${row.base || user.base || ''}|${row.rank || user.rank || ''}`.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9|]+/g, ' ').replace(/\s+/g, ' ').trim();
 const rawIdentity = crewId ? `crew:${crewId}` : nameBase.length > 8 ? `crewtext:${nameBase}` : row.checksum ? `scale:${row.checksum}` : '';
 if (!rawIdentity) return null;
 return {
  hash: crypto.createHash('sha256').update(rawIdentity).digest('hex'),
  source: crewId ? 'crew_id' : nameBase.length > 8 ? 'crew_name_base_rank' : 'scale_checksum',
  label: crewId ? `BP/Crew ID ${crewId}` : nameBase || 'checksum da escala',
  rosterId: row.id,
  crewId: row.crew_id || null,
  crewName: row.crew_name || null,
  base: row.base || null,
  rank: row.rank || null,
  periodYear: row.period_year || null,
  periodMonth: row.period_month || null,
 };
}

async function reserveTrialIdentityOrThrow(db, user, identity) {
 if (!identity?.hash) {
  const err = new Error('Importe uma escala de teste antes de ativar o Premium grátis. O CrewCheck usa identificação da escala para evitar múltiplos testes da mesma tripulação em contas diferentes.');
  err.statusCode = 409;
  err.code = 'TRIAL_ROSTER_REQUIRED';
  throw err;
 }
 const existing = await db.query('select identity_hash, user_id, metadata from crewcheck_trial_locks where identity_hash = $1 limit 1', [identity.hash]).catch(() => ({ rows: [] }));
 const locked = existing.rows[0];
 if (locked && String(locked.user_id || '') !== String(user.id || '')) {
  const err = new Error('Este identificador de escala já usou teste Premium em outra conta. Para evitar burla, use o plano básico gratuito ou assine o Premium.');
  err.statusCode = 409;
  err.code = 'TRIAL_IDENTITY_ALREADY_USED';
  throw err;
 }
 if (!locked) {
  try {
   await db.query(
    'insert into crewcheck_trial_locks (identity_hash, user_id, source, metadata) values ($1,$2,$3,$4::jsonb)',
    [identity.hash, user.id, identity.source, JSON.stringify(identity)],
   );
  } catch (error) {
   const retry = await db.query('select identity_hash, user_id from crewcheck_trial_locks where identity_hash = $1 limit 1', [identity.hash]).catch(() => ({ rows: [] }));
   if (retry.rows[0] && String(retry.rows[0].user_id || '') !== String(user.id || '')) {
    const err = new Error('Este identificador de escala já usou teste Premium em outra conta.');
    err.statusCode = 409;
    err.code = 'TRIAL_IDENTITY_ALREADY_USED';
    throw err;
   }
  }
 }
 await db.query('update crewcheck_users set trial_identity_hash = $1, updated_at = now() where id = $2', [identity.hash, user.id]).catch(() => null);
}

function firstCheckoutUrlFromPayments(payload) {
 const first = Array.isArray(payload?.data) ? payload.data[0] : null;
 return first?.invoiceUrl || first?.bankSlipUrl || first?.nossoNumero || first?.transactionReceiptUrl || null;
}

function firstPaymentFromAsaasPayload(payload) {
 return Array.isArray(payload?.data) ? payload.data[0] || null : null;
}

function safePublicPaymentUrl(payment, fallback = null) {
 return payment?.invoiceUrl || payment?.bankSlipUrl || payment?.transactionReceiptUrl || fallback || null;
}

const ASAAS_SUBSCRIPTION_BILLING_TYPES = new Set(['UNDEFINED', 'PIX', 'BOLETO', 'CREDIT_CARD']);

function normalizeAsaasSubscriptionBillingType(value, fallback = 'UNDEFINED') {
 const normalized = String(value || fallback || 'UNDEFINED').trim().toUpperCase();
 return ASAAS_SUBSCRIPTION_BILLING_TYPES.has(normalized) ? normalized : fallback;
}

function billingCheckoutPublicMessage(billingType, payment, firstDueDate = null) {
 const type = normalizeAsaasSubscriptionBillingType(billingType);
 const dueText = firstDueDate || payment?.dueDate ? ` Primeira cobrança programada para ${firstDueDate || payment?.dueDate}.` : '';
 if (type === 'PIX' && (payment?.pixQrCode?.payload || payment?.pixQrCode?.encodedImage)) return `Cobrança Pix criada.${dueText} Use o QR Code ou Pix copia e cola dentro do CrewCheck.`;
 if (type === 'PIX') return `Cobrança Pix criada.${dueText} Use o checkout seguro caso o QR Code não apareça.`;
 if (type === 'CREDIT_CARD') return `Assinatura recorrente criada.${dueText} Conclua com cartão no ambiente seguro do Asaas.`;
 if (type === 'BOLETO') return `Assinatura por boleto criada.${dueText} Abra o checkout seguro para concluir.`;
 return `Checkout Asaas criado.${dueText} Escolha Pix, boleto, cartão de crédito ou débito conforme as opções habilitadas na sua conta Asaas.`;
}

async function buildPublicBillingPaymentInfo(payment, checkoutUrl = null) {
 if (!payment) return checkoutUrl ? { invoiceUrl: checkoutUrl } : null;
 let pixQrCode = null;
 if (payment.id) {
  pixQrCode = await asaasRequest(`/payments/${encodeURIComponent(payment.id)}/pixQrCode`).catch(() => null);
 }
 return {
  value: Number.isFinite(Number(payment.value)) ? Number(payment.value) : null,
  dueDate: payment.dueDate || null,
  status: payment.status || null,
  invoiceUrl: safePublicPaymentUrl(payment, checkoutUrl),
  bankSlipUrl: payment.bankSlipUrl || null,
  pixQrCode: pixQrCode ? {
   encodedImage: pixQrCode.encodedImage || null,
   payload: pixQrCode.payload || null,
   expirationDate: pixQrCode.expirationDate || null,
  } : null,
 };
}

function readAsaasWebhookAccessToken(req, url = null) {
 const headers = req?.headers || {};
 const rawAuthorization = String(headers.authorization || '').trim();
 const values = [
  headers['asaas-access-token'],
  headers['x-asaas-access-token'],
  headers['asaas_access_token'],
  headers['asaas-token'],
  headers['x-asaas-token'],
  headers['access_token'],
  rawAuthorization.replace(/^Bearer\s+/i, ''),
 ];
 if (String(process.env.ASAAS_WEBHOOK_ACCEPT_QUERY_TOKEN || '').toLowerCase() === 'true' && url?.searchParams) {
  values.push(url.searchParams.get('asaasAccessToken'), url.searchParams.get('asaas_access_token'), url.searchParams.get('token'));
 }
 return String(values.find((value) => String(value || '').trim()) || '').trim();
}

function safeTokenEquals(left, right) {
 const a = Buffer.from(String(left || ''));
 const b = Buffer.from(String(right || ''));
 if (!a.length || !b.length || a.length !== b.length) return false;
 try { return crypto.timingSafeEqual(a, b); } catch { return false; }
}

function validateAsaasWebhookAccess(req, url = null) {
 const configured = ASAAS_WEBHOOK_TOKENS.length > 0;
 const received = readAsaasWebhookAccessToken(req, url);
 const sandboxMode = /sandbox/i.test(ASAAS_API_BASE) || ASAAS_ENV === 'sandbox' || ASAAS_ENV === 'homologation';
 if (!configured) {
  return { ok: true, configured: false, received: Boolean(received), mode: 'no_token_configured' };
 }
 if (received && ASAAS_WEBHOOK_TOKENS.some((token) => safeTokenEquals(received, token))) {
  return { ok: true, configured: true, received: true, mode: 'token_match' };
 }
 if (sandboxMode && ASAAS_WEBHOOK_ALLOW_SANDBOX_WITHOUT_TOKEN && !ASAAS_WEBHOOK_STRICT && !received) {
  return { ok: true, configured: true, received: false, mode: 'sandbox_without_token_accepted' };
 }
 return {
  ok: false,
  configured: true,
  received: Boolean(received),
  mode: received ? 'token_mismatch' : 'token_missing',
  sandboxMode,
 };
}

async function saveBillingEvent(db, { userId = null, providerEventId = null, eventType = null, subscriptionId = null, paymentId = null, status = null, payload = {} }) {
 await db.query(
  `insert into crewcheck_billing_events (id, user_id, provider, event_type, provider_event_id, subscription_id, payment_id, status, payload)
   values ($1,$2,'asaas',$3,$4,$5,$6,$7,$8::jsonb)`,
  [newId(), userId, eventType, providerEventId, subscriptionId, paymentId, status, JSON.stringify(payload || {})],
 ).catch(() => null);
}

function nextPremiumPeriodEnd(planId) {
 return addDaysIso(planId === 'premium_annual' ? 370 : 35);
}

async function activatePaidSubscription(db, user, planId, subscriptionId, paymentStatus = 'active') {
 const end = nextPremiumPeriodEnd(planId || user?.subscription_plan || 'premium_monthly');
 await db.query(
  `update crewcheck_users
    set subscription_plan = $1,
      subscription_status = $2,
      billing_cycle = $3,
      premium_expires_at = $4,
      asaas_subscription_id = coalesce($5, asaas_subscription_id),
      billing_cancel_at_period_end = false,
      updated_at = now()
   where id = $6`,
  [planId || user.subscription_plan || 'premium_monthly', paymentStatus, getBillingPlan(planId || user.subscription_plan || 'premium_monthly').cycle, end, subscriptionId || null, user.id],
 );
 return end;
}

async function findBillingUserForAsaasEvent(db, payment) {
 const subscriptionId = payment?.subscription || payment?.subscriptionId || null;
 const customerId = payment?.customer || null;
 if (subscriptionId) {
  const result = await db.query('select * from crewcheck_users where asaas_subscription_id = $1 limit 1', [subscriptionId]);
  if (result.rows[0]) return result.rows[0];
 }
 if (customerId) {
  const result = await db.query('select * from crewcheck_users where asaas_customer_id = $1 limit 1', [customerId]);
  if (result.rows[0]) return result.rows[0];
 }
 return null;
}


function buildCrewCheckTestRoster() {
 return {
  crewName: 'Tripulante Teste CrewCheck',
  crewId: 'TESTE-CREW',
  base: 'BSB',
  rank: 'CCM',
  airline: 'LATAM',
  month: 5,
  year: 2026,
  days: [
   { date: '2026-05-09', dayNumber: 9, month: 5, year: 2026, weekday: 'SAB', type: 'OP', pairingCode: 'LA3953/090526/JJCC 320-P', dutyReport: '13:25', dutyDebrief: '23:15', legs: [
    { flightNumber: 'LA3953', origin: 'BSB', destination: 'POA', departureTime: '14:15', arrivalTime: '16:55', workType: 'OP', aircraftType: '328' },
    { flightNumber: 'LA3590', origin: 'POA', destination: 'CNF', departureTime: '17:35', arrivalTime: '19:45', workType: 'OP', aircraftType: '328' },
    { flightNumber: 'LA3591', origin: 'CNF', destination: 'POA', departureTime: '20:30', arrivalTime: '22:45', workType: 'OP', aircraftType: '328' },
   ]},
   { date: '2026-05-10', dayNumber: 10, month: 5, year: 2026, weekday: 'DOM', type: 'OP', pairingCode: 'LA3219/LA8130', dutyReport: '17:20', dutyDebrief: '01:55(+1)', legs: [
    { flightNumber: 'LA3219', origin: 'POA', destination: 'GRU', departureTime: '17:50', arrivalTime: '19:35', workType: 'OP', aircraftType: '328' },
    { flightNumber: 'LA8130', origin: 'GRU', destination: 'EZE', departureTime: '22:10', arrivalTime: '01:10(+1)', workType: 'OP', aircraftType: '328' },
   ]},
   { date: '2026-05-12', dayNumber: 12, month: 5, year: 2026, weekday: 'TER', type: 'OP', pairingCode: 'LA8131/LA4676', dutyReport: '01:20', dutyDebrief: '09:40', legs: [
    { flightNumber: 'LA8131', origin: 'EZE', destination: 'GRU', departureTime: '02:20', arrivalTime: '05:05', workType: 'OP', aircraftType: '328' },
    { flightNumber: 'LA4676', origin: 'GRU', destination: 'BSB', departureTime: '07:25', arrivalTime: '09:10', workType: 'OP', aircraftType: '328' },
   ]},
   { date: '2026-05-13', dayNumber: 13, month: 5, year: 2026, weekday: 'QUA', type: 'DO', pairingCode: 'DO', dutyReport: '13:11', dutyDebrief: '13:10(+1)', legs: [] },
   { date: '2026-05-21', dayNumber: 21, month: 5, year: 2026, weekday: 'QUI', type: 'CRM', pairingCode: 'CRM', dutyReport: '09:00', dutyDebrief: '13:00', legs: [], rawText: 'CRM BSB 09:00 13:00' },
  ],
 };
}

async function ensureCrewCheckTestAccount(db) {
 if (!db || !CREWCHECK_TEST_ACCOUNT_ENABLED || !CREWCHECK_TEST_ACCOUNT_EMAIL) return null;
 let result = await db.query('select * from crewcheck_users where email = $1 limit 1', [CREWCHECK_TEST_ACCOUNT_EMAIL]);
 let user = result.rows[0];
 if (!user) {
  result = await db.query(
   `insert into crewcheck_users (id, name, email, password_hash, role, crew_id, base, rank, subscription_plan, subscription_status, email_verified, email_verified_at)
    values ($1,$2,$3,$4,$5,$6,$7,$8,'free','free',true,now())
    returning *`,
   [newId(), 'Conta Teste CrewCheck', CREWCHECK_TEST_ACCOUNT_EMAIL, hashPassword(CREWCHECK_TEST_ACCOUNT_PASSWORD), 'crew', 'TESTE-CREW', 'BSB', 'CCM'],
  );
  user = result.rows[0];
 }
 if (!user?.id) return user;
 const existingRoster = await db.query('select id from crewcheck_rosters where user_id = $1 limit 1', [user.id]).catch(() => ({ rows: [] }));
 if (!existingRoster.rows[0]) {
  const roster = buildCrewCheckTestRoster();
  const checksum = checksumPayload({ roster, compliance: null, gym: [], sourceFileName: 'Escala teste CrewCheck' });
  const params = [
   user.id, roster.crewName, roster.crewId, roster.base, roster.rank, roster.airline, roster.year, roster.month,
   'Escala teste CrewCheck', JSON.stringify(roster), JSON.stringify(null), JSON.stringify([]), null, null, 0, 0, checksum,
  ];
  await db.query(
   `insert into crewcheck_rosters (
     id, user_id, crew_name, crew_id, base, rank, airline, period_year, period_month, source_file_name,
     roster_json, compliance_json, gym_json, score, intensity_score, alerts_count, critical_alerts_count, checksum
    ) values ($18,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb,$13,$14,$15,$16,$17)
    returning id, created_at, updated_at, crew_name, crew_id, base, rank, airline, period_year, period_month,
         source_file_name, score, intensity_score, alerts_count, critical_alerts_count, checksum`,
   [...params, newId()],
  ).catch(() => null);
 }
 return user;
}

function publicUser(row) {
 if (!row) return null;
 const billing = billingStatusFromUser(row);
 return {
  id: row.id,
  name: row.name,
  email: row.email,
  emailVerified: row.email_verified === undefined ? true : Boolean(row.email_verified),
  role: row.role,
  crewId: row.crew_id,
  base: row.base,
  rank: row.rank,
  hasVirtualBase: Boolean(row.virtual_base_enabled),
  virtualBase: row.virtual_base_airport || null,
  subscriptionPlan: billing.plan?.id || row.subscription_plan || 'free',
  subscriptionStatus: billing.status || row.subscription_status || 'free',
  premiumAccess: Boolean(billing.premiumAccess),
  trialEligible: Boolean(billing.trialEligible),
  trialExpiresAt: billing.trialExpiresAt || null,
  premiumExpiresAt: billing.premiumExpiresAt || null,
 };
}

function getBearerToken(req) {
 const auth = req.headers.authorization || '';
 if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
 return '';
}

async function getAuthUser(req) {
 if (!AUTH_REQUIRED) {
  return { id: null, name: 'Modo local', email: 'local@crewcheck', role: 'local' };
 }
 const db = getPool();
 if (!db) return null;
 const token = getBearerToken(req);
 if (!token) return null;
 await ensureSchema();
 const result = await db.query(
  `select u.*
    from crewcheck_sessions s
    join crewcheck_users u on u.id = s.user_id
   where s.token_hash = $1
    and s.expires_at > now()
    and u.is_active = true
   limit 1`,
  [tokenHash(token)],
 );
 return result.rows[0] || null;
}

async function requireAuth(req, res) {
 if (!AUTH_REQUIRED) return { id: null, name: 'Modo local', email: 'local@crewcheck', role: 'local' };
 const user = await getAuthUser(req);
 if (!user) {
  sendJson(res, 401, { ok: false, code: 'AUTH_REQUIRED', message: 'Faça login ou cadastro para acessar o CrewCheck.' });
  return null;
 }
 return user;
}

async function createSession(db, user, req) {
 const token = crypto.randomBytes(32).toString('base64url');
 const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
 await db.query(
  `insert into crewcheck_sessions (id, user_id, token_hash, expires_at, user_agent, ip)
   values ($1, $2, $3, $4, $5, $6)`,
  [newId(), user.id, tokenHash(token), expiresAt.toISOString(), req.headers['user-agent'] || null, req.socket.remoteAddress || null],
 );
 await db.query('update crewcheck_users set last_login_at = now(), updated_at = now() where id = $1', [user.id]);
 return { token, expiresAt };
}

function summarizeRosterRow(row) {
 return {
  id: row.id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  crewName: row.crew_name,
  crewId: row.crew_id,
  base: row.base,
  rank: row.rank,
  airline: row.airline,
  year: row.period_year,
  month: row.period_month,
  sourceFileName: row.source_file_name,
  score: row.score,
  intensityScore: row.intensity_score,
  alertsCount: row.alerts_count,
  criticalAlertsCount: row.critical_alerts_count,
  checksum: row.checksum,
 };
}


function average(values) {
 const valid = values.map(Number).filter((v) => Number.isFinite(v));
 if (!valid.length) return 0;
 return Math.round((valid.reduce((sum, v) => sum + v, 0) / valid.length) * 10) / 10;
}

function countRosterDays(roster, predicate) {
 const days = Array.isArray(roster?.days) ? roster.days : [];
 return days.filter(predicate).length;
}

function countFlightSegments(roster) {
 const days = Array.isArray(roster?.days) ? roster.days : [];
 return days.reduce((sum, day) => sum + (Array.isArray(day.legs) ? day.legs.length : 0), 0);
}

function countHeavyDays(compliance) {
 const days = compliance?.loadAnalysis?.days;
 if (!Array.isArray(days)) return 0;
 return days.filter((day) => Number(day.fatigueScore || 0) >= 70).length;
}

function safePeriodLabel(row) {
 const year = Number(row.period_year || row.year || 0);
 const month = Number(row.period_month || row.month || 0);
 if (!year || !month) return 'Sem período';
 return `${String(month).padStart(2, '0')}/${year}`;
}


function dedupeRosterRowsByPeriod(rows) {
 const seen = new Set();
 const result = [];
 for (const row of rows || []) {
  const roster = row.roster_json || {};
  const key = `${roster.crewId || row.crew_id || row.crew_name || 'crew'}:${row.period_year || roster.year || '0000'}:${row.period_month || roster.month || '00'}`;
  if (seen.has(key)) continue;
  seen.add(key);
  result.push(row);
 }
 return result;
}

function buildStatsFromRosterRows(rows, mode = 'personal') {
 const normalized = (rows || []).map((row) => ({
  id: row.id,
  createdAt: row.created_at || null,
  period: safePeriodLabel(row),
  year: row.period_year || null,
  month: row.period_month || null,
  roster: row.roster_json || {},
  compliance: row.compliance_json || {},
  gym: Array.isArray(row.gym_json) ? row.gym_json : [],
  score: Number(row.score ?? row.compliance_json?.score ?? 0),
  intensityScore: Number(row.intensity_score ?? row.compliance_json?.loadAnalysis?.intensityScore ?? 0),
  alertsCount: Number(row.alerts_count ?? row.compliance_json?.alerts?.length ?? 0),
  criticalAlertsCount: Number(row.critical_alerts_count ?? 0),
 }));

 const byPeriod = new Map();
 for (const item of normalized) byPeriod.set(`${item.year || '0000'}:${item.month || '00'}:${item.roster?.crewId || item.roster?.crewName || 'crew'}`, item);
 const uniqueNormalized = Array.from(byPeriod.values());

 const periods = uniqueNormalized.map((item) => {
  const roster = item.roster;
  const compliance = item.compliance;
  const gym = item.gym;
  return {
   id: item.id,
   period: item.period,
   year: item.year,
   month: item.month,
   daysAnalyzed: Array.isArray(roster.days) ? roster.days.length : 0,
   flightSegments: countFlightSegments(roster),
   daysOff: countRosterDays(roster, (day) => ['DO', 'DR', 'DOF'].includes(day?.type) || ['DOP','DOPR','VC','FOLGA'].includes(String(day?.pairingCode || '').toUpperCase())),
   layovers: countRosterDays(roster, (day) => day?.type === 'LAYOVER'),
   standby: countRosterDays(roster, (day) => ['HSB', 'HSBE'].includes(day?.type)),
   reserve: countRosterDays(roster, (day) => day?.type === 'ASB'),
   gymGoodDays: gym.filter((item) => item?.priority === 'high' || item?.priority === 'medium').length,
   gymAvoidDays: gym.filter((item) => item?.priority === 'low' || item?.planType === 'evitar').length,
   heavyDays: countHeavyDays(compliance),
   score: item.score,
   intensityScore: item.intensityScore,
   alertsCount: item.alertsCount,
   criticalAlertsCount: item.criticalAlertsCount,
  };
 }).sort((a, b) => Number(a.year || 0) - Number(b.year || 0) || Number(a.month || 0) - Number(b.month || 0));

 const summary = {
  rostersCount: periods.length,
  firstPeriod: periods[0]?.period || null,
  lastPeriod: periods[periods.length - 1]?.period || null,
  avgScore: average(periods.map((p) => p.score)),
  avgIntensity: average(periods.map((p) => p.intensityScore)),
  avgAlerts: average(periods.map((p) => p.alertsCount)),
  avgCriticalAlerts: average(periods.map((p) => p.criticalAlertsCount)),
  avgFlightSegments: average(periods.map((p) => p.flightSegments)),
  avgDaysOff: average(periods.map((p) => p.daysOff)),
  avgLayovers: average(periods.map((p) => p.layovers)),
  avgGymGoodDays: average(periods.map((p) => p.gymGoodDays)),
  avgHeavyDays: average(periods.map((p) => p.heavyDays)),
 };

 return {
  mode,
  summary,
  periods: mode === 'global' ? [] : periods.slice(-18),
  disclaimer: 'Estatísticas superficiais geradas automaticamente a partir das escalas salvas. Use apenas como referência pessoal; não apresente como prova, cobrança ou documento oficial para empresa, sindicato ou terceiros.',
 };
}

function smtpEmailConfigured() {
 return Boolean(
  (process.env.SMTP_HOST || process.env.CREWCHECK_SMTP_HOST) &&
  (process.env.SMTP_USERNAME || process.env.SMTP_USER || process.env.CREWCHECK_SMTP_USERNAME) &&
  (process.env.SMTP_PASSWORD || process.env.SMTP_PASS || process.env.CREWCHECK_SMTP_PASSWORD)
 );
}

function emailProviderStatus() {
 return {
  sendgrid: Boolean(process.env.SENDGRID_API_KEY),
  mailersendApi: Boolean(process.env.MAILERSEND_API_KEY),
  smtp: smtpEmailConfigured(),
 };
}

function smtpConfig() {
 const host = String(process.env.SMTP_HOST || process.env.CREWCHECK_SMTP_HOST || '').trim();
 const port = Number(process.env.SMTP_PORT || process.env.CREWCHECK_SMTP_PORT || 587);
 const username = String(process.env.SMTP_USERNAME || process.env.SMTP_USER || process.env.CREWCHECK_SMTP_USERNAME || '').trim();
 const password = String(process.env.SMTP_PASSWORD || process.env.SMTP_PASS || process.env.CREWCHECK_SMTP_PASSWORD || '').trim();
 const secure = ['1', 'true', 'yes'].includes(String(process.env.SMTP_SECURE || process.env.CREWCHECK_SMTP_SECURE || '').toLowerCase()) || port === 465;
 const from = String(process.env.EMAIL_FROM || process.env.SMTP_FROM || process.env.MAILERSEND_FROM || process.env.SENDGRID_FROM || username || '').trim();
 return { host, port, username, password, secure, from, fromName: process.env.EMAIL_FROM_NAME || 'CrewCheck' };
}

function encodeMimeWord(value = '') {
 const raw = String(value || '');
 return /^[\x20-\x7E]*$/.test(raw) ? raw : `=?UTF-8?B?${Buffer.from(raw, 'utf8').toString('base64')}?=`;
}

function sanitizeEmailAddress(value = '') {
 return String(value || '').replace(/[\r\n<>]/g, '').trim();
}

function normalizeAttachmentContentForSmtp(item) {
 const base64 = String(item?.content || item?.base64 || '').replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '');
 return base64.replace(/.{1,76}/g, '$&\r\n').trim();
}

function buildSmtpMimeMessage({ from, fromName, to, subject, text, html, attachments = [] }) {
 const safeTo = sanitizeEmailAddress(to);
 const safeFrom = sanitizeEmailAddress(from);
 const plain = String(text || subject || 'CrewCheck').replace(/\r?\n/g, '\r\n');
 const htmlBody = String(html || `<pre>${escapeHtml(text || '')}</pre>`);
 const date = new Date().toUTCString();
 const messageId = `<${crypto.randomUUID()}@crewcheck.local>`;
 const altBoundary = `crewcheck_alt_${crypto.randomUUID().replace(/-/g, '')}`;
 const mixedBoundary = `crewcheck_mix_${crypto.randomUUID().replace(/-/g, '')}`;
 const headers = [
  `From: ${encodeMimeWord(fromName || 'CrewCheck')} <${safeFrom}>`,
  `To: <${safeTo}>`,
  `Subject: ${encodeMimeWord(subject || 'CrewCheck')}`,
  `Date: ${date}`,
  `Message-ID: ${messageId}`,
  'MIME-Version: 1.0',
 ];
 const alternative = [
  `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
  '',
  `--${altBoundary}`,
  'Content-Type: text/plain; charset=UTF-8',
  'Content-Transfer-Encoding: 8bit',
  '',
  plain,
  '',
  `--${altBoundary}`,
  'Content-Type: text/html; charset=UTF-8',
  'Content-Transfer-Encoding: 8bit',
  '',
  htmlBody,
  '',
  `--${altBoundary}--`,
 ].join('\r\n');
 if (!attachments.length) return `${headers.concat(alternative).join('\r\n')}\r\n`;
 const parts = [
  `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
  '',
  `--${mixedBoundary}`,
  alternative,
 ];
 for (const item of attachments) {
  parts.push(
   '',
   `--${mixedBoundary}`,
   `Content-Type: ${item.type || 'application/octet-stream'}; name="${item.filename}"`,
   'Content-Transfer-Encoding: base64',
   `Content-Disposition: attachment; filename="${item.filename}"`,
   '',
   normalizeAttachmentContentForSmtp(item)
  );
 }
 parts.push('', `--${mixedBoundary}--`);
 return `${headers.concat(parts).join('\r\n')}\r\n`;
}

async function sendSmtpMail({ to, subject, text, html, attachments = [] }) {
 const config = smtpConfig();
 if (!config.host || !config.username || !config.password || !config.from) {
  return { ok: false, configured: false, message: 'SMTP não configurado.' };
 }
 const net = await import('node:net');
 const tls = await import('node:tls');
 let socket;
 let buffer = '';
 const timeoutMs = Number(process.env.SMTP_TIMEOUT_MS || process.env.CREWCHECK_SMTP_TIMEOUT_MS || 20000);
 const connectPlain = () => new Promise((resolve, reject) => {
  const s = net.createConnection({ host: config.host, port: config.port }, () => resolve(s));
  s.setTimeout(timeoutMs, () => reject(new Error('SMTP_TIMEOUT')));
  s.on('error', reject);
 });
 const connectTls = () => new Promise((resolve, reject) => {
  const s = tls.connect({ host: config.host, port: config.port, servername: config.host }, () => resolve(s));
  s.setTimeout(timeoutMs, () => reject(new Error('SMTP_TIMEOUT')));
  s.on('error', reject);
 });
 const attach = (s) => {
  s.setEncoding('utf8');
  s.on('data', (chunk) => { buffer += chunk; });
  return s;
 };
 const waitReply = () => new Promise((resolve, reject) => {
  const started = Date.now();
  const check = () => {
   const lines = buffer.split(/\r?\n/).filter(Boolean);
   const last = lines[lines.length - 1] || '';
   const complete = /^\d{3} /.test(last);
   if (complete) {
    const data = buffer;
    buffer = '';
    const code = Number(last.slice(0, 3));
    if (code >= 400) reject(new Error(`SMTP_${code}: ${data.slice(0, 300)}`));
    else resolve({ code, data });
    return;
   }
   if (Date.now() - started > timeoutMs) { reject(new Error('SMTP_REPLY_TIMEOUT')); return; }
   setTimeout(check, 25);
  };
  check();
 });
 const write = async (command, allowData = false) => {
  socket.write(`${command}\r\n`);
  const reply = await waitReply();
  if (allowData && reply.code !== 354) throw new Error(`SMTP_EXPECTED_DATA_${reply.code}`);
  return reply;
 };
 try {
  socket = attach(config.secure ? await connectTls() : await connectPlain());
  await waitReply();
  await write(`EHLO ${process.env.SMTP_HELO_DOMAIN || 'crewcheck.online'}`);
  if (!config.secure) {
   await write('STARTTLS');
   socket.removeAllListeners('data');
   socket.removeAllListeners('error');
   socket = attach(tls.connect({ socket, servername: config.host }));
   await write(`EHLO ${process.env.SMTP_HELO_DOMAIN || 'crewcheck.online'}`);
  }
  const authPlain = Buffer.from(`\0${config.username}\0${config.password}`, 'utf8').toString('base64');
  await write(`AUTH PLAIN ${authPlain}`);
  await write(`MAIL FROM:<${sanitizeEmailAddress(config.from)}>`);
  await write(`RCPT TO:<${sanitizeEmailAddress(to)}>`);
  await write('DATA', true);
  const message = buildSmtpMimeMessage({ from: config.from, fromName: config.fromName, to, subject, text, html, attachments });
  socket.write(`${message}\r\n.\r\n`);
  await waitReply();
  await write('QUIT').catch(() => null);
  return { ok: true, provider: 'smtp' };
 } finally {
  try { socket?.end?.(); } catch {}
 }
}

async function sendEmail({ to, subject, text, html, attachments = [] }) {
 const from = process.env.EMAIL_FROM || process.env.SENDGRID_FROM || process.env.MAILERSEND_FROM || smtpConfig().from || '';
 if (!from) {
  return { ok: false, configured: false, message: 'Configure EMAIL_FROM e ao menos um provedor de e-mail: SendGrid, MailerSend API ou SMTP.' };
 }

 const safeAttachments = Array.isArray(attachments)
  ? attachments
    .slice(0, 4)
    .map((item) => ({
     filename: String(item?.filename || 'crewcheck.txt').replace(/[\\/\0]/g, '').slice(0, 120) || 'crewcheck.txt',
     content: String(item?.content || item?.base64 || '').replace(/^data:[^;]+;base64,/, ''),
     type: String(item?.type || item?.contentType || 'text/plain').slice(0, 80),
    }))
    .filter((item) => item.content && item.content.length <= Number(process.env.CREWCHECK_EMAIL_ATTACHMENT_MAX_BASE64 || 7_000_000))
  : [];
 const attempts = [];

 if (process.env.SENDGRID_API_KEY) {
  try {
   const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
     authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
     'content-type': 'application/json',
    },
    body: JSON.stringify({
     personalizations: [{ to: [{ email: to }] }],
     from: { email: from, name: process.env.EMAIL_FROM_NAME || 'CrewCheck' },
     subject,
     content: [
      { type: 'text/plain', value: text || subject },
      { type: 'text/html', value: html || `<pre>${escapeHtml(text || '')}</pre>` },
     ],
     ...(safeAttachments.length ? { attachments: safeAttachments.map((item) => ({ content: item.content, filename: item.filename, type: item.type, disposition: 'attachment' })) } : {}),
    }),
   });
   if (!response.ok) throw new Error(`HTTP ${response.status}`);
   return { ok: true, provider: 'sendgrid', attempts };
  } catch (error) {
   attempts.push({ provider: 'sendgrid', ok: false, reason: error?.message || 'falha' });
  }
 }

 if (process.env.MAILERSEND_API_KEY) {
  try {
   const response = await fetch('https://api.mailersend.com/v1/email', {
    method: 'POST',
    headers: {
     authorization: `Bearer ${process.env.MAILERSEND_API_KEY}`,
     'content-type': 'application/json',
    },
    body: JSON.stringify({
     from: { email: from, name: process.env.EMAIL_FROM_NAME || 'CrewCheck' },
     to: [{ email: to }],
     subject,
     text: text || subject,
     html: html || `<pre>${escapeHtml(text || '')}</pre>`,
     ...(safeAttachments.length ? { attachments: safeAttachments.map((item) => ({ content: item.content, filename: item.filename, disposition: 'attachment', type: item.type })) } : {}),
    }),
   });
   if (!response.ok) throw new Error(`HTTP ${response.status}`);
   return { ok: true, provider: 'mailersend', attempts };
  } catch (error) {
   attempts.push({ provider: 'mailersend', ok: false, reason: error?.message || 'falha' });
  }
 }

 if (smtpEmailConfigured()) {
  try {
   const result = await sendSmtpMail({ to, subject, text, html, attachments: safeAttachments });
   if (result.ok) return { ...result, attempts };
   attempts.push({ provider: 'smtp', ok: false, reason: result.message || 'não configurado' });
  } catch (error) {
   attempts.push({ provider: 'smtp', ok: false, reason: error?.message || 'falha' });
  }
 }

 return { ok: false, configured: false, message: 'Envio por e-mail indisponível. Configure SendGrid, MailerSend API ou SMTP no Render.', attempts, providerStatus: emailProviderStatus() };
}

function escapeHtml(value) {
 return String(value || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch]));
}

function publicAppUrl() {
 return String(process.env.PUBLIC_APP_URL || process.env.CREWCHECK_PUBLIC_URL || 'https://crewcheck.online').replace(/\/$/, '');
}

function crewcheckBrandLogoUrl() {
 return `${publicAppUrl()}/icons/crewcheck-icon-v2.png`;
}

function crewcheckGooglePlayBadgeUrl() {
 return `${publicAppUrl()}/assets/stores/google-play-pt-br-badge.png`;
}

function buildCrewCheckEmailHtml({ title = 'CrewCheck', eyebrow = 'CrewCheck Premium', message = '', actionUrl = '', actionLabel = 'Abrir CrewCheck', includePlayBadge = true } = {}) {
 const safeTitle = escapeHtml(title);
 const safeEyebrow = escapeHtml(eyebrow);
 const safeMessage = escapeHtml(message).replace(/\n/g, '<br>');
 const logo = crewcheckBrandLogoUrl();
 const badge = crewcheckGooglePlayBadgeUrl();
 const cta = actionUrl ? `<a href="${escapeHtml(actionUrl)}" style="display:inline-block;margin-top:18px;background:#67e8f9;color:#07111f;text-decoration:none;font-weight:800;border-radius:16px;padding:12px 18px">${escapeHtml(actionLabel)}</a>` : '';
 const play = includePlayBadge ? `<div style="margin-top:18px"><img src="${badge}" alt="Disponível no Google Play" style="max-width:210px;height:auto;border:0" /></div>` : '';
 return `<div style="font-family:Inter,Arial,sans-serif;line-height:1.6;color:#0f172a;background:#f5f8fc;padding:28px"><div style="max-width:720px;margin:auto;background:#ffffff;border:1px solid #dbe7f3;border-radius:28px;overflow:hidden"><div style="background:linear-gradient(135deg,#07111f,#0b2a45);padding:24px 28px;color:#fff"><table role="presentation" cellspacing="0" cellpadding="0" style="width:100%"><tr><td style="width:58px"><img src="${logo}" alt="CrewCheck" style="width:48px;height:48px;border-radius:14px;display:block" /></td><td><div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#a5f3fc;font-weight:800">${safeEyebrow}</div><div style="font-size:24px;font-weight:900;margin-top:3px">${safeTitle}</div></td></tr></table></div><div style="padding:26px 28px"><p style="white-space:normal;margin:0;color:#334155;font-size:15px">${safeMessage}</p>${cta}${play}<p style="margin-top:24px;font-size:12px;color:#64748b">Mensagem enviada automaticamente pela plataforma CrewCheck. Confirme sempre informações operacionais nos canais oficiais.</p></div></div></div>`;
}



function buildWelcomeEmail({ email, temporaryPassword }) {
 const safeEmail = escapeHtml(email);
 const safePassword = escapeHtml(temporaryPassword);
 const subject = 'Bem-vindo ao CrewCheck Premium';
 const text = [
  'Bem-vindo ao CrewCheck Premium.',
  '',
  `Conta criada para: ${email}`,
  `Código temporário de emergência: ${temporaryPassword}`,
  '',
  'Você pode acessar com a senha escolhida no cadastro. A senha provisória é temporária e serve apenas como alternativa inicial/de recuperação.',
  'Após carregar sua primeira escala, o CrewCheck preencherá automaticamente BP, base e função a partir do PDF.',
  '',
  'Equipe CrewCheck',
 ].join('\n');
 const html = `
 <div style="margin:0;padding:0;background:#eef5f8;font-family:Inter,Segoe UI,Arial,sans-serif;color:#092846">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef5f8;padding:32px 12px">
   <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border-radius:28px;overflow:hidden;box-shadow:0 24px 70px rgba(9,40,70,.16)">
     <tr><td style="height:7px;background:linear-gradient(90deg,#67e8f9,#3b82f6,#a855f7)"></td></tr>
     <tr><td style="padding:34px 34px 18px">
      <div style="font-size:12px;letter-spacing:.22em;text-transform:uppercase;color:#0ea5e9;font-weight:800">CrewCheck Premium</div>
      <h1 style="margin:10px 0 8px;font-size:30px;line-height:1.1;color:#06172a">Cadastro criado com sucesso</h1>
      <p style="margin:0;color:#60758a;font-size:15px;line-height:1.7">Sua conta foi criada. O sistema usará apenas seu e-mail no cadastro e preencherá BP, base e função automaticamente após a leitura da escala.</p>
     </td></tr>
     <tr><td style="padding:0 34px 22px">
      <div style="background:#f8fbff;border:1px solid #dbeafe;border-radius:22px;padding:22px">
       <p style="margin:0 0 10px;color:#60758a;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.12em">Conta</p>
       <p style="margin:0;font-size:16px;font-weight:800;color:#092846">${safeEmail}</p>
      </div>
     </td></tr>
     <tr><td style="padding:0 34px 24px">
      <div style="background:#06172a;border-radius:24px;padding:24px;color:white">
       <p style="margin:0;color:#93c5fd;font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.14em">Código temporário de emergência</p>
       <div style="margin-top:14px;padding:16px 18px;border-radius:18px;background:rgba(255,255,255,.08);font-size:28px;letter-spacing:.12em;font-weight:900;text-align:center">${safePassword}</div>
       <p style="margin:16px 0 0;color:#cbd5e1;font-size:13px;line-height:1.6">Você também pode entrar com a senha escolhida no cadastro. A senha provisória expira automaticamente e deve ser usada apenas se necessário.</p>
      </div>
     </td></tr>
     <tr><td style="padding:0 34px 34px;color:#60758a;font-size:14px;line-height:1.7">
      <strong style="color:#092846">Próximo passo:</strong> acesse o CrewCheck, carregue seu PDF de escala e o sistema identificará automaticamente BP, base e função.
     </td></tr>
    </table>
   </td></tr>
  </table>
 </div>`;
 return { subject, text, html };
}


function buildPasswordResetEmail({ email, temporaryPassword }) {
 const safeEmail = escapeHtml(email);
 const safePassword = escapeHtml(temporaryPassword);
 const subject = 'CrewCheck Premium — código temporário de redefinição';
 const text = [
  'CrewCheck Premium — recuperação de acesso.',
  '',
  `Conta: ${email}`,
  `Código temporário: ${temporaryPassword}`,
  '',
  'O código temporário expira em 30 minutos e só serve para definir uma nova senha.',
  'Se você não solicitou essa recuperação, ignore este e-mail.',
  '',
  'Equipe CrewCheck',
 ].join('\n');
 const html = `
 <div style="margin:0;padding:0;background:#eef5f8;font-family:Inter,Segoe UI,Arial,sans-serif;color:#092846">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef5f8;padding:32px 12px">
   <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border-radius:28px;overflow:hidden;box-shadow:0 24px 70px rgba(9,40,70,.16)">
     <tr><td style="height:7px;background:linear-gradient(90deg,#67e8f9,#3b82f6,#a855f7)"></td></tr>
     <tr><td style="padding:34px 34px 18px">
      <div style="font-size:12px;letter-spacing:.22em;text-transform:uppercase;color:#0ea5e9;font-weight:800">CrewCheck Premium</div>
      <h1 style="margin:10px 0 8px;font-size:30px;line-height:1.1;color:#06172a">Recuperação de acesso</h1>
      <p style="margin:0;color:#60758a;font-size:15px;line-height:1.7">Geramos um código temporário para redefinir sua senha. Ele não faz login direto: você precisará criar uma nova senha no CrewCheck.</p>
     </td></tr>
     <tr><td style="padding:0 34px 22px"><div style="background:#f8fbff;border:1px solid #dbeafe;border-radius:22px;padding:22px"><p style="margin:0 0 10px;color:#60758a;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.12em">Conta</p><p style="margin:0;font-size:16px;font-weight:800;color:#092846">${safeEmail}</p></div></td></tr>
     <tr><td style="padding:0 34px 24px"><div style="background:#06172a;border-radius:24px;padding:24px;color:white"><p style="margin:0;color:#93c5fd;font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.14em">Código temporário</p><div style="margin-top:14px;padding:16px 18px;border-radius:18px;background:rgba(255,255,255,.08);font-size:28px;letter-spacing:.12em;font-weight:900;text-align:center">${safePassword}</div><p style="margin:16px 0 0;color:#cbd5e1;font-size:13px;line-height:1.6">Expira em 30 minutos e só serve para definir uma nova senha.</p></div></td></tr>
     <tr><td style="padding:0 34px 34px;color:#60758a;font-size:14px;line-height:1.7"><strong style="color:#092846">Privacidade:</strong> usamos seus dados apenas para autenticação e análise da escala conforme as boas práticas da LGPD.</td></tr>
    </table>
   </td></tr>
  </table>
 </div>`;
 return { subject, text, html };
}


const IFLIGHT_MAIN_URL = 'https://iflightla.ibsplc.aero/iflight-crew/web/getMainPage';

function iflightAutoPullCapabilities() {
 return {
  ok: true,
  productName: 'iFlight AutoPull Seguro',
  mode: 'official_portal_session_only',
  credentialPolicy: 'login, senha e MFA permanecem somente no portal oficial/WebView; o backend CrewCheck não recebe credenciais corporativas',
  noExternalAppsGoal: true,
  calendarFirst: true,
  maskedAfterAuthentication: true,
  canReuseAuthorizedSession: true,
  captures: ['roster_calendar', 'programacao', 'tripulacao', 'voos', 'reservas', 'sobreavisos', 'treinamentos', 'pernoites', 'roster_report_pdf_lt'],
  limitations: ['navegadores comuns não permitem capturar outro domínio automaticamente', 'Android/WebView com ponte nativa ou conector corporativo autorizado é necessário para pull totalmente interno'],
 };
}

async function importIFlightRoster({ username, password, periodMonth, periodYear, mfaCode = '', challengeSessionId = '', step = 'start' }) {
 const connectorUrl = String(process.env.IFLIGHT_CONNECTOR_URL || '').trim();
 const connectorToken = String(process.env.IFLIGHT_CONNECTOR_TOKEN || '').trim();

 if (connectorUrl) {
  const response = await fetch(connectorUrl, {
   method: 'POST',
   headers: {
    'content-type': 'application/json',
    ...(connectorToken ? { authorization: `Bearer ${connectorToken}` } : {}),
   },
   body: JSON.stringify({
    username,
    password,
    periodMonth,
    periodYear,
    mfaCode,
    challengeSessionId,
    step,
    source: 'crewcheck',
    mfaMode: 'manual_user_supplied',
   }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
   const err = new Error(payload?.message || payload?.detail || `Conector iFlight retornou HTTP ${response.status}.`);
   err.statusCode = response.status || 502;
   err.code = payload?.code || 'IFLIGHT_CONNECTOR_ERROR';
   throw err;
  }
  if (payload?.requiresMfa || payload?.status === 'mfa_required' || payload?.challengeRequired) {
   return {
    requiresMfa: true,
    challengeSessionId: payload.challengeSessionId || payload.sessionId || payload.challengeId || challengeSessionId || '',
    challengeLabel: payload.challengeLabel || payload.factor || payload.method || 'MFA corporativo',
    message: payload.message || 'O portal solicitou MFA. Informe manualmente o código recebido para continuar.',
   };
  }
  if (payload.roster) {
   return { roster: payload.roster, sourceFileName: payload.sourceFileName || `iFlight_${periodYear}_${periodMonth}.pdf`, diagnostics: payload.diagnostics || null };
  }
  if (payload.dataBase64) {
   const parsed = await parsePdfOnServer({ filename: payload.filename || `iFlight_${periodYear}_${periodMonth}.pdf`, dataBase64: payload.dataBase64 });
   return { ...parsed, sourceFileName: payload.filename || `iFlight_${periodYear}_${periodMonth}.pdf` };
  }
  const err = new Error('O conector iFlight respondeu sem roster, sem PDF base64 e sem solicitação de MFA.');
  err.statusCode = 502;
  err.code = 'IFLIGHT_EMPTY_CONNECTOR_RESPONSE';
  throw err;
 }

 let redirectLocation = '';
 try {
  const probe = await fetch(IFLIGHT_MAIN_URL, {
   method: 'GET',
   redirect: 'manual',
   headers: {
    'user-agent': 'CrewCheck/10.5.7 (+https://crewcheck.online)',
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
   },
  });
  redirectLocation = probe.headers.get('location') || '';
  if (probe.status >= 300 && probe.status < 400 && redirectLocation) {
   const err = new Error(/accounts\.google\.com|saml|login|auth/i.test(redirectLocation)
    ? 'O iFlight usa autenticação corporativa externa. O CrewCheck já aceita usuário, senha e MFA manual, mas para baixar direto é necessário um conector corporativo autorizado que mantenha a sessão e devolva o desafio MFA ao app. Até configurar IFLIGHT_CONNECTOR_URL, use a importação por PDF.'
    : `O iFlight redirecionou para autenticação externa (${new URL(redirectLocation, IFLIGHT_MAIN_URL).hostname}). Configure um conector corporativo autorizado ou use o PDF.`);
   err.statusCode = 501;
   err.code = 'IFLIGHT_CONNECTOR_REQUIRED_FOR_MFA';
   throw err;
  }
 } catch (error) {
  if (error?.statusCode) throw error;
  const err = new Error(`Não foi possível verificar o portal iFlight agora. Detalhe: ${error?.message || String(error)}. Use a importação PDF ou configure IFLIGHT_CONNECTOR_URL.`);
  err.statusCode = 502;
  err.code = 'IFLIGHT_PORTAL_UNREACHABLE';
  throw err;
 }

 const err = new Error('O fluxo com usuário, senha e MFA manual está pronto, mas o download direto depende de conector/API corporativa autorizada em IFLIGHT_CONNECTOR_URL. Sem isso, use a importação PDF.');
 err.statusCode = 501;
 err.code = 'IFLIGHT_CONNECTOR_REQUIRED';
 throw err;
}


function externalBaseUrl(req) {
 const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() || (req.socket.encrypted ? 'https' : 'https');
 const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
 return `${proto}://${host}`.replace(/\/$/, '');
}

function emptyCalendarFeed() {
 return [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//CrewCheck//Automatic Calendar Feed//PT-BR',
  'CALSCALE:GREGORIAN',
  'METHOD:PUBLISH',
  'X-WR-CALNAME:CrewCheck · Escala',
  'X-WR-CALDESC:Importe uma escala no CrewCheck para atualizar esta assinatura.',
  'END:VCALENDAR',
  '',
 ].join('\r\n');
}

function calendarFeedUrl(req, token) {
 return `${externalBaseUrl(req)}/calendar-feed/${encodeURIComponent(token)}.ics`;
}

async function ensureCalendarFeedForUser(db, user) {
 await ensureSchema();
 const userId = user.id || null;
 if (!userId) throw new Error('Usuário sem sessão para criar assinatura de calendário.');
 const existing = await db.query('select * from crewcheck_calendar_feeds where user_id = $1 limit 1', [userId]);
 if (existing.rowCount) return existing.rows[0];
 const row = {
  id: newId(),
  token: crypto.randomBytes(32).toString('base64url'),
 };
 await db.query(
  'insert into crewcheck_calendar_feeds (id, user_id, token, ics_content, period_label, mode, events_count) values ($1,$2,$3,$4,$5,$6,$7)',
  [row.id, userId, row.token, emptyCalendarFeed(), null, 'all', 0],
 );
 const created = await db.query('select * from crewcheck_calendar_feeds where id = $1 limit 1', [row.id]);
 return created.rows[0];
}

const BSB_AERO_FLIGHTS_URL = 'https://www.bsb.aero/passageiros/voos-online';
const BSB_AERO_CACHE_TTL_MS = Number(process.env.BSB_AERO_CACHE_TTL_MS || 90_000);
const bsbAeroFlightCache = new Map();

function normalizeFlightToken(value) {
 return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function splitFlightTokens(value) {
 return String(value || '')
  .toUpperCase()
  .split(/[^A-Z0-9]+/)
  .map(normalizeFlightToken)
  .filter((token) => /^[A-Z]{1,4}\d{2,5}$/.test(token));
}

function flightNumberVariants(value) {
 const token = normalizeFlightToken(value);
 const match = token.match(/^([A-Z]{1,4})(\d{2,5})$/);
 if (!match) return token ? [token] : [];
 const [, prefix, number] = match;
 const aliases = {
  LA: ['LA', 'TAM', 'JJ'],
  JJ: ['JJ', 'LA', 'TAM'],
  TAM: ['TAM', 'LA', 'JJ'],
  G3: ['G3', 'GLO'],
  GLO: ['GLO', 'G3'],
  AD: ['AD', 'AZU'],
  AZU: ['AZU', 'AD'],
  TP: ['TP', 'TAP'],
  TAP: ['TAP', 'TP'],
  CM: ['CM', 'CMP'],
  CMP: ['CMP', 'CM'],
  AR: ['AR', 'ARG'],
  ARG: ['ARG', 'AR'],
 };
 return Array.from(new Set([...(aliases[prefix] || [prefix]), prefix].map((item) => `${item}${number}`)));
}

function buildFlightCandidates({ flightNumber, codes }) {
 const tokens = [normalizeFlightToken(flightNumber), ...splitFlightTokens(codes)];
 return Array.from(new Set(tokens.flatMap(flightNumberVariants).filter(Boolean)));
}

function htmlToSearchText(html) {
 return String(html || '')
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&#0*39;/g, "'")
  .replace(/&quot;/gi, '"')
  .replace(/\s+/g, ' ')
  .trim();
}

function escapeRegExp(value) {
 return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function flightTokenRegex(token) {
 const normalized = normalizeFlightToken(token);
 const match = normalized.match(/^([A-Z]{1,4})(\d{2,5})$/);
 if (!match) return new RegExp(escapeRegExp(normalized), 'i');
 const [, prefix, number] = match;
 return new RegExp(`\\b${escapeRegExp(prefix)}\\s*${escapeRegExp(number)}\\b`, 'i');
}

function extractSegmentForCandidates(text, candidates) {
 for (const token of candidates) {
  const regex = flightTokenRegex(token);
  const match = regex.exec(text);
  if (match) {
   const start = Math.max(0, match.index - 320);
   const end = Math.min(text.length, match.index + 640);
   return { token, segment: text.slice(start, end) };
  }
 }
 return null;
}

function parseBsbStatusSegment(segment) {
 const sourceText = String(segment || '');
 const statusWords = [
  'Embarque encerrado',
  'Última chamada',
  'Ultima chamada',
  'Embarcando',
  'Atrasado',
  'Cancelado',
  'Confirmado',
  'Previsto',
  'Programado',
  'No horário',
  'No horario',
  'Decolado',
  'Pousou',
  'Pousado',
  'Chegou',
  'Partiu',
  'Finalizado',
 ];
 const status = statusWords.find((word) => new RegExp(`\\b${escapeRegExp(word)}\\b`, 'i').test(sourceText)) || null;
 const gateMatch = sourceText.match(/(?:port[aã]o|gate)\s*[:\-]?\s*([A-Z]?\d{1,3}[A-Z]?)/i) || sourceText.match(/\bP(?:T|ORT)?\s*([A-Z]?\d{1,3}[A-Z]?)\b/i);
 const terminalMatch = sourceText.match(/(?:terminal|term\.?|t)\s*[:\-]?\s*([A-Z0-9]{1,4})\b/i);
 const scheduledMatch = sourceText.match(/(?:previsto|programado)\s*[:\-]?\s*([0-2]?\d:[0-5]\d)/i);
 const confirmedMatch = sourceText.match(/(?:confirmado|realizado)\s*[:\-]?\s*([0-2]?\d:[0-5]\d)/i);
 return {
  status: status ? normalizeBsbStatus(status) : null,
  gate: gateMatch?.[1] ? gateMatch[1].toUpperCase() : null,
  terminal: terminalMatch?.[1] ? terminalMatch[1].toUpperCase() : null,
  scheduledTime: scheduledMatch?.[1] || null,
  confirmedTime: confirmedMatch?.[1] || null,
 };
}

function normalizeBsbStatus(value) {
 const text = String(value || '').trim();
 const lower = text.toLowerCase();
 if (lower.includes('atras')) return 'Atrasado';
 if (lower.includes('cancel')) return 'Cancelado';
 if (lower.includes('embar')) return text.includes('encerrado') ? 'Embarque encerrado' : 'Embarcando';
 if (lower.includes('última') || lower.includes('ultima')) return 'Última chamada';
 if (lower.includes('decol')) return 'Decolado';
 if (lower.includes('pous') || lower.includes('cheg')) return 'Pousou';
 if (lower.includes('confirm')) return 'Confirmado';
 if (lower.includes('hor')) return 'No horário';
 return text || 'Programado';
}

function shouldUseBsbAero({ origin, destination, route, airport }) {
 const values = [origin, destination, route, airport].map((value) => String(value || '').toUpperCase());
 return values.some((value) => /(^|[^A-Z])BSB([^A-Z]|$)/.test(value));
}

async function fetchBsbAeroFlightStatus(params) {
 const flightNumber = normalizeFlightToken(params.flightNumber);
 const candidates = buildFlightCandidates(params);
 const date = String(params.date || '').slice(0, 10);
 const cacheKey = `${date}|${candidates.join(',') || flightNumber}|${params.origin || ''}|${params.destination || ''}`;
 const cached = bsbAeroFlightCache.get(cacheKey);
 if (cached && Date.now() - cached.time < BSB_AERO_CACHE_TTL_MS) return cached.value;

 const resultBase = {
  flightNumber,
  origin: params.origin,
  destination: params.destination,
  date,
  updatedAt: new Date().toISOString(),
 };

 try {
  const response = await fetch(BSB_AERO_FLIGHTS_URL, {
   headers: {
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'pt-BR,pt;q=0.9,en;q=0.6',
    'cache-control': 'no-cache',
    pragma: 'no-cache',
    'user-agent': 'CrewCheck/10.8.9 (+https://github.com/bmedeiros1987/crewcheck) flight-status-bsb',
   },
   signal: AbortSignal.timeout(7500),
  });
  if (!response.ok) throw new Error(`BSB_AERO_HTTP_${response.status}`);
  const html = await response.text();
  const text = htmlToSearchText(html);
  const match = extractSegmentForCandidates(text, candidates);
  if (!match) {
   const value = { ok: true, ...resultBase, status: 'Programado', gate: null, terminal: null, source: 'BSB Aero oficial: voo não localizado no painel público' };
   bsbAeroFlightCache.set(cacheKey, { time: Date.now(), value });
   return value;
  }
  const parsed = parseBsbStatusSegment(match.segment);
  const value = {
   ok: true,
   ...resultBase,
   matchedFlight: match.token,
   status: parsed.status || 'Programado',
   gate: parsed.gate,
   terminal: parsed.terminal,
   scheduledTime: parsed.scheduledTime,
   confirmedTime: parsed.confirmedTime,
   source: 'BSB Aero oficial',
  };
  bsbAeroFlightCache.set(cacheKey, { time: Date.now(), value });
  return value;
 } catch (error) {
  const value = { ok: true, ...resultBase, status: 'Programado', gate: null, terminal: null, source: 'BSB Aero oficial indisponível' };
  bsbAeroFlightCache.set(cacheKey, { time: Date.now(), value });
  return value;
 }
}


const FLIGHT_PROVIDER_CACHE_TTL_MS = Number(process.env.FLIGHT_PROVIDER_CACHE_TTL_MS || 120_000);
const flightProviderCache = new Map();
let amadeusTokenCache = { token: '', expiresAt: 0 };

function cacheGet(map, key, ttlMs) {
 const cached = map.get(key);
 if (cached && Date.now() - cached.time < ttlMs) return cached.value;
 return null;
}

function cacheSet(map, key, value) {
 map.set(key, { time: Date.now(), value });
 return value;
}

function splitFlightDesignator(value) {
 const token = normalizeFlightToken(value);
 const match = token.match(/^([A-Z]{1,4})(\d{1,5})([A-Z]?)$/);
 if (!match) return null;
 return { carrierCode: match[1], flightNumber: match[2], operationalSuffix: match[3] || '' };
}

function primaryFlightDesignator(params) {
 const candidates = buildFlightCandidates(params);
 for (const token of candidates) {
  const parsed = splitFlightDesignator(token);
  if (parsed) return { ...parsed, token };
 }
 return null;
}

function normalizeProviderStatus(value) {
 const status = String(value || '').toLowerCase();
 if (!status) return 'Programado';
 if (status.includes('cancel')) return 'Cancelado';
 if (status.includes('land') || status.includes('pous')) return 'Pousou';
 if (status.includes('active') || status.includes('airborne') || status.includes('em voo')) return 'Em voo';
 if (status.includes('divert') || status.includes('redirect')) return 'Desviado';
 if (status.includes('incident')) return 'Incidente';
 if (status.includes('delay') || status.includes('atras')) return 'Atrasado';
 if (status.includes('sched') || status.includes('program')) return 'Programado';
 return String(value || 'Programado');
}

function dateOnly(value) {
 return String(value || '').slice(0, 10);
}

function sameDateOrEmpty(a, b) {
 return !a || !b || dateOnly(a) === dateOnly(b);
}

function safeRadarTimeZone(value) {
 const zone = String(value || process.env.CREWCHECK_LOCAL_TIMEZONE || 'America/Sao_Paulo').trim() || 'America/Sao_Paulo';
 try {
  new Intl.DateTimeFormat('pt-BR', { timeZone: zone }).format(new Date());
  return zone;
 } catch {
  return 'America/Sao_Paulo';
 }
}

function formatDateTimeInRadarZone(date, timeZone) {
 const safeDate = date instanceof Date && Number.isFinite(date.getTime()) ? date : null;
 if (!safeDate) return null;
 try {
  const parts = new Intl.DateTimeFormat('pt-BR', { timeZone: safeRadarTimeZone(timeZone), hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(safeDate);
  const hour = parts.find((part) => part.type === 'hour')?.value || '';
  const minute = parts.find((part) => part.type === 'minute')?.value || '';
  if (hour && minute) return `${hour}:${minute}`;
 } catch {}
 return null;
}

function normalizeTime(value, timeZone = process.env.CREWCHECK_LOCAL_TIMEZONE || 'America/Sao_Paulo') {
 if (!value) return null;
 const text = String(value).trim();
 // Provedores como FlightAware/Aviationstack retornam ISO/UTC. Converter antes de exibir evita que o radar fique em UTC.
 if (/^\d{4}-\d{2}-\d{2}T/.test(text) || /Z$|[+-]\d{2}:?\d{2}$/.test(text)) {
  const parsed = new Date(text);
  const converted = formatDateTimeInRadarZone(parsed, timeZone);
  if (converted) return converted;
 }
 const time = text.match(/T([0-2]\d:[0-5]\d)/)?.[1] || text.match(/\b([0-2]?\d:[0-5]\d)\b/)?.[1] || null;
 if (!time) return null;
 return time.replace(/^(\d):/, '0$1:');
}

function airportMatches(value, expected) {
 return !expected || String(value || '').toUpperCase() === String(expected || '').toUpperCase();
}

function bestAviationstackPart(item, params) {
 const departure = item?.departure || {};
 const arrival = item?.arrival || {};
 const origin = String(params.origin || '').toUpperCase();
 const destination = String(params.destination || '').toUpperCase();
 if (origin && airportMatches(departure.iata, origin)) return departure;
 if (destination && airportMatches(arrival.iata, destination)) return arrival;
 if (departure.gate || departure.terminal) return departure;
 if (arrival.gate || arrival.terminal) return arrival;
 return departure.iata ? departure : arrival;
}

function normalizeAviationstackItem(item, params, sourceLabel = 'Aviationstack') {
 const part = bestAviationstackPart(item, params) || {};
 const departure = item?.departure || {};
 const arrival = item?.arrival || {};
 const flight = item?.flight || {};
 const scheduled = part.scheduled || departure.scheduled || arrival.scheduled || null;
 const confirmed = part.actual || part.estimated || part.actual_runway || part.estimated_runway || null;
 return {
  ok: true,
  flightNumber: flight.iata || params.flightNumber,
  origin: departure.iata || params.origin,
  destination: arrival.iata || params.destination,
  date: params.date,
  matchedFlight: flight.iata || flight.icao || params.flightNumber,
  status: normalizeProviderStatus(item?.flight_status || item?.status),
  gate: part.gate ? String(part.gate).toUpperCase() : null,
  terminal: part.terminal ? String(part.terminal).toUpperCase() : null,
  scheduledTime: normalizeTime(scheduled, params.displayTimeZone),
  confirmedTime: normalizeTime(confirmed, params.displayTimeZone),
  source: sourceLabel,
  updatedAt: new Date().toISOString(),
 };
}

function scoreAviationstackItem(item, params, designator) {
 let score = 0;
 const flight = item?.flight || {};
 const token = normalizeFlightToken(flight.iata || '');
 const icao = normalizeFlightToken(flight.icao || '');
 const candidates = buildFlightCandidates(params);
 if (candidates.includes(token) || candidates.includes(icao)) score += 50;
 if (designator?.flightNumber && String(flight.number || '') === String(designator.flightNumber)) score += 25;
 if (airportMatches(item?.departure?.iata, params.origin)) score += 12;
 if (airportMatches(item?.arrival?.iata, params.destination)) score += 12;
 if (sameDateOrEmpty(item?.flight_date, params.date)) score += 10;
 if (item?.departure?.gate || item?.arrival?.gate) score += 5;
 return score;
}

function pickBestAviationstack(data, params, designator) {
 const rows = Array.isArray(data) ? data : [];
 let best = null;
 let bestScore = -1;
 for (const item of rows) {
  const score = scoreAviationstackItem(item, params, designator);
  if (score > bestScore) {
   best = item;
   bestScore = score;
  }
 }
 return bestScore > 0 ? best : null;
}

function aviationstackAccessKey() {
 return String(process.env.AVIATIONSTACK_ACCESS_KEY || process.env.AVIATIONSTACK_API_KEY || '').trim();
}

function aviationstackBaseCandidates() {
 const configured = String(process.env.AVIATIONSTACK_BASE_URL || 'https://api.aviationstack.com/v1').replace(/\/$/, '');
 const list = [configured];
 if (configured.startsWith('https://')) list.push(configured.replace(/^https:\/\//, 'http://'));
 if (configured.startsWith('http://')) list.push(configured.replace(/^http:\/\//, 'https://'));
 return [...new Set(list)];
}

function aviationstackErrorMessage(payload) {
 const err = payload?.error || payload?.errors;
 if (!err) return '';
 if (Array.isArray(err)) return err.map((item) => item?.message || item?.title || JSON.stringify(item)).join(' | ');
 return String(err.message || err.code || err.type || JSON.stringify(err));
}


// CrewCheck v10.8.34 — Radar Premium Rate Guard.
// Evita estouro de limite da Aviationstack com cache bruto, cooldown e uma chamada por atualização.
const aviationstackRawCache = new Map();
const aviationstackThrottleState = new Map();
const AVIATIONSTACK_RAW_CACHE_TTL_MS = Number(process.env.AVIATIONSTACK_RAW_CACHE_TTL_MS || 5 * 60 * 1000);
const AVIATIONSTACK_RATE_LIMIT_COOLDOWN_MS = Number(process.env.AVIATIONSTACK_RATE_LIMIT_COOLDOWN_MS || 65 * 1000);
const AVIATIONSTACK_TIMETABLE_INTERVAL_MS = Number(process.env.AVIATIONSTACK_TIMETABLE_INTERVAL_MS || 65 * 1000);
const AVIATIONSTACK_FLIGHTS_INTERVAL_MS = Number(process.env.AVIATIONSTACK_FLIGHTS_INTERVAL_MS || 15 * 1000);
const AIRPORT_BOARD_PREMIUM_CACHE_MS = Number(process.env.AIRPORT_BOARD_CACHE_TTL_MS || 5 * 60 * 1000);

function aviationstackEndpointInterval(endpoint) {
 const normalized = String(endpoint || '').toLowerCase();
 if (normalized.includes('timetable') || normalized.includes('flightsfuture')) return AVIATIONSTACK_TIMETABLE_INTERVAL_MS;
 return AVIATIONSTACK_FLIGHTS_INTERVAL_MS;
}

function stableQueryString(query = {}) {
 return Object.entries(query || {})
  .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
  .map(([key, value]) => [key, String(value)])
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
  .join('&');
}

function aviationstackCacheKey(endpoint, query) {
 return `${String(endpoint || '').toLowerCase()}?${stableQueryString(query)}`;
}

function isAviationstackRateLimitMessage(message) {
 return /rate\s*limit|rate\s*limitation|maximum\s*rate|too\s*many\s*requests|throttl|monthly\s+usage\s+limit|usage\s+limit\s+has\s+been\s+reached|upgrade\s+your\s+subscription/i.test(String(message || ''));
}

function aviationstackRateLimitCooldownMs(reason = '') {
 const message = String(reason || '');
 if (/monthly\s+usage\s+limit|usage\s+limit\s+has\s+been\s+reached|upgrade\s+your\s+subscription/i.test(message)) {
  return Number(process.env.AVIATIONSTACK_MONTHLY_LIMIT_COOLDOWN_MS || 6 * 60 * 60 * 1000);
 }
 return AVIATIONSTACK_RATE_LIMIT_COOLDOWN_MS;
}

function aviationstackThrottleKey(endpoint, query = {}) {
 const normalizedEndpoint = String(endpoint || '').toLowerCase().replace(/^\//, '') || 'default';
 const queryKey = stableQueryString(query || {})
  .replace(/access_key=[^&]+/gi, 'access_key=***')
  .replace(/limit=\d+/gi, 'limit=*');
 return `${normalizedEndpoint}:${queryKey}`;
}

function markAviationstackRateLimited(endpoint, reason, query = {}) {
 const key = aviationstackThrottleKey(endpoint, query);
 aviationstackThrottleState.set(key, {
  until: Date.now() + aviationstackRateLimitCooldownMs(reason),
  reason: reason || 'Limite temporário da Aviationstack atingido.',
 });
}

function canCallAviationstackEndpoint(endpoint, query = {}) {
 const key = aviationstackThrottleKey(endpoint, query);
 const state = aviationstackThrottleState.get(key);
 const now = Date.now();
 if (state?.until && state.until > now) return { ok: false, waitMs: state.until - now, reason: state.reason };
 if (state?.until && state.until <= now) aviationstackThrottleState.delete(key);
 return { ok: true, waitMs: 0, reason: '' };
}

function markAviationstackCall(endpoint, query = {}) {
 const key = aviationstackThrottleKey(endpoint, query);
 const interval = aviationstackEndpointInterval(endpoint);
 aviationstackThrottleState.set(key, { until: Date.now() + interval, reason: `Intervalo mínimo de ${Math.ceil(interval / 1000)}s entre consultas ${endpoint}.` });
}

function cacheRawAviationstack(key, value, ttlMs = AVIATIONSTACK_RAW_CACHE_TTL_MS) {
 aviationstackRawCache.set(key, { value, expiresAt: Date.now() + ttlMs });
 return value;
}

function getCachedRawAviationstack(key) {
 const entry = aviationstackRawCache.get(key);
 if (!entry) return undefined;
 if (entry.expiresAt < Date.now()) {
  aviationstackRawCache.delete(key);
  return undefined;
 }
 return entry.value;
}

function dedupeDiagnostics(diagnostics = []) {
 const seen = new Set();
 return (diagnostics || []).filter((item) => {
  const key = `${item.provider || ''}:${item.endpoint || ''}:${item.status || ''}:${item.reason || ''}:${item.throttled ? 't' : ''}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
 });
}

async function fetchAviationstackJson(endpoint, query, diagnostics = [], options = {}) {
 const accessKey = aviationstackAccessKey();
 if (!accessKey) {
  diagnostics.push({ provider: 'Aviationstack', ok: false, reason: 'AVIATIONSTACK_ACCESS_KEY ausente no Render' });
  return null;
 }

 const rawKey = aviationstackCacheKey(endpoint, query);
 const cached = options.force ? undefined : getCachedRawAviationstack(rawKey);
 if (cached !== undefined) {
  diagnostics.push({ provider: 'Aviationstack', endpoint, ok: Boolean(cached), cached: true, reason: cached ? 'cache premium' : 'sem dados em cache recente' });
  return cached;
 }

 const throttle = options.force ? { ok: true, waitMs: 0, reason: '' } : canCallAviationstackEndpoint(endpoint, query);
 if (!throttle.ok) {
  diagnostics.push({
   provider: 'Aviationstack',
   endpoint,
   ok: false,
   throttled: true,
   waitMs: throttle.waitMs,
   reason: `Aguardando ${Math.max(1, Math.ceil(throttle.waitMs / 1000))}s para respeitar o limite da Aviationstack.`,
  });
  return null;
 }

 // Uma única base por chamada. Testar HTTPS e HTTP duplicava chamadas e estourava limite.
 const baseUrl = String(process.env.AVIATIONSTACK_BASE_URL || 'https://api.aviationstack.com/v1').replace(/\/$/, '') || 'https://api.aviationstack.com/v1';
 const url = new URL(`${baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`);
 url.searchParams.set('access_key', accessKey);
 for (const [key, value] of Object.entries(query || {})) {
  if (value !== undefined && value !== null && String(value).trim() !== '') url.searchParams.set(key, String(value));
 }

 markAviationstackCall(endpoint, query);
 try {
  const response = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(Number(process.env.AVIATIONSTACK_TIMEOUT_MS || 12000)) });
  const text = await response.text();
  let payload = null;
  try { payload = JSON.parse(text); } catch { payload = null; }
  const errorMessage = aviationstackErrorMessage(payload);
  if (!response.ok || errorMessage) {
   const reason = errorMessage || `HTTP ${response.status}`;
   if (isAviationstackRateLimitMessage(reason) || response.status === 429) {
    markAviationstackRateLimited(endpoint, reason, query);
    cacheRawAviationstack(rawKey, null, AVIATIONSTACK_RATE_LIMIT_COOLDOWN_MS);
   } else {
    cacheRawAviationstack(rawKey, null, 60_000);
   }
   diagnostics.push({ provider: 'Aviationstack', endpoint, baseUrl, ok: false, status: response.status, reason });
   return null;
  }

  const count = Array.isArray(payload?.data) ? payload.data.length : 0;
  diagnostics.push({ provider: 'Aviationstack', endpoint, baseUrl, ok: true, count });
  return cacheRawAviationstack(rawKey, payload);
 } catch (error) {
  const reason = error?.message || String(error);
  diagnostics.push({ provider: 'Aviationstack', endpoint, baseUrl, ok: false, reason });
  cacheRawAviationstack(rawKey, null, 45_000);
  return null;
 }
}

function todayIsoInBrazil() {
 return todayIsoInTimeZoneServer('America/Sao_Paulo');
}

const AIRPORT_TIMEZONES_SERVER = {
 BSB: 'America/Sao_Paulo', GRU: 'America/Sao_Paulo', CGH: 'America/Sao_Paulo', VCP: 'America/Sao_Paulo', GIG: 'America/Sao_Paulo', SDU: 'America/Sao_Paulo', CNF: 'America/Sao_Paulo', POA: 'America/Sao_Paulo', CWB: 'America/Sao_Paulo', FLN: 'America/Sao_Paulo', VIX: 'America/Sao_Paulo', GYN: 'America/Sao_Paulo',
 MAO: 'America/Manaus', PVH: 'America/Porto_Velho', RBR: 'America/Rio_Branco', CGB: 'America/Cuiaba', BVB: 'America/Boa_Vista', MCP: 'America/Belem', BEL: 'America/Belem', MAB: 'America/Belem', THE: 'America/Fortaleza', SLZ: 'America/Fortaleza', FOR: 'America/Fortaleza', NAT: 'America/Fortaleza', JPA: 'America/Fortaleza', REC: 'America/Recife', MCZ: 'America/Maceio', AJU: 'America/Maceio', SSA: 'America/Bahia',
 MIA: 'America/New_York', JFK: 'America/New_York', MCO: 'America/New_York', EZE: 'America/Argentina/Buenos_Aires', AEP: 'America/Argentina/Buenos_Aires', SCL: 'America/Santiago', LIM: 'America/Lima', BOG: 'America/Bogota', CDG: 'Europe/Paris', MAD: 'Europe/Madrid', FRA: 'Europe/Berlin', LHR: 'Europe/London', LIS: 'Europe/Lisbon'
};

function todayIsoInTimeZoneServer(timeZone = 'America/Sao_Paulo') {
 const now = new Date();
 const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
 const get = (type) => parts.find((item) => item.type === type)?.value || '';
 return `${get('year')}-${get('month')}-${get('day')}`;
}

function todayIsoForAirportServer(airport = 'BSB') {
 const tz = AIRPORT_TIMEZONES_SERVER[String(airport || '').toUpperCase()] || 'America/Sao_Paulo';
 return todayIsoInTimeZoneServer(tz);
}

function ddmmyyyyFromIsoServer(iso = '') {
 const match = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
 return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
}

function trimOfficialBoardTextToRequestedDate(text = '', dateIso = '') {
 const target = ddmmyyyyFromIsoServer(dateIso);
 if (!target) return text;
 const marker = /(Flights?\s+for|Voos?\s+(?:para|do dia|de))\s+(\d{2}\/\d{2}\/\d{4})/ig;
 let match;
 let firstFutureIndex = -1;
 let targetIndex = -1;
 while ((match = marker.exec(text)) !== null) {
  const date = match[2];
  if (date === target && targetIndex < 0) targetIndex = match.index;
  if (date !== target && firstFutureIndex < 0) firstFutureIndex = match.index;
 }
 if (targetIndex >= 0) {
  const rest = text.slice(targetIndex);
  const next = rest.slice(1).search(marker);
  return next >= 0 ? rest.slice(0, next + 1) : rest;
 }
 if (firstFutureIndex > 0) return text.slice(0, firstFutureIndex);
 return text;
}

function aviationstackQueryDate(params) {
 return String(params.date || '').slice(0, 10) || todayIsoInBrazil();
}

async function fetchAviationstackFlightsStatus(params) {
 const designator = primaryFlightDesignator(params);
 if (!designator) return null;
 const baseDate = aviationstackQueryDate(params);
 const cacheKey = `aviationstack:flights:v2:${baseDate}:${designator.token}:${params.origin || ''}:${params.destination || ''}`;
 const cached = cacheGet(flightProviderCache, cacheKey, Number(process.env.AVIATIONSTACK_CACHE_TTL_MS || FLIGHT_PROVIDER_CACHE_TTL_MS));
 if (cached !== null && cached !== undefined) return cached;
 const attempts = [];
 const common = { limit: 25, flight_date: baseDate };
 attempts.push({ ...common, flight_iata: designator.token });
 attempts.push({ ...common, flight_num: designator.flightNumber, airline_iata: designator.carrierCode });
 attempts.push({ ...common, flight_num: designator.flightNumber });
 if (params.origin) attempts.push({ ...common, dep_iata: params.origin, flight_num: designator.flightNumber });
 if (params.destination) attempts.push({ ...common, arr_iata: params.destination, flight_num: designator.flightNumber });
 if (params.origin && params.destination) attempts.push({ ...common, dep_iata: params.origin, arr_iata: params.destination });
 const diagnostics = [];
 for (const query of attempts) {
  const payload = await fetchAviationstackJson('/flights', query, diagnostics);
  const best = pickBestAviationstack(payload?.data, params, designator);
  if (best) {
   const normalized = normalizeAviationstackItem(best, { ...params, date: baseDate }, 'Aviationstack /flights');
   normalized.diagnostics = diagnostics;
   return cacheSet(flightProviderCache, cacheKey, normalized);
  }
 }
 return cacheSet(flightProviderCache, cacheKey, null);
}

function normalizeAviationstackTimetableItem(item, params, type) {
 const part = type === 'departure' ? (item?.departure || {}) : (item?.arrival || {});
 const other = type === 'departure' ? (item?.arrival || {}) : (item?.departure || {});
 const flight = item?.flight || {};
 return {
  ok: true,
  flightNumber: flight.iataNumber || params.flightNumber,
  origin: item?.departure?.iataCode || params.origin,
  destination: item?.arrival?.iataCode || params.destination,
  date: params.date,
  matchedFlight: flight.iataNumber || flight.icaoNumber || params.flightNumber,
  status: normalizeProviderStatus(item?.status),
  gate: part.gate ? String(part.gate).toUpperCase() : null,
  terminal: part.terminal ? String(part.terminal).toUpperCase() : null,
  scheduledTime: normalizeTime(part.scheduledTime),
  confirmedTime: normalizeTime(part.actualTime || part.estimatedTime || part.actualRunway || part.estimatedRunway),
  source: 'Aviationstack /timetable',
  updatedAt: new Date().toISOString(),
  relatedAirport: other?.iataCode || null,
 };
}

async function fetchAviationstackTimetableStatus(params) {
 const designator = primaryFlightDesignator(params);
 if (!designator) return null;
 const baseDate = aviationstackQueryDate(params);
 const airports = [];
 if (params.origin) airports.push({ airport: String(params.origin).toUpperCase(), type: 'departure' });
 if (params.destination) airports.push({ airport: String(params.destination).toUpperCase(), type: 'arrival' });
 if (params.airport) airports.push({ airport: String(params.airport).toUpperCase(), type: params.origin ? 'departure' : 'arrival' });
 const unique = airports.filter((item, index, arr) => item.airport && arr.findIndex((x) => x.airport === item.airport && x.type === item.type) === index);
 if (!unique.length) return null;
 const cacheKey = `aviationstack:timetable:v2:${baseDate}:${unique.map((x) => `${x.airport}-${x.type}`).join(',')}:${designator.token}`;
 const cached = cacheGet(flightProviderCache, cacheKey, Number(process.env.AVIATIONSTACK_CACHE_TTL_MS || FLIGHT_PROVIDER_CACHE_TTL_MS));
 if (cached !== null && cached !== undefined) return cached;
 const diagnostics = [];
 for (const { airport, type } of unique) {
  const attempts = [
   { iataCode: airport, type, limit: 50, flight_iata: designator.token },
   { iataCode: airport, type, limit: 50, flight_num: designator.flightNumber, airline_iata: designator.carrierCode },
   { iataCode: airport, type, limit: 50, flight_num: designator.flightNumber },
  ];
  for (const query of attempts) {
   const payload = await fetchAviationstackJson('/timetable', query, diagnostics);
   const rows = Array.isArray(payload?.data) ? payload.data : [];
   const best = rows.find((item) => normalizeFlightToken(item?.flight?.iataNumber) === designator.token)
    || rows.find((item) => normalizeFlightToken(item?.flight?.iataNumber || '').endsWith(designator.flightNumber))
    || rows.find((item) => String(item?.flight?.number || '') === designator.flightNumber)
    || null;
   if (best) {
    const normalized = normalizeAviationstackTimetableItem(best, { ...params, date: baseDate }, type);
    normalized.diagnostics = diagnostics;
    return cacheSet(flightProviderCache, cacheKey, normalized);
   }
  }
 }
 return cacheSet(flightProviderCache, cacheKey, null);
}


function normalizeAirportBoardTime(value, timeZone) {
 return normalizeTime(value, timeZone) || null;
}

function normalizeAirportBoardStatus(value, type) {
 const raw = String(value || '').toLowerCase();
 if (/última chamada|ultima chamada|last call/.test(raw)) return 'Última chamada';
 if (/embarque|boarding/.test(raw)) return 'Embarque imediato';
 if (/closed|finalizad|encerrado|decol|departed|pousou|landed|arrived/.test(raw)) return 'Voo finalizado';
 const normalized = normalizeProviderStatus(value);
 if (normalized === 'Programado') return 'Confirmado';
 if (normalized === 'Em voo') return 'Voo finalizado';
 if (normalized === 'Pousou') return 'Voo finalizado';
 return normalized;
}

function normalizeAirportBoardAirlineCode(item) {
 const code = String(item?.airline?.iataCode || item?.airline?.iata_code || '').toUpperCase();
 const name = String(item?.airline?.name || item?.airline?.airline_name || '').toUpperCase();
 if (code) return code;
 if (name.includes('LATAM')) return 'LA';
 if (name.includes('GOL')) return 'G3';
 if (name.includes('AZUL')) return 'AD';
 if (name.includes('TAP')) return 'TP';
 if (name.includes('COPA')) return 'CM';
 if (name.includes('AMERICAN')) return 'AA';
 return '';
}

function normalizeAirportBoardAirlineName(code, name) {
 const upperName = String(name || '').trim();
 const normalized = String(code || '').toUpperCase();
 if (upperName) return upperName.replace(/\s+Airlines?$/i, '').replace(/\s+Linhas A[eé]reas.*$/i, '');
 if (['LA', 'JJ', 'TAM'].includes(normalized)) return 'LATAM';
 if (['G3', 'GLO'].includes(normalized)) return 'GOL';
 if (['AD', 'AZU'].includes(normalized)) return 'Azul';
 if (['TP', 'TAP'].includes(normalized)) return 'TAP';
 if (['CM', 'CMP'].includes(normalized)) return 'Copa';
 if (['AA', 'AAL'].includes(normalized)) return 'American';
 return normalized || 'Cia';
}

function formatTicketCurrency(value, currency = 'BRL') {
 const number = Number(value);
 if (!Number.isFinite(number)) return '';
 if (String(currency || 'BRL').toUpperCase() === 'BRL') return `R$ ${number.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
 return `${String(currency || '').toUpperCase()} ${number.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const EXTRA_AIRLINE_LINKS = Object.freeze({
 LA: { label: 'LATAM', url: 'https://passelivre.appslatam.com/#/' },
 JJ: { label: 'LATAM', url: 'https://passelivre.appslatam.com/#/' },
 TAM: { label: 'LATAM', url: 'https://passelivre.appslatam.com/#/' },
 G3: { label: 'GOL', url: 'https://passelivre.voegol.com.br/Login.aspx' },
 GLO: { label: 'GOL', url: 'https://passelivre.voegol.com.br/Login.aspx' },
 AD: { label: 'Azul', url: 'https://passelivre.voeazul.com.br/login' },
 AZU: { label: 'Azul', url: 'https://passelivre.voeazul.com.br/login' },
});

function canonicalExtraAirlineCode(codeOrName) {
 const text = String(codeOrName || '').trim().toUpperCase();
 if (!text) return '';
 if (/^(LA|JJ|TAM)\b/.test(text) || text.includes('LATAM')) return 'LA';
 if (/^(G3|GLO)\b/.test(text) || text.includes('GOL')) return 'G3';
 if (/^(AD|AZU)\b/.test(text) || text.includes('AZUL')) return 'AD';
 return text.replace(/[^A-Z0-9]/g, '').slice(0, 3);
}

function flightSearchLinks(origin, destination, date, carrierCodes = []) {
 const from = String(origin || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
 const to = String(destination || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
 const day = /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) ? String(date) : todayIsoInBrazil();
 const q = encodeURIComponent(`${from} ${to} ${day} passagem aérea`);
 const codes = [...new Set((Array.isArray(carrierCodes) ? carrierCodes : [])
  .map(canonicalExtraAirlineCode)
  .filter(Boolean))];
 const preferred = codes
  .map((code) => EXTRA_AIRLINE_LINKS[code])
  .filter(Boolean);
 const links = preferred.length ? preferred : [EXTRA_AIRLINE_LINKS.LA, EXTRA_AIRLINE_LINKS.G3, EXTRA_AIRLINE_LINKS.AD];
 return [
  ...links.map((link) => ({ label: link.label, url: link.url, kind: 'airline-official' })),
  { label: 'Google Voos', url: `https://www.google.com/travel/flights?q=${q}`, kind: 'price-search' },
 ];
}

function carrierCodesFromExtraLegs(legs = []) {
 const codes = [];
 for (const leg of Array.isArray(legs) ? legs : []) {
  const explicit = canonicalExtraAirlineCode(leg?.airlineCode || leg?.operatingAirlineCode || '');
  if (explicit) codes.push(explicit);
  const fromNumber = canonicalExtraAirlineCode(String(leg?.flightNumber || '').match(/^[A-Z0-9]{2,3}/)?.[0] || '');
  if (fromNumber) codes.push(fromNumber);
  const fromName = canonicalExtraAirlineCode(leg?.airlineName || leg?.operatingAirlineName || '');
  if (fromName) codes.push(fromName);
 }
 return [...new Set(codes)];
}

function durationToMinutes(value) {
 const text = String(value || '');
 const h = text.match(/(\d+)H/i)?.[1];
 const m = text.match(/(\d+)M/i)?.[1];
 if (!h && !m) return 0;
 return Number(h || 0) * 60 + Number(m || 0);
}

function durationLabelFromIso(value) {
 const minutes = durationToMinutes(value);
 if (!minutes) return '';
 const h = Math.floor(minutes / 60);
 const m = minutes % 60;
 return h ? `${h}h${String(m).padStart(2, '0')}` : `${m}min`;
}

function estimateAirfareRange(origin, destination, connections = 0) {
 const from = CREWCHECK_AIRPORT_COORDS[String(origin || '').toUpperCase()];
 const to = CREWCHECK_AIRPORT_COORDS[String(destination || '').toUpperCase()];
 const km = from && to ? haversineKm(from, to) : 650;
 const base = Math.max(289, Math.round(210 + km * 0.42 + connections * 130));
 const low = Math.round(base * 0.9 / 10) * 10;
 const high = Math.round(base * (connections ? 1.55 : 1.35) / 10) * 10;
 return {
  label: `${formatTicketCurrency(low, 'BRL').replace(',00','')}–${formatTicketCurrency(high, 'BRL').replace(',00','')}`,
  source: 'estimativa CrewCheck por distância · confirmar no app/site da companhia',
  confidence: 'estimativa de referência',
 };
}


function dateDaysBetween(baseDateIso, otherDateIso) {
 if (!/^\d{4}-\d{2}-\d{2}$/.test(String(baseDateIso || '')) || !/^\d{4}-\d{2}-\d{2}$/.test(String(otherDateIso || ''))) return 0;
 const [by, bm, bd] = String(baseDateIso).split('-').map(Number);
 const [oy, om, od] = String(otherDateIso).split('-').map(Number);
 const base = Date.UTC(by, bm - 1, bd);
 const other = Date.UTC(oy, om - 1, od);
 return Math.max(0, Math.round((other - base) / 86400000));
}

function clockWithDateOffset(clock, baseDateIso, actualDateIso) {
 const normalized = normalizeTime(clock) || String(clock || '').match(/\b([0-2]?\d:[0-5]\d)\b/)?.[1] || '—';
 if (normalized === '—') return normalized;
 const offset = dateDaysBetween(baseDateIso, actualDateIso);
 return `${normalized}${offset ? `+${offset}` : ''}`;
}

function googleFlightCarrierCodeFromNumber(value, airlineName = '') {
 const token = String(value || '').replace(/\s+/g, '').toUpperCase();
 const match = token.match(/^([A-Z0-9]{2,3})\d+/);
 if (match) return match[1];
 const name = String(airlineName || '').toLowerCase();
 if (name.includes('latam') || name.includes('tam')) return 'LA';
 if (name.includes('gol')) return 'G3';
 if (name.includes('azul')) return 'AD';
 return '';
}

function normalizeGoogleFlightNumber(value) {
 const text = String(value || '').trim().toUpperCase();
 if (!text) return '';
 const compact = text.replace(/\s+/g, '');
 const match = compact.match(/^([A-Z0-9]{2,3})(\d{1,5}[A-Z]?)$/);
 return match ? `${match[1]}${match[2]}` : compact;
}

function parseSearchApiPrice(value, currency = 'BRL') {
 if (value === undefined || value === null || value === '') return '';
 if (typeof value === 'number') return formatTicketCurrency(value, currency);
 const text = String(value || '').trim();
 if (!text) return '';
 const num = Number(text.replace(/[^0-9.,]/g, '').replace(/\.(?=\d{3})/g, '').replace(',', '.'));
 if (Number.isFinite(num)) return formatTicketCurrency(num, currency);
 return text;
}

function makeSearchApiLegDateTime(dateIso, clock) {
 const date = /^\d{4}-\d{2}-\d{2}$/.test(String(dateIso || '')) ? String(dateIso) : '';
 const time = normalizeTime(clock) || String(clock || '').match(/\b([0-2]?\d:[0-5]\d)\b/)?.[1] || '';
 if (!date || !time) return null;
 const [hour, minute] = time.split(':').map(Number);
 return new Date(`${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00-03:00`);
}

function latestAllowedArrivalFromTargetIso(targetIso) {
 const target = new Date(String(targetIso || ''));
 if (!Number.isFinite(target.getTime())) return null;
 return new Date(target.getTime() - 55 * 60 * 1000);
}

function optionArrivesBeforeTarget(option, targetIso) {
 const latestAllowed = latestAllowedArrivalFromTargetIso(targetIso);
 if (!latestAllowed) return true;
 const lastLeg = Array.isArray(option?.legs) ? option.legs[option.legs.length - 1] : null;
 const arrivalDate = lastLeg?.arrivalDate || option?.arrivalDate || option?.selectedDate;
 const arrivalClock = String(lastLeg?.arrival || option?.arriveAt || '').replace(/\+\d+$/, '');
 const arrival = makeSearchApiLegDateTime(arrivalDate, arrivalClock);
 if (!arrival || !Number.isFinite(arrival.getTime())) return true;
 return arrival.getTime() <= latestAllowed.getTime();
}

function normalizeSearchApiFlightOffer(item, query, bucketLabel = 'Melhor opção') {
 const flights = Array.isArray(item?.flights) ? item.flights : [];
 if (!flights.length) return null;
 const baseDate = query.date;
 const legs = flights.map((flight, index) => {
  const dep = flight?.departure_airport || {};
  const arr = flight?.arrival_airport || {};
  const flightNumber = normalizeGoogleFlightNumber(flight?.flight_number || '');
  const carrierCode = googleFlightCarrierCodeFromNumber(flightNumber, flight?.airline || '');
  const depDate = String(dep.date || String(dep.time || '').match(/\d{4}-\d{2}-\d{2}/)?.[0] || baseDate || '').slice(0, 10);
  const arrDate = String(arr.date || String(arr.time || '').match(/\d{4}-\d{2}-\d{2}/)?.[0] || depDate || baseDate || '').slice(0, 10);
  const extensions = Array.isArray(flight?.extensions) ? flight.extensions.filter(Boolean).join(' · ') : '';
  return {
   label: `Trecho ${index + 1}`,
   flightNumber,
   airlineName: flight?.airline || normalizeAirportBoardAirlineName(carrierCode, ''),
   airlineCode: carrierCode || null,
   operatingAirlineName: flight?.airline || null,
   operatingAirlineCode: carrierCode || null,
   origin: String(dep.id || '').toUpperCase(),
   destination: String(arr.id || '').toUpperCase(),
   departure: clockWithDateOffset(dep.time, baseDate, depDate),
   arrival: clockWithDateOffset(arr.time, baseDate, arrDate),
   departureDate: depDate,
   arrivalDate: arrDate,
   terminal: dep.terminal || arr.terminal || 'não informado',
   gate: 'não informado',
   status: flight?.is_often_delayed ? 'Atenção: costuma atrasar' : 'Programado',
   source: 'Google Flights via SearchAPI',
   aircraft: flight?.airplane || 'não informado',
   duration: flight?.duration ? `${Math.round(Number(flight.duration))} min` : 'não informado',
   cabin: flight?.travel_class || 'Economy',
   baggage: item?.extensions?.join?.(' · ') || extensions || 'validar no canal da companhia',
   note: extensions || (flightNumber ? 'Voo retornado pela busca estruturada do Google Flights.' : 'Número de voo não retornado pelo provedor.'),
  };
 }).filter((leg) => leg.origin && leg.destination);
 if (!legs.length) return null;
 const route = legs.map((leg) => leg.origin).concat(legs[legs.length - 1].destination).join(' → ');
 const carriers = [...new Set(legs.map((leg) => `${leg.airlineName || 'Cia'}${leg.flightNumber ? ` · ${leg.flightNumber}` : ''}`))].join(' + ');
 const totalDuration = Number(item?.total_duration || legs.reduce((sum, leg) => sum + (Number(String(leg.duration || '').match(/\d+/)?.[0]) || 0), 0)) || 0;
 const priceLabel = parseSearchApiPrice(item?.price, query.currency || 'BRL') || null;
 const layovers = Array.isArray(item?.layovers) ? item.layovers : [];
 const connection = layovers.map((layover) => layover?.id || layover?.name).filter(Boolean).join(' / ') || (legs.length > 1 ? legs.slice(0, -1).map((leg) => leg.destination).join(' / ') : undefined);
 const soldBy = [...new Set(flights.flatMap((flight) => Array.isArray(flight?.ticket_also_sold_by) ? flight.ticket_also_sold_by : []))].slice(0, 4).join(', ');
 const hiddenReason = item?.type ? String(item.type) : (legs.length > 1 ? 'one way com conexão' : 'one way direto');
 return {
  kind: legs.length > 1 ? 'connection' : 'direct',
  title: legs.length > 1 ? `${bucketLabel} · conexão cabível` : `${bucketLabel} · direto`,
  route,
  carriers,
  leaveAt: legs[0]?.departure || '—',
  arriveAt: legs[legs.length - 1]?.arrival || '—',
  arrivalDate: legs[legs.length - 1]?.arrivalDate || query.date,
  durationMinutes: totalDuration,
  connection,
  confidence: 'Google Flights estruturado · validar emissão no canal da companhia',
  source: 'Google Flights via SearchAPI',
  selectedDate: query.date,
  priceLabel,
  priceSource: priceLabel ? 'Google Flights via SearchAPI · valor pode mudar até emissão' : 'Preço não retornado; consultar companhia',
  priceConfidence: priceLabel ? 'tarifa online de referência' : 'consultar companhia',
  seatsAvailable: null,
  baggage: item?.extensions?.join?.(' · ') || 'validar franquia e assento na companhia',
  bookingLinks: flightSearchLinks(query.origin, query.destination, query.date, carrierCodesFromExtraLegs(legs)),
  rawProvider: 'SearchAPI.io Google Flights',
  bookingToken: item?.booking_token || null,
  departureToken: item?.departure_token || null,
  details: `Opção ${hiddenReason} para ${route}. ${soldBy ? `Também vendida/operada por: ${soldBy}. ` : ''}Use como referência operacional e confirme emissão, assento, regra de passagem e bagagem no canal da companhia.`,
  advisory: 'Informação de voo/tarifa vem do Google Flights via SearchAPI; a emissão oficial deve ser confirmada no canal da companhia antes de usar para deslocamento.',
  legs,
 };
}


async function findRadarBoardRowForExtraLeg(leg, option = {}) {
 const flight = normalizeGoogleFlightNumber(leg?.flightNumber || '');
 if (!flight) return null;
 const date = radarIsoDate(leg?.departureDate || option?.selectedDate || option?.date || todayIsoInBrazil());
 const candidates = [];
 if (leg?.origin) candidates.push({ airport: String(leg.origin).toUpperCase(), type: 'departure', airline: '', date });
 if (leg?.destination) candidates.push({ airport: String(leg.destination).toUpperCase(), type: 'arrival', airline: '', date });
 for (const params of candidates) {
  const cached = await readAirportBoardDbCache(params).catch(() => null);
  const rows = Array.isArray(cached?.rows) ? cached.rows : [];
  const found = rows.find((row) => normalizeFlightToken(row.flightNumber || '') === flight || flightNumberVariants(row.flightNumber || '').includes(flight));
  if (found) {
   return {
    ok: true,
    flightNumber: found.flightNumber || flight,
    origin: found.origin || leg.origin,
    destination: found.destination || leg.destination,
    date,
    status: found.status || 'Programado',
    gate: found.gate || null,
    terminal: found.terminal || null,
    scheduledTime: found.scheduledTime || null,
    confirmedTime: found.confirmedTime || null,
    source: `${found.source || cached?.source || 'Radar CrewCheck cache'} · cache compartilhado`,
    updatedAt: cached?.updatedAt || new Date().toISOString(),
   };
  }
 }
 return null;
}

async function enrichExtraOptionWithRadar(option) {
 if (!SEARCHAPI_EXTRA_ENRICH_RADAR || !option?.legs?.length) return option;
 const enrichedLegs = [];
 for (const leg of option.legs.slice(0, 3)) {
  const flight = normalizeGoogleFlightNumber(leg.flightNumber || '');
  if (!flight || !leg.origin || !leg.destination) {
   enrichedLegs.push(leg);
   continue;
  }
  try {
   const cachedBoardStatus = await findRadarBoardRowForExtraLeg(leg, option);
   const status = cachedBoardStatus || await getFlightStatusSnapshot({
    flightNumber: flight,
    origin: leg.origin,
    destination: leg.destination,
    date: leg.departureDate || option.selectedDate,
   });
   enrichedLegs.push({
    ...leg,
    terminal: status?.terminal || leg.terminal || 'não informado',
    gate: status?.gate || leg.gate || 'não informado',
    status: status?.status || leg.status || 'Programado',
    source: status?.source && isMoreUsefulFlightStatus(status) ? `${leg.source} + ${status.source}` : leg.source,
    note: status?.source && isMoreUsefulFlightStatus(status) ? `${leg.note || ''} Status/portão consultados no Radar CrewCheck.`.trim() : leg.note,
   });
  } catch {
   enrichedLegs.push(leg);
  }
 }
 if (option.legs.length > enrichedLegs.length) enrichedLegs.push(...option.legs.slice(enrichedLegs.length));
 return { ...option, legs: enrichedLegs };
}


function relabelGoogleFlightProvider(option, providerLabel, rawProvider) {
 if (!option) return option;
 const legs = Array.isArray(option.legs) ? option.legs.map((leg) => ({
  ...leg,
  source: String(leg.source || '').replace(/Google Flights via SearchAPI/g, providerLabel) || providerLabel,
  note: String(leg.note || '').replace(/SearchAPI/g, rawProvider || providerLabel),
 })) : [];
 return {
  ...option,
  source: providerLabel,
  confidence: String(option.confidence || '').replace(/Google Flights estruturado/g, `${providerLabel} estruturado`) || `${providerLabel} estruturado · validar emissão no canal da companhia`,
  priceSource: option.priceLabel ? `${providerLabel} · valor pode mudar até emissão` : 'Preço não retornado; consultar companhia',
  rawProvider: rawProvider || providerLabel,
  details: String(option.details || '').replace(/SearchAPI/g, rawProvider || providerLabel),
  advisory: `Informação de voo/tarifa vem do ${providerLabel}; a emissão oficial deve ser confirmada no canal da companhia antes de usar para deslocamento.`,
  legs,
 };
}

function normalizeSerpApiFlightOffer(item, query, bucketLabel = 'Melhor opção') {
 return relabelGoogleFlightProvider(
  normalizeSearchApiFlightOffer(item, query, bucketLabel),
  'Google Flights via SerpAPI',
  'SerpAPI Google Flights'
 );
}

async function fetchSerpApiExtraFlightOptions(query) {
 const origin = normalizeAirportCode(query.origin, '').toUpperCase();
 const destination = normalizeAirportCode(query.destination, '').toUpperCase();
 const date = /^\d{4}-\d{2}-\d{2}$/.test(String(query.date || '')) ? String(query.date) : todayIsoInBrazil();
 const currency = String(query.currency || 'BRL').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) || 'BRL';
 const adults = Math.max(1, Math.min(Number(query.adults || 1) || 1, 9));
 const limit = Math.min(Math.max(Number(query.limit || 12), 3), 20);
 const diagnostics = [];
 if (!SERPAPI_EXTRA_ENABLED) return { ok: true, options: [], source: 'SerpAPI desativada', diagnostics };
 if (!SERPAPI_API_KEY) return { ok: true, options: [], source: 'SerpAPI não configurada', message: 'Configure SERPAPI_API_KEY no Render.', diagnostics };
 const cacheKey = `serpapi-google-flights-v108119:${origin}:${destination}:${date}:${currency}:${adults}:${limit}:${query.targetIso || ''}`;
 const cached = cacheGet(flightProviderCache, cacheKey, Number(process.env.SERPAPI_EXTRA_CACHE_TTL_MS || 10 * 60 * 1000));
 if (cached) return cached;
 try {
  const url = new URL(SERPAPI_API_BASE);
  url.searchParams.set('engine', 'google_flights');
  url.searchParams.set('type', '2');
  url.searchParams.set('departure_id', origin);
  url.searchParams.set('arrival_id', destination);
  url.searchParams.set('outbound_date', date);
  url.searchParams.set('currency', currency);
  url.searchParams.set('gl', 'br');
  url.searchParams.set('hl', 'pt-BR');
  url.searchParams.set('adults', String(adults));
  url.searchParams.set('stops', query.nonStopOnly ? '1' : '0');
  url.searchParams.set('sort_by', '1');
  url.searchParams.set('show_hidden', 'true');
  url.searchParams.set('deep_search', String(process.env.SERPAPI_DEEP_SEARCH || 'false').toLowerCase() === 'true' ? 'true' : 'false');
  url.searchParams.set('api_key', SERPAPI_API_KEY);
  if (SERPAPI_EXTRA_INCLUDED_AIRLINES) url.searchParams.set('include_airlines', SERPAPI_EXTRA_INCLUDED_AIRLINES);
  const latestArrival = latestAllowedArrivalFromTargetIso(query.targetIso);
  if (latestArrival) {
   const hour = Math.max(0, Math.min(23, latestArrival.getHours()));
   url.searchParams.set('outbound_times', `0,23,0,${hour}`);
  }
  const response = await fetch(url, {
   headers: { accept: 'application/json', 'user-agent': 'CrewCheck/10.8.131 Google Flights' },
   signal: AbortSignal.timeout(Number(process.env.SERPAPI_TIMEOUT_MS || 18_000)),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.error) throw new Error(payload?.error || payload?.message || payload?.search_metadata?.status || `SERPAPI_HTTP_${response.status}`);
  diagnostics.push({ provider: 'SerpAPI Google Flights', ok: true, best: Array.isArray(payload?.best_flights) ? payload.best_flights.length : 0, other: Array.isArray(payload?.other_flights) ? payload.other_flights.length : 0, status: payload?.search_metadata?.status || 'Success' });
  const best = (Array.isArray(payload?.best_flights) ? payload.best_flights : []).map((item) => normalizeSerpApiFlightOffer(item, { origin, destination, date, currency }, 'Melhor opção')).filter(Boolean);
  const other = (Array.isArray(payload?.other_flights) ? payload.other_flights : []).map((item) => normalizeSerpApiFlightOffer(item, { origin, destination, date, currency }, 'Opção oficial')).filter(Boolean);
  let options = [...best, ...other]
   .filter((item) => optionArrivesBeforeTarget(item, query.targetIso))
   .sort((a, b) => {
    const aBest = /^Melhor opção/i.test(String(a.title || '')) ? 0 : 1;
    const bBest = /^Melhor opção/i.test(String(b.title || '')) ? 0 : 1;
    const aDirect = a.kind === 'direct' ? 0 : 1;
    const bDirect = b.kind === 'direct' ? 0 : 1;
    const aDur = Number(a.durationMinutes || 999999);
    const bDur = Number(b.durationMinutes || 999999);
    return aBest - bBest || aDirect - bDirect || aDur - bDur;
   });
  const seen = new Set();
  options = options.filter((item) => {
   const key = `${(item.legs || []).map((leg) => leg.flightNumber).join('+')}|${item.route}|${item.leaveAt}|${item.arriveAt}`;
   if (seen.has(key)) return false;
   seen.add(key);
   return true;
  }).slice(0, limit);
  const enriched = [];
  for (const option of options.slice(0, Math.min(options.length, Number(process.env.SERPAPI_EXTRA_ENRICH_LIMIT || process.env.SEARCHAPI_EXTRA_ENRICH_LIMIT || 5)))) {
   enriched.push(await enrichExtraOptionWithRadar(option));
  }
  if (options.length > enriched.length) enriched.push(...options.slice(enriched.length));
  const result = {
   ok: true,
   origin,
   destination,
   date,
   options: enriched,
   source: enriched.length ? 'Google Flights via SerpAPI + companhias' : 'SerpAPI sem opção cabível',
   message: enriched.length ? `${enriched.length} opção(ões) oficiais com companhia, número de voo, conexões e tarifa de referência.` : 'A SerpAPI não retornou opção cabível para a apresentação; o CrewCheck tentará SearchAPI/Amadeus sem travar o Vivo de Extra.',
   diagnostics,
   providerStatus: { serpapi: true, searchapi: Boolean(SEARCHAPI_API_KEY), ...radarProviderStatus() },
   updatedAt: new Date().toISOString(),
  };
  return cacheSet(flightProviderCache, cacheKey, result);
 } catch (error) {
  diagnostics.push({ provider: 'SerpAPI Google Flights', ok: false, reason: error?.message || String(error) });
  return cacheSet(flightProviderCache, cacheKey, {
   ok: true,
   origin,
   destination,
   date,
   options: [],
   source: 'SerpAPI indisponível',
   message: 'SerpAPI/Google Flights não respondeu agora; o CrewCheck tentará SearchAPI/Amadeus/estimativas sem travar o Vivo de Extra.',
   diagnostics,
   providerStatus: { serpapi: Boolean(SERPAPI_API_KEY), searchapi: Boolean(SEARCHAPI_API_KEY), ...radarProviderStatus() },
   updatedAt: new Date().toISOString(),
   error: error?.message || String(error),
  }, 90_000);
 }
}

async function fetchSearchApiExtraFlightOptions(query) {
 const origin = normalizeAirportCode(query.origin, '').toUpperCase();
 const destination = normalizeAirportCode(query.destination, '').toUpperCase();
 const date = /^\d{4}-\d{2}-\d{2}$/.test(String(query.date || '')) ? String(query.date) : todayIsoInBrazil();
 const currency = String(query.currency || 'BRL').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) || 'BRL';
 const adults = Math.max(1, Math.min(Number(query.adults || 1) || 1, 9));
 const limit = Math.min(Math.max(Number(query.limit || 12), 3), 20);
 const diagnostics = [];
 if (!SEARCHAPI_EXTRA_ENABLED) return { ok: true, options: [], source: 'SearchAPI desativada', diagnostics };
 if (!SEARCHAPI_API_KEY) return { ok: true, options: [], source: 'SearchAPI não configurada', message: 'Configure SEARCHAPI_API_KEY no Render.', diagnostics };
 const cacheKey = `searchapi-google-flights-v108119:${origin}:${destination}:${date}:${currency}:${adults}:${limit}:${query.targetIso || ''}`;
 const cached = cacheGet(flightProviderCache, cacheKey, Number(process.env.SEARCHAPI_EXTRA_CACHE_TTL_MS || 10 * 60 * 1000));
 if (cached) return cached;
 try {
  const url = new URL(SEARCHAPI_API_BASE);
  url.searchParams.set('engine', 'google_flights');
  url.searchParams.set('flight_type', 'one_way');
  url.searchParams.set('departure_id', origin);
  url.searchParams.set('arrival_id', destination);
  url.searchParams.set('outbound_date', date);
  url.searchParams.set('currency', currency);
  url.searchParams.set('gl', 'br');
  url.searchParams.set('hl', 'pt-BR');
  url.searchParams.set('adults', String(adults));
  url.searchParams.set('stops', query.nonStopOnly ? 'nonstop' : 'any');
  url.searchParams.set('sort_by', 'top_flights');
  url.searchParams.set('show_hidden_flights', 'true');
  url.searchParams.set('separate_tickets', '0');
  if (SEARCHAPI_EXTRA_INCLUDED_AIRLINES) url.searchParams.set('included_airlines', SEARCHAPI_EXTRA_INCLUDED_AIRLINES);
  const latestArrival = latestAllowedArrivalFromTargetIso(query.targetIso);
  if (latestArrival) {
   const hour = Math.max(0, Math.min(23, latestArrival.getHours()));
   url.searchParams.set('outbound_times', `0,23,0,${hour}`);
  }
  const response = await fetch(url, {
   headers: { authorization: `Bearer ${SEARCHAPI_API_KEY}`, accept: 'application/json', 'user-agent': 'CrewCheck/10.8.121 SearchAPI Google Flights' },
   signal: AbortSignal.timeout(Number(process.env.SEARCHAPI_TIMEOUT_MS || 18_000)),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || payload?.message || payload?.search_metadata?.status || `SEARCHAPI_HTTP_${response.status}`);
  diagnostics.push({ provider: 'SearchAPI Google Flights', ok: true, best: Array.isArray(payload?.best_flights) ? payload.best_flights.length : 0, other: Array.isArray(payload?.other_flights) ? payload.other_flights.length : 0 });
  const best = (Array.isArray(payload?.best_flights) ? payload.best_flights : []).map((item) => normalizeSearchApiFlightOffer(item, { origin, destination, date, currency }, 'Melhor opção')).filter(Boolean);
  const other = (Array.isArray(payload?.other_flights) ? payload.other_flights : []).map((item) => normalizeSearchApiFlightOffer(item, { origin, destination, date, currency }, 'Opção oficial')).filter(Boolean);
  const cheapest = (Array.isArray(payload?.cheapest_flights) ? payload.cheapest_flights : []).map((item) => normalizeSearchApiFlightOffer(item, { origin, destination, date, currency }, 'Opção econômica')).filter(Boolean);
  let options = [...best, ...other, ...cheapest]
   .filter((item) => optionArrivesBeforeTarget(item, query.targetIso))
   .sort((a, b) => {
    const aDirect = a.kind === 'direct' ? 0 : 1;
    const bDirect = b.kind === 'direct' ? 0 : 1;
    const aDur = Number(a.durationMinutes || 999999);
    const bDur = Number(b.durationMinutes || 999999);
    return aDirect - bDirect || aDur - bDur;
   });
  const seen = new Set();
  options = options.filter((item) => {
   const key = `${(item.legs || []).map((leg) => leg.flightNumber).join('+')}|${item.route}|${item.leaveAt}|${item.arriveAt}`;
   if (seen.has(key)) return false;
   seen.add(key);
   return true;
  }).slice(0, limit);
  const enriched = [];
  for (const option of options.slice(0, Math.min(options.length, Number(process.env.SEARCHAPI_EXTRA_ENRICH_LIMIT || 5)))) {
   enriched.push(await enrichExtraOptionWithRadar(option));
  }
  if (options.length > enriched.length) enriched.push(...options.slice(enriched.length));
  const result = {
   ok: true,
   origin,
   destination,
   date,
   options: enriched,
   source: enriched.length ? 'Google Flights via SearchAPI + companhias' : 'SearchAPI sem opção cabível',
   message: enriched.length ? `${enriched.length} opção(ões) com companhia, número de voo, conexões e tarifa de referência.` : 'A SearchAPI não retornou opção cabível para a apresentação; mantendo estimativas locais e/ou Amadeus se configurado.',
   diagnostics,
   providerStatus: { searchapi: true, ...radarProviderStatus() },
   updatedAt: new Date().toISOString(),
  };
  return cacheSet(flightProviderCache, cacheKey, result);
 } catch (error) {
  diagnostics.push({ provider: 'SearchAPI Google Flights', ok: false, reason: error?.message || String(error) });
  return cacheSet(flightProviderCache, cacheKey, {
   ok: true,
   origin,
   destination,
   date,
   options: [],
   source: 'SearchAPI indisponível',
   message: 'SearchAPI/Google Flights não respondeu agora; o CrewCheck tentará Amadeus/estimativas sem travar o Vivo de Extra.',
   diagnostics,
   providerStatus: { searchapi: Boolean(SEARCHAPI_API_KEY), ...radarProviderStatus() },
   updatedAt: new Date().toISOString(),
   error: error?.message || String(error),
  });
 }
}

function normalizeExtraFlightOffer(item, dictionaries, query) {
 const itinerary = Array.isArray(item?.itineraries) ? item.itineraries[0] : null;
 const segments = Array.isArray(itinerary?.segments) ? itinerary.segments : [];
 if (!segments.length) return null;
 const first = segments[0];
 const last = segments[segments.length - 1];
 const price = item?.price || {};
 const currency = price.currency || query.currency || 'BRL';
 const priceTotal = price.grandTotal || price.total || price.base;
 const traveler = Array.isArray(item?.travelerPricings) ? item.travelerPricings[0] : null;
 const fareDetails = Array.isArray(traveler?.fareDetailsBySegment) ? traveler.fareDetailsBySegment : [];
 const legs = segments.map((segment, index) => {
  const carrier = String(segment.carrierCode || '').toUpperCase();
  const operating = String(segment.operating?.carrierCode || carrier || '').toUpperCase();
  const fare = fareDetails.find((row) => String(row.segmentId || '') === String(segment.id || '')) || fareDetails[index] || {};
  const includedBags = fare.includedCheckedBags || fare.includedCabinBags || {};
  const baggage = includedBags.quantity !== undefined ? `${includedBags.quantity} volume(s)` : (includedBags.weight ? `${includedBags.weight}${includedBags.weightUnit || 'kg'}` : 'validar regra tarifária');
  return {
   label: `Trecho ${index + 1}`,
   flightNumber: `${carrier}${String(segment.number || '').trim()}`.toUpperCase(),
   airlineName: normalizeAirportBoardAirlineName(carrier, dictionaries?.carriers?.[carrier] || ''),
   airlineCode: carrier,
   operatingAirlineName: normalizeAirportBoardAirlineName(operating, dictionaries?.carriers?.[operating] || ''),
   operatingAirlineCode: operating,
   origin: String(segment.departure?.iataCode || '').toUpperCase(),
   destination: String(segment.arrival?.iataCode || '').toUpperCase(),
   departure: normalizeTime(segment.departure?.at) || '—',
   arrival: normalizeTime(segment.arrival?.at) || '—',
   terminal: segment.departure?.terminal || segment.arrival?.terminal || 'não informado',
   gate: 'não informado',
   status: 'Disponível para busca',
   source: 'Amadeus Flight Offers',
   aircraft: segment.aircraft?.code || 'não informado',
   duration: durationLabelFromIso(segment.duration) || 'não informado',
   cabin: fare.cabin || traveler?.travelerType || 'Econômica',
   bookingClass: fare.class || '',
   baggage,
   note: segment.number ? 'Número de voo retornado pela busca tarifária.' : 'Número de voo não retornado pelo provedor.',
  };
 });
 const route = legs.map((leg) => leg.origin).concat(legs[legs.length - 1].destination).join(' → ');
 const carriers = [...new Set(legs.map((leg) => `${leg.airlineName}${leg.flightNumber ? ` · ${leg.flightNumber}` : ''}`))].join(' + ');
 const durationMinutes = durationToMinutes(itinerary?.duration) || 0;
 const priceLabel = formatTicketCurrency(priceTotal, currency) || null;
 const connection = legs.length > 1 ? legs.slice(0, -1).map((leg) => leg.destination).join(' / ') : undefined;
 return {
  kind: legs.length > 1 ? 'connection' : 'direct',
  title: legs.length > 1 ? 'Vivo de Extra com conexão · tarifa encontrada' : 'Vivo de Extra direto · tarifa encontrada',
  route,
  carriers,
  leaveAt: legs[0]?.departure || '—',
  arriveAt: legs[legs.length - 1]?.arrival || '—',
  durationMinutes,
  connection,
  confidence: priceLabel ? 'tarifa encontrada · confirmar disponibilidade no canal oficial' : 'voo encontrado · preço indisponível',
  source: 'Amadeus Flight Offers',
  selectedDate: query.date,
  priceLabel,
  priceSource: priceLabel ? 'Amadeus Flight Offers · valor sujeito a alteração até emissão' : 'preço não retornado pelo provedor',
  priceConfidence: priceLabel ? 'tarifa online' : 'consultar companhia',
  seatsAvailable: Number(item?.numberOfBookableSeats || 0) || null,
  baggage: legs.map((leg) => leg.baggage).filter(Boolean).join(' · ') || 'validar regra tarifária',
  bookingLinks: flightSearchLinks(query.origin, query.destination, query.date, carrierCodesFromExtraLegs(legs)),
  rawProvider: 'Amadeus',
  details: `Opção tarifária para ${route}. Inclui companhia, número de voo, horários, tarifa e bagagem quando o provedor retorna.`,
  advisory: 'Confirme aceitação do Vivo de Extra, emissão, franquia, conexão, check-in e regras de bagagem antes de usar.',
  legs,
 };
}


function extraOptionDateTimeFromLeg(leg, field, fallbackDate) {
 const clock = field === 'arrival' ? leg?.arrival : leg?.departure;
 const date = field === 'arrival' ? (leg?.arrivalDate || fallbackDate) : (leg?.departureDate || fallbackDate);
 return makeSearchApiLegDateTime(date, String(clock || '').replace(/\+\d+$/, ''));
}

function minutesBetweenDates(a, b) {
 if (!a || !b || !Number.isFinite(a.getTime()) || !Number.isFinite(b.getTime())) return null;
 return Math.round((b.getTime() - a.getTime()) / 60000);
}

function normalizeExtraConnectionHubList(origin, destination) {
 const base = String(process.env.EXTRA_FLIGHT_CONNECTION_HUBS || 'GRU,CGH,VCP,CNF,SDU,GIG,SSA,REC,FOR,POA').toUpperCase().split(',').map((item) => item.trim()).filter(Boolean);
 const from = normalizeAirportCode(origin, '').toUpperCase();
 const to = normalizeAirportCode(destination, '').toUpperCase();
 const seen = new Set();
 return base.filter((hub) => {
  if (hub === from || hub === to || seen.has(hub)) return false;
  seen.add(hub);
  return true;
 }).slice(0, Math.max(2, Math.min(Number(process.env.EXTRA_FLIGHT_CONNECTION_HUB_LIMIT || 5), 9)));
}

function composeRealConnectionOption(firstOption, secondOption, query, hub) {
 const firstLeg = Array.isArray(firstOption?.legs) ? firstOption.legs[firstOption.legs.length - 1] : null;
 const secondLeg = Array.isArray(secondOption?.legs) ? secondOption.legs[0] : null;
 if (!firstLeg || !secondLeg) return null;
 const firstArrival = extraOptionDateTimeFromLeg(firstLeg, 'arrival', firstOption.selectedDate || query.date);
 const secondDeparture = extraOptionDateTimeFromLeg(secondLeg, 'departure', secondOption.selectedDate || query.date);
 const connect = minutesBetweenDates(firstArrival, secondDeparture);
 const minConnect = Math.max(35, Number(process.env.EXTRA_FLIGHT_MIN_CONNECTION_MINUTES || 55));
 const maxConnect = Math.max(minConnect + 30, Number(process.env.EXTRA_FLIGHT_MAX_CONNECTION_MINUTES || 300));
 if (connect === null || connect < minConnect || connect > maxConnect) return null;
 const secondArrival = extraOptionDateTimeFromLeg(secondOption.legs[secondOption.legs.length - 1], 'arrival', secondOption.selectedDate || query.date);
 const latestArrival = latestAllowedArrivalFromTargetIso(query.targetIso);
 if (latestArrival && secondArrival && secondArrival.getTime() > latestArrival.getTime()) return null;
 const legs = [...(firstOption.legs || []), ...(secondOption.legs || [])].map((leg, index) => ({ ...leg, label: `Trecho ${index + 1}` }));
 const route = legs.map((leg) => leg.origin).concat(legs[legs.length - 1].destination).join(' → ');
 const carriers = [...new Set(legs.map((leg) => `${leg.airlineName || 'Cia'}${leg.flightNumber ? ` · ${leg.flightNumber}` : ''}`))].join(' + ');
 const durationMinutes = Math.max(0, Math.round((secondArrival?.getTime?.() - extraOptionDateTimeFromLeg(legs[0], 'departure', query.date)?.getTime?.()) / 60000)) || ((firstOption.durationMinutes || 0) + connect + (secondOption.durationMinutes || 0));
 const prices = [firstOption.priceLabel, secondOption.priceLabel].filter(Boolean).join(' + ');
 return {
  kind: 'connection',
  title: 'Conexão real cabível',
  route,
  carriers,
  leaveAt: legs[0]?.departure || firstOption.leaveAt || '—',
  arriveAt: legs[legs.length - 1]?.arrival || secondOption.arriveAt || '—',
  arrivalDate: legs[legs.length - 1]?.arrivalDate || query.date,
  durationMinutes,
  connection: hub,
  confidence: `conexão real montada com ${connect} min em ${hub} · validar emissão e regras entre companhias`,
  source: `${firstOption.source || 'Google Flights'} + ${secondOption.source || 'Google Flights'}`,
  selectedDate: query.date,
  priceLabel: prices || null,
  priceSource: prices ? 'Soma de tarifas de referência por trecho · confirmar na companhia' : 'Preço por trecho não retornado; confirmar na companhia',
  priceConfidence: prices ? 'tarifas reais por trecho' : 'consulta oficial necessária',
  baggage: 'validar bagagem, conexão protegida e troca de companhia antes de aceitar',
  bookingLinks: flightSearchLinks(query.origin, query.destination, query.date, carrierCodesFromExtraLegs(legs)),
  rawProvider: 'Conexão real CrewCheck via provedores Google Flights',
  details: `Conexão cabível via ${hub}, montada com voos reais retornados pelos provedores. Pode envolver companhias diferentes; valide emissão, check-in, bagagem, terminal e tempo mínimo de conexão antes de usar.`,
  advisory: 'Conexão entre companhias congêneres pode não ser protegida. Use apenas depois de confirmar bilhete, bagagem, assento, terminal e política do Vivo de Extra.',
  legs,
 };
}

function dedupeExtraFlightOptionsServer(options = []) {
 const seen = new Set();
 return (Array.isArray(options) ? options : []).filter((item) => {
  const key = `${(item.legs || []).map((leg) => normalizeGoogleFlightNumber(leg.flightNumber || '')).join('+')}|${item.route}|${item.leaveAt}|${item.arriveAt}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
 });
}

function sortExtraFlightOptionsForPresentation(options = []) {
 return [...(Array.isArray(options) ? options : [])].sort((a, b) => {
  const aBest = /^Melhor opção/i.test(String(a.title || '')) ? 0 : 1;
  const bBest = /^Melhor opção/i.test(String(b.title || '')) ? 0 : 1;
  const aRealConnection = /conexão real/i.test(String(a.title || '')) ? 0 : 1;
  const bRealConnection = /conexão real/i.test(String(b.title || '')) ? 0 : 1;
  const aDirect = a.kind === 'direct' ? 0 : 1;
  const bDirect = b.kind === 'direct' ? 0 : 1;
  const aDur = Number(a.durationMinutes || 999999);
  const bDur = Number(b.durationMinutes || 999999);
  return aBest - bBest || aDirect - bDirect || aRealConnection - bRealConnection || aDur - bDur;
 });
}

async function buildRealConnectionOptionsWithSerpApi(query, diagnostics) {
 if (String(process.env.EXTRA_FLIGHT_REAL_CONNECTIONS_ENABLED || 'true').toLowerCase() === 'false') return [];
 if (!SERPAPI_API_KEY || !SERPAPI_EXTRA_ENABLED) return [];
 const origin = normalizeAirportCode(query.origin, '').toUpperCase();
 const destination = normalizeAirportCode(query.destination, '').toUpperCase();
 const hubs = normalizeExtraConnectionHubList(origin, destination);
 const maxOptions = Math.max(1, Math.min(Number(process.env.EXTRA_FLIGHT_CONNECTION_MAX_OPTIONS || 6), 12));
 const out = [];
 for (const hub of hubs) {
  try {
   const first = await fetchSerpApiExtraFlightOptions({ ...query, destination: hub, targetIso: '', limit: 6, nonStopOnly: true });
   const second = await fetchSerpApiExtraFlightOptions({ ...query, origin: hub, destination, limit: 6, nonStopOnly: true });
   const firstOptions = (first?.options || []).filter((item) => item?.legs?.length === 1);
   const secondOptions = (second?.options || []).filter((item) => item?.legs?.length === 1);
   for (const a of firstOptions.slice(0, 4)) {
    for (const b of secondOptions.slice(0, 4)) {
     const composed = composeRealConnectionOption(a, b, query, hub);
     if (composed) out.push(composed);
     if (out.length >= maxOptions) break;
    }
    if (out.length >= maxOptions) break;
   }
   diagnostics?.push?.({ provider: 'SerpAPI conexão real', ok: true, hub, first: firstOptions.length, second: secondOptions.length, combined: out.length });
  } catch (error) {
   diagnostics?.push?.({ provider: 'SerpAPI conexão real', ok: false, hub, reason: error?.message || String(error) });
  }
  if (out.length >= maxOptions) break;
 }
 return sortExtraFlightOptionsForPresentation(dedupeExtraFlightOptionsServer(out)).slice(0, maxOptions);
}


function extraFlightDbCacheKey({ origin, destination, date, currency = 'BRL', adults = 1, limit = 12, targetIso = '' }) {
 return crypto.createHash('sha256').update(['v108121', origin, destination, date, currency, adults, limit, targetIso || ''].join('|')).digest('hex');
}

function parseDbJsonPayload(value) {
 if (!value) return null;
 if (typeof value === 'object') return value;
 try { return JSON.parse(String(value)); } catch { return null; }
}

async function readExtraFlightSearchDbCache(params) {
 if (!EXTRA_FLIGHT_DB_CACHE_ENABLED) return null;
 const db = getPool();
 if (!db) return null;
 try {
  await ensureSchema();
  const key = extraFlightDbCacheKey(params);
  const result = await db.query('select * from crewcheck_extra_flight_search_cache where cache_key = $1 limit 1', [key]);
  const row = result.rows?.[0];
  if (!row) return null;
  const updated = new Date(row.updated_at || row.created_at || 0).getTime();
  if (!updated || Date.now() - updated > EXTRA_FLIGHT_DB_CACHE_TTL_MS) return null;
  const payload = parseDbJsonPayload(row.payload_json);
  if (!payload || !Array.isArray(payload.options)) return null;
  return {
   ...payload,
   source: payload.source || row.source || 'Cache CrewCheck',
   message: `${payload.message || 'Opções recuperadas do cache compartilhado do dia.'} Cache CrewCheck usado para reduzir custo de API; ocupação/status podem ser conferidos no radar.`,
   cache: { hit: true, shared: true, updatedAt: row.updated_at || row.created_at, ttlMs: EXTRA_FLIGHT_DB_CACHE_TTL_MS },
   updatedAt: payload.updatedAt || row.updated_at || row.created_at || new Date().toISOString(),
  };
 } catch {
  return null;
 }
}

async function writeExtraFlightSearchDbCache(params, payload) {
 if (!EXTRA_FLIGHT_DB_CACHE_ENABLED || !payload || !Array.isArray(payload.options) || !payload.options.length) return payload;
 const db = getPool();
 if (!db) return payload;
 try {
  await ensureSchema();
  const key = extraFlightDbCacheKey(params);
  const json = JSON.stringify({ ...payload, cache: { ...(payload.cache || {}), writtenAt: new Date().toISOString() } });
  const count = payload.options.length;
  const existing = await db.query('select cache_key from crewcheck_extra_flight_search_cache where cache_key = $1 limit 1', [key]);
  if (existing.rows?.[0]) {
   await db.query('update crewcheck_extra_flight_search_cache set updated_at = now(), payload_json = $1::jsonb, source = $2, options_count = $3 where cache_key = $4', [json, payload.source || null, count, key]).catch(async () => {
    await db.query('update crewcheck_extra_flight_search_cache set updated_at = now(), payload_json = $1, source = $2, options_count = $3 where cache_key = $4', [json, payload.source || null, count, key]);
   });
  } else {
   await db.query('insert into crewcheck_extra_flight_search_cache (cache_key, origin, destination, flight_date, target_iso, payload_json, source, options_count) values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)', [key, params.origin, params.destination, params.date, params.targetIso || '', json, payload.source || null, count]).catch(async () => {
    await db.query('insert into crewcheck_extra_flight_search_cache (cache_key, origin, destination, flight_date, target_iso, payload_json, source, options_count) values ($1,$2,$3,$4,$5,$6,$7,$8)', [key, params.origin, params.destination, params.date, params.targetIso || '', json, payload.source || null, count]);
   });
  }
  return { ...payload, cache: { ...(payload.cache || {}), shared: true, written: true } };
 } catch {
  return payload;
 }
}

async function fetchExtraFlightOffersWithDbCache(query) {
 const params = {
  origin: normalizeAirportCode(query.origin, '').toUpperCase(),
  destination: normalizeAirportCode(query.destination, '').toUpperCase(),
  date: /^\d{4}-\d{2}-\d{2}$/.test(String(query.date || '')) ? String(query.date) : todayIsoInBrazil(),
  currency: String(query.currency || 'BRL').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) || 'BRL',
  adults: Math.max(1, Math.min(Number(query.adults || 1) || 1, 9)),
  limit: Math.min(Math.max(Number(query.limit || 12), 3), 20),
  targetIso: String(query.targetIso || query.presentationIso || '').trim(),
 };
 const cached = await readExtraFlightSearchDbCache(params);
 if (cached) return cached;
 const fresh = await fetchExtraFlightOffers(query);
 return writeExtraFlightSearchDbCache(params, fresh);
}

async function fetchExtraFlightOffers(query) {
 const origin = normalizeAirportCode(query.origin, '').toUpperCase();
 const destination = normalizeAirportCode(query.destination, '').toUpperCase();
 const date = /^\d{4}-\d{2}-\d{2}$/.test(String(query.date || '')) ? String(query.date) : todayIsoInBrazil();
 const currency = String(query.currency || 'BRL').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) || 'BRL';
 const adults = Math.max(1, Math.min(Number(query.adults || 1) || 1, 9));
 const limit = Math.min(Math.max(Number(query.limit || 12), 3), 20);
 const targetIso = String(query.targetIso || query.presentationIso || '').trim();
 if (!origin || !destination || origin === destination) return { ok: true, options: [], source: 'Vivo de Extra', message: 'Informe origem e destino diferentes.' };
 const cacheKey = `extra-flight-offers-v108119:${origin}:${destination}:${date}:${currency}:${adults}:${limit}:${targetIso}`;
 const cached = cacheGet(flightProviderCache, cacheKey, Number(process.env.EXTRA_FLIGHT_OFFERS_CACHE_TTL_MS || 10 * 60 * 1000));
 if (cached) return cached;
 const fallbackFare = estimateAirfareRange(origin, destination, 0);
 const diagnostics = [];

 let searchApi = null;
 let serpApi = null;
 for (const provider of EXTRA_FLIGHT_PROVIDER_ORDER) {
  if (provider === 'SERPAPI') {
   serpApi = await fetchSerpApiExtraFlightOptions({ origin, destination, date, currency, adults, limit, targetIso });
   diagnostics.push(...(Array.isArray(serpApi?.diagnostics) ? serpApi.diagnostics : [{ provider: 'SerpAPI Google Flights', ok: Boolean(serpApi?.options?.length), reason: serpApi?.message || serpApi?.source }]));
   if (Array.isArray(serpApi?.options) && serpApi.options.length) {
    const realConnections = await buildRealConnectionOptionsWithSerpApi({ origin, destination, date, currency, adults, limit, targetIso }, diagnostics);
    const mergedOptions = sortExtraFlightOptionsForPresentation(dedupeExtraFlightOptionsServer([...serpApi.options, ...realConnections])).slice(0, limit);
    return cacheSet(flightProviderCache, cacheKey, {
     ok: true,
     origin,
     destination,
     date,
     options: mergedOptions,
     source: serpApi.source || 'Google Flights via SerpAPI + companhias',
     message: realConnections.length ? `${mergedOptions.length} opção(ões) reais, incluindo conexões cabíveis entre companhias quando possível.` : (serpApi.message || 'Opções reais retornadas com companhia, voo e tarifa de referência.'),
     estimatedFare: fallbackFare,
     diagnostics,
     providerStatus: { serpapi: Boolean(SERPAPI_API_KEY), searchapi: Boolean(SEARCHAPI_API_KEY), ...radarProviderStatus() },
     updatedAt: new Date().toISOString(),
    });
   }
  }
  if (provider === 'SEARCHAPI') {
   searchApi = await fetchSearchApiExtraFlightOptions({ origin, destination, date, currency, adults, limit, targetIso });
   diagnostics.push(...(Array.isArray(searchApi?.diagnostics) ? searchApi.diagnostics : [{ provider: 'SearchAPI Google Flights', ok: Boolean(searchApi?.options?.length), reason: searchApi?.message || searchApi?.source }]));
   if (Array.isArray(searchApi?.options) && searchApi.options.length) {
    const realConnections = await buildRealConnectionOptionsWithSerpApi({ origin, destination, date, currency, adults, limit, targetIso }, diagnostics);
    const mergedOptions = sortExtraFlightOptionsForPresentation(dedupeExtraFlightOptionsServer([...searchApi.options, ...realConnections])).slice(0, limit);
    return cacheSet(flightProviderCache, cacheKey, {
     ok: true,
     origin,
     destination,
     date,
     options: mergedOptions,
     source: searchApi.source || 'Google Flights via SearchAPI + companhias',
     message: realConnections.length ? `${mergedOptions.length} opção(ões) reais, incluindo conexões cabíveis entre companhias quando possível.` : (searchApi.message || 'Opções reais retornadas com companhia, voo e tarifa de referência.'),
     estimatedFare: fallbackFare,
     diagnostics,
     providerStatus: { serpapi: Boolean(SERPAPI_API_KEY), searchapi: Boolean(SEARCHAPI_API_KEY), ...radarProviderStatus() },
     updatedAt: new Date().toISOString(),
    });
   }
  }
  if (provider === 'AMADEUS') break;
 }

 try {
  const token = await getAmadeusAccessToken();
  if (!token) {
   return cacheSet(flightProviderCache, cacheKey, {
    ok: true,
    options: [],
    source: serpApi?.source || searchApi?.source || 'Tarifas não configuradas',
    message: `${serpApi?.message || searchApi?.message || 'SerpAPI/SearchAPI sem opção cabível/configurada.'} Configure SERPAPI_API_KEY e/ou SEARCHAPI_API_KEY e/ou AMADEUS_CLIENT_ID/AMADEUS_CLIENT_SECRET para mostrar companhia, número de voo e preço real. Estimativa de referência: ${fallbackFare.label}.`,
    estimatedFare: fallbackFare,
    diagnostics,
    providerStatus: { serpapi: Boolean(SERPAPI_API_KEY), searchapi: Boolean(SEARCHAPI_API_KEY), ...radarProviderStatus() },
   }, 90_000);
  }
  const base = String(process.env.AMADEUS_API_BASE || 'https://test.api.amadeus.com').replace(/\/$/, '');
  const url = new URL(`${base}/v2/shopping/flight-offers`);
  url.searchParams.set('originLocationCode', origin);
  url.searchParams.set('destinationLocationCode', destination);
  url.searchParams.set('departureDate', date);
  url.searchParams.set('adults', String(adults));
  url.searchParams.set('currencyCode', currency);
  url.searchParams.set('max', String(limit));
  url.searchParams.set('nonStop', 'false');
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}`, accept: 'application/json' }, signal: AbortSignal.timeout(Number(process.env.AMADEUS_TIMEOUT_MS || 12000)) });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.errors?.[0]?.detail || payload?.errors?.[0]?.title || `AMADEUS_OFFERS_HTTP_${response.status}`);
  diagnostics.push({ provider: 'Amadeus Flight Offers', ok: true, count: Array.isArray(payload?.data) ? payload.data.length : 0 });
  const options = (Array.isArray(payload?.data) ? payload.data : [])
   .map((item) => normalizeExtraFlightOffer(item, payload?.dictionaries || {}, { origin, destination, date, currency }))
   .filter(Boolean)
   .filter((item) => optionArrivesBeforeTarget(item, targetIso))
   .sort((a, b) => {
    const ap = Number(String(a.priceLabel || '').replace(/[^0-9,]/g, '').replace(',', '.')) || 999999;
    const bp = Number(String(b.priceLabel || '').replace(/[^0-9,]/g, '').replace(',', '.')) || 999999;
    return ap - bp || (a.durationMinutes || 9999) - (b.durationMinutes || 9999);
   })
   .slice(0, limit);
  const result = {
   ok: true,
   origin,
   destination,
   date,
   options,
   source: options.length ? 'Amadeus Flight Offers' : (serpApi?.source || searchApi?.source || 'Amadeus sem ofertas'),
   message: options.length ? `${options.length} opção(ões) com companhia, voo e tarifa. SerpAPI/SearchAPI não retornaram opção cabível nesta consulta.` : `${serpApi?.message || searchApi?.message || 'Nenhuma tarifa retornada.'} Estimativa de referência: ${fallbackFare.label}.`,
   estimatedFare: fallbackFare,
   diagnostics,
   providerStatus: { serpapi: Boolean(SERPAPI_API_KEY), searchapi: Boolean(SEARCHAPI_API_KEY), ...radarProviderStatus() },
   updatedAt: new Date().toISOString(),
  };
  return cacheSet(flightProviderCache, cacheKey, result);
 } catch (error) {
  diagnostics.push({ provider: 'Amadeus Flight Offers', ok: false, reason: error?.message || String(error) });
  return cacheSet(flightProviderCache, cacheKey, {
   ok: true,
   origin,
   destination,
   date,
   options: [],
   source: serpApi?.source || searchApi?.source || 'Tarifas indisponíveis',
   message: `${serpApi?.message || searchApi?.message || 'Não foi possível consultar tarifa agora.'} Estimativa de referência: ${fallbackFare.label}.`,
   estimatedFare: fallbackFare,
   diagnostics,
   providerStatus: { serpapi: Boolean(SERPAPI_API_KEY), searchapi: Boolean(SEARCHAPI_API_KEY), ...radarProviderStatus() },
   error: error?.message || String(error),
   updatedAt: new Date().toISOString(),
  }, 90_000);
 }
}


// CrewCheck 10.8.10 — Radar oficial BSB e GRU com fallback Aviationstack.
const OFFICIAL_AIRPORT_BOARD_CACHE_TTL_MS = Number(process.env.OFFICIAL_AIRPORT_BOARD_CACHE_TTL_MS || 90_000);
const OFFICIAL_AIRPORT_BOARD_SOURCES = {
 BSB: {
  label: 'BSB Aero oficial',
  url: 'https://www.bsb.aero/passageiros/voos-online',
 },
 GRU: {
  label: 'GRU Airport oficial',
  url: 'https://www.gru.com.br/pt/Passageiros/Voos',
 },
 CGH: {
  label: 'Aena Congonhas oficial',
  url: 'https://www.aenabrasil.com.br/pt/aeroportos/aeroporto-de-congonhas/informacoes-de-voos.html',
 },
 REC: {
  label: 'Aena Recife oficial',
  url: 'https://www.aenabrasil.com.br/pt/aeroportos/aeroporto-do-recife/informacoes-de-voos.html',
 },
 MCZ: {
  label: 'Aena Maceió oficial',
  url: 'https://www.aenabrasil.com.br/pt/aeroportos/aeroporto-de-maceio/informacoes-de-voos.html',
 },
 JPA: {
  label: 'Aena João Pessoa oficial',
  url: 'https://www.aenabrasil.com.br/pt/aeroportos/aeroporto-de-joao-pessoa/informacoes-de-voos.html',
 },
 AJU: {
  label: 'Aena Aracaju oficial',
  url: 'https://www.aenabrasil.com.br/pt/aeroportos/aeroporto-de-aracaju/informacoes-de-voos.html',
 },
 CPV: {
  label: 'Aena Campina Grande oficial',
  url: 'https://www.aenabrasil.com.br/pt/aeroportos/aeroporto-de-campina-grande/informacoes-de-voos.html',
 },
 JDO: {
  label: 'Aena Juazeiro do Norte oficial',
  url: 'https://www.aenabrasil.com.br/pt/aeroportos/aeroporto-de-juazeiro-do-norte/informacoes-de-voos.html',
 },
 SSA: {
  label: 'Salvador Bahia Airport',
  url: 'https://www.salvador-airport.com.br/pt-br/passageiros/voos/chegadas-e-partidas',
 },
 VIX: {
  label: 'Zurich Airport VIX',
  url: 'https://vix.aseb.com.br/pt/passageiros/voos/chegadas-e-partidas',
 },
 FLN: {
  label: 'Zurich Airport FLN',
  url: 'https://floripa-airport.com.br/pt/passageiros/voos/chegadas-e-partidas',
 },
};

function officialAirportSource(airport) {
 return OFFICIAL_AIRPORT_BOARD_SOURCES[String(airport || '').toUpperCase()] || null;
}

function airlineCodeFromText(value) {
 const text = String(value || '').toUpperCase();
 if (/\b(LATAM|TAM|JJ|LA)\b/.test(text)) return 'LA';
 if (/\b(GOL|GLO|G3)\b/.test(text)) return 'G3';
 if (/\b(AZUL|AZU|AD)\b/.test(text)) return 'AD';
 if (/\b(TAP|TP)\b/.test(text)) return 'TP';
 if (/\b(COPA|CMP|CM)\b/.test(text)) return 'CM';
 if (/\b(AMERICAN|AAL|AA)\b/.test(text)) return 'AA';
 if (/\b(AVIANCA|AVA|AV)\b/.test(text)) return 'AV';
 return '';
}

function statusFromOfficialText(value, type = 'departure') {
 const text = String(value || '');
 const lower = text.toLowerCase();
 if (/cancelad[oa]|cancelled/.test(lower)) return 'Cancelado';
 if (/atrasad[oa]|delay|delayed/.test(lower)) return 'Atrasado';
 if (/última chamada|ultima chamada|last call/.test(lower)) return 'Última chamada';
 if (/embarque imediato|immediate boarding/.test(lower)) return 'Embarque imediato';
 if (/embarque encerrado|voo encerrado|flight closed|closed|finalizad[oa]/.test(lower)) return 'Voo finalizado';
 if (/embarque|boarding/.test(lower)) return 'Embarque imediato';
 if (/decolad[oa]|partiu|departed|airborne/.test(lower)) return 'Voo finalizado';
 if (/pousou|chegou|landed|arrived/.test(lower)) return 'Voo finalizado';
 if (/confirmad[oa]|confirmed/.test(lower)) return 'Confirmado';
 if (/previst[oa]|programad[oa]|scheduled/.test(lower)) return 'Confirmado';
 if (/no hor[áa]rio|on time/.test(lower)) return 'No horário';
 return null;
}

function compactOfficialText(value) {
 return htmlToSearchText(value)
  .replace(/\b(\d{1,2})h(\d{2})\b/gi, '$1:$2')
  .replace(/\s+/g, ' ')
  .trim();
}

function valueFromObjectByKeys(obj, keys) {
 if (!obj || typeof obj !== 'object') return '';
 const lookup = new Map(Object.keys(obj).map((key) => [key.toLowerCase(), obj[key]]));
 for (const key of keys) {
  const value = lookup.get(key.toLowerCase());
  if (value !== undefined && value !== null && String(value).trim()) return value;
 }
 for (const [rawKey, value] of Object.entries(obj)) {
  const normalizedKey = rawKey.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (keys.some((key) => normalizedKey.includes(key.toLowerCase()))) {
   if (value !== undefined && value !== null && String(value).trim()) return value;
  }
 }
 return '';
}

function normalizeOfficialBoardRow(raw, type, airport, sourceLabel) {
 const values = raw && typeof raw === 'object' ? raw : {};
 const joined = Object.values(values).filter((value) => typeof value !== 'object').join(' ');
 const flightValue = valueFromObjectByKeys(values, ['flightNumber', 'flight', 'flight_iata', 'flightIata', 'iataNumber', 'numeroVoo', 'nVoo', 'voo', 'numero', 'number']) || joined;
 const flightMatch = String(flightValue || joined).toUpperCase().match(/\b(?:[A-Z]{1,4}\s*)?\d{2,5}[A-Z]?\b/);
 const flightNumber = normalizeFlightToken(flightMatch?.[0] || '');
 const airlineValue = valueFromObjectByKeys(values, ['airlineName', 'airline', 'companhia', 'cia', 'company', 'operadora']) || joined;
 const airlineCode = airlineCodeFromText(airlineValue) || String(valueFromObjectByKeys(values, ['airlineCode', 'iataCode', 'iata', 'carrier']) || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
 const airlineName = normalizeAirportBoardAirlineName(airlineCode, String(airlineValue || '').replace(/\b\d{2,5}\b/g, '').trim());
 const destination = String(valueFromObjectByKeys(values, ['destination', 'destino', 'arrival', 'chegada', 'cidadeDestino', 'cityDestination', 'to']) || '').trim();
 const origin = String(valueFromObjectByKeys(values, ['origin', 'origem', 'departure', 'partida', 'cidadeOrigem', 'cityOrigin', 'from']) || '').trim();
 const relatedAirport = type === 'departure' ? destination : origin;
 const gateRaw = String(valueFromObjectByKeys(values, ['gate', 'portao', 'portão', 'boardingGate']) || joined).trim();
 const gateMatch = gateRaw.match(/(?:port[aã]o|gate)\s*[:\-]?\s*([A-Z]?\d{1,3}[A-Z]?)/i) || (gateRaw.length < 8 ? gateRaw.match(/\b([A-Z]?\d{1,3}[A-Z]?)\b/) : null);
 const terminalRaw = String(valueFromObjectByKeys(values, ['terminal', 'term']) || '').trim();
 const timeRaw = String(valueFromObjectByKeys(values, ['confirmedTime', 'estimatedTime', 'actualTime', 'time', 'hora', 'scheduledTime', 'previsto', 'confirmado']) || joined).trim();
 const timeMatch = timeRaw.match(/\b([0-2]?\d:[0-5]\d)\b/);
 const statusRaw = String(valueFromObjectByKeys(values, ['status', 'observacao', 'observação', 'remark', 'situacao', 'situação']) || joined).trim();
 const status = statusFromOfficialText(statusRaw, type) || statusFromOfficialText(joined, type) || 'Confirmado';
 if (!flightNumber || (!relatedAirport && !timeMatch)) return null;
 const related = relatedAirport && !/^\d{1,2}:\d{2}$/.test(relatedAirport) ? relatedAirport : null;
 return {
  flightNumber,
  airlineCode,
  airlineName,
  airport,
  type,
  origin: type === 'arrival' ? (related || null) : airport,
  destination: type === 'departure' ? (related || null) : airport,
  relatedAirport: related || null,
  gate: gateMatch?.[1] ? String(gateMatch[1]).toUpperCase() : null,
  terminal: terminalRaw ? terminalRaw.toUpperCase().slice(0, 6) : null,
  scheduledTime: timeMatch?.[1] || null,
  confirmedTime: timeMatch?.[1] || null,
  status,
  source: sourceLabel,
 };
}

function pushUniqueOfficialRow(rows, row, airline) {
 if (!row) return;
 if (!airlineCodeMatches(row.airlineCode, airline)) return;
 const key = `${row.flightNumber}|${row.relatedAirport || ''}|${row.confirmedTime || row.scheduledTime || ''}`;
 if (rows.some((existing) => `${existing.flightNumber}|${existing.relatedAirport || ''}|${existing.confirmedTime || existing.scheduledTime || ''}` === key)) return;
 rows.push(row);
}

function collectOfficialRowsFromJson(value, rows, type, airport, airline, sourceLabel, depth = 0) {
 if (depth > 8 || value == null) return;
 if (Array.isArray(value)) {
  for (const item of value) collectOfficialRowsFromJson(item, rows, type, airport, airline, sourceLabel, depth + 1);
  return;
 }
 if (typeof value !== 'object') return;
 const row = normalizeOfficialBoardRow(value, type, airport, sourceLabel);
 pushUniqueOfficialRow(rows, row, airline);
 for (const child of Object.values(value)) {
  if (child && typeof child === 'object') collectOfficialRowsFromJson(child, rows, type, airport, airline, sourceLabel, depth + 1);
 }
}

function collectOfficialRowsFromScripts(html, rows, type, airport, airline, sourceLabel) {
 const scriptMatches = String(html || '').match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [];
 for (const scriptTag of scriptMatches) {
  const content = scriptTag.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '').trim();
  if (!content || content.length > 600_000) continue;
  const candidates = [];
  if (/^[\[{]/.test(content)) candidates.push(content);
  const assignmentMatch = content.match(/(?:flights|voos|departures|arrivals|__NEXT_DATA__|initialState)\s*=\s*([\[{][\s\S]*?[\]}])\s*[;\n]/i);
  if (assignmentMatch) candidates.push(assignmentMatch[1]);
  for (const candidate of candidates) {
   try {
    collectOfficialRowsFromJson(JSON.parse(candidate), rows, type, airport, airline, sourceLabel);
   } catch {
    // Conteúdo JS comum não é JSON puro; seguimos com parser textual.
   }
  }
 }
}

function collectOfficialRowsFromText(text, rows, type, airport, airline, sourceLabel, dateIso) {
 const clean = compactOfficialText(trimOfficialBoardTextToRequestedDate(text, dateIso));
 const companies = '(LATAM|TAM|GOL|Azul|AZUL|TAP|Copa|American(?: Airlines)?|Avianca|Voepass|Passaredo)';
 const statuses = '(Voo decolado|Voo encerrado|Embarque encerrado|Última chamada|Ultima chamada|Embarcando|Confirmado|Atrasado|Cancelado|No horário|No horario|Pousou|Previsto|Programado)';
 const regex = new RegExp(`\\b([A-Z]{0,4}\\s?\\d{3,5})\\b\\s*(?:${companies})?\\s*([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-Za-zÀ-ÿ0-9 .\\/'-]{2,42}?)\\s+(?:([A-Z]?\\d{1,3}[A-Z]?)\\s+)?([0-2]?\\d:[0-5]\\d)\\s+${statuses}`, 'gi');
 let match;
 while ((match = regex.exec(clean))) {
  const [, flight, company, city, gate, time, status] = match;
  const airlineCode = airlineCodeFromText(company || flight);
  const related = String(city || '').replace(/\b(port[aã]o|hora|observa[cç][aã]o)\b.*$/i, '').trim();
  pushUniqueOfficialRow(rows, {
   flightNumber: normalizeFlightToken(flight),
   airlineCode,
   airlineName: normalizeAirportBoardAirlineName(airlineCode, company),
   airport,
   type,
   origin: type === 'arrival' ? related : airport,
   destination: type === 'departure' ? related : airport,
   relatedAirport: related,
   gate: gate ? String(gate).toUpperCase() : null,
   terminal: null,
   scheduledTime: time,
   confirmedTime: time,
   status: statusFromOfficialText(status, type) || status,
   source: sourceLabel,
  }, airline);
 }
}

async function getOfficialAirportBoardSnapshot({ airport, type, airline, limit, date }) {
 const source = officialAirportSource(airport);
 if (!source) return null;
 const localDate = /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) ? String(date) : todayIsoForAirportServer(airport);
 const cacheKey = `official-airport-board:${airport}:${type}:${airline}:${limit}:${localDate}`;
 const cached = cacheGet(flightProviderCache, cacheKey, OFFICIAL_AIRPORT_BOARD_CACHE_TTL_MS);
 if (cached) return cached;
 const updatedAt = new Date().toISOString();
 try {
  const response = await fetch(source.url, {
   headers: {
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'pt-BR,pt;q=0.9,en;q=0.6',
    'cache-control': 'no-cache',
    pragma: 'no-cache',
    'user-agent': 'CrewCheck/10.8.131 airport-board',
   },
   signal: AbortSignal.timeout(9000),
  });
  if (!response.ok) throw new Error(`OFFICIAL_AIRPORT_HTTP_${response.status}`);
  const html = await response.text();
  const rows = [];
  collectOfficialRowsFromScripts(html, rows, type, airport, airline, source.label);
  collectOfficialRowsFromText(html, rows, type, airport, airline, source.label, localDate);
  const sortedRows = rows
   .filter((row) => row.flightNumber || row.relatedAirport)
   .filter((row) => airlineCodeMatches(row.airlineCode, airline))
   .sort((a, b) => String(a.confirmedTime || a.scheduledTime || '99:99').localeCompare(String(b.confirmedTime || b.scheduledTime || '99:99')))
   .slice(0, limit);
  const result = {
   ok: true,
   airport,
   type,
   airline,
   rows: sortedRows,
   date: localDate,
   timeBasis: 'airport-local',
   updatedAt,
   source: source.label,
   sourceUrl: source.url,
   message: sortedRows.length ? 'Dados carregados do painel oficial do aeroporto.' : 'O painel oficial não expôs voos em HTML estruturado neste momento; usando fallback quando disponível.',
  };
  return cacheSet(flightProviderCache, cacheKey, result);
 } catch (error) {
  return cacheSet(flightProviderCache, cacheKey, {
   ok: true,
   airport,
   type,
   airline,
   rows: [],
   date: localDate,
   timeBasis: 'airport-local',
   updatedAt,
   source: `${source.label} indisponível`,
   sourceUrl: source.url,
   message: error?.message || 'Falha ao consultar painel oficial.',
  });
 }
}

function shouldUseOfficialAirport(queryBase, code) {
 const values = [queryBase.origin, queryBase.destination, queryBase.route, queryBase.airport].map((value) => String(value || '').toUpperCase());
 return values.some((value) => new RegExp(`(^|[^A-Z])${code}([^A-Z]|$)`).test(value));
}

async function fetchOfficialAirportFlightStatus(params, code) {
 const source = officialAirportSource(code);
 if (!source) return null;
 const flightNumber = normalizeFlightToken(params.flightNumber);
 if (!flightNumber) return null;
 const candidates = buildFlightCandidates(params);
 const cacheKey = `official-flight-status:${code}:${String(params.date || '').slice(0, 10)}:${candidates.join(',') || flightNumber}`;
 const cached = cacheGet(flightProviderCache, cacheKey, OFFICIAL_AIRPORT_BOARD_CACHE_TTL_MS);
 if (cached) return cached;
 try {
  const response = await fetch(source.url, {
   headers: {
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'pt-BR,pt;q=0.9,en;q=0.6',
    'user-agent': 'CrewCheck/10.8.10 official-flight-status',
   },
   signal: AbortSignal.timeout(7500),
  });
  if (!response.ok) throw new Error(`OFFICIAL_FLIGHT_HTTP_${response.status}`);
  const text = compactOfficialText(await response.text());
  const match = extractSegmentForCandidates(text, candidates);
  if (!match) return cacheSet(flightProviderCache, cacheKey, null);
  const parsed = parseBsbStatusSegment(match.segment);
  return cacheSet(flightProviderCache, cacheKey, {
   ok: true,
   flightNumber,
   origin: params.origin,
   destination: params.destination,
   date: String(params.date || '').slice(0, 10),
   matchedFlight: match.token,
   status: statusFromOfficialText(match.segment) || parsed.status || 'Programado',
   gate: parsed.gate,
   terminal: parsed.terminal,
   scheduledTime: parsed.scheduledTime,
   confirmedTime: parsed.confirmedTime,
   source: source.label,
   updatedAt: new Date().toISOString(),
  });
 } catch {
  return cacheSet(flightProviderCache, cacheKey, null);
 }
}

function normalizeAirportBoardRow(item, type, airport) {
 const departure = item?.departure || {};
 const arrival = item?.arrival || {};
 const flight = item?.flight || {};
 const movement = type === 'departure' ? departure : arrival;
 const other = type === 'departure' ? arrival : departure;
 const airlineCode = normalizeAirportBoardAirlineCode(item);
 const airlineName = normalizeAirportBoardAirlineName(airlineCode, item?.airline?.name || item?.airline?.airline_name);
 const scheduled = normalizeAirportBoardTime(movement.scheduledTime || movement.scheduled || movement.time);
 const confirmed = normalizeAirportBoardTime(movement.actualTime || movement.estimatedTime || movement.actualRunway || movement.estimatedRunway || movement.actual || movement.estimated);
 return {
  flightNumber: String(flight.iataNumber || flight.iata || flight.icaoNumber || flight.icao || flight.number || '').toUpperCase(),
  airlineCode,
  airlineName,
  airport,
  type,
  origin: String(departure.iataCode || departure.iata || '').toUpperCase() || null,
  destination: String(arrival.iataCode || arrival.iata || '').toUpperCase() || null,
  relatedAirport: String(other.iataCode || other.iata || '').toUpperCase() || null,
  gate: movement.gate ? String(movement.gate).toUpperCase() : null,
  terminal: movement.terminal ? String(movement.terminal).toUpperCase() : null,
  scheduledTime: scheduled,
  confirmedTime: confirmed,
  status: normalizeAirportBoardStatus(item?.status || item?.flight_status, type),
 };
}

function airlineCodeMatches(rowCode, filter) {
 const code = String(rowCode || '').toUpperCase();
 const desired = String(filter || '').toUpperCase();
 if (!desired) return true;
 const groups = {
  LA: ['LA', 'JJ', 'TAM'],
  G3: ['G3', 'GLO'],
  AD: ['AD', 'AZU'],
  TP: ['TP', 'TAP'],
  CM: ['CM', 'CMP'],
  AA: ['AA', 'AAL'],
 };
 return (groups[desired] || [desired]).includes(code);
}

function normalizeBoardRowFromFlights(item, type, airport) {
 const departure = item?.departure || {};
 const arrival = item?.arrival || {};
 const flight = item?.flight || {};
 const movement = type === 'departure' ? departure : arrival;
 const other = type === 'departure' ? arrival : departure;
 const airlineCode = String(item?.airline?.iata_code || item?.airline?.iataCode || flight?.iata?.match(/^[A-Z]{1,3}/)?.[0] || '').toUpperCase();
 const airlineName = normalizeAirportBoardAirlineName(airlineCode, item?.airline?.name || item?.airline?.airline_name);
 return {
  flightNumber: String(flight.iata || flight.iataNumber || flight.icao || flight.number || '').toUpperCase(),
  airlineCode,
  airlineName,
  airport,
  type,
  origin: String(departure.iata || departure.iataCode || '').toUpperCase() || null,
  destination: String(arrival.iata || arrival.iataCode || '').toUpperCase() || null,
  relatedAirport: String(other.iata || other.iataCode || '').toUpperCase() || null,
  gate: movement.gate ? String(movement.gate).toUpperCase() : null,
  terminal: movement.terminal ? String(movement.terminal).toUpperCase() : null,
  scheduledTime: normalizeAirportBoardTime(movement.scheduled || movement.scheduledTime),
  confirmedTime: normalizeAirportBoardTime(movement.actual || movement.estimated || movement.actual_runway || movement.estimated_runway || movement.actualTime || movement.estimatedTime),
  status: normalizeAirportBoardStatus(item?.flight_status || item?.status, type),
 };
}


// CrewCheck v10.8.36 — Radar MultiFonte Premium.
// v10.8.38: provedores externos ficam privados no backend; o usuário vê somente Radar CrewCheck.
function buildRadarExternalLinks({ airport, type, airline, flightNumber }) {
 // v10.8.38: fontes externas ficam privadas no backend. O usuário não recebe links para Kayak/Google/FlightStats.
 return [];
}

function flightStatsCredentials() {
 const appId = String(process.env.FLIGHTSTATS_APP_ID || process.env.CIRIUM_APP_ID || '').trim();
 const appKey = String(process.env.FLIGHTSTATS_APP_KEY || process.env.CIRIUM_APP_KEY || '').trim();
 return { appId, appKey, ready: Boolean(appId && appKey) };
}

function flightStatsDateParts(dateIso = '', airport = 'BSB') {
 const tz = AIRPORT_TIMEZONES_SERVER[String(airport || '').toUpperCase()] || 'America/Sao_Paulo';
 const iso = /^\d{4}-\d{2}-\d{2}$/.test(String(dateIso || '')) ? String(dateIso) : todayIsoInTimeZoneServer(tz);
 const [year, month, day] = iso.split('-').map((part) => Number(part));
 const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
 return { year, month, day, hour: Math.max(0, Math.min(23, hour || 0)) };
}

function flightStatsStatusLabel(statusCode) {
 const code = String(statusCode || '').toUpperCase();
 const map = {
  A: 'Em voo',
  C: 'Cancelado',
  D: 'Voo decolado',
  DN: 'Desviado',
  L: 'Pousou',
  NO: 'No horário',
  R: 'Redirecionado',
  S: 'Programado',
  U: 'Desconhecido',
 };
 return map[code] || normalizeAirportBoardStatus(statusCode, 'departure');
}

function normalizeFlightStatsBoardRow(item, type, airport, appendix = {}) {
 const flightNumber = `${String(item?.carrierFsCode || '').toUpperCase()}${String(item?.flightNumber || '').trim()}`;
 const departure = String(item?.departureAirportFsCode || '').toUpperCase();
 const arrival = String(item?.arrivalAirportFsCode || '').toUpperCase();
 const movement = type === 'departure' ? item?.airportResources || {} : item?.airportResources || {};
 const airline = (appendix?.airlines || []).find((row) => String(row?.fs || '').toUpperCase() === String(item?.carrierFsCode || '').toUpperCase());
 const departureGate = item?.airportResources?.departureGate || item?.departureGate;
 const arrivalGate = item?.airportResources?.arrivalGate || item?.arrivalGate;
 const departureTerminal = item?.airportResources?.departureTerminal || item?.departureTerminal;
 const arrivalTerminal = item?.airportResources?.arrivalTerminal || item?.arrivalTerminal;
 const operational = item?.operationalTimes || {};
 const scheduled = type === 'departure' ? (operational?.scheduledGateDeparture?.dateLocal || operational?.publishedDeparture?.dateLocal) : (operational?.scheduledGateArrival?.dateLocal || operational?.publishedArrival?.dateLocal);
 const confirmed = type === 'departure' ? (operational?.estimatedGateDeparture?.dateLocal || operational?.actualGateDeparture?.dateLocal || operational?.estimatedRunwayDeparture?.dateLocal || operational?.actualRunwayDeparture?.dateLocal) : (operational?.estimatedGateArrival?.dateLocal || operational?.actualGateArrival?.dateLocal || operational?.estimatedRunwayArrival?.dateLocal || operational?.actualRunwayArrival?.dateLocal);
 return {
  flightNumber,
  airlineCode: String(item?.carrierFsCode || '').toUpperCase(),
  airlineName: normalizeAirportBoardAirlineName(String(item?.carrierFsCode || '').toUpperCase(), airline?.name || ''),
  airport,
  type,
  origin: departure || null,
  destination: arrival || null,
  relatedAirport: type === 'departure' ? arrival : departure,
  gate: type === 'departure' ? (departureGate || null) : (arrivalGate || null),
  terminal: type === 'departure' ? (departureTerminal || null) : (arrivalTerminal || null),
  scheduledTime: normalizeAirportBoardTime(scheduled),
  confirmedTime: normalizeAirportBoardTime(confirmed),
  status: flightStatsStatusLabel(item?.status),
  source: 'Radar premium',
  externalLinks: buildRadarExternalLinks({ airport, type, airline: item?.carrierFsCode, flightNumber }),
 };
}

async function fetchFlightStatsAirportBoard({ airport, type, airline, limit, diagnostics, date, displayTimeZone }) {
 const credentials = flightStatsCredentials();
 if (!credentials.ready) {
  diagnostics.push({ provider: 'Provedor premium', ok: false, reason: 'FLIGHTSTATS_APP_ID/FLIGHTSTATS_APP_KEY ausentes no Render' });
  return { rows: [], source: 'Radar premium não configurado' };
 }
 const cacheKey = `flightstats-board-v108109:${airport}:${type}:${airline}:${limit}:${date || todayIsoInBrazil()}`;
 const cached = cacheGet(flightProviderCache, cacheKey, Number(process.env.FLIGHTSTATS_CACHE_TTL_MS || 5 * 60 * 1000));
 if (cached) {
  diagnostics.push({ provider: 'Provedor premium', ok: Boolean(cached.rows?.length), cached: true, count: cached.rows?.length || 0 });
  return cached;
 }
 const { year, month, day, hour } = flightStatsDateParts(date, airport);
 const movement = type === 'arrival' ? 'arr' : 'dep';
 const numHours = Math.min(Math.max(Number(process.env.FLIGHTSTATS_NUM_HOURS || 6), 2), 12);
 const base = String(process.env.FLIGHTSTATS_BASE_URL || 'https://api.flightstats.com/flex/flightstatus/rest/v2/json').replace(/\/$/, '');
 const url = new URL(`${base}/airport/status/${airport}/${movement}/${year}/${month}/${day}/${hour}`);
 url.searchParams.set('appId', credentials.appId);
 url.searchParams.set('appKey', credentials.appKey);
 url.searchParams.set('utc', 'false');
 url.searchParams.set('numHours', String(numHours));
 url.searchParams.set('codeType', 'IATA');
 url.searchParams.set('useInlinedReferences', 'true');
 url.searchParams.set('includeNewFields', 'true');

 try {
  const response = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(Number(process.env.FLIGHTSTATS_TIMEOUT_MS || 12000)) });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.error) {
   const reason = payload?.error?.errorMessage || payload?.error?.message || `HTTP ${response.status}`;
   diagnostics.push({ provider: 'Provedor premium', endpoint: 'airport/status', ok: false, status: response.status, reason });
   const value = { rows: [], source: 'Radar premium sem dados' };
   return cacheSet(flightProviderCache, cacheKey, value, 60_000);
  }
  const rows = (Array.isArray(payload?.flightStatuses) ? payload.flightStatuses : [])
   .map((item) => normalizeFlightStatsBoardRow(item, type, airport, payload?.appendix || {}))
   .filter((row) => row.flightNumber || row.relatedAirport)
   .filter((row) => airlineCodeMatches(row.airlineCode, airline))
   .slice(0, Math.min(Number(limit || 60), 80));
  diagnostics.push({ provider: 'Provedor premium', endpoint: 'airport/status', ok: true, count: rows.length });
  return cacheSet(flightProviderCache, cacheKey, { rows, source: 'Radar premium' });
 } catch (error) {
  const reason = error?.message || String(error);
  diagnostics.push({ provider: 'Provedor premium', endpoint: 'airport/status', ok: false, reason });
  return cacheSet(flightProviderCache, cacheKey, { rows: [], source: 'Radar premium indisponível' }, 60_000);
 }
}

function rowsAreUseful(rows) {
 return Array.isArray(rows) && rows.some((row) => row.flightNumber || row.relatedAirport || row.status || row.scheduledTime || row.confirmedTime);
}

async function fetchAviationstackAirportBoard({ airport, type, airline, limit, diagnostics, date, refresh = false }) {
 const today = /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) ? String(date) : todayIsoInBrazil();
 const typeParam = type === 'arrival' ? 'arrival' : 'departure';
 const safeLimit = Math.min(Math.max(Number(limit || 40), 10), 100);

 // v10.8.125: para o radar funcionar de forma mais previsível, usamos /flights primeiro.
 // /timetable fica como fallback, porque em alguns planos ele retorna vazio/cooldown mesmo quando /flights funciona.
 const flightsQuery = typeParam === 'departure'
  ? { limit: safeLimit, dep_iata: airport, flight_date: today }
  : { limit: safeLimit, arr_iata: airport, flight_date: today };
 if (airline) flightsQuery.airline_iata = airline;
 const flightsPayload = await fetchAviationstackJson('/flights', flightsQuery, diagnostics, { force: refresh });
 const flightRows = (Array.isArray(flightsPayload?.data) ? flightsPayload.data : [])
  .map((item) => normalizeBoardRowFromFlights(item, typeParam, airport))
  .filter((row) => row.flightNumber || row.relatedAirport)
  .filter((row) => airlineCodeMatches(row.airlineCode, airline));
 if (rowsAreUseful(flightRows)) return { rows: flightRows, source: 'Aviationstack /flights' };

 const timetableQuery = { iataCode: airport, type: typeParam, limit: safeLimit };
 if (airline) timetableQuery.airline_iata = airline;
 const timetablePayload = await fetchAviationstackJson('/timetable', timetableQuery, diagnostics, { force: refresh });
 const timetableRows = (Array.isArray(timetablePayload?.data) ? timetablePayload.data : [])
  .map((item) => normalizeAirportBoardRow(item, typeParam, airport))
  .filter((row) => row.flightNumber || row.relatedAirport)
  .filter((row) => airlineCodeMatches(row.airlineCode, airline));
 if (rowsAreUseful(timetableRows)) return { rows: timetableRows, source: 'Aviationstack /timetable' };

 const rateLimited = (diagnostics || []).some((item) => item.provider === 'Aviationstack' && (item.throttled || isAviationstackRateLimitMessage(item.reason)));
 return { rows: [], source: rateLimited ? 'Aviationstack em cooldown' : 'Aviationstack sem voos retornados' };
}

function premiumRadarMessage({ official, apiResult, diagnostics, airport, type }) {
 if (apiResult?.rows?.length) return 'Radar carregado com dados operacionais da API. Portão e terminal aparecem quando o provedor disponibiliza essas informações.';
 if (official?.rows?.length) return 'Radar carregado pelo painel oficial público do aeroporto.';
 const missingKey = diagnostics?.some((item) => String(item.reason || '').includes('AVIATIONSTACK_ACCESS_KEY'));
 if (missingKey) return 'Configure AVIATIONSTACK_ACCESS_KEY no Render para ativar dados reais de voos, portão e terminal.';
 const rateLimited = diagnostics?.some((item) => item.throttled || isAviationstackRateLimitMessage(item.reason));
 if (rateLimited) return 'A Aviationstack atingiu o limite temporário de consultas do seu plano. O CrewCheck agora usa cache, fila e cooldown para não repetir chamadas até a API liberar nova consulta.';
 const reasons = (diagnostics || []).filter((item) => !item.ok).map((item) => item.reason || `${item.provider} indisponível`).filter(Boolean).slice(0, 2).join(' | ');
 return reasons || `Nenhum voo ${type === 'departure' ? 'de partida' : 'de chegada'} retornado para ${airport} neste momento.`;
}

function airportBoardDbCacheKey({ airport, type, airline = '', date = '' }) {
 return crypto.createHash('sha256').update(['airport-board-v108125-api-first', airport, type, airline || '', date || todayIsoInBrazil()].join('|')).digest('hex');
}

function normalizeAirportBoardCachePayload(value) {
 const payload = parseDbJsonPayload(value);
 if (!payload || !Array.isArray(payload.rows)) return null;
 return payload;
}

function stripRadarTextAccent(value = '') {
 return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function isFinalAirportBoardStatusServer(status) {
 const s = stripRadarTextAccent(status || '');
 return /(finalizado|encerrado|decolad|departed|airborne|pousou|landed|arrived|closed|realizado)/i.test(s);
}

const BRAZILIAN_AIRPORT_IATA_SERVER = new Set(['AJU','BEL','BPS','BSB','CGB','CGH','CGR','CNF','CWB','FLN','FOR','GIG','GRU','GYN','IGU','IOS','JPA','MAO','MCZ','MCP','MOC','NAT','NVT','PMW','POA','PVH','RAO','REC','SDU','SLZ','SSA','THE','UDI','VCP','VIX','XAP']);
const CARGO_AIRLINE_HINTS_SERVER = new Set(['5X','FX','M3','QT','CV','K4','0S','SID','TTL','TOTAL','FDX','UPS','GTI','ABX','BOX','N8','KZ','CK','CARGOLUX','SWR']);

function normalizeAirportForTrafficServer(value = '') {
 return String(value || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
}

function isCargoAirportBoardRowServer(row = {}) {
 if (row.isCargo === true || row.trafficScope === 'cargo') return true;
 const text = `${row.airlineCode || ''} ${row.airlineName || ''} ${row.flightNumber || ''} ${row.source || ''} ${row.serviceType || ''}`.toUpperCase();
 for (const hint of CARGO_AIRLINE_HINTS_SERVER) {
  if (new RegExp(`\b${hint}\b`, 'i').test(text)) return true;
 }
 return /(CARGO|FREIGHT|CARGUEIR|SIDERAL|TOTAL LINHAS AEREAS|TOTAL CARGO|LATAM CARGO|ABSA|FEDEX|UPS|ATLAS AIR|CARGOLUX)/i.test(text);
}

function classifyAirportBoardTrafficServer(row = {}) {
 if (isCargoAirportBoardRowServer(row)) return 'cargo';
 const origin = normalizeAirportForTrafficServer(row.origin);
 const destination = normalizeAirportForTrafficServer(row.destination);
 if (!origin || !destination) return 'unknown';
 const originBR = BRAZILIAN_AIRPORT_IATA_SERVER.has(origin);
 const destinationBR = BRAZILIAN_AIRPORT_IATA_SERVER.has(destination);
 if (originBR && destinationBR) return 'domestic';
 if (originBR || destinationBR) return 'international';
 return 'international';
}

function sanitizeAirportBoardRowsForSharedCache(rows = []) {
 return (Array.isArray(rows) ? rows : [])
  .filter((row) => row && (row.flightNumber || row.destination || row.origin))
  .filter((row) => !isFinalAirportBoardStatusServer(row.status))
  .map((row) => {
   const isCargo = isCargoAirportBoardRowServer(row);
   const trafficScope = classifyAirportBoardTrafficServer({ ...row, isCargo });
   return { ...row, isCargo, trafficScope, externalLinks: [] };
  })
  .sort((a, b) => String(a.confirmedTime || a.scheduledTime || '99:99').localeCompare(String(b.confirmedTime || b.scheduledTime || '99:99')));
}

async function readAirportBoardDbCache(params) {
 if (!AIRPORT_BOARD_DB_CACHE_ENABLED || params?.refresh) return null;
 const db = getPool();
 if (!db) return null;
 try {
  await ensureSchema();
  const key = airportBoardDbCacheKey(params);
  const result = await db.query('select * from crewcheck_airport_board_cache where cache_key = $1 limit 1', [key]);
  const row = result.rows?.[0];
  if (!row) return null;
  const updated = new Date(row.updated_at || row.created_at || 0).getTime();
  if (!updated || Date.now() - updated > AIRPORT_BOARD_DB_CACHE_TTL_MS) return null;
  const payload = normalizeAirportBoardCachePayload(row.payload_json);
  if (!payload) return null;
  const rows = sanitizeAirportBoardRowsForSharedCache(payload.rows);
  if (!rowsAreUseful(rows)) return null;
  return {
   ...payload,
   rows,
   source: payload.source || row.source || 'Radar CrewCheck cache compartilhado',
   message: `${payload.message || 'Voos carregados do cache compartilhado do dia.'} Atualização compartilhada para reduzir acesso às APIs; use Atualizar agora quando precisar conferir portão/status.`,
   cache: { hit: true, shared: true, updatedAt: row.updated_at || row.created_at, ttlMs: AIRPORT_BOARD_DB_CACHE_TTL_MS },
   updatedAt: row.updated_at || payload.updatedAt || row.created_at || new Date().toISOString(),
  };
 } catch {
  return null;
 }
}

async function writeAirportBoardDbCache(params, payload) {
 if (!AIRPORT_BOARD_DB_CACHE_ENABLED || !payload || !Array.isArray(payload.rows)) return payload;
 const db = getPool();
 if (!db) return payload;
 try {
  await ensureSchema();
  const key = airportBoardDbCacheKey(params);
  const rows = sanitizeAirportBoardRowsForSharedCache(payload.rows);
  if (!rowsAreUseful(rows) && !AIRPORT_BOARD_STORE_EMPTY_CACHE) return { ...payload, rows, cache: { ...(payload.cache || {}), written: false, shared: true, reason: 'empty_not_cached' } };
  const nextPayload = { ...payload, rows, cache: { ...(payload.cache || {}), writtenAt: new Date().toISOString(), shared: true } };
  const json = JSON.stringify(nextPayload);
  const count = rows.length;
  const existing = await db.query('select cache_key from crewcheck_airport_board_cache where cache_key = $1 limit 1', [key]);
  if (existing.rows?.[0]) {
   await db.query('update crewcheck_airport_board_cache set updated_at = now(), payload_json = $1::jsonb, source = $2, rows_count = $3 where cache_key = $4', [json, payload.source || null, count, key]).catch(async () => {
    await db.query('update crewcheck_airport_board_cache set updated_at = now(), payload_json = $1, source = $2, rows_count = $3 where cache_key = $4', [json, payload.source || null, count, key]);
   });
  } else {
   await db.query('insert into crewcheck_airport_board_cache (cache_key, airport, board_type, airline, flight_date, payload_json, source, rows_count) values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)', [key, params.airport, params.type, params.airline || '', params.date, json, payload.source || null, count]).catch(async () => {
    await db.query('insert into crewcheck_airport_board_cache (cache_key, airport, board_type, airline, flight_date, payload_json, source, rows_count) values ($1,$2,$3,$4,$5,$6,$7,$8)', [key, params.airport, params.type, params.airline || '', params.date, json, payload.source || null, count]);
   });
  }
  return { ...nextPayload, cache: { ...(nextPayload.cache || {}), written: true, shared: true } };
 } catch {
  return payload;
 }
}


async function fetchAirportBoardFromConfiguredApis({ airport, type, airline, limit, diagnostics, date, refresh = false, displayTimeZone = process.env.CREWCHECK_LOCAL_TIMEZONE || 'America/Sao_Paulo' }) {
 const providerOrder = [...new Set((AIRPORT_BOARD_API_PROVIDER_ORDER.length ? AIRPORT_BOARD_API_PROVIDER_ORDER : ['FLIGHTAWARE', 'FLIGHTSTATS', 'AERODATABOX', 'AVIATIONSTACK']).map((item) => String(item || '').toUpperCase()))];
 let lastResult = { rows: [], source: 'API de voos sem dados' };
 for (const provider of providerOrder) {
  if (provider === 'OFFICIAL' || provider === 'MONITOR') continue;
  let result = null;
  if (provider === 'FLIGHTAWARE' || provider === 'AEROAPI') {
   result = await fetchFlightAwareAirportBoard({ airport, type, airline, limit, diagnostics, date, refresh, displayTimeZone });
  } else if (provider === 'FLIGHTSTATS' || provider === 'CIRIUM') {
   result = await fetchFlightStatsAirportBoard({ airport, type, airline, limit, diagnostics, date, displayTimeZone });
  } else if (provider === 'AERODATABOX') {
   result = await fetchAeroDataBoxAirportBoard({ airport, type, airline, limit, diagnostics, date, displayTimeZone });
  } else if (provider === 'AVIATIONSTACK') {
   result = await fetchAviationstackAirportBoard({ airport, type, airline, limit, diagnostics, date, refresh, displayTimeZone });
  }
  if (result) lastResult = result;
  if (rowsAreUseful(result?.rows)) {
   return { ...result, providerOrder, apiProvider: provider };
  }
 }
 return { ...lastResult, rows: [], providerOrder };
}


async function getAirportBoardSnapshot(query) {
 const airport = String(query.get('airport') || query.get('iataCode') || 'BSB').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) || 'BSB';
 const type = String(query.get('type') || 'departure').toLowerCase() === 'arrival' ? 'arrival' : 'departure';
 const airline = String(query.get('airline') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
 const limit = Math.min(Math.max(Number(query.get('limit') || 60), 10), 100);
 const diagnosticsWanted = ['1', 'true', 'yes'].includes(String(query.get('diagnostics') || '').toLowerCase());
 const officialOnly = ['1', 'true', 'yes'].includes(String(query.get('officialOnly') || '').toLowerCase());
 const apiFirstParam = String(query.get('apiFirst') || '').toLowerCase();
 const apiFirst = !officialOnly && (apiFirstParam ? ['1', 'true', 'yes'].includes(apiFirstParam) : AIRPORT_BOARD_API_FIRST);
 const refresh = ['1', 'true', 'yes', 'force'].includes(String(query.get('refresh') || query.get('forceRefresh') || '').toLowerCase());
 const displayTimeZone = safeRadarTimeZone(query.get('displayTimeZone') || query.get('systemTimeZone') || process.env.CREWCHECK_LOCAL_TIMEZONE || 'America/Sao_Paulo');
 const today = todayIsoForAirportServer(airport);
 const requestedRaw = String(query.get('date') || '').slice(0, 10);
 const requestedDate = AIRPORT_BOARD_CACHE_CURRENT_DAY_ONLY ? today : (requestedRaw || today);
 const updatedAt = new Date().toISOString();
 const cacheParams = { airport, type, airline, date: requestedDate, refresh, displayTimeZone };
 const dbCached = await readAirportBoardDbCache(cacheParams);
 if (dbCached) return { ...dbCached, apiFirst, diagnostics: diagnosticsWanted ? dbCached.diagnostics : undefined };
 const cacheKey = `airport-board-api-first-v11017:${airport}:${type}:${airline}:${limit}:${diagnosticsWanted}:${officialOnly}:${apiFirst}:${requestedDate}:${displayTimeZone}`;
 const cached = refresh ? null : cacheGet(flightProviderCache, cacheKey, AIRPORT_BOARD_PREMIUM_CACHE_MS);
 if (cached) return cached;

 const diagnostics = [];
 let official = null;

 if (officialOnly) {
  official = await getOfficialAirportBoardSnapshot({ airport, type, airline, limit, date: requestedDate });
  const rows = sanitizeAirportBoardRowsForSharedCache(official?.rows || []).slice(0, limit);
  const value = {
   ok: true,
   airport,
   type,
   airline,
   date: requestedDate,
   timeBasis: 'airport-local',
   displayTimeZone,
   rows,
   updatedAt,
   source: official?.source || officialAirportSource(airport)?.label || 'Monitor oficial/provedor aeroportuário',
   sourceUrl: official?.sourceUrl || officialAirportSource(airport)?.url || null,
   message: rows.length
    ? 'Dados carregados do monitor oficial/provedor aeroportuário. Sem fallback de escala.'
    : 'Sem retorno estruturado do monitor oficial/provedor para estes filtros. Sem fallback de escala.',
   diagnostics: diagnosticsWanted ? dedupeDiagnostics(diagnostics) : undefined,
   providerReady: Boolean(rows.length),
   externalSources: [],
   providerStatus: { ...radarProviderStatus(), official: Boolean(rows.length) },
   apiFirst: false,
  };
  const stored = await writeAirportBoardDbCache(cacheParams, value);
  return cacheSet(flightProviderCache, cacheKey, stored);
 }

 if (!apiFirst) {
  official = await getOfficialAirportBoardSnapshot({ airport, type, airline, limit, date: requestedDate });
  if (official?.rows?.length) {
   const value = {
    ...official,
    date: requestedDate,
    rows: sanitizeAirportBoardRowsForSharedCache(official.rows || []).slice(0, limit),
    diagnostics: diagnosticsWanted ? dedupeDiagnostics(diagnostics) : undefined,
    message: premiumRadarMessage({ official, diagnostics, airport, type }),
    providerReady: true,
    externalSources: [],
    providerStatus: { ...radarProviderStatus(), official: true },
    apiFirst: false,
   };
   const stored = await writeAirportBoardDbCache(cacheParams, value);
   return cacheSet(flightProviderCache, cacheKey, stored);
  }
 }

 const apiResult = await fetchAirportBoardFromConfiguredApis({ airport, type, airline, limit, diagnostics, date: requestedDate, refresh, displayTimeZone });
 if (rowsAreUseful(apiResult.rows)) {
  const rows = sanitizeAirportBoardRowsForSharedCache(apiResult.rows).slice(0, limit);
  const value = {
   ok: true,
   airport,
   type,
   airline,
   date: requestedDate,
   timeBasis: 'airport-local',
   displayTimeZone,
   rows,
   updatedAt,
   source: apiResult.source || 'API de voos',
   sourceUrl: null,
   message: `${premiumRadarMessage({ apiResult: { rows }, diagnostics, airport, type })} Prioridade: API real primeiro; cache compartilhado do dia para reduzir custo.`,
   diagnostics: diagnosticsWanted ? dedupeDiagnostics(diagnostics) : undefined,
   providerReady: true,
   externalSources: [],
   providerStatus: { ...radarProviderStatus(), apiFirst: true },
   apiFirst: true,
   cachePolicy: 'api-first-shared-day-cache',
  };
  const stored = await writeAirportBoardDbCache(cacheParams, value);
  return cacheSet(flightProviderCache, cacheKey, stored);
 }

 if (!official) official = await getOfficialAirportBoardSnapshot({ airport, type, airline, limit, date: requestedDate });
 const sourceRows = official?.rows || [];
 const rows = sanitizeAirportBoardRowsForSharedCache(sourceRows).slice(0, limit);
 const value = {
  ok: true,
  airport,
  type,
  airline,
  date: requestedDate,
  timeBasis: 'airport-local',
  displayTimeZone,
  rows,
  updatedAt,
  source: rowsAreUseful(rows) ? (official?.source || 'Monitor oficial/provedor aeroportuário') : (apiResult.source || 'Radar de Voos'),
  sourceUrl: official?.sourceUrl || officialAirportSource(airport)?.url || null,
  message: rowsAreUseful(rows)
   ? `${premiumRadarMessage({ official, apiResult, diagnostics, airport, type })} APIs consultadas primeiro; monitor oficial usado apenas como fallback.`
   : `${premiumRadarMessage({ official, apiResult, diagnostics, airport, type })} Nenhum cache vazio foi salvo; use Atualizar agora quando a API estiver liberada.`,
  diagnostics: diagnosticsWanted ? dedupeDiagnostics(diagnostics) : undefined,
  providerReady: Object.values(radarProviderStatus()).some(Boolean),
  externalSources: [],
  providerStatus: radarProviderStatus(),
  apiFirst: true,
  cachePolicy: 'empty-results-not-cached',
 };
 const stored = await writeAirportBoardDbCache(cacheParams, value);
 return cacheSet(flightProviderCache, cacheKey, stored);
}

async function getAmadeusAccessToken() {
 const clientId = String(process.env.AMADEUS_CLIENT_ID || '').trim();
 const clientSecret = String(process.env.AMADEUS_CLIENT_SECRET || '').trim();
 if (!clientId || !clientSecret) return '';
 if (amadeusTokenCache.token && Date.now() < amadeusTokenCache.expiresAt - 60_000) return amadeusTokenCache.token;
 const base = String(process.env.AMADEUS_API_BASE || 'https://test.api.amadeus.com').replace(/\/$/, '');
 const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret });
 const response = await fetch(`${base}/v1/security/oauth2/token`, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
  body,
  signal: AbortSignal.timeout(7500),
 });
 if (!response.ok) return '';
 const payload = await response.json();
 const token = String(payload.access_token || '');
 const expiresIn = Number(payload.expires_in || 1200);
 amadeusTokenCache = { token, expiresAt: Date.now() + expiresIn * 1000 };
 return token;
}

function timingByQualifier(point, qualifiers) {
 const timings = Array.isArray(point?.timings) ? point.timings : [];
 for (const qualifier of qualifiers) {
  const found = timings.find((item) => String(item?.qualifier || '').toUpperCase() === qualifier);
  if (found?.value) return found.value;
 }
 return null;
}

function normalizeAmadeusFlight(item, params, designator) {
 const points = Array.isArray(item?.flightPoints) ? item.flightPoints : [];
 const departurePoint = points.find((point) => point?.departure) || points[0] || {};
 const arrivalPoint = points.find((point) => point?.arrival) || points[points.length - 1] || {};
 const selectedPoint = params.origin && airportMatches(departurePoint.iataCode, params.origin) ? departurePoint : (params.destination && airportMatches(arrivalPoint.iataCode, params.destination) ? arrivalPoint : departurePoint);
 const movement = selectedPoint?.departure || selectedPoint?.arrival || {};
 const scheduled = selectedPoint?.departure ? timingByQualifier(movement, ['STD']) : timingByQualifier(movement, ['STA']);
 const confirmed = selectedPoint?.departure ? timingByQualifier(movement, ['ATD', 'ETD']) : timingByQualifier(movement, ['ATA', 'ETA']);
 const delay = (Array.isArray(movement?.timings) ? movement.timings : []).flatMap((timing) => timing?.delays || []).find(Boolean);
 return {
  ok: true,
  flightNumber: `${designator.carrierCode}${designator.flightNumber}`,
  origin: departurePoint?.iataCode || params.origin,
  destination: arrivalPoint?.iataCode || params.destination,
  date: item?.scheduledDepartureDate || params.date,
  matchedFlight: `${designator.carrierCode}${designator.flightNumber}`,
  status: delay ? 'Atrasado' : 'Programado',
  gate: movement?.gate?.mainGate ? String(movement.gate.mainGate).toUpperCase() : null,
  terminal: movement?.terminal?.code ? String(movement.terminal.code).toUpperCase() : null,
  scheduledTime: normalizeTime(scheduled, params.displayTimeZone),
  confirmedTime: normalizeTime(confirmed, params.displayTimeZone),
  source: 'Amadeus On-Demand',
  updatedAt: new Date().toISOString(),
 };
}

async function fetchAmadeusOnDemandStatus(params) {
 const designator = primaryFlightDesignator(params);
 if (!designator || !params.date) return null;
 const cacheKey = `amadeus:${params.date}:${designator.carrierCode}:${designator.flightNumber}`;
 const cached = cacheGet(flightProviderCache, cacheKey, Number(process.env.AMADEUS_CACHE_TTL_MS || FLIGHT_PROVIDER_CACHE_TTL_MS));
 if (cached) return cached;
 try {
  const token = await getAmadeusAccessToken();
  if (!token) return cacheSet(flightProviderCache, cacheKey, null);
  const base = String(process.env.AMADEUS_API_BASE || 'https://test.api.amadeus.com').replace(/\/$/, '');
  const url = new URL(`${base}/v2/schedule/flights`);
  url.searchParams.set('carrierCode', designator.carrierCode);
  url.searchParams.set('flightNumber', designator.flightNumber);
  url.searchParams.set('scheduledDepartureDate', params.date);
  if (designator.operationalSuffix) url.searchParams.set('operationalSuffix', designator.operationalSuffix);
  const response = await fetch(url, { headers: { accept: 'application/vnd.amadeus+json,application/json', authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(7500) });
  if (!response.ok) throw new Error(`AMADEUS_HTTP_${response.status}`);
  const payload = await response.json();
  const row = Array.isArray(payload?.data) ? payload.data[0] : null;
  if (!row) return cacheSet(flightProviderCache, cacheKey, null);
  return cacheSet(flightProviderCache, cacheKey, normalizeAmadeusFlight(row, params, designator));
 } catch {
  return cacheSet(flightProviderCache, cacheKey, null);
 }
}


// CrewCheck v10.8.38 — Radar Push Hub privado.
// Provedores ficam no backend. O front recebe somente dados normalizados do Radar CrewCheck.
function radarIsoDate(value) {
 const text = String(value || '').slice(0, 10);
 if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
 return todayIsoInBrazil();
}

function radarAddDaysIso(iso, days) {
 const base = /^\d{4}-\d{2}-\d{2}$/.test(String(iso || '')) ? new Date(`${iso}T12:00:00Z`) : new Date();
 base.setUTCDate(base.getUTCDate() + Number(days || 0));
 return base.toISOString().slice(0, 10);
}

function radarPickMovementPart(item, params) {
 const departure = item?.departure || item?.departureAirport || item?.origin || {};
 const arrival = item?.arrival || item?.arrivalAirport || item?.destination || {};
 const origin = String(params.origin || '').toUpperCase();
 const destination = String(params.destination || '').toUpperCase();
 const depCode = String(departure?.airport?.iata || departure?.airport?.iataCode || departure?.iata || departure?.iataCode || departure?.fs || departure?.code || '').toUpperCase();
 const arrCode = String(arrival?.airport?.iata || arrival?.airport?.iataCode || arrival?.iata || arrival?.iataCode || arrival?.fs || arrival?.code || '').toUpperCase();
 if (origin && depCode === origin) return { part: departure, other: arrival, type: 'departure' };
 if (destination && arrCode === destination) return { part: arrival, other: departure, type: 'arrival' };
 if (departure?.gate || departure?.terminal || departure?.terminalName || departure?.terminalCode) return { part: departure, other: arrival, type: 'departure' };
 if (arrival?.gate || arrival?.terminal || arrival?.terminalName || arrival?.terminalCode) return { part: arrival, other: departure, type: 'arrival' };
 return { part: departure, other: arrival, type: 'departure' };
}

function radarTimeFromObject(value) {
 if (!value) return null;
 if (typeof value === 'string' || typeof value === 'number') return normalizeTime(value);
 return normalizeTime(value.local || value.utc || value.dateLocal || value.dateUtc || value.date || value.time || value.value || value.scheduled || value.estimated || value.actual, value.timeZone || value.timezone || value.tz || process.env.CREWCHECK_LOCAL_TIMEZONE || 'America/Sao_Paulo');
}

function radarStatusLabel(value) {
 const text = String(value || '').toLowerCase();
 if (!text) return 'Programado';
 if (/cancel|cnl/.test(text)) return 'Cancelado';
 if (/divert|redirect|desvi/.test(text)) return 'Desviado';
 if (/delay|late|atras/.test(text)) return 'Atrasado';
 if (/boarding|embar/.test(text)) return 'Embarcando';
 if (/depart|take.?off|airborne|active|decol/.test(text)) return 'Voo decolado';
 if (/arriv|land|pous|cheg/.test(text)) return 'Pousou';
 if (/on.?time|no hor/.test(text)) return 'No horário';
 if (/sched|program|planned|expected/.test(text)) return 'Programado';
 return String(value || 'Programado');
}

function normalizedStatusConfidence(status) {
 if (!status) return 'baixa';
 if (status.gate || status.terminal || status.confirmedTime || status.estimatedDeparture || status.estimatedArrival) return 'alta';
 if (status.scheduledTime || status.scheduledDeparture || status.scheduledArrival || /Aviationstack|AeroDataBox|AeroAPI|FlightAware|Cirium|FlightStats|Amadeus|oficial/i.test(String(status.source || ''))) return 'media';
 return 'baixa';
}

function radarSanitizedStatus(status, params = {}) {
 const flightNumber = normalizeFlightToken(status?.flightNumber || params.flightNumber || params.flight || '');
 return {
  ok: true,
  flight: flightNumber || null,
  flightNumber: flightNumber || null,
  origin: String(status?.origin || params.origin || '').toUpperCase() || null,
  destination: String(status?.destination || params.destination || '').toUpperCase() || null,
  date: radarIsoDate(status?.date || params.date),
  status: radarStatusLabel(status?.status || status?.flightStatus || status?.state),
  gate: status?.gate ? String(status.gate).toUpperCase() : null,
  terminal: status?.terminal ? String(status.terminal).toUpperCase() : null,
  scheduledDeparture: status?.scheduledDeparture || status?.scheduledTime || null,
  estimatedDeparture: status?.estimatedDeparture || status?.confirmedTime || null,
  scheduledArrival: status?.scheduledArrival || null,
  estimatedArrival: status?.estimatedArrival || null,
  sourceLabel: 'Radar CrewCheck',
  confidence: normalizedStatusConfidence(status),
  updatedAt: status?.updatedAt || new Date().toISOString(),
  message: status?.source ? 'Atualizado pelo Radar CrewCheck.' : 'Status consultado pelo backend do CrewCheck.',
 };
}

function aeroDataBoxCredentials() {
 const apiKey = String(process.env.AERODATABOX_API_KEY || process.env.AERODATABOX_RAPIDAPI_KEY || '').trim();
 const host = String(process.env.AERODATABOX_RAPIDAPI_HOST || 'aerodatabox.p.rapidapi.com').trim();
 const baseUrl = String(process.env.AERODATABOX_BASE_URL || (apiKey && process.env.AERODATABOX_RAPIDAPI_KEY ? `https://${host}` : 'https://prod.api.market/api/v1/aedbx/aerodatabox')).replace(/\/$/, '');
 return { apiKey, host, baseUrl, ready: Boolean(apiKey) };
}

function aeroDataBoxHeaders(credentials) {
 const headers = { accept: 'application/json' };
 if (!credentials?.apiKey) return headers;
 if (/rapidapi/i.test(credentials.baseUrl) || /rapidapi/i.test(credentials.host)) {
  headers['x-rapidapi-key'] = credentials.apiKey;
  headers['x-rapidapi-host'] = credentials.host;
 } else {
  headers['x-api-key'] = credentials.apiKey;
  headers.authorization = `Bearer ${credentials.apiKey}`;
 }
 return headers;
}

function normalizeAeroDataBoxFlight(item, params, source = 'AeroDataBox') {
 const departure = item?.departure || {};
 const arrival = item?.arrival || {};
 const movement = radarPickMovementPart(item, params);
 const part = movement.part || {};
 const number = item?.number || item?.flightNumber || item?.callSign || item?.aircraft?.reg || params.flightNumber;
 const depCode = String(departure?.airport?.iata || departure?.airport?.iataCode || departure?.iata || departure?.iataCode || params.origin || '').toUpperCase();
 const arrCode = String(arrival?.airport?.iata || arrival?.airport?.iataCode || arrival?.iata || arrival?.iataCode || params.destination || '').toUpperCase();
 const scheduled = part?.scheduledTime || part?.scheduledTimeLocal || part?.scheduled || part?.time || null;
 const confirmed = part?.revisedTime || part?.predictedTime || part?.estimatedTime || part?.actualTime || part?.actual || part?.estimated || null;
 return {
  ok: true,
  flightNumber: normalizeFlightToken(number),
  origin: depCode || params.origin,
  destination: arrCode || params.destination,
  date: radarIsoDate(params.date),
  status: radarStatusLabel(item?.status || item?.statusGeneric || item?.movement?.status),
  gate: part?.gate ? String(part.gate).toUpperCase() : null,
  terminal: part?.terminal || part?.terminalCode || part?.terminalName ? String(part.terminal || part.terminalCode || part.terminalName).toUpperCase().slice(0, 8) : null,
  scheduledTime: radarTimeFromObject(scheduled),
  confirmedTime: radarTimeFromObject(confirmed),
  source,
  updatedAt: new Date().toISOString(),
 };
}

function scoreAeroDataBoxFlight(item, params, designator) {
 const number = normalizeFlightToken(item?.number || item?.flightNumber || item?.callSign || '');
 let score = 0;
 if (number && buildFlightCandidates(params).includes(number)) score += 60;
 if (designator?.flightNumber && number.endsWith(designator.flightNumber)) score += 25;
 const dep = String(item?.departure?.airport?.iata || item?.departure?.iata || item?.departure?.iataCode || '').toUpperCase();
 const arr = String(item?.arrival?.airport?.iata || item?.arrival?.iata || item?.arrival?.iataCode || '').toUpperCase();
 if (params.origin && dep === params.origin) score += 12;
 if (params.destination && arr === params.destination) score += 12;
 if (item?.departure?.gate || item?.arrival?.gate) score += 8;
 return score;
}

async function fetchAeroDataBoxFlightStatus(params) {
 const credentials = aeroDataBoxCredentials();
 const designator = primaryFlightDesignator(params);
 if (!credentials.ready || !designator) return null;
 const date = radarIsoDate(params.date);
 const dateTo = radarAddDaysIso(date, 1);
 const cacheKey = `aerodatabox-flight-v10838:${date}:${designator.token}:${params.origin || ''}:${params.destination || ''}`;
 const cached = cacheGet(flightProviderCache, cacheKey, Number(process.env.AERODATABOX_CACHE_TTL_MS || FLIGHT_PROVIDER_CACHE_TTL_MS));
 if (cached !== null && cached !== undefined) return cached;
 const endpoints = [
  `/flights/number/${encodeURIComponent(designator.token)}/${date}`,
  `/flights/number/${encodeURIComponent(designator.token)}/${date}/${dateTo}`,
  `/flights/number/${encodeURIComponent(designator.flightNumber)}/${date}/${dateTo}`,
 ];
 for (const endpoint of endpoints) {
  try {
   const url = new URL(`${credentials.baseUrl}${endpoint}`);
   url.searchParams.set('withAircraftImage', 'false');
   url.searchParams.set('withLocation', 'false');
   const response = await fetch(url, { headers: aeroDataBoxHeaders(credentials), signal: AbortSignal.timeout(Number(process.env.AERODATABOX_TIMEOUT_MS || 12000)) });
   const payload = await response.json().catch(() => null);
   if (!response.ok) continue;
   const rows = Array.isArray(payload) ? payload : (Array.isArray(payload?.flights) ? payload.flights : (Array.isArray(payload?.items) ? payload.items : []));
   let best = null;
   let bestScore = -1;
   for (const item of rows) {
    const score = scoreAeroDataBoxFlight(item, params, designator);
    if (score > bestScore) { best = item; bestScore = score; }
   }
   if (best && bestScore > 0) return cacheSet(flightProviderCache, cacheKey, normalizeAeroDataBoxFlight(best, { ...params, date }, 'AeroDataBox'));
  } catch {}
 }
 return cacheSet(flightProviderCache, cacheKey, null);
}

function flightAwareCredentials() {
 const apiKey = String(process.env.FLIGHTAWARE_API_KEY || process.env.FLIGHTAWARE_AEROAPI_KEY || process.env.AEROAPI_KEY || '').trim();
 const baseUrl = String(process.env.FLIGHTAWARE_API_BASE || process.env.FLIGHTAWARE_AEROAPI_BASE_URL || 'https://aeroapi.flightaware.com/aeroapi').replace(/\/$/, '');
 return { apiKey, baseUrl, ready: Boolean(apiKey) };
}

function normalizeFlightAwareFlight(item, params, designator) {
 const origin = String(item?.origin?.code_iata || item?.origin?.code || item?.origin_iata || params.origin || '').toUpperCase();
 const destination = String(item?.destination?.code_iata || item?.destination?.code || item?.destination_iata || params.destination || '').toUpperCase();
 const selectedDeparture = !params.destination || params.origin || item?.gate_origin || item?.terminal_origin;
 const gate = selectedDeparture ? item?.gate_origin : item?.gate_destination;
 const terminal = selectedDeparture ? item?.terminal_origin : item?.terminal_destination;
 const scheduled = selectedDeparture ? (item?.scheduled_out || item?.filed_departure_time || item?.estimated_out) : (item?.scheduled_in || item?.filed_arrival_time || item?.estimated_in);
 const confirmed = selectedDeparture ? (item?.actual_out || item?.estimated_out || item?.actual_off || item?.estimated_off) : (item?.actual_in || item?.estimated_in || item?.actual_on || item?.estimated_on);
 return {
  ok: true,
  flightNumber: normalizeFlightToken(item?.ident_iata || item?.ident || `${designator?.carrierCode || ''}${designator?.flightNumber || ''}`),
  origin,
  destination,
  date: radarIsoDate(params.date),
  status: radarStatusLabel(item?.status || (item?.cancelled ? 'cancelled' : 'scheduled')),
  gate: gate ? String(gate).toUpperCase() : null,
  terminal: terminal ? String(terminal).toUpperCase() : null,
  scheduledTime: normalizeTime(scheduled, params.displayTimeZone),
  confirmedTime: normalizeTime(confirmed, params.displayTimeZone),
  source: 'FlightAware AeroAPI',
  updatedAt: new Date().toISOString(),
 };
}

async function fetchFlightAwareAeroApiStatus(params) {
 const credentials = flightAwareCredentials();
 const designator = primaryFlightDesignator(params);
 if (!credentials.ready || !designator) return null;
 const date = radarIsoDate(params.date);
 const start = `${date}T00:00:00Z`;
 const end = `${radarAddDaysIso(date, 1)}T23:59:59Z`;
 const cacheKey = `flightaware-aeroapi-v10838:${date}:${designator.token}:${params.origin || ''}:${params.destination || ''}`;
 const cached = cacheGet(flightProviderCache, cacheKey, Number(process.env.FLIGHTAWARE_CACHE_TTL_MS || FLIGHT_PROVIDER_CACHE_TTL_MS));
 if (cached !== null && cached !== undefined) return cached;
 try {
  const url = new URL(`${credentials.baseUrl}/flights/${encodeURIComponent(designator.token)}`);
  url.searchParams.set('start', start);
  url.searchParams.set('end', end);
  url.searchParams.set('max_pages', '1');
  const response = await fetch(url, { headers: { accept: 'application/json', 'x-apikey': credentials.apiKey }, signal: AbortSignal.timeout(Number(process.env.FLIGHTAWARE_TIMEOUT_MS || 12000)) });
  const payload = await response.json().catch(() => null);
  if (!response.ok) return cacheSet(flightProviderCache, cacheKey, null);
  const rows = Array.isArray(payload?.flights) ? payload.flights : [];
  let best = null;
  let bestScore = -1;
  for (const item of rows) {
   let score = 0;
   const ident = normalizeFlightToken(item?.ident_iata || item?.ident || '');
   if (buildFlightCandidates(params).includes(ident)) score += 50;
   if (params.origin && airportMatches(item?.origin?.code_iata || item?.origin?.code, params.origin)) score += 12;
   if (params.destination && airportMatches(item?.destination?.code_iata || item?.destination?.code, params.destination)) score += 12;
   if (item?.gate_origin || item?.gate_destination || item?.terminal_origin || item?.terminal_destination) score += 10;
   if (score > bestScore) { best = item; bestScore = score; }
  }
  if (!best || bestScore <= 0) return cacheSet(flightProviderCache, cacheKey, null);
  return cacheSet(flightProviderCache, cacheKey, normalizeFlightAwareFlight(best, params, designator));
 } catch {
  return cacheSet(flightProviderCache, cacheKey, null);
 }
}


function flightAwareAirportCode(value) {
 if (!value) return '';
 if (typeof value === 'string') return String(value || '').toUpperCase().replace(/[^A-Z]/g, '').slice(-3);
 return String(value?.code_iata || value?.iata || value?.code || value?.airport_code || value?.fs || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
}

function flightAwareIdentIata(item = {}) {
 const identIata = normalizeFlightToken(item.ident_iata || item.identIata || '');
 if (identIata) return identIata;
 const op = normalizeFlightToken(item.operator_iata || item.operatorIata || item.operator || '').replace(/[^A-Z0-9]/g, '');
 const num = String(item.flight_number || item.flightNumber || '').replace(/\D/g, '');
 if (op && num) return normalizeFlightToken(`${op}${num}`);
 return normalizeFlightToken(item.ident || item.fa_flight_id || '');
}

function flightAwareBoardTime(item = {}, type = 'departure', confirmed = false, timeZone = process.env.CREWCHECK_LOCAL_TIMEZONE || 'America/Sao_Paulo') {
 const outScheduled = item.scheduled_out || item.filed_departure_time || item.scheduled_off;
 const outConfirmed = item.actual_out || item.estimated_out || item.actual_off || item.estimated_off || outScheduled;
 const inScheduled = item.scheduled_in || item.filed_arrival_time || item.scheduled_on;
 const inConfirmed = item.actual_in || item.estimated_in || item.actual_on || item.estimated_on || inScheduled;
 return normalizeTime(confirmed ? (type === 'arrival' ? inConfirmed : outConfirmed) : (type === 'arrival' ? inScheduled : outScheduled), timeZone);
}

function normalizeFlightAwareBoardRow(item = {}, params = {}) {
 const type = params.type === 'arrival' ? 'arrival' : 'departure';
 const flightNumber = flightAwareIdentIata(item);
 const origin = flightAwareAirportCode(item.origin) || String(params.origin || '').toUpperCase();
 const destination = flightAwareAirportCode(item.destination) || String(params.destination || '').toUpperCase();
 const airlineCode = normalizeFlightToken(item.operator_iata || flightNumber.match(/^[A-Z]{1,3}/)?.[0] || '');
 const gate = type === 'arrival' ? (item.gate_destination || item.arrival_gate || item.gate) : (item.gate_origin || item.departure_gate || item.gate);
 const terminal = type === 'arrival' ? (item.terminal_destination || item.arrival_terminal || item.terminal) : (item.terminal_origin || item.departure_terminal || item.terminal);
 const statusRaw = item.status || (item.cancelled ? 'cancelled' : (item.actual_out || item.actual_in ? 'active' : 'scheduled'));
 return {
  flightNumber,
  airlineCode,
  airlineName: normalizeAirportBoardAirlineName(airlineCode, item.operator || item.operator_name || ''),
  airport: params.airport,
  type,
  origin,
  destination,
  relatedAirport: type === 'departure' ? destination : origin,
  gate: gate ? String(gate).toUpperCase() : null,
  terminal: terminal ? String(terminal).toUpperCase() : null,
  scheduledTime: flightAwareBoardTime(item, type, false, params.displayTimeZone),
  confirmedTime: flightAwareBoardTime(item, type, true, params.displayTimeZone),
  status: radarStatusLabel(statusRaw),
  source: 'FlightAware AeroAPI',
  externalLinks: [],
 };
}

function flightAwareBoardEndpoints(type) {
 return type === 'arrival'
  ? ['scheduled_arrivals', 'arrivals']
  : ['scheduled_departures', 'departures'];
}

async function fetchFlightAwareAirportBoard({ airport, type, airline, limit, diagnostics, date, refresh = false }) {
 const credentials = flightAwareCredentials();
 if (!credentials.ready) {
  diagnostics?.push?.({ provider: 'FlightAware', ok: false, reason: 'FLIGHTAWARE_API_KEY ausente no Render' });
  return { rows: [], source: 'FlightAware não configurado' };
 }
 const dayIso = /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) ? String(date) : todayIsoInBrazil();
 const start = `${dayIso}T00:00:00Z`;
 const end = `${radarAddDaysIso(dayIso, 1)}T03:00:00Z`;
 const cacheKey = `flightaware-board-v108126:${airport}:${type}:${airline}:${limit}:${dayIso}`;
 const cached = refresh ? null : cacheGet(flightProviderCache, cacheKey, Number(process.env.FLIGHTAWARE_BOARD_CACHE_TTL_MS || 10 * 60 * 1000));
 if (cached && rowsAreUseful(cached.rows)) return cached;
 let lastReason = '';
 for (const endpoint of flightAwareBoardEndpoints(type)) {
  try {
   const url = new URL(`${credentials.baseUrl}/airports/${encodeURIComponent(airport)}/flights/${endpoint}`);
   url.searchParams.set('start', start);
   url.searchParams.set('end', end);
   url.searchParams.set('max_pages', '1');
   const response = await fetch(url, { headers: { accept: 'application/json', 'x-apikey': credentials.apiKey }, signal: AbortSignal.timeout(Number(process.env.FLIGHTAWARE_TIMEOUT_MS || 15000)) });
   const payload = await response.json().catch(() => null);
   if (!response.ok) {
    const reason = payload?.error || payload?.message || `FLIGHTAWARE_HTTP_${response.status}`;
    lastReason = String(reason);
    diagnostics?.push?.({ provider: 'FlightAware', endpoint, ok: false, status: response.status, reason: lastReason });
    continue;
   }
   const raw = Array.isArray(payload?.flights) ? payload.flights : (Array.isArray(payload?.[endpoint]) ? payload[endpoint] : (Array.isArray(payload) ? payload : []));
   const rows = raw
    .map((item) => normalizeFlightAwareBoardRow(item, { airport, type, date: dayIso }))
    .filter((row) => row.flightNumber || row.relatedAirport)
    .filter((row) => airlineCodeMatches(row.airlineCode, airline))
    .filter((row) => !isFinalAirportBoardStatusServer(row.status))
    .sort((a, b) => String(a.confirmedTime || a.scheduledTime || '99:99').localeCompare(String(b.confirmedTime || b.scheduledTime || '99:99')))
    .slice(0, Math.min(Number(limit || 60), 100));
   diagnostics?.push?.({ provider: 'FlightAware', endpoint, ok: true, count: rows.length });
   if (rowsAreUseful(rows)) {
    return cacheSet(flightProviderCache, cacheKey, { rows, source: `FlightAware AeroAPI /${endpoint}`, provider: 'FLIGHTAWARE' });
   }
  } catch (error) {
   lastReason = error?.message || String(error);
   diagnostics?.push?.({ provider: 'FlightAware', endpoint, ok: false, reason: lastReason });
  }
 }
 return { rows: [], source: lastReason ? `FlightAware sem voos retornados (${lastReason})` : 'FlightAware sem voos retornados' };
}


async function fetchFlightStatsSingleStatus(params) {
 const credentials = flightStatsCredentials();
 const designator = primaryFlightDesignator(params);
 if (!credentials.ready || !designator) return null;
 const date = radarIsoDate(params.date);
 const [year, month, day] = date.split('-').map((part) => Number(part));
 const cacheKey = `flightstats-single-v10838:${date}:${designator.carrierCode}:${designator.flightNumber}:${params.origin || ''}:${params.destination || ''}`;
 const cached = cacheGet(flightProviderCache, cacheKey, Number(process.env.FLIGHTSTATS_CACHE_TTL_MS || FLIGHT_PROVIDER_CACHE_TTL_MS));
 if (cached !== null && cached !== undefined) return cached;
 try {
  const base = String(process.env.FLIGHTSTATS_BASE_URL || 'https://api.flightstats.com/flex/flightstatus/rest/v2/json').replace(/\/$/, '');
  const url = new URL(`${base}/flight/status/${designator.carrierCode}/${designator.flightNumber}/${year}/${month}/${day}`);
  url.searchParams.set('appId', credentials.appId);
  url.searchParams.set('appKey', credentials.appKey);
  url.searchParams.set('utc', 'false');
  url.searchParams.set('codeType', 'IATA');
  url.searchParams.set('extendedOptions', 'useInlinedReferences');
  url.searchParams.set('includeNewFields', 'true');
  const response = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(Number(process.env.FLIGHTSTATS_TIMEOUT_MS || 12000)) });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.error) return cacheSet(flightProviderCache, cacheKey, null);
  const rows = Array.isArray(payload?.flightStatuses) ? payload.flightStatuses : [];
  let best = null;
  let bestScore = -1;
  for (const item of rows) {
   let score = 0;
   if (String(item?.flightNumber || '') === String(designator.flightNumber)) score += 35;
   if (String(item?.carrierFsCode || '').toUpperCase() === designator.carrierCode) score += 20;
   if (params.origin && airportMatches(item?.departureAirportFsCode, params.origin)) score += 12;
   if (params.destination && airportMatches(item?.arrivalAirportFsCode, params.destination)) score += 12;
   if (item?.airportResources?.departureGate || item?.airportResources?.arrivalGate) score += 10;
   if (score > bestScore) { best = item; bestScore = score; }
  }
  if (!best || bestScore <= 0) return cacheSet(flightProviderCache, cacheKey, null);
  const type = params.origin ? 'departure' : (params.destination ? 'arrival' : 'departure');
  const row = normalizeFlightStatsBoardRow(best, type, params.origin || params.destination || best.departureAirportFsCode || '', payload?.appendix || {});
  return cacheSet(flightProviderCache, cacheKey, {
   ok: true,
   flightNumber: row.flightNumber,
   origin: row.origin,
   destination: row.destination,
   date,
   status: row.status,
   gate: row.gate,
   terminal: row.terminal,
   scheduledTime: row.scheduledTime,
   confirmedTime: row.confirmedTime,
   source: 'Cirium FlightStats',
   updatedAt: new Date().toISOString(),
  });
 } catch {
  return cacheSet(flightProviderCache, cacheKey, null);
 }
}

async function fetchAeroDataBoxAirportBoard({ airport, type, airline, limit, diagnostics, date, displayTimeZone }) {
 const credentials = aeroDataBoxCredentials();
 if (!credentials.ready) {
  diagnostics?.push?.({ provider: 'AeroDataBox', ok: false, reason: 'AERODATABOX_API_KEY ausente no Render' });
  return { rows: [], source: 'AeroDataBox não configurado' };
 }
 const dayIso = /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) ? String(date) : todayIsoInBrazil();
 const from = `${dayIso}T00:00:00`;
 const to = `${dayIso}T23:59:59`;
 const direction = type === 'arrival' ? 'Arrival' : 'Departure';
 const cacheKey = `aerodatabox-board-v108109:${airport}:${type}:${airline}:${limit}:${dayIso}`;
 const cached = cacheGet(flightProviderCache, cacheKey, Number(process.env.AERODATABOX_BOARD_CACHE_TTL_MS || 5 * 60 * 1000));
 if (cached) return cached;
 try {
  const url = new URL(`${credentials.baseUrl}/flights/airports/iata/${airport}/${from}/${to}`);
  url.searchParams.set('direction', direction);
  url.searchParams.set('withCancelled', 'true');
  url.searchParams.set('withCodeshared', 'true');
  url.searchParams.set('withCargo', String(process.env.AIRPORT_BOARD_WITH_CARGO || 'true').toLowerCase() === 'false' ? 'false' : 'true');
  url.searchParams.set('withPrivate', 'false');
  url.searchParams.set('withLocation', 'false');
  const response = await fetch(url, { headers: aeroDataBoxHeaders(credentials), signal: AbortSignal.timeout(Number(process.env.AERODATABOX_TIMEOUT_MS || 12000)) });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`AERODATABOX_HTTP_${response.status}`);
  const rowsRaw = Array.isArray(payload?.departures) ? payload.departures : (Array.isArray(payload?.arrivals) ? payload.arrivals : (Array.isArray(payload) ? payload : []));
  const rows = rowsRaw
   .map((item) => normalizeAeroDataBoxFlight(item, { origin: type === 'departure' ? airport : '', destination: type === 'arrival' ? airport : '', date: dayIso }, 'AeroDataBox'))
   .map((row) => ({
    flightNumber: row.flightNumber,
    airlineCode: normalizeFlightToken(row.flightNumber || '').match(/^[A-Z]{1,3}/)?.[0] || '',
    airlineName: normalizeAirportBoardAirlineName(normalizeFlightToken(row.flightNumber || '').match(/^[A-Z]{1,3}/)?.[0] || '', ''),
    airport,
    type,
    origin: row.origin,
    destination: row.destination,
    relatedAirport: type === 'departure' ? row.destination : row.origin,
    gate: row.gate,
    terminal: row.terminal,
    scheduledTime: row.scheduledTime,
    confirmedTime: row.confirmedTime,
    status: row.status,
    source: 'AeroDataBox',
    externalLinks: [],
   }))
   .filter((row) => row.flightNumber || row.relatedAirport)
   .filter((row) => airlineCodeMatches(row.airlineCode, airline))
   .slice(0, Math.min(Number(limit || 60), 80));
  diagnostics?.push?.({ provider: 'AeroDataBox', endpoint: 'airport-board', ok: true, count: rows.length });
  return cacheSet(flightProviderCache, cacheKey, { rows, source: 'AeroDataBox' });
 } catch (error) {
  diagnostics?.push?.({ provider: 'AeroDataBox', endpoint: 'airport-board', ok: false, reason: error?.message || String(error) });
  return cacheSet(flightProviderCache, cacheKey, { rows: [], source: 'AeroDataBox indisponível' });
 }
}


function sabreReady() {
 return Boolean(SABRE_ENABLED && SABRE_USERNAME && SABRE_PASSWORD && (SABRE_AUTH_VERSION !== 'v3' || (SABRE_CLIENT_ID && SABRE_CLIENT_SECRET)));
}

function sabreAuthHeader() {
 // Sabre v2/test Developer Hub commonly uses Basic base64(base64(username):base64(password)).
 // For v3, Client ID/Secret can still be supplied via body/environment depending on the Sabre product setup.
 const user64 = Buffer.from(SABRE_USERNAME, 'utf8').toString('base64');
 const pass64 = Buffer.from(SABRE_PASSWORD, 'utf8').toString('base64');
 return `Basic ${Buffer.from(`${user64}:${pass64}`, 'utf8').toString('base64')}`;
}

async function getSabreSessionlessToken({ force = false, diagnostics = [] } = {}) {
 if (!SABRE_ENABLED) return null;
 if (!sabreReady()) {
  diagnostics.push({ provider: 'Sabre', ok: false, reason: SABRE_AUTH_VERSION === 'v3' ? 'Configure SABRE_USERNAME, SABRE_PASSWORD, SABRE_CLIENT_ID e SABRE_CLIENT_SECRET no Render.' : 'Configure SABRE_USERNAME e SABRE_PASSWORD no Render.' });
  return null;
 }
 if (!force && sabreTokenCache.token && Date.now() < sabreTokenCache.expiresAt - 120_000) {
  diagnostics.push({ provider: 'Sabre', ok: true, cached: true, reason: 'token sessionless em cache' });
  return sabreTokenCache.token;
 }
 const body = new URLSearchParams({ grant_type: 'client_credentials' });
 if (SABRE_AUTH_VERSION === 'v3' && SABRE_CLIENT_ID && SABRE_CLIENT_SECRET) {
  body.set('username', SABRE_USERNAME);
  body.set('password', SABRE_PASSWORD);
  body.set('client_id', SABRE_CLIENT_ID);
  body.set('client_secret', SABRE_CLIENT_SECRET);
 }
 try {
  const response = await fetch(SABRE_TOKEN_URL, {
   method: 'POST',
   headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded', authorization: sabreAuthHeader(), 'user-agent': 'CrewCheck/10.8.127 SabreAuth' },
   body,
   signal: AbortSignal.timeout(SABRE_TIMEOUT_MS),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
   const reason = payload?.error_description || payload?.error || payload?.message || `SABRE_HTTP_${response.status}`;
   diagnostics.push({ provider: 'Sabre', ok: false, status: response.status, reason });
   return null;
  }
  const token = String(payload?.access_token || payload?.token || payload?.BinarySecurityToken || payload?.TokenCreateRS?.BinarySecurityToken || '').trim();
  const expiresIn = Math.max(600, Number(payload?.expires_in || payload?.expiresIn || 604800));
  if (!token) {
   diagnostics.push({ provider: 'Sabre', ok: false, reason: 'Token Sabre não encontrado na resposta.' });
   return null;
  }
  sabreTokenCache = { token, expiresAt: Date.now() + expiresIn * 1000, source: SABRE_AUTH_VERSION };
  diagnostics.push({ provider: 'Sabre', ok: true, expiresIn, authVersion: SABRE_AUTH_VERSION });
  return token;
 } catch (error) {
  diagnostics.push({ provider: 'Sabre', ok: false, reason: error?.message || String(error) });
  return null;
 }
}

async function sabreHealthSnapshot({ testToken = false } = {}) {
 const diagnostics = [];
 let tokenOk = false;
 if (testToken || String(process.env.SABRE_HEALTH_TEST_TOKEN || 'false').toLowerCase() === 'true') {
  const token = await getSabreSessionlessToken({ force: true, diagnostics });
  tokenOk = Boolean(token);
 }
 return {
  ok: sabreReady() && (!testToken || tokenOk),
  enabled: SABRE_ENABLED,
  ready: sabreReady(),
  environment: SABRE_ENV,
  authVersion: SABRE_AUTH_VERSION,
  tokenUrlConfigured: Boolean(SABRE_TOKEN_URL),
  restBase: SABRE_REST_BASE,
  hasUsername: Boolean(SABRE_USERNAME),
  hasPassword: Boolean(SABRE_PASSWORD),
  hasClientId: Boolean(SABRE_CLIENT_ID),
  hasClientSecret: Boolean(SABRE_CLIENT_SECRET),
  tokenTested: Boolean(testToken),
  tokenOk,
  tokenCached: Boolean(sabreTokenCache.token && Date.now() < sabreTokenCache.expiresAt),
  diagnostics,
  message: sabreReady() ? 'Sabre configurado. Use testToken=1 apenas para validar token e evitar chamadas desnecessárias.' : 'Sabre ainda não está pronto. Configure as variáveis de ambiente no Render.',
  updatedAt: new Date().toISOString(),
 };
}

function radarProviderStatus() {
 return {
  official: true,
  aviationstack: Boolean(aviationstackAccessKey()),
  flightstats: flightStatsCredentials().ready,
  aerodatabox: aeroDataBoxCredentials().ready,
  flightaware: flightAwareCredentials().ready,
  flightawareAeroAPI: flightAwareCredentials().ready,
  amadeus: Boolean(process.env.AMADEUS_CLIENT_ID && process.env.AMADEUS_CLIENT_SECRET),
  serpapi: Boolean(SERPAPI_API_KEY),
  searchapi: Boolean(SEARCHAPI_API_KEY),
  sabre: sabreReady(),
 };
}

function isMoreUsefulFlightStatus(snapshot) {
 if (!snapshot) return false;
 return Boolean(snapshot.gate || snapshot.terminal || snapshot.confirmedTime || snapshot.scheduledTime || /Aviationstack|Amadeus|BSB Aero oficial|GRU Airport oficial/i.test(String(snapshot.source || '')));
}

async function getFlightStatusSnapshot(query) {
 const flightNumber = String(query.get('flightNumber') || query.get('flight') || query.get('number') || query.get('designator') || '').replace(/\s+/g, '').toUpperCase().slice(0, 16);
 const origin = String(query.get('origin') || '').toUpperCase().slice(0, 4);
 const destination = String(query.get('destination') || '').toUpperCase().slice(0, 4);
 const date = String(query.get('date') || '').slice(0, 10);
 const codes = String(query.get('codes') || '').toUpperCase().slice(0, 128);
 const route = String(query.get('route') || '').toUpperCase().slice(0, 64);
 const airport = String(query.get('airport') || '').toUpperCase().slice(0, 4);
 const updatedAt = new Date().toISOString();
 const queryBase = { flightNumber, origin, destination, date, codes, route, airport };

 let bsbStatus = null;
 if (shouldUseBsbAero(queryBase)) {
  bsbStatus = await fetchBsbAeroFlightStatus(queryBase);
  if (isMoreUsefulFlightStatus(bsbStatus) && bsbStatus.source === 'BSB Aero oficial') return bsbStatus;
 }

 let gruStatus = null;
 if (shouldUseOfficialAirport(queryBase, 'GRU')) {
  gruStatus = await fetchOfficialAirportFlightStatus(queryBase, 'GRU');
  if (isMoreUsefulFlightStatus(gruStatus) && /GRU Airport oficial/i.test(String(gruStatus.source || ''))) return gruStatus;
 }

 const flightStatsStatus = await fetchFlightStatsSingleStatus(queryBase);
 if (isMoreUsefulFlightStatus(flightStatsStatus)) return flightStatsStatus;

 const aeroDataBoxStatus = await fetchAeroDataBoxFlightStatus(queryBase);
 if (isMoreUsefulFlightStatus(aeroDataBoxStatus)) return aeroDataBoxStatus;

 const flightAwareStatus = await fetchFlightAwareAeroApiStatus(queryBase);
 if (isMoreUsefulFlightStatus(flightAwareStatus)) return flightAwareStatus;

 const aviationstackTimetable = await fetchAviationstackTimetableStatus(queryBase);
 if (isMoreUsefulFlightStatus(aviationstackTimetable)) return aviationstackTimetable;

 const aviationstackFlights = await fetchAviationstackFlightsStatus(queryBase);
 if (isMoreUsefulFlightStatus(aviationstackFlights)) return aviationstackFlights;

 const amadeusStatus = await fetchAmadeusOnDemandStatus(queryBase);
 if (isMoreUsefulFlightStatus(amadeusStatus)) return amadeusStatus;

 if (gruStatus) return gruStatus;
 if (bsbStatus) return bsbStatus;

 // Provedor opcional. Configure FLIGHT_STATUS_ENDPOINT com uma URL interna/proxy
 // que aceite flightNumber/origin/destination/date. Sem provedor, o CrewCheck
 // retorna estrutura segura para a UI, sem inventar portão/status.
 const provider = String(process.env.FLIGHT_STATUS_ENDPOINT || '').trim();
 if (provider) {
  try {
   const providerUrl = new URL(provider);
   providerUrl.searchParams.set('flightNumber', flightNumber);
   providerUrl.searchParams.set('codes', codes);
   if (origin) providerUrl.searchParams.set('origin', origin);
   if (destination) providerUrl.searchParams.set('destination', destination);
   if (date) providerUrl.searchParams.set('date', date);
   const response = await fetch(providerUrl, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(6500) });
   if (response.ok) {
    const payload = await response.json();
    return {
     ok: true,
     flightNumber,
     origin,
     destination,
     date,
     status: String(payload.status || payload.flightStatus || payload.state || 'Scheduled'),
     gate: payload.gate ? String(payload.gate) : null,
     terminal: payload.terminal ? String(payload.terminal) : null,
     scheduledTime: payload.scheduledTime ? String(payload.scheduledTime) : null,
     confirmedTime: payload.confirmedTime ? String(payload.confirmedTime) : null,
     source: payload.source || 'provedor externo',
     updatedAt,
    };
   }
  } catch (error) {
   return { ok: true, flightNumber, origin, destination, date, status: 'Scheduled', gate: null, terminal: null, source: 'provedor indisponível', updatedAt };
  }
 }

 return { ok: true, flightNumber, origin, destination, date, status: 'Scheduled', gate: null, terminal: null, source: shouldUseBsbAero(queryBase) ? 'BSB Aero oficial: voo não localizado' : (shouldUseOfficialAirport(queryBase, 'GRU') ? 'GRU Airport oficial: voo não localizado' : 'Sem dados online'), updatedAt };
}


const CREWCHECK_AIRPORT_COORDS = {
 BSB: { name: 'Aeroporto de Brasília', lat: -15.8697, lng: -47.9208 },
 GRU: { name: 'Aeroporto de Guarulhos', lat: -23.4356, lng: -46.4731 },
 CGH: { name: 'Aeroporto de Congonhas', lat: -23.6267, lng: -46.6554 },
 GIG: { name: 'Galeão', lat: -22.809999, lng: -43.250557 },
 SDU: { name: 'Santos Dumont', lat: -22.9105, lng: -43.1631 },
 CNF: { name: 'Confins', lat: -19.6244, lng: -43.9719 },
 VCP: { name: 'Viracopos', lat: -23.0074, lng: -47.1345 },
 POA: { name: 'Porto Alegre', lat: -29.9944, lng: -51.1714 },
 CWB: { name: 'Curitiba', lat: -25.5317, lng: -49.1761 },
 SSA: { name: 'Salvador', lat: -12.9086, lng: -38.3225 },
 REC: { name: 'Recife', lat: -8.1265, lng: -34.9236 },
 FOR: { name: 'Fortaleza', lat: -3.7763, lng: -38.5326 },
 NAT: { name: 'Natal', lat: -5.7681, lng: -35.3761 },
 MAO: { name: 'Manaus', lat: -3.0386, lng: -60.0497 },
 BEL: { name: 'Belém', lat: -1.3793, lng: -48.4763 },
 FLN: { name: 'Florianópolis', lat: -27.6705, lng: -48.5525 },
 IGU: { name: 'Foz do Iguaçu', lat: -25.6003, lng: -54.4850 },
 AJU: { name: 'Aeroporto de Aracaju', lat: -10.9840, lng: -37.0703 },
 JPA: { name: 'Aeroporto de João Pessoa', lat: -7.1484, lng: -34.9507 },
 MCZ: { name: 'Aeroporto de Maceió', lat: -9.5108, lng: -35.7917 },
 VIX: { name: 'Aeroporto de Vitória', lat: -20.2581, lng: -40.2864 },
 GYN: { name: 'Aeroporto de Goiânia', lat: -16.6319, lng: -49.2207 },
 CGB: { name: 'Aeroporto de Cuiabá', lat: -15.6529, lng: -56.1167 },
 CGR: { name: 'Aeroporto de Campo Grande', lat: -20.4687, lng: -54.6725 },
 SLZ: { name: 'Aeroporto de São Luís', lat: -2.5854, lng: -44.2341 },
 THE: { name: 'Aeroporto de Teresina', lat: -5.0603, lng: -42.8235 },
 PVH: { name: 'Aeroporto de Porto Velho', lat: -8.7093, lng: -63.9023 },
 RBR: { name: 'Aeroporto de Rio Branco', lat: -9.8689, lng: -67.8981 },
 BVB: { name: 'Aeroporto de Boa Vista', lat: 2.8414, lng: -60.6922 },
 PMW: { name: 'Aeroporto de Palmas', lat: -10.2915, lng: -48.3569 },
 MCP: { name: 'Aeroporto de Macapá', lat: 0.0507, lng: -51.0722 },
 NVT: { name: 'Aeroporto de Navegantes', lat: -26.8794, lng: -48.6508 },
 JOI: { name: 'Aeroporto de Joinville', lat: -26.2245, lng: -48.7974 },
 LDB: { name: 'Aeroporto de Londrina', lat: -23.3336, lng: -51.1301 },
 MGF: { name: 'Aeroporto de Maringá', lat: -23.4764, lng: -52.0164 },
 RAO: { name: 'Aeroporto de Ribeirão Preto', lat: -21.1364, lng: -47.7767 },
 UDI: { name: 'Aeroporto de Uberlândia', lat: -18.8836, lng: -48.2253 },
 IOS: { name: 'Aeroporto de Ilhéus', lat: -14.8159, lng: -39.0332 },
 BPS: { name: 'Aeroporto de Porto Seguro', lat: -16.4386, lng: -39.0809 },
};

const commuteCache = new Map();

function parseFiniteNumber(value, fallback = null) {
 const number = Number(value);
 return Number.isFinite(number) ? number : fallback;
}

function parseDurationSeconds(value) {
 if (typeof value === 'number') return Math.max(0, Math.round(value));
 const match = String(value || '').match(/^(\d+(?:\.\d+)?)s$/);
 return match ? Math.max(0, Math.round(Number(match[1]))) : null;
}

function haversineKm(a, b) {
 const toRad = (value) => (Number(value) * Math.PI) / 180;
 const radiusKm = 6371;
 const dLat = toRad(b.lat - a.lat);
 const dLng = toRad(b.lng - a.lng);
 const lat1 = toRad(a.lat);
 const lat2 = toRad(b.lat);
 const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
 return 2 * radiusKm * Math.asin(Math.sqrt(h));
}

function normalizeAirportCode(value, fallback = 'BSB') {
 const code = String(value || '').trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
 return CREWCHECK_AIRPORT_COORDS[code] ? code : fallback;
}

function isoOrNull(value) {
 const date = new Date(String(value || ''));
 return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function formatClockIso(date) {
 try {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: process.env.CREWCHECK_LOCAL_TIMEZONE || 'America/Sao_Paulo' }).format(date);
 } catch {
  return date.toISOString().slice(11, 16);
 }
}

function getCommuteCacheKey(params) {
 const latBucket = Math.round(Number(params.lat) * 1000) / 1000;
 const lngBucket = Math.round(Number(params.lng) * 1000) / 1000;
 const targetBucket = Math.floor(new Date(params.targetIso).getTime() / (5 * 60_000));
 return `${latBucket}:${lngBucket}:${params.airport}:${targetBucket}:${params.marginMinutes}:${params.mode || 'DRIVE'}`;
}

function buildTomTomGoNavigationUrl({ destination }) {
 try {
  const lat = Number(destination?.lat);
  const lng = Number(destination?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return 'https://plan.tomtom.com/';
  return `tomtomgo://x-callback-url/navigate?destination=${lat.toFixed(6)},${lng.toFixed(6)}`;
 } catch {
  return 'https://plan.tomtom.com/';
 }
}

function buildTomTomPlanUrl({ destination }) {
 try {
  const lat = Number(destination?.lat);
  const lng = Number(destination?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return 'https://plan.tomtom.com/';
  const point = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  return `https://plan.tomtom.com/?destination=${encodeURIComponent(point)}&routeType=fastest&traffic=true`;
 } catch {
  return 'https://plan.tomtom.com/';
 }
}


function buildGoogleMapsWebRouteUrl({ destination }) {
 try {
  const lat = Number(destination?.lat);
  const lng = Number(destination?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return 'https://www.google.com/maps';
  const point = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(point)}&travelmode=driving`;
 } catch {
  return 'https://www.google.com/maps';
 }
}

function getTomTomServerKey() {
 return String(process.env.TOMTOM_API_KEY || process.env.TOMTOM_ROUTING_API_KEY || process.env.CREWCHECK_TOMTOM_API_KEY || '').trim();
}

/* CREWCHECK_V10862_ADDRESS_ROUTES_RELIABLE_START */
function normalizeBrazilCep(value) {
 const digits = String(value || '').replace(/\D/g, '').slice(0, 8);
 return digits.length === 8 ? digits : '';
}

function sanitizePublicError(value) {
 return String(value || '')
  .replace(/AIza[0-9A-Za-z_\-]+/g, 'AIza***')
  .replace(/key=([^&\s]+)/gi, 'key=***')
  .slice(0, 260);
}

function getGoogleServerKey() {
 return String(process.env.GOOGLE_ROUTES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_GEOCODING_API_KEY || '').trim();
}

function extractAddressPart(addressComponents = [], type) {
 const item = Array.isArray(addressComponents) ? addressComponents.find((component) => Array.isArray(component.types) && component.types.includes(type)) : null;
 return item?.long_name || item?.short_name || '';
}

function normalizeGeocodeResult(result, source = 'Google Geocoding') {
 const location = result?.geometry?.location || result?.geometry?.viewport?.northeast || null;
 if (!location || typeof location.lat !== 'number' || typeof location.lng !== 'number') return null;
 const components = result.address_components || [];
 return {
  ok: true,
  formattedAddress: result.formatted_address || '',
  lat: location.lat,
  lng: location.lng,
  placeId: result.place_id || null,
  precision: result.geometry?.location_type || result.geometry?.locationType || 'GEOCODED',
  postalCode: extractAddressPart(components, 'postal_code'),
  neighborhood: extractAddressPart(components, 'sublocality') || extractAddressPart(components, 'sublocality_level_1') || extractAddressPart(components, 'neighborhood'),
  city: extractAddressPart(components, 'administrative_area_level_2'),
  state: extractAddressPart(components, 'administrative_area_level_1'),
  country: extractAddressPart(components, 'country'),
  source,
 };
}

function normalizeTomTomGeocodeResult(result) {
 const position = result?.position || {};
 const lat = Number(position.lat);
 const lng = Number(position.lon ?? position.lng);
 if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
 const address = result.address || {};
 return {
  ok: true,
  formattedAddress: result.address?.freeformAddress || result.poi?.name || '',
  lat,
  lng,
  placeId: result.id || null,
  precision: result.type || result.score ? 'TOMTOM_GEOCODED' : 'GEOCODED',
  postalCode: address.postalCode || '',
  neighborhood: address.municipalitySubdivision || '',
  city: address.municipality || address.localName || '',
  state: address.countrySubdivision || '',
  country: address.country || address.countryCode || '',
  source: 'TomTom Search',
 };
}

async function geocodeTomTomAddress({ queryAddress, normalizedCep }) {
 const key = getTomTomServerKey();
 const query = String(queryAddress || '').trim();
 if (!key || !query) return null;
 try {
  const url = new URL(`https://api.tomtom.com/search/2/geocode/${encodeURIComponent(query)}.json`);
  url.searchParams.set('key', key);
  url.searchParams.set('language', 'pt-BR');
  url.searchParams.set('countrySet', 'BR');
  url.searchParams.set('limit', '1');
  if (normalizedCep) url.searchParams.set('postalCode', normalizedCep);
  const response = await fetch(url, { signal: AbortSignal.timeout(9000) });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`TOMTOM_GEOCODE_${response.status}`);
  const best = normalizeTomTomGeocodeResult(payload?.results?.[0]);
  return best ? { ...best, rawSource: 'tomtom' } : null;
 } catch (error) {
  return { ok: false, code: String(error?.message || 'TOMTOM_GEOCODE_ERROR'), message: 'TomTom Search indisponível ou sem resultado.' };
 }
}

async function lookupViaCep(cep) {
 const normalized = normalizeBrazilCep(cep);
 if (!normalized) return null;
 try {
  const response = await fetch(`https://viacep.com.br/ws/${normalized}/json/`, { signal: AbortSignal.timeout(6500) });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data || data.erro) return null;
  const address = [data.logradouro, data.bairro, data.localidade, data.uf, normalized, 'Brasil'].filter(Boolean).join(', ');
  return { ok: true, cep: normalized, address, raw: data, source: 'ViaCEP' };
 } catch {
  return null;
 }
}

async function geocodeCrewCheckAddress({ address, cep }) {
 const key = getGoogleServerKey();
 const normalizedCep = normalizeBrazilCep(cep);
 const viaCep = normalizedCep ? await lookupViaCep(normalizedCep) : null;
 const addressText = String(address || '').trim();
 const queryAddress = [addressText, !addressText && viaCep?.address ? viaCep.address : '', addressText && normalizedCep ? `CEP ${normalizedCep}` : '', 'Brasil'].filter(Boolean).join(', ');
 if (!key) {
  const tomTomGeocode = await geocodeTomTomAddress({ queryAddress, normalizedCep });
  if (tomTomGeocode?.ok) return { ...tomTomGeocode, viaCep, inputCep: normalizedCep || null, inputAddress: addressText || null, source: 'TomTom Search · fallback' };
  return {
   ok: false,
   code: 'GOOGLE_KEY_MISSING',
   message: 'Google Maps não configurado. Configure GOOGLE_MAPS_API_KEY no Render; TomTom será usado apenas como fallback quando disponível.',
   viaCep,
   tomTomGeocode,
  };
 }
 const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
 if (queryAddress.trim()) url.searchParams.set('address', queryAddress);
 url.searchParams.set('language', 'pt-BR');
 url.searchParams.set('region', 'br');
 url.searchParams.set('key', key);
 if (normalizedCep) url.searchParams.set('components', `country:BR|postal_code:${normalizedCep}`);
 const response = await fetch(url, {
  headers: {
   referer: process.env.CREWCHECK_PUBLIC_URL || 'https://crewcheck.online',
   origin: process.env.CREWCHECK_PUBLIC_URL || 'https://crewcheck.online',
  },
  signal: AbortSignal.timeout(9000),
 });
 const payload = await response.json().catch(() => null);
 if (!response.ok || payload?.status !== 'OK') {
  const tomTomGeocode = await geocodeTomTomAddress({ queryAddress, normalizedCep });
  if (tomTomGeocode?.ok) return { ...tomTomGeocode, viaCep, inputCep: normalizedCep || null, inputAddress: addressText || null, source: 'TomTom Search · fallback' };
  return {
   ok: false,
   code: `GOOGLE_GEOCODING_${payload?.status || response.status}`,
   message: payload?.error_message || payload?.status || `HTTP ${response.status}`,
   viaCep,
   tomTomGeocode,
  };
 }
 const best = normalizeGeocodeResult(payload.results?.[0], 'Google Geocoding');
 if (!best) return { ok: false, code: 'GEOCODE_EMPTY', message: 'Endereço/CEP não retornou coordenadas confiáveis.', viaCep };
 return { ...best, viaCep, inputCep: normalizedCep || null, inputAddress: addressText || null };
}

function localDateParts(date) {
 const tz = process.env.CREWCHECK_LOCAL_TIMEZONE || 'America/Sao_Paulo';
 const parts = new Intl.DateTimeFormat('pt-BR', { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(date).reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
 return `${parts.year}-${parts.month}-${parts.day}`;
}

function formatLeaveDayLabel(leaveAt, now) {
 const leaveDate = localDateParts(leaveAt);
 const today = localDateParts(now);
 const tomorrow = localDateParts(new Date(now.getTime() + 24 * 60 * 60_000));
 const clock = formatClockIso(leaveAt);
 if (leaveDate === today) return `Saia hoje às ${clock}`;
 if (leaveDate === tomorrow) return `Saia amanhã às ${clock}`;
 const day = new Intl.DateTimeFormat('pt-BR', { timeZone: process.env.CREWCHECK_LOCAL_TIMEZONE || 'America/Sao_Paulo', day: '2-digit', month: '2-digit' }).format(leaveAt);
 return `Saia no dia ${day} às ${clock}`;
}
/* CREWCHECK_V10862_ADDRESS_ROUTES_RELIABLE_END */


function localTransitTimeLabel(value) {
 if (!value) return '';
 const raw = String(value || '').trim();
 const date = new Date(raw);
 if (Number.isFinite(date.getTime())) return formatClockIso(date);
 const match = raw.match(/\b(\d{1,2}:\d{2})\b/);
 return match ? match[1] : raw;
}

function normalizeTransitModeLabel(value) {
 const raw = String(value || '').toUpperCase();
 if (raw.includes('SUBWAY') || raw.includes('METRO')) return 'Metrô';
 if (raw.includes('BUS')) return 'Ônibus';
 if (raw.includes('LIGHT_RAIL') || raw.includes('TRAM')) return 'VLT';
 if (raw.includes('RAIL') || raw.includes('TRAIN')) return 'Trem';
 return 'Transporte';
}

function cleanTransitLineLabel(value, fallback = 'Linha') {
 const text = String(value || '').replace(/\s+/g, ' ').trim();
 return text ? text.slice(0, 72) : fallback;
}

function normalizeSmartMode(value) {
 const raw = String(value || 'AUTO').trim().toUpperCase();
 if (raw === 'DRIVE_FLIGHT' || raw === 'CAR_FLIGHT' || raw === 'CARRO_VOO') return 'DRIVE_FLIGHT';
 if (raw === 'RIDE_APP_FLIGHT' || raw === 'UBER_FLIGHT' || raw === '99_FLIGHT') return 'RIDE_APP_FLIGHT';
 if (raw === 'MOTO_FLIGHT' || raw === 'MOTORCYCLE_FLIGHT') return 'MOTO_FLIGHT';
 if (raw === 'TRANSIT_FLIGHT' || raw === 'PUBLIC_TRANSIT_FLIGHT') return 'TRANSIT_FLIGHT';
 if (raw === 'TRANSIT' || raw === 'PUBLIC_TRANSIT' || raw === 'PUBLIC') return 'TRANSIT';
 if (raw === 'WALK' || raw === 'WALKING') return 'WALK';
 if (raw === 'RIDE' || raw === 'RIDE_APP' || raw === 'RIDESHARE' || raw === 'UBER' || raw === '99') return 'RIDE_APP';
 if (raw === 'TWO_WHEELER' || raw === 'MOTO' || raw === 'MOTORCYCLE') return 'TWO_WHEELER';
 if (raw === 'DRIVE' || raw === 'DRIVING' || raw === 'CAR') return 'DRIVE';
 return 'AUTO';
}

function isFlightBridgeMode(mode) {
 return ['DRIVE_FLIGHT','RIDE_APP_FLIGHT','MOTO_FLIGHT','TRANSIT_FLIGHT'].includes(String(mode || '').toUpperCase());
}

function shouldUseFlightAboveThreshold(value) {
 const raw = String(value || '').trim().toLowerCase();
 return ['1','true','yes','sim','voo','auto_flight','flight_if_over_250','flight-if-over-250'].includes(raw);
}

function getLongDistanceThresholdKm() {
 const parsed = Number(process.env.CREWCHECK_LONG_DISTANCE_THRESHOLD_KM || 250);
 return Number.isFinite(parsed) && parsed > 0 ? Math.max(50, Math.min(1000, parsed)) : 250;
}

function uniqueModes(modes) {
 return (modes || []).filter(Boolean).filter((item, index, arr) => arr.indexOf(item) === index);
}

function buildGroundModeSet(configuredModes, rideEnabled) {
 const allowed = new Set(['DRIVE','TRANSIT','RIDE_APP','TWO_WHEELER']);
 const configured = uniqueModes(configuredModes).filter((item) => allowed.has(item)).filter((item) => item !== 'RIDE_APP' || rideEnabled);
 const fallback = ['DRIVE','TRANSIT',...(rideEnabled ? ['RIDE_APP'] : [])];
 return configured.length ? configured : fallback;
}

function buildFlightModeSet(configuredModes, rideEnabled) {
 const allowed = new Set(['DRIVE_FLIGHT','TRANSIT_FLIGHT','RIDE_APP_FLIGHT','MOTO_FLIGHT']);
 const configured = uniqueModes(configuredModes).filter((item) => allowed.has(item)).filter((item) => item !== 'RIDE_APP_FLIGHT' || rideEnabled);
 const fallback = ['DRIVE_FLIGHT','TRANSIT_FLIGHT',...(rideEnabled ? ['RIDE_APP_FLIGHT'] : [])];
 return configured.length ? configured : fallback;
}

function extractTransitStepsFromRoute(route) {
 const steps = [];
 const legs = Array.isArray(route?.legs) ? route.legs : [];
 for (const leg of legs) {
  const legSteps = Array.isArray(leg?.steps) ? leg.steps : [];
  for (const step of legSteps) {
   const details = step?.transitDetails || step?.transit_details || null;
   const mode = String(step?.travelMode || '').toUpperCase();
   if (details || mode === 'TRANSIT') {
    const line = details?.transitLine || details?.line || {};
    const vehicle = line?.vehicle || {};
    const stopDetails = details?.stopDetails || {};
    const departureStop = stopDetails?.departureStop?.name || details?.departureStop?.name || details?.departure_stop?.name || '';
    const arrivalStop = stopDetails?.arrivalStop?.name || details?.arrivalStop?.name || details?.arrival_stop?.name || '';
    const departureRaw = stopDetails?.departureTime || details?.departureTime || details?.departure_time?.text || '';
    const arrivalRaw = stopDetails?.arrivalTime || details?.arrivalTime || details?.arrival_time?.text || '';
    const vehicleLabel = normalizeTransitModeLabel(vehicle?.type || line?.vehicleType || line?.vehicle?.name?.text || '');
    const lineLabel = cleanTransitLineLabel(line?.nameShort || line?.shortName || line?.name || line?.agency || line?.agencies?.[0]?.name, vehicleLabel);
    const headsign = details?.headsign || details?.tripShortText || '';
    const agency = line?.agencies?.[0]?.name || line?.agency || '';
    steps.push({
     type: 'TRANSIT',
     mode: vehicleLabel,
     vehicleType: vehicle?.type || line?.vehicleType || null,
     line: lineLabel,
     agency,
     headsign,
     from: departureStop,
     to: arrivalStop,
     departureTime: departureRaw,
     arrivalTime: arrivalRaw,
     departureLabel: localTransitTimeLabel(departureRaw),
     arrivalLabel: localTransitTimeLabel(arrivalRaw),
     text: [lineLabel, headsign && `sentido ${headsign}`, departureStop && `de ${departureStop}`, arrivalStop && `até ${arrivalStop}`].filter(Boolean).join(' · '),
     durationText: step?.localizedValues?.staticDuration?.text || step?.localizedValues?.duration?.text || '',
     realtime: Boolean(departureRaw || arrivalRaw),
    });
   }
  }
 }
 return steps.slice(0, 8);
}

function summarizeRouteLabel(mode, route) {
 if (!route) return mode === 'TRANSIT' ? 'Transporte público' : 'Carro';
 if (mode === 'TRANSIT') {
  const steps = extractTransitStepsFromRoute(route);
  if (steps.length) {
   const labels = steps.map((s) => String(s.line || s.mode || '').trim()).filter(Boolean).slice(0, 3);
   return labels.length ? `Transporte público · ${labels.join(' + ')}` : 'Transporte público';
  }
  return 'Transporte público';
 }
 if (mode === 'TWO_WHEELER') return 'Moto';
 if (mode === 'WALK') return 'A pé';
 return 'Carro · trânsito real';
}


async function fetchGoogleRoutesWithFallbackAuth({ key, fieldMask, body, travelMode }) {
 const endpoint = 'https://routes.googleapis.com/directions/v2:computeRoutes';
 const commonHeaders = {
  'content-type': 'application/json',
  'x-goog-fieldmask': fieldMask,
  // Algumas chaves do Google Maps são restritas por referenciador HTTP.
  // Como a chamada sai do backend, informamos o domínio público do CrewCheck.
  'referer': process.env.CREWCHECK_PUBLIC_URL || 'https://crewcheck.online',
  'origin': process.env.CREWCHECK_PUBLIC_URL || 'https://crewcheck.online',
 };
 let response = await fetch(endpoint, {
  method: 'POST',
  headers: { ...commonHeaders, 'x-goog-api-key': key },
  body: JSON.stringify(body),
  signal: AbortSignal.timeout(10_500),
 });
 if (response.ok) return response;
 const firstText = await response.text().catch(() => '');
 response = await fetch(`${endpoint}?key=${encodeURIComponent(key)}`, {
  method: 'POST',
  headers: commonHeaders,
  body: JSON.stringify(body),
  signal: AbortSignal.timeout(10_500),
 });
 if (response.ok) return response;
 const secondText = await response.text().catch(() => '');
 throw new Error(`GOOGLE_ROUTES_${travelMode}_${response.status}_${(secondText || firstText || '').slice(0, 160)}`);
}

function parseLegacyStepTransit(step) {
 const details = step?.transit_details || null;
 if (!details) return null;
 const line = details.line || {};
 const vehicle = line.vehicle || {};
 const vehicleLabel = normalizeTransitModeLabel(vehicle.type || vehicle.name || '');
 const lineLabel = cleanTransitLineLabel(line.short_name || line.name, vehicleLabel);
 return {
  type: 'TRANSIT',
  mode: vehicleLabel,
  vehicleType: vehicle.type || null,
  line: lineLabel,
  agency: Array.isArray(line.agencies) ? (line.agencies[0]?.name || '') : '',
  headsign: details.headsign || '',
  from: details.departure_stop?.name || '',
  to: details.arrival_stop?.name || '',
  departureTime: details.departure_time?.value ? new Date(details.departure_time.value * 1000).toISOString() : (details.departure_time?.text || ''),
  arrivalTime: details.arrival_time?.value ? new Date(details.arrival_time.value * 1000).toISOString() : (details.arrival_time?.text || ''),
  departureLabel: details.departure_time?.text || localTransitTimeLabel(details.departure_time?.value ? new Date(details.departure_time.value * 1000).toISOString() : ''),
  arrivalLabel: details.arrival_time?.text || localTransitTimeLabel(details.arrival_time?.value ? new Date(details.arrival_time.value * 1000).toISOString() : ''),
  text: [lineLabel, details.headsign && `sentido ${details.headsign}`, details.departure_stop?.name && `de ${details.departure_stop.name}`, details.arrival_stop?.name && `até ${details.arrival_stop.name}`].filter(Boolean).join(' · '),
  durationText: step.duration?.text || '',
  realtime: Boolean(details.departure_time?.text || details.arrival_time?.text),
 };
}

async function computeTomTomRoutePlan({ origin, destination, departureTime, mode = 'DRIVE' }) {
 const key = getTomTomServerKey();
 if (!key) return null;
 const originLat = Number(origin?.lat);
 const originLng = Number(origin?.lng);
 const destLat = Number(destination?.lat);
 const destLng = Number(destination?.lng);
 if (![originLat, originLng, destLat, destLng].every(Number.isFinite)) return null;
 const travelMode = mode === 'WALK' ? 'pedestrian' : mode === 'TWO_WHEELER' ? 'motorcycle' : 'car';
 const url = new URL(`https://api.tomtom.com/routing/1/calculateRoute/${originLat},${originLng}:${destLat},${destLng}/json`);
 url.searchParams.set('key', key);
 url.searchParams.set('traffic', 'true');
 url.searchParams.set('routeType', 'fastest');
 url.searchParams.set('travelMode', travelMode);
 url.searchParams.set('language', 'pt-BR');
 url.searchParams.set('instructionsType', 'text');
 const depart = new Date(departureTime || Date.now());
 if (Number.isFinite(depart.getTime())) url.searchParams.set('departAt', depart.toISOString());
 try {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_500) });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`TOMTOM_ROUTING_${response.status}`);
  const route = Array.isArray(payload?.routes) ? payload.routes[0] : null;
  const summary = route?.summary || {};
  const durationSeconds = Number(summary.travelTimeInSeconds || summary.noTrafficTravelTimeInSeconds || 0);
  if (!durationSeconds) return null;
  const staticDurationSeconds = Math.max(1, Number(summary.noTrafficTravelTimeInSeconds || durationSeconds - Number(summary.trafficDelayInSeconds || 0) || durationSeconds));
  const distanceMeters = parseFiniteNumber(summary.lengthInMeters, null);
  return {
   mode: mode === 'WALK' ? 'WALK' : mode === 'TWO_WHEELER' ? 'TWO_WHEELER' : 'DRIVE',
   durationSeconds,
   staticDurationSeconds,
   distanceMeters,
   localizedDuration: `${Math.max(1, Math.round(durationSeconds / 60))} min`,
   localizedDistance: distanceMeters ? `${Math.round((distanceMeters / 1000) * 10) / 10} km` : '',
   label: mode === 'TWO_WHEELER' ? 'Moto · TomTom Traffic' : mode === 'WALK' ? 'A pé · TomTom' : 'Carro · TomTom Traffic',
   transitSteps: [],
   source: 'TomTom Routing · trânsito real',
  };
 } catch (error) {
  return null;
 }
}

async function computeLegacyDirectionsPlan({ origin, destination, departureTime, arrivalTime, mode = 'DRIVE' }) {
 const key = String(process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_ROUTES_API_KEY || '').trim();
 if (!key) return null;
 const travelMode = mode === 'TRANSIT' ? 'transit' : mode === 'WALK' ? 'walking' : 'driving';
 const url = new URL('https://maps.googleapis.com/maps/api/directions/json');
 url.searchParams.set('origin', `${origin.lat},${origin.lng}`);
 url.searchParams.set('destination', `${destination.lat},${destination.lng}`);
 url.searchParams.set('mode', travelMode);
 url.searchParams.set('language', 'pt-BR');
 url.searchParams.set('units', 'metric');
 url.searchParams.set('key', key);
 if (travelMode === 'transit' && arrivalTime) {
  url.searchParams.set('arrival_time', String(Math.floor(new Date(arrivalTime).getTime() / 1000)));
 } else if (departureTime) {
  url.searchParams.set('departure_time', String(Math.max(Math.floor(Date.now() / 1000), Math.floor(new Date(departureTime).getTime() / 1000))));
 }
 const response = await fetch(url, {
  headers: {
   'referer': process.env.CREWCHECK_PUBLIC_URL || 'https://crewcheck.online',
   'origin': process.env.CREWCHECK_PUBLIC_URL || 'https://crewcheck.online',
  },
  signal: AbortSignal.timeout(10_500),
 });
 const payload = await response.json().catch(() => null);
 if (!response.ok || payload?.status !== 'OK') throw new Error(`GOOGLE_DIRECTIONS_${mode}_${payload?.status || response.status}`);
 const leg = payload?.routes?.[0]?.legs?.[0];
 if (!leg) return null;
 const durationValue = Number((leg.duration_in_traffic || leg.duration || {}).value || 0);
 const staticValue = Number((leg.duration || {}).value || durationValue || 0);
 if (!durationValue) return null;
 const steps = Array.isArray(leg.steps) ? leg.steps.map(parseLegacyStepTransit).filter(Boolean).slice(0, 6) : [];
 return {
  mode: mode === 'TRANSIT' ? 'TRANSIT' : mode === 'WALK' ? 'WALK' : 'DRIVE',
  durationSeconds: durationValue,
  staticDurationSeconds: staticValue,
  distanceMeters: parseFiniteNumber(leg.distance?.value, null),
  localizedDuration: (leg.duration_in_traffic || leg.duration || {}).text || '',
  localizedDistance: leg.distance?.text || '',
  label: mode === 'TRANSIT' && steps.length ? `Transporte público · ${steps.map((item) => item.line).filter(Boolean).slice(0, 3).join(' + ')}` : mode === 'TRANSIT' ? 'Transporte público' : 'Carro · trânsito real',
  transitSteps: mode === 'TRANSIT' ? steps : [],
  source: mode === 'TRANSIT' ? 'Google Directions · transporte público' : 'Google Directions · trânsito real',
 };
}

async function computeGoogleRoutesPlan({ origin, destination, departureTime, arrivalTime, mode = 'DRIVE', transitPreference = 'FEWER_TRANSFERS', sourceSuffix = '' }) {
 const travelMode = mode === 'TRANSIT' ? 'TRANSIT' : mode === 'WALK' ? 'WALK' : mode === 'TWO_WHEELER' ? 'TWO_WHEELER' : 'DRIVE';
 const key = String(process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_ROUTES_API_KEY || '').trim();
 if (!key) {
  const tomTom = travelMode !== 'TRANSIT' ? await computeTomTomRoutePlan({ origin, destination, departureTime, mode: travelMode }) : null;
  return tomTom?.durationSeconds ? { ...tomTom, source: `${tomTom.source || 'TomTom'} · fallback` } : null;
 }
 const body = {
  origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
  destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
  travelMode,
  languageCode: 'pt-BR',
  units: 'METRIC',
  computeAlternativeRoutes: false,
 };
 if (travelMode === 'DRIVE') {
  body.routingPreference = 'TRAFFIC_AWARE';
  body.trafficModel = 'BEST_GUESS';
  body.departureTime = departureTime;
 } else if (travelMode === 'TRANSIT') {
  // Para transporte público, priorizamos chegar antes da apresentação/margem.
  // A API usa horários disponíveis por região, alimentados pelos dados de trânsito/transporte do Google.
  body.arrivalTime = arrivalTime || departureTime;
  body.transitPreferences = {
   allowedTravelModes: ['BUS', 'SUBWAY', 'TRAIN', 'LIGHT_RAIL', 'RAIL'],
   routingPreference: transitPreference,
  };
 } else {
  body.departureTime = departureTime;
 }
 const fieldMask = [
  'routes.duration',
  'routes.staticDuration',
  'routes.distanceMeters',
  'routes.localizedValues',
  'routes.legs.steps.travelMode',
  'routes.legs.steps.localizedValues',
  'routes.legs.steps.transitDetails',
  'routes.travelAdvisory',
 ].join(',');
 let response;
 try {
  response = await fetchGoogleRoutesWithFallbackAuth({ key, fieldMask, body, travelMode });
 } catch (error) {
  const legacy = await computeLegacyDirectionsPlan({ origin, destination, departureTime, arrivalTime, mode: travelMode });
  if (legacy?.durationSeconds) return legacy;
  const tomTom = travelMode !== 'TRANSIT' ? await computeTomTomRoutePlan({ origin, destination, departureTime, mode: travelMode }) : null;
  if (tomTom?.durationSeconds) return { ...tomTom, source: `${tomTom.source || 'TomTom'} · fallback` };
  throw error;
 }
 const payload = await response.json();
 const route = Array.isArray(payload?.routes) ? payload.routes[0] : null;
 if (!route) return null;
 const durationSeconds = parseDurationSeconds(route.duration) || parseDurationSeconds(route.staticDuration);
 const staticDurationSeconds = parseDurationSeconds(route.staticDuration) || durationSeconds;
 if (!durationSeconds) return null;
 const localizedDuration = route?.localizedValues?.duration?.text || route?.localizedValues?.staticDuration?.text || '';
 const localizedDistance = route?.localizedValues?.distance?.text || '';
 const transitSteps = travelMode === 'TRANSIT' ? extractTransitStepsFromRoute(route) : [];
 const firstTransitDeparture = transitSteps.find((item) => item.departureLabel)?.departureLabel || null;
 return {
  mode: travelMode,
  durationSeconds,
  staticDurationSeconds,
  distanceMeters: parseFiniteNumber(route.distanceMeters, null),
  localizedDuration,
  localizedDistance,
  label: summarizeRouteLabel(travelMode, route),
  transitSteps,
  firstTransitDeparture,
  transitPreference: travelMode === 'TRANSIT' ? transitPreference : null,
  source: travelMode === 'TRANSIT' ? `Google Routes · transporte público${sourceSuffix ? ' · ' + sourceSuffix : ''}` : travelMode === 'DRIVE' ? 'Google Routes · trânsito real' : 'Google Routes',
 };
}

function dedupeSmartRoutes(routes) {
 const seen = new Set();
 return routes.filter((route) => {
  if (!route?.durationSeconds) return false;
  const key = [route.mode, route.durationSeconds, route.distanceMeters || 0, route.firstTransitDeparture || '', (route.transitSteps || []).map((s) => `${s.line}:${s.departureLabel}:${s.from}`).join('|')].join('::');
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
 });
}

async function computePremiumTransitCandidates({ origin, destination, departureTime, arrivalDeadline }) {
 const candidates = [];
 const errors = [];
 const arrivals = [arrivalDeadline, new Date(new Date(arrivalDeadline).getTime() - 10 * 60_000).toISOString()];
 const preferences = [
  { value: 'FEWER_TRANSFERS', label: 'menos baldeações' },
  { value: 'LESS_WALKING', label: 'menos caminhada' },
 ];
 for (const arrivalTime of arrivals) {
  for (const pref of preferences) {
   try {
    const route = await computeGoogleRoutesPlan({ origin, destination, departureTime, arrivalTime, mode: 'TRANSIT', transitPreference: pref.value, sourceSuffix: pref.label });
    if (route?.durationSeconds) candidates.push(route);
   } catch (error) {
    errors.push(String(error?.message || error));
   }
  }
 }
 try {
  const legacy = await computeLegacyDirectionsPlan({ origin, destination, departureTime, arrivalTime: arrivalDeadline, mode: 'TRANSIT' });
  if (legacy?.durationSeconds) candidates.push({ ...legacy, source: 'Google Directions · transporte público · alternativa' });
 } catch (error) {
  errors.push(String(error?.message || error));
 }
 return { candidates: dedupeSmartRoutes(candidates), errors };
}


const uberTokenCache = { value: null, expiresAt: 0 };

function isTruthyEnv(value) {
 return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function formatBrl(value) {
 const number = Number(value);
 if (!Number.isFinite(number)) return '';
 try {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(number);
 } catch {
  return `R$ ${Math.round(number)}`;
 }
}

function buildUberRideLinks({ origin, destination, airport }) {
 const clientId = String(process.env.UBER_CLIENT_ID || '').trim();
 const pickup = `${origin.lat},${origin.lng}`;
 const dropoff = `${destination.lat},${destination.lng}`;
 const common = new URLSearchParams();
 common.set('action', 'setPickup');
 if (clientId) common.set('client_id', clientId);
 common.set('pickup[latitude]', String(origin.lat));
 common.set('pickup[longitude]', String(origin.lng));
 common.set('pickup[nickname]', 'Minha localização');
 common.set('dropoff[latitude]', String(destination.lat));
 common.set('dropoff[longitude]', String(destination.lng));
 common.set('dropoff[nickname]', `${airport || 'Aeroporto'} · ${destination.name || 'Aeroporto'}`);
 return {
  deepLink: `uber://?${common.toString()}`,
  webLink: `https://m.uber.com/ul/?${common.toString()}`,
  mapsLink: buildGoogleMapsWebRouteUrl({ destination }),
 };
}

function buildNinetyNineLinks({ origin, destination }) {
 const pickup = `${origin.lat},${origin.lng}`;
 const dropoff = `${destination.lat},${destination.lng}`;
 return {
  appLink: `https://99app.com/passageiro/?pickup=${encodeURIComponent(pickup)}&dropoff=${encodeURIComponent(dropoff)}`,
  webLink: 'https://99app.com/passageiro/',
 };
}


/* CREWCHECK_RIDE_PRICE_CALIBRATION_V10860_START */
// Histórico real informado pelo proprietário para trechos casa ⇄ BSB.
// Não guarda endereço preciso: apenas data/hora agregada, valor e se era dia útil/fim de semana.
const CREWCHECK_AIRPORT_RIDE_HISTORY_V1 = [
 // Calibração informada pelo usuário: Uber solicitado 05:45 e saída real 05:53.
 // O valor mantém a faixa real de preço sem guardar endereço preciso.
 { iso: '2026-06-13T05:45:00-03:00', price: 43.00, label: 'BSB', source: 'calibração usuário · pickup 8 min' },
 { iso: '2026-06-09T16:27:00-03:00', price: 38.30, label: 'BSB', source: 'Presidente Juscelino' },
 { iso: '2026-06-07T18:37:00-03:00', price: 45.20, label: 'BSB', source: 'Presidente Juscelino' },
 { iso: '2026-05-30T12:54:00-03:00', price: 35.56, label: 'BSB', source: 'Presidente Juscelino' },
 { iso: '2026-05-18T12:44:00-03:00', price: 57.75, label: 'BSB', source: 'Presidente Juscelino' },
 { iso: '2026-05-14T12:28:00-03:00', price: 30.92, label: 'BSB', source: 'Azul' },
 { iso: '2026-05-09T12:53:00-03:00', price: 53.98, label: 'BSB', source: 'Azul' },
 { iso: '2026-04-26T05:25:00-03:00', price: 48.09, label: 'BSB', source: 'Presidente Juscelino' },
 { iso: '2026-04-22T15:13:00-03:00', price: 33.81, label: 'BSB', source: 'Presidente Juscelino' },
 { iso: '2026-04-17T03:10:00-03:00', price: 85.34, label: 'BSB', source: 'Presidente Juscelino' },
 { iso: '2026-04-10T12:11:00-03:00', price: 49.17, label: 'BSB', source: 'Presidente Juscelino' },
 { iso: '2026-04-08T12:18:00-03:00', price: 39.17, label: 'BSB', source: 'Presidente Juscelino' },
 { iso: '2026-03-26T05:37:00-03:00', price: 40.45, label: 'BSB', source: 'Azul' },
 { iso: '2026-03-24T14:40:00-03:00', price: 34.97, label: 'BSB', source: 'Presidente Juscelino' },
].map((item) => {
 const date = new Date(item.iso);
 return {
  ...item,
  dayKind: date.getDay() === 0 || date.getDay() === 6 ? 'weekend' : 'weekday',
  band: classifyRideTimeBand(date),
 };
});

function classifyRideTimeBand(dateLike) {
 const date = dateLike instanceof Date ? dateLike : new Date(dateLike || Date.now());
 const hour = Number.isFinite(date.getTime()) ? date.getHours() + date.getMinutes() / 60 : 12;
 if (hour < 6) return 'dawn';
 if (hour < 11) return 'morning';
 if (hour < 17) return 'afternoon';
 if (hour < 22) return 'evening';
 return 'late';
}

function rideBandLabel(band) {
 return ({ dawn: 'madrugada', morning: 'manhã', afternoon: 'meio do dia/tarde', evening: 'noite', late: 'fim da noite' })[band] || 'horário';
}

function getLocalHourFloat(dateLike) {
 const date = dateLike instanceof Date ? dateLike : new Date(dateLike || Date.now());
 if (!Number.isFinite(date.getTime())) return 12;
 try {
  const parts = new Intl.DateTimeFormat('pt-BR', { timeZone: process.env.CREWCHECK_LOCAL_TIMEZONE || 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(date).reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  return Number(parts.hour || 0) + Number(parts.minute || 0) / 60;
 } catch {
  return date.getHours() + date.getMinutes() / 60;
 }
}

function isWeekdayLocal(dateLike) {
 const date = dateLike instanceof Date ? dateLike : new Date(dateLike || Date.now());
 if (!Number.isFinite(date.getTime())) return true;
 const day = date.getDay();
 return day >= 1 && day <= 5;
}

function isPeakCommuteWindow(dateLike) {
 const hour = getLocalHourFloat(dateLike);
 return isWeekdayLocal(dateLike) && ((hour >= 6.25 && hour <= 9.25) || (hour >= 16.5 && hour <= 19.75));
}

function estimateCrewCheckRoadMinutes({ distanceMeters, durationSeconds, whenIso, mode = 'DRIVE' }) {
 const km = Math.max(1, Number(distanceMeters || 0) / 1000);
 const apiMinutes = Math.max(0, Number(durationSeconds || 0) / 60);
 const when = whenIso || new Date().toISOString();
 const hour = getLocalHourFloat(when);
 const peak = isPeakCommuteWindow(when);
 const dawn = hour < 6.2;
 const late = hour >= 22;
 let speedKmh = peak ? 27 : dawn ? 46 : late ? 40 : 34;
 if (mode === 'RIDE_APP') speedKmh = peak ? 29 : dawn ? 48 : late ? 42 : 36;
 const roadFloor = Math.ceil((km / speedKmh) * 60);
 const bsbUrbanFloor = km >= 20 && km <= 28
  ? (peak ? 50 : dawn ? 31 : late ? 34 : 39)
  : 0;
 const normalizedApi = apiMinutes > 0 ? apiMinutes : 0;
 const chosen = Math.max(normalizedApi, roadFloor, bsbUrbanFloor, mode === 'TRANSIT' ? 35 : 18);
 return {
  roadMinutes: Math.round(chosen),
  peak,
  pickupMinutes: mode === 'RIDE_APP' ? Number(process.env.CREWCHECK_RIDE_PICKUP_BUFFER_MINUTES || 8) : 0,
  sourceLabel: normalizedApi >= roadFloor && normalizedApi >= bsbUrbanFloor ? 'Dados reais de rota' : 'Estimativa CrewCheck calibrada',
 };
}

function percentile(values, p) {
 const arr = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
 if (!arr.length) return null;
 const idx = (arr.length - 1) * p;
 const lo = Math.floor(idx);
 const hi = Math.ceil(idx);
 if (lo === hi) return arr[lo];
 return arr[lo] + (arr[hi] - arr[lo]) * (idx - lo);
}

function weightedFareSampleForWhen(when) {
 const date = new Date(when || Date.now());
 const dayKind = date.getDay() === 0 || date.getDay() === 6 ? 'weekend' : 'weekday';
 const band = classifyRideTimeBand(date);
 const exact = CREWCHECK_AIRPORT_RIDE_HISTORY_V1.filter((item) => item.dayKind === dayKind && item.band === band).map((item) => item.price);
 const sameBand = CREWCHECK_AIRPORT_RIDE_HISTORY_V1.filter((item) => item.band === band).map((item) => item.price);
 const sameDayKind = CREWCHECK_AIRPORT_RIDE_HISTORY_V1.filter((item) => item.dayKind === dayKind).map((item) => item.price);
 const global = CREWCHECK_AIRPORT_RIDE_HISTORY_V1.map((item) => item.price);

 const sample = [];
 const add = (values, weight) => {
  for (let i = 0; i < weight; i += 1) sample.push(...values);
 };
 if (exact.length >= 3) add(exact, 5);
 else if (exact.length) add(exact, 3);
 if (sameBand.length >= 2) add(sameBand, 3);
 if (sameDayKind.length >= 3) add(sameDayKind, 2);
 add(global, 1);
 return { sample, exactCount: exact.length, bandCount: sameBand.length, dayKindCount: sameDayKind.length, globalCount: global.length, dayKind, band };
}

function isLikelyHomeToBsbAirport({ airport, destination, distanceMeters }) {
 const code = String(airport || '').toUpperCase();
 const name = String(destination?.name || '').toUpperCase();
 const km = Number(distanceMeters || 0) / 1000;
 const airportMatch = code === 'BSB' || name.includes('JUSCELINO') || name.includes('BRASÍLIA') || name.includes('BRASILIA') || name.includes('AZUL');
 // O histórico é casa ⇄ BSB. Aplicamos somente para trechos urbanos compatíveis, evitando contaminar GRU/CGH/hotéis.
 const distanceMatch = !Number.isFinite(km) || km <= 0 || (km >= 10 && km <= 36);
 return airportMatch && distanceMatch;
}

function estimateCalibratedHomeAirportRideFare({ distanceMeters, durationSeconds, airport, destination, whenIso }) {
 if (!isTruthyEnv(process.env.CREWCHECK_RIDE_HISTORY_PRICING_ENABLED ?? 'true')) return null;
 if (!isLikelyHomeToBsbAirport({ airport, destination, distanceMeters })) return null;
 const when = whenIso || new Date().toISOString();
 const { sample, exactCount, bandCount, dayKindCount, globalCount, dayKind, band } = weightedFareSampleForWhen(when);
 if (!sample.length) return null;

 const q25 = percentile(sample, 0.25) ?? 34;
 const q50 = percentile(sample, 0.50) ?? 42;
 const q75 = percentile(sample, 0.75) ?? 52;
 const q90 = percentile(sample, 0.90) ?? q75;
 const km = Number(distanceMeters || 0) / 1000;
 const baselineKm = Math.max(12, Number(process.env.CREWCHECK_BSB_RIDE_BASELINE_KM || 22));
 const distanceFactor = Number.isFinite(km) && km > 0 ? Math.min(1.28, Math.max(0.74, km / baselineKm)) : 1;
 const minutes = Math.max(8, Number(durationSeconds || 0) / 60);
 const peakRideRisk = isPeakCommuteWindow(when) ? 1.10 : 1;
 const speedRisk = (minutes >= 55 ? 1.08 : minutes >= 45 ? 1.04 : 1) * peakRideRisk;
 const sparseRisk = exactCount >= 3 ? 1 : exactCount >= 1 ? 1.06 : 1.10;
 const dawnRisk = band === 'dawn' ? 1.14 : band === 'late' ? 1.08 : 1;
 const weekendRisk = dayKind === 'weekend' ? 1.04 : 1;

 const low = Math.max(18, Math.round(q25 * distanceFactor * 0.96));
 const median = Math.max(low + 2, Math.round(q50 * distanceFactor * speedRisk));
 const highBase = Math.max(q75, q90 * 0.92);
 const high = Math.max(median + 5, Math.round(highBase * distanceFactor * sparseRisk * dawnRisk * weekendRisk));
 const motoLow = Math.max(9, Math.round(low * 0.54));
 const motoHigh = Math.max(motoLow + 3, Math.round(high * 0.72));
 const economyLow = Math.max(12, Math.round(low * 0.92));
 const economyHigh = Math.max(economyLow + 4, Math.round(high * 1.03));
 const confidence = exactCount >= 3 ? 'alta' : bandCount >= 3 || dayKindCount >= 4 ? 'média-alta' : 'média';
 const dayLabel = dayKind === 'weekend' ? 'fim de semana' : 'dia útil';
 const label = `${formatBrl(low)}–${formatBrl(high)}`;
 return {
  low,
  median,
  high,
  label,
  currency: 'BRL',
  confidence,
  source: `Histórico CrewCheck BSB · ${dayLabel} · ${rideBandLabel(band)}`,
  calibration: { exactCount, bandCount, dayKindCount, globalCount, dayKind, band, distanceFactor: Math.round(distanceFactor * 100) / 100, baselineKm, sampleSize: sample.length },
  apps: {
   car: { low, median, high, label, confidence },
   economy: { low: economyLow, high: economyHigh, label: `${formatBrl(economyLow)}–${formatBrl(economyHigh)}`, confidence },
   moto: { low: motoLow, high: motoHigh, label: `${formatBrl(motoLow)}–${formatBrl(motoHigh)}`, confidence: 'estimativa derivada do histórico' },
  },
 };
}

function estimateRideFareRange({ distanceMeters, durationSeconds, airport, destination, whenIso }) {
 const calibrated = estimateCalibratedHomeAirportRideFare({ distanceMeters, durationSeconds, airport, destination, whenIso });
 if (calibrated) return calibrated;
 const km = Math.max(1, Number(distanceMeters || 0) / 1000);
 const minutes = Math.max(5, Number(durationSeconds || 0) / 60);
 const airportSurcharge = ['GRU','GIG','BSB','CGH','VCP','CNF','SSA','REC','FOR'].includes(String(airport || '').toUpperCase()) ? 8 : 5;
 const base = 6.8 + km * 2.35 + minutes * 0.46 + airportSurcharge;
 const low = Math.max(12, Math.round(base * 0.9));
 const high = Math.max(low + 4, Math.round(base * 1.45));
 return {
  low,
  high,
  median: Math.round((low + high) / 2),
  label: `${formatBrl(low)}–${formatBrl(high)}`,
  currency: 'BRL',
  confidence: 'estimativa por distância/tempo',
  source: 'Estimativa CrewCheck por distância e trânsito',
  apps: {
   car: { low, high, label: `${formatBrl(low)}–${formatBrl(high)}`, confidence: 'estimativa por distância/tempo' },
   economy: { low, high, label: `${formatBrl(low)}–${formatBrl(high)}`, confidence: 'estimativa por distância/tempo' },
   moto: { low: Math.max(8, Math.round(low * 0.55)), high: Math.max(11, Math.round(high * 0.72)), label: `${formatBrl(Math.max(8, Math.round(low * 0.55)))}–${formatBrl(Math.max(11, Math.round(high * 0.72)))}`, confidence: 'estimativa derivada' },
  },
 };
}
/* CREWCHECK_RIDE_PRICE_CALIBRATION_V10860_END */

async function getUberAccessToken() {
 const clientId = String(process.env.UBER_CLIENT_ID || '').trim();
 const clientSecret = String(process.env.UBER_CLIENT_SECRET || '').trim();
 if (!clientId || !clientSecret) return null;
 if (uberTokenCache.value && uberTokenCache.expiresAt > Date.now() + 60_000) return uberTokenCache.value;
 const params = new URLSearchParams();
 params.set('client_id', clientId);
 params.set('client_secret', clientSecret);
 params.set('grant_type', 'client_credentials');
 params.set('scope', 'guests.trips');
 const response = await fetch('https://auth.uber.com/oauth/v2/token', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: params.toString(),
  signal: AbortSignal.timeout(9000),
 });
 const payload = await response.json().catch(() => null);
 if (!response.ok || !payload?.access_token) throw new Error(`UBER_TOKEN_${response.status}`);
 const ttl = Math.max(300, Number(payload.expires_in || 2592000));
 uberTokenCache.value = payload.access_token;
 uberTokenCache.expiresAt = Date.now() + ttl * 1000;
 return uberTokenCache.value;
}

function normalizeUberGuestProductEstimate(item) {
 const product = item?.product || {};
 const info = item?.estimate_info || {};
 const fare = info?.fare || info?.estimate || {};
 const trip = info?.trip || {};
 const display = fare?.display || fare?.estimate || '';
 const value = Number(fare?.value || fare?.low_estimate || fare?.high_estimate || 0) || null;
 const low = Number(fare?.low_estimate || value || 0) || null;
 const high = Number(fare?.high_estimate || value || 0) || null;
 const durationSeconds = Number(trip?.duration_estimate || info?.duration_estimate || 0) || null;
 return {
  product: product?.display_name || product?.short_description || product?.product_group || 'Uber',
  estimate: display || (low && high ? `${formatBrl(low)}–${formatBrl(high)}` : value ? formatBrl(value) : ''),
  low,
  high,
  currency: fare?.currency_code || 'BRL',
  durationSeconds,
  distanceKm: Number(trip?.distance_estimate || trip?.travel_distance_estimate || 0) || null,
  etaMinutes: Number(info?.pickup_estimate || 0) || null,
  fulfillment: item?.fulfillment_indicators?.availability_predictor?.predictor_result || item?.fulfillment_indicator || 'UNKNOWN',
  productId: product?.product_id || null,
  schedulingEnabled: Boolean(product?.scheduling_enabled),
 };
}

function normalizeUberLegacyPrice(item) {
 return {
  product: item?.display_name || item?.localized_display_name || item?.product_id || 'Uber',
  estimate: item?.estimate || '',
  low: Number(item?.low_estimate || 0) || null,
  high: Number(item?.high_estimate || 0) || null,
  currency: item?.currency_code || 'BRL',
  durationSeconds: Number(item?.duration || 0) || null,
  distanceKm: Number(item?.distance || 0) || null,
  etaMinutes: null,
  fulfillment: 'UNKNOWN',
  productId: item?.product_id || null,
  schedulingEnabled: false,
 };
}

function pickBestUberOption(options = []) {
 return options.find((item) => /uberx/i.test(item.product || ''))
  || options.find((item) => /comfort/i.test(item.product || ''))
  || options.find((item) => /black/i.test(item.product || ''))
  || options[0]
  || null;
}

async function fetchUberGuestTripEstimate({ origin, destination, dropoffTime }) {
 if (!isTruthyEnv(process.env.UBER_GUEST_ESTIMATES_ENABLED)) return null;
 const token = await getUberAccessToken();
 if (!token) return null;
 const body = {
  pickup: { latitude: Number(origin.lat), longitude: Number(origin.lng) },
  dropoff: { latitude: Number(destination.lat), longitude: Number(destination.lng) },
 };
 if (dropoffTime) {
  const ms = new Date(dropoffTime).getTime();
  if (Number.isFinite(ms)) body.scheduling = { dropoff_time: ms };
 }
 const headers = {
  authorization: `Bearer ${token}`,
  'content-type': 'application/json',
  'accept-language': 'pt-BR',
 };
 const organizationUuid = String(process.env.UBER_ORGANIZATION_UUID || '').trim();
 if (organizationUuid) headers['x-uber-organizationuuid'] = organizationUuid;
 const sandboxRunUuid = String(process.env.UBER_SANDBOX_RUN_UUID || '').trim();
 if (sandboxRunUuid) headers['x-uber-sandbox-runuuid'] = sandboxRunUuid;

 const response = await fetch('https://api.uber.com/v1/guests/trips/estimates', {
  method: 'POST',
  headers,
  body: JSON.stringify(body),
  signal: AbortSignal.timeout(10000),
 });
 const payload = await response.json().catch(() => null);
 if (!response.ok) throw new Error(`UBER_GUEST_ESTIMATE_${response.status}`);
 const options = Array.isArray(payload?.product_estimates)
  ? payload.product_estimates.map(normalizeUberGuestProductEstimate).filter((item) => item.estimate || item.low || item.high || item.durationSeconds)
  : [];
 if (!options.length || payload?.fares_unavailable) {
  if (payload?.fares_unavailable) throw new Error('UBER_GUEST_FARES_UNAVAILABLE');
  return null;
 }
 const best = pickBestUberOption(options);
 return {
  provider: 'Uber',
  confidence: 'oficial Uber Guest Trips',
  best,
  options: options.slice(0, 6),
  source: 'Uber Guest Trip Estimates API',
  rawFlags: { etasUnavailable: Boolean(payload?.etas_unavailable), faresUnavailable: Boolean(payload?.fares_unavailable) },
 };
}

async function fetchUberLegacyPriceEstimate({ origin, destination }) {
 const token = await getUberAccessToken();
 if (!token) return null;
 const url = new URL('https://api.uber.com/v1.2/estimates/price');
 url.searchParams.set('start_latitude', String(origin.lat));
 url.searchParams.set('start_longitude', String(origin.lng));
 url.searchParams.set('end_latitude', String(destination.lat));
 url.searchParams.set('end_longitude', String(destination.lng));
 const response = await fetch(url, {
  headers: { authorization: `Bearer ${token}`, 'accept-language': 'pt-BR' },
  signal: AbortSignal.timeout(9000),
 });
 const payload = await response.json().catch(() => null);
 if (!response.ok || !Array.isArray(payload?.prices)) throw new Error(`UBER_PRICE_ESTIMATE_${response.status}`);
 const options = payload.prices.map(normalizeUberLegacyPrice).filter((item) => item.estimate || item.low || item.high);
 if (!options.length) return null;
 const best = pickBestUberOption(options);
 return { provider: 'Uber', confidence: 'oficial Uber Price Estimates', best, options: options.slice(0, 6), source: 'Uber Price Estimates API' };
}

async function fetchUberOfficialEstimate({ origin, destination, dropoffTime }) {
 if (!isTruthyEnv(process.env.UBER_ESTIMATES_ENABLED)) return null;
 const attempts = [];
 const errors = [];
 if (isTruthyEnv(process.env.UBER_FORCE_MULTI_ENDPOINTS)) attempts.push('guest', 'legacy');
 else attempts.push('guest');
 for (const attempt of [...new Set(attempts)]) {
  try {
   const result = attempt === 'guest'
    ? await fetchUberGuestTripEstimate({ origin, destination, dropoffTime })
    : await fetchUberLegacyPriceEstimate({ origin, destination });
   if (result?.best) return { ...result, attempts, errors };
  } catch (error) {
   errors.push(`${attempt}:${String(error?.message || error)}`);
  }
 }
 if (errors.length) throw new Error(errors.join('|'));
 return null;
}

async function computeRideAppPlan({ origin, destination, airport, target, arrivalDeadline, now, accuracyMeters }) {
 const maps = await computeGoogleRoutesPlan({ origin, destination, departureTime: now.toISOString(), mode: 'DRIVE' }).catch(() => null);
 const fallback = maps || localConservativeRoute({ origin, destination, mode: 'DRIVE' });
 const firstPassPickupIso = new Date(Math.max(now.getTime(), arrivalDeadline.getTime() - fallback.durationSeconds * 1000)).toISOString();
 const rideTiming = estimateCrewCheckRoadMinutes({ distanceMeters: fallback.distanceMeters, durationSeconds: fallback.durationSeconds, whenIso: firstPassPickupIso, mode: 'RIDE_APP' });
 const totalRideSeconds = Math.max(60, (rideTiming.roadMinutes + rideTiming.pickupMinutes) * 60);
 const plannedPickupIso = new Date(Math.max(now.getTime(), arrivalDeadline.getTime() - totalRideSeconds * 1000)).toISOString();
 const fare = estimateRideFareRange({ distanceMeters: fallback.distanceMeters, durationSeconds: totalRideSeconds, airport, destination, whenIso: plannedPickupIso });
 const uberLinks = buildUberRideLinks({ origin, destination, airport });
 const ninetyNineLinks = buildNinetyNineLinks({ origin, destination });
 let uberOfficial = null;
 let uberError = null;
 try {
  uberOfficial = await fetchUberOfficialEstimate({ origin, destination, dropoffTime: arrivalDeadline });
 } catch (error) {
  uberError = String(error?.message || error);
 }
 const uberFareLabel = uberOfficial?.best?.estimate || (uberOfficial?.best?.low && uberOfficial?.best?.high ? `${formatBrl(uberOfficial.best.low)}–${formatBrl(uberOfficial.best.high)}` : (fare.apps?.car?.label || fare.label));
 const carEstimateLabel = fare.apps?.car?.label || fare.label;
 const economyEstimateLabel = fare.apps?.economy?.label || carEstimateLabel;
 const motoEstimateLabel = fare.apps?.moto?.label || fare.label;
 const rideApps = [
  {
   id: 'uber',
   name: 'Uber',
   status: uberOfficial ? 'estimativa oficial disponível' : 'confirmar no app',
   fareLabel: uberFareLabel,
   fareConfidence: uberOfficial ? 'oficial' : (fare.confidence || 'estimativa CrewCheck'),
   etaMinutes: Math.max(1, Math.round((uberOfficial?.best?.durationSeconds || rideTiming.roadMinutes * 60) / 60)),
   webUrl: uberLinks.webLink,
   deepLink: uberLinks.deepLink,
   mapsUrl: uberLinks.mapsLink,
   source: uberOfficial ? 'Uber API' : (fare.source || 'Google Routes + estimativa auditável'),
   products: uberOfficial?.options || [],
  },
  {
   id: '99',
   name: '99',
   status: 'confirmar no app',
   fareLabel: economyEstimateLabel,
   fareConfidence: fare.confidence || 'estimativa CrewCheck',
   etaMinutes: Math.max(1, rideTiming.roadMinutes),
   webUrl: ninetyNineLinks.webLink,
   deepLink: ninetyNineLinks.appLink,
   source: fare.source || 'Google Routes + estimativa auditável',
   products: [],
  },
  {
   id: 'moto',
   name: 'Moto app',
   status: 'estimativa histórica',
   fareLabel: motoEstimateLabel,
   fareConfidence: fare.apps?.moto?.confidence || 'estimativa CrewCheck',
   etaMinutes: Math.max(1, Math.round(rideTiming.roadMinutes * 0.88)),
   webUrl: uberLinks.webLink,
   deepLink: uberLinks.deepLink,
   mapsUrl: uberLinks.mapsLink,
   source: `${fare.source || 'Histórico CrewCheck'} · moto derivada`,
   products: [],
  },
 ];
 return {
  mode: 'RIDE_APP',
  durationSeconds: totalRideSeconds,
  staticDurationSeconds: fallback.staticDurationSeconds || fallback.durationSeconds,
  distanceMeters: fallback.distanceMeters,
  localizedDuration: `${Math.max(1, Math.round(totalRideSeconds / 60))} min`,
  localizedDistance: fallback.localizedDistance,
  label: `Corrida por app · ${uberFareLabel}`,
  transitSteps: [],
  firstTransitDeparture: null,
  rideApps,
  fareRange: fare,
  fareLabel: uberFareLabel,
  fareConfidence: uberOfficial ? 'dados reais do Uber' : (fare.confidence || 'estimativa CrewCheck'),
  source: uberOfficial ? 'Dados reais Uber + rota' : (fare.source || `${rideTiming.sourceLabel} · pickup médio ${rideTiming.pickupMinutes} min`),
  diagnostics: { uberError, plannedPickupIso, calibration: fare.calibration || null, rideTiming },
  pickupBufferMinutes: rideTiming.pickupMinutes,
  inVehicleMinutes: rideTiming.roadMinutes,
 };
}

function localConservativeRoute({ origin, destination, mode }) {
 const straightKm = haversineKm(origin, destination);
 const isBsbAirport = String(destination?.airport || destination?.name || '').toUpperCase().includes('BSB') || Math.abs(Number(destination?.lat) + 15.8697) < 0.05;
 // Distância em linha reta subestima muito Brasília → BSB. Aplicamos fator viário para fallback
 // e um piso calibrado com trajeto real casa ⇄ Presidente Juscelino (~21–22 km).
 const km = isBsbAirport ? Math.max(straightKm * 1.42, 21.0) : straightKm * 1.25;
 const timing = estimateCrewCheckRoadMinutes({ distanceMeters: km * 1000, durationSeconds: 0, whenIso: new Date().toISOString(), mode });
 const pickup = mode === 'RIDE_APP' ? timing.pickupMinutes : 0;
 const minutes = mode === 'TRANSIT'
  ? Math.max(35, Math.ceil((km / 20) * 60) + 22)
  : mode === 'TWO_WHEELER'
   ? Math.max(14, Math.round(timing.roadMinutes * 0.82))
   : Math.max(18, timing.roadMinutes + pickup);
 return {
  mode,
  durationSeconds: minutes * 60,
  staticDurationSeconds: Math.max(10, Math.ceil((km / (mode === 'TRANSIT' ? 24 : 46)) * 60)) * 60,
  distanceMeters: Math.round(km * 1000),
  localizedDuration: `${minutes} min`,
  localizedDistance: `${Math.round(km * 10) / 10} km`,
  label: mode === 'TRANSIT' ? 'Transporte público · estimativa conservadora' : mode === 'RIDE_APP' ? 'Corrida por app · estimativa conservadora' : mode === 'TWO_WHEELER' ? 'Moto/app · estimativa conservadora' : 'Estimativa local conservadora calibrada',
  firstTransitDeparture: null,
  transitSteps: [],
  source: 'Estimativa local conservadora calibrada por distância viária',
 };
}

function buildSmartRouteOption({ route, airport, destination, origin, target, arrivalDeadline, marginMinutes, now, accuracyMeters }) {
 const leaveAt = new Date(arrivalDeadline.getTime() - route.durationSeconds * 1000);
 const isLate = leaveAt.getTime() <= now.getTime();
 const realData = /Dados reais|Google Routes|Google Directions|Uber API|Uber/.test(String(route.source || ''));
 const humanSourceLabel = realData ? 'Dados reais' : (String(route.mode || '').includes('FLIGHT') ? 'Estimativa CrewCheck · voo' : 'Estimativa CrewCheck');
 const leaveVerb = route.mode === 'RIDE_APP' ? 'Chame o app' : 'Saia';
 return {
  ok: true,
  airport,
  airportName: destination.name,
  destination: { lat: destination.lat, lng: destination.lng, name: destination.name },
  marginMinutes,
  safetyMarginMinutes: marginMinutes,
  mode: route.mode,
  label: route.label,
  presentationIso: target.toISOString(),
  arrivalDeadlineIso: arrivalDeadline.toISOString(),
  leaveAtIso: leaveAt.toISOString(),
  leaveAtLabel: isLate ? 'Sair agora' : formatClockIso(leaveAt),
  leaveAtFullLabel: isLate ? `${leaveVerb} agora` : formatLeaveDayLabel(leaveAt, now).replace(/^Saia/i, leaveVerb),
  leaveAtDayLabel: isLate ? 'hoje' : formatLeaveDayLabel(leaveAt, now).replace(/^Saia\s+/i, ''),
  arrivalDeadlineLabel: formatClockIso(arrivalDeadline),
  durationMinutes: Math.max(1, Math.round(route.durationSeconds / 60)),
  freeFlowMinutes: route.staticDurationSeconds ? Math.max(1, Math.round(route.staticDurationSeconds / 60)) : null,
  delayMinutes: route.staticDurationSeconds ? Math.max(0, Math.round((route.durationSeconds - route.staticDurationSeconds) / 60)) : null,
  distanceKm: route.distanceMeters ? Math.round((route.distanceMeters / 1000) * 10) / 10 : null,
  localizedDuration: route.localizedDuration || null,
  localizedDistance: route.localizedDistance || null,
  transitSteps: route.transitSteps || [],
  firstTransitDeparture: route.firstTransitDeparture || null,
  transitPreference: route.transitPreference || null,
  routeQuality: humanSourceLabel,
  rideApps: Array.isArray(route.rideApps) ? route.rideApps : [],
  fareRange: route.fareRange || null,
  fareLabel: route.fareLabel || null,
  fareConfidence: route.fareConfidence || null,
  mapsUrl: buildGoogleMapsWebRouteUrl({ destination }),
  isLate,
  source: route.source,
  humanSourceLabel,
  estimateDisclosure: humanSourceLabel === 'Dados reais' ? 'Dados reais' : 'Estimativa CrewCheck',
  dataQualityLabel: humanSourceLabel === 'Dados reais' ? 'dados reais' : 'estimado',
  pickupBufferMinutes: route.pickupBufferMinutes || null,
  inVehicleMinutes: route.inVehicleMinutes || null,
  originSource: origin?.source || null,
  originAddress: origin?.address || null,
  originName: origin?.name || null,
  accuracyMeters: accuracyMeters ? Math.round(Number(accuracyMeters)) : null,
  updatedAt: new Date().toISOString(),
 };
}


function nearestCrewCheckAirportFromCoords(origin) {
 const entries = Object.entries(CREWCHECK_AIRPORT_COORDS || {});
 return entries.map(([code, info]) => ({ code, ...info, distanceKm: haversineKm(origin, info) })).sort((a, b) => a.distanceKm - b.distanceKm)[0] || { code: 'BSB', ...CREWCHECK_AIRPORT_COORDS.BSB, distanceKm: 0 };
}

function buildFlightBridgeRoute({ mode, origin, destination, arrivalDeadline, target, marginMinutes }) {
 const nearest = nearestCrewCheckAirportFromCoords(origin);
 const groundMode = mode === 'TRANSIT_FLIGHT' ? 'TRANSIT' : mode === 'RIDE_APP_FLIGHT' ? 'RIDE_APP' : mode === 'MOTO_FLIGHT' ? 'TWO_WHEELER' : 'DRIVE';
 const ground = localConservativeRoute({ origin, destination: nearest, mode: groundMode });
 const airDistanceKm = haversineKm(nearest, destination);
 const flightMinutes = Math.max(55, Math.round((airDistanceKm / 720) * 60 + 45));
 const airportBufferMinutes = 90;
 const arrivalBufferMinutes = 35;
 const totalMinutes = Math.max(60, Math.round((ground.durationSeconds || 0) / 60) + airportBufferMinutes + flightMinutes + arrivalBufferMinutes);
 const groundLabel = mode === 'TRANSIT_FLIGHT' ? 'transporte público' : mode === 'RIDE_APP_FLIGHT' ? 'Uber/99' : mode === 'MOTO_FLIGHT' ? 'moto/app' : 'carro';
 return {
  mode,
  durationSeconds: totalMinutes * 60,
  staticDurationSeconds: totalMinutes * 60,
  distanceMeters: Math.round((Number(ground.distanceMeters || 0) / 1000 + airDistanceKm) * 1000),
  localizedDuration: `${totalMinutes} min`,
  localizedDistance: `${Math.round((Number(ground.distanceMeters || 0) / 1000 + airDistanceKm) * 10) / 10} km`,
  label: `${groundLabel} + voo · sair para ${nearest.code} e chegar em ${Object.entries(CREWCHECK_AIRPORT_COORDS).find(([,v]) => v === destination)?.[0] || 'origem'} antes da apresentação`,
  transitSteps: [{ mode: 'Voo', from: nearest.code, to: Object.entries(CREWCHECK_AIRPORT_COORDS).find(([,v]) => v === destination)?.[0] || 'origem', text: `Planeje um voo que chegue antes de ${formatClockIso(arrivalDeadline)}. O CrewCheck usa estimativa conservadora, não bilhete real.` }],
  firstTransitDeparture: null,
  routeQuality: 'Estimativa CrewCheck',
  source: 'CrewCheck · deslocamento intermunicipal/aéreo estimado',
  fareLabel: 'passagem a consultar',
  pickupBufferMinutes: mode === 'RIDE_APP_FLIGHT' ? 12 : null,
  inVehicleMinutes: Math.round((ground.durationSeconds || 0) / 60),
  flightBridge: { nearestAirport: nearest.code, airDistanceKm: Math.round(airDistanceKm), flightMinutes, airportBufferMinutes, arrivalBufferMinutes, targetIso: target?.toISOString?.() || null },
 };
}

async function getSmartDeparturePlan(query) {
 let lat = parseFiniteNumber(query.get('lat') || query.get('originLat'));
 let lng = parseFiniteNumber(query.get('lng') || query.get('originLng'));
 let accuracyMeters = parseFiniteNumber(query.get('accuracy'));
 const airport = normalizeAirportCode(query.get('airport') || query.get('base'));
 const targetIso = isoOrNull(query.get('targetIso') || query.get('presentationIso'));
 const marginMinutes = Math.min(180, Math.max(15, parseFiniteNumber(query.get('marginMinutes'), 30) || 30));
 const mode = normalizeSmartMode(query.get('mode'));
 const originAddress = String(query.get('originAddress') || '').trim();
 const originCep = String(query.get('originCep') || '').trim();
 const originName = String(query.get('originName') || query.get('originLabel') || '').trim();
 const clientProvider = String(query.get('provider') || '').trim();
 const locationTime = String(query.get('locationTime') || '').trim();
 const localSamples = Math.min(50, Math.max(0, parseFiniteNumber(query.get('localSamples'), 0) || 0));
 const longDistanceThresholdKm = getLongDistanceThresholdKm();
 const userAllowsFlightAboveThreshold = shouldUseFlightAboveThreshold(query.get('autoFlightOver250') || query.get('longDistancePolicy') || query.get('preferFlightOverThreshold'));
 let geocodedOrigin = null;
 if ((originAddress || originCep) && (lat === null || lng === null || String(query.get('preferAddress') || '').toLowerCase() === 'true')) {
  geocodedOrigin = await geocodeCrewCheckAddress({ address: originAddress, cep: originCep }).catch((error) => ({ ok: false, code: 'GEOCODE_EXCEPTION', message: String(error?.message || error) }));
  if (geocodedOrigin?.ok) {
   lat = geocodedOrigin.lat;
   lng = geocodedOrigin.lng;
   accuracyMeters = 20;
  }
 }
 if (lat === null || lng === null || !targetIso) {
  return { ok: false, code: 'MISSING_LOCATION_OR_TARGET', message: 'Informe/valide um endereço ou permita a localização e carregue a próxima apresentação para calcular hora de sair.' };
 }
 const destination = CREWCHECK_AIRPORT_COORDS[airport] || CREWCHECK_AIRPORT_COORDS.BSB;
 const origin = { lat, lng, source: geocodedOrigin?.ok ? 'endereço validado' : (clientProvider || 'GPS/localização'), address: geocodedOrigin?.formattedAddress || originAddress || null, name: originName || (geocodedOrigin?.formattedAddress ? 'Endereço salvo' : 'Localização atual') };
 const target = new Date(targetIso);
 const arrivalDeadline = new Date(target.getTime() - marginMinutes * 60_000);
 const now = new Date();
 const cacheKey = getCommuteCacheKey({ lat, lng, airport, targetIso, marginMinutes, mode, originAddress, originCep, autoFlightOver250: userAllowsFlightAboveThreshold, thresholdKm: longDistanceThresholdKm });
 const cached = commuteCache.get(cacheKey);
 if (cached && Date.now() - cached.time < Number(process.env.CREWCHECK_COMMUTE_CACHE_TTL_MS || 120_000)) return cached.value;

 const rideEnabled = isTruthyEnv(process.env.CREWCHECK_COMMUTE_ENABLE_RIDES);
 const configuredModes = String(process.env.CREWCHECK_COMMUTE_COMPARE_MODES || 'DRIVE,TRANSIT,RIDE_APP,TWO_WHEELER,DRIVE_FLIGHT,TRANSIT_FLIGHT,RIDE_APP_FLIGHT').split(',').map((item) => normalizeSmartMode(item)).filter(Boolean);
 const straightDistanceKm = haversineKm(origin, destination);
 const nearestOriginAirport = nearestCrewCheckAirportFromCoords(origin);
 const policyDistanceKm = Math.round((straightDistanceKm * 1.25) * 10) / 10;
 const isLongDistance = policyDistanceKm > longDistanceThresholdKm;
 const groundModes = buildGroundModeSet(configuredModes, rideEnabled);
 const flightModes = buildFlightModeSet(configuredModes, rideEnabled);
 const autoModes = isLongDistance && userAllowsFlightAboveThreshold ? flightModes : groundModes;
 const wantedModes = mode === 'AUTO' ? autoModes : [mode];
 const routeOptions = [];
 const errors = [];
 for (const wantedMode of wantedModes) {
  let route = null;
  try {
   if (wantedMode === 'DRIVE') {
    let departure = new Date(Math.max(now.getTime(), arrivalDeadline.getTime() - 45 * 60_000));
    for (let i = 0; i < 3; i += 1) {
     const result = await computeGoogleRoutesPlan({ origin, destination, departureTime: departure.toISOString(), mode: 'DRIVE' });
     if (!result?.durationSeconds) break;
     route = result;
     departure = new Date(arrivalDeadline.getTime() - result.durationSeconds * 1000);
     if (departure.getTime() < now.getTime()) departure = now;
    }
   } else if (wantedMode === 'TRANSIT') {
    const premium = await computePremiumTransitCandidates({ origin, destination, departureTime: now.toISOString(), arrivalDeadline: arrivalDeadline.toISOString() });
    errors.push(...premium.errors.slice(0, 2));
    const sortedTransit = premium.candidates.sort((a, b) => (a.durationSeconds || 999999) - (b.durationSeconds || 999999));
    for (const candidate of sortedTransit.slice(0, 3)) {
     routeOptions.push(buildSmartRouteOption({ route: candidate, airport, destination, origin, target, arrivalDeadline, marginMinutes, now, accuracyMeters }));
    }
    route = sortedTransit[0] || null;
   } else if (wantedMode === 'RIDE_APP') {
    route = await computeRideAppPlan({ origin, destination, airport, target, arrivalDeadline, now, accuracyMeters });
   } else if (wantedMode === 'TWO_WHEELER') {
    route = localConservativeRoute({ origin, destination, mode: wantedMode });
   } else if (isFlightBridgeMode(wantedMode)) {
    route = buildFlightBridgeRoute({ mode: wantedMode, origin, destination, arrivalDeadline, target, marginMinutes });
   } else {
    route = await computeGoogleRoutesPlan({ origin, destination, departureTime: now.toISOString(), mode: wantedMode });
   }
  } catch (error) {
   errors.push(String(error?.message || error));
  }
  if (!route?.durationSeconds) route = isFlightBridgeMode(wantedMode) ? buildFlightBridgeRoute({ mode: wantedMode, origin, destination, arrivalDeadline, target, marginMinutes }) : localConservativeRoute({ origin, destination, mode: wantedMode });
  if (!(wantedMode === 'TRANSIT' && routeOptions.some((option) => option.mode === 'TRANSIT'))) {
   routeOptions.push(buildSmartRouteOption({ route, airport, destination, origin, target, arrivalDeadline, marginMinutes, now, accuracyMeters }));
  }
 }

 routeOptions.sort((a, b) => {
  if (a.isLate !== b.isLate) return a.isLate ? 1 : -1;
  const durationDiff = (a.durationMinutes || 9999) - (b.durationMinutes || 9999);
  if (Math.abs(durationDiff) > 2) return durationDiff;
  const leaveA = new Date(a.leaveAtIso || 0).getTime();
  const leaveB = new Date(b.leaveAtIso || 0).getTime();
  if (Number.isFinite(leaveA) && Number.isFinite(leaveB) && leaveA !== leaveB) return leaveB - leaveA;
  if (a.mode === 'TRANSIT' && b.mode !== 'TRANSIT') return -1;
  if (a.mode !== 'TRANSIT' && b.mode === 'TRANSIT') return 1;
  if (a.mode === 'RIDE_APP' && b.mode === 'DRIVE') return -1;
  if (a.mode === 'DRIVE' && b.mode === 'RIDE_APP') return 1;
  return 0;
 });
 const primary = routeOptions[0] || buildSmartRouteOption({ route: localConservativeRoute({ origin, destination, mode: 'DRIVE' }), airport, destination, origin, target, arrivalDeadline, marginMinutes, now, accuracyMeters });
 const usedGoogle = routeOptions.some((item) => /Google Routes|Google Directions|Uber API/.test(String(item.source || '')));
 const transitBoard = routeOptions
  .filter((item) => item.mode === 'TRANSIT')
  .flatMap((item) => (item.transitSteps || []).map((step) => ({ ...step, routeLabel: item.label, leaveAtLabel: item.leaveAtLabel, source: item.source })))
  .filter((step, index, arr) => step.line || step.departureLabel || step.from)
  .filter((step, index, arr) => arr.findIndex((other) => `${other.line}:${other.departureLabel}:${other.from}` === `${step.line}:${step.departureLabel}:${step.from}`) === index)
  .slice(0, 8);
 const value = {
  ...primary,
  requestedMode: mode,
  recommendedMode: primary.mode,
  recommendedReason: isLongDistance && userAllowsFlightAboveThreshold
   ? `Distância operacional estimada de ${policyDistanceKm} km acima do raio de ${longDistanceThresholdKm} km. Como a opção do usuário permite, o CrewCheck priorizou ponte aérea/voo.`
   : isLongDistance
    ? `Distância operacional estimada de ${policyDistanceKm} km acima do raio de ${longDistanceThresholdKm} km. Como a opção de voo automático está desligada, o CrewCheck manteve comparação terrestre.`
    : primary.mode === 'TRANSIT'
     ? `Dentro do raio operacional de ${longDistanceThresholdKm} km; escolhida por menor tempo total e horários do transporte público disponíveis.`
     : primary.mode === 'RIDE_APP'
      ? `Dentro do raio operacional de ${longDistanceThresholdKm} km; recomendada pelo tempo total, já considerando média de chamada do app e trânsito por faixa de horário.`
      : `Dentro do raio operacional de ${longDistanceThresholdKm} km; escolhida por menor tempo total até o aeroporto.`,
  fastestMode: primary.mode,
  detectedOriginAirport: nearestOriginAirport?.code || null,
  nearestOriginAirport: nearestOriginAirport ? { code: nearestOriginAirport.code, name: nearestOriginAirport.name, distanceKm: Math.round(Number(nearestOriginAirport.distanceKm || 0) * 10) / 10 } : null,
  distancePolicy: {
   thresholdKm: longDistanceThresholdKm,
   policyDistanceKm,
   straightDistanceKm: Math.round(straightDistanceKm * 10) / 10,
   isLongDistance,
   userAllowsFlightAboveThreshold,
   decision: isLongDistance && userAllowsFlightAboveThreshold ? 'flight' : 'ground',
   comparedModes: wantedModes,
  },
  routeOptions,
  transitBoard,
  permissionConfidence: accuracyMeters ? (accuracyMeters <= 80 ? 'alta' : accuracyMeters <= 250 ? 'média' : 'baixa') : 'não informada',
  estimateDisclosure: usedGoogle ? 'Dados reais' : 'Estimativa CrewCheck',
  dataQualityLabel: usedGoogle ? 'dados reais' : 'estimado',
  originSourceLabel: geocodedOrigin?.ok ? 'Endereço validado' : clientProvider ? 'GPS do dispositivo' : 'Localização informada',
  locationLearning: { mode: 'local', samples: localSamples, enabled: localSamples > 0, locationTime: locationTime || null },
  warning: isLongDistance && !userAllowsFlightAboveThreshold
   ? `Trajeto longo detectado. Ative a opção de voo em longa distância para o Automático considerar ponte aérea.`
   : (usedGoogle ? null : 'Google Maps não retornou rota em tempo real. O CrewCheck mantém estimativa segura e usa TomTom apenas como fallback.'),
  diagnostics: {
   provider: isFlightBridgeMode(primary.mode) ? 'flight-threshold-policy' : primary.mode === 'RIDE_APP' ? 'ride-apps' : usedGoogle ? 'google-routes' : 'local-fallback',
   mapsKeyConfigured: Boolean(process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_ROUTES_API_KEY),
   geocodingOk: geocodedOrigin?.ok || null,
   geocodingMessage: geocodedOrigin?.ok ? geocodedOrigin.formattedAddress : sanitizePublicError(geocodedOrigin?.message || geocodedOrigin?.code || ''),
   rideAppsEnabled: rideEnabled,
   uberConfigured: Boolean(process.env.UBER_CLIENT_ID && process.env.UBER_CLIENT_SECRET),
   errors: errors.slice(0, 4).map(sanitizePublicError),
  },
 };
 commuteCache.set(cacheKey, { time: Date.now(), value });
 return value;
}



const CREWCHECK_EXCHANGE_API_BASE = String(process.env.CREWCHECK_EXCHANGE_API_BASE || 'https://api.frankfurter.dev/v1/latest').trim();
const CREWCHECK_EXCHANGE_CACHE_TTL_MS = Math.max(60_000, Number(process.env.CREWCHECK_EXCHANGE_CACHE_TTL_MS || 12 * 60 * 60 * 1000));
const exchangeRatesCache = new Map();

function normalizeCurrencyCode(value, fallback = 'BRL') {
 const code = String(value || fallback).trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
 return code.length === 3 ? code : fallback;
}

async function fetchCrewCheckExchangeRates({ base, symbols }) {
 const cleanBase = normalizeCurrencyCode(base, 'BRL');
 const cleanSymbols = Array.from(new Set(String(symbols || 'USD,EUR,ARS,GBP').split(',').map((item) => normalizeCurrencyCode(item, '')).filter(Boolean))).slice(0, 16);
 if (!cleanSymbols.length) cleanSymbols.push('BRL');
 if (cleanSymbols.length === 1 && cleanSymbols[0] === cleanBase) {
  return { ok: true, base: cleanBase, date: new Date().toISOString().slice(0, 10), rates: { [cleanBase]: 1 }, source: 'conversão local' };
 }
 const key = `${cleanBase}:${cleanSymbols.join(',')}`;
 const cached = exchangeRatesCache.get(key);
 if (cached && Date.now() - cached.cachedAt < CREWCHECK_EXCHANGE_CACHE_TTL_MS) return { ...cached.payload, cached: true };
 const controller = new AbortController();
 const timeout = setTimeout(() => controller.abort(), 10_000);
 try {
  const apiUrl = new URL(CREWCHECK_EXCHANGE_API_BASE);
  apiUrl.searchParams.set('base', cleanBase);
  apiUrl.searchParams.set('symbols', cleanSymbols.join(','));
  const response = await fetch(apiUrl, { headers: { accept: 'application/json' }, signal: controller.signal });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.rates) throw new Error(payload?.message || `Cotação indisponível (${response.status}).`);
  const rates = {};
  for (const [currency, value] of Object.entries(payload.rates || {})) {
   const number = Number(value);
   if (Number.isFinite(number) && number > 0) rates[normalizeCurrencyCode(currency)] = number;
  }
  const out = { ok: true, base: cleanBase, date: String(payload.date || new Date().toISOString().slice(0, 10)), rates, source: 'Frankfurter / bancos centrais', updatedAt: new Date().toISOString() };
  exchangeRatesCache.set(key, { cachedAt: Date.now(), payload: out });
  return out;
 } catch (error) {
  if (cached?.payload) return { ...cached.payload, cached: true, warning: 'cotação em cache usada por falha temporária' };
  throw error;
 } finally {
  clearTimeout(timeout);
 }
}


function telegramIsConfigured() {
 return Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_API_BASE);
}

function normalizeTelegramUsername(value = '') {
 return String(value || '').trim().replace(/^@+/, '').replace(/@+/g, '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 32).toLowerCase();
}

function hasTelegramUsernameInput(value = '') {
 return String(value || '').trim().replace(/^@+/, '').length > 0;
}

function isValidTelegramUsername(value = '') {
 const cleaned = normalizeTelegramUsername(value);
 return !cleaned || /^[a-z0-9_]{5,32}$/.test(cleaned);
}

function telegramMaskUsername(username = '') {
 const cleaned = normalizeTelegramUsername(username);
 if (!cleaned) return null;
 if (cleaned.length <= 4) return `@${cleaned}`;
 return `@${cleaned.slice(0, 2)}***${cleaned.slice(-2)}`;
}

function telegramMaskChat(row) {
 if (!row?.chat_id) return null;
 const chat = String(row.chat_id);
 return chat.length <= 4 ? 'conectado' : `${chat.slice(0, 3)}***${chat.slice(-2)}`;
}

function normalizeTelegramPreferences(input = {}) {
 const raw = input && typeof input === 'object' ? input : {};
 const merged = { ...TELEGRAM_DEFAULT_PREFERENCES, ...raw };
 const rawConciergeName = String(raw.conciergeName || raw.concierge_name || merged.conciergeName || TELEGRAM_DEFAULT_CONCIERGE_NAME).replace(/\s+/g, ' ').trim();
 merged.conciergeName = rawConciergeName ? rawConciergeName.slice(0, 32) : TELEGRAM_DEFAULT_CONCIERGE_NAME;
 return merged;
}

function telegramConnectCode() {
 return crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 8);
}

let telegramBotIdentityCache = { at: 0, payload: null };
async function telegramApi(method, payload = null, { query = null } = {}) {
 if (!telegramIsConfigured()) {
  const err = new Error('TELEGRAM_BOT_TOKEN não configurado no Render.');
  err.statusCode = 503;
  err.code = 'TELEGRAM_NOT_CONFIGURED';
  throw err;
 }
 const url = new URL(`${TELEGRAM_API_BASE}/${method}`);
 if (query) for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
 const controller = new AbortController();
 const timeout = setTimeout(() => controller.abort(), 12_000);
 try {
  const response = await fetch(url, {
   method: payload ? 'POST' : 'GET',
   headers: payload ? { 'content-type': 'application/json' } : undefined,
   body: payload ? JSON.stringify(payload) : undefined,
   signal: controller.signal,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.ok === false) {
   const err = new Error(data?.description || `Telegram indisponível (${response.status}).`);
   err.statusCode = response.status;
   err.code = data?.error_code || 'TELEGRAM_API_ERROR';
   throw err;
  }
  return data?.result ?? data;
 } finally {
  clearTimeout(timeout);
 }
}

async function telegramBotIdentity() {
 if (!telegramIsConfigured()) return null;
 if (telegramBotIdentityCache.payload && Date.now() - telegramBotIdentityCache.at < 10 * 60_000) return telegramBotIdentityCache.payload;
 const result = await telegramApi('getMe');
 telegramBotIdentityCache = { at: Date.now(), payload: result };
 return result;
}

function telegramPublicStatusFromRow(row, bot = null) {
 const preferences = normalizeTelegramPreferences(row?.preferences_json || {});
 const connected = Boolean(row?.is_active && row?.chat_id);
 const botUsername = bot?.username || null;
 const code = connected ? null : (row?.connect_code || null);
 return {
  ok: true,
  configured: telegramIsConfigured(),
  connected,
  botUsername,
  code,
  connectUrl: botUsername && code ? `https://t.me/${botUsername}?start=${encodeURIComponent(code)}` : null,
  expectedUsername: row?.expected_username || null,
  chat: connected ? { username: row?.chat_username || null, maskedId: telegramMaskChat(row), firstName: row?.chat_first_name || null } : null,
  preferences,
 };
}

async function telegramLinkForUser(db, userId) {
 if (!db || !userId) return null;
 const result = await db.query('select * from crewcheck_telegram_links where user_id = $1 limit 1', [userId]);
 return result.rows[0] || null;
}

async function telegramLinkForChat(db, chatId) {
 if (!db || !chatId) return null;
 const result = await db.query('select * from crewcheck_telegram_links where chat_id = $1 and is_active = true order by updated_at desc limit 1', [String(chatId)]).catch(() => ({ rows: [] }));
 return result.rows?.[0] || null;
}

function telegramMessagePdfDocument(message = {}) {
 const document = message.document || null;
 if (!document?.file_id) return null;
 const filename = String(document.file_name || 'escala.pdf').trim() || 'escala.pdf';
 const mime = String(document.mime_type || '').toLowerCase();
 const isPdf = mime === 'application/pdf' || /\.pdf$/i.test(filename);
 if (!isPdf) return null;
 return { ...document, filename };
}

async function telegramDownloadFileBuffer(fileId, maxBytes = 35 * 1024 * 1024) {
 const file = await telegramApi('getFile', null, { query: { file_id: fileId } });
 const filePath = String(file?.file_path || '').trim();
 if (!filePath) throw new Error('Telegram não retornou o caminho do arquivo.');
 const fileSize = Number(file?.file_size || 0);
 if (fileSize && fileSize > maxBytes) {
  const err = new Error('PDF maior que o limite aceito pelo CrewCheck. Envie o PDF original da escala, sem anexos extras.');
  err.statusCode = 413;
  throw err;
 }
 const downloadUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`;
 const controller = new AbortController();
 const timeout = setTimeout(() => controller.abort(), 30_000);
 try {
  const response = await fetch(downloadUrl, { signal: controller.signal });
  if (!response.ok) throw new Error(`Falha ao baixar arquivo do Telegram (${response.status}).`);
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (!buffer.length) throw new Error('Arquivo recebido vazio pelo Telegram.');
  if (buffer.length > maxBytes) {
   const err = new Error('PDF maior que o limite aceito pelo CrewCheck.');
   err.statusCode = 413;
   throw err;
  }
  return buffer;
 } finally {
  clearTimeout(timeout);
 }
}

async function telegramDownloadFileObject(fileId, maxBytes = 25 * 1024 * 1024) {
 const file = await telegramApi('getFile', null, { query: { file_id: fileId } });
 const filePath = String(file?.file_path || '').trim();
 if (!filePath) throw new Error('Telegram não retornou o caminho do áudio.');
 const fileSize = Number(file?.file_size || 0);
 if (fileSize && fileSize > maxBytes) {
  const err = new Error('Áudio maior que o limite aceito pelo Concierge. Envie uma pergunta mais curta.');
  err.statusCode = 413;
  throw err;
 }
 const downloadUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`;
 const controller = new AbortController();
 const timeout = setTimeout(() => controller.abort(), 30_000);
 try {
  const response = await fetch(downloadUrl, { signal: controller.signal });
  if (!response.ok) throw new Error(`Falha ao baixar áudio do Telegram (${response.status}).`);
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (!buffer.length) throw new Error('Áudio recebido vazio pelo Telegram.');
  if (buffer.length > maxBytes) {
   const err = new Error('Áudio maior que o limite aceito pelo Concierge.');
   err.statusCode = 413;
   throw err;
  }
  return { buffer, filePath, fileSize: fileSize || buffer.length };
 } finally {
  clearTimeout(timeout);
 }
}

function telegramMessageAudioDocument(message = {}) {
 const item = message.voice || message.audio || null;
 if (!item?.file_id) return null;
 const duration = Number(item.duration || 0);
 const isVoice = Boolean(message.voice);
 const fileName = String(message.audio?.file_name || `crewcheck-telegram-${message.message_id || Date.now()}${isVoice ? '.ogg' : '.mp3'}`).trim();
 const mimeType = String(item.mime_type || (isVoice ? 'audio/ogg' : 'audio/mpeg')).toLowerCase();
 return { ...item, isVoice, duration, filename: fileName, mimeType };
}

function openAiAudioIsConfigured() {
 return Boolean(OPENAI_API_KEY);
}

function azureSpeechIsConfigured() {
 return Boolean(AZURE_SPEECH_KEY && (AZURE_SPEECH_REGION || AZURE_SPEECH_ENDPOINT));
}

function elevenLabsAudioIsConfigured() {
 return Boolean(ELEVENLABS_API_KEY);
}

function telegramSpeechProviderOrder(kind = 'tts') {
 const configured = TELEGRAM_CONCIERGE_SPEECH_PROVIDER || 'auto';
 const normalize = (value) => {
  const raw = String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (raw === 'eleven' || raw === 'elevenlabs' || raw === '11labs' || raw === 'xi') return 'elevenlabs';
  if (raw === 'azure' || raw === 'azurespeech') return 'azure';
  if (raw === 'openai' || raw === 'gpt') return 'openai';
  if (raw === 'off' || raw === 'none' || raw === 'disabled') return 'off';
  return raw;
 };
 const explicit = String(configured || '').trim().toLowerCase();
 const pick = [];
 const push = (provider) => {
  const p = normalize(provider);
  if (!p || p === 'off' || p === 'none' || p === 'disabled') return;
  if (!['elevenlabs', 'azure', 'openai'].includes(p)) return;
  if (p === 'elevenlabs' && !elevenLabsAudioIsConfigured()) return;
  if (p === 'azure' && !azureSpeechIsConfigured()) return;
  if (p === 'openai' && !openAiAudioIsConfigured()) return;
  if (!pick.includes(p)) pick.push(p);
 };
 if (normalize(explicit) !== 'auto') {
  explicit.split(/[,;\s]+/).forEach(push);
  return pick;
 }
 // No modo auto, ElevenLabs vem primeiro quando configurado, por ser mais natural para TTS
 // e aceitar mais formatos/duração na transcrição. Azure e OpenAI ficam como fallback.
 push('elevenlabs');
 push('azure');
 push('openai');
 return pick;
}

function telegramSpeechHasProvider(kind = 'tts') {
 return telegramSpeechProviderOrder(kind).length > 0;
}

function azureSpeechBaseEndpoint(type = 'tts') {
 if (AZURE_SPEECH_ENDPOINT) {
  if (/\.speech\.microsoft\.com/i.test(AZURE_SPEECH_ENDPOINT)) return AZURE_SPEECH_ENDPOINT;
  if (/\.cognitiveservices\.azure\.com/i.test(AZURE_SPEECH_ENDPOINT)) return AZURE_SPEECH_ENDPOINT;
 }
 const subdomain = type === 'tts' ? 'tts' : 'stt';
 return `https://${AZURE_SPEECH_REGION}.${subdomain}.speech.microsoft.com`;
}

function azureSpeechTtsEndpoint() {
 const base = azureSpeechBaseEndpoint('tts');
 if (/\/cognitiveservices\/v1$/i.test(base)) return base;
 return `${base}/cognitiveservices/v1`;
}

function azureSpeechSttEndpoint() {
 const base = azureSpeechBaseEndpoint('stt');
 if (/\/stt\/speech\/recognition\/conversation\/cognitiveservices\/v1$/i.test(base)) return base;
 if (/\.cognitiveservices\.azure\.com$/i.test(base)) return `${base}/stt/speech/recognition/conversation/cognitiveservices/v1`;
 return `${base}/speech/recognition/conversation/cognitiveservices/v1`;
}

function speechProviderLabel(provider = '') {
 const p = String(provider || '').toLowerCase();
 if (p === 'elevenlabs') return 'ElevenLabs';
 if (p === 'azure') return 'Azure Speech';
 if (p === 'openai') return 'OpenAI';
 return 'serviço de voz';
}

function classifySpeechAudioError(error = {}) {
 const raw = String(error?.message || error || '').replace(/\s+/g, ' ').trim();
 const code = String(error?.code || '').toLowerCase();
 const status = Number(error?.statusCode || error?.status || 0);
 const provider = String(error?.provider || '').toLowerCase();
 const providerName = speechProviderLabel(provider);
 const quota = code.includes('insufficient_quota') || code.includes('quota') || /exceeded your current quota|check your plan and billing|atingiu.*limite|limite de uso|quota|billing|free tier|cota/i.test(raw);
 const rate = !quota && (status === 429 || code.includes('rate_limit') || /rate limit|too many requests|muitas solicitações|limite de taxa|throttl/i.test(raw));
 const auth = status === 401 || status === 403 || code.includes('invalid_api_key') || code.includes('unauthorized') || /api key|subscription key|unauthorized|permission|forbidden|sem permissão|chave|assinatura/i.test(raw);
 const notConfigured = code === 'openai_not_configured' || code === 'azure_speech_not_configured' || code === 'elevenlabs_not_configured' || /OPENAI_API_KEY.*não configurada|AZURE_SPEECH_KEY.*não configurada|ELEVENLABS_API_KEY.*não configurada|não configurad/i.test(raw);
 const unsupported = code === 'azure_stt_unsupported_format' || /unsupported.*format|formato.*não compatível|codec|samplerate|ogg opus/i.test(raw);
 const timeout = /abort|timeout|timed out|tempo esgotado/i.test(raw);
 if (quota) {
  return {
   kind: 'quota',
   title: 'Áudio indisponível no momento',
   lines: [
    `A integração de voz (${providerName}) retornou limite de uso/cota.`,
    'Sua pergunta por áudio não foi processada para evitar resposta incorreta.',
    'Envie a pergunta por texto enquanto o administrador ajusta o billing/usage da chave API.'
   ],
   log: raw || `${providerName} quota exceeded`
  };
 }
 if (rate) {
  return {
   kind: 'rate_limit',
   title: 'Voz temporariamente ocupada',
   lines: [
    `A integração de voz (${providerName}) recebeu muitas solicitações ao mesmo tempo.`,
    'Tente novamente em alguns instantes ou envie sua pergunta por texto.'
   ],
   log: raw || `${providerName} rate limit`
  };
 }
 if (auth) {
  return {
   kind: 'auth',
   title: 'Voz precisa de configuração',
   lines: [
    `A chave do ${providerName} não autorizou o uso de áudio neste servidor.`,
    'Envie por texto enquanto o administrador confere a chave, a região, o projeto e as permissões.'
   ],
   log: raw || `${providerName} auth/config error`
  };
 }
 if (notConfigured) {
  return {
   kind: 'not_configured',
   title: 'Voz não configurada',
   lines: [
    'Nenhum provedor de voz está disponível no servidor.',
    'Configure ELEVENLABS_API_KEY, AZURE_SPEECH_KEY/AZURE_SPEECH_REGION ou OPENAI_API_KEY no Render para ativar áudio no Concierge.'
   ],
   log: raw || 'Speech provider not configured'
  };
 }
 if (unsupported) {
  return {
   kind: 'unsupported_format',
   title: 'Formato de áudio não compatível',
   lines: [
    'O Azure Speech funciona melhor com mensagem de voz do Telegram em OGG/Opus.',
    'Envie uma mensagem de voz normal pelo Telegram ou mande por texto.'
   ],
   log: raw || 'Azure STT unsupported format'
  };
 }
 if (timeout) {
  return {
   kind: 'timeout',
   title: 'Áudio demorou demais',
   lines: [
    'A leitura do áudio demorou mais que o esperado.',
    'Reenvie com menos ruído, grave um áudio mais curto ou mande por texto.'
   ],
   log: raw || `${providerName} audio timeout`
  };
 }
 return {
  kind: 'generic',
  title: 'Não consegui processar o áudio',
  lines: [
   'Não consegui entender ou converter esse áudio agora.',
   'Tente reenviar com menos ruído ou mande por texto.'
  ],
  log: raw || 'Speech audio error'
 };
}

function classifyOpenAiAudioError(error = {}) {
 return classifySpeechAudioError({ ...error, provider: error?.provider || 'openai' });
}

function markSpeechError(error, provider, fallbackCode = '') {
 if (error && typeof error === 'object') {
  if (!error.provider) error.provider = provider;
  if (!error.code && fallbackCode) error.code = fallbackCode;
 }
 return error;
}

async function openAiTranscribeAudio(buffer, { filename = 'audio.ogg', mimeType = 'audio/ogg' } = {}) {
 if (!openAiAudioIsConfigured()) {
  const err = new Error('OPENAI_API_KEY não configurada no Render.');
  err.code = 'OPENAI_NOT_CONFIGURED';
  err.statusCode = 503;
  throw err;
 }
 const form = new FormData();
 form.append('file', new Blob([buffer], { type: mimeType || 'audio/ogg' }), filename || 'audio.ogg');
 form.append('model', OPENAI_TRANSCRIBE_MODEL);
 form.append('language', 'pt');
 form.append('prompt', 'Áudio curto em português brasileiro de tripulante perguntando sobre escala, voo, portão, saída inteligente, diárias, rotina ou alertas do CrewCheck. Preserve números de voo como LA1234, horários e aeroportos IATA.');
 const controller = new AbortController();
 const timeout = setTimeout(() => controller.abort(), 45_000);
 try {
  const response = await fetch(`${OPENAI_AUDIO_API_BASE}/audio/transcriptions`, {
   method: 'POST',
   headers: { authorization: `Bearer ${OPENAI_API_KEY}` },
   body: form,
   signal: controller.signal,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
   const err = new Error(data?.error?.message || data?.message || `Falha na transcrição OpenAI (${response.status}).`);
   err.statusCode = response.status;
   err.code = data?.error?.code || 'OPENAI_TRANSCRIPTION_ERROR';
   throw err;
  }
  const text = String(data?.text || '').replace(/\s+/g, ' ').trim();
  if (!text) throw new Error('Não consegui entender o áudio. Envie novamente com menos ruído ou digite a pergunta.');
  return text.slice(0, 1200);
 } finally {
  clearTimeout(timeout);
 }
}


async function elevenLabsTranscribeAudio(buffer, { filename = 'audio.ogg', mimeType = 'audio/ogg' } = {}) {
 if (!elevenLabsAudioIsConfigured()) {
  const err = new Error('ELEVENLABS_API_KEY não configurada no Render.');
  err.code = 'ELEVENLABS_NOT_CONFIGURED';
  err.statusCode = 503;
  err.provider = 'elevenlabs';
  throw err;
 }
 const form = new FormData();
 form.append('model_id', ELEVENLABS_STT_MODEL || 'scribe_v2');
 form.append('file', new Blob([buffer], { type: mimeType || 'audio/ogg' }), filename || 'audio.ogg');
 if (ELEVENLABS_STT_LANGUAGE) form.append('language_code', ELEVENLABS_STT_LANGUAGE);
 form.append('tag_audio_events', 'false');
 form.append('diarize', 'false');
 form.append('timestamps_granularity', 'none');
 const controller = new AbortController();
 const timeout = setTimeout(() => controller.abort(), 60_000);
 try {
  const response = await fetch(`${ELEVENLABS_API_BASE}/speech-to-text`, {
   method: 'POST',
   headers: { 'xi-api-key': ELEVENLABS_API_KEY },
   body: form,
   signal: controller.signal,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
   const err = new Error(data?.detail?.message || data?.message || data?.detail || `Falha na transcrição ElevenLabs (${response.status}).`);
   err.statusCode = response.status;
   err.code = data?.detail?.code || data?.code || 'ELEVENLABS_STT_ERROR';
   err.provider = 'elevenlabs';
   throw err;
  }
  const text = String(data?.text || data?.transcript || '').replace(/\s+/g, ' ').trim();
  if (!text) {
   const err = new Error('ElevenLabs não retornou transcrição reconhecida.');
   err.code = 'ELEVENLABS_STT_EMPTY';
   err.provider = 'elevenlabs';
   throw err;
  }
  return text.slice(0, 1200);
 } finally {
  clearTimeout(timeout);
 }
}

async function azureSpeechToTextShortAudio(buffer, { filename = 'audio.ogg', mimeType = 'audio/ogg' } = {}) {
 if (!azureSpeechIsConfigured()) {
  const err = new Error('AZURE_SPEECH_KEY/AZURE_SPEECH_REGION não configurada no Render.');
  err.code = 'AZURE_SPEECH_NOT_CONFIGURED';
  err.statusCode = 503;
  err.provider = 'azure';
  throw err;
 }
 const lowerMime = String(mimeType || '').toLowerCase();
 const lowerName = String(filename || '').toLowerCase();
 let contentType = '';
 if (lowerMime.includes('ogg') || lowerName.endsWith('.ogg') || lowerName.endsWith('.oga')) {
  contentType = 'audio/ogg; codecs=opus';
 } else if (lowerMime.includes('wav') || lowerName.endsWith('.wav')) {
  contentType = 'audio/wav; codecs=audio/pcm; samplerate=16000';
 } else {
  const err = new Error('Formato de áudio não compatível com Azure Speech REST curto. Use voice note OGG/Opus ou WAV PCM 16k mono.');
  err.code = 'AZURE_STT_UNSUPPORTED_FORMAT';
  err.statusCode = 415;
  err.provider = 'azure';
  throw err;
 }
 const url = new URL(azureSpeechSttEndpoint());
 url.searchParams.set('language', AZURE_STT_LANGUAGE || 'pt-BR');
 url.searchParams.set('format', 'detailed');
 const controller = new AbortController();
 const timeout = setTimeout(() => controller.abort(), 45_000);
 try {
  const response = await fetch(url, {
   method: 'POST',
   headers: {
    'Ocp-Apim-Subscription-Key': AZURE_SPEECH_KEY,
    'Content-Type': contentType,
    'Accept': 'application/json',
    'User-Agent': 'CrewCheck-Telegram-Concierge/11.0.87',
   },
   body: buffer,
   signal: controller.signal,
  });
  const contentTypeResponse = String(response.headers.get('content-type') || '').toLowerCase();
  const data = contentTypeResponse.includes('json') ? await response.json().catch(() => null) : null;
  const raw = data ? '' : await response.text().catch(() => '');
  if (!response.ok) {
   const message = data?.message || data?.error?.message || data?.error || raw || `Falha na transcrição Azure Speech (${response.status}).`;
   const err = new Error(message);
   err.statusCode = response.status;
   err.code = data?.error?.code || data?.code || 'AZURE_STT_ERROR';
   err.provider = 'azure';
   throw err;
  }
  const best = data?.NBest?.[0]?.Display || data?.NBest?.[0]?.Lexical || data?.DisplayText || data?.Text || '';
  const text = String(best || '').replace(/\s+/g, ' ').trim();
  if (!text) {
   const err = new Error('Azure Speech não retornou transcrição reconhecida.');
   err.code = 'AZURE_STT_EMPTY';
   err.provider = 'azure';
   throw err;
  }
  return text.slice(0, 1200);
 } finally {
  clearTimeout(timeout);
 }
}

async function transcribeTelegramAudio(buffer, options = {}) {
 const order = telegramSpeechProviderOrder('stt');
 if (!order.length) {
  const err = new Error('Nenhum provedor de transcrição configurado.');
  err.code = 'SPEECH_PROVIDER_NOT_CONFIGURED';
  err.statusCode = 503;
  throw err;
 }
 const failures = [];
 for (const provider of order) {
  try {
   if (provider === 'elevenlabs') return await elevenLabsTranscribeAudio(buffer, options);
   if (provider === 'azure') return await azureSpeechToTextShortAudio(buffer, options);
   if (provider === 'openai') return await openAiTranscribeAudio(buffer, options);
  } catch (error) {
   failures.push(markSpeechError(error, provider));
   console.warn(`[telegram] transcrição ${provider} falhou; ${failures.length < order.length ? 'tentando fallback' : 'sem fallback disponível'}`, error?.message || error);
  }
 }
 const preferred = failures.find((error) => String(error?.code || '').toLowerCase() !== 'azure_stt_unsupported_format') || failures[0] || new Error('Falha ao transcrever áudio.');
 throw preferred;
}

function telegramPlainTextFromPremiumMessage(text = '') {
 return String(text || '')
  .replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/[•🤖✈️🧭📅🛫⚠️📊💼✅⏱️📍🚘💎🎙️]/g, '')
  .replace(/\n{3,}/g, '\n\n')
  .trim();
}


async function elevenLabsTextToSpeechBuffer(text, { voice = ELEVENLABS_TTS_VOICE_ID, userName = '', conciergeName = TELEGRAM_DEFAULT_CONCIERGE_NAME } = {}) {
 if (!elevenLabsAudioIsConfigured()) {
  const err = new Error('ELEVENLABS_API_KEY não configurada no Render.');
  err.code = 'ELEVENLABS_NOT_CONFIGURED';
  err.statusCode = 503;
  err.provider = 'elevenlabs';
  throw err;
 }
 const input = telegramConciergeTrimAudioText(telegramPlainTextFromPremiumMessage(text), TELEGRAM_CONCIERGE_AUDIO_MAX_CHARS);
 if (!input) throw new Error('Não há texto suficiente para gerar áudio.');
 const cleanVoice = String(voice || ELEVENLABS_TTS_VOICE_ID || '').trim();
 if (!cleanVoice) {
  const err = new Error('ELEVENLABS_TTS_VOICE_ID não configurado.');
  err.code = 'ELEVENLABS_VOICE_NOT_CONFIGURED';
  err.provider = 'elevenlabs';
  throw err;
 }
 const url = new URL(`${ELEVENLABS_API_BASE}/text-to-speech/${encodeURIComponent(cleanVoice)}`);
 url.searchParams.set('output_format', ELEVENLABS_TTS_OUTPUT_FORMAT || 'mp3_22050_32');
 const controller = new AbortController();
 const timeout = setTimeout(() => controller.abort(), 60_000);
 try {
  const response = await fetch(url, {
   method: 'POST',
   headers: {
    'xi-api-key': ELEVENLABS_API_KEY,
    'Content-Type': 'application/json',
    'Accept': 'audio/mpeg',
   },
   body: JSON.stringify({
    text: input,
    model_id: ELEVENLABS_TTS_MODEL || 'eleven_multilingual_v2',
    language_code: 'pt',
    previous_text: userName ? `Mensagem de voz curta para ${userName}, em português brasileiro, natural e levemente informal.` : 'Mensagem de voz curta em português brasileiro, natural e levemente informal.',
    next_text: 'Resposta objetiva de concierge de aviação, sem ler siglas de escala literalmente.',
    voice_settings: {
     stability: ELEVENLABS_TTS_STABILITY,
     similarity_boost: ELEVENLABS_TTS_SIMILARITY_BOOST,
     style: ELEVENLABS_TTS_STYLE,
     use_speaker_boost: ELEVENLABS_TTS_SPEAKER_BOOST,
    },
   }),
   signal: controller.signal,
  });
  if (!response.ok) {
   const contentType = String(response.headers.get('content-type') || '').toLowerCase();
   const data = contentType.includes('json') ? await response.json().catch(() => null) : null;
   const raw = data ? '' : await response.text().catch(() => '');
   const err = new Error(data?.detail?.message || data?.message || data?.detail || raw || `Falha no Text to Speech ElevenLabs (${response.status}).`);
   err.statusCode = response.status;
   err.code = data?.detail?.code || data?.code || 'ELEVENLABS_TTS_ERROR';
   err.provider = 'elevenlabs';
   throw err;
  }
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (!buffer.length) {
   const err = new Error('ElevenLabs retornou áudio vazio.');
   err.code = 'ELEVENLABS_TTS_EMPTY';
   err.provider = 'elevenlabs';
   throw err;
  }
  return buffer;
 } finally {
  clearTimeout(timeout);
 }
}

async function openAiTextToSpeechBuffer(text, { voice = OPENAI_TTS_VOICE, userName = '', conciergeName = TELEGRAM_DEFAULT_CONCIERGE_NAME } = {}) {
 if (!openAiAudioIsConfigured()) {
  const err = new Error('OPENAI_API_KEY não configurada no Render.');
  err.code = 'OPENAI_NOT_CONFIGURED';
  err.statusCode = 503;
  throw err;
 }
 const input = telegramConciergeTrimAudioText(telegramPlainTextFromPremiumMessage(text), TELEGRAM_CONCIERGE_AUDIO_MAX_CHARS);
 if (!input) throw new Error('Não há texto suficiente para gerar áudio.');
 const controller = new AbortController();
 const timeout = setTimeout(() => controller.abort(), 45_000);
 try {
  const response = await fetch(`${OPENAI_AUDIO_API_BASE}/audio/speech`, {
   method: 'POST',
   headers: { authorization: `Bearer ${OPENAI_API_KEY}`, 'content-type': 'application/json' },
   body: JSON.stringify({
    model: OPENAI_TTS_MODEL,
    input,
    voice: voice || OPENAI_TTS_VOICE,
    response_format: 'mp3',
    speed: OPENAI_TTS_SPEED,
    instructions: `Fale em português brasileiro, com voz natural, premium, cordial e segura. Você é ${conciergeName || TELEGRAM_DEFAULT_CONCIERGE_NAME}. Seja humano, objetivo, levemente caloroso e use o nome ${userName || 'do usuário'} quando fizer sentido. Não soe robótico.`,
   }),
   signal: controller.signal,
  });
  if (!response.ok) {
   const data = await response.json().catch(() => null);
   const err = new Error(data?.error?.message || data?.message || `Falha no Text to Speech OpenAI (${response.status}).`);
   err.statusCode = response.status;
   err.code = data?.error?.code || 'OPENAI_TTS_ERROR';
   throw err;
  }
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (!buffer.length) throw new Error('OpenAI retornou áudio vazio.');
  return buffer;
 } finally {
  clearTimeout(timeout);
 }
}


function azureXmlEscape(value = '') {
 return String(value ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch] || ch));
}

function azureSpeechSsmlContent(text = '') {
 const plain = telegramConciergeTrimAudioText(telegramPlainTextFromPremiumMessage(text), TELEGRAM_CONCIERGE_AUDIO_MAX_CHARS);
 const parts = plain.split(/\n+/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 12);
 const content = (parts.length ? parts : [plain]).map((line, index) => `${azureXmlEscape(line)}${index < parts.length - 1 ? '<break time="260ms"/>' : ''}`).join(' ');
 return content || 'CrewCheck Concierge.';
}

function azureSpeechBuildSsml(text, { voice = AZURE_TTS_VOICE, style = AZURE_TTS_STYLE } = {}) {
 const content = azureSpeechSsmlContent(text);
 const prosody = `<prosody rate="${azureXmlEscape(AZURE_TTS_RATE || '+2%')}" pitch="${azureXmlEscape(AZURE_TTS_PITCH || '+0%')}">${content}</prosody>`;
 const expressive = style ? `<mstts:express-as style="${azureXmlEscape(style)}">${prosody}</mstts:express-as>` : prosody;
 return `<?xml version="1.0" encoding="UTF-8"?>\n<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="pt-BR"><voice name="${azureXmlEscape(voice || AZURE_TTS_VOICE)}">${expressive}</voice></speak>`;
}

async function azureSpeechTextToSpeechBuffer(text, { voice = AZURE_TTS_VOICE, style = AZURE_TTS_STYLE } = {}) {
 if (!azureSpeechIsConfigured()) {
  const err = new Error('AZURE_SPEECH_KEY/AZURE_SPEECH_REGION não configurada no Render.');
  err.code = 'AZURE_SPEECH_NOT_CONFIGURED';
  err.statusCode = 503;
  err.provider = 'azure';
  throw err;
 }
 const input = telegramConciergeTrimAudioText(telegramPlainTextFromPremiumMessage(text), TELEGRAM_CONCIERGE_AUDIO_MAX_CHARS);
 if (!input) throw new Error('Não há texto suficiente para gerar áudio.');
 const attempt = async (attemptStyle) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
   const response = await fetch(azureSpeechTtsEndpoint(), {
    method: 'POST',
    headers: {
     'Ocp-Apim-Subscription-Key': AZURE_SPEECH_KEY,
     'Content-Type': 'application/ssml+xml',
     'X-Microsoft-OutputFormat': AZURE_TTS_OUTPUT_FORMAT,
     'Accept': 'audio/mpeg',
     'User-Agent': 'CrewCheck-Telegram-Concierge/11.0.87',
    },
    body: azureSpeechBuildSsml(input, { voice, style: attemptStyle }),
    signal: controller.signal,
   });
   if (!response.ok) {
    const raw = await response.text().catch(() => '');
    const err = new Error(raw || `Falha no Text to Speech Azure Speech (${response.status}).`);
    err.statusCode = response.status;
    err.code = 'AZURE_TTS_ERROR';
    err.provider = 'azure';
    throw err;
   }
   const arrayBuffer = await response.arrayBuffer();
   const buffer = Buffer.from(arrayBuffer);
   if (!buffer.length) {
    const err = new Error('Azure Speech retornou áudio vazio.');
    err.code = 'AZURE_TTS_EMPTY';
    err.provider = 'azure';
    throw err;
   }
   return buffer;
  } finally {
   clearTimeout(timeout);
  }
 };
 try {
  return await attempt(style);
 } catch (error) {
  if (style) {
   console.warn('[telegram] Azure TTS falhou com estilo SSML; tentando sem estilo', error?.message || error);
   return await attempt('');
  }
  throw error;
 }
}

async function textToSpeechBuffer(text, options = {}) {
 const order = telegramSpeechProviderOrder('tts');
 if (!order.length) {
  const err = new Error('Nenhum provedor de text-to-speech configurado.');
  err.code = 'SPEECH_PROVIDER_NOT_CONFIGURED';
  err.statusCode = 503;
  throw err;
 }
 const failures = [];
 for (const provider of order) {
  try {
   if (provider === 'elevenlabs') return await elevenLabsTextToSpeechBuffer(text, options);
   if (provider === 'azure') return await azureSpeechTextToSpeechBuffer(text, options);
   if (provider === 'openai') return await openAiTextToSpeechBuffer(text, options);
  } catch (error) {
   failures.push(markSpeechError(error, provider));
   console.warn(`[telegram] TTS ${provider} falhou; ${failures.length < order.length ? 'tentando fallback' : 'usando texto'}`, error?.message || error);
  }
 }
 throw failures[0] || new Error('Falha ao gerar áudio.');
}

async function saveRosterForUser(db, user, { roster, compliance = null, gym = [], sourceFileName = null, importSource = 'api' }) {
 if (!db || !user?.id) throw new Error('Usuário não identificado para salvar a escala.');
 if (!roster || !Array.isArray(roster.days)) throw new Error('PDF interpretado, mas não retornou uma escala válida.');
 await assertRosterBelongsToPremiumUser(db, user, roster, sourceFileName || null);
 const billingForRosterSave = billingStatusFromUser(user);
 if (!billingForRosterSave?.premiumAccess && !isBillingAdmin(user)) {
  const existingFree = await db.query('select count(*)::int as total from crewcheck_rosters where user_id = $1', [user.id]).catch(() => ({ rows: [{ total: 0 }] }));
  const totalFree = Number(existingFree.rows?.[0]?.total || 0);
  if (totalFree >= Number(process.env.CREWCHECK_FREE_ROSTER_ARCHIVE_LIMIT || 1)) {
   const err = new Error('Plano gratuito: apenas uma escala na nuvem. Assine Premium para histórico completo e Concierge.');
   err.statusCode = 402;
   err.code = 'PREMIUM_ARCHIVE_REQUIRED';
   throw err;
  }
 }
 const alerts = Array.isArray(compliance?.alerts) ? compliance.alerts : [];
 const criticalAlerts = alerts.filter((alert) => alert?.severity === 'error');
 const payloadChecksum = checksumPayload({ roster, compliance, gym, sourceFileName: sourceFileName || null });
 const existing = await db.query(
  `select id from crewcheck_rosters
   where checksum = $1 and (($2::uuid is null and user_id is null) or user_id = $2)
   limit 1`,
  [payloadChecksum, user.id || null],
 );
 const params = [
  user.id || null,
  roster.crewName || null,
  roster.crewId || null,
  roster.base || null,
  roster.rank || null,
  roster.airline || null,
  Number(roster.year) || null,
  Number(roster.month) || null,
  sourceFileName || null,
  JSON.stringify(roster),
  JSON.stringify(compliance),
  JSON.stringify(Array.isArray(gym) ? gym : []),
  Number(compliance?.score ?? null),
  Number(compliance?.loadAnalysis?.intensityScore ?? null),
  alerts.length,
  criticalAlerts.length,
  payloadChecksum,
 ];
 let result;
 let action = 'roster.created';
 if (existing.rowCount) {
  result = await db.query(
   `update crewcheck_rosters
      set updated_at = now(), user_id = $1, crew_name = $2, crew_id = $3, base = $4, rank = $5, airline = $6,
          period_year = $7, period_month = $8, source_file_name = $9, roster_json = $10::jsonb,
          compliance_json = $11::jsonb, gym_json = $12::jsonb, score = $13, intensity_score = $14,
          alerts_count = $15, critical_alerts_count = $16, checksum = $17
    where id = $18
    returning id, created_at, updated_at, crew_name, crew_id, base, rank, airline, period_year, period_month,
      source_file_name, score, intensity_score, alerts_count, critical_alerts_count, checksum`,
   [...params, existing.rows[0].id],
  );
  action = 'roster.updated_dedup';
 } else {
  result = await db.query(
   `insert into crewcheck_rosters (
      id, user_id, crew_name, crew_id, base, rank, airline, period_year, period_month, source_file_name,
      roster_json, compliance_json, gym_json, score, intensity_score, alerts_count, critical_alerts_count, checksum
    ) values ($18,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb,$13,$14,$15,$16,$17)
    returning id, created_at, updated_at, crew_name, crew_id, base, rank, airline, period_year, period_month,
      source_file_name, score, intensity_score, alerts_count, critical_alerts_count, checksum`,
   [...params, newId()],
  );
 }
 if (user.id && (roster.crewId || roster.base || roster.rank || roster.crewName)) {
  await db.query(
   `update crewcheck_users
      set crew_id = coalesce(nullif($2, ''), crew_id),
          base = coalesce(nullif($3, ''), base),
          rank = coalesce(nullif($4, ''), rank),
          name = case when $5 is not null and length(trim($5)) > 2 then $5 else name end,
          updated_at = now()
    where id = $1`,
   [user.id, roster.crewId || null, roster.base || null, roster.rank || null, roster.crewName || null],
  ).catch(() => null);
 }
 await db.query('insert into crewcheck_audit_logs (id, user_id, action, entity_id, metadata) values ($1, $2, $3, $4, $5::jsonb)', [
  newId(), user.id || null, action, result.rows[0].id,
  JSON.stringify({ sourceFileName: sourceFileName || null, alerts: alerts.length, criticalAlerts: criticalAlerts.length, checksum: payloadChecksum, importSource }),
 ]).catch(() => null);
 await storeTelegramRosterSnapshotForUser(db, user, { roster, compliance, gym, sourceFileName, checksum: payloadChecksum }).catch(() => null);
 return { row: result.rows[0], deduplicated: Boolean(existing.rowCount), alerts, criticalAlerts, checksum: payloadChecksum };
}

function telegramConciergeRosterSnapshotFromLink(linkRow = null) {
 const raw = telegramConciergeSafeJson(linkRow?.preferences_json, linkRow?.preferences_json || {}) || {};
 const snapshot = raw._conciergeRosterSnapshot || raw.conciergeRosterSnapshot || null;
 const roster = snapshot?.roster;
 if (!roster || !Array.isArray(roster.days)) return null;
 return {
  id: snapshot.id || `telegram-snapshot-${linkRow?.user_id || 'user'}`,
  created_at: snapshot.createdAt || snapshot.updatedAt || new Date().toISOString(),
  updated_at: snapshot.updatedAt || snapshot.createdAt || new Date().toISOString(),
  period_year: Number(snapshot.periodYear || roster.year) || null,
  period_month: Number(snapshot.periodMonth || roster.month) || null,
  roster,
  compliance: snapshot.compliance || null,
  gym: Array.isArray(snapshot.gym) ? snapshot.gym : [],
  crew_id: roster.crewId || snapshot.crewId || null,
  crew_name: roster.crewName || snapshot.crewName || null,
  checksum: snapshot.checksum || null,
  source_file_name: snapshot.sourceFileName || 'Escala sincronizada com Telegram',
  source: 'telegram_link_snapshot',
 };
}

async function storeTelegramRosterSnapshotForUser(db, user, { roster, compliance = null, gym = [], sourceFileName = null, checksum = null } = {}) {
 if (!db || !user?.id || !roster || !Array.isArray(roster.days)) return null;
 if (!telegramIsConfigured()) return null;
 const row = await ensureTelegramLinkForUser(db, user).catch(() => null);
 if (!row?.id) return null;
 const raw = telegramConciergeSafeJson(row.preferences_json, row.preferences_json || {}) || {};
 const preferences = { ...raw };
 const snapshot = {
  id: `telegram-snapshot-${user.id}-${Date.now()}`,
  updatedAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  periodYear: Number(roster.year) || null,
  periodMonth: Number(roster.month) || null,
  crewId: roster.crewId || null,
  crewName: roster.crewName || null,
  sourceFileName: sourceFileName || null,
  checksum: checksum || null,
  roster,
  compliance,
  gym: Array.isArray(gym) ? gym : [],
 };
 preferences._conciergeRosterSnapshot = snapshot;
 await db.query('update crewcheck_telegram_links set preferences_json = $1::jsonb, updated_at = now() where id = $2', [JSON.stringify(preferences), row.id]).catch(() => null);
 return snapshot;
}

async function importTelegramPdfRoster(db, row, message, document) {
 if (!row?.user_id) {
  await telegramSendMessage(message.chat.id, telegramPremiumMessage('roster', 'Conecte sua conta primeiro', ['Antes de enviar PDF, abra o CrewCheck, informe seu @Telegram e toque em Conectar Telegram.', 'Depois envie a escala em PDF aqui no bot.'], { footer: 'O vínculo garante que a escala seja salva na conta correta.' }), { reply_markup: telegramPremiumReplyMarkup('Abrir CrewCheck') });
  return { ok: false, waitingForConnection: true };
 }
 const userResult = await db.query('select * from crewcheck_users where id = $1 limit 1', [row.user_id]).catch(() => ({ rows: [] }));
 const user = userResult.rows?.[0];
 if (!user?.id) throw new Error('Conta CrewCheck vinculada ao Telegram não foi encontrada.');
 const filename = document.filename || document.file_name || 'escala.pdf';
 await telegramSendMessage(message.chat.id, telegramPremiumMessage('roster', 'Escala recebida', ['PDF recebido pelo Telegram.', 'Estou analisando sua escala e salvando no CrewCheck.', 'Você receberá uma confirmação assim que a leitura terminar.'], { footer: 'Mantenha o PDF original; imagens ou prints podem exigir upload manual.' }), { reply_markup: telegramPremiumReplyMarkup('Abrir CrewCheck') }).catch(() => null);
 const buffer = await telegramDownloadFileBuffer(document.file_id);
 const parsed = await parsePdfOnServer({ filename, dataBase64: buffer.toString('base64') });
 const saved = await saveRosterForUser(db, user, { roster: parsed.roster, compliance: parsed.compliance || null, gym: parsed.gym || [], sourceFileName: filename, importSource: 'telegram_pdf' });
 const days = Array.isArray(parsed.roster?.days) ? parsed.roster.days.length : 0;
 const flights = (parsed.roster?.days || []).reduce((sum, day) => sum + (Array.isArray(day.legs) ? day.legs.length : 0), 0);
 const inactive = (parsed.roster?.days || []).filter((day) => /INATIV|PERNOITE|LAYOVER|HOTEL|ACOMOD/i.test(`${day.type || ''} ${day.pairingCode || ''} ${day.rawText || ''}`)).length;
 await telegramSendMessage(message.chat.id, telegramPremiumMessage('roster', saved.deduplicated ? 'Escala atualizada' : 'Escala importada com sucesso', [
  `${String(parsed.roster?.month || '').padStart(2, '0')}/${parsed.roster?.year || '----'} · Base ${parsed.roster?.base || 'não informada'}`,
  `${days} dia(s) de programação · ${flights} trecho(s) de voo.`,
  inactive ? `${inactive} inativo(s)/pernoite(s) identificado(s) para conferência de diárias.` : 'Inativos/pernoites não apareceram neste PDF.',
  'Abra o CrewCheck para conferir escala, diárias, salário, Saída Inteligente e tripulação.',
 ], { footer: 'Importação via Telegram concluída. Confira sempre com a publicação oficial.' }), { reply_markup: telegramPremiumReplyMarkup('Abrir CrewCheck') });
 return { ok: true, rosterId: saved.row.id, deduplicated: saved.deduplicated };
}

async function ensureTelegramLinkForUser(db, user, expectedUsername = '') {
 const cleanedExpectedUsername = normalizeTelegramUsername(expectedUsername);
 let row = await telegramLinkForUser(db, user.id);
 if (row) {
  if (cleanedExpectedUsername && normalizeTelegramUsername(row.expected_username) !== cleanedExpectedUsername) {
   await db.query('update crewcheck_telegram_links set expected_username = $1, updated_at = now() where id = $2', [cleanedExpectedUsername, row.id]).catch(() => null);
   row = await telegramLinkForUser(db, user.id);
  }
  return row;
 }
 let code = telegramConnectCode();
 for (let i = 0; i < 5; i += 1) {
  const exists = await db.query('select id from crewcheck_telegram_links where connect_code = $1 limit 1', [code]).catch(() => ({ rows: [] }));
  if (!exists.rows?.length) break;
  code = telegramConnectCode();
 }
 const id = newId();
 await db.query(
  `insert into crewcheck_telegram_links (id, user_id, connect_code, expected_username, preferences_json, is_active)
   values ($1, $2, $3, $4, $5::jsonb, false)`,
  [id, user.id, code, cleanedExpectedUsername || null, JSON.stringify(TELEGRAM_DEFAULT_PREFERENCES)],
 );
 row = await telegramLinkForUser(db, user.id);
 return row;
}

async function telegramSendMessage(chatId, text, options = {}) {
 if (!chatId) return { ok: false, skipped: true, reason: 'chat_id ausente' };
 const body = {
  chat_id: String(chatId),
  text: String(text || '').slice(0, 3900),
  parse_mode: 'HTML',
  disable_web_page_preview: true,
  ...options,
 };
 const result = await telegramApi('sendMessage', body);
 return { ok: true, result };
}


function telegramConciergeDirectText(value = '') {
 return String(value || '')
  .replace(/<[^>]*>/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 900);
}

async function telegramSendDirectText(chatId, text = '') {
 const clean = telegramConciergeDirectText(text) || 'Não consegui concluir agora. Envie esta mensagem ao suporte do CrewCheck.';
 return telegramSendMessage(chatId, telegramEscapeHtml(clean), { reply_markup: undefined });
}

function telegramConciergeSupportErrorText(error = {}, codePrefix = 'CONCIERGE_AUDIO') {
 const code = String(error?.code || error?.kind || error?.statusCode || error?.status || 'ERRO').toUpperCase().replace(/[^A-Z0-9_]+/g, '_').slice(0, 48);
 const provider = String(error?.provider || '').trim();
 const detail = sanitizePublicError(error?.message || error?.log || String(error || 'Erro desconhecido')).slice(0, 240);
 return [`Não consegui processar o áudio agora.`, `Código: ${codePrefix}_${code}${provider ? `_${provider.toUpperCase()}` : ''}.`, `Detalhe: ${detail}`, `Pode enviar este texto ao suporte.`].join(' ');
}

function telegramConciergeIsNoResultReply(title = '', lines = []) {
 const text = telegramConciergeNormalizeText([title, ...(Array.isArray(lines) ? lines : [lines])].join(' '));
 return /nao encontrei|sem escala|escala nao sincronizada|nao achei|nao localizei|tente reimportar|precisa ser reimportada|sincronizar escala/.test(text);
}

async function telegramApiMultipart(method, form) {
 if (!telegramIsConfigured()) {
  const err = new Error('TELEGRAM_BOT_TOKEN não configurado no Render.');
  err.statusCode = 503;
  err.code = 'TELEGRAM_NOT_CONFIGURED';
  throw err;
 }
 const controller = new AbortController();
 const timeout = setTimeout(() => controller.abort(), 45_000);
 try {
  const response = await fetch(`${TELEGRAM_API_BASE}/${method}`, { method: 'POST', body: form, signal: controller.signal });
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.ok === false) {
   const err = new Error(data?.description || `Telegram indisponível (${response.status}).`);
   err.statusCode = response.status;
   err.code = data?.error_code || 'TELEGRAM_API_ERROR';
   throw err;
  }
  return data?.result ?? data;
 } finally {
  clearTimeout(timeout);
 }
}

async function telegramSendVoice(chatId, audioBuffer, { caption = '', filename = 'crewcheck-concierge-voz.mp3', reply_markup = undefined } = {}) {
 if (!chatId) return { ok: false, skipped: true, reason: 'chat_id ausente' };
 if (!audioBuffer?.length) return { ok: false, skipped: true, reason: 'áudio vazio' };
 const form = new FormData();
 form.append('chat_id', String(chatId));
 form.append('voice', new Blob([audioBuffer], { type: 'audio/mpeg' }), filename);
 if (caption) form.append('caption', String(caption).slice(0, 900));
 form.append('parse_mode', 'HTML');
 if (reply_markup) form.append('reply_markup', JSON.stringify(reply_markup));
 const result = await telegramApiMultipart('sendVoice', form);
 return { ok: true, result };
}

async function telegramSendAudio(chatId, audioBuffer, { caption = '', filename = 'crewcheck-concierge.mp3', reply_markup = undefined } = {}) {
 if (!chatId) return { ok: false, skipped: true, reason: 'chat_id ausente' };
 if (!audioBuffer?.length) return { ok: false, skipped: true, reason: 'áudio vazio' };
 const form = new FormData();
 form.append('chat_id', String(chatId));
 form.append('audio', new Blob([audioBuffer], { type: 'audio/mpeg' }), filename);
 if (caption) form.append('caption', String(caption).slice(0, 900));
 form.append('parse_mode', 'HTML');
 if (reply_markup) form.append('reply_markup', JSON.stringify(reply_markup));
 const result = await telegramApiMultipart('sendAudio', form);
 return { ok: true, result };
}

function telegramFirstNameFromUser(user = null, row = null, chat = null) {
 const raw = String(user?.name || user?.full_name || row?.chat_first_name || chat?.first_name || '').replace(/\s+/g, ' ').trim();
 const first = raw.split(' ').find((part) => part && part.length > 1) || '';
 return first ? first.charAt(0).toUpperCase() + first.slice(1) : '';
}

function telegramConciergeDisplayName(row = null, user = null) {
 const prefs = normalizeTelegramPreferences(row?.preferences_json || {});
 const custom = String(prefs.conciergeName || TELEGRAM_DEFAULT_CONCIERGE_NAME).replace(/\s+/g, ' ').trim().slice(0, 32);
 if (telegramConciergeIsPremium(user) || isBillingAdmin(user)) return custom || TELEGRAM_DEFAULT_CONCIERGE_NAME;
 return TELEGRAM_DEFAULT_CONCIERGE_NAME;
}

function telegramPremiumSupportMention(user = null) {
 if (!TELEGRAM_PREMIUM_SUPPORT_USERNAME) return '';
 return (telegramConciergeIsPremium(user) || isBillingAdmin(user)) ? `@${TELEGRAM_PREMIUM_SUPPORT_USERNAME}` : '';
}

function telegramConciergeWelcomeLines(user = null, row = null) {
 const firstName = telegramFirstNameFromUser(user, row, null);
 const premium = telegramConciergeIsPremium(user) || isBillingAdmin(user);
 const conciergeName = telegramConciergeDisplayName(row, user);
 const support = telegramPremiumSupportMention(user);
 const hello = firstName ? `Olá, ${firstName}!` : 'Olá!';
 const identity = premium
  ? `${hello} Me chamo ${conciergeName === TELEGRAM_DEFAULT_CONCIERGE_NAME ? TELEGRAM_WELCOME_CONCIERGE_NAME : conciergeName} e sou seu concierge da escala.`
  : `${hello} Eu sou o Concierge CrewCheck e vou te ajudar com sua escala.`;
 const lines = [
  identity,
  'Pode mandar texto ou áudio. Eu entendo perguntas como: “o que tenho hoje?”, “minha programação de amanhã”, “dia primeiro de julho”, “próximas programações” e “que horas sair de casa?”.',
  premium
   ? 'Comandos Premium: /hoje, /amanha, /proximo, /portao, /saida, /diarias, /rotina, /comandos e /suporte.'
   : 'No gratuito: /hoje, /amanha, /proximo, /comandos e ajuda básica. Voz, portão, saída, diárias, rotina e suporte direto ficam no Premium.',
  'Você também pode enviar o PDF original da escala aqui pelo Telegram que eu tento importar e sincronizar com o app.',
 ];
 if (premium && support) {
  lines.push(`Se precisar de ajuda, mande “suporte” por aqui. Se for algo urgente, me chama no Telegram: ${support}.`);
 } else {
  lines.push('Se precisar de ajuda, mande “suporte” por aqui. Eu te mostro o melhor caminho pelo app.');
 }
 return lines;
}

function telegramConciergeSupportLines(user = null, row = null) {
 const premium = telegramConciergeIsPremium(user) || isBillingAdmin(user);
 const support = telegramPremiumSupportMention(user);
 if (premium) {
  return [
   'Suporte Premium liberado para sua conta.',
   support ? `Pode me chamar no Telegram: ${support}.` : 'Abra o CrewCheck e envie a mensagem pela área de Ajuda e suporte.',
   'Para agilizar, envie junto: e-mail da conta, print do erro, horário aproximado e o que você tentou fazer.',
   'Se for escala, mande também o PDF original ou diga se importou pelo app, Drive, iCloud ou Telegram.',
  ];
 }
 return [
  'O suporte direto pelo Telegram é um recurso Premium.',
  'No plano gratuito, use Ajuda e manuais dentro do CrewCheck e envie a mensagem pela área de suporte quando disponível.',
  'Para resolver mais rápido, tente primeiro reimportar a escala pelo app ou enviar o PDF original aqui no bot.',
  'Premium libera atendimento direto, voz completa, portão/radar, Saída Inteligente, diárias e rotina.',
 ];
}

function telegramConciergeCommandLines(user = null, row = null) {
 const premium = telegramConciergeIsPremium(user) || isBillingAdmin(user);
 return premium ? [
  'Comandos por texto ou voz:',
  '/hoje — programação de hoje.',
  '/amanha — programação de amanhã.',
  '/proximo — próxima programação real da escala.',
  '/portao — portão/status do próximo voo, quando disponível.',
  '/saida — Saída Inteligente e deslocamento.',
  '/diarias — prévia de diárias.',
  '/salario — resumo financeiro do mês salvo.',
  '/regulamentacao — jornada, repouso, sobreaviso, reserva e RBAC 117.',
  '/mes julho 2026 — resumo de uma escala antiga sem mexer no cockpit.',
  '/historico — lista meses/escalas salvos.',
  '/rotina — sugestão de rotina baseada na escala.',
  '/suporte — atendimento Premium.',
  'Também pode falar natural: “qual meu descanso mínimo?”, “limite de sobreaviso”, “tenho irregularidade?”, “o que tenho dia primeiro de julho?”.',
 ] : [
  'Comandos do plano gratuito:',
  '/hoje — programação de hoje.',
  '/amanha — programação de amanhã.',
  '/proximo — próxima programação básica.',
  '/regulamentacao — resumo básico de jornada e repouso.',
  '/historico — últimos meses salvos, em modo limitado.',
  '/comandos — ver esta lista.',
  'Premium libera voz completa, alertas regulatórios da escala, portão/radar, Saída Inteligente, diárias, salário, rotina, consulta por mês antigo e suporte direto.',
 ];
}


function telegramConciergeHumanizeLines(lines = [], { userName = '', inputMode = 'text' } = {}) {
 const cleanLines = (Array.isArray(lines) ? lines : [lines])
  .map((line) => telegramConciergeTranslateRosterAbbreviations(String(line || '').trim()))
  .filter(Boolean);
 const greeting = userName
  ? (inputMode === 'audio' ? `${userName}, deixei o resumo escrito também.` : `${userName}, já olhei aqui para você.`)
  : (inputMode === 'audio' ? 'Deixei o resumo escrito também.' : 'Já olhei aqui para você.');
 if (cleanLines[0] && telegramConciergeIsGenericGreetingLine(cleanLines[0], userName)) return cleanLines.slice(0, 12);
 return [greeting, ...cleanLines].slice(0, 12);
}

async function telegramSendConciergeReply(chatId, { row = null, user = null, title = 'Concierge CrewCheck', lines = [], footer = null, actionLabel = 'Abrir CrewCheck', preferAudio = false, inputMode = 'text', audioContext = null } = {}) {
 const preferences = normalizeTelegramPreferences(row?.preferences_json || {});
 const premium = telegramConciergeIsPremium(user);
 const userName = telegramFirstNameFromUser(user, row, null);
 const conciergeName = telegramConciergeDisplayName(row, user);
 const humanLines = telegramConciergeHumanizeLines(lines, { userName, inputMode });
 const isAudioRequest = inputMode === 'audio' || preferAudio;
 if (isAudioRequest && telegramConciergeIsNoResultReply(title, humanLines)) {
  return await telegramSendDirectText(chatId, 'Não encontrei nada. Tente reimportar sua escala.');
 }
 const messageText = telegramPremiumMessage('concierge', title, humanLines, { footer: footer || TELEGRAM_PREMIUM_CATEGORIES.concierge.footer, conciergeName });
 const reply_markup = telegramPremiumReplyMarkup(actionLabel);
 const maySendAudio = Boolean(preferAudio && TELEGRAM_CONCIERGE_VOICE_ENABLED && preferences.conciergeAudioReplies !== false && (!TELEGRAM_CONCIERGE_VOICE_PREMIUM_ONLY || premium));
 if (maySendAudio && telegramSpeechHasProvider('tts')) {
  try {
   await telegramApi('sendChatAction', { chat_id: String(chatId), action: TELEGRAM_CONCIERGE_AUDIO_SEND_MODE === 'audio' ? 'upload_voice' : 'record_voice' }).catch(() => null);
   const spokenText = telegramConciergeSpokenTextFromReply({ title, lines, userName, inputMode, conciergeName, user, row, audioContext });
   const audio = await textToSpeechBuffer(spokenText, { userName, conciergeName });
   if (TELEGRAM_CONCIERGE_AUDIO_SEND_MODE !== 'audio') {
    try {
     return await telegramSendVoice(chatId, audio, { caption: '', filename: 'crewcheck-concierge-voz.mp3', reply_markup: undefined });
    } catch (voiceError) {
     console.warn('[telegram] sendVoice falhou; enviando como áudio', voiceError?.message || voiceError);
    }
   }
   return await telegramSendAudio(chatId, audio, { caption: '', filename: 'crewcheck-concierge-leve.mp3', reply_markup: undefined });
  } catch (error) {
   console.warn('[telegram] falha ao gerar/enviar áudio; usando erro direto em texto', error?.message || error);
   return await telegramSendDirectText(chatId, telegramConciergeSupportErrorText(error, 'CONCIERGE_TTS'));
  }
 }
 return await telegramSendMessage(chatId, messageText, { reply_markup });
}

function telegramEscapeHtml(value) {
 return String(value ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch] || ch));
}

const TELEGRAM_PREMIUM_CATEGORIES = {
 smartDeparture: { icon: '🧭', label: 'Saída Inteligente', footer: 'Use como apoio. Confirme sempre a escala, portão e canais oficiais antes de sair.' },
 roster: { icon: '📅', label: 'Escala', footer: 'Escala importada no CrewCheck. Confira a publicação oficial antes de qualquer decisão operacional.' },
 radar: { icon: '🛫', label: 'Radar de voo', footer: 'Status sujeito a atualização do aeroporto e da companhia.' },
 irregularities: { icon: '⚠️', label: 'Irregularidades', footer: 'Análise auxiliar. Valide a regra aplicável antes de acionar qualquer canal.' },
 dailySummary: { icon: '📊', label: 'Resumo diário', footer: 'Resumo automático gerado pelo CrewCheck.' },
 weeklySummary: { icon: '💼', label: 'Resumo semanal', footer: 'Prévia automática; valores podem variar conforme conferência oficial.' },
 concierge: { icon: '🤖', label: 'Concierge CrewCheck', footer: 'Resposta auxiliar por texto. Confirme escala, portão, tráfego e canais oficiais antes de agir.' },
 default: { icon: '✈️', label: 'CrewCheck', footer: 'Mensagem automática do CrewCheck Premium.' },
};

function telegramLineIcon(line = '') {
 const lower = String(line || '').toLowerCase();
 if (/saia|saída|chegue|apresent/.test(lower)) return '⏱️';
 if (/destino|aeroporto|base|origem|local/.test(lower)) return '📍';
 if (/\bla\s?\d{3,4}\b|voo|trecho|decolagem|chegada/.test(lower)) return '🛫';
 if (/modal|carro|uber|99|moto|transporte/.test(lower)) return '🚘';
 if (/alerta|crítico|irregular|atenção|falha/.test(lower)) return '⚠️';
 if (/escala|programação|importada|atualizada|mês|base/.test(lower)) return '📅';
 if (/ganho|diária|valor|salário|resumo/.test(lower)) return '💎';
 return '•';
}

function telegramPremiumMessage(category, title, lines = [], options = {}) {
 const cfg = TELEGRAM_PREMIUM_CATEGORIES[category] || TELEGRAM_PREMIUM_CATEGORIES.default;
 const dynamicLabel = category === 'concierge' && options.conciergeName ? String(options.conciergeName).replace(/\s+/g, ' ').trim().slice(0, 32) : cfg.label;
 const cleanTitle = telegramEscapeHtml(title || dynamicLabel || cfg.label || 'CrewCheck');
 const bodyLines = (Array.isArray(lines) ? lines : [lines]).map((line) => String(line || '').trim()).filter(Boolean).slice(0, 12);
 const body = bodyLines.length
  ? bodyLines.map((line) => `${telegramLineIcon(line)} ${telegramEscapeHtml(line)}`).join('\n')
  : '✅ Tudo certo por aqui. O CrewCheck está acompanhando seus alertas importantes.';
 const footer = telegramEscapeHtml(options.footer || cfg.footer || TELEGRAM_PREMIUM_CATEGORIES.default.footer);
 return [
  `${cfg.icon} <b>${cleanTitle}</b>`,
  `<i>CrewCheck Premium · ${telegramEscapeHtml(dynamicLabel || cfg.label)}</i>`,
  '',
  body,
  '',
  `— ${footer}`,
 ].join('\n');
}

function telegramPremiumReplyMarkup(actionLabel = 'Abrir CrewCheck') {
 if (!PUBLIC_APP_URL || !/^https?:\/\//i.test(PUBLIC_APP_URL)) return undefined;
 return { inline_keyboard: [[{ text: actionLabel, url: PUBLIC_APP_URL }]] };
}

async function notifyTelegramForUser(db, userId, category, title, lines = []) {
 if (!telegramIsConfigured() || !db || !userId) return { ok: false, skipped: true };
 const row = await telegramLinkForUser(db, userId).catch(() => null);
 if (!row?.is_active || !row?.chat_id) return { ok: false, skipped: true, reason: 'telegram não conectado' };
 const preferences = normalizeTelegramPreferences(row.preferences_json || {});
 if (category && preferences[category] === false) return { ok: false, skipped: true, reason: 'categoria silenciada' };
 if (telegramShouldSkipDuplicate(row, category || 'default', title || 'CrewCheck', lines)) return { ok: false, skipped: true, reason: 'notificação duplicada suprimida' };
 const text = telegramPremiumMessage(category || 'default', title || 'CrewCheck', lines);
 const sent = await telegramSendMessage(row.chat_id, text, { reply_markup: telegramPremiumReplyMarkup() });
 if (sent.ok) await db.query('update crewcheck_telegram_links set last_message_at = now(), updated_at = now() where id = $1', [row.id]).catch(() => null);
 return sent;
}



const TELEGRAM_CONCIERGE_FREE_DAILY_LIMIT = Math.max(1, Number(process.env.TELEGRAM_CONCIERGE_FREE_DAILY_LIMIT || 5));

function telegramConciergeDayKey(now = new Date()) {
 return now.toISOString().slice(0, 10);
}

function telegramConciergeNormalizeText(text = '') {
 return String(text || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .trim();
}

function telegramConciergeIsHelp(text = '') {
 const clean = telegramConciergeNormalizeText(text);
 return !clean || /^\/(start|help|ajuda|menu|comandos)(@\w+)?\b/.test(clean) || /\b(ajuda|comandos|o que posso perguntar|como usar)\b/.test(clean);
}


function telegramConciergeIsSupportRequest(text = '') {
 const clean = telegramConciergeNormalizeText(text);
 return /^\/(suporte|support|atendimento)(@\w+)?\b/.test(clean) || /\b(suporte|atendimento|falar com suporte|chamar suporte|bruno saraiva|bmedeiros1987)\b/.test(clean);
}

function telegramConciergeIsCommandListRequest(text = '') {
 const clean = telegramConciergeNormalizeText(text);
 return /^\/(comandos|menu)(@\w+)?\b/.test(clean) || /\b(lista de comandos|quais comandos|comandos de voz|comandos de texto)\b/.test(clean);
}

function telegramConciergeFreeUsage(row, increment = false) {
 const chat = String(row?.chat_id || row?.chatId || 'chat');
 const key = `${row?.user_id || row?.userId || 'user'}::${chat}::${telegramConciergeDayKey()}`;
 const current = Number(telegramConciergeUsage.get(key) || 0);
 if (increment) telegramConciergeUsage.set(key, current + 1);
 for (const itemKey of telegramConciergeUsage.keys()) {
  const parts = String(itemKey).split('::');
  const day = parts[2] || '';
  if (day && day !== telegramConciergeDayKey()) telegramConciergeUsage.delete(itemKey);
 }
 return { used: increment ? current + 1 : current, limit: TELEGRAM_CONCIERGE_FREE_DAILY_LIMIT };
}

function telegramConciergeIsPremium(user) {
 if (!user) return false;
 if (isBillingAdmin(user) || hasLifetimePremiumAccess(user)) return true;
 return Boolean(billingStatusFromUser(user)?.premiumAccess);
}

function telegramConciergeSafeJson(value, fallback = null) {
 if (!value) return fallback;
 if (typeof value === 'object') return value;
 try { return JSON.parse(String(value)); } catch { return fallback; }
}

async function telegramConciergeLatestRosters(db, userOrId, limit = 8, linkRow = null) {
 if (!db || !userOrId) return [];
 const user = typeof userOrId === 'object' ? userOrId : { id: userOrId };
 const userId = user.id || user.user_id || linkRow?.user_id || null;
 let freshestLinkRow = linkRow;
 if (userId) {
  const reloaded = await telegramLinkForUser(db, userId).catch(() => null);
  if (reloaded?.id) freshestLinkRow = reloaded;
 }
 const linkSnapshot = telegramConciergeRosterSnapshotFromLink(freshestLinkRow);
 const normalizeRows = (rows = []) => (rows || []).map((row) => ({
  ...row,
  roster: telegramConciergeSafeJson(row.roster_json, row.roster_json || null),
  compliance: telegramConciergeSafeJson(row.compliance_json, row.compliance_json || null),
  gym: telegramConciergeSafeJson(row.gym_json, row.gym_json || []),
 })).filter((row) => row.roster && Array.isArray(row.roster.days));
 const run = (sql, params = []) => db.query(sql, params).catch(() => ({ rows: [] }));
 const rosterSortTime = (item = {}) => {
  const updated = Date.parse(item?.updated_at || item?.updatedAt || item?.created_at || item?.createdAt || '');
  if (Number.isFinite(updated)) return updated;
  const y = Number(item?.period_year || item?.roster?.year || 0);
  const m = Number(item?.period_month || item?.roster?.month || 0);
  return y && m ? Date.UTC(y, m - 1, 1) : 0;
 };
 const unique = (items = []) => {
  const seen = new Set();
  const out = [];
  const ordered = [...(items || [])].sort((a, b) => rosterSortTime(b) - rosterSortTime(a));
  for (const item of ordered) {
   const key = String(item?.id || item?.checksum || JSON.stringify([item?.period_year, item?.period_month, item?.updated_at]).slice(0, 120));
   if (!key || seen.has(key)) continue;
   seen.add(key);
   out.push(item);
  }
  return out.slice(0, limit);
 };
 const queries = [];
 if (userId) {
  queries.push(run(
   `select id, created_at, updated_at, period_year, period_month, roster_json, compliance_json, gym_json, crew_id, crew_name, checksum
      from crewcheck_rosters
     where user_id = $1
     order by updated_at desc, created_at desc
     limit $2`,
   [userId, limit],
  ));
  queries.push(run(
   `select r.id, r.created_at, r.updated_at, r.period_year, r.period_month, r.roster_json, r.compliance_json, r.gym_json, r.crew_id, r.crew_name, r.checksum
      from crewcheck_rosters r
      join crewcheck_audit_logs a on a.entity_id = r.id
     where a.user_id = $1
     order by r.updated_at desc, r.created_at desc
     limit $2`,
   [userId, limit],
  ));
 }
 const crewId = String(user.crew_id || user.crewId || '').trim();
 if (crewId) {
  queries.push(run(
   `select id, created_at, updated_at, period_year, period_month, roster_json, compliance_json, gym_json, crew_id, crew_name, checksum
      from crewcheck_rosters
     where lower(replace(coalesce(crew_id,''),' ','')) = lower(replace($1,' ',''))
     order by updated_at desc, created_at desc
     limit $2`,
   [crewId, limit],
  ));
 }
 const userName = String(user.name || user.full_name || '').replace(/\s+/g, ' ').trim();
 const nameTokens = userName.split(/\s+/).filter((token) => token.length >= 3).slice(0, 3);
 if (nameTokens.length) {
  const like = `%${nameTokens.join('%')}%`;
  queries.push(run(
   `select id, created_at, updated_at, period_year, period_month, roster_json, compliance_json, gym_json, crew_id, crew_name, checksum
      from crewcheck_rosters
     where lower(coalesce(crew_name,'')) like lower($1)
     order by updated_at desc, created_at desc
     limit $2`,
   [like, Math.min(limit, 5)],
  ));
 }
 const results = await Promise.all(queries);
 let rosters = unique([...(linkSnapshot ? [linkSnapshot] : []), ...results.flatMap((result) => normalizeRows(result.rows))]);
 if (rosters.length) return rosters;
 if (telegramConciergeIsPremium(user) || isBillingAdmin(user)) {
  const latestOwnCompatible = await run(
   `select id, created_at, updated_at, period_year, period_month, roster_json, compliance_json, gym_json, crew_id, crew_name, checksum
      from crewcheck_rosters
     where user_id is null
     order by updated_at desc, created_at desc
     limit $1`,
   [Math.min(limit, 3)],
  );
  rosters = normalizeRows(latestOwnCompatible.rows);
  if (rosters.length) return unique(rosters);
 }
 return [];
}

function telegramConciergePad2(value) {
 return String(value || '').padStart(2, '0');
}

function telegramConciergeIsoDateFromParts(year, month, day) {
 const y = Number(year);
 const m = Number(month);
 const d = Number(day);
 if (!y || !m || !d) return '';
 return `${String(y).padStart(4, '0')}-${telegramConciergePad2(m)}-${telegramConciergePad2(d)}`;
}

function telegramConciergeDateFromDay(day = {}, roster = {}) {
 const candidates = [day.isoDate, day.dateIso, day.date, day.localDate, day.calendarDate, day.dateLabel, day.rawDate].filter(Boolean);
 for (const raw of candidates) {
  const value = String(raw || '').trim();
  const iso = value.match(/(20\d{2})-(\d{1,2})-(\d{1,2})/);
  if (iso) return telegramConciergeIsoDateFromParts(iso[1], iso[2], iso[3]);
  const br = value.match(/(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](20\d{2}))?/);
  if (br) return telegramConciergeIsoDateFromParts(br[3] || roster.year || day.year, br[2] || roster.month || day.month, br[1]);
 }
 const dayNumber = day.dayNumber || day.day || day.dayOfMonth || day.dia;
 return telegramConciergeIsoDateFromParts(day.year || roster.year, day.month || roster.month, dayNumber);
}

function telegramConciergeSaoPauloDateParts(date = new Date()) {
 try {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { year: Number(map.year), month: Number(map.month), day: Number(map.day) };
 } catch {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
 }
}

function telegramConciergeDatePlus(days = 0) {
 const baseParts = telegramConciergeSaoPauloDateParts(new Date());
 const base = new Date(Date.UTC(baseParts.year, baseParts.month - 1, baseParts.day + Number(days || 0), 12, 0, 0));
 const shifted = telegramConciergeSaoPauloDateParts(base);
 return telegramConciergeIsoDateFromParts(shifted.year, shifted.month, shifted.day);
}


function telegramConciergeMonthNumberFromWord(value = '') {
 const token = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '');
 const map = {
  jan: 1, janeiro: 1,
  fev: 2, fevereiro: 2,
  mar: 3, marco: 3, março: 3,
  abr: 4, abril: 4,
  mai: 5, maio: 5,
  jun: 6, junho: 6,
  jul: 7, julho: 7,
  ago: 8, agosto: 8,
  set: 9, setembro: 9,
  out: 10, outubro: 10,
  nov: 11, novembro: 11,
  dez: 12, dezembro: 12,
 };
 return map[token] || 0;
}


function telegramConciergeMonthLabel(month = 0, year = '') {
 const names = ['','janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
 const m = Number(month || 0);
 const label = names[m] || `mês ${m || '—'}`;
 return year ? `${label} de ${year}` : label;
}

function telegramConciergeMonthFromText(text = '', rosters = []) {
 const raw = String(text || '');
 const normalized = telegramConciergeNormalizeText(raw);
 const numeric = normalized.match(/\b(0?[1-9]|1[0-2])[\/\-.](20\d{2})\b/);
 if (numeric) return { month: Number(numeric[1]), year: Number(numeric[2]), label: telegramConciergeMonthLabel(Number(numeric[1]), Number(numeric[2])) };
 const monthWords = normalized.split(/\s+/).filter(Boolean);
 for (let i = 0; i < monthWords.length; i += 1) {
  const month = telegramConciergeMonthNumberFromWord(monthWords[i]);
  if (!month) continue;
  const local = monthWords.slice(Math.max(0, i - 4), Math.min(monthWords.length, i + 5));
  const explicitYear = Number((local.find((token) => /^20\d{2}$/.test(token)) || '').trim());
  const rosterYear = explicitYear || Number((rosters || []).find((item) => Number(item?.period_month || item?.roster?.month) === month)?.period_year || (rosters || []).find((item) => Number(item?.roster?.month) === month)?.roster?.year || 0);
  const today = telegramConciergeSaoPauloDateParts(new Date());
  return { month, year: rosterYear || today.year, label: telegramConciergeMonthLabel(month, rosterYear || today.year) };
 }
 if (/\b(mes|mês)\s+atual\b/.test(normalized)) {
  const today = telegramConciergeSaoPauloDateParts(new Date());
  return { month: today.month, year: today.year, label: telegramConciergeMonthLabel(today.month, today.year) };
 }
 if (/\b(mes|mês)\s+passado\b/.test(normalized)) {
  const today = telegramConciergeSaoPauloDateParts(new Date());
  const date = new Date(Date.UTC(today.year, today.month - 2, 1, 12, 0, 0));
  return { month: date.getUTCMonth() + 1, year: date.getUTCFullYear(), label: telegramConciergeMonthLabel(date.getUTCMonth() + 1, date.getUTCFullYear()) };
 }
 return null;
}

function telegramConciergeFindRosterByMonth(rosters = [], target = null) {
 if (!target?.month || !target?.year) return null;
 const matches = (rosters || []).filter((item) => Number(item?.period_month || item?.roster?.month) === Number(target.month) && Number(item?.period_year || item?.roster?.year) === Number(target.year));
 if (matches.length) return matches[0];
 return (rosters || []).find((item) => Number(item?.period_month || item?.roster?.month) === Number(target.month)) || null;
}

function telegramConciergeRosterStats(roster = {}) {
 const days = Array.isArray(roster.days) ? roster.days : [];
 let legs = 0;
 let flightDays = 0;
 let standby = 0;
 let reserve = 0;
 let off = 0;
 let training = 0;
 let layover = 0;
 for (const day of days) {
  const kind = telegramConciergeDayKind(day);
  const dayLegs = telegramConciergeDayLegs(day);
  legs += dayLegs.length;
  if (dayLegs.length || kind.isFlight || kind.isExtra) flightDays += 1;
  if (kind.isStandby || kind.isStandbyExtra) standby += 1;
  if (kind.isReserve) reserve += 1;
  if (kind.isOff || kind.isVacation) off += 1;
  if (kind.isTraining || kind.isOnlineTraining || kind.isMeeting) training += 1;
  if (/pernoite|hotel|layover|inativo/i.test(`${day.hotel || ''} ${day.rawText || ''} ${day.type || ''}`)) layover += 1;
 }
 return { days: days.length, legs, flightDays, standby, reserve, off, training, layover };
}

function telegramConciergeRosterOverviewLines(item = null, target = null) {
 const roster = item?.roster || {};
 const stats = telegramConciergeRosterStats(roster);
 const period = telegramConciergeMonthLabel(roster.month || item?.period_month || target?.month, roster.year || item?.period_year || target?.year);
 const flightHours = roster?.totals?.flightHours ? `${Number(roster.totals.flightHours).toFixed(1).replace('.', ',')}h de voo` : '';
 const dutyHours = roster?.totals?.dutyHours ? `${Number(roster.totals.dutyHours).toFixed(1).replace('.', ',')}h de jornada` : '';
 return [
  `${period} · ${roster.base || item?.base || 'base não informada'}`,
  `${stats.days} dia(s) lido(s), ${stats.flightDays} dia(s) com voo e ${stats.legs} perna(s).`,
  [flightHours, dutyHours].filter(Boolean).join(' · '),
  stats.standby ? `Sobreaviso: ${stats.standby} dia(s).` : '',
  stats.reserve ? `Reserva/extra: ${stats.reserve} dia(s).` : '',
  stats.layover ? `Pernoite/inativo fora de base: ${stats.layover} ocorrência(s).` : '',
  stats.training ? `Treinamento/reunião: ${stats.training} dia(s).` : '',
  stats.off ? `Folgas/férias: ${stats.off} dia(s).` : '',
  'No app, abra Histórico > Visualizar para conferir escala, diárias e salário sem alterar o cockpit.',
 ].filter(Boolean);
}

function telegramConciergeRosterHistoryLines(rosters = [], { premium = false } = {}) {
 const limited = (rosters || []).slice(0, premium ? 8 : 3);
 if (!limited.length) return ['Não encontrei escalas salvas no servidor. Envie o PDF da escala aqui ou sincronize pelo app.'];
 const lines = ['Escalas salvas disponíveis:'];
 for (const item of limited) {
  const roster = item.roster || {};
  const stats = telegramConciergeRosterStats(roster);
  lines.push(`${telegramConciergeMonthLabel(item.period_month || roster.month, item.period_year || roster.year)} · ${roster.base || 'base'} · ${stats.legs} perna(s) · ${stats.days} dia(s).`);
 }
 if (!premium && (rosters || []).length > limited.length) lines.push('Premium mostra mais meses e libera consultas completas por mês antigo.');
 else lines.push('Para abrir sem mudar o cockpit: Histórico > Visualizar no app.');
 return lines;
}

function telegramConciergeSalaryBriefLines(item = null, target = null) {
 if (!item?.roster) return ['Não encontrei esse mês salvo para estimar salário.', 'Abra Histórico no app ou reimporte a escala.'];
 const stats = telegramConciergeRosterStats(item.roster);
 const period = telegramConciergeMonthLabel(item.roster.month || item.period_month || target?.month, item.roster.year || item.period_year || target?.year);
 return [
  `Resumo financeiro de ${period}:`,
  `${stats.legs} perna(s), ${stats.flightDays} dia(s) com voo, ${stats.reserve} reserva/extra e ${stats.standby} sobreaviso.`,
  'A previsão exata de salário depende das regras, adicionais e calibragem do app.',
  'No app, use Histórico > Visualizar > Salário para recalcular esse mês antigo sem alterar o cockpit.',
 ];
}

function telegramConciergeDayNumberFromPortuguese(value = '') {
 const clean = String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/\b(primeira)\b/g, 'primeiro')
  .replace(/\b(segunda)\b/g, 'segundo')
  .replace(/\b(duas)\b/g, 'dois')
  .replace(/\b(uma)\b/g, 'um')
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();
 if (!clean) return 0;
 const numeric = clean.match(/\b(0?[1-9]|[12]\d|3[01])\b/);
 if (numeric) return Number(numeric[1]);
 const words = clean.split(' ').filter((word) => word && !['dia','de','do','da','dos','das','no','na','nos','nas','para','pra','programacao','programacoes','escala','agenda','minha','meu','a','o','e'].includes(word));
 const phrase = words.join(' ');
 const direct = {
  primeiro: 1, um: 1,
  segundo: 2, dois: 2,
  terceiro: 3, tres: 3,
  quarto: 4, quatro: 4,
  quinto: 5, cinco: 5,
  sexto: 6, seis: 6,
  setimo: 7, sete: 7,
  oitavo: 8, oito: 8,
  nono: 9, nove: 9,
  decimo: 10, dez: 10,
  onze: 11,
  doze: 12,
  treze: 13,
  quatorze: 14, catorze: 14,
  quinze: 15,
  dezesseis: 16, dezasseis: 16,
  dezessete: 17, dezassete: 17,
  dezoito: 18,
  dezenove: 19, dezanove: 19,
  vinte: 20,
  trinta: 30,
 };
 if (direct[phrase] && direct[phrase] <= 31) return direct[phrase];
 const tokens = phrase.split(' ').filter(Boolean);
 let total = 0;
 for (const token of tokens) {
  if (token === 'e') continue;
  const valueNum = direct[token] || 0;
  if (!valueNum) continue;
  total += valueNum;
 }
 if (total >= 1 && total <= 31) return total;
 return 0;
}

function telegramConciergeRosterMatchesMonthDay(rosters = [], month = 0, day = 0) {
 const matches = [];
 for (const item of rosters || []) {
  const roster = item?.roster || {};
  for (const rosterDay of roster.days || []) {
   const iso = telegramConciergeDateFromDay(rosterDay, roster);
   if (!iso) continue;
   if (Number(iso.slice(5, 7)) === Number(month) && Number(iso.slice(8, 10)) === Number(day)) matches.push(iso);
  }
 }
 return [...new Set(matches)].sort();
}

function telegramConciergeInferYearForMonthDay(month = 0, day = 0, rosters = [], explicitYear = '') {
 const year = Number(explicitYear || 0);
 if (year) return year;
 const rosterMatches = telegramConciergeRosterMatchesMonthDay(rosters, month, day);
 const today = telegramConciergeDatePlus(0);
 const futureRoster = rosterMatches.find((iso) => iso >= today);
 if (futureRoster) return Number(futureRoster.slice(0, 4));
 if (rosterMatches[0]) return Number(rosterMatches[0].slice(0, 4));
 const todayParts = telegramConciergeSaoPauloDateParts(new Date());
 const candidate = telegramConciergeIsoDateFromParts(todayParts.year, month, day);
 return candidate && candidate < today ? todayParts.year + 1 : todayParts.year;
}

function telegramConciergeDateFromSpokenMonth(text = '', rosters = []) {
 const raw = String(text || '');
 const normalized = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
 const tokens = normalized.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
 if (!tokens.length) return null;
 const noise = new Set(['de','do','da','dos','das','no','na','nos','nas','para','pra','pro','a','o','e','em','minha','meu','qual','programacao','programacoes','escala','agenda']);
 const monthIndexes = [];
 tokens.forEach((token, index) => {
  if (telegramConciergeMonthNumberFromWord(token)) monthIndexes.push(index);
 });
 for (const monthIndex of monthIndexes) {
  const month = telegramConciergeMonthNumberFromWord(tokens[monthIndex]);
  const before = tokens.slice(Math.max(0, monthIndex - 8), monthIndex);
  const after = tokens.slice(monthIndex + 1, Math.min(tokens.length, monthIndex + 7));
  const afterYear = after.find((token) => /^20\d{2}$/.test(token)) || '';
  const beforeYear = before.find((token) => /^20\d{2}$/.test(token)) || '';
  const explicitYear = afterYear || beforeYear || '';
  const beforeClean = before.filter((token) => !/^20\d{2}$/.test(token));
  for (let size = Math.min(5, beforeClean.length); size >= 1; size -= 1) {
   const chunk = beforeClean.slice(beforeClean.length - size).filter((token) => !noise.has(token));
   const day = telegramConciergeDayNumberFromPortuguese(chunk.join(' '));
   if (day) {
    const year = telegramConciergeInferYearForMonthDay(month, day, rosters, explicitYear);
    return { iso: telegramConciergeIsoDateFromParts(year, month, day), label: `dia ${day} de ${tokens[monthIndex]}` };
   }
  }
  for (let size = 1; size <= Math.min(5, after.length); size += 1) {
   const chunk = after.slice(0, size).filter((token) => !noise.has(token) && !/^20\d{2}$/.test(token));
   const day = telegramConciergeDayNumberFromPortuguese(chunk.join(' '));
   if (day) {
    const year = telegramConciergeInferYearForMonthDay(month, day, rosters, explicitYear);
    return { iso: telegramConciergeIsoDateFromParts(year, month, day), label: `dia ${day} de ${tokens[monthIndex]}` };
   }
  }
 }
 return null;
}

function telegramConciergeDateFromText(text = '', rosters = []) {
 const rawText = String(text || '');
 const clean = telegramConciergeNormalizeText(rawText);
 const nowParts = telegramConciergeSaoPauloDateParts(new Date());
 if (/\b(hoje|agora|atual)\b/.test(clean)) return { iso: telegramConciergeDatePlus(0), label: 'hoje' };
 if (/\b(depois de amanha|depois de amanhã)\b/.test(rawText.toLowerCase()) || /\bdepois de amanha\b/.test(clean)) return { iso: telegramConciergeDatePlus(2), label: 'depois de amanhã' };
 if (/\b(amanha|amanhã)\b/.test(rawText.toLowerCase()) || /\bamanha\b/.test(clean)) return { iso: telegramConciergeDatePlus(1), label: 'amanhã' };
 const spokenMonth = telegramConciergeDateFromSpokenMonth(rawText, rosters);
 if (spokenMonth?.iso) return spokenMonth;
 const br = clean.match(/\b(?:dia\s*)?(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](20\d{2}))?\b/);
 if (br) {
  const month = Number(br[2]);
  const day = Number(br[1]);
  const year = telegramConciergeInferYearForMonthDay(month, day, rosters, br[3] || '');
  return { iso: telegramConciergeIsoDateFromParts(year, month, day), label: `${telegramConciergePad2(day)}/${telegramConciergePad2(month)}` };
 }
 const dayOnly = clean.match(/\bdia\s+(\d{1,2})\b/) || clean.match(/\b(\d{1,2})\b/);
 if (dayOnly) {
  const day = Number(dayOnly[1]);
  const matches = [];
  for (const item of rosters) {
   for (const d of item.roster.days || []) {
    const iso = telegramConciergeDateFromDay(d, item.roster);
    if (iso && Number(iso.slice(8, 10)) === day) matches.push(iso);
   }
  }
  const today = telegramConciergeDatePlus(0);
  const future = matches.find((iso) => iso >= today);
  if (future || matches[0]) return { iso: future || matches[0], label: `dia ${day}` };
  return { iso: telegramConciergeIsoDateFromParts(nowParts.year, nowParts.month, day), label: `dia ${day}` };
 }
 const spokenDayOnly = clean.match(/\bdia\s+([a-z\s]+?)\b(?:da|do|de|para|pra|$)/i);
 if (spokenDayOnly) {
  const day = telegramConciergeDayNumberFromPortuguese(spokenDayOnly[1]);
  if (day) {
   const matches = [];
   for (const item of rosters) {
    for (const d of item.roster.days || []) {
     const iso = telegramConciergeDateFromDay(d, item.roster);
     if (iso && Number(iso.slice(8, 10)) === day) matches.push(iso);
    }
   }
   const today = telegramConciergeDatePlus(0);
   const future = matches.find((iso) => iso >= today);
   if (future || matches[0]) return { iso: future || matches[0], label: `dia ${day}` };
   return { iso: telegramConciergeIsoDateFromParts(nowParts.year, nowParts.month, day), label: `dia ${day}` };
  }
 }
 return { iso: telegramConciergeDatePlus(0), label: 'hoje' };
}

function telegramConciergeFindDay(rosters = [], iso = '') {
 for (const item of rosters) {
  const roster = item.roster || {};
  for (const day of roster.days || []) {
   if (telegramConciergeDateFromDay(day, roster) === iso) return { row: item, roster, day, iso };
  }
 }
 return null;
}

function telegramConciergeReadableDate(iso = '') {
 const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
 if (!m) return iso || 'data não informada';
 return `${m[3]}/${m[2]}/${m[1]}`;
}

function telegramConciergeFormatTime(value) {
 const raw = String(value || '').trim();
 const m = raw.match(/(\d{1,2})[:hH](\d{2})/);
 if (m) return `${telegramConciergePad2(m[1])}:${m[2]}`;
 return raw;
}


function telegramConciergeCleanWord(value = '') {
 return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function telegramConciergePlural(value = 0, one = '', many = '') {
 return Number(value) === 1 ? one : (many || `${one}s`);
}

function telegramConciergeSpeakClock(value = '') {
 const time = telegramConciergeFormatTime(value);
 const m = String(time || '').match(/^(\d{1,2}):(\d{2})$/);
 if (!m) return time || 'horário não informado';
 const hour = Number(m[1]);
 const min = Number(m[2]);
 if (min === 0) return `${hour} hora${hour === 1 ? '' : 's'}`;
 return `${hour} e ${String(min).padStart(2, '0')}`;
}

function telegramConciergeAirportName(value = '') {
 const raw = String(value || '').trim();
 if (!raw) return '';
 const upper = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
 const map = {
  BSB: 'Brasília', GRU: 'Guarulhos', CGH: 'Congonhas', SDU: 'Santos Dumont', GIG: 'Galeão', VCP: 'Viracopos', CNF: 'Confins',
  POA: 'Porto Alegre', REC: 'Recife', SSA: 'Salvador', FOR: 'Fortaleza', NAT: 'Natal', CWB: 'Curitiba', FLN: 'Florianópolis',
  BEL: 'Belém', MAO: 'Manaus', MIA: 'Miami', JFK: 'Nova York', LAX: 'Los Angeles', MCO: 'Orlando', LIS: 'Lisboa', SCL: 'Santiago', EZE: 'Buenos Aires'
 };
 return map[upper] || raw;
}

function telegramConciergeDayRawText(day = {}) {
 return [day.type, day.title, day.activityType, day.pairingCode, day.code, day.rawText, day.description, day.label, day.name]
  .map((part) => String(part || '').trim()).filter(Boolean).join(' ');
}

function telegramConciergeDayLegs(day = {}) {
 return Array.isArray(day?.legs) ? day.legs.filter(Boolean) : [];
}

function telegramConciergeDayKind(day = {}) {
 const translated = telegramConciergeTranslateRosterAbbreviations(telegramConciergeDayRawText(day));
 const clean = telegramConciergeCleanWord(`${translated} ${telegramConciergeDayRawText(day)}`);
 const legs = telegramConciergeDayLegs(day);
 if (/sobreaviso extra|hsb extra|extra hsb|hsb x|hsb ext/.test(clean)) return { key: 'standby_extra', label: 'sobreaviso extra' };
 if (/sobreaviso|hsb|sby|sob/.test(clean)) return { key: 'standby', label: 'sobreaviso' };
 if (/reserva|\bres\b|\brsa\b|airport standby/.test(clean)) return { key: 'reserve', label: 'reserva' };
 if (/vivo de extra|\bextra\b|\bvex\b|\bps\b/.test(clean)) return { key: 'extra', label: 'extra' };
 if (/folga pos ferias|\bdop\b/.test(clean)) return { key: 'off_after_vacation', label: 'folga pós-férias' };
 if (/\bfolga\b|\bdo\b|\bdof\b|\boff\b/.test(clean)) return { key: 'off', label: 'folga' };
 if (/ferias|vacation|\bvac\b/.test(clean)) return { key: 'vacation', label: 'férias' };
 if (/treinamento crm|\bcrm\b/.test(clean)) return { key: 'crm', label: 'treinamento CRM' };
 if (/treinamento on line|\bead\b/.test(clean)) return { key: 'ead', label: 'treinamento on-line' };
 if (/reuniao|reunião|meeting|\bmt\b/.test(clean)) return { key: 'meeting', label: 'reunião' };
 if (legs.length) return { key: 'flight', label: 'voo' };
 return { key: 'other', label: translated || 'programação' };
}

function telegramConciergeDayStartTime(day = {}, firstLeg = {}) {
 return telegramConciergeFormatTime(day.startTime || day.reportTime || day.dutyReport || day.presentationTime || day.checkInTime || firstLeg.dutyReport || firstLeg.reportTime || firstLeg.presentationTime || firstLeg.departureTime || firstLeg.departure || firstLeg.dep || firstLeg.startTime || '');
}

function telegramConciergeDayEndTime(day = {}, lastLeg = {}) {
 return telegramConciergeFormatTime(day.endTime || day.releaseTime || day.dutyEnd || lastLeg.arrivalTime || lastLeg.arrival || lastLeg.arr || lastLeg.endTime || day.arrivalTime || '');
}

function telegramConciergeDayStartPlace(day = {}, firstLeg = {}) {
 return telegramConciergeAirportName(firstLeg.origin || firstLeg.from || day.origin || day.from || day.location || day.airport || day.base || 'local não informado');
}

function telegramConciergeDayEndPlace(day = {}, lastLeg = {}) {
 return telegramConciergeAirportName(lastLeg.destination || lastLeg.to || day.destination || day.to || day.endLocation || day.location || day.airport || day.base || 'local não informado');
}


function telegramConciergeVocativeFromUser(user = null, row = null, context = {}) {
 const first = telegramFirstNameFromUser(user, row, null) || 'comandante';
 const roster = context?.roster || context?.found?.roster || context?.row?.roster || {};
 const day = context?.day || context?.found?.day || null;
 const rawRole = [user?.rank, user?.role, user?.function, user?.funcao, user?.cargo, roster?.rank, roster?.crewRank, roster?.role, day?.rank, day?.role]
  .map((part) => String(part || '').trim()).find(Boolean) || '';
 const role = telegramConciergeReadableCrewRole(rawRole, -1);
 if (role && !/^Comissário$/i.test(role)) return `${role} ${first}`;
 if (/^Comissário$/i.test(role)) return `Comissário ${first}`;
 return first;
}

function telegramConciergeRandomIndex(seed = '', length = 1) {
 const size = Math.max(1, Number(length) || 1);
 if (!TELEGRAM_CONCIERGE_AUDIO_VARIATION) {
  const text = String(seed || 'crewcheck');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) - hash) + text.charCodeAt(i);
  return Math.abs(hash) % size;
 }
 const timeBucket = Math.floor(Date.now() / 30_000);
 const random = Math.floor(Math.random() * size);
 const text = `${seed}|${timeBucket}|${random}`;
 let hash = 0;
 for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) - hash) + text.charCodeAt(i);
 return Math.abs(hash) % size;
}

function telegramConciergePickVariant(variants = [], seed = '') {
 const list = (Array.isArray(variants) ? variants : [variants]).map((item) => String(item || '').trim()).filter(Boolean);
 if (!list.length) return '';
 return list[telegramConciergeRandomIndex(seed, list.length)] || list[0];
}

function telegramConciergeAudioGreeting({ user = null, row = null, context = {}, title = '', text = '' } = {}) {
 const vocative = telegramConciergeVocativeFromUser(user, row, context);
 const seed = `${title}|${text}|${vocative}|${context?.kind || ''}`;
 const variants = TELEGRAM_CONCIERGE_AUDIO_PERSONALITY.includes('formal')
  ? [`Olá, ${vocative}.`, `Pronto, ${vocative}.`, `Tudo certo, ${vocative}.`]
  : [`E aí, ${vocative}.`, `Fala, ${vocative}.`, `Pronto, ${vocative}.`, `Boa, ${vocative}.`, `Opa, ${vocative}.`];
 return telegramConciergePickVariant(variants, seed);
}

function telegramConciergeDateLabelForSpeech(iso = '', label = '') {
 const clean = telegramConciergeCleanWord(label);
 if (clean === 'hoje') return 'hoje';
 if (clean === 'amanha') return 'amanhã';
 if (clean.includes('depois de amanha')) return 'depois de amanhã';
 const readable = telegramConciergeReadableDate(iso);
 return readable ? `no dia ${readable.slice(0, 5)}` : (label || 'nessa data');
}

function telegramConciergeAudioMaybeTip(day = {}, kind = {}, legs = [], { start = '', includeAdvice = true } = {}) {
 if (!includeAdvice || !TELEGRAM_CONCIERGE_AUDIO_SMART_TIPS) return '';
 const cleanKind = String(kind?.key || '').toLowerCase();
 const tips = [];
 const hour = Number(String(start || '').match(/^(\d{1,2})/)?.[1] || NaN);
 if (['flight', 'extra', 'reserve'].includes(cleanKind)) {
  tips.push('Confere documento, uniforme e a escala oficial antes de sair.');
  tips.push('Já deixa o check-in e o deslocamento no radar para não correr.');
  tips.push('Dá uma última olhada no portão e no status antes de sair para o aeroporto.');
  if (Number.isFinite(hour) && hour < 8) tips.push('Como é cedo, eu já deixaria despertador extra e tudo separado hoje.');
  if (legs.length > 3) tips.push('Como são várias pernas, tenta se hidratar e comer nas janelas boas.');
 }
 if (cleanKind === 'standby' || cleanKind === 'standby_extra') {
  tips.push('Deixa o celular carregado e o volume ligado.');
  tips.push('Se tocar, já confere apresentação, base e deslocamento antes de sair.');
 }
 if (cleanKind === 'off' || cleanKind === 'off_after_vacation' || cleanKind === 'vacation') {
  tips.push('Aproveita para descansar sem culpa.');
  tips.push('Bom dia para recuperar energia.');
 }
 return telegramConciergePickVariant(tips, `${cleanKind}|${start}|${legs.length}|tip`);
}

function telegramConciergeAudioDaySummary(day = {}, iso = '', { label = '', concise = false, includeAdvice = true } = {}) {
 const kind = telegramConciergeDayKind(day);
 const legs = telegramConciergeDayLegs(day);
 const firstLeg = legs[0] || {};
 const lastLeg = legs[legs.length - 1] || firstLeg || {};
 const start = telegramConciergeDayStartTime(day, firstLeg);
 const end = telegramConciergeDayEndTime(day, lastLeg);
 const startPlace = telegramConciergeDayStartPlace(day, firstLeg);
 const endPlace = telegramConciergeDayEndPlace(day, lastLeg);
 const dateLabel = telegramConciergeDateLabelForSpeech(iso, label);
 const startPhrase = start ? `às ${telegramConciergeSpeakClock(start)}` : 'sem horário de início localizado';
 const endPhrase = end ? `às ${telegramConciergeSpeakClock(end)}` : 'sem horário de término localizado';
 const dateIsToday = dateLabel === 'hoje';
 const seed = `${iso}|${label}|${kind.key}|${legs.length}|${start}|${end}|${startPlace}|${endPlace}`;
 const maybeTip = telegramConciergeAudioMaybeTip(day, kind, legs, { start, includeAdvice: includeAdvice && !concise });
 const suffix = maybeTip ? ` ${maybeTip}` : '';
 if (kind.key === 'standby' || kind.key === 'standby_extra') {
  const variants = [
   `Ah, que o melhor aconteça! Você está de ${kind.label} ${dateLabel}, das ${telegramConciergeSpeakClock(start)} até ${telegramConciergeSpeakClock(end)}. Fica de olho no celular.`,
   `Tomara que fique tranquilo: ${dateLabel}, você está de ${kind.label} das ${telegramConciergeSpeakClock(start)} até ${telegramConciergeSpeakClock(end)}. Celular carregado e por perto, tá?`,
   `Hoje o jogo é esperar. ${dateLabel}, ${kind.label} das ${telegramConciergeSpeakClock(start)} até ${telegramConciergeSpeakClock(end)}. Qualquer acionamento, confere a escala oficial antes de sair.`,
   `Você está de ${kind.label} ${dateLabel}, das ${telegramConciergeSpeakClock(start)} até ${telegramConciergeSpeakClock(end)}. Torcendo para não tocar, mas fica atento no celular.`
  ];
  return `${telegramConciergePickVariant(variants, seed)}${suffix}`;
 }
 if (kind.key === 'reserve' || kind.key === 'extra') {
  const checkinAdvice = includeAdvice ? 'Se estiver na base, não esquece de enviar o formulário de check-in.' : '';
  const variants = [
   `Você está de ${kind.label} ${dateLabel}, se apresentando ${startPhrase}. ${checkinAdvice}`,
   `Para ${dateLabel}, consta ${kind.label}. Apresentação ${startPhrase}. ${checkinAdvice}`,
   `Sua programação é ${kind.label} ${dateLabel}. A apresentação está ${startPhrase}. ${checkinAdvice}`,
   `${dateIsToday ? 'Hoje é' : `Para ${dateLabel}, é`} ${kind.label}: apresentação ${startPhrase}. ${checkinAdvice}`
  ];
  return `${telegramConciergePickVariant(variants, seed)}${suffix}`;
 }
 if (kind.key === 'off' || kind.key === 'off_after_vacation') {
  const variants = [
   `${dateIsToday ? 'Hoje' : `Você tem ${kind.label} ${dateLabel}`}. É ${kind.label}; aproveita para descansar e recuperar energia.`,
   `${dateIsToday ? 'Hoje' : dateLabel} está de ${kind.label}. Pode respirar um pouco e descansar.`,
   `Boa notícia: ${dateIsToday ? 'hoje' : dateLabel} é ${kind.label}. Aproveita para recarregar a bateria.`
  ];
  return telegramConciergePickVariant(variants, seed);
 }
 if (kind.key === 'vacation') {
  const variants = [
   `${dateIsToday ? 'Hoje' : dateLabel} você segue de férias. Aproveita para descansar.`,
   `Férias confirmadas ${dateLabel}. Esquece escala um pouquinho e aproveita.`,
   `${dateIsToday ? 'Hoje' : dateLabel} é férias. Nada de inventar moda com escala, vai descansar.`
  ];
  return telegramConciergePickVariant(variants, seed);
 }
 if (kind.key === 'crm' || kind.key === 'ead' || kind.key === 'meeting') {
  const local = startPlace && startPlace !== 'local não informado' ? ` em ${startPlace}` : '';
  const variants = [
   `Você tem ${kind.label} ${dateLabel}${local}, começando ${startPhrase}${end ? ` e terminando ${endPhrase}` : ''}.`,
   `${dateLabel}, aparece ${kind.label}${local}. Começa ${startPhrase}${end ? ` e fecha ${endPhrase}` : ''}.`,
   `Sua atividade ${dateLabel} é ${kind.label}${local}. Início ${startPhrase}${end ? `, término ${endPhrase}` : ''}.`
  ];
  return `${telegramConciergePickVariant(variants, seed)}${suffix}`;
 }
 if (legs.length) {
  const count = legs.length;
  const legWord = telegramConciergePlural(count, 'perna', 'pernas');
  const route = `começando em ${startPlace} ${startPhrase}, e terminando em ${endPlace} ${endPhrase}`;
  let variants;
  if (count > 3) {
   variants = [
    `Nossa, ${dateIsToday ? 'hoje' : dateLabel} tá puxado: você tem ${count} ${legWord}, ${route}.`,
    `Segura essa: ${dateIsToday ? 'hoje' : dateLabel} vem pesado, com ${count} ${legWord}, ${route}.`,
    `Dia cheio no radar: ${count} ${legWord} ${dateLabel}, ${route}.`,
    `${dateIsToday ? 'Hoje' : dateLabel} não está para brincadeira: são ${count} ${legWord}, ${route}.`
   ];
  } else if (count < 3) {
   variants = [
    `Ah, ${dateIsToday ? 'hoje' : dateLabel} está tranquilo: você tem ${count} ${legWord}, ${route}.`,
    `${dateIsToday ? 'Hoje' : dateLabel} está bem de boa: ${count} ${legWord}, ${route}.`,
    `Programação leve ${dateLabel}: ${count} ${legWord}, ${route}.`,
    `${dateIsToday ? 'Hoje parece' : dateLabel + ' parece'} mais redondo: ${count} ${legWord}, ${route}.`
   ];
  } else {
   variants = [
    `${dateIsToday ? 'Hoje' : `Nesse ${dateLabel}`} está no meio termo: você tem ${count} ${legWord}, ${route}.`,
    `${dateLabel} vem equilibrado: ${count} ${legWord}, ${route}.`,
    `Para ${dateLabel}, são ${count} ${legWord}. Começa em ${startPlace} ${startPhrase} e termina em ${endPlace} ${endPhrase}.`
   ];
  }
  return `${telegramConciergePickVariant(variants, seed)}${suffix}`;
 }
 const type = kind.label || 'programação';
 const variants = [
  `Você tem ${type} ${dateLabel}${start ? `, começando ${startPhrase}` : ''}${end ? ` e terminando ${endPhrase}` : ''}.`,
  `Consta ${type} ${dateLabel}${start ? `, início ${startPhrase}` : ''}${end ? ` e término ${endPhrase}` : ''}.`,
  `${dateLabel}, apareceu ${type}${start ? ` começando ${startPhrase}` : ''}${end ? ` e encerrando ${endPhrase}` : ''}.`
 ];
 return telegramConciergePickVariant(variants, seed);
}

function telegramConciergeDayShortLine(day = {}, iso = '') {
 const kind = telegramConciergeDayKind(day);
 const legs = telegramConciergeDayLegs(day);
 const firstLeg = legs[0] || {};
 const lastLeg = legs[legs.length - 1] || firstLeg || {};
 const date = telegramConciergeReadableDate(iso).slice(0, 5);
 const start = telegramConciergeDayStartTime(day, firstLeg) || '--:--';
 const end = telegramConciergeDayEndTime(day, lastLeg) || '--:--';
 if (legs.length) return `${date} · ${legs.length} ${telegramConciergePlural(legs.length, 'perna', 'pernas')} · ${telegramConciergeDayStartPlace(day, firstLeg)} ${start} → ${telegramConciergeDayEndPlace(day, lastLeg)} ${end}`;
 return `${date} · ${kind.label} · ${start}${end !== '--:--' ? ` até ${end}` : ''}`;
}

function telegramConciergeUpcomingDays(rosters = [], { limit = 5, fromIso = telegramConciergeDatePlus(0) } = {}) {
 const items = [];
 const seen = new Set();
 for (const item of rosters) {
  const roster = item.roster || {};
  for (const day of roster.days || []) {
   const iso = telegramConciergeDateFromDay(day, roster);
   if (!iso || iso < fromIso || seen.has(iso)) continue;
   const kind = telegramConciergeDayKind(day);
   const legs = telegramConciergeDayLegs(day);
   const firstLeg = legs[0] || {};
   const start = telegramConciergeDayStartTime(day, firstLeg) || telegramConciergeFormatTime(firstLeg.departureTime || firstLeg.departure || '23:59') || '23:59';
   seen.add(iso);
   items.push({ row: item, roster, day, iso, kind, sortKey: `${iso}T${start}` });
  }
 }
 return items.sort((a, b) => String(a.sortKey).localeCompare(String(b.sortKey))).slice(0, Math.max(1, limit));
}

function telegramConciergeUpcomingLines(items = [], { free = false } = {}) {
 if (!items.length) return ['Não encontrei próximas programações na escala salva.', 'Importe ou sincronize a escala mais recente para eu acompanhar.'];
 const lines = ['Próximas programações encontradas:'];
 for (const item of items) lines.push(telegramConciergeDayShortLine(item.day, item.iso));
 if (free) lines.push('No gratuito, mostro só um resumo básico. O Premium libera calendário completo, voz, radar, saída e diárias.');
 return lines;
}

function telegramConciergeWantsUpcoming(text = '') {
 const clean = telegramConciergeNormalizeText(text);
 if (/^\/(proximas|proximos|semana|escala|agenda)\b/.test(clean)) return true;
 if (/\b(proximas|proximos|proximas programacoes|proximos voos|minhas programacoes|meus voos|minha escala|minha agenda|programacoes da semana|escala da semana|semana)\b/.test(clean)) return true;
 if (/\b(programacoes|programações)\b/.test(String(text || '').toLowerCase()) && !/\b(hoje|amanha|amanhã|dia\s+\d{1,2}|\d{1,2}[\/\-.]\d{1,2})\b/i.test(String(text || ''))) return true;
 return false;
}

function telegramConciergeIsGenericGreetingLine(line = '', userName = '') {
 const clean = telegramConciergeCleanWord(line);
 const name = telegramConciergeCleanWord(userName);
 if (!clean) return true;
 if (name && new RegExp(`^(boa|ola|oi|fala|pronto|e ai)?\\s*${name}\\b`).test(clean)) return true;
 return /^(boa|ola|oi|fala|pronto|e ai|ja olhei aqui|ouvi aqui|ouvi aqui e ja dei uma olhada)/.test(clean);
}


function telegramConciergeTitleCaseName(value = '') {
 const clean = String(value || '').replace(/[_|;]/g, ' ').replace(/\s+/g, ' ').trim();
 if (!clean) return '';
 if (clean.length <= 3 && clean === clean.toUpperCase()) return clean;
 return clean.toLowerCase().replace(/(^|\s|[-'])([\p{L}])/gu, (_, sep, ch) => `${sep}${ch.toUpperCase()}`);
}

function telegramConciergeReadableCrewRole(value = '', index = -1) {
 const raw = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
 if (!raw) return index === 0 ? 'Chefe' : '';
 if (/\b(CCM|CHEFE|CABIN CHIEF|CHIEF|PUR\d?|COMISSARIO CHEFE)\b/.test(raw)) return 'Chefe';
 if (/\b(CP|CPT|CMTE|COMANDANTE|CAPTAIN|CAP)\b/.test(raw)) return 'Comandante';
 if (/\b(FO|COP|COPILOTO|CO PILOTO|FIRST OFFICER)\b/.test(raw)) return 'Copiloto';
 if (/\b(CMS|COMISSARIO|COMISSARIA|CABIN CREW|FA)\b/.test(raw)) return 'Comissário';
 if (/\b(INST|INSTRUTOR|INSTRUCTOR)\b/.test(raw)) return 'Instrutor';
 return telegramConciergeTitleCaseName(value).slice(0, 24);
}

function telegramConciergeCrewNameFromItem(item = {}) {
 if (typeof item === 'string') {
  const cleaned = item.replace(/^\s*(?:CP|CPT|CMTE|FO|COP|CCM|CMS|FA|INST|CHEFE|COMANDANTE|COPILOTO|COMISS[ÁA]RIO[A]?)\s*[-:·–—]?\s*/i, '').replace(/\s+/g, ' ').trim();
  return telegramConciergeTitleCaseName(cleaned).slice(0, 48);
 }
 const candidates = [item.name, item.fullName, item.full_name, item.crewName, item.crew_name, item.displayName, item.employeeName, item.nome, item.tripulante, item.label].filter(Boolean);
 const value = String(candidates[0] || '').replace(/\s+/g, ' ').trim();
 return telegramConciergeTitleCaseName(value).slice(0, 48);
}

function telegramConciergeCrewRoleFromItem(item = {}, index = -1) {
 if (typeof item === 'string') {
  const match = item.match(/^\s*(CP|CPT|CMTE|FO|COP|CCM|CMS|FA|INST|CHEFE|COMANDANTE|COPILOTO|COMISS[ÁA]RIO[A]?)\b/i) || item.match(/\b(CP|CPT|CMTE|FO|COP|CCM|CMS|FA|INST)\b/i);
  return telegramConciergeReadableCrewRole(match?.[1] || '', index);
 }
 const candidates = [item.role, item.rank, item.function, item.funcao, item.função, item.position, item.duty, item.code, item.category, item.cargo, item.type].filter(Boolean);
 return telegramConciergeReadableCrewRole(candidates[0] || '', index);
}

function telegramConciergeCrewLabel(item = {}, index = -1) {
 const role = telegramConciergeCrewRoleFromItem(item, index);
 const name = telegramConciergeCrewNameFromItem(item);
 if (role && name) return `${role} ${name}`;
 if (name) return name;
 return '';
}

function telegramConciergeCollectCrewMembers(day = {}, leg = {}) {
 const buckets = [leg.crew, leg.crews, leg.crewMembers, leg.crewList, leg.tripulantes, leg.tripulation, day.crew, day.crews, day.crewMembers, day.crewList, day.tripulantes, day.tripulation, day.team].filter(Boolean);
 const rawItems = [];
 for (const bucket of buckets) {
  if (Array.isArray(bucket)) rawItems.push(...bucket);
  else if (typeof bucket === 'object') rawItems.push(...Object.values(bucket));
  else if (typeof bucket === 'string') rawItems.push(...bucket.split(/\n|;/).map((part) => part.trim()).filter(Boolean));
 }
 const seen = new Set();
 const labels = [];
 for (let i = 0; i < rawItems.length; i += 1) {
  const label = telegramConciergeCrewLabel(rawItems[i], i);
  const key = telegramConciergeNormalizeText(label);
  if (!label || seen.has(key)) continue;
  seen.add(key);
  labels.push(label);
 }
 return labels.slice(0, 8);
}

function telegramConciergeTranslateRosterAbbreviations(text = '') {
 let out = String(text || '');
 const replacements = [
  [/\bHSB\s*(?:EXTRA|EXT|\+|X)\b/g, 'sobreaviso extra'],
  [/\b(?:EXTRA\s*)?HSB\b/g, (m) => /^EXTRA/.test(m) ? 'sobreaviso extra' : 'sobreaviso'],
  [/\bSBY\b|\bSOB\b/g, 'sobreaviso'],
  [/\bDOP\b/g, 'folga pós-férias'],
  [/\bDOF\b|\bDO\b|\bOFF\b/g, 'folga'],
  [/\bVAC\b|\bFERIAS\b|\bFÉRIAS\b/gi, 'férias'],
  [/\bPS\b|\bVEX\b|\bVIVO\s+DE\s+EXTRA\b/g, 'extra'],
  [/\bMT\b/g, 'reunião'],
  [/\bCRM\b/g, 'treinamento CRM'],
  [/\bEAD\b/g, 'treinamento on-line'],
  [/\bRES\b|\bRSA\b/g, 'reserva'],
  [/\bAPRES(?:ENTA[ÇC][ÃA]O)?\b|\bDUTY\s*REPORT\b/gi, 'apresentação'],
  [/\bDEP\b/g, 'decolagem'],
  [/\bARR\b/g, 'chegada'],
  [/\bCP\b/g, 'Comandante'],
  [/\bFO\b/g, 'Copiloto'],
  [/\bCCM\b/g, 'Chefe'],
 ];
 for (const [pattern, value] of replacements) out = out.replace(pattern, value);
 return out.replace(/\s+/g, ' ').trim();
}

function telegramConciergeNaturalizeForAudio(text = '') {
 let out = telegramConciergeTranslateRosterAbbreviations(text);
 out = out
  .replace(/\b(LA)\s?(\d{3,4})\b/gi, 'voo LATAM $2')
  .replace(/\b(G3)\s?(\d{3,4})\b/gi, 'voo Gol $2')
  .replace(/\b(AD)\s?(\d{3,4})\b/gi, 'voo Azul $2')
  .replace(/\b(TP)\s?(\d{3,4})\b/gi, 'voo TAP $2')
  .replace(/\bBSB\b/g, 'Brasília')
  .replace(/\bGRU\b/g, 'Guarulhos')
  .replace(/\bCGH\b/g, 'Congonhas')
  .replace(/\bSDU\b/g, 'Santos Dumont')
  .replace(/\bGIG\b/g, 'Galeão')
  .replace(/\bVCP\b/g, 'Viracopos')
  .replace(/\bCNF\b/g, 'Confins')
  .replace(/\bPOA\b/g, 'Porto Alegre')
  .replace(/\bREC\b/g, 'Recife')
  .replace(/\bSSA\b/g, 'Salvador')
  .replace(/\bFOR\b/g, 'Fortaleza')
  .replace(/\bNAT\b/g, 'Natal')
  .replace(/\s*[·•]\s*/g, ', ')
  .replace(/\s*→\s*/g, ' para ')
  .replace(/--:--/g, 'horário não informado')
  .replace(/\bHorário:\s*/gi, 'horário, ')
  .replace(/\bData da programação:\s*/gi, 'programação em ')
  .replace(/\bPortão:\s*/gi, 'portão, ')
  .replace(/\bTerminal:\s*/gi, 'terminal, ')
  .replace(/\bStatus:\s*/gi, 'status, ')
  .replace(/\bOrigem:\s*/gi, 'saindo de ')
  .replace(/\bLocal:\s*/gi, 'local, ')
  .replace(/\bApresentação na escala:\s*/gi, 'apresentação na escala às ')
  .replace(/\bDecolagem:\s*/gi, 'decolagem às ')
  .replace(/\b(\d{2}):(\d{2})\b/g, '$1 e $2')
  .replace(/\s+/g, ' ')
  .trim();
 return out;
}

function telegramConciergeTrimAudioText(text = '', maxChars = TELEGRAM_CONCIERGE_AUDIO_MAX_CHARS) {
 const clean = String(text || '').replace(/\s+/g, ' ').trim();
 if (clean.length <= maxChars) return clean;
 const sliced = clean.slice(0, maxChars);
 const cut = Math.max(sliced.lastIndexOf('. '), sliced.lastIndexOf(', '), sliced.lastIndexOf(' '));
 return `${sliced.slice(0, cut > 360 ? cut : maxChars).trim()}. O restante eu deixei escrito no Telegram.`;
}


function telegramConciergeAudioBodyFromContext(context = {}) {
 if (!context || typeof context !== 'object') return '';
 if (context.kind === 'day' && context.day) return telegramConciergeAudioDaySummary(context.day, context.iso || '', { label: context.label || '', includeAdvice: true });
 if (context.kind === 'next' && context.day) {
  const variants = ['Sua próxima programação é essa:', 'A próxima que eu encontrei foi essa:', 'Olhei aqui, a próxima é assim:'];
  return `${telegramConciergePickVariant(variants, `${context.iso}|next`)} ${telegramConciergeAudioDaySummary(context.day, context.iso || '', { label: context.label || 'próxima', includeAdvice: true })}`;
 }
 if (context.kind === 'upcoming') {
  const items = Array.isArray(context.items) ? context.items : [];
  if (!items.length) return 'Não encontrei próximas programações salvas. Sincronize a escala mais recente no CrewCheck.';
  const maxAudio = Math.min(Number(context.audioLimit || 3), items.length);
  const intros = [
   `Separei as próximas ${maxAudio} programações para você.`,
   `Peguei aqui um resumo rápido das próximas ${maxAudio}.`,
   `Olhei sua agenda e vou te falar as próximas ${maxAudio}, bem direto.`,
   `Tenho aqui as próximas ${maxAudio} da escala.`
  ];
  const pieces = items.slice(0, maxAudio).map((item) => telegramConciergeAudioDaySummary(item.day, item.iso, { label: item.label || '', concise: true, includeAdvice: false }));
  const more = items.length > maxAudio ? telegramConciergePickVariant(['O restante eu deixei escrito no Telegram.', 'As outras eu deixei no texto para não ficar áudio gigante.', 'Deixei o complemento por escrito aqui embaixo.'], `more|${items.length}`) : '';
  return [telegramConciergePickVariant(intros, `upcoming|${items.length}|${maxAudio}`), ...pieces, more].filter(Boolean).join(' ');
 }
 if (context.kind === 'regulation') {
  const lines = Array.isArray(context.lines) ? context.lines.filter(Boolean).slice(0, 4) : [];
  if (!lines.length) return 'Não encontrei dados regulatórios salvos. Reimporte sua escala e tente de novo.';
  return `Sobre regulamentação: ${lines.map((line) => telegramConciergeNaturalizeForAudio(telegramConciergeTranslateRosterAbbreviations(String(line || '')))).join('. ')}`;
 }
 if (context.kind === 'gate' && context.found) {
  const leg = context.leg || context.found.leg || {};
  const flight = telegramConciergeNaturalizeForAudio(telegramConciergeLegNumber(leg) || 'seu voo');
  const route = [telegramConciergeAirportName(leg.origin || leg.from), telegramConciergeAirportName(leg.destination || leg.to)].filter(Boolean).join(' para ');
  const dep = telegramConciergeFormatTime(leg.departureTime || leg.departure || leg.dep || '');
  const gate = leg.gate ? `O portão é ${leg.gate}.` : telegramConciergePickVariant(['O portão ainda não apareceu no radar salvo.', 'Ainda não tenho portão confirmado salvo aqui.', 'Portão, por enquanto, ainda não está disponível no CrewCheck.'], `${flight}|gate`);
  const terminal = leg.terminal ? `Terminal ${leg.terminal}.` : '';
  const tip = TELEGRAM_CONCIERGE_AUDIO_SMART_TIPS ? 'Confere o monitor do aeroporto quando estiver perto do embarque.' : '';
  return `Sobre o ${flight}${route ? `, de ${route}` : ''}${dep ? `, saindo às ${telegramConciergeSpeakClock(dep)}` : ''}. ${gate} ${terminal} ${tip}`.trim();
 }
 if (context.kind === 'departure' && context.found) {
  const leg = context.leg || context.found.leg || {};
  const report = telegramConciergeFormatTime(leg.dutyReport || leg.reportTime || leg.presentationTime || context.found.day?.startTime || '');
  const dep = telegramConciergeFormatTime(leg.departureTime || leg.departure || leg.dep || '');
  const origin = telegramConciergeAirportName(leg.origin || leg.from || context.found.day?.location || 'origem não informada');
  const variants = [
   `Para a saída inteligente, encontrei a programação saindo de ${origin}. ${report ? `A apresentação está às ${telegramConciergeSpeakClock(report)}.` : dep ? `A decolagem está às ${telegramConciergeSpeakClock(dep)}.` : 'Não achei o horário de apresentação na escala.'}`,
   `Sobre sair de casa: a referência que eu achei é ${origin}. ${report ? `Apresentação às ${telegramConciergeSpeakClock(report)}.` : dep ? `Decolagem às ${telegramConciergeSpeakClock(dep)}.` : 'Sem horário confiável de apresentação na escala.'}`,
   `Para não apertar, eu usaria ${origin} como origem operacional. ${report ? `A apresentação está às ${telegramConciergeSpeakClock(report)}.` : dep ? `O voo sai às ${telegramConciergeSpeakClock(dep)}.` : 'Não achei horário fechado na escala.'}`
  ];
  const tip = TELEGRAM_CONCIERGE_AUDIO_SMART_TIPS ? 'Para trânsito real, calcula uma vez no app com a localização ativa.' : '';
  return `${telegramConciergePickVariant(variants, `${origin}|${report}|${dep}`)} ${tip}`.trim();
 }
 if (context.kind === 'perdiem') {
  const target = context.target?.label || 'essa data';
  const lines = Array.isArray(context.lines) ? context.lines.filter(Boolean).slice(1, 4) : [];
  return lines.length ? `Sobre as diárias de ${target}: ${lines.map(telegramConciergeNaturalizeForAudio).join('. ')}.` : `Não achei diária calculada para ${target}.`;
 }
 if (['history', 'month', 'salary'].includes(context.kind)) {
  const lines = Array.isArray(context.lines) ? context.lines.filter(Boolean).slice(0, 5) : [];
  return lines.length ? lines.map(telegramConciergeNaturalizeForAudio).join('. ') : '';
 }
 return '';
}


function telegramConciergeSpokenTextFromReply({ title = '', lines = [], userName = '', inputMode = 'text', conciergeName = TELEGRAM_DEFAULT_CONCIERGE_NAME, user = null, row = null, audioContext = null } = {}) {
 const contextBody = telegramConciergeAudioBodyFromContext(audioContext || {});
 const rawLines = (Array.isArray(lines) ? lines : [lines]).map((line) => String(line || '').trim()).filter(Boolean);
 const filteredLines = rawLines.filter((line) => !telegramConciergeIsGenericGreetingLine(line, userName));
 const cleanLines = filteredLines.map((line) => telegramConciergeNaturalizeForAudio(line)).filter(Boolean);
 const greeting = telegramConciergeAudioGreeting({ user, row, context: audioContext || {}, title, text: cleanLines.join(' ') });
 const readableTitle = telegramConciergeNaturalizeForAudio(title).replace(/^Programação\s*[·-]\s*/i, 'programação de ');
 const body = contextBody || [readableTitle && !/concierge|programação\s*de\s*programação/i.test(readableTitle) ? readableTitle : '', cleanLines.slice(0, 4).join('. ')].filter(Boolean).join('. ');
 const needsSafety = /voo|perna|portão|saída|apresentação|reserva|extra|sobreaviso|radar|diárias/i.test(body);
 const safety = needsSafety ? telegramConciergePickVariant([
  'Confere a escala oficial também, tá?',
  'Só confirma na escala oficial antes de agir.',
  'E claro: vale validar nos canais oficiais.',
  'Eu te ajudo no resumo, mas a escala oficial manda.'
 ], `${body}|safety`) : '';
 const text = [greeting, body, safety].filter(Boolean).join(' ')
  .replace(/\b(Boa|E aí|Fala|Opa|Pronto),\s+([^\.]+)\.\s+(Boa|E aí|Fala|Opa|Pronto),\s+\2\./i, '$1, $2.')
  .replace(/\s+/g, ' ')
  .trim();
 return telegramConciergeTrimAudioText(text);
}

function telegramConciergeLegNumber(leg = {}) {
 return normalizeFlightToken(leg.flightNumber || leg.flight || leg.number || leg.label || '') || String(leg.flightNumber || leg.flight || '').trim();
}

function telegramConciergeLegLine(leg = {}, index = 0) {
 const number = telegramConciergeLegNumber(leg) || `Trecho ${index + 1}`;
 const route = [leg.origin || leg.from, leg.destination || leg.to].filter(Boolean).join(' → ');
 const dep = telegramConciergeFormatTime(leg.departureTime || leg.departure || leg.dep || leg.startTime || leg.scheduledDeparture);
 const arr = telegramConciergeFormatTime(leg.arrivalTime || leg.arrival || leg.arr || leg.endTime || leg.scheduledArrival);
 const time = dep || arr ? `${dep || '--:--'}${arr ? `–${arr}` : ''}` : '';
 const gate = leg.gate ? `Portão ${leg.gate}` : '';
 const terminal = leg.terminal ? `Terminal ${leg.terminal}` : '';
 const status = telegramConciergeTranslateRosterAbbreviations(leg.status || leg.flightStatus || '');
 return [number, route, time, gate, terminal, status].filter(Boolean).join(' · ');
}

function telegramConciergeDayLines(day = {}, iso = '') {
 const lines = [];
 const type = telegramConciergeTranslateRosterAbbreviations(day.type || day.title || day.activityType || day.pairingCode || day.code || '');
 const raw = telegramConciergeTranslateRosterAbbreviations(String(day.rawText || day.description || '').replace(/\s+/g, ' ').trim());
 const start = telegramConciergeFormatTime(day.startTime || day.reportTime || day.dutyReport || day.presentationTime || day.checkInTime || '');
 const end = telegramConciergeFormatTime(day.endTime || day.releaseTime || day.dutyEnd || day.arrivalTime || '');
 const baseLine = [iso ? iso.split('-').reverse().join('/') : '', type].filter(Boolean).join(' · ');
 if (baseLine) lines.push(baseLine);
 if (start || end) lines.push(`Horário: ${start || '--:--'}${end ? ` até ${end}` : ''}`);
 const legs = Array.isArray(day.legs) ? day.legs : [];
 if (legs.length) lines.push(...legs.slice(0, 6).map(telegramConciergeLegLine));
 else if (raw) lines.push(raw.slice(0, 180));
 const crew = telegramConciergeCollectCrewMembers(day, legs[0] || {});
 if (crew.length) lines.push(`Tripulação: ${crew.slice(0, 6).join('; ')}`);
 if (day.location || day.airport || day.base) lines.push(`Local: ${day.location || day.airport || day.base}`);
 return lines.length ? lines : ['Não encontrei programação detalhada para esta data.'];
}

function telegramConciergeFlattenFlights(rosters = []) {
 const flights = [];
 for (const item of rosters) {
  const roster = item.roster || {};
  for (const day of roster.days || []) {
   const iso = telegramConciergeDateFromDay(day, roster);
   for (const leg of Array.isArray(day.legs) ? day.legs : []) {
    const time = telegramConciergeFormatTime(leg.departureTime || leg.departure || leg.dep || leg.startTime || '12:00') || '12:00';
    flights.push({ iso, day, leg, sortKey: `${iso || '9999-99-99'}T${time}` });
   }
  }
 }
 return flights.sort((a, b) => String(a.sortKey).localeCompare(String(b.sortKey)));
}

function telegramConciergeFindFlight(rosters = [], text = '') {
 const token = normalizeFlightToken((String(text || '').match(/\b(?:LA|JJ|G3|AD|TP|TTL|0S)?\s*\d{3,4}\b/i) || [''])[0] || '');
 const flights = telegramConciergeFlattenFlights(rosters);
 if (token) {
  const found = flights.find((item) => normalizeFlightToken(telegramConciergeLegNumber(item.leg)) === token);
  if (found) return found;
 }
 const today = telegramConciergeDatePlus(0);
 return flights.find((item) => item.iso >= today) || flights[flights.length - 1] || null;
}

function telegramConciergeMealLines(day = {}, iso = '') {
 const raw = `${day.rawText || ''} ${day.type || ''} ${day.pairingCode || ''}`;
 const lines = [];
 const candidates = [];
 if (Array.isArray(day.meals)) candidates.push(...day.meals);
 if (Array.isArray(day.perDiems)) candidates.push(...day.perDiems);
 if (Array.isArray(day.diarias)) candidates.push(...day.diarias);
 for (const item of candidates.slice(0, 8)) {
  if (typeof item === 'string') lines.push(telegramConciergeTranslateRosterAbbreviations(item));
  else lines.push(telegramConciergeTranslateRosterAbbreviations([item.label || item.type || item.name || 'Diária', item.value ? `R$ ${item.value}` : '', item.reason || item.source || ''].filter(Boolean).join(' · ')));
 }
 if (!lines.length && /pernoite|inativo|layover|hotel|acomod/i.test(raw)) lines.push('Pernoite/inativo fora de base: verificar almoço e jantar conforme janela e tabela vigente.');
 if (!lines.length && Array.isArray(day.legs) && day.legs.length) lines.push('Há voo/jornada no dia. Abra a auditoria de diárias no app para ver janelas de café, almoço, jantar e ceia.');
 if (!lines.length) lines.push('Não encontrei diária calculada para esse dia pela escala salva.');
 return [`${iso ? iso.split('-').reverse().join('/') : 'Data selecionada'}`, ...lines];
}

function telegramConciergeRoutineLines(rosters = [], queryText = '') {
 const clean = telegramConciergeNormalizeText(queryText).replace(/^(que horas|quando|tenho que|devo|preciso)\s+/g, '').trim();
 const tokens = clean.split(' ').filter((t) => t.length >= 3 && !['que','horas','tenho','preciso','devo','fazer','minha','meu'].includes(t)).slice(0, 4);
 const matches = [];
 for (const item of rosters) {
  const gym = Array.isArray(item.gym) ? item.gym : [];
  for (const entry of gym) {
   const text = JSON.stringify(entry || {});
   const normalized = telegramConciergeNormalizeText(text);
   if (!tokens.length || tokens.some((token) => normalized.includes(token))) matches.push(text.replace(/[{}"\[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160));
  }
 }
 if (matches.length) return ['Rotina encontrada:', ...matches.slice(0, 4)];
 return ['Não encontrei essa rotina salva ainda.', 'No Premium, o Concierge consulta rotina, escala e Saída Inteligente quando esses dados estão configurados no app.'];
}

function telegramConciergeFreeBlockedLines() {
 return [
  'Este recurso é Premium no Concierge Telegram.',
  'No gratuito, mantive consultas básicas: /ajuda, hoje, amanhã e próxima programação.',
  'Premium libera portão/radar, saída inteligente, trânsito, diárias, salário, rotina, consulta por mês antigo e perguntas por data.',
 ];
}


function telegramConciergeWantsRegulation(text = '') {
 const clean = telegramConciergeNormalizeText(text);
 return /^\/(regulamentacao|regulamentação|regulacao|regulação|rbac|lei|jornada|repouso|descanso|sobreaviso|reserva)(@\w+)?\b/.test(clean)
  || /\b(regulamentacao|regulamentação|regulacao|regulação|rbac\s*117|lei do aeronauta|limite de jornada|limite jornada|jornada maxima|jornada máxima|descanso minimo|descanso mínimo|repouso minimo|repouso mínimo|sobreaviso|acionamento|reserva|clt|act|conformidade|irregularidade|irregularidades|alerta regulatorio|alerta regulatório)\b/.test(clean);
}

function telegramConciergeRegulationLatestItem(rosters = []) {
 return Array.isArray(rosters) && rosters.length ? rosters[0] : null;
}

function telegramConciergeRegulationCompliance(item = null) {
 const raw = item?.compliance || item?.compliance_json || null;
 if (!raw) return {};
 if (typeof raw === 'string') {
  try { return JSON.parse(raw); } catch { return {}; }
 }
 return typeof raw === 'object' ? raw : {};
}

function telegramConciergeRegulationAlerts(item = null, { premium = false } = {}) {
 const compliance = telegramConciergeRegulationCompliance(item);
 const alerts = Array.isArray(compliance.alerts) ? compliance.alerts : [];
 const filtered = alerts
  .filter((alert) => alert && /critical|error|warning|warn|grave|atenção|atencao/i.test(String(alert.severity || alert.level || alert.type || alert.title || alert.message || '')))
  .slice(0, premium ? 5 : 2)
  .map((alert) => {
   const title = alert.title || alert.rule || alert.code || 'Alerta';
   const msg = alert.message || alert.description || alert.detail || '';
   return `${title}${msg ? `: ${msg}` : ''}`.replace(/\s+/g, ' ').trim();
  });
 return filtered;
}

function telegramConciergeRegulationMonthLabel(item = null) {
 const y = Number(item?.period_year || item?.roster?.year || item?.roster_json?.year || 0);
 const m = Number(item?.period_month || item?.roster?.month || item?.roster_json?.month || 0);
 if (!y || !m) return 'escala mais recente';
 const date = new Date(Date.UTC(y, m - 1, 1));
 return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function telegramConciergeRegulationLines(rosters = [], text = '', { premium = false } = {}) {
 const clean = telegramConciergeNormalizeText(text);
 const item = telegramConciergeRegulationLatestItem(rosters);
 const label = telegramConciergeRegulationMonthLabel(item);
 const alerts = telegramConciergeRegulationAlerts(item, { premium });
 const baseFooter = premium
  ? 'No app, abra Regulamentação para calcular com horários, tipo de tripulação, acionamento, repouso e alertas da escala.'
  : 'No gratuito eu mostro o básico. Premium calcula com sua escala, alertas, diárias, salário e Concierge por voz.';
 const out = [];
 if (/sobreaviso|hsb|acionamento/.test(clean)) {
  out.push('Sobreaviso: janela normalmente entre 3h e 12h. Com acionamento, o limite passa a considerar o tempo até a apresentação e depois a jornada acionada.');
  out.push('Regra prática no CrewCheck: informe início/fim do sobreaviso, horário do acionamento e apresentação para calcular o limite e o descanso depois.');
  out.push('Se não houver acionamento, o sistema usa repouso mínimo de referência antes da próxima tarefa.');
 } else if (/reserva|airport stand|asb/.test(clean)) {
  out.push('Reserva: o CrewCheck calcula duração da reserva, acionamento e a jornada que nasce a partir dela.');
  out.push('Para operador de transporte público regular/não regular, use 3h a 6h como referência inicial; em outros enquadramentos RBAC, o limite pode chegar a 10h.');
  out.push('Se a reserva passar de 3h, o app marca atenção para acomodação adequada.');
 } else if (/repouso|descanso|folga/.test(clean)) {
  out.push('Descanso mínimo: o cálculo varia conforme a jornada anterior. O app usa faixas de 12h, 16h ou 24h conforme a duração da jornada.');
  out.push('Se a programação cruzar madrugada, virar o dia ou tiver fusos, o alerta fica mais conservador para o tripulante conferir antes de aceitar alteração.');
 } else if (/jornada|voo|vôo|pouso|perna|etapa/.test(clean)) {
  out.push('Jornada: o limite depende do tipo de tripulação, horário de apresentação, quantidade de pernas/pousos e redutor noturno.');
  out.push('Referência rápida: tripulação mínima costuma usar limite base de 9h; simples 11h; composta 14h; revezamento 18h, conforme enquadramento RBAC aplicável.');
  out.push('O CrewCheck também compara quantidade de pernas e tempo de voo quando a escala tiver esses dados.');
 } else if (/clt|act|lei|mensal|semanal|176|44/.test(clean)) {
  out.push('Duração de trabalho: o app mostra referência semanal/mensal e diferencia jornada, reserva e sobreaviso para evitar misturar métricas.');
  out.push('ACT/CCT e regras internas podem ser mais benéficas ou específicas; por isso os alertas aparecem como conferência operacional, não como decisão jurídica automática.');
 } else {
  out.push('Regulamentação disponível: limite de jornada, tempo de voo, quantidade de pernas, sobreaviso com acionamento, reserva com acionamento, repouso mínimo, folgas e alertas da escala.');
  out.push(`Estou usando a ${label} como base para os alertas do Concierge.`);
 }
 if (alerts.length) {
  out.push(premium ? `Alertas encontrados na escala: ${alerts.join(' | ')}` : `Encontrei ${alerts.length} alerta(s) na escala. Premium mostra o detalhe completo pelo Concierge.`);
 } else if (item) {
  out.push('Não encontrei alerta regulatório crítico salvo nessa escala até agora.');
 } else {
  out.push('Não encontrei escala sincronizada para aplicar os cálculos. Tente reimportar ou enviar o PDF aqui no Telegram.');
 }
 out.push(baseFooter);
 return out.filter(Boolean).slice(0, premium ? 8 : 5);
}

async function handleTelegramConciergeText(db, row, chat, text, message = {}) {
 const clean = telegramConciergeNormalizeText(text);
 const inputMode = message?._crewcheckInputMode === 'audio' ? 'audio' : 'text';
 const preferAudio = Boolean(message?._crewcheckPreferAudio);
 const user = await reloadUserById(db, row.user_id).catch(() => null);
 if (!user?.id) {
  await telegramSendMessage(chat.id, telegramPremiumMessage('concierge', 'Conta não localizada', ['Não encontrei sua conta CrewCheck vinculada a este Telegram.', 'Abra o app e conecte novamente em Configurações > Telegram.']), { reply_markup: telegramPremiumReplyMarkup('Abrir CrewCheck') });
  return { ok: false, reason: 'user not found' };
 }
 const freshRow = await telegramLinkForChat(db, chat.id).catch(() => null) || await telegramLinkForUser(db, row.user_id).catch(() => null);
 if (freshRow?.id) row = freshRow;
 const preferences = normalizeTelegramPreferences(row.preferences_json || {});
 const premium = telegramConciergeIsPremium(user);
 const reply = async (title, lines = [], options = {}) => telegramSendConciergeReply(chat.id, {
  row,
  user,
  title,
  lines,
  footer: options.footer || null,
  actionLabel: options.actionLabel || 'Abrir CrewCheck',
  preferAudio,
  inputMode,
  audioContext: options.audioContext || null,
 });
 if (preferences.concierge === false) {
  await reply('Concierge desativado', ['O atendimento está desligado nas preferências.', 'Ative em Configurações > Telegram > Concierge.'], { actionLabel: 'Abrir CrewCheck' });
  return { ok: true, skipped: true };
 }
 if (inputMode === 'audio' && preferences.conciergeVoice === false) {
  await telegramSendMessage(chat.id, telegramPremiumMessage('concierge', 'Áudio desativado', ['Seu Concierge está conectado, mas perguntas por áudio estão desligadas nas preferências.', 'Ative “Perguntas por áudio” em Configurações > Telegram ou envie a pergunta digitada.']), { reply_markup: telegramPremiumReplyMarkup('Abrir CrewCheck') });
  return { ok: true, skipped: true, voiceDisabledByPreference: true };
 }
 const isHelp = telegramConciergeIsHelp(text);
 if (!premium && !isHelp) {
  const usage = telegramConciergeFreeUsage(row, false);
  if (usage.used >= usage.limit) {
   await reply('Limite gratuito atingido', [`Você usou ${usage.used}/${usage.limit} consultas gratuitas hoje.`, 'O Premium libera perguntas ilimitadas e recursos completos: portão, saída, trânsito, diárias, rotina e voz.'], { footer: 'A escala continua disponível no app. Assine Premium para liberar o Concierge completo.', actionLabel: 'Assinar Premium' });
   return { ok: true, limited: true };
  }
 }
 const rosters = await telegramConciergeLatestRosters(db, user, 24, row);
 const usageAfter = !premium && !isHelp ? telegramConciergeFreeUsage(row, true) : telegramConciergeFreeUsage(row, false);
 if (telegramConciergeIsSupportRequest(text)) {
  await reply(premium ? 'Suporte Premium' : 'Suporte', telegramConciergeSupportLines(user, row), { actionLabel: premium ? 'Abrir suporte' : 'Conhecer Premium' });
  return { ok: true, support: true };
 }
 if (isHelp) {
  const lines = telegramConciergeIsCommandListRequest(text)
   ? telegramConciergeCommandLines(user, row)
   : [
    ...telegramConciergeCommandLines(user, row).slice(0, premium ? 9 : 6),
    premium ? `Nome atual do Concierge: ${telegramConciergeDisplayName(row, user)}. Você pode alterar em Configurações > Telegram.` : `Limite gratuito: ${usageAfter.used}/${usageAfter.limit} consultas hoje.`,
   ];
  await reply(premium ? 'Concierge Premium' : 'Concierge gratuito', lines, { actionLabel: premium ? 'Abrir CrewCheck' : 'Conhecer Premium' });
  return { ok: true, help: true };
 }
 if (telegramConciergeWantsRegulation(text)) {
  const lines = telegramConciergeRegulationLines(rosters, text, { premium });
  await reply(premium ? 'Regulamentação operacional' : 'Regulamentação básica', lines, {
   actionLabel: premium ? 'Abrir Regulamentação' : 'Conhecer Premium',
   audioContext: { kind: 'regulation', lines },
  });
  return { ok: true, intent: 'regulation' };
 }
 if (!rosters.length) {
  await reply('Escala não sincronizada', [
   'Ainda não encontrei escala salva no servidor desta conta.',
   'No app: Configurações > Telegram > Sincronizar escala. Este botão força o envio online mesmo se a escala já existir no aparelho.',
   'Alternativa: envie o PDF original da escala aqui no Telegram para eu importar direto no Concierge.',
  ], { footer: 'Sem escala no servidor, o Concierge não chuta programação.', actionLabel: 'Sincronizar escala' });
  return { ok: true, noRoster: true };
 }
 const wantsHistory = /^\/(historico|histórico|meses|escalas)/i.test(String(text || '')) || /\b(historico|histórico|escalas salvas|meses salvos|escala antiga|escalas antigas)\b/i.test(clean);
 if (wantsHistory) {
  const lines = telegramConciergeRosterHistoryLines(rosters, { premium });
  await reply(premium ? 'Histórico de escalas' : 'Histórico · gratuito', lines, { actionLabel: premium ? 'Abrir histórico' : 'Conhecer Premium', audioContext: { kind: 'history', lines } });
  return { ok: true, intent: 'history' };
 }
 const monthTarget = telegramConciergeMonthFromText(text, rosters);
 const wantsMonthOverview = Boolean(monthTarget) && (/^\/(mes|mês|escala)/i.test(String(text || '')) || /\b(mes|mês|resumo do mes|resumo do mês|escala de|escala do mes|escala do mês|escala antiga|programacao do mes|programação do mês)\b/i.test(clean));
 if (wantsMonthOverview) {
  if (!premium) {
   await reply('Consulta por mês é Premium', telegramConciergeFreeBlockedLines(), { actionLabel: 'Assinar Premium' });
   return { ok: true, premiumBlocked: true };
  }
  const item = telegramConciergeFindRosterByMonth(rosters, monthTarget);
  const lines = item ? telegramConciergeRosterOverviewLines(item, monthTarget) : [`Não encontrei escala salva para ${monthTarget.label}.`, 'Abra Histórico no app ou reimporte o PDF desse mês.'];
  await reply(`Resumo · ${monthTarget.label}`, lines, { actionLabel: 'Abrir histórico', audioContext: { kind: 'month', lines } });
  return { ok: true, intent: 'month' };
 }
 if (/^\/(salario|salário)|\b(salario|salário|financeiro|holerite|contracheque|bruto|liquido|líquido)\b/i.test(clean)) {
  if (!premium) {
   await reply('Salário é Premium', telegramConciergeFreeBlockedLines(), { actionLabel: 'Assinar Premium' });
   return { ok: true, premiumBlocked: true };
  }
  const targetMonth = monthTarget || telegramConciergeMonthFromText('mes atual', rosters);
  const item = telegramConciergeFindRosterByMonth(rosters, targetMonth) || rosters[0];
  const lines = telegramConciergeSalaryBriefLines(item, targetMonth);
  await reply('Resumo financeiro', lines, { actionLabel: 'Abrir salário', audioContext: { kind: 'salary', lines } });
  return { ok: true, intent: 'salary' };
 }
 const wantsUpcoming = telegramConciergeWantsUpcoming(text);
 if (wantsUpcoming) {
  const items = telegramConciergeUpcomingDays(rosters, { limit: premium ? 5 : 2 });
  const lines = telegramConciergeUpcomingLines(items, { free: !premium });
  await reply(premium ? 'Próximas programações' : 'Próximas programações · gratuito', lines, {
   actionLabel: premium ? 'Abrir escala' : 'Assinar Premium',
   audioContext: { kind: 'upcoming', items, audioLimit: premium ? 3 : 1 },
  });
  return { ok: true, intent: 'upcoming' };
 }
 const basicAllowed = /\b(hoje|amanha|amanhã|proximo|próximo|programacao|programação|escala)\b/.test(String(text || '').toLowerCase()) || /^\/(hoje|amanha|amanhã|proximo|próximo)/i.test(String(text || ''));
 const premiumIntent = /\b(portao|portão|terminal|radar|transito|trânsito|sair|saida|saída|casa|diaria|diária|diarias|diárias|rotina|acordar|treinar|comer|hotel|pernoite)\b/.test(clean);
 if (!premium && premiumIntent && !basicAllowed) {
  await reply('Recurso Premium', telegramConciergeFreeBlockedLines(), { footer: `Uso gratuito hoje: ${usageAfter.used}/${usageAfter.limit}.`, actionLabel: 'Assinar Premium' });
  return { ok: true, premiumBlocked: true };
 }
 if (/^\/(portao|portão)|\b(portao|portão|terminal|gate)\b/.test(clean)) {
  if (!premium) {
   await reply('Portão é Premium', telegramConciergeFreeBlockedLines(), { actionLabel: 'Assinar Premium' });
   return { ok: true, premiumBlocked: true };
  }
  const found = telegramConciergeFindFlight(rosters, text);
  const leg = found?.leg || {};
  const flight = telegramConciergeLegNumber(leg) || 'próximo voo';
  const crew = telegramConciergeCollectCrewMembers(found?.day || {}, leg);
  const lines = found ? [
   `Data da programação: ${telegramConciergeReadableDate(found.iso)}`,
   telegramConciergeLegLine(leg),
   crew.length ? `Tripulação: ${crew.slice(0, 6).join('; ')}` : '',
   leg.gate ? `Portão: ${leg.gate}` : 'Portão: ainda não disponível no radar salvo.',
   leg.terminal ? `Terminal: ${leg.terminal}` : 'Terminal: ainda não disponível no radar salvo.',
   leg.status || leg.flightStatus ? `Status: ${telegramConciergeTranslateRosterAbbreviations(leg.status || leg.flightStatus)}` : 'Status: confira o monitor do aeroporto quando estiver disponível.',
   'Evito repetir “Programado” sem mudança real.',
  ] : ['Não encontrei voo futuro na escala salva.'];
  await reply(`Portão · ${flight}`, lines, { actionLabel: 'Abrir radar', audioContext: { kind: 'gate', found, leg, crew } });
  return { ok: true, intent: 'gate' };
 }
 if (/^\/(saida|saída)|\b(sair|saida|saída|casa|transito|trânsito|rota|uber|99)\b/.test(clean)) {
  if (!premium) {
   await reply('Saída Inteligente é Premium', telegramConciergeFreeBlockedLines(), { actionLabel: 'Assinar Premium' });
   return { ok: true, premiumBlocked: true };
  }
  const found = telegramConciergeFindFlight(rosters, text);
  const leg = found?.leg || {};
  const report = telegramConciergeFormatTime(leg.dutyReport || leg.reportTime || leg.presentationTime || found?.day?.startTime || '');
  const dep = telegramConciergeFormatTime(leg.departureTime || leg.departure || leg.dep || '');
  const origin = leg.origin || leg.from || found?.day?.location || 'origem não informada';
  const crew = telegramConciergeCollectCrewMembers(found?.day || {}, leg);
  const lines = [
   found ? `Data da programação: ${telegramConciergeReadableDate(found.iso)}` : '',
   found ? telegramConciergeLegLine(leg) : 'Não encontrei voo futuro na escala salva.',
   crew.length ? `Tripulação: ${crew.slice(0, 6).join('; ')}` : '',
   report ? `Apresentação na escala: ${report}` : dep ? `Decolagem: ${dep}` : 'Horário de apresentação não localizado na escala.',
   `Origem: ${origin}`,
   'Para trânsito real, mantenha Localização ativada no app e calcule a Saída Inteligente uma vez.',
   'Não mando alerta automático sem sua preferência ativada.',
  ].filter(Boolean);
  await reply('Saída Inteligente', lines, { actionLabel: 'Calcular saída', audioContext: { kind: 'departure', found, leg, crew } });
  return { ok: true, intent: 'departure' };
 }
 if (/^\/(diarias|diárias|diaria|diária)|\b(diaria|diária|diarias|diárias|pernoite|hotel|inativo)\b/.test(clean)) {
  if (!premium) {
   await reply('Diárias é Premium', telegramConciergeFreeBlockedLines(), { actionLabel: 'Assinar Premium' });
   return { ok: true, premiumBlocked: true };
  }
  const target = telegramConciergeDateFromText(text, rosters);
  const found = telegramConciergeFindDay(rosters, target.iso);
  const lines = found ? telegramConciergeMealLines(found.day, target.iso) : [`Não encontrei programação em ${target.label}.`, 'Importe ou reprocesse a escala para recalcular as diárias.'];
  await reply(`Diárias · ${target.label}`, lines, { actionLabel: 'Abrir financeiro', audioContext: { kind: 'perdiem', target, found, lines } });
  return { ok: true, intent: 'perdiem' };
 }
 if (/^\/(rotina)|\b(rotina|acordar|treinar|academia|dormir|estudar|comer|x\b)\b/.test(clean)) {
  if (!premium) {
   await reply('Rotina é Premium', telegramConciergeFreeBlockedLines(), { actionLabel: 'Assinar Premium' });
   return { ok: true, premiumBlocked: true };
  }
  await reply('Rotina', telegramConciergeRoutineLines(rosters, text), { actionLabel: 'Abrir rotina' });
  return { ok: true, intent: 'routine' };
 }
 const asksNext = /^\/(proximo|próximo)/i.test(String(text || '')) || /\b(proximo|próximo)\b/i.test(String(text || ''));
 let target = /^\/(amanha|amanhã)/i.test(String(text || '')) ? { iso: telegramConciergeDatePlus(1), label: 'amanhã' } : telegramConciergeDateFromText(text, rosters);
 let found = telegramConciergeFindDay(rosters, target.iso);
 let title = `Programação · ${target.label}`;
 if (asksNext && !/\b(hoje|amanha|amanhã|dia\s+\d{1,2}|\d{1,2}[\/\-.]\d{1,2})\b/i.test(String(text || ''))) {
  const next = telegramConciergeUpcomingDays(rosters, { limit: 1 })[0] || null;
  if (next) {
   found = next;
   target = { iso: next.iso, label: 'próxima' };
   title = 'Próxima programação';
  }
 }
 const lines = found ? telegramConciergeDayLines(found.day, found.iso || target.iso) : [`Não encontrei programação para ${target.label}.`, 'A escala salva pode não conter essa data ou precisa ser reimportada.'];
 if (!premium) lines.push(`Uso gratuito hoje: ${usageAfter.used}/${usageAfter.limit}.`);
 await reply(title, lines, { actionLabel: 'Abrir CrewCheck', audioContext: found ? { kind: asksNext ? 'next' : 'day', day: found.day, iso: found.iso || target.iso, label: target.label, found, roster: found.roster } : null });
 return { ok: true, intent: 'schedule' };
}


async function handleTelegramConciergeAudio(db, row, chat, message = {}) {
 const audio = telegramMessageAudioDocument(message);
 if (!audio?.file_id) return { ok: false, ignored: true };
 const user = await reloadUserById(db, row.user_id).catch(() => null);
 const preferences = normalizeTelegramPreferences(row.preferences_json || {});
 const premium = telegramConciergeIsPremium(user);
 if (!TELEGRAM_CONCIERGE_VOICE_ENABLED || preferences.conciergeVoice === false) {
  await telegramSendDirectText(chat.id, 'Áudio desativado no Concierge. Ative em Configurações > Telegram ou envie por texto.');
  return { ok: true, voiceDisabled: true };
 }
 if (TELEGRAM_CONCIERGE_VOICE_PREMIUM_ONLY && !premium) {
  await telegramSendDirectText(chat.id, 'Voz no Telegram é Premium. No gratuito, envie por texto ou use /hoje, /amanha e /proximo.');
  return { ok: true, premiumBlocked: true };
 }
 if (audio.duration && audio.duration > TELEGRAM_CONCIERGE_AUDIO_MAX_SECONDS) {
  await telegramSendDirectText(chat.id, `Áudio muito longo. Envie perguntas de até ${TELEGRAM_CONCIERGE_AUDIO_MAX_SECONDS} segundos ou mande por texto.`);
  return { ok: true, audioTooLong: true };
 }
 if (!telegramSpeechHasProvider('stt')) {
  await telegramSendDirectText(chat.id, 'Voz não configurada no servidor. Código: CONCIERGE_STT_NOT_CONFIGURED. Configure ELEVENLABS_API_KEY, AZURE_SPEECH_KEY ou OPENAI_API_KEY no Render.');
  return { ok: false, speechNotConfigured: true };
 }
 try {
  await telegramApi('sendChatAction', { chat_id: String(chat.id), action: 'typing' }).catch(() => null);
  const file = await telegramDownloadFileObject(audio.file_id, 25 * 1024 * 1024);
  const transcript = await transcribeTelegramAudio(file.buffer, { filename: audio.filename, mimeType: audio.mimeType });
  await telegramApi('sendChatAction', { chat_id: String(chat.id), action: 'upload_voice' }).catch(() => null);
  return await handleTelegramConciergeText(db, row, chat, transcript, { ...message, _crewcheckInputMode: 'audio', _crewcheckPreferAudio: true, _crewcheckTranscript: transcript });
 } catch (error) {
  const publicAudioError = classifySpeechAudioError(error);
  console.warn('[telegram] falha ao processar áudio do Concierge', publicAudioError.kind, publicAudioError.log);
  await telegramSendDirectText(chat.id, telegramConciergeSupportErrorText({ ...error, kind: publicAudioError.kind, message: publicAudioError.log || error?.message }, 'CONCIERGE_STT')).catch(() => null);
  return { ok: false, audioError: publicAudioError.kind };
 }
}

function telegramExtractStartCode(text = '') {
 const raw = String(text || '').trim();
 const match = raw.match(/^\/(?:start|connect)(?:@\w+)?\s+([A-Za-z0-9_-]{4,32})/i) || raw.match(/^([A-Za-z0-9_-]{6,12})$/);
 return match ? String(match[1]).trim().toUpperCase() : '';
}

async function handleTelegramWebhookUpdate(update) {
 const message = update?.message || update?.edited_message || update?.channel_post || null;
 if (!message?.chat?.id) return { ok: true, ignored: true };
 const chat = message.chat;
 const text = String(message.text || '').trim();
 const db = getPool();
 if (!db) {
  await telegramSendMessage(chat.id, telegramPremiumMessage('default', 'CrewCheck · conexão indisponível', ['Não foi possível concluir a conexão agora porque o banco de dados não respondeu.', 'Tente novamente em alguns instantes pelo botão Conectar Telegram.'], { footer: 'Se persistir, verifique o deploy e o banco no Render.' }), { reply_markup: telegramPremiumReplyMarkup('Abrir CrewCheck') });
  return { ok: false, message: 'database unavailable' };
 }
 await ensureSchema();
 const code = telegramExtractStartCode(text);
 const chatUsername = normalizeTelegramUsername(chat.username || message.from?.username || '');
 const pdfDocument = telegramMessagePdfDocument(message);
 let row = await telegramLinkForChat(db, chat.id);
 if (code) {
  const result = await db.query('select * from crewcheck_telegram_links where upper(connect_code) = $1 limit 1', [code]);
  row = result.rows[0] || row || null;
 } else if (!row && chatUsername) {
  const result = await db.query('select * from crewcheck_telegram_links where lower(expected_username) = $1 and (chat_id is null or is_active = false) order by updated_at desc limit 1', [chatUsername]).catch(() => ({ rows: [] }));
  row = result.rows?.[0] || null;
 }
 if (pdfDocument && row?.is_active && row?.chat_id) {
  try { return await importTelegramPdfRoster(db, row, message, pdfDocument); }
  catch (error) {
   await telegramSendMessage(chat.id, telegramPremiumMessage('roster', 'Não consegui importar este PDF', [sanitizePublicError(error?.message || String(error)), 'Confira se é o PDF original da escala e tente reenviar.', 'Se persistir, use o upload manual no app para diagnóstico.'], { footer: 'Nenhuma escala foi alterada quando a leitura falha.' }), { reply_markup: telegramPremiumReplyMarkup('Abrir CrewCheck') }).catch(() => null);
   return { ok: false, error: sanitizePublicError(error?.message || String(error)) };
  }
 }
 if (!row) {
  const suffix = chatUsername ? ` Não encontrei cadastro pendente para @${chatUsername}.` : '';
  const extra = pdfDocument ? 'Recebi um PDF, mas ainda não sei em qual conta CrewCheck salvar. ' : '';
  await telegramSendMessage(chat.id, telegramPremiumMessage('default', 'CrewCheck Bot ativo', [`${extra}${suffix ? suffix.trim() : 'Seu bot está pronto para conexão.'}`, 'Para concluir, informe seu @Telegram no CrewCheck e toque em Conectar Telegram.', 'Depois você poderá enviar sua escala em PDF diretamente aqui.'], { footer: 'Você receberá apenas os alertas ativados nas suas preferências.' }), { reply_markup: telegramPremiumReplyMarkup('Abrir CrewCheck') });
  return { ok: true, waitingForConnection: true };
 }
 if (pdfDocument && !row?.is_active) {
  await telegramSendMessage(chat.id, telegramPremiumMessage('roster', 'Conexão pendente', ['Sua conta foi localizada, mas o Telegram ainda não está conectado.', 'Toque em Iniciar/Conectar uma vez e depois reenviar o PDF.', 'Assim o CrewCheck salva a escala automaticamente na sua conta.'], { footer: 'O vínculo protege seus dados e evita salvar escala na conta errada.' }), { reply_markup: telegramPremiumReplyMarkup('Abrir CrewCheck') });
 }
 const wasTelegramActive = Boolean(row?.is_active && row?.chat_id);
 if ((message.voice || message.audio) && row?.is_active) {
  return await handleTelegramConciergeAudio(db, row, chat, message);
 }
 if (text && !code && !pdfDocument && row?.is_active) {
  return await handleTelegramConciergeText(db, row, chat, text, message);
 }
 await db.query(
  `update crewcheck_telegram_links
    set chat_id = $1,
        chat_username = $2,
        expected_username = coalesce($2, expected_username),
        chat_first_name = $3,
        chat_last_name = $4,
        is_active = true,
        connected_at = now(),
        last_message_at = now(),
        updated_at = now()
   where id = $5`,
  [String(chat.id), chat.username || null, chat.first_name || null, chat.last_name || null, row.id],
 );
 const connectedUser = await reloadUserById(db, row.user_id).catch(() => null);
 const connectedRow = await telegramLinkForUser(db, row.user_id).catch(() => null) || row;
 if (!wasTelegramActive) {
  await telegramSendMessage(chat.id, telegramPremiumMessage('concierge', 'Boas-vindas ao Concierge', telegramConciergeWelcomeLines(connectedUser, connectedRow), { footer: 'Canal conectado. As respostas ajudam na rotina, mas a escala publicada segue sendo a referência oficial.', conciergeName: telegramConciergeDisplayName(connectedRow, connectedUser) }), { reply_markup: telegramPremiumReplyMarkup('Abrir CrewCheck') });
 } else {
  await telegramSendMessage(chat.id, telegramPremiumMessage('default', 'Telegram conectado com sucesso', ['Seu CrewCheck Bot está ativo.', 'A partir de agora, você pode perguntar por texto ou áudio sobre programação, portão, saída, diárias e rotina.', telegramConciergeIsPremium(connectedUser) ? 'Suporte Premium: mande /suporte quando precisar.' : 'No gratuito, mande /comandos para ver o que está liberado.'], { footer: 'Você controla alertas e Concierge em Configurações > Telegram.' }), { reply_markup: telegramPremiumReplyMarkup('Abrir CrewCheck') });
 }
 return { ok: true, connected: true, firstConnection: !wasTelegramActive, userId: row.user_id };
}

async function handleApi(req, res, url) {

 if (url.pathname === '/api/webhooks/asaas' && req.method === 'POST') {
  const db = requireDatabase(res);
  if (!db) return true;
  try {
   await ensureSchema();
   const access = validateAsaasWebhookAccess(req, url);
   if (!access.ok) {
    await db.query('insert into crewcheck_audit_logs (id, user_id, action, metadata) values ($1, $2, $3, $4::jsonb)', [newId(), null, 'billing.asaas_webhook.rejected', JSON.stringify({ mode: access.mode, receivedToken: access.received, sandboxMode: access.sandboxMode, configuredTokenCount: ASAAS_WEBHOOK_TOKENS.length, at: new Date().toISOString() })]).catch(() => null);
    sendJson(res, 401, {
     ok: false,
     code: 'ASAAS_WEBHOOK_UNAUTHORIZED',
     message: access.received
      ? 'Webhook Asaas não autorizado: token recebido não confere com o token configurado no CrewCheck.'
      : 'Webhook Asaas não autorizado: configure no Asaas o mesmo token salvo em ASAAS_WEBHOOK_TOKEN no Render.',
     expectedHeader: 'asaas-access-token',
    });
    return true;
   }
   const body = await readJsonBody(req, 1024 * 1024);
   const eventType = String(body.event || body.type || '').trim();
   const payment = body.payment || body.data || body || {};
   const user = await findBillingUserForAsaasEvent(db, payment);
   const subscriptionId = payment.subscription || payment.subscriptionId || null;
   const paymentId = payment.id || payment.paymentId || null;
   const status = payment.status || eventType || null;
   await saveBillingEvent(db, { userId: user?.id || null, providerEventId: body.id || null, eventType, subscriptionId, paymentId, status, payload: { ...body, crewcheckWebhookAuth: { mode: access.mode, tokenConfigured: access.configured, tokenReceived: access.received } } });
   if (user && hasLifetimePremiumAccess(user)) {
    await ensureLifetimeBillingState(db, user);
   } else if (user) {
    const paidEvents = new Set(['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED', 'PAYMENT_APPROVED']);
    const overdueEvents = new Set(['PAYMENT_OVERDUE']);
    const cancelEvents = new Set(['PAYMENT_DELETED', 'PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED', 'PAYMENT_CHARGEBACK_DISPUTE']);
    if (paidEvents.has(eventType) || ['RECEIVED', 'CONFIRMED'].includes(String(payment.status || '').toUpperCase())) {
     await activatePaidSubscription(db, user, user.subscription_plan || 'premium_monthly', subscriptionId, 'active');
    } else if (overdueEvents.has(eventType)) {
     await db.query('update crewcheck_users set subscription_status = $1, updated_at = now() where id = $2', ['past_due', user.id]);
    } else if (cancelEvents.has(eventType)) {
     await db.query('update crewcheck_users set subscription_status = $1, updated_at = now() where id = $2', ['canceled', user.id]);
    }
   }
   sendJson(res, 200, { ok: true, received: true });
  } catch (error) {
   sendJson(res, 500, { ok: false, message: 'Falha ao processar webhook Asaas.', detail: error.message, code: error.code });
  }
  return true;
 }

 if (url.pathname === '/api/billing/status' && req.method === 'GET') {
  const user = await requireAuth(req, res);
  if (!user) return true;
  const db = getPool();
  const effectiveUser = db ? await ensureLifetimeBillingState(db, user) : user;
  sendJson(res, 200, billingStatusFromUser(effectiveUser));
  return true;
 }

 if (url.pathname === '/api/billing/health' && req.method === 'GET') {
  const user = await requireAuth(req, res);
  if (!user) return true;
  if (!isC32FAdminEmail(user.email) && String(user.role || '').toLowerCase() !== 'admin') {
   sendJson(res, 403, { ok: false, message: 'Diagnóstico de cobrança restrito ao administrador.' });
   return true;
  }
  const health = await checkAsaasBillingHealth();
  sendJson(res, 200, health);
  return true;
 }

 if (url.pathname === '/api/app-links' && req.method === 'GET') {
  sendJson(res, 200, {
   ok: true,
   androidPlayUrl: CREWCHECK_ANDROID_PLAY_URL,
   androidApkUrl: CREWCHECK_ANDROID_APK_URL,
   watchUrl: `${PUBLIC_APP_URL}/w`,
   appleWatchUrl: `${PUBLIC_APP_URL}/aw`,
   samsungWatchUrl: `${PUBLIC_APP_URL}/w`,
   updatedAt: new Date().toISOString(),
  });
  return true;
 }


 if (url.pathname === '/api/webhooks/telegram' && req.method === 'POST') {
  try {
   if (TELEGRAM_WEBHOOK_SECRET) {
    const received = String(req.headers['x-telegram-bot-api-secret-token'] || url.searchParams.get('secret') || '').trim();
    if (received !== TELEGRAM_WEBHOOK_SECRET) {
     sendJson(res, 401, { ok: false, code: 'TELEGRAM_WEBHOOK_UNAUTHORIZED' });
     return true;
    }
   }
   if (!telegramIsConfigured()) {
    sendJson(res, 200, { ok: false, code: 'TELEGRAM_NOT_CONFIGURED' });
    return true;
   }
   const update = await readJsonBody(req, 512 * 1024);
   const result = await handleTelegramWebhookUpdate(update);
   sendJson(res, 200, { ok: true, result });
  } catch (error) {
   sendJson(res, 200, { ok: false, message: 'Falha ao processar webhook Telegram.', detail: sanitizePublicError(error?.message || String(error)) });
  }
  return true;
 }

 if (url.pathname === '/api/telegram/roster-sync' && req.method === 'POST') {
  const user = await requireAuth(req, res);
  if (!user) return true;
  const db = requireDatabase(res);
  if (!db) return true;
  try {
   await ensureSchema();
   const body = await readJsonBody(req, 20 * 1024 * 1024);
   const roster = body.roster;
   if (!roster || !Array.isArray(roster.days)) {
    sendJson(res, 400, { ok: false, message: 'Envie uma escala válida para sincronizar com o Concierge.' });
    return true;
   }
   const compliance = body.compliance || null;
   const gym = Array.isArray(body.gym) ? body.gym : [];
   const sourceFileName = body.sourceFileName || 'Escala CrewCheck sincronizada';
   const saved = await saveRosterForUser(db, user, { roster, compliance, gym, sourceFileName, importSource: 'telegram_roster_sync' });
   const row = await ensureTelegramLinkForUser(db, user).catch(() => null);
   const snapshot = await storeTelegramRosterSnapshotForUser(db, user, { roster, compliance, gym, sourceFileName, checksum: saved?.row?.checksum || null }).catch(() => null);
   const bot = await telegramBotIdentity().catch(() => null);
   const updated = await telegramLinkForUser(db, user.id).catch(() => row);
   const status = telegramPublicStatusFromRow(updated, bot);
   const synced = await telegramConciergeLatestRosters(db, user, 1, updated).catch(() => []);
   status.syncedRoster = synced[0] ? { available: true, updatedAt: synced[0].updated_at || synced[0].created_at || snapshot?.updatedAt || null, periodYear: synced[0].period_year || synced[0].roster?.year || null, periodMonth: synced[0].period_month || synced[0].roster?.month || null } : { available: Boolean(snapshot), updatedAt: snapshot?.updatedAt || null, periodYear: snapshot?.periodYear || null, periodMonth: snapshot?.periodMonth || null };
   sendJson(res, 200, { ok: true, roster: summarizeRosterRow(saved.row), status, syncedRoster: status.syncedRoster });
  } catch (error) {
   sendJson(res, error.statusCode || 500, { ok: false, message: sanitizePublicError(error?.message || String(error)), detail: error?.code || null });
  }
  return true;
 }

 if (url.pathname === '/api/telegram/status' && req.method === 'GET') {
  const user = await requireAuth(req, res);
  if (!user) return true;
  const db = getPool();
  try {
   if (!telegramIsConfigured()) {
    sendJson(res, 200, { ok: true, configured: false, connected: false, message: 'Configure TELEGRAM_BOT_TOKEN no Render para ativar o Telegram.' });
    return true;
   }
   if (!db || !user.id) {
    sendJson(res, 200, { ok: true, configured: telegramIsConfigured(), connected: false, message: 'Banco de dados necessário para vincular Telegram.' });
    return true;
   }
   await ensureSchema();
   const bot = await telegramBotIdentity().catch(() => null);
   const row = await telegramLinkForUser(db, user.id);
   const status = telegramPublicStatusFromRow(row, bot);
   const synced = row?.is_active ? await telegramConciergeLatestRosters(db, user, 1, row).catch(() => []) : [];
   status.syncedRoster = synced[0] ? { available: true, updatedAt: synced[0].updated_at || synced[0].created_at || null, periodYear: synced[0].period_year || synced[0].roster?.year || null, periodMonth: synced[0].period_month || synced[0].roster?.month || null } : { available: false };
   sendJson(res, 200, status);
  } catch (error) {
   sendJson(res, 200, { ok: false, configured: telegramIsConfigured(), connected: false, message: sanitizePublicError(error?.message || String(error)) });
  }
  return true;
 }

 if (url.pathname === '/api/telegram/connect' && req.method === 'POST') {
  const user = await requireAuth(req, res);
  if (!user) return true;
  const db = requireDatabase(res);
  if (!db) return true;
  try {
   await ensureSchema();
   if (!telegramIsConfigured()) {
    sendJson(res, 503, { ok: false, configured: false, message: 'Configure TELEGRAM_BOT_TOKEN no Render antes de conectar o Telegram.' });
    return true;
   }
   const body = await readJsonBody(req, 64 * 1024).catch(() => ({}));
   const telegramUsernameRaw = String(body.telegramUsername || body.telegram_username || body.username || '').trim();
   const telegramUsername = normalizeTelegramUsername(telegramUsernameRaw);
   if (hasTelegramUsernameInput(telegramUsernameRaw) && !isValidTelegramUsername(telegramUsername)) {
    sendJson(res, 400, { ok: false, message: 'Informe um usuário do Telegram válido. Use somente letras, números ou underline; o @ já é automático.' });
    return true;
   }
   const bot = await telegramBotIdentity();
   const row = await ensureTelegramLinkForUser(db, user, telegramUsername);
   sendJson(res, 200, telegramPublicStatusFromRow(row, bot));
  } catch (error) {
   sendJson(res, error.statusCode || 500, { ok: false, configured: telegramIsConfigured(), message: sanitizePublicError(error?.message || String(error)) });
  }
  return true;
 }

 if (url.pathname === '/api/telegram/preferences' && req.method === 'POST') {
  const user = await requireAuth(req, res);
  if (!user) return true;
  const db = requireDatabase(res);
  if (!db) return true;
  try {
   await ensureSchema();
   const body = await readJsonBody(req, 64 * 1024);
   const row = await ensureTelegramLinkForUser(db, user);
   const preferences = normalizeTelegramPreferences(body.preferences || body || {});
   if (!telegramConciergeIsPremium(user) && !isBillingAdmin(user)) preferences.conciergeName = TELEGRAM_DEFAULT_CONCIERGE_NAME;
   await db.query('update crewcheck_telegram_links set preferences_json = $1::jsonb, updated_at = now() where id = $2', [JSON.stringify(preferences), row.id]);
   const bot = await telegramBotIdentity().catch(() => null);
   const updated = await telegramLinkForUser(db, user.id);
   sendJson(res, 200, telegramPublicStatusFromRow(updated, bot));
  } catch (error) {
   sendJson(res, 500, { ok: false, message: sanitizePublicError(error?.message || String(error)) });
  }
  return true;
 }

 if (url.pathname === '/api/telegram/share' && req.method === 'POST') {
  const user = await requireAuth(req, res);
  if (!user) return true;
  const db = requireDatabase(res);
  if (!db) return true;
  try {
   await ensureSchema();
   const body = await readJsonBody(req);
   const rawTitle = String(body.title || 'CrewCheck · Exportação').trim().slice(0, 120);
   const rawContent = String(body.content || body.message || '').replace(/\s+/g, ' ').trim().slice(0, 900);
   const kind = String(body.kind || 'summary').toLowerCase();
   const lines = [
    kind === 'pdf' ? 'PDF premium gerado no dispositivo.' : kind === 'ics' ? 'Calendário ICS gerado no dispositivo.' : kind === 'financial' ? 'Resumo financeiro preparado para conferência.' : 'Resumo exportado pelo CrewCheck.',
    rawContent || 'Exportação solicitada pelo app.',
   ];
   const sent = await notifyTelegramForUser(db, user.id, 'dailySummary', rawTitle, lines);
   if (!sent?.ok) {
    sendJson(res, 409, { ok: false, message: sent?.reason || 'Telegram não conectado ou categoria silenciada.' });
    return true;
   }
   sendJson(res, 200, { ok: true, message: 'Exportação enviada pelo Telegram.' });
  } catch (error) {
   sendJson(res, error.statusCode || 500, { ok: false, message: sanitizePublicError(error?.message || String(error)) });
  }
  return true;
 }

 if (url.pathname === '/api/telegram/test' && req.method === 'POST') {
  const user = await requireAuth(req, res);
  if (!user) return true;
  const db = requireDatabase(res);
  if (!db) return true;
  try {
   await ensureSchema();
   const row = await telegramLinkForUser(db, user.id);
   if (!row?.is_active || !row?.chat_id) {
    sendJson(res, 409, { ok: false, message: 'Telegram ainda não conectado. Conecte pelo botão primeiro.' });
    return true;
   }
   await notifyTelegramForUser(db, user.id, 'smartDeparture', 'CrewCheck · Telegram Premium ativo', ['Teste enviado com sucesso.', 'Seu canal está pronto para receber alertas importantes da Saída Inteligente, escala e radar.', 'Você pode ajustar as preferências quando quiser no app.']);
   sendJson(res, 200, { ok: true, message: 'Mensagem de teste enviada.' });
  } catch (error) {
   sendJson(res, error.statusCode || 500, { ok: false, message: sanitizePublicError(error?.message || String(error)) });
  }
  return true;
 }

 if (url.pathname === '/api/admin/telegram-health' && req.method === 'GET') {
  const user = await requireAuth(req, res);
  if (!user) return true;
  if (!isC32FAdminEmail(user.email) && String(user.role || '').toLowerCase() !== 'admin') {
   sendJson(res, 403, { ok: false, message: 'Acesso restrito ao administrador.' });
   return true;
  }
  try {
   const bot = telegramIsConfigured() ? await telegramBotIdentity().catch((error) => ({ ok: false, error: sanitizePublicError(error?.message || String(error)) })) : null;
   const webhook = telegramIsConfigured() ? await telegramApi('getWebhookInfo').catch((error) => ({ ok: false, error: sanitizePublicError(error?.message || String(error)) })) : null;
   sendJson(res, 200, { ok: true, configured: telegramIsConfigured(), bot, webhook, publicUrl: PUBLIC_APP_URL, webhookUrl: `${PUBLIC_APP_URL}/api/webhooks/telegram` });
  } catch (error) {
   sendJson(res, 200, { ok: false, configured: telegramIsConfigured(), message: sanitizePublicError(error?.message || String(error)) });
  }
  return true;
 }

 if (url.pathname === '/api/admin/telegram-setup-webhook' && req.method === 'POST') {
  const user = await requireAuth(req, res);
  if (!user) return true;
  if (!isC32FAdminEmail(user.email) && String(user.role || '').toLowerCase() !== 'admin') {
   sendJson(res, 403, { ok: false, message: 'Acesso restrito ao administrador.' });
   return true;
  }
  try {
   if (!telegramIsConfigured()) {
    sendJson(res, 503, { ok: false, configured: false, message: 'Configure TELEGRAM_BOT_TOKEN no Render.' });
    return true;
   }
   const body = await readJsonBody(req, 64 * 1024).catch(() => ({}));
   const webhookUrl = String(body.url || `${PUBLIC_APP_URL}/api/webhooks/telegram`).trim();
   const payload = { url: webhookUrl, allowed_updates: ['message', 'edited_message'] };
   if (TELEGRAM_WEBHOOK_SECRET) payload.secret_token = TELEGRAM_WEBHOOK_SECRET;
   const result = await telegramApi('setWebhook', payload);
   sendJson(res, 200, { ok: true, result, webhookUrl });
  } catch (error) {
   sendJson(res, error.statusCode || 500, { ok: false, message: sanitizePublicError(error?.message || String(error)) });
  }
  return true;
 }

 if (url.pathname === '/api/billing/start-trial' && req.method === 'POST') {
  const user = await requireAuth(req, res);
  if (!user) return true;
  const db = requireDatabase(res);
  if (!db) return true;
  if (!requireAsaasConfigured(res)) return true;
  let trialIdentity = null;
  try {
   await ensureSchema();
   if (hasLifetimePremiumAccess(user)) {
    const effectiveUser = await ensureLifetimeBillingState(db, user);
    sendJson(res, 200, { ...billingStatusFromUser(effectiveUser), message: 'Esta conta já possui Premium Unlimited. Não é necessário iniciar teste grátis.' });
    return true;
   }
   if (isBillingAdmin(user)) {
    sendJson(res, 200, billingStatusFromUser(user));
    return true;
   }
   const body = await readJsonBody(req, 128 * 1024);
   const safetyNoticeVersion = String(body.safetyNoticeVersion || 'premium-safety-notice-v1-short-2026-06-20').trim();
   const acknowledgedSafetyNotice = body.acknowledgedSafetyNotice === true || body.acknowledgedSafetyNotice === 'true';
   if (!acknowledgedSafetyNotice) {
    sendJson(res, 400, { ok: false, code: 'SAFETY_NOTICE_REQUIRED', message: 'Leia e confirme o aviso de uso auxiliar do CrewCheck antes de iniciar o teste.' });
    return true;
   }
   const current = billingStatusFromUser(user);
   if (!current.trialEligible) {
    sendJson(res, 409, { ok: false, message: 'O teste premium gratuito já foi usado ou há uma assinatura ativa nesta conta.' });
    return true;
   }
   const cpfCnpj = validateBillingCpf(body.cpfCnpj || body.cpf || body.taxId || user.billing_tax_id);
   await db.query('update crewcheck_users set billing_tax_id = $1, updated_at = now() where id = $2', [cpfCnpj, user.id]).catch(() => null);
   trialIdentity = await latestRosterIdentityForTrial(db, user);
   await reserveTrialIdentityOrThrow(db, user, trialIdentity);
   const plan = getBillingPlan('premium_monthly');
   const customerId = await ensureAsaasCustomer(db, { ...user, billing_tax_id: cpfCnpj }, cpfCnpj);
   const billingType = normalizeAsaasSubscriptionBillingType(body.billingType, 'UNDEFINED');
   const nowIso = new Date().toISOString();
   const expiresAt = addDaysIso(BILLING_TRIAL_DAYS);
   const firstDueDate = formatAsaasDueDate(new Date(Date.now() + BILLING_TRIAL_DAYS * 24 * 60 * 60 * 1000));
   const subscriptionDescription = `CrewCheck Premium mensal - teste grátis de ${BILLING_TRIAL_DAYS} dias; primeira cobrança em ${firstDueDate}`;
   const subscription = await asaasRequest('/subscriptions', {
    method: 'POST',
    body: {
     customer: customerId,
     billingType,
     nextDueDate: firstDueDate,
     value: Number(plan.value.toFixed(2)),
     cycle: plan.cycle,
     description: subscriptionDescription,
     externalReference: `crewcheck:${user.id}:premium_trial:${Date.now()}`,
    },
   });
   if (!subscription?.id) throw new Error('Asaas não retornou o ID da assinatura do teste grátis.');
   await db.query(
    `update crewcheck_users
      set subscription_plan = 'premium_monthly', subscription_status = 'trialing', billing_cycle = $1,
        trial_started_at = $2, trial_expires_at = $3, premium_expires_at = $3, trial_identity_hash = $4,
        asaas_customer_id = $5, asaas_subscription_id = $6, billing_cancel_at_period_end = false,
        updated_at = now()
     where id = $7`,
    [plan.cycle, nowIso, expiresAt, trialIdentity.hash, customerId, subscription.id, user.id],
   );
   const payments = await asaasRequest(`/subscriptions/${encodeURIComponent(subscription.id)}/payments`, { query: { limit: 5 } }).catch(() => null);
   const checkoutUrl = firstCheckoutUrlFromPayments(payments) || subscription.invoiceUrl || subscription.paymentLink || null;
   const payment = await buildPublicBillingPaymentInfo(firstPaymentFromAsaasPayload(payments), checkoutUrl);
   await db.query('insert into crewcheck_audit_logs (id, user_id, action, metadata) values ($1, $2, $3, $4::jsonb)', [newId(), user.id, 'billing.trial.subscription_created', JSON.stringify({ trialDays: BILLING_TRIAL_DAYS, expiresAt, firstDueDate, trialIdentity, subscriptionId: subscription.id, customerId, checkoutUrl: Boolean(checkoutUrl), pixReady: Boolean(payment?.pixQrCode?.payload || payment?.pixQrCode?.encodedImage), cpfMasked: maskBrazilianTaxId(cpfCnpj), safetyNotice: { acknowledged: true, version: safetyNoticeVersion, acknowledgedAt: new Date().toISOString() } })]).catch(() => null);
   const refreshed = await reloadUserById(db, user.id);
   sendJson(res, 200, { ...billingStatusFromUser(refreshed), checkoutUrl, payment, trialCreated: true, firstDueDate, message: `Teste Premium liberado por ${BILLING_TRIAL_DAYS} dias. A primeira cobrança está programada para ${firstDueDate}.` });
  } catch (error) {
   if (trialIdentity?.hash) {
    await db.query('delete from crewcheck_trial_locks where identity_hash = $1 and user_id = $2', [trialIdentity.hash, user.id]).catch(() => null);
   }
   sendJson(res, error.statusCode || 500, publicBillingErrorPayload(error, 'Não foi possível iniciar o teste grátis agora.'));
  }
  return true;
 }

 if ((url.pathname === '/api/billing/regularize-trial' || url.pathname === '/api/billing/regularize-trial-as-subscription') && req.method === 'POST') {
  const user = await requireAuth(req, res);
  if (!user) return true;
  const db = requireDatabase(res);
  if (!db) return true;
  if (!requireAsaasConfigured(res)) return true;
  try {
   await ensureSchema();
   if (hasLifetimePremiumAccess(user) || isBillingAdmin(user)) {
    sendJson(res, 200, { ...billingStatusFromUser(user), message: 'Esta conta não precisa regularizar assinatura.' });
    return true;
   }
   if (user.asaas_subscription_id) {
    sendJson(res, 200, { ...billingStatusFromUser(user), message: 'Esta conta já possui assinatura ativa.' });
    return true;
   }
   if (!billingNeedsAsaasRegularization(user)) {
    sendJson(res, 409, { ok: false, code: 'REGULARIZATION_NOT_REQUIRED', message: 'Esta conta não precisa de regularização. Use Teste grátis ou Assinar Premium.' });
    return true;
   }
   const body = await readJsonBody(req, 128 * 1024);
   const safetyNoticeVersion = String(body.safetyNoticeVersion || 'premium-safety-notice-v1-short-2026-06-20').trim();
   const acknowledgedSafetyNotice = body.acknowledgedSafetyNotice === true || body.acknowledgedSafetyNotice === 'true';
   if (!acknowledgedSafetyNotice) {
    sendJson(res, 400, { ok: false, code: 'SAFETY_NOTICE_REQUIRED', message: 'Leia e confirme o aviso de uso auxiliar do CrewCheck antes de regularizar a assinatura.' });
    return true;
   }
   const cpfCnpj = validateBillingCpf(body.cpfCnpj || body.cpf || body.taxId || user.billing_tax_id);
   const result = await createTrialAsaasSubscriptionForExistingUser(db, user, { cpfCnpj, safetyNoticeVersion, source: 'user_regularization' });
   const payment = await buildPublicBillingPaymentInfo(firstPaymentFromAsaasPayload(result.payments), result.checkoutUrl);
   sendJson(res, 200, { ...billingStatusFromUser(result.user), checkoutUrl: result.checkoutUrl, payment, trialCreated: true, firstDueDate: result.firstDueDate, regularized: true, message: result.remainingDays > 0 ? `Assinatura regularizada. A primeira cobrança ficou programada para ${result.firstDueDate}.` : 'Assinatura regularizada. Use o Pix ou pagamento seguro para manter o Premium ativo.' });
  } catch (error) {
   sendJson(res, error.statusCode || 500, publicBillingErrorPayload(error, 'Não foi possível regularizar a assinatura agora.'));
  }
  return true;
 }

 if (url.pathname === '/api/billing/checkout' && req.method === 'POST') {
  const user = await requireAuth(req, res);
  if (!user) return true;
  const db = requireDatabase(res);
  if (!db) return true;
  if (!requireAsaasConfigured(res)) return true;
  try {
   await ensureSchema();
   if (hasLifetimePremiumAccess(user)) {
    const effectiveUser = await ensureLifetimeBillingState(db, user);
    sendJson(res, 200, { ok: true, plan: BILLING_PLAN_DEFINITIONS.premium_lifetime, checkoutUrl: null, billing: billingStatusFromUser(effectiveUser), message: 'Esta conta possui Premium Unlimited. Nenhuma cobrança será criada.' });
    return true;
   }
   const body = await readJsonBody(req, 128 * 1024);
   const safetyNoticeVersion = String(body.safetyNoticeVersion || 'premium-safety-notice-v1-short-2026-06-20').trim();
   const acknowledgedSafetyNotice = body.acknowledgedSafetyNotice === true || body.acknowledgedSafetyNotice === 'true';
   if (!acknowledgedSafetyNotice) {
    sendJson(res, 400, { ok: false, code: 'SAFETY_NOTICE_REQUIRED', message: 'Leia e confirme o aviso de uso auxiliar do CrewCheck antes de assinar.' });
    return true;
   }
   const planId = String(body.planId || '').trim();
   const plan = getBillingPlan(planId);
   if (!['premium_monthly', 'premium_annual'].includes(plan.id)) {
    sendJson(res, 400, { ok: false, message: 'Escolha um plano premium válido.' });
    return true;
   }
   const cpfCnpj = validateBillingCpf(body.cpfCnpj || body.cpf || body.taxId || user.billing_tax_id);
   await db.query('update crewcheck_users set billing_tax_id = $1, updated_at = now() where id = $2', [cpfCnpj, user.id]).catch(() => null);
   const customerId = await ensureAsaasCustomer(db, { ...user, billing_tax_id: cpfCnpj }, cpfCnpj);
   const billingType = normalizeAsaasSubscriptionBillingType(body.billingType, 'UNDEFINED');
   const promoMeta = plan.id === 'premium_monthly' && BILLING_PROMO_ACTIVE
    ? { type: 'launch_monthly', promoMonths: BILLING_MONTHLY_PROMO_MONTHS, promoEndsAt: BILLING_LAUNCH_PROMO_END_DATE, contractedAt: new Date().toISOString(), promotionalValue: BILLING_MONTHLY_PROMO_VALUE, regularValueAfterPromo: BILLING_MONTHLY_ORIGINAL_VALUE, scheduledRegularFrom: addMonthsIsoDate(new Date(), BILLING_MONTHLY_PROMO_MONTHS) }
    : plan.id === 'premium_annual' && BILLING_PROMO_ACTIVE
     ? { type: 'launch_annual_first_year', promoEndsAt: BILLING_LAUNCH_PROMO_END_DATE, contractedAt: new Date().toISOString(), promotionalValue: BILLING_YEARLY_PROMO_VALUE, regularValueAfterPromo: BILLING_YEARLY_ORIGINAL_VALUE, scheduledRegularFrom: addMonthsIsoDate(new Date(), 12) }
     : null;
   const firstDueDate = formatAsaasDueDate(new Date(Date.now() + BILLING_TRIAL_DAYS * 24 * 60 * 60 * 1000));
   const subscriptionDescription = promoMeta?.type === 'launch_monthly'
    ? `CrewCheck Premium mensal - promocional por ${BILLING_MONTHLY_PROMO_MONTHS} meses; primeira cobrança em ${firstDueDate}`
    : promoMeta?.type === 'launch_annual_first_year'
     ? `CrewCheck Premium anual - promocional no primeiro ano; primeira cobrança em ${firstDueDate}`
     : `CrewCheck ${plan.name}; primeira cobrança em ${firstDueDate}`;
   const subscription = await asaasRequest('/subscriptions', {
    method: 'POST',
    body: {
     customer: customerId,
     billingType,
     nextDueDate: firstDueDate,
     value: Number(plan.value.toFixed(2)),
     cycle: plan.cycle,
     description: subscriptionDescription,
     externalReference: `crewcheck:${user.id}:${plan.id}:${Date.now()}`,
    },
   });
   if (!subscription?.id) throw new Error('Asaas não retornou o ID da assinatura.');
   await db.query(
    `update crewcheck_users
      set subscription_plan = $1, subscription_status = $2, billing_cycle = $3,
        asaas_customer_id = $4, asaas_subscription_id = $5, billing_cancel_at_period_end = false,
        updated_at = now()
     where id = $6`,
    [plan.id, 'pending', plan.cycle, customerId, subscription.id, user.id],
   );
   const payments = await asaasRequest(`/subscriptions/${encodeURIComponent(subscription.id)}/payments`, { query: { limit: 5 } }).catch(() => null);
   const firstPayment = firstPaymentFromAsaasPayload(payments);
   const checkoutUrl = firstCheckoutUrlFromPayments(payments) || subscription.invoiceUrl || subscription.paymentLink || null;
   const payment = await buildPublicBillingPaymentInfo(firstPayment, checkoutUrl);
   await db.query('insert into crewcheck_audit_logs (id, user_id, action, metadata) values ($1, $2, $3, $4::jsonb)', [newId(), user.id, 'billing.checkout.created', JSON.stringify({ planId: plan.id, cycle: plan.cycle, value: plan.value, billingType, firstDueDate, trialDays: BILLING_TRIAL_DAYS, subscriptionId: subscription.id, checkoutUrl: Boolean(checkoutUrl), pixReady: Boolean(payment?.pixQrCode?.payload || payment?.pixQrCode?.encodedImage), cpfMasked: maskBrazilianTaxId(cpfCnpj), promo: promoMeta, safetyNotice: { acknowledged: true, version: safetyNoticeVersion, acknowledgedAt: new Date().toISOString() } })]).catch(() => null);
   const refreshed = await reloadUserById(db, user.id);
   sendJson(res, 200, { ok: true, plan, checkoutUrl, payment, promo: promoMeta, billingType, firstDueDate, billing: billingStatusFromUser(refreshed), message: billingCheckoutPublicMessage(billingType, payment, firstDueDate) });
  } catch (error) {
   sendJson(res, error.statusCode || 500, publicBillingErrorPayload(error, 'Não foi possível criar a cobrança agora. Confira o CPF e tente novamente.'));
  }
  return true;
 }

 async function loadTrialRegularizationRows(db, limit = 500) {
  const result = await db.query(`select id, name, email, subscription_plan, subscription_status, billing_cycle, trial_started_at, trial_expires_at, premium_expires_at, asaas_customer_id, asaas_subscription_id, billing_tax_id, created_at, updated_at from crewcheck_users order by updated_at desc limit $1`, [Math.min(Math.max(Number(limit || 500), 1), 1000)]).catch(async () => {
   return db.query(`select id, name, email, subscription_plan, subscription_status, billing_cycle, trial_started_at, trial_expires_at, premium_expires_at, asaas_customer_id, asaas_subscription_id, billing_tax_id, created_at, updated_at from crewcheck_users order by updated_at desc limit ?`, [Math.min(Math.max(Number(limit || 500), 1), 1000)]);
  });
  return result.rows || [];
 }
 function summarizeTrialRegularizationRows(rows = []) {
  const freeEligible = [];
  const needsRegularization = [];
  const canBackfill = [];
  const alreadyRecurring = [];
  for (const row of rows) {
   if (hasLifetimePremiumAccess(row) || isBillingAdmin(row)) continue;
   const status = String(row.subscription_status || 'free').toLowerCase();
   const hasSub = Boolean(row.asaas_subscription_id);
   const needs = billingNeedsAsaasRegularization(row);
   if (needs) needsRegularization.push(row);
   if (needs && row.billing_tax_id) canBackfill.push(row);
   if (hasSub) alreadyRecurring.push(row);
   if (!row.trial_started_at && status === 'free') freeEligible.push(row);
  }
  return { freeEligible, needsRegularization, canBackfill, alreadyRecurring };
 }
 function publicTrialMigrationUser(row) {
  const regularization = billingRegularizationInfo(row);
  return {
   id: row.id,
   name: row.name,
   email: row.email,
   plan: row.subscription_plan,
   status: row.subscription_status,
   trialStartedAt: row.trial_started_at,
   trialExpiresAt: row.trial_expires_at,
   premiumExpiresAt: row.premium_expires_at,
   hasCpf: Boolean(row.billing_tax_id),
   hasAsaasSubscription: Boolean(row.asaas_subscription_id),
   asaasCustomerId: row.asaas_customer_id || null,
   asaasSubscriptionId: row.asaas_subscription_id || null,
   ...regularization,
  };
 }

 if (url.pathname === '/api/admin/billing/trial-regularization' && req.method === 'GET') {
  const user = await requireAuth(req, res);
  if (!user) return true;
  if (!isBillingAdmin(user)) { sendJson(res, 403, { ok: false, message: 'Ferramenta restrita ao administrador.' }); return true; }
  const db = requireDatabase(res);
  if (!db) return true;
  try {
   await ensureSchema();
   const rows = await loadTrialRegularizationRows(db, Number(url.searchParams.get('limit') || 500));
   const summary = summarizeTrialRegularizationRows(rows);
   sendJson(res, 200, {
    ok: true,
    asaasConfigured: Boolean(ASAAS_API_KEY),
    totals: {
     scanned: rows.length,
     freeEligible: summary.freeEligible.length,
     needsRegularization: summary.needsRegularization.length,
     canBackfillWithCpf: summary.canBackfill.length,
     alreadyRecurring: summary.alreadyRecurring.length,
    },
    users: {
     needsRegularization: summary.needsRegularization.slice(0, 100).map(publicTrialMigrationUser),
     canBackfill: summary.canBackfill.slice(0, 100).map(publicTrialMigrationUser),
     freeEligible: summary.freeEligible.slice(0, 100).map(publicTrialMigrationUser),
    },
    policy: 'Contas gratuitas não recebem assinatura automática. Trial antigo sem Asaas exige confirmação do usuário; o backfill automático só atua em trial antigo que já possui CPF salvo.',
   });
  } catch (error) {
   sendJson(res, 500, { ok: false, message: 'Falha ao carregar regularização de trials.', detail: error.message });
  }
  return true;
 }

 if (url.pathname === '/api/admin/billing/trial-regularization/notify' && req.method === 'POST') {
  const user = await requireAuth(req, res);
  if (!user) return true;
  if (!isBillingAdmin(user)) { sendJson(res, 403, { ok: false, message: 'Ferramenta restrita ao administrador.' }); return true; }
  const db = requireDatabase(res);
  if (!db) return true;
  try {
   await ensureSchema();
   const body = await readJsonBody(req, 128 * 1024).catch(() => ({}));
   const target = String(body.target || 'needs_regularization').toLowerCase();
   const limit = Math.min(Math.max(Number(body.limit || 50), 1), 200);
   const rows = await loadTrialRegularizationRows(db, 1000);
   const summary = summarizeTrialRegularizationRows(rows);
   const selected = target === 'free_eligible' ? summary.freeEligible : target === 'all' ? [...summary.needsRegularization, ...summary.freeEligible] : summary.needsRegularization;
   const sent = [];
   const failed = [];
   for (const row of selected.slice(0, limit)) {
    const regularization = billingRegularizationInfo(row);
    const isFree = !row.trial_started_at && String(row.subscription_status || 'free').toLowerCase() === 'free';
    const subject = isFree ? 'CrewCheck Premium: ative seus 7 dias grátis' : 'CrewCheck Premium: confirme sua assinatura recorrente';
    const text = isFree
     ? `Olá, ${row.name || 'tripulante'}. Seu cadastro CrewCheck está pronto. Para ativar o Premium, entre em Conta > Assinatura, informe CPF, aceite o aviso e inicie os 7 dias grátis. A primeira cobrança só é programada após o teste.`
     : `Olá, ${row.name || 'tripulante'}. Atualizamos a cobrança do CrewCheck para assinatura recorrente no Asaas. Para manter o Premium após o teste, entre em Conta > Assinatura e confirme seus dados. ${regularization.regularizationFirstDueDate ? `A primeira cobrança será programada para ${regularization.regularizationFirstDueDate}.` : ''}`;
    const html = `<div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.6"><h2 style="margin:0 0 12px">CrewCheck Premium</h2><p>${escapeHtml(text)}</p><p><a href="${publicAppUrl()}" style="display:inline-block;background:#0ea5e9;color:white;padding:12px 18px;border-radius:14px;text-decoration:none;font-weight:700">Abrir CrewCheck</a></p><p style="font-size:12px;color:#64748b">Mensagem automática da plataforma CrewCheck.</p></div>`;
    const result = await sendEmail({ to: row.email, subject, text, html });
    if (result.ok) {
     sent.push(row.email);
     await db.query('insert into crewcheck_audit_logs (id, user_id, action, metadata) values ($1, $2, $3, $4::jsonb)', [newId(), row.id, 'billing.trial_regularization.email_sent', JSON.stringify({ target, provider: result.provider || null, adminUserId: user.id })]).catch(() => null);
    } else {
     failed.push({ email: row.email, reason: result.message || 'falha' });
    }
   }
   sendJson(res, 200, { ok: true, target, selected: selected.length, sent: sent.length, failed: failed.length, failedItems: failed.slice(0, 20) });
  } catch (error) {
   sendJson(res, 500, { ok: false, message: 'Falha ao enviar avisos de regularização.', detail: error.message });
  }
  return true;
 }

 if (url.pathname === '/api/admin/billing/trial-regularization/backfill' && req.method === 'POST') {
  const user = await requireAuth(req, res);
  if (!user) return true;
  if (!isBillingAdmin(user)) { sendJson(res, 403, { ok: false, message: 'Ferramenta restrita ao administrador.' }); return true; }
  const db = requireDatabase(res);
  if (!db) return true;
  if (!requireAsaasConfigured(res)) return true;
  try {
   await ensureSchema();
   const body = await readJsonBody(req, 128 * 1024).catch(() => ({}));
   const dryRun = body.dryRun !== false;
   const limit = Math.min(Math.max(Number(body.limit || 25), 1), 100);
   const rows = await loadTrialRegularizationRows(db, 1000);
   const summary = summarizeTrialRegularizationRows(rows);
   const candidates = summary.canBackfill.slice(0, limit);
   if (dryRun) {
    sendJson(res, 200, { ok: true, dryRun: true, candidates: candidates.length, users: candidates.map(publicTrialMigrationUser), message: 'Prévia: nenhum usuário foi alterado. Envie dryRun=false para criar assinaturas apenas de trials antigos com CPF salvo.' });
    return true;
   }
   const created = [];
   const failed = [];
   for (const row of candidates) {
    try {
     const result = await createTrialAsaasSubscriptionForExistingUser(db, row, { cpfCnpj: row.billing_tax_id, source: 'admin_backfill_existing_trial' });
     created.push({ id: row.id, email: row.email, subscriptionId: result.subscription.id, firstDueDate: result.firstDueDate });
    } catch (error) {
     failed.push({ id: row.id, email: row.email, reason: error.message, code: error.code || null });
    }
   }
   sendJson(res, 200, { ok: true, dryRun: false, created: created.length, failed: failed.length, createdItems: created, failedItems: failed.slice(0, 30) });
  } catch (error) {
   sendJson(res, 500, { ok: false, message: 'Falha no backfill de assinaturas Asaas.', detail: error.message });
  }
  return true;
 }

 if (url.pathname === '/api/admin/billing/dashboard' && req.method === 'GET') {
   const user = await requireAuth(req, res);
   if (!user) return true;
   if (!isC32FAdminEmail(user.email) && String(user.role || '').toLowerCase() !== 'admin') {
    sendJson(res, 403, { ok: false, message: 'Dashboard financeiro restrito ao administrador.' });
    return true;
   }
   const db = requireDatabase(res);
   if (!db) return true;
   try {
    await ensureSchema();
    const summaryRows = await db.query(`select subscription_status, subscription_plan, billing_cycle, count(*)::int as count from crewcheck_users group by subscription_status, subscription_plan, billing_cycle`).catch(async () => {
     return db.query(`select subscription_status, subscription_plan, billing_cycle, count(*) as count from crewcheck_users group by subscription_status, subscription_plan, billing_cycle`);
    });
    const usersRows = await db.query(`select id, name, email, subscription_plan, subscription_status, billing_cycle, premium_expires_at, trial_expires_at, asaas_customer_id, asaas_subscription_id, billing_cancel_at_period_end, created_at, updated_at from crewcheck_users order by updated_at desc limit 200`);
    const users = usersRows.rows || [];
    const byStatus = {};
    for (const row of summaryRows.rows || []) {
     const key = String(row.subscription_status || 'free').toLowerCase();
     byStatus[key] = (byStatus[key] || 0) + Number(row.count || 0);
    }
    const activeStatuses = ['active','paid','received','lifetime'];
    const paidStatuses = ['active','paid','received'];
    const activePremiumUsers = users.filter((row) => activeStatuses.includes(String(row.subscription_status || '').toLowerCase())).length;
    const monthlyActive = users.filter((row) => String(row.subscription_plan || '').includes('monthly') && paidStatuses.includes(String(row.subscription_status || '').toLowerCase())).length;
    const annualActive = users.filter((row) => String(row.subscription_plan || '').includes('annual') && paidStatuses.includes(String(row.subscription_status || '').toLowerCase())).length;
    const estimatedMrr = monthlyActive * BILLING_MONTHLY_VALUE + annualActive * (BILLING_YEARLY_VALUE / 12);
    const estimatedArr = monthlyActive * BILLING_MONTHLY_VALUE * 12 + annualActive * BILLING_YEARLY_VALUE;
    const fixedCosts = CREWCHECK_COST_RENDER_MONTHLY + CREWCHECK_COST_FLIGHT_DATA_MONTHLY + CREWCHECK_COST_EMAIL_MONTHLY + CREWCHECK_COST_MAPS_MONTHLY + CREWCHECK_COST_DOMAIN_MONTHLY + CREWCHECK_COST_OTHER_MONTHLY;
    const estimatedAsaasFees = estimatedMrr * (CREWCHECK_ASAAS_FEE_PERCENT / 100) + (monthlyActive + annualActive) * CREWCHECK_ASAAS_FIXED_FEE;
    const estimatedMonthlyProfit = estimatedMrr - fixedCosts - estimatedAsaasFees;
    sendJson(res, 200, {
     ok: true,
     source: 'Asaas e banco CrewCheck',
     promo: billingPricePolicy(),
     asaasConfigured: Boolean(ASAAS_API_KEY),
     totals: {
      users: users.length,
      activePremiumUsers,
      monthlyActive,
      annualActive,
      trialing: byStatus.trialing || 0,
      pastDue: byStatus.past_due || byStatus.overdue || 0,
      canceled: byStatus.canceled || 0,
      free: byStatus.free || 0,
      estimatedMonthlyRevenue: monthlyActive * BILLING_MONTHLY_VALUE,
      estimatedAnnualRevenue: annualActive * BILLING_YEARLY_VALUE,
      estimatedMrr,
      estimatedArr,
      estimatedMonthlyCosts: fixedCosts,
      estimatedAsaasFees,
      estimatedMonthlyProfit,
     },
     forecast: {
      monthlyPrice: BILLING_MONTHLY_VALUE,
      annualPrice: BILLING_YEARLY_VALUE,
      mrr: estimatedMrr,
      arr: estimatedArr,
      fixedCosts,
      asaasFees: estimatedAsaasFees,
      monthlyProfit: estimatedMonthlyProfit,
      profitMarginPercent: estimatedMrr > 0 ? (estimatedMonthlyProfit / estimatedMrr) * 100 : null,
      costBasis: {
       render: CREWCHECK_COST_RENDER_MONTHLY,
       flightData: CREWCHECK_COST_FLIGHT_DATA_MONTHLY,
       email: CREWCHECK_COST_EMAIL_MONTHLY,
       maps: CREWCHECK_COST_MAPS_MONTHLY,
       domain: CREWCHECK_COST_DOMAIN_MONTHLY,
       other: CREWCHECK_COST_OTHER_MONTHLY,
       asaasFeePercent: CREWCHECK_ASAAS_FEE_PERCENT,
       asaasFixedFee: CREWCHECK_ASAAS_FIXED_FEE,
      },
      note: 'Previsão calculada com assinaturas ativas no banco e custos informados nas variáveis de ambiente.',
     },
     byStatus,
     recentUsers: users.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      plan: row.subscription_plan,
      status: row.subscription_status,
      cycle: row.billing_cycle,
      premiumExpiresAt: row.premium_expires_at,
      trialExpiresAt: row.trial_expires_at,
      asaasSubscriptionId: row.asaas_subscription_id,
      cancelAtPeriodEnd: Boolean(row.billing_cancel_at_period_end),
      updatedAt: row.updated_at,
     })),
    });
   } catch (error) {
    sendJson(res, 500, { ok: false, message: 'Não foi possível carregar o dashboard financeiro.', detail: error.message });
   }
   return true;
  }


  if (url.pathname === '/api/admin/system-dashboard' && req.method === 'GET') {
   const user = await requireAuth(req, res);
   if (!user) return true;
   if (!isC32FAdminEmail(user.email) && String(user.role || '').toLowerCase() !== 'admin') {
    sendJson(res, 403, { ok: false, message: 'Dashboard de saúde restrito ao administrador.' });
    return true;
   }
   const db = getPool();
   let finance = null;
   let usage = null;
   let databaseOk = Boolean(db);
   try {
    if (db) {
     await ensureSchema();
     const usersRows = await db.query(`select subscription_plan, subscription_status, billing_cycle from crewcheck_users order by updated_at desc limit 500`);
     const rostersRows = await db.query('select count(*) as total from crewcheck_rosters').catch(() => ({ rows: [{ total: 0 }] }));
     const sessionsRows = await db.query('select count(*) as total from crewcheck_sessions where expires_at > now()').catch(() => ({ rows: [{ total: 0 }] }));
     const rows = usersRows.rows || [];
     const paidStatuses = ['active','paid','received'];
     const monthlyActive = rows.filter((row) => String(row.subscription_plan || '').includes('monthly') && paidStatuses.includes(String(row.subscription_status || '').toLowerCase())).length;
     const annualActive = rows.filter((row) => String(row.subscription_plan || '').includes('annual') && paidStatuses.includes(String(row.subscription_status || '').toLowerCase())).length;
     const trialing = rows.filter((row) => String(row.subscription_status || '').toLowerCase() === 'trialing').length;
     const pastDue = rows.filter((row) => ['past_due','overdue'].includes(String(row.subscription_status || '').toLowerCase())).length;
     const free = rows.filter((row) => !row.subscription_status || String(row.subscription_status || '').toLowerCase() === 'free').length;
     const mrr = monthlyActive * BILLING_MONTHLY_VALUE + annualActive * (BILLING_YEARLY_VALUE / 12);
     const arr = monthlyActive * BILLING_MONTHLY_VALUE * 12 + annualActive * BILLING_YEARLY_VALUE;
     const fixedCosts = CREWCHECK_COST_RENDER_MONTHLY + CREWCHECK_COST_FLIGHT_DATA_MONTHLY + CREWCHECK_COST_EMAIL_MONTHLY + CREWCHECK_COST_MAPS_MONTHLY + CREWCHECK_COST_DOMAIN_MONTHLY + CREWCHECK_COST_OTHER_MONTHLY;
     const asaasFees = mrr * (CREWCHECK_ASAAS_FEE_PERCENT / 100) + (monthlyActive + annualActive) * CREWCHECK_ASAAS_FIXED_FEE;
     finance = { users: rows.length, monthlyActive, annualActive, trialing, pastDue, free, mrr, arr, fixedCosts, asaasFees, monthlyProfit: mrr - fixedCosts - asaasFees, profitMarginPercent: mrr > 0 ? ((mrr - fixedCosts - asaasFees) / mrr) * 100 : null };
     usage = { activeSessions: Number(sessionsRows.rows?.[0]?.total || 0), rostersTotal: Number(rostersRows.rows?.[0]?.total || 0) };
    }
   } catch {
    databaseOk = false;
   }
   const providers = radarProviderStatus();
   const emailProviders = emailProviderStatus();
   const services = [
    { key: 'database', label: 'Banco de dados', ok: databaseOk, group: 'core', detail: databaseOk ? 'Conectado' : 'Não configurado ou indisponível' },
    { key: 'auth', label: 'Login e sessões', ok: AUTH_REQUIRED, group: 'core', detail: AUTH_REQUIRED ? 'Autenticação obrigatória' : 'Modo aberto' },
    { key: 'asaas', label: 'Financeiro Asaas', ok: Boolean(ASAAS_API_KEY), group: 'finance', detail: Boolean(ASAAS_API_KEY) ? 'Assinaturas recorrentes habilitadas' : 'ASAAS_API_KEY ausente' },
    { key: 'sendgrid', label: 'E-mail SendGrid', ok: Boolean(emailProviders.sendgrid), group: 'email', detail: emailProviders.sendgrid ? 'Principal configurado' : 'Não configurado' },
    { key: 'smtp', label: 'SMTP fallback', ok: Boolean(emailProviders.smtp), group: 'email', detail: emailProviders.smtp ? 'Fallback configurado' : 'Não configurado' },
    { key: 'flightaware', label: 'Radar de voos', ok: Boolean(providers.flightaware || providers.flightawareAeroAPI), group: 'flights', detail: (providers.flightaware || providers.flightawareAeroAPI) ? 'Fonte principal de radar configurada' : 'FlightAware não configurado' },
    { key: 'googleflights', label: 'Google Flights', ok: Boolean(providers.serpapi || providers.searchapi), group: 'flights', detail: (providers.serpapi || providers.searchapi) ? 'Busca de voos configurada' : 'Fonte de busca ausente' },
    { key: 'maps', label: 'Rotas e localização', ok: Boolean(process.env.GOOGLE_ROUTES_API_KEY || process.env.GOOGLE_MAPS_API_KEY), group: 'maps', detail: (process.env.GOOGLE_ROUTES_API_KEY || process.env.GOOGLE_MAPS_API_KEY) ? 'Rotas em tempo real configuradas' : 'Sem rotas em tempo real' },
    { key: 'support', label: 'Suporte Premium', ok: Boolean(CREWCHECK_SUPPORT_DESTINATION_EMAIL || CREWCHECK_SUPPORT_WHATSAPP_URL), group: 'support', detail: CREWCHECK_SUPPORT_WHATSAPP_URL ? 'WhatsApp premium habilitado' : (CREWCHECK_SUPPORT_DESTINATION_EMAIL ? 'E-mail de suporte habilitado' : 'Suporte sem destino configurado') },
   ];
   sendJson(res, 200, {
    ok: true,
    generatedAt: new Date().toISOString(),
    app: { version: '11.0.42', environment: process.env.NODE_ENV || 'production', authRequired: AUTH_REQUIRED, promo: billingPricePolicy() },
    services,
    finance,
    usage,
    costBasis: { render: CREWCHECK_COST_RENDER_MONTHLY, flightData: CREWCHECK_COST_FLIGHT_DATA_MONTHLY, email: CREWCHECK_COST_EMAIL_MONTHLY, maps: CREWCHECK_COST_MAPS_MONTHLY, domain: CREWCHECK_COST_DOMAIN_MONTHLY, other: CREWCHECK_COST_OTHER_MONTHLY, asaasFeePercent: CREWCHECK_ASAAS_FEE_PERCENT, asaasFixedFee: CREWCHECK_ASAAS_FIXED_FEE },
    management: { billingDashboard: '/api/admin/billing/dashboard', syncPrices: '/api/admin/billing/sync-prices', emailHealth: '/api/admin/email-health', radarHealth: '/api/radar-health?airport=BSB&type=departure' },
    secretsVisible: false,
   });
   return true;
  }


  if (url.pathname === '/api/admin/billing/grant-unlimited' && req.method === 'POST') {
  const admin = await requireAuth(req, res);
  if (!admin) return true;
  if (!isBillingAdmin(admin)) {
   sendJson(res, 403, { ok: false, message: 'Liberação Premium Unlimited restrita ao administrador.' });
   return true;
  }
  const db = requireDatabase(res);
  if (!db) return true;
  try {
   await ensureSchema();
   const body = await readJsonBody(req, 64 * 1024).catch(() => ({}));
   const email = normalizeEmail(body?.email || body?.userEmail || url.searchParams.get('email'));
   const note = String(body?.note || '').trim().slice(0, 280);
   if (!email || !email.includes('@')) {
    sendJson(res, 400, { ok: false, code: 'INVALID_EMAIL', message: 'Informe um e-mail válido para liberar o Premium Unlimited.' });
    return true;
   }
   const found = await db.query('select * from crewcheck_users where lower(email) = lower($1) limit 1', [email]);
   const targetUser = found.rows?.[0] || null;
   if (!targetUser) {
    sendJson(res, 404, { ok: false, code: 'USER_NOT_FOUND', message: 'Conta não encontrada. Peça para o usuário criar cadastro primeiro; depois libere o Premium Unlimited pelo e-mail.' });
    return true;
   }
   await db.query(
    `update crewcheck_users
        set subscription_plan = 'premium_lifetime',
            subscription_status = 'lifetime',
            billing_cycle = 'LIFETIME',
            premium_expires_at = null,
            trial_expires_at = null,
            billing_cancel_at_period_end = false,
            updated_at = now()
      where id = $1`,
    [targetUser.id],
   );
   await db.query('insert into crewcheck_audit_logs (id, user_id, action, metadata) values ($1, $2, $3, $4::jsonb)', [newId(), admin.id, 'billing.unlimited.granted', JSON.stringify({ targetUserId: targetUser.id, targetEmail: maskEmailForLog(email), note, grantedBy: maskEmailForLog(admin.email), at: new Date().toISOString() })]).catch(() => null);
   const refreshed = await reloadUserById(db, targetUser.id);
   sendJson(res, 200, { ok: true, email, userId: targetUser.id, status: billingStatusFromUser(refreshed || { ...targetUser, subscription_plan: 'premium_lifetime', subscription_status: 'lifetime', billing_cycle: 'LIFETIME' }), message: `Premium Unlimited liberado para ${email}.` });
  } catch (error) {
   sendJson(res, 500, { ok: false, message: 'Não foi possível liberar o Premium Unlimited.', detail: error.message, code: error.code, db: dbErrorInfo(error) });
  }
  return true;
 }

  if (url.pathname === '/api/admin/billing/sync-prices' && req.method === 'POST') {
  const user = await requireAuth(req, res);
  if (!user) return true;
  if (!isC32FAdminEmail(user.email) && String(user.role || '').toLowerCase() !== 'admin') {
   sendJson(res, 403, { ok: false, message: 'Sincronização de preços restrita ao administrador.' });
   return true;
  }
  const db = requireDatabase(res);
  if (!db) return true;
  if (!requireAsaasConfigured(res)) return true;
  try {
   await ensureSchema();
   const body = await readJsonBody(req, 64 * 1024).catch(() => ({}));
   const dryRun = ['1', 'true', 'yes'].includes(String(body?.dryRun || url.searchParams.get('dryRun') || '').toLowerCase());
   const rows = await db.query(
    `select id, email, subscription_plan, subscription_status, asaas_subscription_id
       from crewcheck_users
      where asaas_subscription_id is not null
        and subscription_plan in ('premium_monthly','premium_annual')
        and coalesce(subscription_status,'') not in ('canceled','lifetime','free')
      order by updated_at desc
      limit 200`
   );
   const results = [];
   for (const row of rows.rows || []) {
    const plan = getBillingPlan(row.subscription_plan);
    const targetValue = Number(plan.value.toFixed(2));
    const item = { userId: row.id, email: row.email, planId: plan.id, subscriptionId: row.asaas_subscription_id, targetValue, updated: false, dryRun };
    if (!dryRun) {
     try {
      await asaasRequest(`/subscriptions/${encodeURIComponent(row.asaas_subscription_id)}`, { method: 'PUT', body: { value: targetValue, description: `CrewCheck ${plan.name}` } });
      item.updated = true;
     } catch (error) {
      item.error = error?.message || String(error);
     }
    }
    results.push(item);
   }
   await db.query('insert into crewcheck_audit_logs (id, user_id, action, metadata) values ($1, $2, $3, $4::jsonb)', [newId(), user.id, dryRun ? 'billing.price_sync.preview' : 'billing.price_sync.executed', JSON.stringify({ monthlyValue: BILLING_MONTHLY_VALUE, annualValue: BILLING_YEARLY_VALUE, count: results.length, dryRun })]).catch(() => null);
   sendJson(res, 200, { ok: true, dryRun, monthlyValue: BILLING_MONTHLY_VALUE, annualValue: BILLING_YEARLY_VALUE, count: results.length, results, message: dryRun ? 'Prévia gerada. Envie sem dryRun para atualizar o Asaas.' : 'Preços enviados ao Asaas para as assinaturas encontradas.' });
  } catch (error) {
   sendJson(res, 500, { ok: false, message: 'Não foi possível sincronizar preços no Asaas.', detail: error.message, code: error.code, asaas: error.payload || null });
  }
  return true;
 }

 if (url.pathname === '/api/billing/cancel' && req.method === 'POST') {
  const user = await requireAuth(req, res);
  if (!user) return true;
  const db = requireDatabase(res);
  if (!db) return true;
  try {
   await ensureSchema();
   if (hasLifetimePremiumAccess(user)) {
    const effectiveUser = await ensureLifetimeBillingState(db, user);
    sendJson(res, 200, { ...billingStatusFromUser(effectiveUser), providerStatus: { ok: true, skipped: true, reason: 'lifetime' }, message: 'Conta Premium Unlimited não possui cobrança para cancelar.' });
    return true;
   }
   const subscriptionId = user.asaas_subscription_id || null;
   let providerStatus = { ok: false, skipped: true };
   if (subscriptionId && ASAAS_API_KEY) {
    providerStatus = await asaasRequest(`/subscriptions/${encodeURIComponent(subscriptionId)}`, { method: 'PUT', body: { status: 'INACTIVE' } }).then((payload) => ({ ok: true, payload })).catch((error) => ({ ok: false, message: error.message }));
   }
   await db.query(
    `update crewcheck_users
      set subscription_status = 'canceled', billing_cancel_at_period_end = true, updated_at = now()
     where id = $1`,
    [user.id],
   );
   await db.query('insert into crewcheck_audit_logs (id, user_id, action, metadata) values ($1, $2, $3, $4::jsonb)', [newId(), user.id, 'billing.cancel.requested', JSON.stringify({ subscriptionId, providerStatus })]).catch(() => null);
   const refreshed = await reloadUserById(db, user.id);
   sendJson(res, 200, { ...billingStatusFromUser(refreshed), providerStatus, message: 'Cancelamento registrado. Não serão criadas novas cobranças quando o Asaas confirmar a inativação.' });
  } catch (error) {
   sendJson(res, 500, { ok: false, message: 'Não foi possível cancelar a assinatura.', detail: error.message, code: error.code, db: dbErrorInfo(error) });
  }
  return true;
 }

 if (url.pathname === '/api/admin/usage-summary' && req.method === 'GET') {
  const user = await requireAuth(req, res);
  if (!user) return true;
  const role = String(user.role || '').toLowerCase();
  const email = String(user.email || '').toLowerCase();
  const isAdmin = role.includes('admin') || isC32FAdminEmail(email) || email === 'bruno@crewcheck.local';
  if (!isAdmin) {
   sendJson(res, 403, { ok: false, message: 'Acesso administrativo restrito.' });
   return true;
  }
  const db = getPool();
  if (!db) {
   sendJson(res, 200, { ok: true, database: false, usersTotal: null, activeSessions: null, rostersTotal: null, generatedAt: new Date().toISOString() });
   return true;
  }
  try {
   await ensureSchema();
   const users = await db.query('select count(*) as total from crewcheck_users');
   const sessions = await db.query('select count(*) as total from crewcheck_sessions where expires_at > now()');
   const rosters = await db.query('select count(*) as total from crewcheck_rosters');
   sendJson(res, 200, {
    ok: true,
    database: true,
    usersTotal: Number(users.rows?.[0]?.total || 0),
    activeSessions: Number(sessions.rows?.[0]?.total || 0),
    rostersTotal: Number(rosters.rows?.[0]?.total || 0),
    generatedAt: new Date().toISOString(),
    privacy: 'aggregated-only',
   });
  } catch (error) {
   sendJson(res, 200, { ok: true, database: true, usersTotal: null, activeSessions: null, rostersTotal: null, generatedAt: new Date().toISOString(), warning: 'Resumo agregado indisponível no momento.' });
  }
  return true;
 }



 if (url.pathname === '/api/exchange-rates' && req.method === 'GET') {
  const user = await requireAuth(req, res);
  if (!user) return true;
  try {
   const data = await fetchCrewCheckExchangeRates({ base: url.searchParams.get('base'), symbols: url.searchParams.get('symbols') });
   sendJson(res, 200, data);
  } catch (error) {
   sendJson(res, 200, { ok: false, message: error?.message || 'Cotação indisponível agora.', source: 'exchange-rates' });
  }
  return true;
 }

 if (url.pathname === '/api/health') {
  sendJson(res, 200, {
   ok: true,
   app: 'CrewCheck',
   databaseConfigured: Boolean(DATABASE_URL),
   databaseEnvDetected: Boolean(DATABASE_URL),
   authRequired: AUTH_REQUIRED,
   emailConfigured: Object.values(emailProviderStatus()).some(Boolean),
   emailProviders: emailProviderStatus(),
   autoMigrate: AUTO_MIGRATE,
  });
  return true;
 }


 if (url.pathname === '/api/admin/email-health' && (req.method === 'GET' || req.method === 'POST')) {
  const user = await requireAuth(req, res);
  if (!user) return true;
  if (!isBillingAdmin(user) && !isC32FAdminEmail(String(user.email || '').toLowerCase())) {
   sendJson(res, 403, { ok: false, message: 'Acesso administrativo restrito.' });
   return true;
  }
  const providers = emailProviderStatus();
  if (req.method === 'GET') {
   sendJson(res, 200, { ok: true, configured: Object.values(providers).some(Boolean), providers, smtpHost: smtpConfig().host || null, smtpPort: smtpConfig().port || null, secretsVisible: false });
   return true;
  }
  try {
   const body = await readJsonBody(req, 64 * 1024).catch(() => ({}));
   const to = normalizeEmail(body.to || user.email || '');
   if (!to) {
    sendJson(res, 400, { ok: false, message: 'Informe um e-mail de teste válido.' });
    return true;
   }
   const result = await sendEmail({
    to,
    subject: 'CrewCheck — teste de envio interno',
    text: 'Teste de envio interno do CrewCheck. Se você recebeu esta mensagem, o provedor de e-mail está funcionando.',
    html: buildCrewCheckEmailHtml({ title: 'Teste de envio CrewCheck', eyebrow: 'Status do sistema', message: 'Se você recebeu esta mensagem, o envio interno do CrewCheck está funcionando.', actionUrl: publicAppUrl(), actionLabel: 'Abrir CrewCheck', includePlayBadge: true }),
   });
   sendJson(res, result.ok ? 200 : 501, { ok: Boolean(result.ok), provider: result.provider || null, attempts: result.attempts || [], providers, message: result.ok ? 'E-mail de teste enviado.' : result.message });
  } catch (error) {
   sendJson(res, 500, { ok: false, message: 'Não foi possível testar o e-mail.', detail: error.message });
  }
  return true;
 }

 if (url.pathname === '/api/calendar-feed' && req.method === 'GET') {
  const user = await requireAuth(req, res);
  if (!user) return true;
  const db = requireDatabase(res);
  if (!db) return true;
  try {
   const feed = await ensureCalendarFeedForUser(db, user);
   sendJson(res, 200, {
    ok: true,
    feedUrl: calendarFeedUrl(req, feed.token),
    token: feed.token,
    updatedAt: feed.updated_at || feed.updatedAt || null,
    periodLabel: feed.period_label || null,
    mode: feed.mode || 'all',
    hasContent: Boolean(feed.ics_content && String(feed.ics_content).includes('BEGIN:VEVENT')),
   });
  } catch (error) {
   sendJson(res, 500, { ok: false, message: 'Não foi possível criar o link de calendário.', detail: error.message });
  }
  return true;
 }

 if (url.pathname === '/api/calendar-feed' && req.method === 'POST') {
  const user = await requireAuth(req, res);
  if (!user) return true;
  const db = requireDatabase(res);
  if (!db) return true;
  try {
   const body = await readJsonBody(req, 3 * 1024 * 1024);
   const ical = String(body.ical || '').replace(/\r?\n/g, '\r\n');
   if (!ical.includes('BEGIN:VCALENDAR') || !ical.includes('END:VCALENDAR')) {
    sendJson(res, 400, { ok: false, message: 'Calendário ICS inválido.' });
    return true;
   }
   const feed = await ensureCalendarFeedForUser(db, user);
   const periodLabel = String(body.periodLabel || '').slice(0, 64) || null;
   const mode = String(body.mode || 'all').slice(0, 32);
   const eventsCount = Math.max(0, Math.min(5000, Number(body.eventsCount || 0) || 0));
   await db.query(
    'update crewcheck_calendar_feeds set updated_at = now(), ics_content = $1, period_label = $2, mode = $3, events_count = $4 where id = $5',
    [ical, periodLabel, mode, eventsCount, feed.id],
   );
   sendJson(res, 200, {
    ok: true,
    feedUrl: calendarFeedUrl(req, feed.token),
    updatedAt: new Date().toISOString(),
    periodLabel,
    mode,
    eventsCount,
   });
  } catch (error) {
   sendJson(res, 500, { ok: false, message: 'Não foi possível atualizar o calendário automático.', detail: error.message });
  }
  return true;
 }

 if (url.pathname === '/api/c32f/apostila-pdf' && req.method === 'GET') {
  const user = await requireAuth(req, res);
  if (!user) return true;
  if (AUTH_REQUIRED && !isC32FAdminEmail(user.email)) {
   sendJson(res, 403, { ok: false, code: 'C32F_ADMIN_ONLY', message: 'Apostila C32F restrita ao administrador autorizado.' });
   return true;
  }
  const pdfPath = path.join(__dirname, 'private', 'c32f', 'apostila-v6.pdf');
  if (!(await exists(pdfPath))) {
   sendJson(res, 404, { ok: false, code: 'C32F_PDF_NOT_FOUND', message: 'PDF da apostila C32F não encontrado no servidor.' });
   return true;
  }
  const download = url.searchParams.get('download') === '1';
  res.writeHead(200, {
   'content-type': 'application/pdf',
   'content-disposition': `${download ? 'attachment' : 'inline'}; filename="Apostila_C32F_Check_A32F_V6.pdf"`,
   'cache-control': 'private, no-store, max-age=0',
   'x-content-type-options': 'nosniff',
  });
  fs.createReadStream(pdfPath).pipe(res);
  return true;
 }





 if (url.pathname === '/api/extra-flight-search' && req.method === 'GET') {
  try {
   const result = await fetchExtraFlightOffersWithDbCache(Object.fromEntries(url.searchParams.entries()));
   sendJson(res, 200, result);
  } catch (error) {
   sendJson(res, 200, { ok: true, options: [], source: 'Tarifas indisponíveis', message: error?.message || 'Falha ao consultar voos e tarifas.', updatedAt: new Date().toISOString() });
  }
  return true;
 }


 if (url.pathname === '/api/airport-board' && req.method === 'GET') {
  const user = await requireAuth(req, res);
  if (!user) return true;
  try {
   const board = await getAirportBoardSnapshot(url.searchParams);
   sendJson(res, 200, board);
  } catch (error) {
   sendJson(res, 200, { ok: true, rows: [], source: 'Radar indisponível', updatedAt: new Date().toISOString(), message: error?.message || 'Falha na consulta.' });
  }
  return true;
 }

 if (url.pathname === '/api/radar/day-cache/refresh' && req.method === 'POST') {
  const user = await requireAuth(req, res);
  if (!user) return true;
  try {
   const body = await readJsonBody(req, 128 * 1024).catch(() => ({}));
   const isAdmin = isC32FAdminEmail(user.email) || String(user.role || '').toLowerCase() === 'admin';
   const requested = Array.isArray(body?.airports) ? body.airports : AIRPORT_BOARD_DEFAULT_AIRPORTS;
   const airports = [...new Set(requested.map((item) => String(item || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3)).filter(Boolean))].slice(0, isAdmin ? 12 : 4);
   const types = (Array.isArray(body?.types) ? body.types : ['departure']).map((item) => String(item).toLowerCase() === 'arrival' ? 'arrival' : 'departure').filter((value, index, arr) => arr.indexOf(value) === index).slice(0, isAdmin ? 2 : 1);
   const results = [];
   for (const airport of airports) {
    for (const type of types) {
     const params = new URLSearchParams({ airport, type, limit: '100', diagnostics: '0', apiFirst: '1', refresh: '1', date: todayIsoForAirportServer(airport), timeBasis: 'airport-local' });
     const board = await getAirportBoardSnapshot(params);
     results.push({ airport, type, count: board.rows?.length || 0, updatedAt: board.updatedAt, source: board.source, cache: board.cache || null });
    }
   }
   sendJson(res, 200, { ok: true, updatedAt: new Date().toISOString(), currentDayOnly: true, airports, types, results, message: 'Cache compartilhado do radar atualizado para os aeroportos permitidos.' });
  } catch (error) {
   sendJson(res, 200, { ok: false, message: error?.message || 'Não foi possível atualizar o cache do radar.' });
  }
  return true;
 }



 if (url.pathname === '/api/radar/private-status' && req.method === 'GET') {
  const user = await requireAuth(req, res);
  if (!user) return true;
  try {
   const params = new URLSearchParams(url.searchParams);
   const flight = String(params.get('flight') || params.get('flightNumber') || '').replace(/\s+/g, '').toUpperCase().slice(0, 16);
   if (flight && !params.get('flightNumber')) params.set('flightNumber', flight);
   const status = await getFlightStatusSnapshot(params);
   const sanitized = { ...radarSanitizedStatus(status, Object.fromEntries(params.entries())), providerStatus: radarProviderStatus() };
   if (user?.id) {
    await notifyTelegramRadarForUser(getPool(), user.id, sanitized, Object.fromEntries(params.entries())).catch(() => null);
   }
   sendJson(res, 200, sanitized);
  } catch (error) {
   sendJson(res, 200, { ok: false, sourceLabel: 'Radar CrewCheck', message: 'Status de voo indisponível no momento.', updatedAt: new Date().toISOString() });
  }
  return true;
 }


 if (url.pathname === '/api/radar/private-batch-status' && req.method === 'POST') {
  const user = await requireAuth(req, res);
  if (!user) return true;
  try {
   const body = await readJsonBody(req, 256 * 1024);
   const flights = Array.isArray(body?.flights) ? body.flights.slice(0, 12) : [];
   const rows = [];
   for (const item of flights) {
    const params = new URLSearchParams();
    const flight = normalizeFlightToken(item?.flightNumber || item?.flight || item?.number || '');
    if (!flight) continue;
    params.set('flightNumber', flight);
    if (item?.origin) params.set('origin', String(item.origin).toUpperCase().slice(0, 4));
    if (item?.destination) params.set('destination', String(item.destination).toUpperCase().slice(0, 4));
    if (item?.date) params.set('date', radarIsoDate(item.date));
    if (item?.codes) params.set('codes', String(item.codes).toUpperCase().slice(0, 128));
    if (item?.route) params.set('route', String(item.route).toUpperCase().slice(0, 64));
    const status = await getFlightStatusSnapshot(params);
    rows.push(radarSanitizedStatus(status, Object.fromEntries(params.entries())));
   }
   sendJson(res, 200, { ok: true, rows, sourceLabel: 'Radar CrewCheck', providerStatus: radarProviderStatus(), updatedAt: new Date().toISOString() });
  } catch (error) {
   sendJson(res, 200, { ok: false, rows: [], sourceLabel: 'Radar CrewCheck', message: 'Radar em lote indisponível no momento.', updatedAt: new Date().toISOString() });
  }
  return true;
 }

 if (url.pathname === '/api/radar/reverse-test' && req.method === 'GET') {
  const user = await requireAuth(req, res);
  if (!user) return true;
  const airport = String(url.searchParams.get('airport') || 'BSB').toUpperCase().slice(0, 3);
  const type = String(url.searchParams.get('type') || 'departure').toLowerCase() === 'arrival' ? 'arrival' : 'departure';
  const query = new URLSearchParams({ airport, type, limit: String(url.searchParams.get('limit') || '25'), diagnostics: '1', apiFirst: '1', refresh: '1' });
  const startedAt = Date.now();
  const snapshot = await getAirportBoardSnapshot(query);
  return sendJson(res, 200, {
   ok: rowsAreUseful(snapshot?.rows),
   airport,
   type,
   count: snapshot?.rows?.length || 0,
   source: snapshot?.source,
   message: snapshot?.message,
   updatedAt: snapshot?.updatedAt,
   durationMs: Date.now() - startedAt,
   diagnostics: snapshot?.diagnostics || [],
   sample: (snapshot?.rows || []).slice(0, 5),
   providerStatus: radarProviderStatus(),
   rateGuard: Object.fromEntries([...aviationstackThrottleState.entries()].map(([key, value]) => [key, { waitMs: Math.max(0, (value.until || 0) - Date.now()), reason: value.reason }]))
  });
 }


 if (url.pathname === '/api/sabre-health' && req.method === 'GET') {
  const user = await requireAuth(req, res);
  if (!user) return true;
  const isAdmin = isC32FAdminEmail(user.email) || String(user.role || '').toLowerCase() === 'admin';
  if (!isAdmin) { sendJson(res, 403, { ok: false, message: 'Acesso restrito ao administrador.' }); return true; }
  const testToken = ['1', 'true', 'yes'].includes(String(url.searchParams.get('testToken') || '').toLowerCase());
  const health = await sabreHealthSnapshot({ testToken });
  sendJson(res, 200, health);
  return true;
 }

 if (url.pathname === '/api/radar-health' && req.method === 'GET') {
  const user = await requireAuth(req, res);
  if (!user) return true;
  const hasAviationstack = Boolean(aviationstackAccessKey());
  const airport = String(url.searchParams.get('airport') || 'BSB').toUpperCase().slice(0, 3);
  const type = String(url.searchParams.get('type') || 'departure').toLowerCase() === 'arrival' ? 'arrival' : 'departure';
  const diagParams = new URLSearchParams({ airport, type, limit: '10', diagnostics: '1' });
  if (url.searchParams.get('airline')) diagParams.set('airline', url.searchParams.get('airline'));
  const board = await getAirportBoardSnapshot(diagParams);
  sendJson(res, 200, {
   ok: true,
   hasAviationstack,
   hasFlightStats: flightStatsCredentials().ready,
   hasSearchAPI: Boolean(SEARCHAPI_API_KEY),
   hasSerpAPI: Boolean(SERPAPI_API_KEY),
   hasSabre: sabreReady(),
   providerStatus: board.providerStatus || radarProviderStatus(),
   externalSources: [],
   baseCandidates: hasAviationstack ? aviationstackBaseCandidates().map((base) => base.replace(/access_key=[^&]+/g, 'access_key=***')) : [],
   airport,
   type,
   rows: Array.isArray(board.rows) ? board.rows.length : 0,
   source: board.source,
   message: board.message,
   diagnostics: dedupeDiagnostics(board.diagnostics || []),
   rateGuard: Object.fromEntries([...aviationstackThrottleState.entries()].map(([key, value]) => [key, { waitMs: Math.max(0, (value.until || 0) - Date.now()), reason: value.reason }])),
   updatedAt: new Date().toISOString(),
  });
  return true;
 }


 if (url.pathname === '/api/ride-apps/diagnostics' && req.method === 'GET') {
  const result = {
   ok: true,
   uberConfigured: Boolean(process.env.UBER_CLIENT_ID && process.env.UBER_CLIENT_SECRET),
   uberGuestEstimates: isTruthyEnv(process.env.UBER_GUEST_ESTIMATES_ENABLED),
   uberMultiEndpoint: isTruthyEnv(process.env.UBER_FORCE_MULTI_ENDPOINTS),
   deepLinkEnabled: isTruthyEnv(process.env.UBER_RIDE_DEEPLINK_ENABLED),
   mode: process.env.UBER_ENV || 'testing',
   note: 'O CrewCheck tenta Uber Guest Trip Estimates, Price Estimates quando disponível e fallback auditável com deep link oficial. Escopos não aprovados pela Uber não podem ser forçados pelo código.',
  };
  json(res, 200, result);
  return;
 }

 if (url.pathname === '/api/smart-departure/address/validate' && (req.method === 'GET' || req.method === 'POST')) {
  try {
   const body = req.method === 'POST' ? await readJsonBody(req, 128 * 1024).catch(() => ({})) : {};
   const cep = url.searchParams.get('cep') || body.cep || '';
   const address = url.searchParams.get('address') || body.address || '';
   const result = await geocodeCrewCheckAddress({ address, cep });
   sendJson(res, result.ok ? 200 : 422, result);
  } catch (error) {
   sendJson(res, 422, { ok: false, code: 'ADDRESS_VALIDATE_ERROR', message: sanitizePublicError(error?.message || String(error)) });
  }
  return true;
 }

 if (url.pathname === '/api/smart-departure/diagnostics' && req.method === 'GET') {
  const origin = { lat: parseFiniteNumber(url.searchParams.get('lat'), -15.8399), lng: parseFiniteNumber(url.searchParams.get('lng'), -48.0462) };
  const destination = CREWCHECK_AIRPORT_COORDS[normalizeAirportCode(url.searchParams.get('airport') || 'BSB')];
  const result = { ok: true, mapsKeyConfigured: Boolean(getGoogleServerKey()), routes: null, directions: null, geocoding: null, errors: [] };
  try { result.routes = await computeGoogleRoutesPlan({ origin, destination, departureTime: new Date().toISOString(), mode: 'DRIVE' }); } catch (error) { result.errors.push(`Routes: ${sanitizePublicError(error?.message || error)}`); }
  try { result.directions = await computeLegacyDirectionsPlan({ origin, destination, departureTime: new Date().toISOString(), mode: 'DRIVE' }); } catch (error) { result.errors.push(`Directions: ${sanitizePublicError(error?.message || error)}`); }
  try { result.geocoding = await geocodeCrewCheckAddress({ cep: url.searchParams.get('cep') || '72000000', address: url.searchParams.get('address') || 'Taguatinga, DF' }); } catch (error) { result.errors.push(`Geocoding: ${sanitizePublicError(error?.message || error)}`); }
  sendJson(res, 200, result);
  return true;
 }

 if (url.pathname === '/api/smart-departure' && req.method === 'GET') {
  try {
   const plan = await getSmartDeparturePlan(url.searchParams);
   const shouldNotifyTelegram = ['1', 'true', 'yes'].includes(String(url.searchParams.get('telegramNotify') || '').toLowerCase());
   if (shouldNotifyTelegram && plan?.ok !== false) {
    const optionalUser = await getAuthUser(req).catch(() => null);
    const db = getPool();
    if (db && optionalUser?.id) {
     await notifyTelegramForUser(db, optionalUser.id, 'smartDeparture', 'Saída Inteligente calculada', [
      plan.leaveLabel || plan.message || 'Plano calculado com sucesso.',
      plan.targetLabel ? `Destino: ${plan.targetLabel}` : '',
      plan.modeLabel ? `Melhor deslocamento: ${plan.modeLabel}` : '',
      plan.durationMinutes ? `Tempo estimado: ${plan.durationMinutes} min${plan.distanceKm ? ` · ${plan.distanceKm} km` : ''}` : '',
      plan.estimateDisclosure ? `Trânsito/dados: ${plan.estimateDisclosure}${plan.source ? ` · ${plan.source}` : ''}` : '',
      plan.warning ? `Atenção: ${plan.warning}` : '',
      Array.isArray(plan.transitBoard) && plan.transitBoard[0]?.line ? `Transporte público: ${plan.transitBoard[0].line}${plan.transitBoard[0].departureLabel ? ` · ${plan.transitBoard[0].departureLabel}` : ''}` : '',
     ]).catch(() => null);
    }
   }
   sendJson(res, plan.ok === false ? 400 : 200, plan);
  } catch (error) {
   sendJson(res, 200, { ok: false, code: 'SMART_DEPARTURE_UNAVAILABLE', message: 'Não foi possível calcular a saída inteligente agora.', detail: sanitizePublicError(error?.message || String(error)) });
  }
  return true;
 }

 if (url.pathname === '/api/flight-status' && req.method === 'GET') {
  try {
   const status = await getFlightStatusSnapshot(url.searchParams);
   sendJson(res, 200, status);
  } catch (error) {
   sendJson(res, 200, { ok: true, status: 'Scheduled', gate: null, terminal: null, source: 'Sem dados online', updatedAt: new Date().toISOString() });
  }
  return true;
 }

 if (url.pathname === '/api/parse-payslip' && req.method === 'POST') {
  try {
   const body = await readJsonBody(req, 25 * 1024 * 1024);
   const parsed = await parsePayslipOnServer({ filename: body.filename || 'holerite.pdf', dataBase64: body.dataBase64 });
   sendJson(res, 200, { ok: true, ...parsed });
  } catch (err) {
   sendJson(res, 422, { ok: false, message: 'Não consegui ler o holerite no servidor.', detail: err?.message || String(err) });
  }
  return true;
 }

 if (url.pathname === '/api/parse-pdf' && req.method === 'POST') {
  try {
   const body = await readJsonBody(req, 35 * 1024 * 1024);
   const parsed = await parsePdfOnServer({ filename: body.filename || 'escala.pdf', dataBase64: body.dataBase64 });
   sendJson(res, 200, { ok: true, ...parsed });
  } catch (err) {
   sendJson(res, 422, { ok: false, message: 'Não consegui interpretar este PDF no servidor.', detail: err?.message || String(err) });
  }
  return true;
 }


 if (url.pathname === '/api/iflight/autopull-health' && req.method === 'GET') {
  sendJson(res, 200, iflightAutoPullCapabilities());
  return true;
 }

 if (url.pathname === '/api/iflight/autopull-spec' && req.method === 'GET') {
  sendJson(res, 200, {
   ...iflightAutoPullCapabilities(),
   flow: [
    'abrir portal oficial iFlight dentro do CrewCheck quando ponte nativa estiver disponível',
    'usuário informa login, senha e MFA no próprio portal oficial',
    'CrewCheck mascara a navegação após autenticação',
    'ler primeiro o Roster Calendar do mês selecionado',
    'coletar detalhes de programação/tripulação quando disponíveis',
    'não depender de PDF; PDF permanece apenas como fallback manual quando o calendário não expuser dados suficientes',
    'sincronizar escala para cockpit, escala, diárias, salário, saída inteligente, radar e calendário',
   ],
   backendCredentialsAccepted: false,
  });
  return true;
 }

 if (url.pathname === '/api/parse-iflight-calendar' && req.method === 'POST') {
  try {
   const body = await readJsonBody(req, 3 * 1024 * 1024);
   const parsed = parseIFlightCalendarTextV10845({
    text: body.text || body.calendarText || '',
    filename: body.filename || 'iFlight_RosterCalendar.txt',
    periodMonth: body.periodMonth,
    periodYear: body.periodYear,
   });
   sendJson(res, 200, { ok: true, ...parsed });
  } catch (err) {
   sendJson(res, 422, { ok: false, message: 'Não consegui interpretar o calendário do iFlight ainda.', detail: err?.message || String(err) });
  }
  return true;
 }



 if (url.pathname === '/api/iflight/import' && req.method === 'POST') {
  const user = await requireAuth(req, res);
  if (!user) return true;
  try {
   const body = await readJsonBody(req, 256 * 1024);
   const username = String(body.username || '').trim();
   const password = String(body.password || '');
   const periodMonth = String(body.periodMonth || '').padStart(2, '0');
   const periodYear = String(body.periodYear || '');
   const mfaCode = String(body.mfaCode || '').trim();
   const challengeSessionId = String(body.challengeSessionId || '').trim();
   const step = body.step === 'mfa' ? 'mfa' : 'start';
   sendJson(res, 410, { ok: false, code: 'IFLIGHT_CREDENTIAL_ENDPOINT_DISABLED', message: 'Por LGPD e segurança, o CrewCheck não recebe usuário, senha nem MFA corporativos no backend. O AutoPull deve abrir o portal oficial dentro do app/WebView: login, senha e MFA ficam no iFlight, e o CrewCheck captura apenas calendário/dados/PDF autorizados pela sessão local.' });
   return true;
   if (!username || !password || !/^\d{2}$/.test(periodMonth) || !/^\d{4}$/.test(periodYear)) {
    sendJson(res, 400, { ok: false, message: 'Informe usuário, senha, mês e ano para tentar a importação iFlight.' });
    return true;
   }
   if (step === 'mfa' && !mfaCode) {
    sendJson(res, 400, { ok: false, message: 'Informe o código MFA recebido para continuar.' });
    return true;
   }
   const imported = await importIFlightRoster({ username, password, periodMonth, periodYear, mfaCode, challengeSessionId, step });
   sendJson(res, 200, { ok: true, ...imported });
  } catch (error) {
   sendJson(res, error.statusCode || 500, {
    ok: false,
    code: error.code || 'IFLIGHT_IMPORT_FAILED',
    message: error.message || 'Não foi possível importar a escala do iFlight automaticamente.',
   });
  }
  return true;
 }


 if (url.pathname === '/api/auth/config' && req.method === 'GET') {
  sendJson(res, 200, {
   ok: true,
   emailVerificationRequired: EMAIL_VERIFICATION_REQUIRED,
   captchaRequired: CREWCHECK_CAPTCHA_REQUIRED,
   turnstileSiteKey: TURNSTILE_SITE_KEY || null,
   captchaProvider: TURNSTILE_SITE_KEY ? 'cloudflare-turnstile' : null,
  });
  return true;
 }

 if (url.pathname === '/api/auth/verify-email' && req.method === 'POST') {
  const db = requireDatabase(res);
  if (!db) return true;
  try {
   await ensureSchema();
   const body = await readJsonBody(req, 64 * 1024);
   const email = normalizeEmail(body.email);
   const code = String(body.code || body.token || '').trim();
   assertAuthRateLimit(['verify-email', email || getRequestIp(req)]);
   if (!email || !email.includes('@') || !code) {
    sendJson(res, 400, { ok: false, code: 'VERIFICATION_REQUIRED', message: 'Informe e-mail e código de confirmação.' });
    return true;
   }
   const result = await db.query('select * from crewcheck_users where email = $1 and is_active = true limit 1', [email]);
   const user = result.rows[0];
   if (!user) {
    sendJson(res, 400, { ok: false, code: 'VERIFICATION_INVALID', message: 'Código inválido ou expirado.' });
    return true;
   }
   if (user.email_verified) {
    const session = await createSession(db, user, req);
    sendJson(res, 200, { ok: true, alreadyVerified: true, user: publicUser(user), token: session.token, expiresAt: session.expiresAt });
    return true;
   }
   const expiresAt = user.email_verification_expires_at ? new Date(user.email_verification_expires_at).getTime() : 0;
   const expectedHash = String(user.email_verification_token_hash || '');
   const actualHash = emailVerificationHash(email, code);
   if (!expectedHash || expiresAt < Date.now() || expectedHash !== actualHash) {
    sendJson(res, 400, { ok: false, code: 'VERIFICATION_INVALID', message: 'Código inválido ou expirado. Solicite um novo código.' });
    return true;
   }
   await db.query(
    `update crewcheck_users
      set email_verified = true,
        email_verified_at = now(),
        email_verification_token_hash = null,
        email_verification_expires_at = null,
        updated_at = now()
     where id = $1`,
    [user.id],
   );
   const freshUser = await reloadUserById(db, user.id) || { ...user, email_verified: true, email_verified_at: new Date().toISOString() };
   const session = await createSession(db, freshUser, req);
   await db.query('insert into crewcheck_audit_logs (id, user_id, action, metadata) values ($1, $2, $3, $4::jsonb)', [newId(), freshUser.id, 'auth.email_verified', JSON.stringify({ email: maskEmailForLog(email) })]).catch(() => null);
   sendJson(res, 200, { ok: true, user: publicUser(freshUser), token: session.token, expiresAt: session.expiresAt });
  } catch (error) {
   sendJson(res, error.statusCode || 500, { ok: false, code: error.code || 'EMAIL_VERIFY_FAILED', message: error.message || 'Não foi possível validar o e-mail.', detail: error.detail || error.message });
  }
  return true;
 }

 if (url.pathname === '/api/auth/resend-verification' && req.method === 'POST') {
  const db = requireDatabase(res);
  if (!db) return true;
  try {
   await ensureSchema();
   const body = await readJsonBody(req, 64 * 1024);
   const email = normalizeEmail(body.email);
   assertAuthRateLimit(['resend-verification', email || getRequestIp(req)]);
   if (!email || !email.includes('@')) {
    sendJson(res, 400, { ok: false, message: 'Informe um e-mail válido.' });
    return true;
   }
   const result = await db.query('select * from crewcheck_users where email = $1 and is_active = true limit 1', [email]);
   const user = result.rows[0];
   let sent = false;
   let emailStatus = null;
   if (user && !user.email_verified) {
    emailStatus = await sendVerificationEmailForUser(db, user, 'resend');
    sent = Boolean(emailStatus.ok);
   }
   sendJson(res, 200, { ok: true, sent, emailSent: sent, emailStatus, message: 'Se o e-mail estiver aguardando validação, enviaremos um novo código.' });
  } catch (error) {
   sendJson(res, error.statusCode || 500, { ok: false, code: error.code || 'EMAIL_RESEND_FAILED', message: error.message || 'Não foi possível reenviar o código.', detail: error.detail || error.message });
  }
  return true;
 }

 if (url.pathname === '/api/auth/register' && req.method === 'POST') {
  const db = requireDatabase(res);
  if (!db) return true;
  try {
   await ensureSchema();
   const body = await readJsonBody(req, 256 * 1024);
   const email = normalizeEmail(body.email);
   const password = String(body.password || '');
   const confirmPassword = String(body.confirmPassword || '');
   const cleanNamePart = (value) => String(value || '').trim().replace(/\s+/g, ' ').replace(/[<>]/g, '').slice(0, 80);
   const firstName = cleanNamePart(body.firstName || String(body.name || '').split(/\s+/)[0] || '');
   const lastName = cleanNamePart(body.lastName || String(body.name || '').split(/\s+/).slice(1).join(' ') || '');
   const fullName = cleanNamePart(`${firstName} ${lastName}`);
   const remoteIp = getRequestIp(req);
   assertAuthRateLimit(['register', remoteIp]);
   if (email) assertAuthRateLimit(['register-email', email]);
   if (!email || !email.includes('@') || password.length < 6 || password !== confirmPassword) {
    sendJson(res, 400, { ok: false, message: 'Informe e-mail válido, senha com pelo menos 6 caracteres e confirmação idêntica.' });
    return true;
   }
   if (!firstName || !lastName || fullName.length < 4) {
    sendJson(res, 400, { ok: false, message: 'Informe nome e sobrenome para criar a conta e facilitar a cobrança recorrente no Asaas.' });
    return true;
   }
   if (isLatamCorporateEmail(email)) {
    sendJson(res, 400, { ok: false, code: 'CORPORATE_EMAIL_NOT_ALLOWED', message: 'Use um e-mail pessoal para criar a conta CrewCheck. O e-mail corporativo @latam.com é permitido somente no login do portal iFlight.' });
    return true;
   }
   const captchaResult = await verifyTurnstileToken({ token: body.turnstileToken || body.captchaToken, remoteIp });
   const hasVirtualBase = Boolean(body.hasVirtualBase || body.virtualBaseEnabled);
   const virtualBaseAirport = hasVirtualBase ? String(body.virtualBase || body.virtualBaseAirport || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) : null;
   if (hasVirtualBase && !virtualBaseAirport) {
    sendJson(res, 400, { ok: false, message: 'Informe a sigla da base virtual para concluir o cadastro.' });
    return true;
   }
   const telegramUsernameRaw = String(body.telegramUsername || body.telegram_username || body.telegram || '').trim();
   const telegramUsername = normalizeTelegramUsername(telegramUsernameRaw);
   if (hasTelegramUsernameInput(telegramUsernameRaw) && !isValidTelegramUsername(telegramUsername)) {
    sendJson(res, 400, { ok: false, message: 'Informe um usuário do Telegram válido: 5 a 32 caracteres, usando letras, números ou underline. O @ já é automático.' });
    return true;
   }
   const name = fullName;
   const emailVerification = makeEmailVerificationPayload(email);
   const shouldVerifyEmail = EMAIL_VERIFICATION_REQUIRED;
   const userResult = await db.query(
    `insert into crewcheck_users (
      id, name, email, password_hash, role, crew_id, base, rank,
      temp_password_hash, temp_password_expires_at,
      email_verified, email_verified_at, email_verification_token_hash, email_verification_expires_at, email_verification_sent_at,
      registration_ip, registration_user_agent, registration_captcha_provider, virtual_base_enabled, virtual_base_airport
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,now(),$15,$16,$17,$18,$19)
     returning *`,
    [
     newId(),
     name,
     email,
     hashPassword(password),
     body.role || 'crew',
     null,
     null,
     null,
     null,
     null,
     !shouldVerifyEmail,
     shouldVerifyEmail ? null : new Date().toISOString(),
     shouldVerifyEmail ? emailVerification.tokenHash : null,
     shouldVerifyEmail ? emailVerification.expiresAt : null,
     remoteIp || null,
     req.headers['user-agent'] || null,
     captchaResult.provider || null,
     hasVirtualBase,
     virtualBaseAirport,
    ],
   );
   let user = userResult.rows[0];
   if (telegramUsername) await ensureTelegramLinkForUser(db, user, telegramUsername).catch(() => null);
   if (hasLifetimePremiumAccess(user)) user = await ensureLifetimeBillingState(db, user);
   let emailResult = { ok: false, configured: false };
   if (shouldVerifyEmail) {
    try {
     const verificationMail = buildEmailVerificationEmail({ email, code: emailVerification.code });
     emailResult = await sendEmail({ to: email, ...verificationMail });
    } catch (mailError) {
     emailResult = { ok: false, configured: true, message: mailError.message };
    }
   } else {
    try {
     const temporaryPassword = generateTemporaryPassword();
     const temporaryExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
     await db.query('update crewcheck_users set temp_password_hash = $1, temp_password_expires_at = $2, updated_at = now() where id = $3', [hashPassword(temporaryPassword), temporaryExpiresAt, user.id]);
     const welcome = buildWelcomeEmail({ email, temporaryPassword });
     emailResult = await sendEmail({ to: email, ...welcome });
     user = await reloadUserById(db, user.id) || user;
    } catch (mailError) {
     emailResult = { ok: false, configured: true, message: mailError.message };
    }
   }
   await db.query('insert into crewcheck_audit_logs (id, user_id, action, metadata) values ($1, $2, $3, $4::jsonb)', [
    newId(),
    user.id,
    'auth.register',
    JSON.stringify({ email: maskEmailForLog(email), hasName: Boolean(name), emailVerificationRequired: shouldVerifyEmail, verificationEmailSent: Boolean(emailResult.ok), captcha: captchaResult.provider || null, hasVirtualBase, virtualBaseAirport, telegramUsernameRequested: Boolean(telegramUsername), telegramUsernameMasked: telegramMaskUsername(telegramUsername) }),
   ]).catch(() => null);
   if (shouldVerifyEmail) {
    sendJson(res, 201, {
     ok: true,
     verificationRequired: true,
     emailVerificationRequired: true,
     emailSent: Boolean(emailResult.ok),
     emailStatus: emailResult,
     message: 'Cadastro criado. Enviamos um código de confirmação para o seu e-mail. Confirme antes de entrar.',
    });
   } else {
    const session = await createSession(db, user, req);
    sendJson(res, 201, { ok: true, user: publicUser(user), token: session.token, expiresAt: session.expiresAt, welcomeEmailSent: Boolean(emailResult.ok), emailStatus: emailResult });
   }
  } catch (error) {
   if (String(error.message || '').includes('duplicate') || error.code === '23505' || error.code === 'ER_DUP_ENTRY') {
    sendJson(res, 409, { ok: false, message: 'Este e-mail já está cadastrado. Faça login.' });
   } else {
    sendJson(res, error.statusCode || 500, { ok: false, message: error.message || 'Não foi possível criar o cadastro.', detail: error.detail || error.message, code: error.code, db: dbErrorInfo(error) });
   }
  }
  return true;
 }


 if (url.pathname === '/api/auth/request-reset' && req.method === 'POST') {
  const db = requireDatabase(res);
  if (!db) return true;
  try {
   await ensureSchema();
   const body = await readJsonBody(req, 128 * 1024);
   const email = normalizeEmail(body.email);
   if (!email || !email.includes('@')) {
    sendJson(res, 400, { ok: false, message: 'Informe um e-mail válido.' });
    return true;
   }
   const result = await db.query('select * from crewcheck_users where email = $1 and is_active = true limit 1', [email]);
   const user = result.rows[0];
   let emailResult = { ok: false, configured: false };
   if (user) {
    const temporaryPassword = String(Math.floor(100000 + Math.random() * 900000));
    const temporaryExpiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    await db.query('update crewcheck_users set temp_password_hash = $1, temp_password_expires_at = $2, updated_at = now() where id = $3', [hashPassword(temporaryPassword), temporaryExpiresAt, user.id]);
    try {
     const mail = buildPasswordResetEmail({ email, temporaryPassword });
     emailResult = await sendEmail({ to: email, ...mail });
    } catch (mailError) {
     emailResult = { ok: false, configured: true, message: mailError.message };
    }
    await db.query('insert into crewcheck_audit_logs (id, user_id, action, metadata) values ($1, $2, $3, $4::jsonb)', [newId(), user.id, 'auth.password_reset.requested', JSON.stringify({ email, emailSent: Boolean(emailResult.ok), tempPasswordExpiresAt: temporaryExpiresAt })]);
   }
   // Resposta neutra para não revelar se o e-mail existe.
   sendJson(res, 200, { ok: true, emailSent: Boolean(emailResult.ok), emailStatus: emailResult });
  } catch (error) {
   sendJson(res, 500, { ok: false, message: 'Não foi possível solicitar recuperação de senha.', detail: error.message, code: error.code, db: dbErrorInfo(error) });
  }
  return true;
 }

 if (url.pathname === '/api/auth/reset-password' && req.method === 'POST') {
  const db = requireDatabase(res);
  if (!db) return true;
  try {
   await ensureSchema();
   const body = await readJsonBody(req, 128 * 1024);
   const email = normalizeEmail(body.email);
   const code = String(body.code || body.temporaryPassword || '').trim();
   const password = String(body.password || '');
   const confirmPassword = String(body.confirmPassword || '');
   if (!email || !email.includes('@') || !code || password.length < 6 || password !== confirmPassword) {
    sendJson(res, 400, { ok: false, message: 'Informe e-mail, código temporário e nova senha com confirmação idêntica.' });
    return true;
   }
   const result = await db.query('select * from crewcheck_users where email = $1 and is_active = true limit 1', [email]);
   const user = result.rows[0];
   if (!user || !canUseTemporaryPassword(code, user)) {
    sendJson(res, 400, { ok: false, code: 'INVALID_RESET_CODE', message: 'Código temporário inválido ou expirado. Solicite um novo código.' });
    return true;
   }
   await db.query('update crewcheck_users set password_hash = $1, temp_password_hash = null, temp_password_expires_at = null, email_verified = true, email_verified_at = coalesce(email_verified_at, now()), updated_at = now() where id = $2', [hashPassword(password), user.id]);
   await db.query('insert into crewcheck_audit_logs (id, user_id, action, metadata) values ($1, $2, $3, $4::jsonb)', [newId(), user.id, 'auth.password_reset.completed', JSON.stringify({ email: maskEmailForLog(email) })]).catch(() => null);
   sendJson(res, 200, { ok: true, message: 'Senha redefinida com sucesso.' });
  } catch (error) {
   sendJson(res, 500, { ok: false, message: 'Não foi possível redefinir a senha.', detail: error.message, code: error.code, db: dbErrorInfo(error) });
  }
  return true;
 }


 if (url.pathname === '/api/auth/login' && req.method === 'POST') {
  const db = requireDatabase(res);
  if (!db) return true;
  try {
   await ensureSchema();
   const body = await readJsonBody(req, 256 * 1024);
   const email = normalizeEmail(body.email);
   const password = String(body.password || '');
   if (email === CREWCHECK_TEST_ACCOUNT_EMAIL) await ensureCrewCheckTestAccount(db);
   const result = await db.query('select * from crewcheck_users where email = $1 and is_active = true limit 1', [email]);
   const user = result.rows[0];
   const validMainPassword = user && verifyPassword(password, user.password_hash);
   const validTemporaryPassword = user && canUseTemporaryPassword(password, user);
   if (!user || (!validMainPassword && !validTemporaryPassword)) {
    sendJson(res, 401, { ok: false, message: 'E-mail ou senha inválidos.' });
    return true;
   }
   if (EMAIL_VERIFICATION_REQUIRED && (user.email_verified === false || user.email_verified === 0 || user.email_verified === '0')) {
    let emailResult = null;
    try {
     const lastSent = user.email_verification_sent_at ? new Date(user.email_verification_sent_at).getTime() : 0;
     if (!lastSent || Date.now() - lastSent > 90_000) emailResult = await sendVerificationEmailForUser(db, user, 'login-blocked');
    } catch (mailError) {
     emailResult = { ok: false, message: mailError.message };
    }
    sendJson(res, 403, { ok: false, code: 'EMAIL_NOT_VERIFIED', message: 'Verifique seu e-mail antes de entrar. Enviamos um novo código caso o anterior tenha expirado.', emailSent: Boolean(emailResult?.ok) });
    return true;
   }
   if (validTemporaryPassword) {
    sendJson(res, 403, { ok: false, code: 'TEMP_PASSWORD_REQUIRES_RESET', message: 'Código temporário validado apenas na recuperação de senha. Defina uma nova senha antes de entrar.' });
    return true;
   }
   const session = await createSession(db, user, req);
   sendJson(res, 200, { ok: true, user: publicUser(user), token: session.token, expiresAt: session.expiresAt });
  } catch (error) {
   sendJson(res, 500, { ok: false, message: 'Não foi possível fazer login.', detail: error.message });
  }
  return true;
 }

 if (url.pathname === '/api/auth/me' && req.method === 'GET') {
  const user = await requireAuth(req, res);
  if (!user) return true;
  sendJson(res, 200, { ok: true, user: publicUser(user) || user });
  return true;
 }

 if (url.pathname === '/api/auth/logout' && req.method === 'POST') {
  const db = requireDatabase(res);
  if (!db) return true;
  const token = getBearerToken(req);
  if (token) {
   try {
    await ensureSchema();
    await db.query('delete from crewcheck_sessions where token_hash = $1', [tokenHash(token)]);
   } catch {
    // logout local deve continuar mesmo se o banco falhar
   }
  }
  sendJson(res, 200, { ok: true });
  return true;
 }


 if (url.pathname === '/api/account' && req.method === 'DELETE') {
  const user = await requireAuth(req, res);
  if (!user) return true;
  const db = requireDatabase(res);
  if (!db) return true;
  if (!user.id) {
   sendJson(res, 400, { ok: false, message: 'Modo local/offline não possui conta de servidor para excluir. Limpe os dados do app no dispositivo.' });
   return true;
  }
  try {
   await ensureSchema();
   const userId = user.id;
   const email = user.email || null;
   await db.query('delete from crewcheck_sessions where user_id = $1', [userId]);
   await db.query('delete from crewcheck_rosters where user_id = $1', [userId]);
   await db.query('delete from crewcheck_audit_logs where user_id = $1', [userId]);
   const exists = await db.query('select id from crewcheck_users where id = $1 limit 1', [userId]);
   await db.query('delete from crewcheck_users where id = $1', [userId]);
   const result = { rowCount: exists.rowCount || exists.rows?.length || 0 };
   try {
    const subject = 'Conta CrewCheck excluída';
    const text = `A conta CrewCheck vinculada ao e-mail ${email || ''} foi excluída junto com os dados associados salvos no servidor. Caso você não tenha solicitado esta ação, responda este e-mail.`;
    if (email) await sendEmail({ to: email, subject, text, html: `<p>${escapeHtml(text)}</p>` });
   } catch {
    // A exclusão não deve falhar por indisponibilidade do e-mail transacional.
   }
   sendJson(res, result.rowCount ? 200 : 404, { ok: Boolean(result.rowCount), deleted: Boolean(result.rowCount) });
  } catch (error) {
   sendJson(res, 500, { ok: false, message: 'Não foi possível excluir a conta e os dados.', detail: error.message, code: error.code, db: dbErrorInfo(error) });
  }
  return true;
 }

 if (url.pathname === '/api/db/status') {
  const db = requireDatabase(res);
  if (!db) return true;
  try {
   await ensureSchema();
   const result = DB_KIND === 'mysql'
    ? await db.query(`select now() as now, database() as database_name, current_user() as user_name, @@hostname as server_name, @@port as server_port`)
    : await db.query(`select now() as now, current_database() as database, current_user as user_name,
        inet_server_addr()::text as server_addr, inet_server_port() as server_port`);
   sendJson(res, 200, { ok: true, connected: true, databaseConfigured: Boolean(DATABASE_URL), engine: DB_KIND, ...result.rows[0] });
  } catch (error) {
   sendJson(res, 500, { ok: false, connected: false, databaseConfigured: Boolean(DATABASE_URL), engine: DB_KIND, message: 'Falha ao conectar ou migrar a base de dados.', detail: error.message, code: error.code, db: dbErrorInfo(error) });
  }
  return true;
 }


 if (url.pathname === '/api/stats' && req.method === 'GET') {
  const user = await requireAuth(req, res);
  if (!user) return true;
  const db = requireDatabase(res);
  if (!db) return true;
  try {
   await ensureSchema();
   const personalLimit = Math.min(Math.max(Number(url.searchParams.get('limit') || 60), 1), 120);
   const personalResult = await db.query(
    `select id, created_at, period_year, period_month, roster_json, compliance_json, gym_json, score, intensity_score, alerts_count, critical_alerts_count
      from crewcheck_rosters
     where ($1::uuid is null or user_id = $1)
     order by period_year asc, period_month asc, created_at asc
     limit $2`,
    [user.id || null, personalLimit],
   );
   const globalResult = await db.query(
    `select id, created_at, period_year, period_month, roster_json, compliance_json, gym_json, score, intensity_score, alerts_count, critical_alerts_count
      from crewcheck_rosters
     order by created_at desc
     limit 500`,
    [],
   );
   sendJson(res, 200, {
    ok: true,
    personal: buildStatsFromRosterRows(personalResult.rows, 'personal'),
    global: buildStatsFromRosterRows(globalResult.rows, 'global'),
    notice: 'Comparativo geral agregado e superficial. Não use como prova, documento oficial ou argumento contra empresa/terceiros.',
   });
  } catch (error) {
   sendJson(res, 500, { ok: false, message: 'Não foi possível gerar estatísticas.', detail: error.message, code: error.code, db: dbErrorInfo(error) });
  }
  return true;
 }

 if (url.pathname === '/api/rosters' && req.method === 'GET') {
  const user = await requireAuth(req, res);
  if (!user) return true;
  const db = requireDatabase(res);
  if (!db) return true;
  try {
   await ensureSchema();
   if (!user.id) {
    sendJson(res, 200, { ok: true, rosters: [], message: 'Histórico pessoal indisponível sem usuário autenticado.' });
    return true;
   }
   const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 20), 1), 100);
   const result = await db.query(
    `select id, created_at, updated_at, crew_name, crew_id, base, rank, airline, period_year, period_month,
        source_file_name, score, intensity_score, alerts_count, critical_alerts_count, checksum
      from crewcheck_rosters
     where user_id = $2
     order by created_at desc
     limit $1`,
    [limit, user.id],
   );
   sendJson(res, 200, { ok: true, rosters: dedupeRosterRowsByPeriod(result.rows).map(summarizeRosterRow) });
  } catch (error) {
   sendJson(res, 500, { ok: false, message: 'Não foi possível listar as escalas salvas.', detail: error.message });
  }
  return true;
 }

 if (url.pathname === '/api/rosters' && req.method === 'POST') {
  const user = await requireAuth(req, res);
  if (!user) return true;
  const db = requireDatabase(res);
  if (!db) return true;
  try {
   await ensureSchema();
   const body = await readJsonBody(req);
   const roster = body.roster;
   if (!roster || !Array.isArray(roster.days)) {
    sendJson(res, 400, { ok: false, message: 'Payload inválido: roster.days é obrigatório.' });
    return true;
   }

   await assertRosterBelongsToPremiumUser(db, user, roster, body.sourceFileName || null);
   const billingForRosterSave = billingStatusFromUser(user);
   if (!billingForRosterSave?.premiumAccess && !isBillingAdmin(user)) {
    const existingFree = await db.query('select count(*)::int as total from crewcheck_rosters where user_id = $1', [user.id]).catch(() => ({ rows: [{ total: 0 }] }));
    const totalFree = Number(existingFree.rows?.[0]?.total || 0);
    if (totalFree >= Number(process.env.CREWCHECK_FREE_ROSTER_ARCHIVE_LIMIT || 1)) {
     sendJson(res, 402, { ok: false, code: 'PREMIUM_ARCHIVE_REQUIRED', message: 'O plano gratuito salva apenas uma escala na nuvem. Premium libera histórico de meses, Telegram Concierge completo, diárias e salário.' });
     return true;
    }
   }

   const compliance = body.compliance || null;
   const gym = Array.isArray(body.gym) ? body.gym : [];
   const alerts = Array.isArray(compliance?.alerts) ? compliance.alerts : [];
   const criticalAlerts = alerts.filter((alert) => alert?.severity === 'error');
   const payloadChecksum = body.checksum || checksumPayload({ roster, compliance, gym, sourceFileName: body.sourceFileName || null });

   const existing = await db.query(
    `select id from crewcheck_rosters
     where checksum = $1 and (($2::uuid is null and user_id is null) or user_id = $2)
     limit 1`,
    [payloadChecksum, user.id || null],
   );

   const params = [
    user.id || null,
    roster.crewName || null,
    roster.crewId || null,
    roster.base || null,
    roster.rank || null,
    roster.airline || null,
    Number(roster.year) || null,
    Number(roster.month) || null,
    body.sourceFileName || null,
    JSON.stringify(roster),
    JSON.stringify(compliance),
    JSON.stringify(gym),
    Number(compliance?.score ?? null),
    Number(compliance?.loadAnalysis?.intensityScore ?? null),
    alerts.length,
    criticalAlerts.length,
    payloadChecksum,
   ];

   let result;
   let action = 'roster.created';
   if (existing.rowCount) {
    result = await db.query(
     `update crewcheck_rosters
       set updated_at = now(),
         user_id = $1,
         crew_name = $2,
         crew_id = $3,
         base = $4,
         rank = $5,
         airline = $6,
         period_year = $7,
         period_month = $8,
         source_file_name = $9,
         roster_json = $10::jsonb,
         compliance_json = $11::jsonb,
         gym_json = $12::jsonb,
         score = $13,
         intensity_score = $14,
         alerts_count = $15,
         critical_alerts_count = $16,
         checksum = $17
      where id = $18
      returning id, created_at, updated_at, crew_name, crew_id, base, rank, airline, period_year, period_month,
           source_file_name, score, intensity_score, alerts_count, critical_alerts_count, checksum`,
     [...params, existing.rows[0].id],
    );
    action = 'roster.updated_dedup';
   } else {
    result = await db.query(
     `insert into crewcheck_rosters (
       id, user_id, crew_name, crew_id, base, rank, airline, period_year, period_month, source_file_name,
       roster_json, compliance_json, gym_json, score, intensity_score,
       alerts_count, critical_alerts_count, checksum
      ) values ($18,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb,$13,$14,$15,$16,$17)
      returning id, created_at, updated_at, crew_name, crew_id, base, rank, airline, period_year, period_month,
           source_file_name, score, intensity_score, alerts_count, critical_alerts_count, checksum`,
     [...params, newId()],
    );
   }

   if (user.id && (roster.crewId || roster.base || roster.rank || roster.crewName)) {
    await db.query(
     `update crewcheck_users
       set crew_id = coalesce(nullif($2, ''), crew_id),
         base = coalesce(nullif($3, ''), base),
         rank = coalesce(nullif($4, ''), rank),
         name = case when $5 is not null and length(trim($5)) > 2 then $5 else name end,
         updated_at = now()
      where id = $1`,
     [user.id, roster.crewId || null, roster.base || null, roster.rank || null, roster.crewName || null],
    );
   }

   await db.query('insert into crewcheck_audit_logs (id, user_id, action, entity_id, metadata) values ($1, $2, $3, $4, $5::jsonb)', [
    newId(),
    user.id || null,
    action,
    result.rows[0].id,
    JSON.stringify({ sourceFileName: body.sourceFileName || null, alerts: alerts.length, criticalAlerts: criticalAlerts.length, checksum: payloadChecksum }),
   ]);

   await storeTelegramRosterSnapshotForUser(db, user, { roster, compliance, gym, sourceFileName: body.sourceFileName || null, checksum: payloadChecksum }).catch(() => null);

   const wantsTelegramImportNotice = /^(1|true|yes|sim)$/i.test(String(body.notifyTelegram || body.telegramPush || '').trim());
   if (user.id && wantsTelegramImportNotice) {
    await notifyTelegramForUser(db, user.id, 'roster', existing.rowCount ? 'Escala atualizada' : 'Nova escala importada', [
     `${String(roster.month || '').padStart(2, '0')}/${roster.year || '----'} · Base ${roster.base || 'não informada'}`,
     alerts.length ? `${alerts.length} alerta(s) mapeado(s) · ${criticalAlerts.length} crítico(s).` : 'Nenhum alerta crítico identificado na importação.',
     'Abra o CrewCheck para conferir a programação e os detalhes do dia atual.',
    ]).catch(() => null);
   }

   sendJson(res, existing.rowCount ? 200 : 201, { ok: true, deduplicated: Boolean(existing.rowCount), roster: summarizeRosterRow(result.rows[0]) });
  } catch (error) {
   const status = error.statusCode || 500;
   sendJson(res, status, { ok: false, message: error.code === 'ROSTER_IDENTITY_MISMATCH' ? error.message : 'Não foi possível salvar a escala.', detail: error.message, code: error.code || null, metadata: error.metadata || null });
  }
  return true;
 }

 const rosterMatch = url.pathname.match(/^\/api\/rosters\/([0-9a-f-]{36})$/i);
 if (rosterMatch && req.method === 'GET') {
  const user = await requireAuth(req, res);
  if (!user) return true;
  const db = requireDatabase(res);
  if (!db) return true;
  if (!user.id) {
   sendJson(res, 404, { ok: false, message: 'Escala não encontrada.' });
   return true;
  }
  try {
   await ensureSchema();
   const result = await db.query(
    'select * from crewcheck_rosters where id = $1 and user_id = $2',
    [rosterMatch[1], user.id],
   );
   if (!result.rowCount) {
    sendJson(res, 404, { ok: false, message: 'Escala não encontrada.' });
    return true;
   }
   const row = result.rows[0];
   sendJson(res, 200, {
    ok: true,
    roster: summarizeRosterRow(row),
    data: {
     roster: row.roster_json,
     compliance: row.compliance_json,
     gym: row.gym_json,
    },
   });
  } catch (error) {
   sendJson(res, 500, { ok: false, message: 'Não foi possível abrir a escala salva.', detail: error.message });
  }
  return true;
 }

 if (rosterMatch && req.method === 'DELETE') {
  const user = await requireAuth(req, res);
  if (!user) return true;
  const db = requireDatabase(res);
  if (!db) return true;
  if (!user.id) {
   sendJson(res, 404, { ok: false });
   return true;
  }
  try {
   await ensureSchema();
   const result = await db.query('delete from crewcheck_rosters where id = $1 and user_id = $2 returning id', [rosterMatch[1], user.id]);
   sendJson(res, result.rowCount ? 200 : 404, { ok: Boolean(result.rowCount) });
  } catch (error) {
   sendJson(res, 500, { ok: false, message: 'Não foi possível apagar a escala.', detail: error.message });
  }
  return true;
 }


 if (url.pathname === '/api/support/whatsapp-link' && req.method === 'GET') {
   const user = await requireAuth(req, res);
   if (!user) return true;
   const billing = billingStatusFromUser(user);
   const status = String(billing.status || '').toLowerCase();
   const paidPremium = isBillingAdmin(user) || hasLifetimePremiumAccess(user) || (billing.premiumAccess && status !== 'trialing' && status !== 'trial_expired');
   if (!paidPremium) {
    sendJson(res, 402, { ok: false, code: 'PAID_PREMIUM_REQUIRED', message: 'O suporte por WhatsApp está disponível para assinantes Premium pagos. O teste grátis não inclui WhatsApp.' });
    return true;
   }
   if (!CREWCHECK_SUPPORT_WHATSAPP_URL) {
    sendJson(res, 501, { ok: false, code: 'WHATSAPP_NOT_CONFIGURED', message: 'WhatsApp de suporte ainda não configurado no servidor.' });
    return true;
   }
   sendJson(res, 200, { ok: true, url: CREWCHECK_SUPPORT_WHATSAPP_URL, message: 'Abrindo WhatsApp do suporte CrewCheck.' });
   return true;
  }

  if (url.pathname === '/api/support/contact' && req.method === 'POST') {
  const user = await requireAuth(req, res);
  if (!user) return true;
  const billing = billingStatusFromUser(user);
  if (!billing.premiumAccess && !isBillingAdmin(user)) {
   sendJson(res, 402, { ok: false, code: 'PREMIUM_SUPPORT_REQUIRED', message: 'O suporte direto está disponível para assinantes Premium. O plano gratuito mantém acesso ao manual e FAQ.' });
   return true;
  }
  if (!CREWCHECK_SUPPORT_DESTINATION_EMAIL) {
   sendJson(res, 501, { ok: false, message: 'Suporte interno não configurado. Configure SUPPORT_DESTINATION_EMAIL no Render.' });
   return true;
  }
  try {
   const body = await readJsonBody(req, 512 * 1024);
   const subject = String(body.subject || 'Suporte CrewCheck').slice(0, 160);
   const message = String(body.message || '').slice(0, 20_000);
   const pageUrl = String(body.pageUrl || '').slice(0, 500);
   const context = [
    `Usuário: ${user.name || user.email || 'CrewCheck'}`,
    `E-mail do usuário: ${user.email || 'não informado'}`,
    `Versão: ${body.version || process.env.npm_package_version || '10.8'}`,
    pageUrl ? `URL: ${pageUrl}` : '',
    '',
    'Mensagem:',
    message || 'Usuário solicitou suporte pelo sistema.',
   ].filter(Boolean).join('\n');
   const html = buildCrewCheckEmailHtml({ title: subject, eyebrow: 'Suporte CrewCheck', message: context, actionUrl: pageUrl || publicAppUrl(), actionLabel: 'Abrir CrewCheck', includePlayBadge: false });
   const result = await sendEmail({ to: CREWCHECK_SUPPORT_DESTINATION_EMAIL, subject: `[CrewCheck] ${subject}`, text: context, html, attachments: Array.isArray(body.attachments) ? body.attachments : [] });
   if (!result.ok) {
    sendJson(res, 501, { ok: false, ...result });
    return true;
   }
   const db = getPool();
   if (db) {
    await ensureSchema();
    await db.query('insert into crewcheck_audit_logs (id, user_id, action, metadata) values ($1, $2, $3, $4::jsonb)', [newId(), user.id || null, 'support.contact.sent', JSON.stringify({ provider: result.provider, subject })]).catch(() => null);
   }
   sendJson(res, 200, { ok: true, provider: result.provider, message: 'Mensagem enviada ao suporte CrewCheck.' });
  } catch (error) {
   sendJson(res, 500, { ok: false, message: 'Não foi possível enviar a mensagem ao suporte.', detail: error.message });
  }
  return true;
 }

 if ((url.pathname === '/api/email/share' || url.pathname === '/api/share/email') && req.method === 'POST') {
  const user = await requireAuth(req, res);
  if (!user) return true;
  try {
   const body = await readJsonBody(req, 1024 * 1024);
   const to = normalizeEmail(body.to);
   if (!to || !to.includes('@')) {
    sendJson(res, 400, { ok: false, message: 'Informe um e-mail válido.' });
    return true;
   }
   const subject = String(body.subject || 'Relatório CrewCheck').slice(0, 160);
   const message = String(body.message || 'Segue relatório gerado no CrewCheck.').slice(0, 20_000);
   const html = body.html ? String(body.html).slice(0, 60_000) : `<div style="font-family:Arial,sans-serif;line-height:1.55;color:#092846"><h2>CrewCheck Premium</h2><p>${escapeHtml(message).replace(/\n/g, '<br>')}</p></div>`;
   const result = await sendEmail({ to, subject, text: message, html, attachments: Array.isArray(body.attachments) ? body.attachments : [] });
   if (!result.ok) {
    sendJson(res, 501, { ok: false, ...result });
    return true;
   }
   const db = getPool();
   if (db) {
    await ensureSchema();
    await db.query('insert into crewcheck_audit_logs (id, user_id, action, metadata) values ($1, $2, $3, $4::jsonb)', [
     newId(),
     user.id || null,
     'email.sent',
     JSON.stringify({ to, provider: result.provider, subject }),
    ]);
   }
   sendJson(res, 200, { ok: true, provider: result.provider });
  } catch (error) {
   sendJson(res, 500, { ok: false, message: 'Não foi possível enviar o e-mail.', detail: error.message });
  }
  return true;
 }

 return false;
}

const server = http.createServer(async (req, res) => {
 try {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  const feedMatch = url.pathname.match(/^\/calendar-feed\/([A-Za-z0-9_-]{20,})\.ics$/);
  if (feedMatch && req.method === 'GET') {
   const db = getPool();
   let ics = emptyCalendarFeed();
   if (db) {
    try {
     await ensureSchema();
     const result = await db.query('select ics_content from crewcheck_calendar_feeds where token = $1 limit 1', [feedMatch[1]]);
     if (result.rowCount && result.rows[0]?.ics_content) ics = String(result.rows[0].ics_content);
    } catch (error) {
     console.error('calendar feed error:', error.message);
    }
   }
   res.writeHead(200, {
    'content-type': 'text/calendar; charset=utf-8',
    'cache-control': 'no-store, max-age=0',
    'content-disposition': 'inline; filename="crewcheck.ics"',
   });
   res.end(ics.replace(/\r?\n/g, '\r\n'));
   return;
  }

  if (url.pathname === '/w' || url.pathname === '/wear' || url.pathname === '/relogio') {
   res.writeHead(302, { location: '/watch' });
   res.end();
   return;
  }

  if (url.pathname === '/aw' || url.pathname === '/iwatch' || url.pathname === '/applewatch') {
   res.writeHead(302, { location: '/apple-watch' });
   res.end();
   return;
  }

  if (url.pathname === '/apk' || url.pathname === '/android' || url.pathname === '/baixar-android') {
   res.writeHead(302, { location: CREWCHECK_ANDROID_APK_URL || CREWCHECK_ANDROID_PLAY_URL });
   res.end();
   return;
  }

  if (url.pathname.startsWith('/api/')) {
   const handled = await handleApi(req, res, url);
   if (!handled) sendJson(res, 404, { ok: false, message: 'API endpoint não encontrado.' });
   return;
  }

  if (url.pathname === '/healthz') {
   res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
   res.end(JSON.stringify({ ok: true, app: 'CrewCheck', databaseConfigured: Boolean(DATABASE_URL), authRequired: AUTH_REQUIRED }));
   return;
  }

  let filePath = safeJoin(distDir, url.pathname);
  if (!filePath) {
   res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
   res.end('Bad request');
   return;
  }

  const hasExtension = path.extname(filePath).length > 0;
  if (!(await exists(filePath))) {
   if (!hasExtension || req.headers.accept?.includes('text/html')) {
    filePath = path.join(distDir, 'index.html');
   }
  }

  if (!(await exists(filePath))) {
   res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
   res.end('Build não encontrado. Execute yarn build antes de iniciar.');
   return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const headers = {
   'content-type': mimeTypes.get(ext) || 'application/octet-stream',
   'cache-control': ['.html', '.js', '.css', '.json', '.map'].includes(ext) ? 'no-store, max-age=0, must-revalidate' : 'public, max-age=86400',
  };
  res.writeHead(200, headers);
  fs.createReadStream(filePath).pipe(res);
 } catch (error) {
  console.error(error);
  const wantsJson = req.url?.startsWith('/api/');
  if (wantsJson) {
   sendJson(res, 500, { ok: false, message: 'Erro interno no servidor.', detail: error.message });
   return;
  }
  res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('Erro interno no servidor.');
 }
});

server.listen(port, '0.0.0.0', async () => {
 console.log(`CrewCheck server running on http://0.0.0.0:${port}`);
 console.log(DATABASE_URL ? 'Database: configured' : 'Database: DATABASE_URL not configured');
 console.log(`Auth required: ${AUTH_REQUIRED}`);
 if (DATABASE_URL && AUTO_MIGRATE) {
  try {
   await ensureSchema();
   console.log('Database schema ready.');
  } catch (error) {
   console.error('Database schema error:', error.message);
  }
 }
});

process.on('SIGTERM', async () => {
 if (pool) await pool.end();
 server.close(() => process.exit(0));
});

// --- CrewCheck RC3.1 ultra-precise parser overrides ---
parseServerAims = function(fullText, pages) {
 const h = parseServerHeader(fullText);
 const blocks = buildAimsTextBlocksPrecise(fullText, h.month, h.year);
 const days = [];
 for (let i = 0; i < blocks.length; i++) {
  const block = blocks[i];
  if (block.month !== h.month || block.year !== h.year) continue;
  const next = blocks[i + 1];
  days.push(...parseAimsTokensIntoEventsV3(block.tokens, block.day, block.month, block.year, h.base, next?.tokens || []));
 }
 return { ...h, days, rawText: fullText, totals: extractTotals(fullText) };
};

parseCrewRosterBlockV3 = function(dayNumber, month, year, base, blockText) {
 const raw = cleanRosterLineV3(blockText);
 const upper = raw.toUpperCase();
 const events = [];
 const restMatch = upper.match(/\b(DOPR|DOP|DOF|DO|DR|OFF|VC)\b/);
 const activityMatches = [...upper.matchAll(/\b(HSBE|HSB|ASB|CBF|EMER|C\d{2,3}F|MT|CRM|NSJ|NS|IJ|DM)\b/g)].map((m) => ({ code: m[1], index: m.index || 0 }));
 const seen = new Set();
 for (const item of activityMatches) {
  const key = item.code + ':' + item.index;
  if (seen.has(key)) continue;
  seen.add(key);
  const d = makeDay(dayNumber, month, year, base);
  d.rawText = raw;
  d.pairingCode = normalizeActivityCodePrecise(item.code, raw);
  d.type = activityTypeFromCodePrecise(d.pairingCode);
  const window = pickDutyWindowForCodeV3(raw, item.code);
  d.dutyReport = window.start;
  d.dutyDebrief = window.end;
  d.dutyHours = window.start && window.end ? diffHours(window.start, window.end) : null;
  d.flyingHours = 0;
  events.push(d);
 }
 if (/\bLA\s?\d{3,4}\b/i.test(raw)) {
  const flightDay = makeDay(dayNumber, month, year, base);
  flightDay.rawText = raw;
  parseFlightsFromRosterTextV3(flightDay, raw);
  if (flightDay.legs.length) events.push(flightDay);
 }
 if (!events.length && restMatch) {
  const d = makeDay(dayNumber, month, year, base);
  d.rawText = raw; d.type = restMatch[1]; d.pairingCode = restMatch[1]; d.dutyHours = 0; d.flyingHours = 0;
  events.push(d);
 }
 if (!events.length && raw) { const d = makeDay(dayNumber, month, year, base); d.rawText = raw; events.push(d); }
 return events;
};

pickDutyWindowForCodeV3 = function(text, code) {
 const upper = String(text || '').toUpperCase();
 const codeIndex = Math.max(0, upper.indexOf(String(code || '').toUpperCase()));
 const fragment = codeIndex >= 0 ? text.slice(codeIndex, codeIndex + 220) : text;
 return pickActivityWindowFromTokensPrecise(fragment.split(/\s+/));
};

parseFlightsFromRosterTextV3 = function(day, text) {
 const normalized = cleanRosterLineV3(text);
 const strictRe = /\b(LA\s?\d{3,4})\b\s+(?:(?:CC|CP|FO|CM|CMT|CMD)\s+)?(?:(OP|PS|DH)\s+)?([A-Z]{3})\s+(\d{1,2}:\d{2}(?:\(\+1\))?)\s+([A-Z]{3})\s+(\d{1,2}:\d{2}(?:\(\+1\))?)/gi;
 let match;
 const parsed = [];
 while ((match = strictRe.exec(normalized)) !== null) {
  const flightNumber = match[1].replace(/\s+/g, '');
  const workType = (match[2] || inferWorkTypePrecise(normalized, match.index) || 'OP').toUpperCase();
  const origin = match[3].toUpperCase();
  const departureTime = normalizeTimeToken(match[4]);
  const destination = match[5].toUpperCase();
  const arrivalTimeRaw = normalizeTimeToken(match[6]);
  if (origin === destination) continue;
  const arrivalTime = arrivalTimeRaw.replace('(+1)', '');
  const after = normalized.slice(strictRe.lastIndex, strictRe.lastIndex + 70);
  const afterTimes = uniqueTimesV3([...after.matchAll(/\b\d{1,2}:\d{2}(?:\(\+1\))?\b/g)].map((m) => normalizeTimeToken(m[0])));
  const debriefCandidate = afterTimes.find((t) => !looksLikeDurationV3(t) && diffHours(arrivalTimeRaw, t) <= 3.5) || null;
  const aircraftType = findAircraftAfter(normalized, match.index) || undefined;
  parsed.push({ flightNumber, workType, origin, departureTime, destination, arrivalTime, arrivalTimeRaw, debriefCandidate, aircraftType, isNextDay:/\(\+1\)/.test(arrivalTimeRaw)||toMin(arrivalTimeRaw)<toMin(departureTime) });
 }
 for (const leg of parsed) {
  if (!day.legs.some((old) => old.flightNumber === leg.flightNumber && old.origin === leg.origin && old.departureTime === leg.departureTime)) {
   day.legs.push({ flightNumber: leg.flightNumber, origin: leg.origin, destination: leg.destination, departureTime: leg.departureTime, arrivalTime: leg.arrivalTime, workType: leg.workType, aircraftType: leg.aircraftType, isNextDay: leg.isNextDay, duration: diffHours(leg.departureTime, leg.arrivalTimeRaw) });
  }
 }
 if (!day.legs.length) {
  const flightRe = /\b(LA\s?\d{3,4}|LA\d{3,4})\b([\s\S]*?)(?=\bLA\s?\d{3,4}\b|$)/gi;
  let generic;
  while ((generic = flightRe.exec(normalized)) !== null) {
   const leg = parseRosterFlightSegmentV3(generic[1].replace(/\s+/g, ''), generic[2] || '');
   if (leg && leg.origin !== leg.destination && !day.legs.some((old) => old.flightNumber === leg.flightNumber && old.origin === leg.origin && old.departureTime === leg.departureTime)) day.legs.push(leg);
  }
 }
 if (day.legs.length) {
  day.type = 'VOO';
  day.pairingCode = day.legs[0].flightNumber;
  const firstLeg = day.legs[0];
  const firstIdx = normalized.indexOf(firstLeg.flightNumber);
  const beforeFirst = firstIdx > 0 ? normalized.slice(0, firstIdx) : normalized;
  day.dutyReport = [...beforeFirst.matchAll(/\b\d{1,2}:\d{2}\b/g)].map((m) => normalizeTimeToken(m[0])).at(-1) || firstLeg.departureTime;
  const last = day.legs.at(-1);
  const lastParsed = parsed.find((leg) => leg.flightNumber === last.flightNumber && leg.departureTime === last.departureTime);
  day.dutyDebrief = lastParsed?.debriefCandidate?.replace('(+1)', '') || addMinutesServerPrecise(last.arrivalTime, 30);
  day.isNextDay = day.legs.some((leg) => leg.isNextDay) || diffHours(day.dutyReport, day.dutyDebrief) > 18;
  day.flyingHours = day.legs.reduce((sum, leg) => sum + (leg.duration || diffHours(leg.departureTime, leg.arrivalTime)), 0);
  day.dutyHours = diffHours(day.dutyReport, day.dutyDebrief);
 }
};

parseRosterFlightSegmentV3 = function(flightNumber, segment) {
 const tokens = String(segment || '').split(/\s+/).filter(Boolean);
 let workType = 'OP'; let aircraftType = undefined;
 for (const token of tokens) { const upper = token.toUpperCase(); if (['OP','PS','DH'].includes(upper)) workType = upper; if (/^(32S|31R|39R|328|319|320|321|32N)$/.test(upper)) aircraftType = upper; }
 const pattern = findBestFlightPatternV3(tokens);
 if (!pattern || pattern.origin === pattern.destination) return null;
 const { origin, destination, departureTime, arrivalTime } = pattern;
 return { flightNumber, origin, destination, departureTime, arrivalTime: normalizeTimeToken(arrivalTime).replace('(+1)',''), workType, aircraftType, isNextDay:/\(\+1\)/.test(arrivalTime)||toMin(arrivalTime)<toMin(departureTime), duration: diffHours(departureTime, arrivalTime) };
};

findBestFlightPatternV3 = function(tokens) {
 const upper = tokens.map((token) => String(token || '').toUpperCase());
 const candidates = [];
 for (let i = 0; i < upper.length; i++) {
  if (!AIRPORTS.has(upper[i])) continue;
  const origin = upper[i];
  for (let j = Math.max(0, i - 3); j < Math.min(upper.length, i + 3); j++) {
   if (!isTimeToken(tokens[j]) || Math.abs(j - i) > 2) continue;
   const departureTime = normalizeTimeToken(tokens[j]);
   for (let k = i + 1; k < Math.min(upper.length, i + 8); k++) {
    if (!AIRPORTS.has(upper[k]) || upper[k] === origin) continue;
    for (let l = k + 1; l < Math.min(upper.length, k + 5); l++) {
     if (!isTimeToken(tokens[l])) continue;
     const arrivalTime = normalizeTimeToken(tokens[l]);
     const duration = diffHours(departureTime, arrivalTime);
     if (duration < 0.25 || duration > 8) continue;
     candidates.push({ origin, destination: upper[k], departureTime, arrivalTime, score: 200 - Math.abs(duration - 1.8) * 4 - Math.abs(j - i) * 8 - (k - i) * 2 - (l - k) });
    }
   }
  }
 }
 candidates.sort((a,b)=>b.score-a.score);
 return candidates[0] || null;
};

parseAimsTokensIntoEventsV3 = function(tokens, dayNum, month, year, base, nextTokens = []) {
 const normalized = tokens.map((token) => String(token || '').trim()).filter(Boolean);
 const upperTokens = normalized.map((token) => token.toUpperCase());
 const events = [];
 const activityPositions = [];
 for (let i = 0; i < upperTokens.length; i++) {
  let token = upperTokens[i];
  if (token === 'CRMB') token = 'CRM';
  if (['HSB','HSBE','ASB','CBF','EMER','MT','CRM','NS','NSJ','IJ','DM'].includes(token) || /^C\d{2,3}F$/.test(token)) activityPositions.push({ code: token, index: i });
 }
 for (let pos = 0; pos < activityPositions.length; pos++) {
  const { code, index } = activityPositions[pos];
  const nextIdxCandidate = activityPositions[pos + 1]?.index ?? upperTokens.findIndex((t, idx) => idx > index && t === 'LA');
  const slice = normalized.slice(index, nextIdxCandidate > index ? nextIdxCandidate : normalized.length);
  const d = makeDay(dayNum, month, year, base);
  d.rawText = normalized.join(' ');
  d.pairingCode = normalizeActivityCodePrecise(code, d.rawText);
  d.type = activityTypeFromCodePrecise(d.pairingCode);
  const window = pickActivityWindowFromTokensPrecise(slice);
  d.dutyReport = window.start; d.dutyDebrief = window.end; d.dutyHours = window.start && window.end ? diffHours(window.start, window.end) : null; d.flyingHours = 0;
  events.push(d);
 }
 const flightDay = makeDay(dayNum, month, year, base);
 flightDay.rawText = normalized.join(' ');
 for (let i = 0; i < upperTokens.length; i++) {
  if (upperTokens[i] === 'LA' && /^\d{3,4}$/.test(upperTokens[i+1] || '')) {
   const nextLa = upperTokens.findIndex((token, idx) => idx > i + 1 && token === 'LA');
   let seq = normalized.slice(i + 2, nextLa > 0 ? nextLa : normalized.length);
   if (seq.some((t) => String(t).startsWith('(...)')) && !hasCompleteLegTokensPrecise(seq)) seq = seq.concat(nextDayContinuationPrefixPrecise(nextTokens));
   const leg = parseAimsFlightSeq('LA' + upperTokens[i+1], seq);
   if (leg && leg.origin !== leg.destination && !flightDay.legs.some((old) => old.flightNumber === leg.flightNumber && old.origin === leg.origin && old.departureTime === leg.departureTime)) flightDay.legs.push(leg);
  }
 }
 if (flightDay.legs.length) {
  flightDay.type = 'VOO'; flightDay.pairingCode = flightDay.legs[0].flightNumber;
  const firstLaIndex = upperTokens.findIndex((t)=>t==='LA'); const firstOrigin = flightDay.legs[0].origin; const firstOriginIdx = upperTokens.findIndex((t,idx)=>idx>=firstLaIndex+2 && t===firstOrigin);
  const timesBeforeOrigin = normalized.slice(firstLaIndex+2, firstOriginIdx > 0 ? firstOriginIdx : firstLaIndex+2).filter(isTimeToken).map(normalizeTimeToken);
  flightDay.dutyReport = timesBeforeOrigin.length >= 2 ? timesBeforeOrigin[0] : (timesBeforeOrigin[0] || flightDay.legs[0].departureTime);
  flightDay.dutyDebrief = inferAimsDebriefPrecise(normalized, flightDay.legs.at(-1), nextTokens) || addMinutesServerPrecise(flightDay.legs.at(-1).arrivalTime, 30);
  flightDay.isNextDay = flightDay.legs.some((leg)=>leg.isNextDay) || diffHours(flightDay.dutyReport, flightDay.dutyDebrief) > 18;
  flightDay.flyingHours = flightDay.legs.reduce((sum, leg)=>sum+(leg.duration || diffHours(leg.departureTime, leg.arrivalTime)),0);
  flightDay.dutyHours = diffHours(flightDay.dutyReport, flightDay.dutyDebrief);
  events.push(flightDay);
 }
 if (!events.length) {
  const rest = upperTokens.join(' ').match(/\b(DOPR|DOP|DOF|DO|DR|OFF|VC)\b/);
  if (rest) { const d = makeDay(dayNum, month, year, base); d.rawText = normalized.join(' '); d.type = rest[1]; d.pairingCode = rest[1]; d.dutyHours=0; d.flyingHours=0; events.push(d); }
 }
 return events.length ? events : [makeDay(dayNum, month, year, base)];
};

parseAimsFlightSeq = function(flightNumber, seq) {
 const tokens = seq.map((t)=>String(t||'').trim()).filter(Boolean).filter((t)=>t !== '[extra]');
 const upper = tokens.map((t)=>t.toUpperCase());
 const firstAirportIdx = upper.findIndex((t)=>AIRPORTS.has(t));
 if (firstAirportIdx < 0) return null;
 const origin = upper[firstAirportIdx];
 const beforeOriginTimes = tokens.slice(0, firstAirportIdx).filter(isTimeToken).map(normalizeTimeToken);
 const departureTime = beforeOriginTimes.at(-1); if (!departureTime) return null;
 let destIdx = -1;
 for (let i = firstAirportIdx + 1; i < upper.length; i++) if (AIRPORTS.has(upper[i]) && upper[i] !== origin) { destIdx = i; break; }
 if (destIdx < 0) return null;
 const destination = upper[destIdx];
 const afterDestTimes = tokens.slice(destIdx + 1).filter(isTimeToken).map(normalizeTimeToken);
 const arrivalTime = afterDestTimes[0]; if (!arrivalTime) return null;
 const aircraft = upper.find((token)=>/^\([A-Z0-9]{3}\)$/.test(token))?.replace(/[()]/g,'') || upper.find((token)=>/^(32S|31R|39R|328|319|320|321|32N)$/.test(token)) || undefined;
 return { flightNumber, origin, destination, departureTime, arrivalTime: arrivalTime.replace('(+1)',''), workType:'OP', aircraftType: aircraft, isNextDay:/\(\+1\)/.test(arrivalTime) || toMin(arrivalTime) < toMin(departureTime), duration: diffHours(departureTime, arrivalTime) };
};

function buildAimsTextBlocksPrecise(fullText, baseMonth, baseYear) {
 const stopAtCrew = fullText.split(/\n\s*Tripulações\s*\n/i)[0];
 const lines = stopAtCrew.split(/\n+/).map((line)=>String(line||'').trim()).filter(Boolean).filter((line)=>!/^(Confira na escala|Escala de Tripulante|Tripulante:|Timezone)/i.test(line));
 const blocks = []; let current = null;
 for (const line of lines) {
  const marker = parseAimsDateMarkerServer(line, baseMonth, baseYear);
  if (marker) { if (current) blocks.push(current); current = { day: marker.day, month: marker.month, year: marker.year, tokens: [] }; continue; }
  if (!current) continue;
  for (const token of line.split(/\s+/).map((t)=>t.trim()).filter(Boolean)) if (!ignoreAimsTokenServer(token)) current.tokens.push(token);
 }
 if (current) blocks.push(current);
 return blocks;
}
function normalizeActivityCodePrecise(code, raw='') { const c=String(code||'').toUpperCase(); if (c === 'CRMB' || /\bCRMB\s*SB\b/i.test(raw)) return 'CRM'; return c; }
function activityTypeFromCodePrecise(code) { const c=normalizeActivityCodePrecise(code); if (c==='ASB'||c==='HSB'||c==='HSBE') return c; if (c==='CRM'||/^C\d{2,3}F$/.test(c)||c==='CBF'||c==='EMER') return 'CRM'; return 'OTHER'; }
function pickActivityWindowFromTokensPrecise(tokens) { const cleaned=tokens.map((t)=>String(t||'').trim()).filter(Boolean); const stationTimes=[]; for(let i=0;i<cleaned.length-1;i++){ if(AIRPORTS.has(cleaned[i].toUpperCase()) && isTimeToken(cleaned[i+1])) stationTimes.push(normalizeTimeToken(cleaned[i+1])); } const stationUnique=uniqueTimesV3(stationTimes).filter((t)=>!looksLikeDurationV3(t)); if(stationUnique.length>=2) return {start:stationUnique[0], end:stationUnique[stationUnique.length-1]}; const allTimes=uniqueTimesV3(cleaned.filter(isTimeToken).map(normalizeTimeToken)).filter((t)=>!looksLikeDurationV3(t)); if(!allTimes.length) return {start:null,end:null}; const start=allTimes[0]; let end=allTimes[1]||allTimes[0]; for(const t of allTimes.slice(1)){ const h=diffHours(start,t); if(h>=0.25 && h<=14) end=t; } return {start,end}; }
function hasCompleteLegTokensPrecise(tokens) { const upper=tokens.map((t)=>String(t).toUpperCase()); const airports=upper.filter((t)=>AIRPORTS.has(t)); const times=tokens.filter(isTimeToken); return airports.length >= 2 && airports.some((a)=>a !== airports[0]) && times.length >= 2; }
function nextDayContinuationPrefixPrecise(tokens) { const prefix=[]; const operational=new Set(['LA','DOPR','DOP','DOPR','DOP','DO','DOF','DR','OFF','VC','VC','HSB','HSBE','ASB','CBF','EMER','MT','CRM','CRMB','NS','NSJ','IJ','DM']); for(const token of tokens||[]){ const upper=String(token).toUpperCase(); if(prefix.length && operational.has(upper)) break; prefix.push(token); if(/^\([A-Z0-9]{3}\)$/.test(upper)) break; } return prefix; }
function inferAimsDebriefPrecise(tokens,lastLeg,nextTokens=[]) { if(!lastLeg) return null; const upper=tokens.map((t)=>String(t).toUpperCase()); let destIdx=-1; for(let i=upper.length-1;i>=0;i--) if(upper[i]===lastLeg.destination){ destIdx=i; break; } let after=destIdx>=0?tokens.slice(destIdx+1):[]; if(after.length<2 && nextTokens?.length) after=after.concat(nextDayContinuationPrefixPrecise(nextTokens)); const times=after.filter(isTimeToken).map(normalizeTimeToken); return times[1] || times[0] || null; }
function inferWorkTypePrecise(text, idx) { const near=String(text||'').slice(Math.max(0,idx-20), idx+35).toUpperCase(); return near.match(/\b(OP|PS|DH)\b/)?.[1] || null; }
function addMinutesServerPrecise(time, minutes) { const base=toMin(time)+minutes; const h=Math.floor((base%1440)/60); const m=base%60; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`; }
// --- end CrewCheck RC3.1 ultra-precise parser overrides ---

// --- CrewCheck RC5 parser servidor obrigatório + APK/filechooser safe ---
parsePdfOnServer = async function parsePdfOnServerRC5({ filename, dataBase64 }) {
 if (!dataBase64 || typeof dataBase64 !== 'string') throw new Error('PDF não recebido pelo servidor.');
 const bytes = decodeBase64PdfPayload(dataBase64);
 if (!bytes.length) throw new Error('PDF vazio.');
 const candidates = [];

 // 1) pdf-parse tends to produce a text stream close to pdftotext and is a
 // useful fallback for mobile PDFs when browser/PDF.js item positions vary.
 try {
  const mod = await import('pdf-parse');
  const pdfParse = mod.default || mod;
  const out = await pdfParse(bytes);
  if (out?.text && out.text.trim().length > 80) candidates.push({ source: 'pdf-parse', text: out.text });
 } catch (error) {
  console.warn('RC5 pdf-parse fallback unavailable:', error?.message || error);
 }

 // 2) PDF.js extraction with visual row grouping.
 try {
  const pdfjsImport = await import('pdfjs-dist/legacy/build/pdf.js');
  const pdfjs = pdfjsImport.default || pdfjsImport;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes), disableWorker: true, isEvalSupported: false, disableFontFace: true }).promise;
  const pages = [];
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
   const page = await pdf.getPage(pageNo);
   const tc = await page.getTextContent({ normalizeWhitespace: true, disableCombineTextItems: false });
   const items = tc.items.map((it) => ({
    str: String(it.str || '').trim(),
    x: Number(it.transform?.[4] || 0),
    y: Number(it.transform?.[5] || 0),
    page: pageNo,
   })).filter((it) => it.str);
   pages.push({ pageNo, items });
  }
  const visual = buildServerFullText(pages);
  const linear = pages.map((p) => p.items.map((i) => i.str).join('\n')).join('\n');
  if (visual.trim().length > 80) candidates.push({ source: 'pdfjs-visual', text: visual, pages });
  if (linear.trim().length > 80) candidates.push({ source: 'pdfjs-linear', text: linear, pages });
 } catch (error) {
  console.warn('RC5 pdfjs extraction unavailable:', error?.message || error);
 }

 const tried = [];
 for (const candidate of uniqueTextCandidatesRC5(candidates)) {
  try {
   const roster = parseCrewCheckTextRC5(candidate.text, filename, candidate.pages);
   roster.rawText = candidate.text;
   roster.days = finalizeServerDays(roster.days, roster.month, roster.year, roster.base);
   const diagnostics = buildParseDiagnosticsRC5(roster, candidate.source);
   if (diagnostics.confidence === 'baixa' || diagnostics.uniqueDays < 8 || diagnostics.totalEvents < 8) {
    tried.push(`${candidate.source}: leitura insuficiente (${diagnostics.uniqueDays} dias, ${diagnostics.totalEvents} eventos)`);
    continue;
   }
   return { roster, diagnostics };
  } catch (error) {
   tried.push(`${candidate.source}: ${error?.message || error}`);
  }
 }
 throw new Error(`Parser servidor não conseguiu validar a escala. Tentativas: ${tried.join(' | ') || 'nenhuma extração de texto útil'}`);
};

function uniqueTextCandidatesRC5(candidates) {
 const seen = new Set();
 const out = [];
 for (const candidate of candidates) {
  const key = String(candidate.text || '').slice(0, 1200).replace(/\s+/g, ' ');
  if (!seen.has(key)) { seen.add(key); out.push(candidate); }
 }
 return out;
}

function parseCrewCheckTextRC5(fullText, filename = '', pages = null) {
 const text = normalizePdfTextRC5(fullText);
 const isAims = /Escala de Tripulante Convertida para padr/i.test(text) || /Tripulante:\s*.+?BP:/i.test(text);
 if (isAims) return parseAimsTextRC5(text, filename);
 if (/Roster\s+Report/i.test(text) || /CrewRosterReport/i.test(filename || '')) return parseRosterReportTextRC5(text, filename);
 // Last chance: try both and keep the most complete one.
 const attempts = [];
 try { attempts.push(parseRosterReportTextRC5(text, filename)); } catch {}
 try { attempts.push(parseAimsTextRC5(text, filename)); } catch {}
 attempts.sort((a, b) => (b.days?.length || 0) - (a.days?.length || 0));
 if (attempts[0]?.days?.length) return attempts[0];
 throw new Error('Formato não reconhecido como CrewRosterReport ou AIMS.');
}

function normalizePdfTextRC5(value) {
 return String(value || '')
  .replace(/\u000c/g, '\n')
  .replace(/\uFFFE/g, ' ')
  .replace(/[\t\r]+/g, ' ')
  .replace(/[ ]{2,}/g, ' ')
  .replace(/\n[ ]+/g, '\n')
  .trim();
}

function parseRosterReportTextRC5(fullText, filename = '') {
 const h = parseServerHeader(fullText, filename);
 const blocks = buildRosterBlocksRC5(fullText);
 const days = [];
 for (const block of blocks) {
  const month = monthNameToNum(block.monthToken) || h.month;
  const year = Number(block.yearToken) || h.year;
  const parsed = parseRosterBlockRC5(Number(block.dayToken), month, year, h.base, block.lines.join(' '));
  days.push(...parsed);
 }
 if (!days.length) throw new Error('Nenhum dia de escala encontrado no CrewRosterReport.');
 return { ...h, days, rawText: fullText, totals: extractTotals(fullText) };
}

function buildRosterBlocksRC5(fullText) {
 const lines = fullText.split(/\n+/).map(cleanRosterLineRC5).filter(Boolean);
 const blocks = [];
 let current = null;
 const dateRe = /^(\d{2})-([A-Za-z]{3})-(\d{4})\b\s*(.*)$/;
 for (const line of lines) {
  if (/^(Roster Report|Date\b|Duty\b|Report\b|Pairing\/Activity|Updated By|Updated Date|A\/C\b|Type\b|Overridde)/i.test(line)) continue;
  const match = line.match(dateRe);
  if (match) {
   if (current) blocks.push(current);
   current = { dayToken: match[1], monthToken: match[2], yearToken: match[3], lines: [match[4] || ''] };
   continue;
  }
  if (current && isUsefulRosterContinuationRC5(line)) current.lines.push(line);
 }
 if (current) blocks.push(current);
 return blocks;
}

function cleanRosterLineRC5(line) {
 return String(line || '')
  .replace(/\b\d{2}-[A-Za-z]{3}-\d{4}\s+\d{2}\.\d{2}\b/g, ' ')
  .replace(/\b(SCHEDULER|msgsys|AIRCOM_SQS|\d{6,})\b/gi, ' ')
  .replace(/\s+/g, ' ')
  .trim();
}

function isUsefulRosterContinuationRC5(line) {
 return /\b(LA\s?\d{3,4}|DOPR|DOP|DOF?|DR|OFF|VC|HSBE?|ASB|CBF|EMER|MT|CRM|CRMB|CRMBSB|C\d{2,3}F|NSJ?|IJ|DM|SAER|[A-Z]{3}\s+\d{1,2}:\d{2}|\d{1,2}:\d{2}\(\+1\))\b/i.test(line);
}

function parseRosterBlockRC5(dayNumber, month, year, base, blockText) {
 const raw = cleanRosterLineRC5(blockText);
 const upper = raw.toUpperCase();
 const events = [];
 const activityRe = /\b(HSBE|HSB|ASB|CBF|EMER|C\d{2,3}F|CRMBSB|CRMB|CRM|MT|NSJ|NS|IJ|DM|SAER)\b/g;
 let act;
 while ((act = activityRe.exec(upper)) !== null) {
  const code = normalizeActivityCodeRC5(act[1]);
  const d = makeDay(dayNumber, month, year, base);
  d.rawText = raw;
  d.pairingCode = code;
  d.type = activityTypeFromCodeRC5(code);
  const window = pickActivityWindowRC5(raw.slice(Math.max(0, act.index), act.index + 240), code);
  d.dutyReport = window.start;
  d.dutyDebrief = window.end;
  d.dutyHours = window.start && window.end ? diffHours(window.start, window.end) : null;
  d.flyingHours = 0;
  if (!events.some((e) => e.pairingCode === d.pairingCode && e.dutyReport === d.dutyReport && e.dutyDebrief === d.dutyDebrief)) events.push(d);
 }

 const flightDay = makeDay(dayNumber, month, year, base);
 flightDay.rawText = raw;
 parseFlightsFromTextRC5(flightDay, raw);
 if (flightDay.legs.length) events.push(flightDay);

 if (!events.length) {
  const rest = upper.match(/\b(DOPR|DOP|DOF|DO|DR|OFF|VC)\b/);
  if (rest) {
   const d = makeDay(dayNumber, month, year, base);
   d.rawText = raw; d.type = rest[1]; d.pairingCode = rest[1]; d.dutyHours = 0; d.flyingHours = 0; events.push(d);
  }
 }
 return events;
}

function parseFlightsFromTextRC5(day, text) {
 const source = cleanRosterLineRC5(text);
 const strict = /\b(LA\s?\d{3,4})\b\s+(?:(?:CC|CP|FO|CM|CMT|CMD)\s+)?(?:(OP|PS|DH)\s+)?([A-Z]{3})\s+(\d{1,2}:\d{2}(?:\(\+1\))?)\s+([A-Z]{3})\s+(\d{1,2}:\d{2}(?:\(\+1\))?)/gi;
 let m;
 while ((m = strict.exec(source)) !== null) {
  const leg = makeLegRC5(m[1], m[3], m[5], m[4], m[6], m[2] || inferWorkTypePrecise(source, m.index) || 'OP', findAircraftAfter(source, m.index));
  addLegIfGoodRC5(day, leg);
 }
 if (!day.legs.length) {
  const re = /\b(LA\s?\d{3,4}|LA\d{3,4})\b([\s\S]*?)(?=\bLA\s?\d{3,4}\b|$)/gi;
  let seg;
  while ((seg = re.exec(source)) !== null) {
   const leg = parseGenericFlightSegmentRC5(seg[1], seg[2] || '');
   addLegIfGoodRC5(day, leg);
  }
 }
 if (day.legs.length) {
  day.type = 'VOO';
  day.pairingCode = day.legs[0].flightNumber;
  const firstIdx = source.indexOf(day.legs[0].flightNumber);
  const beforeFirst = firstIdx >= 0 ? source.slice(0, firstIdx) : source;
  day.dutyReport = [...beforeFirst.matchAll(/\b\d{1,2}:\d{2}\b/g)].map((x) => normalizeTimeToken(x[0])).at(-1) || day.legs[0].departureTime;
  const last = day.legs.at(-1);
  const afterLast = source.slice(Math.max(0, source.lastIndexOf(last.arrivalTime)));
  const timesAfter = [...afterLast.matchAll(/\b\d{1,2}:\d{2}(?:\(\+1\))?\b/g)].map((x) => normalizeTimeToken(x[0])).filter((t) => !looksLikeDurationV3(t));
  day.dutyDebrief = (timesAfter.find((t) => diffHours(last.arrivalTime, t) > 0 && diffHours(last.arrivalTime, t) <= 3.5) || addMinutesServerPrecise(last.arrivalTime, 30)).replace('(+1)', '');
  day.isNextDay = day.legs.some((leg) => leg.isNextDay) || diffHours(day.dutyReport, day.dutyDebrief) > 18;
  day.flyingHours = day.legs.reduce((sum, leg) => sum + (leg.duration || diffHours(leg.departureTime, leg.arrivalTime)), 0);
  day.dutyHours = diffHours(day.dutyReport, day.dutyDebrief);
 }
}

function parseGenericFlightSegmentRC5(flightNumber, segment) {
 const tokens = String(segment || '').split(/\s+/).filter(Boolean);
 let workType = 'OP'; let aircraftType = undefined;
 for (const token of tokens) {
  const u = String(token).toUpperCase();
  if (['OP','PS','DH'].includes(u)) workType = u;
  if (/^(32S|31R|39R|328|319|320|321|32N)$/.test(u)) aircraftType = u;
 }
 const pattern = findBestFlightPatternRC5(tokens);
 if (!pattern) return null;
 return makeLegRC5(flightNumber, pattern.origin, pattern.destination, pattern.departureTime, pattern.arrivalTime, workType, aircraftType);
}

function findBestFlightPatternRC5(tokens) {
 const upper = tokens.map((t) => String(t).toUpperCase());
 const candidates = [];
 for (let i = 0; i < upper.length; i++) {
  if (!AIRPORTS.has(upper[i])) continue;
  const origin = upper[i];
  const depCandidates = [];
  for (let j = Math.max(0, i - 3); j <= Math.min(upper.length - 1, i + 2); j++) if (isTimeToken(tokens[j])) depCandidates.push(j);
  for (const j of depCandidates) {
   const departureTime = normalizeTimeToken(tokens[j]);
   for (let k = i + 1; k < Math.min(upper.length, i + 9); k++) {
    if (!AIRPORTS.has(upper[k]) || upper[k] === origin) continue;
    for (let l = k + 1; l < Math.min(upper.length, k + 5); l++) {
     if (!isTimeToken(tokens[l])) continue;
     const arrivalTime = normalizeTimeToken(tokens[l]);
     const dur = diffHours(departureTime, arrivalTime);
     if (dur < 0.25 || dur > 8) continue;
     candidates.push({ origin, destination: upper[k], departureTime, arrivalTime, score: 100 - Math.abs(dur - 1.8) * 5 - Math.abs(j - i) * 6 - (k - i) * 2 });
    }
   }
  }
 }
 candidates.sort((a,b)=>b.score-a.score);
 return candidates[0] || null;
}

function makeLegRC5(flightNumber, origin, destination, departureTime, arrivalTime, workType = 'OP', aircraftType) {
 const cleanOrigin = String(origin || '').toUpperCase();
 const cleanDestination = String(destination || '').toUpperCase();
 const dep = normalizeTimeToken(departureTime);
 const arrRaw = normalizeTimeToken(arrivalTime);
 if (!AIRPORTS.has(cleanOrigin) || !AIRPORTS.has(cleanDestination) || cleanOrigin === cleanDestination) return null;
 return { flightNumber: String(flightNumber || '').replace(/\s+/g, ''), origin: cleanOrigin, destination: cleanDestination, departureTime: dep, arrivalTime: arrRaw.replace('(+1)', ''), workType: String(workType || 'OP').toUpperCase(), aircraftType, isNextDay: /\(\+1\)/.test(arrRaw) || toMin(arrRaw) < toMin(dep), duration: diffHours(dep, arrRaw) };
}

function addLegIfGoodRC5(day, leg) {
 if (!leg || leg.origin === leg.destination || !leg.flightNumber) return;
 if (!day.legs.some((old) => old.flightNumber === leg.flightNumber && old.origin === leg.origin && old.destination === leg.destination && old.departureTime === leg.departureTime)) day.legs.push(leg);
}

function parseAimsTextRC5(fullText, filename = '') {
 const h = parseServerHeader(fullText, filename);
 const blocks = buildAimsBlocksRC5(fullText, h.month, h.year);
 const days = [];
 for (let i = 0; i < blocks.length; i++) {
  const block = blocks[i];
  if (block.month !== h.month || block.year !== h.year) continue;
  days.push(...parseAimsBlockRC5(block, blocks[i + 1], h.base));
 }
 if (!days.length) throw new Error('Nenhuma programação AIMS encontrada.');
 return { ...h, days, rawText: fullText, totals: extractTotals(fullText) };
}

function buildAimsBlocksRC5(fullText, baseMonth, baseYear) {
 const head = fullText.split(/\n\s*Tripulações\s*\n/i)[0];
 const lines = head.split(/\n+/).map((l) => String(l || '').trim()).filter(Boolean).filter((l) => !/^(Confira na escala|Escala de Tripulante|Tripulante:|Timezone)/i.test(l));
 const blocks = []; let current = null;
 for (const line of lines) {
  const marker = parseAimsDateMarkerServer(line, baseMonth, baseYear);
  if (marker) { if (current) blocks.push(current); current = { ...marker, tokens: [] }; continue; }
  if (!current) continue;
  for (const token of line.split(/\s+/).filter(Boolean)) if (!ignoreAimsTokenServer(token)) current.tokens.push(token);
 }
 if (current) blocks.push(current);
 return blocks;
}

function parseAimsBlockRC5(block, nextBlock, base) {
 const tokens = block.tokens.map((t) => String(t || '').trim()).filter(Boolean);
 const upper = tokens.map((t) => t.toUpperCase());
 const events = [];
 const activityPositions = [];
 for (let i = 0; i < upper.length; i++) {
  const code = normalizeActivityCodeRC5(upper[i]);
  if (['HSB','HSBE','ASB','CBF','EMER','MT','CRM','NS','NSJ','IJ','DM','SAER'].includes(code) || /^C\d{2,3}F$/.test(code)) activityPositions.push({ code, index: i });
 }
 for (let p = 0; p < activityPositions.length; p++) {
  const { code, index } = activityPositions[p];
  const nextIndex = activityPositions[p + 1]?.index ?? upper.findIndex((t, idx) => idx > index && t === 'LA');
  const slice = tokens.slice(index, nextIndex > index ? nextIndex : tokens.length);
  const d = makeDay(block.day, block.month, block.year, base);
  d.rawText = tokens.join(' '); d.pairingCode = code; d.type = activityTypeFromCodeRC5(code);
  const win = pickActivityWindowRC5(slice.join(' '), code);
  d.dutyReport = win.start; d.dutyDebrief = win.end; d.dutyHours = win.start && win.end ? diffHours(win.start, win.end) : null; d.flyingHours = 0;
  events.push(d);
 }
 const flightDay = makeDay(block.day, block.month, block.year, base);
 flightDay.rawText = tokens.join(' ');
 for (let i = 0; i < upper.length; i++) {
  if (upper[i] === 'LA' && /^\d{3,4}$/.test(upper[i+1] || '')) {
   const nextLa = upper.findIndex((t, idx) => idx > i + 1 && t === 'LA');
   let seq = tokens.slice(i + 2, nextLa > 0 ? nextLa : tokens.length);
   if (seq.some((t) => String(t).startsWith('(...)')) && !hasCompleteLegTokensPrecise(seq)) seq = seq.concat(nextDayContinuationPrefixPrecise(nextBlock?.tokens || []));
   const leg = parseAimsFlightSeqRC5('LA' + upper[i+1], seq);
   addLegIfGoodRC5(flightDay, leg);
  }
 }
 if (flightDay.legs.length) {
  flightDay.type = 'VOO'; flightDay.pairingCode = flightDay.legs[0].flightNumber;
  flightDay.dutyReport = inferAimsDutyReportRC5(tokens, flightDay.legs[0]) || flightDay.legs[0].departureTime;
  flightDay.dutyDebrief = inferAimsDebriefPrecise(tokens, flightDay.legs.at(-1), nextBlock?.tokens || []) || addMinutesServerPrecise(flightDay.legs.at(-1).arrivalTime, 30);
  flightDay.isNextDay = flightDay.legs.some((leg) => leg.isNextDay) || diffHours(flightDay.dutyReport, flightDay.dutyDebrief) > 18;
  flightDay.flyingHours = flightDay.legs.reduce((s, leg) => s + (leg.duration || diffHours(leg.departureTime, leg.arrivalTime)), 0);
  flightDay.dutyHours = diffHours(flightDay.dutyReport, flightDay.dutyDebrief);
  events.push(flightDay);
 }
 if (!events.length) {
  const rest = upper.join(' ').match(/\b(DOPR|DOP|DOF|DO|DR|OFF|VC)\b/);
  if (rest) { const d = makeDay(block.day, block.month, block.year, base); d.rawText = tokens.join(' '); d.type = rest[1]; d.pairingCode = rest[1]; d.dutyHours = 0; d.flyingHours = 0; events.push(d); }
 }
 return events;
}

function parseAimsFlightSeqRC5(flightNumber, seq) {
 const tokens = seq.map((t) => String(t || '').trim()).filter((t) => t && t !== '[extra]');
 const upper = tokens.map((t) => t.toUpperCase());
 const airportIndexes = [];
 for (let i = 0; i < upper.length; i++) if (AIRPORTS.has(upper[i])) airportIndexes.push(i);
 if (airportIndexes.length < 2) return null;
 for (let a = 0; a < airportIndexes.length - 1; a++) {
  const originIdx = airportIndexes[a];
  const origin = upper[originIdx];
  const dep = tokens.slice(0, originIdx).filter(isTimeToken).map(normalizeTimeToken).at(-1);
  if (!dep) continue;
  for (let b = a + 1; b < airportIndexes.length; b++) {
   const destIdx = airportIndexes[b];
   const destination = upper[destIdx];
   if (destination === origin) continue;
   const arr = tokens.slice(destIdx + 1).filter(isTimeToken).map(normalizeTimeToken)[0];
   if (!arr) continue;
   const aircraft = upper.find((t) => /^\([A-Z0-9]{3}\)$/.test(t))?.replace(/[()]/g, '') || undefined;
   return makeLegRC5(flightNumber, origin, destination, dep, arr, 'OP', aircraft);
  }
 }
 return null;
}

function inferAimsDutyReportRC5(tokens, firstLeg) {
 if (!firstLeg) return null;
 const upper = tokens.map((t) => String(t).toUpperCase());
 const laIndex = upper.findIndex((t) => t === 'LA');
 const originIdx = upper.findIndex((t, idx) => idx > laIndex && t === firstLeg.origin);
 const times = tokens.slice(laIndex >= 0 ? laIndex + 2 : 0, originIdx > 0 ? originIdx : tokens.length).filter(isTimeToken).map(normalizeTimeToken);
 return times[0] || null;
}

function normalizeActivityCodeRC5(code) {
 const c = String(code || '').toUpperCase();
 if (c === 'CRMB' || c === 'CRMBSB') return 'CRM';
 return c;
}
function activityTypeFromCodeRC5(code) {
 const c = normalizeActivityCodeRC5(code);
 if (c === 'ASB' || c === 'HSB' || c === 'HSBE') return c;
 if (c === 'CRM' || c === 'CBF' || c === 'EMER' || /^C\d{2,3}F$/.test(c)) return 'CRM';
 return 'OTHER';
}
function pickActivityWindowRC5(fragment, code = '') {
 const tokens = String(fragment || '').split(/\s+/).filter(Boolean);
 const times = uniqueTimesV3(tokens.filter(isTimeToken).map(normalizeTimeToken));
 const filtered = times.filter((t) => !looksLikeDurationV3(t));
 if (!filtered.length) return { start: null, end: null };
 const start = filtered[0];
 let end = filtered[filtered.length - 1];
 // duplicated report/rep and deb/deb are common: 14:00 14:00 BSB BSB 16:30 16:30
 if (end === start && filtered.length >= 2) end = filtered[1];
 return { start, end };
}
function buildParseDiagnosticsRC5(roster, sourceFormat) {
 const days = roster.days || [];
 const uniqueDays = new Set(days.map((d) => d.date)).size;
 const flights = days.reduce((s, d) => s + (d.legs?.length || 0), 0);
 const reserve = days.filter((d) => d.type === 'ASB').length;
 const standby = days.filter((d) => d.type === 'HSB' || d.type === 'HSBE').length;
 const meetings = days.filter((d) => (d.pairingCode || '') === 'MT').length;
 const bogusLegs = days.flatMap((d) => d.legs || []).filter((l) => l.origin === l.destination).length;
 const totalEvents = days.length;
 const confidence = uniqueDays >= 20 && flights >= 10 && bogusLegs === 0 ? 'alta' : uniqueDays >= 12 && totalEvents >= 12 && bogusLegs === 0 ? 'média' : 'baixa';
 return { sourceFormat, uniqueDays, totalEvents, flights, reserve, standby, meetings, bogusLegs, confidence, appVersion: '3.0.5 RC5', message: confidence === 'baixa' ? 'Leitura parcial: o sistema bloqueou escala incompleta para evitar erro.' : 'Escala lida pelo parser servidor RC5 com auditoria de ASB/MT/voos.' };
}
// --- end CrewCheck RC5 parser servidor obrigatório + APK/filechooser safe ---

// --- CrewCheck RC6 May/AIMS adaptive parser audit ---
parseServerHeader = function parseServerHeaderRC6(fullText, filename='') {
 const compact = String(fullText || '').replace(/\s+/g, ' ').trim();
 let crewName = 'Tripulante', crewId = '', base = 'BSB', rank = 'CCM';
 let month = new Date().getMonth()+1, year = new Date().getFullYear();

 const aims = compact.match(/Tripulante:\s*([^-]+?)\s*-\s*BP:\s*(\d+)\s*-\s*Base:\s*([A-Z]{3})\s*-\s*(\d{2})\/(\d{2})\/(\d{4})\s*at[ée]\s*(\d{2})\/(\d{2})\/(\d{4})/i);
 if (aims) {
  crewName = aims[1].trim(); crewId = aims[2]; base = aims[3]; month = Number(aims[5]); year = Number(aims[6]);
 }

 const range = compact.match(/(\d{2})-([A-Za-z]{3})-(\d{4})\s+to\s+(\d{2})-([A-Za-z]{3})-(\d{4})/i);
 if (range) { month = monthNameToNum(range[2]) || month; year = Number(range[3]) || year; }

 const pipe = compact.match(/([A-ZÀ-Ú][A-ZÀ-Ú\s.'-]{4,}?)\s*\|\s*(\d{6,})\s*\|\s*([A-Z0-9]+)\s*\|\s*([A-Z]{3})\s*\|\s*([A-Z]{2,5})/);
 if (pipe) { crewName = pipe[1].trim(); crewId = pipe[2]; base = pipe[4]; rank = pipe[5]; }

 const rosterFull = compact.match(/Roster\s+Report\s+(?:Date\s+)?(\d{2})-([A-Za-z]{3})-(\d{4})\s+to\s+(\d{2})-([A-Za-z]{3})-(\d{4}).*?([A-ZÀ-Ú][A-ZÀ-Ú\s.'-]{4,}?)\s*\|\s*(\d{6,})\s*\|\s*([A-Z0-9]+)\s*\|\s*([A-Z]{3})\s*\|\s*([A-Z]{2,5})/i);
 if (rosterFull) { month = monthNameToNum(rosterFull[2]) || month; year = Number(rosterFull[3]) || year; crewName = rosterFull[7].trim(); crewId = rosterFull[8]; base = rosterFull[10]; rank = rosterFull[11]; }

 return { crewName, crewId, base, rank, month, year, airline: /\bLA\s?\d{3,4}\b/i.test(fullText) ? 'LATAM' : 'Companhia aérea' };
};

parseAimsDateMarkerServer = function parseAimsDateMarkerServerRC6(value, baseMonth, baseYear) {
 const m = String(value||'').trim().match(/^(\d{2})(Jan|Feb|Mar|Apr|May|Ma|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Fev|Abr|Mai|Ago|Set|Out|Dez)$/i);
 if (!m) return null;
 const day = Number(m[1]);
 const token = m[2].toLowerCase();
 let month = token === 'ma' ? 5 : monthNameToNum(m[2]);
 // AIMS em inglês frequentemente quebra "May" em "Ma" + "y". Portanto "Ma" é Maio.
 if (!month) month = baseMonth;
 let year = baseYear;
 if (month < baseMonth - 6) year++;
 if (month > baseMonth + 6) year--;
 return { day, month, year };
};

buildParseDiagnosticsRC5 = function buildParseDiagnosticsRC6(roster, sourceFormat) {
 const days = roster.days || [];
 const uniqueDays = new Set(days.map((d) => d.date)).size;
 const flights = days.reduce((s, d) => s + (d.legs?.length || 0), 0);
 const reserve = days.filter((d) => d.type === 'ASB').length;
 const standby = days.filter((d) => d.type === 'HSB' || d.type === 'HSBE').length;
 const meetings = days.filter((d) => (d.pairingCode || '') === 'MT').length;
 const crm = days.filter((d) => (d.pairingCode || '') === 'CRM').length;
 const bogusLegs = days.flatMap((d) => d.legs || []).filter((l) => l.origin === l.destination).length;
 const totalEvents = days.length;
 const flightHoursExpected = Number(roster.totals?.flightHours || 0);
 const activityCount = days.filter((d) => d.pairingCode || d.legs?.length).length;
 const parserFailure = bogusLegs > 0 || (flightHoursExpected > 5 && flights < 3) || uniqueDays < 8 || totalEvents < 8;
 let confidence = 'baixa';
 if (!parserFailure && uniqueDays >= 20 && flights >= 10) confidence = 'alta';
 else if (!parserFailure && uniqueDays >= 12 && activityCount >= 12) confidence = 'média';
 return {
  sourceFormat, uniqueDays, totalEvents, flights, reserve, standby, meetings, crm, bogusLegs,
  expectedFlightHours: flightHoursExpected, confidence, appVersion: '3.0.6 RC6',
  message: confidence === 'baixa'
   ? 'Leitura bloqueada/baixíssima: poucos voos ou eventos foram encontrados em relação ao total da escala.'
   : 'Escala lida pelo parser servidor RC6 com auditoria de mês, voos, ASB, CRM e AIMS Maio.'
 };
};

function scoreDiagnosticsRC6(d) {
 if (!d || d.bogusLegs > 0) return -9999;
 let score = 0;
 score += (d.uniqueDays || 0) * 8;
 score += (d.totalEvents || 0) * 4;
 score += (d.flights || 0) * 12;
 score += (d.reserve || 0) * 8;
 score += (d.standby || 0) * 5;
 score += (d.meetings || 0) * 4;
 score += (d.crm || 0) * 4;
 if ((d.expectedFlightHours || 0) > 5 && (d.flights || 0) < 3) score -= 1000;
 if (d.confidence === 'alta') score += 300;
 if (d.confidence === 'média') score += 100;
 if (d.confidence === 'baixa') score -= 200;
 return score;
}

parsePdfOnServer = async function parsePdfOnServerRC6({ filename, dataBase64 }) {
 if (!dataBase64 || typeof dataBase64 !== 'string') throw new Error('PDF não recebido pelo servidor.');
 const bytes = decodeBase64PdfPayload(dataBase64);
 if (!bytes.length) throw new Error('PDF vazio.');
 const candidates = [];

 try {
  const pdfjsImport = await import('pdfjs-dist/legacy/build/pdf.js');
  const pdfjs = pdfjsImport.default || pdfjsImport;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes), disableWorker: true, isEvalSupported: false, disableFontFace: true }).promise;
  const pages = [];
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
   const page = await pdf.getPage(pageNo);
   const tc = await page.getTextContent({ normalizeWhitespace: true, disableCombineTextItems: false });
   const items = tc.items.map((it) => ({ str: String(it.str || '').trim(), x: Number(it.transform?.[4] || 0), y: Number(it.transform?.[5] || 0), page: pageNo })).filter((it) => it.str);
   pages.push({ pageNo, items });
  }
  const visual = buildServerFullText(pages);
  const linear = pages.map((p) => p.items.map((i) => i.str).join('\n')).join('\n');
  if (linear.trim().length > 80) candidates.push({ source: 'pdfjs-linear', text: linear, pages });
  if (visual.trim().length > 80) candidates.push({ source: 'pdfjs-visual', text: visual, pages });
 } catch (error) { console.warn('RC6 pdfjs extraction unavailable:', error?.message || error); }

 try {
  const mod = await import('pdf-parse');
  const pdfParse = mod.default || mod;
  const out = await pdfParse(bytes);
  if (out?.text && out.text.trim().length > 80) candidates.push({ source: 'pdf-parse', text: out.text });
 } catch (error) { console.warn('RC6 pdf-parse fallback unavailable:', error?.message || error); }

 const tried = [];
 const parsed = [];
 for (const candidate of uniqueTextCandidatesRC5(candidates)) {
  try {
   const roster = parseCrewCheckTextRC5(candidate.text, filename, candidate.pages);
   roster.rawText = candidate.text;
   roster.days = finalizeServerDays(roster.days, roster.month, roster.year, roster.base);
   const diagnostics = buildParseDiagnosticsRC5(roster, candidate.source);
   parsed.push({ roster, diagnostics, score: scoreDiagnosticsRC6(diagnostics) });
   tried.push(`${candidate.source}: ${diagnostics.uniqueDays} dias, ${diagnostics.totalEvents} eventos, ${diagnostics.flights} voos, confiança ${diagnostics.confidence}`);
  } catch (error) { tried.push(`${candidate.source}: ${error?.message || error}`); }
 }
 parsed.sort((a, b) => b.score - a.score);
 const best = parsed[0];
 if (best && best.score > 0 && best.diagnostics.confidence !== 'baixa') return { roster: best.roster, diagnostics: best.diagnostics };
 throw new Error(`Parser servidor RC6 não validou a escala com segurança. Tentativas: ${tried.join(' | ') || 'nenhuma extração de texto útil'}`);
};
// --- end CrewCheck RC6 May/AIMS adaptive parser audit ---

// --- CrewCheck RC7 Precision Core: deterministic CrewRosterReport/AIMS parser ---
const CREWCHECK_VERSION_RC7 = '10.2.0 · Rotina inteligente';

function cleanTextRC7(value) {
 return String(value || '')
  .replace(/\u000c/g, '\n')
  .replace(/\uFFFE/g, ' ')
  .replace(/[\t\r]+/g, ' ')
  .replace(/\n[ ]+/g, '\n')
  .replace(/[ ]{2,}/g, ' ')
  .trim();
}

function normalizeLineRC7(line) {
 return String(line || '')
  .replace(/\uFFFE/g, ' ')
  .replace(/\b(?:SCHEDULER|msgsys|AIRCOM_SQS)\b/gi, ' ')
  .replace(/\b\d{2}-[A-Za-z]{3}-\d{4}\s+\d{2}\.\d{2}\b/g, ' ')
  .replace(/\b\d{7,8}\b/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();
}


function cleanCrewNameRC7(value) {
 return String(value || '')
  .replace(/\b(Tripulante|Crew|Roster|Report|Date|BP|Base)\b/gi, ' ')
  .replace(/\s+/g, ' ')
  .replace(/\s+-\s*$/g, ' ')
  .trim() || 'Tripulante';
}

function headerRC7(fullText, filename = '') {
 const compact = cleanTextRC7(fullText).replace(/\s+/g, ' ');
 let crewName = 'Tripulante', crewId = '', base = 'BSB', rank = 'CCM';
 let month = new Date().getMonth() + 1;
 let year = new Date().getFullYear();

 const aims = compact.match(/Tripulante\s*:?\s*([A-ZÀ-Ú][A-ZÀ-Ú\s.'-]{3,}?)(?:\s*-\s*)?BP\s*:?\s*(\d{3,})(?:\s*-\s*)?Base\s*:?\s*([A-Z]{3})(?:\s*-\s*)?(\d{2})\/(\d{2})\/(\d{4})/i);
 if (aims) {
  crewName = cleanCrewNameRC7(aims[1]);
  crewId = aims[2];
  base = aims[3].toUpperCase();
  month = Number(aims[5]);
  year = Number(aims[6]);
 }

 const roster = compact.match(/Roster\s+Report\s+(?:Date\s+)?(\d{2})-([A-Za-z]{3})-(\d{4})\s+to\s+(\d{2})-([A-Za-z]{3})-(\d{4}).*?([A-ZÀ-Ú][A-ZÀ-Ú\s.'-]{4,}?)\s*\|\s*(\d{6,})\s*\|\s*([A-Z0-9]+)\s*\|\s*([A-Z]{3})\s*\|\s*([A-Z]{2,5})/i);
 if (roster) {
  month = monthNameToNum(roster[2]) || month;
  year = Number(roster[3]) || year;
  crewName = cleanCrewNameRC7(roster[7]);
  crewId = roster[8];
  base = roster[10];
  rank = roster[11];
 }

 const pipe = compact.match(/([A-ZÀ-Ú][A-ZÀ-Ú\s.'-]{4,}?)\s*\|\s*(\d{6,})\s*\|\s*([A-Z0-9]+)\s*\|\s*([A-Z]{3})\s*\|\s*([A-Z]{2,5})/);
 if (pipe) {
  crewName = cleanCrewNameRC7(pipe[1]);
  crewId = pipe[2];
  base = pipe[4];
  rank = pipe[5];
 }
 return { crewName, crewId, base, rank, month, year, airline: /\bLA\s?\d{3,4}\b/i.test(fullText) ? 'LATAM' : 'Companhia aérea' };
}

function dateStrRC7(day, month, year) {
 return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
}

function dateInReferenceMonthRC7(day, refMonth, refYear) {
 return day && day.month === refMonth && day.year === refYear;
}

function parseDateMarkerAimsRC7(line, baseMonth, baseYear) {
 const m = String(line || '').trim().match(/^(\d{2})(Jan|Feb|Mar|Apr|May|Ma|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Fev|Abr|Mai|Ago|Set|Out|Dez)$/i);
 if (!m) return null;
 const day = Number(m[1]);
 let month = String(m[2]).toLowerCase() === 'ma' ? 5 : (monthNameToNum(m[2]) || baseMonth);
 let year = baseYear;
 if (month < baseMonth - 6) year++;
 if (month > baseMonth + 6) year--;
 return { day, month, year };
}

function operationalCodeRC7(token, nextToken = '') {
 const t = String(token || '').toUpperCase();
 if (t === 'CRMBSB' || t === 'CRMB' || (t === 'CRM' && String(nextToken || '').toUpperCase() === 'BSB')) return 'CRM';
 if (t === 'CRMB' && String(nextToken || '').toUpperCase() === 'SB') return 'CRM';
 if (/^C\d{2,3}F$/.test(t)) return t;
 if (['HSB','HSBE','ASB','CBF','EMER','MT','CRM','NS','NSJ','IJ','DM','SAER'].includes(t)) return t;
 return null;
}

function dayTypeFromCodeRC7(code) {
 if (code === 'ASB' || code === 'HSB' || code === 'HSBE') return code;
 if (code === 'CRM' || code === 'CBF' || code === 'EMER' || /^C\d{2,3}F$/.test(code)) return 'CRM';
 return 'OTHER';
}

function stationTimePairsRC7(tokens) {
 const out = [];
 for (let i = 0; i < tokens.length - 1; i++) {
  const a = String(tokens[i] || '').toUpperCase();
  if (AIRPORTS.has(a) && isTimeToken(tokens[i + 1])) out.push({ station: a, time: normalizeTimeToken(tokens[i + 1]) });
 }
 return out;
}

function activityWindowRC7(fragment, code = '') {
 const tokens = String(fragment || '').split(/\s+/).filter(Boolean);
 const pairs = stationTimePairsRC7(tokens);
 if (pairs.length >= 2) return { start: pairs[0].time, end: pairs[pairs.length - 1].time };
 const times = tokens.filter(isTimeToken).map(normalizeTimeToken);
 if (!times.length) return { start: null, end: null };
 const start = times[0];
 let end = times[times.length - 1];
 // If the last token is a pure duration column (e.g. 02:30 after BSB 16:30), prefer the last repeated pair before it.
 if (times.length >= 4 && toMin(end) < toMin(start) && !/\(\+1\)/.test(end)) end = times[times.length - 2];
 if (end === start && times.length >= 2) end = times[1];
 return { start, end };
}

function makeActivityDayRC7(day, month, year, base, code, fragment, rawText) {
 const d = makeDay(day, month, year, base);
 d.rawText = rawText || fragment;
 d.pairingCode = code;
 d.type = dayTypeFromCodeRC7(code);
 const win = activityWindowRC7(fragment, code);
 d.dutyReport = win.start;
 d.dutyDebrief = win.end;
 d.dutyHours = win.start && win.end ? diffHours(win.start, win.end) : null;
 d.flyingHours = 0;
 return d;
}

function makeLegRC7(flightNumber, origin, destination, departureTime, arrivalTime, workType = 'OP', aircraftType) {
 const o = String(origin || '').toUpperCase();
 const d = String(destination || '').toUpperCase();
 if (!AIRPORTS.has(o) || !AIRPORTS.has(d) || o === d) return null;
 const dep = normalizeTimeToken(departureTime);
 const arr = normalizeTimeToken(arrivalTime).replace('(+1)', '');
 const rawArr = normalizeTimeToken(arrivalTime);
 if (!isTimeToken(dep) || !isTimeToken(rawArr)) return null;
 const duration = diffHours(dep, rawArr);
 if (duration < 0.16 || duration > 8.5) return null;
 return { flightNumber: String(flightNumber || '').replace(/\s+/g, '').toUpperCase(), origin: o, destination: d, departureTime: dep, arrivalTime: arr, workType: String(workType || 'OP').toUpperCase(), aircraftType, isNextDay: /\(\+1\)/.test(rawArr) || toMin(rawArr) < toMin(dep), duration };
}

function addLegRC7(day, leg) {
 if (!leg) return;
 const key = `${leg.flightNumber}|${leg.origin}|${leg.destination}|${leg.departureTime}|${leg.arrivalTime}`;
 if (!day.legs.some((old) => `${old.flightNumber}|${old.origin}|${old.destination}|${old.departureTime}|${old.arrivalTime}` === key)) day.legs.push(leg);
}

function aircraftFromTokensRC7(tokens) {
 return tokens.map((t) => String(t || '').toUpperCase()).find((t) => /^\(?(?:32S|31R|39R|328|319|320|321|32N)\)?$/.test(t))?.replace(/[()]/g, '');
}

function parseStrictFlightsRC7(text) {
 const legs = [];
 const src = normalizeLineRC7(text);
 const strict = /\b(LA\s?\d{3,4})\b\s+(?:(?:CC|CP|FO|CM|CMT|CMD)\s+)?(?:(OP|PS|DH)\s+)?([A-Z]{3})\s+(\d{1,2}:\d{2}(?:\(\+1\))?)\s+([A-Z]{3})\s+(\d{1,2}:\d{2}(?:\(\+1\))?)/gi;
 let m;
 while ((m = strict.exec(src)) !== null) {
  const leg = makeLegRC7(m[1], m[3], m[5], m[4], m[6], m[2] || 'OP', findAircraftAfter(src, m.index));
  if (leg) legs.push(leg);
 }
 return legs;
}

function isExtraMarkerRC10867(value) {
 const token = String(value || '').trim().toUpperCase();
 return token === '[EXTRA]' || token === 'EXTRA' || token === 'PS' || token === 'PAX' || token === 'PASSAGEIRO';
}

function parseAimsLegSeqRC7(flightNumber, seq, nextTokens = [], forcedWorkType = 'OP') {
 let rawTokens = seq.map((t) => String(t || '').trim()).filter(Boolean);
 const markedExtra = rawTokens.some(isExtraMarkerRC10867) || String(forcedWorkType || '').toUpperCase() === 'PS';
 let tokens = rawTokens.filter((t) => !isExtraMarkerRC10867(t));
 if (tokens.some((t) => String(t).startsWith('(...)'))) tokens = tokens.concat(nextAimsContinuationRC7(nextTokens));
 const upper = tokens.map((t) => t.toUpperCase());
 const airports = [];
 for (let i = 0; i < upper.length; i++) if (AIRPORTS.has(upper[i])) airports.push(i);
 if (airports.length < 2) return null;
 let best = null;
 for (let a = 0; a < airports.length - 1; a++) {
  const oi = airports[a];
  const origin = upper[oi];
  const beforeOriginTimes = tokens.slice(0, oi).filter(isTimeToken).map(normalizeTimeToken);
  const dep = beforeOriginTimes.at(-1);
  if (!dep) continue;
  for (let b = a + 1; b < airports.length; b++) {
   const di = airports[b];
   const dest = upper[di];
   if (dest === origin) continue;
   const afterDestTimes = tokens.slice(di + 1).filter(isTimeToken).map(normalizeTimeToken);
   if (!afterDestTimes.length) continue;
   const arr = afterDestTimes[0];
   const duration = diffHours(dep, arr);
   if (duration < 0.16 || duration > 8.5) continue;
   const score = 100 - Math.abs(duration - 1.8) * 6 - Math.abs(di - oi - 1);
   if (!best || score > best.score) best = { origin, dest, dep, arr, score };
  }
 }
 if (!best) return null;
 const workType = markedExtra ? 'PS' : String(forcedWorkType || 'OP').toUpperCase();
 return makeLegRC7(flightNumber, best.origin, best.dest, best.dep, best.arr, workType, aircraftFromTokensRC7(tokens));
}

function nextAimsContinuationRC7(tokens) {
 const out = [];
 const stopCodes = new Set(['LA','DOPR','DOP','DOPR','DOP','DO','DOF','DR','OFF','VC','VC','HSB','HSBE','ASB','CBF','EMER','MT','CRM','CRMB','CRMBSB','NS','NSJ','IJ','DM','SAER']);
 for (const token of tokens || []) {
  const upper = String(token || '').toUpperCase();
  if (out.length && stopCodes.has(upper)) break;
  out.push(token);
  if (/^\([A-Z0-9]{3}\)$/.test(upper)) break;
 }
 return out;
}

function buildRosterBlocksRC7(fullText) {
 const lines = cleanTextRC7(fullText).split(/\n+/).map(normalizeLineRC7).filter(Boolean);
 const blocks = [];
 let current = null;
 const dateRe = /^(\d{2})-([A-Za-z]{3})-(\d{4})\b\s*(.*)$/;
 for (const line of lines) {
  if (/^(Roster Report|Date\b|Duty\b|Report\b|Pairing\/Activity|Updated By|Updated Date|A\/C\b|Type\b|Overridde)/i.test(line)) continue;
  const m = line.match(dateRe);
  if (m) {
   if (current) blocks.push(current);
   current = { day: Number(m[1]), month: monthNameToNum(m[2]), year: Number(m[3]), parts: [m[4] || ''] };
   continue;
  }
  if (current && /\b(LA\s?\d{3,4}|DOPR|DOP|DOF?|DR|OFF|VC|HSBE?|ASB|CBF|EMER|MT|CRM|CRMB|CRMBSB|C\d{2,3}F|NSJ?|IJ|DM|SAER|[A-Z]{3}\s+\d{1,2}:\d{2}|\d{1,2}:\d{2}\(\+1\))\b/i.test(line)) current.parts.push(line);
 }
 if (current) blocks.push(current);
 return blocks;
}

function parseRosterReportRC7(fullText, filename = '') {
 const h = headerRC7(fullText, filename);
 const days = [];
 for (const block of buildRosterBlocksRC7(fullText)) {
  if (block.month !== h.month || block.year !== h.year) continue;
  const raw = normalizeLineRC7(block.parts.join(' '));
  const events = parseBlockEventsRC7(block.day, block.month, block.year, h.base, raw);
  days.push(...events);
 }
 if (!days.length) throw new Error('Nenhum evento encontrado no CrewRosterReport.');
 return { ...h, days, rawText: fullText, totals: extractTotals(fullText) };
}

function parseBlockEventsRC7(day, month, year, base, raw) {
 const upper = raw.toUpperCase();
 const events = [];
 const activityRe = /\b(HSBE|HSB|ASB|CBF|EMER|C\d{2,3}F|CRMBSB|CRMB|CRM|MT|NSJ|NS|IJ|DM|SAER)\b/g;
 let match;
 const activityHits = [];
 while ((match = activityRe.exec(upper)) !== null) activityHits.push({ code: operationalCodeRC7(match[1]) || match[1], index: match.index });
 for (let i = 0; i < activityHits.length; i++) {
  const hit = activityHits[i];
  const end = activityHits[i + 1]?.index ?? upper.length;
  const fragment = raw.slice(hit.index, end);
  const d = makeActivityDayRC7(day, month, year, base, hit.code, fragment, raw);
  events.push(d);
 }
 const flightDay = makeDay(day, month, year, base);
 flightDay.rawText = raw;
 for (const leg of parseStrictFlightsRC7(raw)) addLegRC7(flightDay, leg);
 if (flightDay.legs.length) {
  flightDay.type = 'VOO'; flightDay.pairingCode = flightDay.legs[0].flightNumber;
  const first = flightDay.legs[0]; const last = flightDay.legs.at(-1);
  const flightDigits = String(first.flightNumber || '').replace(/^LA/i, '');
  const flightRe = new RegExp(`\bLA\s?${flightDigits}\b`, 'gi');
  const occurrences = [...raw.matchAll(flightRe)];
  const actualLegIndex = occurrences.length > 1 ? occurrences[1].index : occurrences[0]?.index;
  const beforeActualLeg = Number.isFinite(actualLegIndex) ? raw.slice(0, actualLegIndex) : raw.slice(0, raw.indexOf(first.flightNumber));
  const timesBeforeFirst = beforeActualLeg.match(/\b\d{1,2}:\d{2}(?:\(\+1\))?\b/g)?.map(normalizeTimeToken) || [];
  const publishedReport = timesBeforeFirst.find((time) => time !== first.departureTime && diffHours(time, first.departureTime) > 0 && diffHours(time, first.departureTime) <= 4);
  flightDay.dutyReport = publishedReport || timesBeforeFirst.at(-1) || first.departureTime;
  const afterLastDest = raw.slice(raw.lastIndexOf(last.destination));
  const afterTimes = afterLastDest.match(/\b\d{1,2}:\d{2}(?:\(\+1\))?\b/g)?.map(normalizeTimeToken) || [];
  flightDay.dutyDebrief = afterTimes.length >= 2 ? afterTimes[1].replace('(+1)','') : addMinutesRC7(last.arrivalTime, 30);
  flightDay.flyingHours = flightDay.legs.reduce((s, l) => s + (l.duration || diffHours(l.departureTime, l.arrivalTime)), 0);
  flightDay.dutyHours = diffHours(flightDay.dutyReport, flightDay.dutyDebrief);
  flightDay.isNextDay = flightDay.legs.some((l) => l.isNextDay) || diffHours(flightDay.dutyReport, flightDay.dutyDebrief) > 18;
  events.push(flightDay);
 }
 if (!events.length) {
  const rest = upper.match(/\b(DOPR|DOP|DOF|DO|DR|OFF|VC)\b/);
  if (rest) { const d = makeDay(day, month, year, base); d.rawText = raw; d.type = rest[1]; d.pairingCode = rest[1]; d.dutyHours = 0; d.flyingHours = 0; events.push(d); }
 }
 return events;
}

function addMinutesRC7(time, minutes) {
 const raw = toMin(time) + minutes;
 const h = Math.floor((raw % 1440) / 60);
 const m = raw % 60;
 return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function buildAimsBlocksRC7(fullText, baseMonth, baseYear) {
 const head = cleanTextRC7(fullText).split(/\n\s*Tripulações\s*\n/i)[0];
 const lines = head.split(/\n+/).map((l) => String(l || '').trim()).filter(Boolean).filter((l) => !/^(Confira na escala|Escala de Tripulante|Tripulante:|Timezone)/i.test(l));
 const blocks = [];
 let current = null;
 for (const line of lines) {
  const marker = parseDateMarkerAimsRC7(line, baseMonth, baseYear);
  if (marker) {
   if (current) blocks.push(current);
   current = { ...marker, tokens: [] };
   continue;
  }
  if (!current) continue;
  for (const token of line.split(/\s+/).filter(Boolean)) {
   if (/^(y|Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/i.test(token)) continue;
   current.tokens.push(token);
  }
 }
 if (current) blocks.push(current);
 return blocks;
}

function parseAimsRC7(fullText, filename = '') {
 const h = headerRC7(fullText, filename);
 const blocks = buildAimsBlocksRC7(fullText, h.month, h.year);
 const days = [];
 for (let i = 0; i < blocks.length; i++) {
  const b = blocks[i];
  if (b.month !== h.month || b.year !== h.year) continue;
  days.push(...parseAimsBlockRC7(b, blocks[i + 1], h.base));
 }
 if (!days.length) throw new Error('Nenhuma programação encontrada no AIMS.');
 return { ...h, days, rawText: fullText, totals: extractTotals(fullText) };
}

function parseAimsBlockRC7(block, nextBlock, base) {
 const tokens = (block.tokens || []).map((t) => String(t || '').trim()).filter(Boolean);
 const upper = tokens.map((t) => t.toUpperCase());
 const events = [];
 const positions = [];
 for (let i = 0; i < upper.length; i++) {
  const code = operationalCodeRC7(upper[i], upper[i + 1]);
  if (code) positions.push({ code, index: i });
 }
 for (let p = 0; p < positions.length; p++) {
  const { code, index } = positions[p];
  const nextOp = positions[p + 1]?.index;
  const nextFlight = upper.findIndex((t, idx) => idx > index && t === 'LA' && /^\d{3,4}$/.test(upper[idx + 1] || ''));
  let end = tokens.length;
  if (nextOp > index) end = Math.min(end, nextOp);
  if (nextFlight > index) end = Math.min(end, Math.max(index + 1, isExtraMarkerRC10867(tokens[nextFlight - 1]) ? nextFlight - 1 : nextFlight));
  const slice = tokens.slice(index, end);
  events.push(makeActivityDayRC7(block.day, block.month, block.year, base, code, slice.join(' '), tokens.join(' ')));
 }

 const flightDay = makeDay(block.day, block.month, block.year, base);
 flightDay.rawText = tokens.join(' ');
 const flightPositions = [];
 for (let i = 0; i < upper.length; i++) {
  if (upper[i] === 'LA' && /^\d{3,4}$/.test(upper[i + 1] || '')) {
   const markerBefore = i > 0 && isExtraMarkerRC10867(tokens[i - 1]);
   flightPositions.push({ index: i, boundaryIndex: markerBefore ? i - 1 : i, isExtra: markerBefore, number: 'LA' + upper[i + 1] });
  }
 }
 for (let f = 0; f < flightPositions.length; f++) {
  const current = flightPositions[f];
  const nextBoundary = flightPositions[f + 1]?.boundaryIndex ?? tokens.length;
  const seq = tokens.slice(current.index + 2, nextBoundary);
  const isExtra = current.isExtra || seq.some(isExtraMarkerRC10867);
  addLegRC7(flightDay, parseAimsLegSeqRC7(current.number, seq, nextBlock?.tokens || [], isExtra ? 'PS' : 'OP'));
 }
 if (flightDay.legs.length) {
  flightDay.type = 'VOO'; flightDay.pairingCode = flightDay.legs[0].flightNumber;
  const first = flightDay.legs[0]; const last = flightDay.legs.at(-1);
  flightDay.dutyReport = inferAimsDutyReportRC7(tokens, first) || first.departureTime;
  flightDay.dutyDebrief = inferAimsDutyDebriefRC7(tokens, last, nextBlock?.tokens || []) || addMinutesRC7(last.arrivalTime, 30);
  flightDay.isNextDay = flightDay.legs.some((l) => l.isNextDay) || diffHours(flightDay.dutyReport, flightDay.dutyDebrief) > 18;
  flightDay.flyingHours = flightDay.legs.reduce((sum, leg) => sum + (leg.duration || diffHours(leg.departureTime, leg.arrivalTime)), 0);
  flightDay.dutyHours = diffHours(flightDay.dutyReport, flightDay.dutyDebrief);
  events.push(flightDay);
 }
 if (!events.length) {
  const rest = upper.join(' ').match(/\b(DOPR|DOP|DOF|DO|DR|OFF|VC)\b/);
  if (rest) { const d = makeDay(block.day, block.month, block.year, base); d.rawText = tokens.join(' '); d.type = rest[1]; d.pairingCode = rest[1]; d.dutyHours = 0; d.flyingHours = 0; events.push(d); }
 }
 return events;
}

function inferAimsDutyReportRC7(tokens, firstLeg) {
 const upper = tokens.map((t) => String(t).toUpperCase());
 const laIdx = upper.findIndex((t, idx) => t === 'LA' && upper[idx + 1] === firstLeg.flightNumber.replace('LA',''));
 const originIdx = upper.findIndex((t, idx) => idx > laIdx && t === firstLeg.origin);
 const times = tokens.slice(laIdx >= 0 ? laIdx + 2 : 0, originIdx > 0 ? originIdx : tokens.length).filter(isTimeToken).map(normalizeTimeToken);
 return times[0] || null;
}

function inferAimsDutyDebriefRC7(tokens, lastLeg, nextTokens = []) {
 const combined = tokens.concat(nextAimsContinuationRC7(nextTokens));
 const upper = combined.map((t) => String(t).toUpperCase());
 let destIdx = -1;
 for (let i = upper.length - 1; i >= 0; i--) if (upper[i] === lastLeg.destination) { destIdx = i; break; }
 const after = destIdx >= 0 ? combined.slice(destIdx + 1) : [];
 const times = after.filter(isTimeToken).map(normalizeTimeToken);
 return times[1] || null;
}

function finalizeDaysRC7(days, month, year, base) {
 const filtered = (days || []).filter((d) => dateInReferenceMonthRC7(d, month, year));
 const exact = new Map();
 for (const d of filtered) {
  const legKey = (d.legs || []).map((l) => `${l.flightNumber}-${l.origin}-${l.destination}-${l.departureTime}-${l.arrivalTime}`).join(';');
  const key = `${d.date}|${primaryCodeRC7(d)}|${d.dutyReport || ''}|${d.dutyDebrief || ''}|${legKey}`;
  if (!exact.has(key)) exact.set(key, d);
 }

 const exactDays = [...exact.values()];
 const timedKeys = new Set(exactDays.filter(hasWindowRC7).map((d) => `${d.date}|${primaryCodeRC7(d)}`));
 const withoutAllDayDuplicates = exactDays.filter((d) => hasWindowRC7(d) || !timedKeys.has(`${d.date}|${primaryCodeRC7(d)}`));
 const merged = mergeActivitiesIntoFlightDaysRC7(withoutAllDayDuplicates);
 const timedMerged = mergeConsecutiveActivitiesRC7(merged);

 const finalMap = new Map();
 for (const d of timedMerged) {
  const legKey = (d.legs || []).map((l) => `${l.flightNumber}-${l.origin}-${l.destination}-${l.departureTime}-${l.arrivalTime}`).join(';');
  const key = `${d.date}|${primaryCodeRC7(d)}|${d.dutyReport || ''}|${d.dutyDebrief || ''}|${legKey}`;
  if (!finalMap.has(key)) finalMap.set(key, d);
 }
 return [...finalMap.values()].sort(compareDayRC7);
}

function compareDayRC7(a, b) {
 return new Date(a.year, a.month - 1, a.dayNumber).getTime() - new Date(b.year, b.month - 1, b.dayNumber).getTime() || toMin(a.dutyReport || '23:59') - toMin(b.dutyReport || '23:59');
}

function hasWindowRC7(day) {
 return Boolean(day?.dutyReport && day?.dutyDebrief);
}

function isFlightDayRC7(day) {
 return day?.type === 'VOO' && Array.isArray(day.legs) && day.legs.length > 0;
}

function primaryCodeRC7(day) {
 const direct = String(day?.pairingCode || '').toUpperCase();
 if (direct && !/^LA\d{3,4}$/.test(direct)) return direct;
 const raw = `${day?.pairingCode || ''} ${day?.type || ''} ${day?.rawText || ''}`.toUpperCase();
 return raw.match(/\b(C\d{2,3}F|CRM|CBF|EMER|MT|HSBE|HSB|ASB|NSJ|NS|IJ|DM|[A-Z]{1,4}J)\b/)?.[1] || String(day?.type || 'OTHER').toUpperCase();
}

function mergeActivitiesIntoFlightDaysRC7(days) {
 const byDate = new Map();
 for (const d of days) {
  const arr = byDate.get(d.date) || [];
  arr.push(d);
  byDate.set(d.date, arr);
 }
 const output = [];
 for (const group of byDate.values()) {
  const flights = group.filter(isFlightDayRC7).sort(compareDayRC7);
  const others = group.filter((d) => !isFlightDayRC7(d));
  const consumed = new Set();
  for (const flight of flights) {
   const raw = String(flight.rawText || '').toUpperCase();
   for (const activity of others) {
    if (consumed.has(activity)) continue;
    const code = primaryCodeRC7(activity);
    if (!/^(C\d{2,3}F|CRM|CBF|EMER|MT)$/.test(code)) continue;
    // C32F/check A32F deve permanecer como programação separada do voo.
    if (/^C\d{2,3}F$/.test(code)) continue;
    if (raw.includes(code) || windowsOverlapRC7(flight, activity, 180)) {
     flight.rawText = [flight.rawText, activity.rawText || code].filter(Boolean).join('\n');
     flight.dutyReport = minTimeRC7(flight.dutyReport, activity.dutyReport) || flight.dutyReport;
     flight.dutyDebrief = maxTimeRC7(flight.dutyReport, flight.dutyDebrief, activity.dutyDebrief) || flight.dutyDebrief;
     if (!flight.pairingCode || /^LA\d{3,4}$/.test(flight.pairingCode)) flight.pairingCode = code;
     if (flight.dutyReport && flight.dutyDebrief) flight.dutyHours = diffHours(flight.dutyReport, flight.dutyDebrief);
     consumed.add(activity);
    }
   }
   output.push(flight);
  }
  for (const d of others) if (!consumed.has(d)) output.push(d);
 }
 return output;
}

function mergeConsecutiveActivitiesRC7(days) {
 const grouped = new Map();
 const output = [];
 for (const day of days) {
  if (isFlightDayRC7(day)) {
   output.push(day);
   continue;
  }
  const code = primaryCodeRC7(day);
  if (!/^(C\d{2,3}F|CRM|CBF|EMER|MT)$/.test(code)) {
   output.push(day);
   continue;
  }
  const key = `${day.date}|${code}`;
  const arr = grouped.get(key) || [];
  arr.push(day);
  grouped.set(key, arr);
 }

 for (const group of grouped.values()) {
  const timed = group.filter(hasWindowRC7).sort(compareDayRC7);
  if (timed.length <= 1) {
   output.push(...group);
   continue;
  }

  const merged = [];
  for (const day of timed) {
   const last = merged.at(-1);
   if (last && windowsOverlapRC7(last, day, 15)) {
    last.dutyReport = minTimeRC7(last.dutyReport, day.dutyReport) || last.dutyReport;
    last.dutyDebrief = maxTimeRC7(last.dutyReport, last.dutyDebrief, day.dutyDebrief) || last.dutyDebrief;
    last.rawText = [last.rawText, day.rawText].filter(Boolean).join('\n');
    last.dutyHours = diffHours(last.dutyReport, last.dutyDebrief);
   } else {
    merged.push({ ...day, legs: [...(day.legs || [])] });
   }
  }
  output.push(...merged);
 }
 return output.sort(compareDayRC7);
}

function windowsOverlapRC7(a, b, tolerance = 0) {
 if (!hasWindowRC7(a) || !hasWindowRC7(b)) return false;
 const as = toMin(a.dutyReport), ae = normalizeEndRC7(as, toMin(a.dutyDebrief));
 const bs = toMin(b.dutyReport), be = normalizeEndRC7(bs, toMin(b.dutyDebrief));
 return as <= be + tolerance && bs <= ae + tolerance;
}

function normalizeEndRC7(start, end) { return end < start ? end + 1440 : end; }
function minTimeRC7(a, b) { if (!a) return b || null; if (!b) return a || null; return toMin(a) <= toMin(b) ? a : b; }
function maxTimeRC7(anchor, a, b) { if (!a) return b || null; if (!b) return a || null; const s = toMin(anchor || a); return normalizeEndRC7(s, toMin(a)) >= normalizeEndRC7(s, toMin(b)) ? a : b; }

function diagnosticsV10(roster, sourceFormat) {
 const days = roster.days || [];
 const uniqueDays = new Set(days.map((d) => d.date)).size;
 const flights = days.reduce((s, d) => s + (d.legs?.length || 0), 0);
 const reserve = days.filter((d) => d.type === 'ASB').length;
 const standby = days.filter((d) => d.type === 'HSB' || d.type === 'HSBE').length;
 const crm = days.filter((d) => (d.pairingCode || '') === 'CRM').length;
 const falseLegs = days.flatMap((d) => d.legs || []).filter((l) => l.origin === l.destination).length;
 const confidence = falseLegs ? 'baixa' : (uniqueDays >= 20 && flights >= 12 ? 'alta' : uniqueDays >= 10 && days.length >= 10 ? 'média' : 'baixa');
 return { sourceFormat, uniqueDays, totalEvents: days.length, flights, reserve, standby, crm, bogusLegs: falseLegs, confidence, appVersion: CREWCHECK_VERSION_RC7, message: confidence === 'baixa' ? 'Leitura insuficiente: o sistema bloqueou resultados inseguros.' : 'Escala lida pelo Precision Core com concatenação de programações e filtro de mês.' };
}

function parseAnyV10(text, filename = '') {
 const clean = cleanTextRC7(text);
 const attempts = [];
 try { attempts.push(parseRosterReportRC7(clean, filename)); } catch (e) { }
 try { attempts.push(parseAimsRC7(clean, filename)); } catch (e) { }
 if (!attempts.length) throw new Error('Texto extraído não corresponde a CrewRosterReport nem AIMS.');
 attempts.forEach((r) => { r.days = finalizeDaysRC7(r.days, r.month, r.year, r.base); });
 attempts.sort((a,b) => {
  const da = diagnosticsV10(a, 'candidate'); const db = diagnosticsV10(b, 'candidate');
  return (db.flights*10 + db.totalEvents*2 + db.uniqueDays) - (da.flights*10 + da.totalEvents*2 + da.uniqueDays);
 });
 return attempts[0];
}

parsePdfOnServer = async function parsePdfOnServerV10({ filename, dataBase64 }) {
 if (!dataBase64 || typeof dataBase64 !== 'string') throw new Error('PDF não recebido pelo servidor.');
 const bytes = decodeBase64PdfPayload(dataBase64);
 if (!bytes.length) throw new Error('PDF vazio.');
 const candidates = [];
 try {
  const pdfjsImport = await import('pdfjs-dist/legacy/build/pdf.js');
  const pdfjs = pdfjsImport.default || pdfjsImport;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes), disableWorker: true, isEvalSupported: false, disableFontFace: true }).promise;
  const pages = [];
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
   const page = await pdf.getPage(pageNo);
   const tc = await page.getTextContent({ normalizeWhitespace: true, disableCombineTextItems: false });
   const items = tc.items.map((it) => ({ str: String(it.str || '').trim(), x: Number(it.transform?.[4] || 0), y: Number(it.transform?.[5] || 0), page: pageNo })).filter((it) => it.str);
   pages.push({ pageNo, items });
  }
  const visual = buildServerFullText(pages);
  const linear = pages.map((p) => p.items.map((i) => i.str).join('\n')).join('\n');
  if (visual.trim().length > 50) candidates.push({ source: 'pdfjs-visual', text: visual });
  if (linear.trim().length > 50) candidates.push({ source: 'pdfjs-linear', text: linear });
 } catch (error) { console.warn('v10 pdfjs extraction unavailable:', error?.message || error); }
 try {
  const mod = await import('pdf-parse');
  const pdfParse = mod.default || mod;
  const out = await pdfParse(bytes);
  if (out?.text && out.text.trim().length > 50) candidates.push({ source: 'pdf-parse', text: out.text });
 } catch (error) { console.warn('v10 pdf-parse fallback unavailable:', error?.message || error); }
 const tried = [];
 const parsed = [];
 const seen = new Set();
 for (const candidate of candidates) {
  const key = candidate.text.slice(0, 1000).replace(/\s+/g, ' ');
  if (seen.has(key)) continue;
  seen.add(key);
  try {
   const roster = parseAnyV10(candidate.text, filename);
   const diagnostics = diagnosticsV10(roster, candidate.source);
   parsed.push({ roster, diagnostics, score: diagnostics.flights * 15 + diagnostics.totalEvents * 3 + diagnostics.uniqueDays * 5 + (diagnostics.confidence === 'alta' ? 500 : diagnostics.confidence === 'média' ? 100 : -1000) });
   tried.push(`${candidate.source}: ${diagnostics.uniqueDays} dias, ${diagnostics.totalEvents} eventos, ${diagnostics.flights} voos, ${diagnostics.confidence}`);
  } catch (error) { tried.push(`${candidate.source}: ${error?.message || error}`); }
 }
 parsed.sort((a,b) => b.score - a.score);
 const best = parsed[0];
 if (!best || best.diagnostics.confidence === 'baixa') throw new Error(`Precision Core não validou a escala. Tentativas: ${tried.join(' | ') || 'sem texto extraído'}`);
 best.roster.rawText = best.roster.rawText || candidates[0]?.text || '';
 return { roster: best.roster, diagnostics: best.diagnostics };
};
// --- end CrewCheck RC7 Precision Core ---

// --- CrewCheck v10.4 Parser Matrix + Calendar Sync: server-only column parser for CrewRosterReport + AIMS ---
const CREWCHECK_VERSION_V103 = '10.4.17 · Ticket servidor + fallback local';

function normalizeTokenV103(value) {
 return String(value || '').replace(/\uFFFE/g, ' ').replace(/\s+/g, ' ').trim();
}

function visualRowsV103(pages, tolerance = 3.2) {
 const out = [];
 for (const page of pages || []) {
  const rows = [];
  const items = (page.items || []).filter((item) => normalizeTokenV103(item.str));
  for (const item of items) {
   let row = rows.find((candidate) => Math.abs(candidate.y - item.y) <= tolerance);
   if (!row) { row = { y: item.y, items: [], pageNo: page.pageNo || item.page || 1 }; rows.push(row); }
   row.items.push(item);
  }
  rows.sort((a, b) => b.y - a.y);
  for (const row of rows) {
   row.items.sort((a, b) => a.x - b.x);
   const text = normalizeLineRC7(row.items.map((item) => normalizeTokenV103(item.str)).join(' '));
   if (text) out.push({ pageNo: row.pageNo, y: row.y, text, items: row.items });
  }
 }
 return out;
}

function itemCenterXV103(item) {
 const width = Number(item.width || 0);
 return Number(item.x || 0) + (Number.isFinite(width) && width > 0 ? width / 2 : 0);
}

function isAimsMarkerTokenV103(value) {
 return /^(\d{2})(Jan|Feb|Mar|Apr|May|Ma|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Fev|Abr|Mai|Ago|Set|Out|Dez)$/i.test(String(value || '').trim());
}

function parseAimsMarkerTokenV103(value, baseMonth, baseYear) {
 const match = String(value || '').trim().match(/^(\d{2})(Jan|Feb|Mar|Apr|May|Ma|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Fev|Abr|Mai|Ago|Set|Out|Dez)$/i);
 if (!match) return null;
 const day = Number(match[1]);
 const rawMonth = match[2].toLowerCase();
 let month = rawMonth === 'ma' ? 5 : (monthNameToNum(match[2]) || baseMonth);
 let year = baseYear;
 if (month < baseMonth - 6) year++;
 if (month > baseMonth + 6) year--;
 return { day, month, year };
}

function cleanAimsColumnTokensV103(tokens) {
 const skip = /^(?:y|Mon|Tue|Wed|Thu|Fri|Sat|Sun|Timezone|-3|:|Bras[ií]lia|Confira|na|escala|publicada|pela|empresa|as|atividades|programadas|hor[aá]rios|de|apresenta[cç][aã]o\.?|Escala|Tripulante|Convertida|para|padr[aã]o|AIMS|BP:|Base:)$/i;
 return (tokens || [])
  .map(normalizeTokenV103)
  .filter(Boolean)
  .filter((token) => !skip.test(token));
}

function buildAimsColumnBlocksFromPagesV103(pages, fullText = '', filename = '') {
 const header = headerRC7(fullText, filename);
 const allBlocks = [];
 for (const page of pages || []) {
  const items = (page.items || []).map((item) => ({ ...item, str: normalizeTokenV103(item.str) })).filter((item) => item.str);
  const markers = items
   .filter((item) => isAimsMarkerTokenV103(item.str))
   .sort((a, b) => itemCenterXV103(a) - itemCenterXV103(b));
  if (!markers.length) continue;
  const markerCenters = markers.map(itemCenterXV103);
  for (let index = 0; index < markers.length; index++) {
   const marker = markers[index];
   const markerInfo = parseAimsMarkerTokenV103(marker.str, header.month, header.year);
   if (!markerInfo) continue;
   const left = index === 0 ? -Infinity : (markerCenters[index - 1] + markerCenters[index]) / 2;
   const right = index === markers.length - 1 ? Infinity : (markerCenters[index] + markerCenters[index + 1]) / 2;
   const columnItems = items
    .filter((item) => {
     const cx = itemCenterXV103(item);
     return cx >= left && cx < right;
    })
    .sort((a, b) => b.y - a.y || a.x - b.x);
   const markerPosition = columnItems.findIndex((item) => item === marker || (item.str === marker.str && Math.abs(item.x - marker.x) < 2 && Math.abs(item.y - marker.y) < 2));
   const contentItems = columnItems.slice(Math.max(0, markerPosition + 1));
   const tokens = cleanAimsColumnTokensV103(contentItems.map((item) => item.str));
   allBlocks.push({ ...markerInfo, tokens, rawText: tokens.join(' '), pageNo: page.pageNo || 1, x: marker.x });
  }
 }
 allBlocks.sort((a, b) => (a.year - b.year) || (a.month - b.month) || (a.day - b.day));
 return { header, blocks: allBlocks };
}

function parseAimsColumnsV103(pages, fullText = '', filename = '') {
 const { header, blocks } = buildAimsColumnBlocksFromPagesV103(pages, fullText, filename);
 if (!blocks.length) throw new Error('AIMS em colunas não encontrado.');
 const days = [];
 for (let i = 0; i < blocks.length; i++) {
  const block = blocks[i];
  if (block.month !== header.month || block.year !== header.year) continue;
  const parsed = parseAimsBlockRC7(block, blocks[i + 1], header.base);
  days.push(...parsed.map((day) => ({ ...day, rawText: day.rawText || block.rawText })));
 }
 const roster = { ...header, days: finalizeDaysRC7(days, header.month, header.year, header.base), rawText: fullText, totals: extractTotals(fullText) };
 if (!roster.days.length) throw new Error('Nenhuma programação lida nas colunas AIMS.');
 return roster;
}

function buildRosterRowBlocksV103(pages, fullText = '', filename = '') {
 const header = headerRC7(fullText, filename);
 const rows = visualRowsV103(pages).filter((row) => !/^(Roster Report|Date\b|Duty\b|Report\b|Pairing\/Activity|Updated By|Updated Date|A\/C\b|Type\b|Overridde|n Rank|Work\b|ACY\b|Hotel\b|SDC\b)/i.test(row.text));
 const blocks = [];
 let current = null;
 const dateRe = /^(\d{2})-([A-Za-z]{3})-(\d{4})\b\s*(.*)$/;
 for (const row of rows) {
  const text = normalizeLineRC7(row.text);
  const match = text.match(dateRe);
  if (match) {
   if (current) blocks.push(current);
   current = { day: Number(match[1]), month: monthNameToNum(match[2]), year: Number(match[3]), parts: [match[4] || ''], y: row.y, pageNo: row.pageNo };
   continue;
  }
  if (current && /\b(LA\s?\d{3,4}|DOPR|DOP|DOF?|DR|OFF|VC|HSBE?|ASB|CBF|EMER|MT|CRM|CRMB|CRMBSB|C\d{2,3}F|NSJ?|IJ|DM|SAER|[A-Z]{3}\s+\d{1,2}:\d{2}|\d{1,2}:\d{2}\(\+1\))\b/i.test(text)) {
   current.parts.push(text);
  }
 }
 if (current) blocks.push(current);
 return { header, blocks };
}

function parseRosterRowsV103(pages, fullText = '', filename = '') {
 const { header, blocks } = buildRosterRowBlocksV103(pages, fullText, filename);
 if (!blocks.length) throw new Error('Linhas CrewRosterReport não encontradas.');
 const days = [];
 for (const block of blocks) {
  if (block.month !== header.month || block.year !== header.year) continue;
  const raw = normalizeLineRC7(block.parts.join(' '));
  const parsed = parseBlockEventsRC7(block.day, block.month, block.year, header.base, raw);
  days.push(...parsed);
 }
 const roster = { ...header, days: finalizeDaysRC7(days, header.month, header.year, header.base), rawText: fullText, totals: extractTotals(fullText) };
 if (!roster.days.length) throw new Error('Nenhum evento lido nas linhas CrewRosterReport.');
 return roster;
}


// --- CrewCheck v10.8.45: tripulações AIMS/iFlight + chefia CCM robusta no servidor ---
function normalizeCrewNameV10845(value) {
 return String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toUpperCase()
  .replace(/[^A-Z0-9\s]/g, ' ')
  .replace(/\b(SR|SRA|MR|MRS|MS|TRIPULANTE|CREW|MEMBER)\b/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();
}

function sameCrewNameV10845(a, b) {
 const left = normalizeCrewNameV10845(a);
 const right = normalizeCrewNameV10845(b);
 if (!left || !right) return false;
 if (left === right) return true;
 if (` ${left} `.includes(` ${right} `) || ` ${right} `.includes(` ${left} `)) return true;
 const aParts = left.split(' ').filter((part) => part.length > 1);
 const bParts = right.split(' ').filter((part) => part.length > 1);
 if (aParts.length < 2 || bParts.length < 2) return false;
 if (aParts[0] === bParts[0] && aParts[aParts.length - 1] === bParts[bParts.length - 1]) return true;
 const shortParts = aParts.length <= bParts.length ? aParts : bParts;
 const longParts = aParts.length <= bParts.length ? bParts : aParts;
 return shortParts.length >= 2 && shortParts.every((part) => longParts.includes(part));
}

function flightKeyV10845(value) {
 const digits = String(value || '').toUpperCase().replace(/\s+/g, '').match(/\d{3,4}/)?.[0];
 return digits ? `LA${digits}` : String(value || '').toUpperCase().replace(/\s+/g, '');
}

function cleanCrewListNameV10845(value) {
 return String(value || '')
  .replace(/Confira na escala publicada pela empresa[\s\S]*$/i, ' ')
  .replace(/Timezone[\s\S]*$/i, ' ')
  .replace(/\b(?:Tripula(?:ç|c)[aã]o|Tripula(?:ç|c)[oõ]es|Tripulacao|Crew\s+List|Crew\s+Complement|Crew\s+Members)\b/gi, ' ')
  .replace(/\b(?:LA\s*\d{3,4}|OP|PS|DH|SB|BSB|GRU|CGH|GIG|SDU|CNF|VCP|NAT|FOR|MCZ|PMW|FLN|MAB|CPV|GYN|JPA)\b[\s\S]*$/i, ' ')
  .replace(/\b\d{5,10}\b/g, ' ')
  .replace(/[|;]/g, ' ')
  .replace(/^[\s:–—-]+|[\s:–—-]+$/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();
}

function crewRoleV10845(role) {
 const value = String(role || '').toUpperCase().replace(/[^A-Z]/g, '');
 return value === 'CM' ? 'CCM' : value;
}

function parseCrewMembersV10845(text, rosterName) {
 const source = String(text || '')
  .replace(/\r/g, '\n')
  .replace(/[\t ]+/g, ' ')
  .replace(/\b(CP|FO|CCM|CC|CM)\b\s*[:–—-]?/gi, '\n$1 ');
 const crew = [];
 const seen = new Set();
 const re = /(?:^|\n|[,;|])\s*(CP|FO|CCM|CC|CM)\s+([\s\S]*?)(?=\n\s*(?:CP|FO|CCM|CC|CM)\b|\s*[,;|]\s*(?:CP|FO|CCM|CC|CM)\b|$)/gi;
 let match;
 while ((match = re.exec(source)) !== null) {
  const role = crewRoleV10845(match[1]);
  const name = cleanCrewListNameV10845(match[2]);
  const normalized = normalizeCrewNameV10845(name);
  const minPartsOk = normalized.split(' ').length >= 2 || ['CP','FO'].includes(role);
  if (!normalized || normalized.length < 2 || !minPartsOk) continue;
  const key = `${role}|${normalized}`;
  if (seen.has(key)) continue;
  seen.add(key);
  crew.push({ role, name, order: crew.length, isCurrentCrew: sameCrewNameV10845(name, rosterName) });
 }
 return crew;
}

function parseTripulationRecordsV10845(fullText, rosterName, fallbackYear, fallbackMonth) {
 const raw = String(fullText || '');
 const sectionMatch = raw.match(/(?:Tripula(?:ç|c)[oõ]es|Tripulacao|Tripula(?:ç|c)[aã]o|Crew\s+List|Crew\s+Complement|Crew\s+Members)([\s\S]*)/i);
 const sectionSource = sectionMatch ? sectionMatch[1] : raw;
 const section = sectionSource
  .replace(/\r/g, '\n')
  .replace(/[\t ]+/g, ' ')
  // v10.8.46: o PDF do iFlight pode colocar data, voo e tripulação em linhas separadas.
  .replace(/(\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?)\s*\n+\s*(?:Voo|Flight)?\s*LA\s*(\d{3,4})\s*\n+\s*(?=CP|FO|CCM|CC|CM\b)/gi, '\n$1 LA$2 ')
  .replace(/(\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?)\s+(?:Voo|Flight)?\s*LA\s*(\d{3,4})\s+(?=CP|FO|CCM|CC|CM\b)/gi, '\n$1 LA$2 ')
  .replace(/\b(?:Voo|Flight)?\s*LA\s*(\d{3,4})\s*\n+\s*(?=CP|FO|CCM|CC|CM\b)/gi, '\nLA$1 ')
  .replace(/\b(?:Voo|Flight)?\s*LA\s*(\d{3,4})\s+(?=CP|FO|CCM|CC|CM\b)/gi, '\nLA$1 ')
  .replace(/\s+(?=(?:\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?\s+)?LA\s*\d{3,4}\s+(?:CP|FO|CCM|CC|CM)\b)/gi, '\n')
  .replace(/\n{2,}/g, '\n');
 const lineRegex = /(?:^|\n)\s*(?:(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?\s+)?LA\s*(\d{3,4})\s+((?:CP|FO|CCM|CC|CM)\b[\s\S]*?)(?=\n\s*(?:\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?\s+)?LA\s*\d{3,4}\s+(?:CP|FO|CCM|CC|CM)\b|$)/gi;
 const records = [];
 let match;
 while ((match = lineRegex.exec(section)) !== null) {
  const day = match[1] ? String(Number(match[1])).padStart(2, '0') : undefined;
  const month = match[2] ? String(Number(match[2])).padStart(2, '0') : String(fallbackMonth || 1).padStart(2, '0');
  let year = match[3] ? Number(match[3]) : fallbackYear;
  if (year < 100) year += 2000;
  const date = day ? `${day}/${month}/${year}` : undefined;
  const flightNumber = `LA${match[4]}`;
  const crew = parseCrewMembersV10845(match[5], rosterName);
  if (!crew.length) continue;
  const leadCcm = crew.find((member) => String(member.role || '').toUpperCase() === 'CCM') || null;
  records.push({ date, flightNumber, crew, leadCcm });
 }
 return records.filter((record, index, all) => all.findIndex((other) => other.date === record.date && flightKeyV10845(other.flightNumber) === flightKeyV10845(record.flightNumber)) === index);
}

function applyTripulationsToRosterV10845(roster) {
 if (!roster || !Array.isArray(roster.days)) return roster;
 const rosterName = String(roster.crewName || '').trim() || 'Tripulante';
 const records = parseTripulationRecordsV10845(roster.rawText || '', rosterName, roster.year || new Date().getFullYear(), roster.month || (new Date().getMonth()+1));
 if (!records.length) return roster;
 const byExact = new Map();
 const byDate = new Map();
 const byFlight = new Map();
 for (const record of records) {
  const key = flightKeyV10845(record.flightNumber);
  if (record.date) {
   byExact.set(`${record.date}|${key}`, record);
   const list = byDate.get(record.date) || [];
   list.push(record);
   byDate.set(record.date, list);
  }
  if (!byFlight.has(key)) byFlight.set(key, record);
 }
 const days = roster.days.map((day) => {
  const legs = (day.legs || []).map((leg, legIndex) => {
   const key = flightKeyV10845(leg.flightNumber || '');
   const exact = byExact.get(`${day.date}|${key}`);
   const sameDate = !exact && legIndex === 0 ? (byDate.get(day.date) || []).find((record) => flightKeyV10845(record.flightNumber) === key) : null;
   const flightFallback = !exact && !sameDate ? byFlight.get(key) : null;
   const record = exact || sameDate || flightFallback;
   if (!record) return leg;
   const crew = record.crew.map((member, index) => ({ ...member, order: index, isCurrentCrew: member.isCurrentCrew || sameCrewNameV10845(member.name, rosterName) }));
   const leadCcm = crew.find((member) => String(member.role || '').toUpperCase() === 'CCM') || null;
   const current = crew.find((member) => member.isCurrentCrew) || null;
   const ccmBonusStatus = leadCcm
    ? (current && String(current.role || '').toUpperCase() === 'CCM'
     ? (Number(leadCcm.order) === Number(current.order) ? 'confirmed' : 'not_applicable')
     : (sameCrewNameV10845(leadCcm.name, rosterName) ? 'confirmed' : 'pending'))
    : 'pending';
   return { ...leg, crew, ccmLead: leadCcm, ccmBonusStatus };
  });
  return { ...day, legs };
 });
 return { ...roster, days, tripulationRecords: records.length };
}


function extractStructuredIflightPayloadV10846(text) {
 const raw = String(text || '');
 const match = raw.match(/__CREWCHECK_IFLIGHT_CALENDAR_JSON__\s*([\s\S]*?)\s*__CREWCHECK_IFLIGHT_CALENDAR_TEXT__/i);
 if (!match) return null;
 try {
  const payload = JSON.parse(match[1]);
  if (!payload || !Array.isArray(payload.events)) return null;
  return payload;
 } catch (_) {
  return null;
 }
}

function parseIsoDateV10846(value, fallbackMonth, fallbackYear) {
 const raw = String(value || '').trim();
 let m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
 if (m) return { day: Number(m[3]), month: Number(m[2]), year: Number(m[1]) };
 m = raw.match(/^(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?$/);
 if (m) {
  let year = m[3] ? Number(m[3]) : Number(fallbackYear || new Date().getFullYear());
  if (year < 100) year += 2000;
  return { day: Number(m[1]), month: Number(m[2] || fallbackMonth || 1), year };
 }
 return null;
}

function calendarEventTypeV10846(text) {
 const t = String(text || '').toUpperCase();
 if (/\bLA\s*\d{3,4}\b|\bLA\d{3,4}\b/.test(t)) return 'VOO';
 if (/\bHSBE\b/.test(t)) return 'HSBE';
 if (/\bHSB\b/.test(t)) return 'HSB';
 if (/\bASB\b|\bRES\b/.test(t)) return 'ASB';
 if (/\bDOF\b/.test(t)) return 'DOF';
 if (/\bDO\b/.test(t)) return 'DO';
 if (/\bDR\b/.test(t)) return 'DR';
 if (/\bCRM\b|\bCRMB\b/.test(t)) return 'CRM';
 return 'OTHER';
}

function firstCodeFromCalendarTextV10846(text, type) {
 const t = String(text || '').toUpperCase();
 const flight = t.match(/\bLA\s*(\d{3,4})\b|\bLA(\d{3,4})\b/);
 if (flight) return `LA${flight[1] || flight[2]}`;
 const activity = t.match(/\b(HSBE|HSB|ASB|RES|DOF|DO|DR|CBF|EMER|MT|CRM|CRMB|C\d{2,3}F)\b/);
 if (activity) return activity[1] === 'RES' ? 'ASB' : activity[1];
 return type || 'OTHER';
}

function parseIFlightStructuredCalendarV10846({ text, filename = 'iFlight_RosterCalendar.txt', periodMonth, periodYear }) {
 const payload = extractStructuredIflightPayloadV10846(text);
 if (!payload) return null;
 const month = Number(payload?.period?.month || periodMonth || new Date().getMonth() + 1);
 const year = Number(payload?.period?.year || periodYear || new Date().getFullYear());
 const byKey = new Map();
 for (const event of payload.events || []) {
  const rawText = cleanTextRC7(event?.text || '');
  if (!rawText || rawText.length < 2) continue;
  if (/^(?:\d{1,2}:\d{2}|\d{1,2})$/.test(rawText)) continue;
  const parsedDate = parseIsoDateV10846(event?.date, month, year);
  if (!parsedDate) continue;
  const code = firstCodeFromCalendarTextV10846(rawText, 'OTHER');
  const key = `${parsedDate.year}-${parsedDate.month}-${parsedDate.day}|${code}|${rawText}`;
  if (byKey.has(key)) continue;
  byKey.set(key, { ...event, text: rawText, parsedDate, code });
 }
 const events = Array.from(byKey.values()).sort((a, b) => {
  const da = new Date(a.parsedDate.year, a.parsedDate.month - 1, a.parsedDate.day).getTime();
  const db = new Date(b.parsedDate.year, b.parsedDate.month - 1, b.parsedDate.day).getTime();
  return da - db || Number(a.y || 0) - Number(b.y || 0) || String(a.text).localeCompare(String(b.text));
 });
 if (events.length < 3) return null;
 const days = [];
 for (const event of events) {
  const { day, month: evMonth, year: evYear } = event.parsedDate;
  const baseDay = makeDay(day, evMonth, evYear, 'BSB');
  const type = calendarEventTypeV10846(event.text);
  const code = firstCodeFromCalendarTextV10846(event.text, type);
  const times = Array.from(new Set((String(event.text).match(/\b\d{1,2}:\d{2}\b/g) || []).map((v) => v.padStart(5, '0'))));
  const start = times[0] || null;
  const end = times.length > 1 ? times[times.length - 1] : start;
  const row = {
   ...baseDay,
   type,
   pairingCode: code,
   dutyReport: start,
   dutyDebrief: end,
   rawText: event.text,
  };
  if (type === 'VOO') {
   const flightNumbers = Array.from(new Set((String(event.text).match(/\bLA\s*\d{3,4}\b|\bLA\d{3,4}\b/gi) || []).map(flightKeyV10845)));
   row.legs = (flightNumbers.length ? flightNumbers : [code]).map((flightNumber, index) => ({
    flightNumber,
    origin: '',
    destination: '',
    departureTime: times[index] || start || '',
    arrivalTime: times[index + 1] || end || times[index] || start || '',
    workType: /\b(?:PS|EXTRA)\b/i.test(event.text) ? 'PS' : 'OP',
   }));
   row.flyingHours = null;
  } else {
   row.legs = [];
   row.flyingHours = 0;
  }
  days.push(row);
 }
 const normalizedRoster = normalizeRosterForDisplayV103({
  crewName: payload?.crewName || 'Tripulante',
  crewId: payload?.crewId || '',
  base: payload?.base || 'BSB',
  rank: payload?.rank || 'CCM',
  airline: 'LATAM',
  month,
  year,
  days,
  rawText: String(text || ''),
  source: 'iflight-calendar-sweep-dom-v11035',
 });
 const roster = applyTripulationsToRosterV10845(normalizedRoster);
 return { roster, diagnostics: diagnosticsV103(roster, 'iflight-calendar-sweep-dom-v11035') };
}

function parseIFlightCalendarTextV10845({ text, filename = 'iFlight_RosterCalendar.txt', periodMonth, periodYear }) {
 const structured = parseIFlightStructuredCalendarV10846({ text, filename, periodMonth, periodYear });
 if (structured?.roster?.days?.length) return structured;
 const clean = cleanTextRC7(text || '');
 if (!clean || clean.length < 40) throw new Error('Calendário iFlight vazio ou não legível dentro do WebView.');
 const attempts = [];
 try { attempts.push(parseAnyV10(clean, filename)); } catch (error) {}
 try { attempts.push(parseRosterReportRC7(clean, filename)); } catch (error) {}
 try { attempts.push(parseAimsRC7(clean, filename)); } catch (error) {}
 const best = attempts
  .map((roster) => normalizeRosterForDisplayV103({ ...roster, rawText: roster.rawText || clean, month: Number(periodMonth) || roster.month, year: Number(periodYear) || roster.year }))
  .sort((a, b) => ((b.days || []).filter((d) => d.legs?.length).length * 10 + (b.days || []).length) - ((a.days || []).filter((d) => d.legs?.length).length * 10 + (a.days || []).length))[0];
 if (!best || !best.days || best.days.length < 3) throw new Error('Capturei o calendário do iFlight, mas o texto ainda não tinha detalhes suficientes. Use o PDF como fallback ou abra a visão mensal completa antes de sincronizar.');
 best.source = 'iflight-calendar-sweep-dom-v11035';
 best.rawText = clean;
 return { roster: applyTripulationsToRosterV10845(best), diagnostics: diagnosticsV103(best, 'iflight-calendar-sweep-dom-v11035') };
}
// --- end CrewCheck v10.8.45 tripulações/iFlight calendar ---

function monthAbbrEnV10867(month) {
 return ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(month)] || 'Jan';
}

function dateBlockFromFullTextV10867(fullText, date) {
 const parts = String(date || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
 if (!parts) return '';
 const [, dd, mm, yyyy] = parts;
 const month = monthAbbrEnV10867(Number(mm));
 const source = cleanTextRC7(fullText || '');
 const dateRe = new RegExp(`\\b${dd}-${month}-${yyyy}\\b`, 'i');
 const match = dateRe.exec(source);
 if (!match) return '';
 const rest = source.slice(match.index + match[0].length);
 const nextSamePeriod = new RegExp(`\\b\\d{2}-${month}-${yyyy}\\b`, 'i').exec(rest);
 return source.slice(match.index, nextSamePeriod ? match.index + match[0].length + nextSamePeriod.index : source.length);
}

function applyCrewRosterWorkTypesV10867(roster) {
 const raw = String(roster?.rawText || '');
 if (!raw || !Array.isArray(roster?.days)) return roster;
 const hasCrewRosterColumns = /\bDuty\s+Report\b|\bWork\s+Type\b|\bRoster\s+Report\b/i.test(raw);
 if (!hasCrewRosterColumns) return roster;

 const days = roster.days.map((day) => {
  const block = dateBlockFromFullTextV10867(raw, day.date);
  if (!block || !Array.isArray(day.legs) || !day.legs.length) return day;

  const legs = day.legs.map((leg) => {
   const digits = String(leg.flightNumber || '').replace(/^LA/i, '');
   if (!digits) return leg;
   const flightRe = new RegExp(`\\bLA\\s?${digits}\\b`, 'i');
   const match = flightRe.exec(block);
   if (!match) return leg;
   const windowText = block.slice(Math.max(0, match.index - 120), match.index + 260).toUpperCase();
   const isPs = /\bPS\b|\bEXTRA\b|\[EXTRA\]/.test(windowText);
   return isPs ? { ...leg, workType: 'PS' } : leg;
  });

  const firstLeg = legs[0];
  let dutyReport = day.dutyReport;
  if (firstLeg?.departureTime) {
   const firstDigits = String(firstLeg.flightNumber || '').replace(/^LA/i, '');
   const firstRe = new RegExp(`\\bLA\\s?${firstDigits}\\b`, 'gi');
   const firstMatches = [...block.matchAll(firstRe)];
   const firstMatch = firstMatches.length > 1 ? firstMatches[1] : firstMatches[0];
   const beforeFirst = firstMatch ? block.slice(0, firstMatch.index) : '';
   const timesBeforeFirst = beforeFirst.match(/\b\d{1,2}:\d{2}(?:\(\+1\))?\b/g)?.map(normalizeTimeToken) || [];
   const publishedReport = timesBeforeFirst.find((time) => time !== firstLeg.departureTime && diffHours(time, firstLeg.departureTime) > 0 && diffHours(time, firstLeg.departureTime) <= 4);
   dutyReport = publishedReport || timesBeforeFirst.at(-1) || dutyReport;
  }

  return {
   ...day,
   legs,
   dutyReport,
   dutyHours: dutyReport && day.dutyDebrief ? diffHours(dutyReport, day.dutyDebrief) : day.dutyHours
  };
 });

 return { ...roster, days };
}

function normalizeRosterForDisplayV103(roster) {
 roster = applyCrewRosterWorkTypesV10867(roster);
 const fixed = { ...roster, days: (roster.days || []).map((day) => ({ ...day, legs: [...(day.legs || [])] })) };
 for (const day of fixed.days) {
  if (day.pairingCode === 'CRMBSB' || day.pairingCode === 'CRMB' || day.pairingCode === 'CRM') {
   day.pairingCode = 'CRM';
   day.type = 'CRM';
  }
  if (day.type === 'ASB') {
   day.pairingCode = 'ASB';
   day.legs = [];
  }
  if (day.type === 'HSB' || day.type === 'HSBE') {
   day.pairingCode = day.type;
   day.legs = [];
  }
  day.legs = (day.legs || []).filter((leg) => leg.origin && leg.destination && leg.origin !== leg.destination);
  if (day.legs.length) {
   day.type = 'VOO';
   day.pairingCode = day.legs[0].flightNumber;
   const first = day.legs[0];
   const last = day.legs[day.legs.length - 1];
   day.dutyReport = day.dutyReport || first.departureTime;
   day.dutyDebrief = day.dutyDebrief || addMinutesRC7(last.arrivalTime, 30);
   day.flyingHours = day.legs.reduce((sum, leg) => sum + (leg.duration || diffHours(leg.departureTime, leg.arrivalTime)), 0);
   day.dutyHours = day.dutyReport && day.dutyDebrief ? diffHours(day.dutyReport, day.dutyDebrief) : day.dutyHours;
   const raw = String(day.rawText || '') + ' ' + String(day.pairingCode || '');
   const dutyHours = day.dutyReport && day.dutyDebrief ? diffHours(day.dutyReport, day.dutyDebrief) : 0;
   const gapToFirst = day.dutyReport && first.departureTime ? ((toMin(first.departureTime) - toMin(day.dutyReport) + 1440) % 1440) : 0;
   if (/\b(C\d{2,3}F|CRM|CBF|EMER)\b/i.test(raw) && (dutyHours > 16 || gapToFirst > 360)) {
    day.dutyReport = first.departureTime;
    day.dutyDebrief = last.arrivalTime;
    day.isNextDay = Boolean(day.legs.some((leg) => leg.isNextDay) || toMin(last.arrivalTime) < toMin(first.departureTime));
    day.dutyHours = diffHours(day.dutyReport, day.dutyDebrief);
    day.rawText = [day.rawText, 'CrewCheck: voo pós-check normalizado para evitar jornada visual falsa.'].filter(Boolean).join('\n');
   }
  }
 }
 const withCrew = applyTripulationsToRosterV10845(fixed);
 withCrew.days = finalizeDaysRC7(withCrew.days, withCrew.month, withCrew.year, withCrew.base);
 return withCrew;
}

function diagnosticsV103(roster, sourceFormat) {
 const base = diagnosticsV10(roster, sourceFormat);
 return { ...base, appVersion: CREWCHECK_VERSION_V103, message: base.confidence === 'baixa' ? 'Leitura insuficiente: revisar PDF ou tentar o outro formato.' : 'Escala lida pelo Parser Matrix v10.4 com concatenação, deduplicação e auditoria de mês.' };
}

function parserScoreV103(roster, source) {
 const d = diagnosticsV103(roster, source);
 const fullMonthDays = new Date(roster.year, roster.month, 0).getDate();
 const coverage = Math.min(d.uniqueDays, fullMonthDays);
 return d.flights * 20 + d.totalEvents * 4 + coverage * 8 + d.reserve * 15 + d.standby * 12 + d.crm * 10 - d.bogusLegs * 200 + (d.confidence === 'alta' ? 600 : d.confidence === 'média' ? 150 : -500);
}

function parseTextOnlyV103(text, filename = '') {
 const roster = parseAnyV10(text, filename);
 return normalizeRosterForDisplayV103(roster);
}



// --- CrewCheck 10.4.17: parser servidor para escala em formato ticket ---
const TICKET_MONTHS_SERVER = { JAN:1, FEB:2, MAR:3, APR:4, MAY:5, JUN:6, JUL:7, AUG:8, SEP:9, OCT:10, NOV:11, DEC:12 };
const TICKET_WEEKDAYS_SERVER = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/i;

function cleanTicketServerToken(value) {
 return String(value || '')
  .normalize('NFC')
  .replace(/[\uE000-\uF8FF]/g, ' ')
  .replace(/[^\p{L}\p{N}:\/()+_\-.'\s]/gu, ' ')
  .replace(/\bLA\s+(\d{3,4})\b/gi, 'LA$1')
  .replace(/\s+/g, ' ')
  .trim();
}

function ticketLooksLikeServer(text, filename = '') {
 const sample = cleanTicketServerToken(text);
 return (/Tripulante\s*:/i.test(sample) && /(Apresenta|T[ée]?rmino\s*da\s*Jornada|T[ée]?rminodaJornada|\bLA\s?\d{3,4}\b)/i.test(sample)) || /ticket/i.test(filename || '');
}

function parseTicketServerDateBlocks(text, fallbackYear) {
 const rawLines = String(text || '').split(/\r?\n/);
 const lines = rawLines.map(cleanTicketServerToken).filter(Boolean);
 const markers = [];
 for (let i = 0; i < lines.length; i++) {
  if (!TICKET_WEEKDAYS_SERVER.test(lines[i])) continue;
  const day = Number((lines[i + 1] || '').match(/^\d{1,2}$/)?.[0] || 0);
  const month = TICKET_MONTHS_SERVER[String(lines[i + 2] || '').toUpperCase()] || 0;
  if (day >= 1 && day <= 31 && month) markers.push({ index: i, weekday: lines[i], day, month, year: fallbackYear });
 }
 const deduped = markers.filter((m, idx, arr) => !arr.some((p, pi) => pi < idx && p.day === m.day && p.month === m.month && Math.abs(p.index - m.index) <= 3));
 return { lines, markers: deduped };
}

function inferTicketServerHeader(text, filename = '') {
 const clean = cleanTicketServerToken(text);
 const name = clean.match(/Tripulante\s*:\s*([A-ZÀ-Ú][A-ZÀ-Ú\s.'-]{2,}?)(?=\s+(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun|Apresenta|LA\d|$))/i)?.[1]
  || clean.match(/Tripulante\s*:\s*([A-ZÀ-Ú][A-ZÀ-Ú\s.'-]{2,})/i)?.[1]
  || 'Tripulante';
 const yearFromFile = String(filename || '').match(/(20\d{2})/)?.[1];
 const year = yearFromFile ? Number(yearFromFile) : new Date().getFullYear();
 return { crewName: name.replace(/([a-zà-ú])([A-ZÀ-Ú])/g, '$1 $2').trim(), crewId: '', base: 'BSB', rank: 'CCM', airline: 'LATAM', year };
}

function ticketServerDate(day, month, year, base) {
 return makeDay(day, month, year, base || 'BSB');
}

function normalizeTicketServerTime(value) {
 const m = String(value || '').match(/(\d{1,2}):(\d{2})/);
 if (!m) return null;
 return `${String(Number(m[1])).padStart(2, '0')}:${m[2]}`;
}

function nextTicketServerDate(day, month, year) {
 const d = new Date(year, month - 1, day + 1);
 return { day: d.getDate(), month: d.getMonth() + 1, year: d.getFullYear() };
}

function stationTimePairsServer(segment) {
 const prepared = cleanTicketServerToken(segment)
  .replace(/\b([A-Z]{3})(\d{1,2}:\d{2})\b/g, '$1 $2')
  .replace(/\b([A-Z]{3})\s+(\d{1,2}:\d{2})\b/g, '$1 $2');
 const pairs = [];
 const re = /\b([A-Z]{3})\s+(\d{1,2}:\d{2})\b/g;
 let m;
 while ((m = re.exec(prepared)) !== null) pairs.push({ station: m[1], time: normalizeTicketServerTime(m[2]) });
 return pairs.filter((p) => p.time);
}

function parseTicketServerBlock(marker, blockLines, header) {
 const raw = blockLines.join('\n');
 const text = cleanTicketServerToken(blockLines.join(' ')).replace(/\b([A-Z]{3})(\d{1,2}:\d{2})\b/g, '$1 $2');
 const days = [];
 if (!text) return days;

 const report = normalizeTicketServerTime(text.match(/Apresenta(?:ção|cao)?\s*:?\s*(\d{1,2}:\d{2})/i)?.[1]);
 const debrief = normalizeTicketServerTime(text.match(/T[ée]?rmino\s*da\s*Jornada\s*:?\s*(\d{1,2}:\d{2})/i)?.[1] || text.match(/T[ée]?rminodaJornada\s*:?\s*(\d{1,2}:\d{2})/i)?.[1]);
 const flightMatches = [...text.matchAll(/\bLA\s?(\d{3,4})\b/gi)];

 if (flightMatches.length) {
  const duty = ticketServerDate(marker.day, marker.month, marker.year, header.base);
  duty.type = 'VOO';
  duty.dutyReport = report;
  duty.dutyDebrief = debrief;
  duty.pairingCode = `LA${flightMatches[0][1]}`;
  duty.rawText = raw;
  duty.legs = [];

  for (let i = 0; i < flightMatches.length; i++) {
   const start = flightMatches[i].index || 0;
   const end = i + 1 < flightMatches.length ? (flightMatches[i + 1].index || text.length) : (text.search(/T[ée]?rmino|T[ée]?rminodaJornada/i) >= 0 ? text.search(/T[ée]?rmino|T[ée]?rminodaJornada/i) : text.length);
   const segment = text.slice(start, end);
   const pairs = stationTimePairsServer(segment);
   if (pairs.length < 2) continue;
   const origin = pairs[0];
   const dest = pairs[1];
   const explicitNext = /\(\s*\d{1,2}\s*\/\s*\d{1,2}\s*\)/.test(segment) || toMin(dest.time) < toMin(origin.time);
   duty.legs.push({
    flightNumber: `LA${flightMatches[i][1]}`,
    origin: origin.station,
    destination: dest.station,
    departureTime: origin.time,
    arrivalTime: dest.time,
    workType: /\bExtra\b/i.test(segment) ? 'PS' : 'OP',
    isNextDay: explicitNext,
    duration: diffHours(origin.time, dest.time),
   });
  }

  if (duty.legs.length) {
   const lastLeg = duty.legs[duty.legs.length - 1];
   duty.dutyReport = duty.dutyReport || duty.legs[0].departureTime;
   duty.dutyDebrief = duty.dutyDebrief || (lastLeg ? addMinutesServer(lastLeg.arrivalTime, 30) : null);
   duty.isNextDay = Boolean(duty.legs.some((leg) => leg.isNextDay) || (duty.dutyReport && duty.dutyDebrief && toMin(duty.dutyDebrief) < toMin(duty.dutyReport)));
   duty.flyingHours = duty.legs.reduce((sum, leg) => sum + (leg.duration || 0), 0);
   duty.dutyHours = duty.dutyReport && duty.dutyDebrief ? diffHours(duty.dutyReport, duty.dutyDebrief) : null;
   days.push(duty);

   const overnightLeg = duty.legs.find((leg) => leg.isNextDay);
   if (overnightLeg) {
    const nd = nextTicketServerDate(marker.day, marker.month, marker.year);
    const continuation = ticketServerDate(nd.day, nd.month, nd.year, header.base);
    continuation.type = 'LAYOVER';
    continuation.pairingCode = `${overnightLeg.destination} / Fim de jornada`;
    continuation.dutyReport = overnightLeg.arrivalTime;
    continuation.dutyDebrief = duty.dutyDebrief || addMinutesServer(overnightLeg.arrivalTime, 30);
    continuation.hotel = overnightLeg.destination;
    continuation.isNextDay = false;
    continuation.rawText = `Continuação da jornada anterior: ${overnightLeg.flightNumber} ${overnightLeg.origin}-${overnightLeg.destination}`;
    continuation.dutyHours = continuation.dutyReport && continuation.dutyDebrief ? diffHours(continuation.dutyReport, continuation.dutyDebrief) : null;
    continuation.flyingHours = 0;
    days.push(continuation);
   }
  }
  return days;
 }

 const codeRe = /\b(HSBE|HSB|ASB|CBF|EMER|C\d{2,3}F|MT|CRM|DOF|DO|DR|OFF|VC|SICK|NSJ|NS|NSS|SWAP|TEMP)\b/g;
 const codeMatches = [...text.toUpperCase().matchAll(codeRe)];
 for (let i = 0; i < codeMatches.length; i++) {
  const code = codeMatches[i][1];
  const start = codeMatches[i].index || 0;
  const end = i + 1 < codeMatches.length ? (codeMatches[i + 1].index || text.length) : text.length;
  const segment = text.slice(start, end);
  const event = ticketServerDate(marker.day, marker.month, marker.year, header.base);
  event.pairingCode = code;
  event.rawText = segment;
  if (code === 'DO' || code === 'DOF' || code === 'DR' || code === 'OFF') event.type = code;
  if (code === 'DOP' || code === 'DOPR' || code === 'VC') event.type = 'DO';
  else if (code === 'VC') event.type = 'OFF';
  else if (code === 'ASB') event.type = 'ASB';
  else if (code === 'HSB' || code === 'HSBE') event.type = code;
  else if (code === 'CRM' || code === 'CBF' || code === 'EMER' || /^C\d{2,3}F$/.test(code)) event.type = 'CRM';
  else event.type = 'OTHER';

  if (!['DOPR','DOP','DO','DOF','DR','OFF','VC','VC'].includes(code)) {
   const pairs = stationTimePairsServer(segment);
   const times = pairs.map((p) => p.time);
   if (times.length >= 2) { event.dutyReport = times[0]; event.dutyDebrief = times[times.length - 1]; }
   else if (times.length === 1) { event.dutyReport = times[0]; event.dutyDebrief = times[0]; }
   event.dutyHours = event.dutyReport && event.dutyDebrief ? diffHours(event.dutyReport, event.dutyDebrief) : null;
  }
  days.push(event);
 }
 return days;
}

function addMinutesServer(time, minutes) {
 const total = (toMin(time) + minutes) % 1440;
 return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function dedupeTicketServerDays(days) {
 const best = new Map();
 const score = (d) => (d.legs?.length || 0) * 1000 + (d.dutyReport && d.dutyDebrief && d.dutyReport !== d.dutyDebrief ? diffHours(d.dutyReport, d.dutyDebrief) * 60 : 0) + String(d.rawText || '').length / 100;
 for (const d of days) {
  const legSig = (d.legs || []).map((l) => `${l.flightNumber}-${l.origin}-${l.destination}-${l.departureTime}`).join(',');
  const key = `${d.date}|${d.pairingCode || d.type}|${legSig || d.dutyReport || 'allDay'}`;
  if (!best.has(key) || score(d) > score(best.get(key))) best.set(key, d);
 }
 return [...best.values()].sort((a,b)=> new Date(a.year,a.month-1,a.dayNumber).getTime()-new Date(b.year,b.month-1,b.dayNumber).getTime() || (toMin(a.dutyReport || '23:59') - toMin(b.dutyReport || '23:59')));
}

function parseTicketServerRoster(text, filename = '') {
 const header = inferTicketServerHeader(text, filename);
 const { lines, markers } = parseTicketServerDateBlocks(text, header.year);
 if (markers.length < 3) throw new Error('Marcadores de data do ticket não encontrados.');
 const monthCounts = new Map();
 for (const m of markers) monthCounts.set(m.month, (monthCounts.get(m.month) || 0) + 1);
 const month = [...monthCounts.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0] || markers[0].month;
 header.month = month;
 const days = [];
 for (let i = 0; i < markers.length; i++) {
  const marker = markers[i];
  const end = i + 1 < markers.length ? markers[i + 1].index : lines.length;
  const blockLines = lines.slice(marker.index + 3, end);
  for (const day of parseTicketServerBlock(marker, blockLines, header)) days.push(day);
 }
 const roster = { ...header, month, days: dedupeTicketServerDays(days), rawText: text, totals: {} };
 if (!roster.days.length) throw new Error('Nenhum evento ticket encontrado.');
 return roster;
}
// --- end CrewCheck 10.4.17 ticket parser servidor ---

parsePdfOnServer = async function parsePdfOnServerV103({ filename, dataBase64 }) {
 if (!dataBase64 || typeof dataBase64 !== 'string') throw new Error('PDF não recebido pelo servidor.');
 const bytes = decodeBase64PdfPayload(dataBase64);
 if (!bytes.length) throw new Error('PDF vazio.');
 const candidates = [];
 const tried = [];
 let pages = [];
 let visual = '';
 let linear = '';
 try {
  const pdfjsImport = await import('pdfjs-dist/legacy/build/pdf.js');
  const pdfjs = pdfjsImport.default || pdfjsImport;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes), disableWorker: true, isEvalSupported: false, disableFontFace: true }).promise;
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
   const page = await pdf.getPage(pageNo);
   const tc = await page.getTextContent({ normalizeWhitespace: true, disableCombineTextItems: false });
   const items = tc.items.map((it) => ({ str: String(it.str || '').trim(), x: Number(it.transform?.[4] || 0), y: Number(it.transform?.[5] || 0), width: Number(it.width || 0), page: pageNo })).filter((it) => it.str);
   pages.push({ pageNo, items });
  }
  visual = buildServerFullText(pages);
  linear = pages.map((page) => page.items.map((item) => item.str).join('\n')).join('\n');
  if (ticketLooksLikeServer(visual + '\n' + linear, filename)) {
   for (const [source, text] of [['ticket-pdfjs-visual', visual], ['ticket-pdfjs-linear', linear]]) {
    if (text && text.trim().length > 50) {
     try { candidates.push({ source, roster: parseTicketServerRoster(text, filename) }); } catch (error) { tried.push(`${source}: ${error?.message || error}`); }
    }
   }
  }
  if (/Escala de Tripulante Convertida para padr/i.test(visual + linear)) {
   try { candidates.push({ source: 'aims-column-matrix', roster: parseAimsColumnsV103(pages, visual || linear, filename) }); } catch (error) { tried.push(`aims-column-matrix: ${error?.message || error}`); }
  }
  if (/Roster\s+Report/i.test(visual + linear)) {
   try { candidates.push({ source: 'roster-row-matrix', roster: parseRosterRowsV103(pages, visual || linear, filename) }); } catch (error) { tried.push(`roster-row-matrix: ${error?.message || error}`); }
  }
  for (const [source, text] of [['pdfjs-visual', visual], ['pdfjs-linear', linear]]) {
   if (text && text.trim().length > 50) {
    try { candidates.push({ source, roster: parseTextOnlyV103(text, filename) }); } catch (error) { tried.push(`${source}: ${error?.message || error}`); }
   }
  }
 } catch (error) {
  tried.push(`pdfjs: ${error?.message || error}`);
 }
 try {
  const mod = await import('pdf-parse');
  const pdfParse = mod.default || mod;
  const out = await pdfParse(bytes);
  if (out?.text && out.text.trim().length > 50) {
   if (ticketLooksLikeServer(out.text, filename)) {
    try { candidates.push({ source: 'ticket-pdf-parse', roster: parseTicketServerRoster(out.text, filename) }); } catch (error) { tried.push(`ticket-pdf-parse: ${error?.message || error}`); }
   }
   try { candidates.push({ source: 'pdf-parse', roster: parseTextOnlyV103(out.text, filename) }); } catch (error) { tried.push(`pdf-parse: ${error?.message || error}`); }
  }
 } catch (error) {
  tried.push(`pdf-parse: ${error?.message || error}`);
 }
 const parsed = [];
 const seen = new Set();
 for (const candidate of candidates) {
  const roster = normalizeRosterForDisplayV103(candidate.roster);
  const fingerprint = `${roster.month}-${roster.year}-${(roster.days || []).map((day) => `${day.date}:${day.pairingCode}:${day.dutyReport}:${day.dutyDebrief}:${(day.legs || []).map((leg) => leg.flightNumber + leg.origin + leg.destination).join(',')}`).join('|')}`;
  if (seen.has(fingerprint)) continue;
  seen.add(fingerprint);
  const diagnostics = diagnosticsV103(roster, candidate.source);
  parsed.push({ roster, diagnostics, score: parserScoreV103(roster, candidate.source) });
  tried.push(`${candidate.source}: ${diagnostics.uniqueDays} dias, ${diagnostics.totalEvents} eventos, ${diagnostics.flights} voos, ${diagnostics.reserve} ASB, ${diagnostics.standby} HSB/HSBE, ${diagnostics.crm} CRM, ${diagnostics.confidence}`);
 }
 parsed.sort((a, b) => b.score - a.score);
 const best = parsed[0];
 if (!best) throw new Error(`Parser Matrix não conseguiu extrair eventos. Tentativas: ${tried.join(' | ') || 'sem texto extraído'}`);
 // Do not show deceptive one-event/one-rest rosters when the header says this is a full monthly roster.
 const expectedDays = new Date(best.roster.year, best.roster.month, 0).getDate();
 if (best.diagnostics.uniqueDays < Math.min(10, expectedDays) || best.diagnostics.totalEvents < 8) {
  throw new Error(`Leitura bloqueada por baixa cobertura (${best.diagnostics.uniqueDays}/${expectedDays} dias, ${best.diagnostics.totalEvents} eventos). Tentativas: ${tried.join(' | ')}`);
 }
 best.roster.rawText = best.roster.rawText || visual || linear || '';
 best.roster = applyCrewRosterWorkTypesV10867(best.roster);
 return { roster: best.roster, diagnostics: { ...best.diagnostics, attempts: tried.slice(0, 12) } };
};
// --- end CrewCheck v10.4 Parser Matrix + Calendar Sync ---

// CrewCheck v10.8.34 — Radar Premium Rate Guard ativo.

// --- CrewCheck v10.8.105: Mac/Safari CrewRosterReport columnar PDF parser + synced history reopen guard ---
const CREWCHECK_VERSION_V108105 = '10.8.106 · auditoria de escala + diárias internacionais por chave';
const CREWCHECK_TIME_RE_V108105 = /\b\d{1,2}:\d{2}(?:\(\+1\))?\b/g;

function cleanColumnarTextV108105(value) {
 return String(value || '')
  .replace(/\u000c/g, ' ')
  .replace(/\uFFFE/g, ' ')
  .replace(/\b\d{2}-[A-Za-z]{3}-\d{4}\s+\d{2}\.\d{2}\b/g, ' ')
  .replace(/\b(?:SCHEDULER|msgsys|AIRCOM_SQS)\b/gi, ' ')
  .replace(/\bUpdated\s+(?:Date|By)\b/gi, ' ')
  .replace(/\s+/g, ' ')
  .trim();
}

function cleanColumnarTimeV108105(value) {
 return normalizeTimeToken(String(value || '').replace(/\(\+1\)/g, ''));
}

function isZeroTimeV108105(value) {
 return /^0?0:00$/.test(cleanColumnarTimeV108105(value));
}

function dateTokenToPartsV108105(token, fallbackMonth, fallbackYear) {
 const m = String(token || '').match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/);
 if (!m) return null;
 return { day: Number(m[1]), month: monthNameToNum(m[2]) || fallbackMonth, year: Number(m[3]) || fallbackYear };
}

function buildColumnarVisualRowsV108105(pages, tolerance = 4.2) {
 const out = [];
 for (const page of pages || []) {
  const groups = [];
  const items = (page.items || [])
   .map((item) => ({ ...item, str: String(item.str || '').trim() }))
   .filter((item) => item.str);
  for (const item of items) {
   let group = groups.find((candidate) => Math.abs(Number(candidate.x || 0) - Number(item.x || 0)) <= tolerance);
   if (!group) { group = { x: Number(item.x || 0), items: [], pageNo: page.pageNo || item.page || 1 }; groups.push(group); }
   group.items.push(item);
  }
  groups.sort((a, b) => Number(a.x || 0) - Number(b.x || 0));
  for (const group of groups) {
   group.items.sort((a, b) => Number(b.y || 0) - Number(a.y || 0));
   const text = cleanColumnarTextV108105(group.items.map((item) => item.str).join(' '));
   if (text) out.push({ pageNo: group.pageNo, x: group.x, text, items: group.items });
  }
 }
 return out;
}

function isColumnarIgnorableRowV108105(text) {
 return !text
  || /^(?:Roster Report|Date\b|Pairing\/Activity\b|Duty\b|Report\b|Item\b|Work\b|Type\b|Overridde|n Rank|ACY\b|A\/C\b|Hotel\b|SDC\b|Flying\b|Hrs\b|Arr\. Stn|Dep Stn|Time\b|BRUNO\b|FH\s*:)/i.test(text)
  || /^(?:Type|Hrs|Debrief|Arr\. Time|Updated Date|Updated By)$/i.test(text);
}

function isColumnarPreludeV108105(text) {
 return /\b(?:LA\s?\d{3,4}\/\d{6}|HSBE?-|ASB-|CRM|CRMBSB|DOF?|DOP|DR|OFF|VC|C\d{2,3}F|MT|CBF|EMER)\b/i.test(text);
}

function isColumnarContinuationV108105(text) {
 return /\b(?:LA\s?\d{3,4}|OP|PS|DH|HSBE?|ASB|CRM|CRMBSB|DOF?|DOP|DR|OFF|VC|[A-Z]{3}\s+\d{1,2}:\d{2}|\d{1,2}:\d{2}\(\+1\)|320-P|JJCC)\b/i.test(text);
}

function primaryColumnarDateTokenV108105(text) {
 const cleaned = cleanColumnarTextV108105(text);
 const dates = cleaned.match(/\b\d{2}-[A-Za-z]{3}-\d{4}\b/g) || [];
 if (!dates.length) return null;
 // In this PDF family the real roster date is usually the last token in the transposed row.
 return dates[dates.length - 1];
}

function inferAircraftFromPrefixV108105(text) {
 return String(text || '').match(/\b(32S|31R|39R|328|319|320|321|32N)\b/i)?.[1]?.toUpperCase();
}

function maybeDebriefBeforeRouteV108105(prefix) {
 const times = String(prefix || '').match(CREWCHECK_TIME_RE_V108105) || [];
 const last = times[times.length - 1] || '';
 if (!last || isZeroTimeV108105(last)) return null;
 // In transposed CrewRosterReport rows, a non-zero final time immediately before the route is the Duty Debrief.
 return cleanColumnarTimeV108105(last);
}

function parseColumnarFlightsIntoDayV108105(day, text) {
 const source = cleanColumnarTextV108105(text);
 const reversedFlight = /\b([A-Z]{3})\s+(\d{1,2}:\d{2}(?:\(\+1\))?)\s+([A-Z]{3})\s+(\d{1,2}:\d{2}(?:\(\+1\))?)\s+(OP|PS|DH)\s+(?:(?:CC|CP|FO|CM)\s+)?(LA\s?\d{3,4})\b(?:\s+(\d{1,2}:\d{2}))?/gi;
 let match;
 while ((match = reversedFlight.exec(source)) !== null) {
  const [, destination, rawArrival, origin, rawDeparture, workType, rawFlightNumber, reportTime] = match;
  const flightNumber = rawFlightNumber.replace(/\s+/g, '').toUpperCase();
  const departureTime = cleanColumnarTimeV108105(rawDeparture);
  const arrivalTime = cleanColumnarTimeV108105(rawArrival);
  const isNextDay = /\(\+1\)/.test(rawArrival) || toMin(arrivalTime) < toMin(departureTime);
  const prefix = source.slice(0, match.index);
  const aircraftType = inferAircraftFromPrefixV108105(prefix);
  if (!day.legs.some((leg) => leg.flightNumber === flightNumber && leg.origin === origin && leg.destination === destination && leg.departureTime === departureTime)) {
   day.legs.push({
    flightNumber,
    origin,
    destination,
    departureTime,
    arrivalTime,
    workType: String(workType || 'OP').toUpperCase(),
    aircraftType,
    duration: diffHours(departureTime, arrivalTime),
    isNextDay,
   });
  }
  if (reportTime && !day.dutyReport) day.dutyReport = cleanColumnarTimeV108105(reportTime);
  const debrief = maybeDebriefBeforeRouteV108105(prefix);
  if (debrief) {
   day.dutyDebrief = debrief;
   if (/\(\+1\)/.test(prefix)) day.isNextDay = true;
  }
  if (isNextDay) day.isNextDay = true;
 }
 const splitWrappedFlight = /(?:^|\s)(?:(\d{1,2}:\d{2}(?:\(\+1\))?)\s+)?([A-Z]{3})\s+(?:(32S|31R|39R|328|319|320|321|32N)\s+)?(?:\d{1,2}:\d{2}\s+)?([A-Z]{3})\s+(\d{1,2}:\d{2}(?:\(\+1\))?)\s+(OP|PS|DH)\s+(?:(?:CC|CP|FO|CM)\s+)?(LA\s?\d{3,4})\b\s+(\d{1,2}:\d{2}(?:\(\+1\))?)/gi;
 while ((match = splitWrappedFlight.exec(source)) !== null) {
  const [, rawDebrief, destination, aircraftType, origin, rawDeparture, workType, rawFlightNumber, rawArrival] = match;
  const flightNumber = rawFlightNumber.replace(/\s+/g, '').toUpperCase();
  const departureTime = cleanColumnarTimeV108105(rawDeparture);
  const arrivalTime = cleanColumnarTimeV108105(rawArrival);
  const isNextDay = /\(\+1\)/.test(rawArrival) || toMin(arrivalTime) < toMin(departureTime);
  if (!day.legs.some((leg) => leg.flightNumber === flightNumber && leg.origin === origin && leg.destination === destination && leg.departureTime === departureTime)) {
   day.legs.push({
    flightNumber,
    origin,
    destination,
    departureTime,
    arrivalTime,
    workType: String(workType || 'OP').toUpperCase(),
    aircraftType: aircraftType || inferAircraftFromPrefixV108105(source.slice(Math.max(0, match.index - 60), match.index + 40)),
    duration: diffHours(departureTime, arrivalTime),
    isNextDay,
   });
  }
  if (rawDebrief && !isZeroTimeV108105(rawDebrief)) day.dutyDebrief = cleanColumnarTimeV108105(rawDebrief);
  if (isNextDay || /\(\+1\)/.test(rawDebrief || '')) day.isNextDay = true;
 }

 if (day.legs.length) {
  day.type = 'VOO';
  day.pairingCode = day.legs[0].flightNumber;
  day.legs.sort((a, b) => toMin(a.departureTime) - toMin(b.departureTime));
  const first = day.legs[0];
  const last = day.legs[day.legs.length - 1];
  day.dutyReport = day.dutyReport || first.departureTime;
  day.dutyDebrief = day.dutyDebrief || addMinutesRC7(last.arrivalTime, 30);
  day.flyingHours = day.legs.reduce((sum, leg) => sum + (leg.duration || diffHours(leg.departureTime, leg.arrivalTime)), 0);
  day.dutyHours = diffHours(day.dutyReport, day.dutyDebrief);
 }
}

function parseColumnarActivityIntoDayV108105(day, text) {
 const source = cleanColumnarTextV108105(text);
 const upper = source.toUpperCase();
 if (day.legs?.length) return;
 const rest = upper.match(/\b(DOPR|DOP|DOF|DO|DR|OFF|VC)\b/);
 const activity = upper.match(/\b(HSBE|HSB|ASB|CRMBSB|CRMB|CRM|C\d{2,3}F|MT|CBF|EMER|NSJ|NS|IJ|DM|SAER)\b/);
 if (rest) {
  day.type = rest[1] === 'OFF' || rest[1] === 'VC' || rest[1].startsWith('DOP') ? 'DO' : rest[1];
  day.pairingCode = rest[1];
  day.dutyReport = null;
  day.dutyDebrief = null;
  day.flyingHours = 0;
  day.dutyHours = 0;
  return;
 }
 if (!activity) return;
 let code = activity[1];
 if (code === 'CRMBSB' || code === 'CRMB' || /^C\d{2,3}F$/.test(code)) code = 'CRM';
 day.type = code === 'CRM' ? 'CRM' : code;
 day.pairingCode = code;
 day.legs = [];
 day.flyingHours = 0;
 const codeRe = new RegExp(`\\b${activity[1]}\\b\\s*(\\d{1,2}:\\d{2}(?:\\(\\+1\\))?)?`, 'i');
 const afterCode = source.match(codeRe)?.[1] || null;
 const stationTimes = [...source.matchAll(/\b[A-Z]{3}\s+(\d{1,2}:\d{2}(?:\(\+1\))?)/g)].map((m) => m[1]);
 const allTimes = source.match(CREWCHECK_TIME_RE_V108105) || [];
 const startRaw = afterCode || stationTimes[stationTimes.length - 1] || allTimes[allTimes.length - 1] || null;
 const endRaw = stationTimes.find((time) => cleanColumnarTimeV108105(time) !== cleanColumnarTimeV108105(startRaw || '')) || allTimes.find((time) => cleanColumnarTimeV108105(time) !== cleanColumnarTimeV108105(startRaw || '')) || null;
 if (startRaw) day.dutyReport = cleanColumnarTimeV108105(startRaw);
 if (endRaw) {
  day.dutyDebrief = cleanColumnarTimeV108105(endRaw);
  day.isNextDay = /\(\+1\)/.test(endRaw) || (day.dutyReport ? toMin(day.dutyDebrief) < toMin(day.dutyReport) : false);
 }
 if (day.dutyReport && day.dutyDebrief) day.dutyHours = diffHours(day.dutyReport, day.dutyDebrief);
}

function escapeRegexV108105(value) {
 return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findColumnarDebriefForLastLegV108105(rawText, lastLeg) {
 if (!rawText || !lastLeg?.destination || !lastLeg?.arrivalTime) return null;
 const raw = String(rawText || '');
 const dest = escapeRegexV108105(lastLeg.destination);
 const arrival = escapeRegexV108105(lastLeg.arrivalTime);
 const flightNumber = String(lastLeg.flightNumber || '').toUpperCase();

 // In columnar PDF extraction (common on macOS/PDF.js), wrapped +1 rows can put the
 // explicit debrief before "DEST arrival" and before the flight number itself, e.g.
 // "01:20(+1) MAB 00:50(+1) ... LA3500". Prefer that explicit value.
 if (flightNumber) {
  const idx = raw.toUpperCase().lastIndexOf(flightNumber);
  const near = idx >= 0 ? raw.slice(Math.max(0, idx - 220), idx) : '';
  const nearMatch = near.match(new RegExp(`(\\d{1,2}:\\d{2}(?:\\(\\+1\\))?)\\s+${dest}\\b`, 'i'));
  if (nearMatch && !isZeroTimeV108105(nearMatch[1])) return cleanColumnarTimeV108105(nearMatch[1]);
 }

 const re = new RegExp(`(\\d{1,2}:\\d{2}(?:\\(\\+1\\))?)\\s+(?:(?:32S|31R|39R|328|319|320|321|32N|0:00|00:00)\\s+){0,4}${dest}\\s+${arrival}(?:\\(\\+1\\))?`, 'i');
 const match = raw.match(re);
 if (!match || isZeroTimeV108105(match[1])) return null;
 return cleanColumnarTimeV108105(match[1]);
}

function finalizeColumnarDayV108105(day) {
 if (!day) return null;
 if (day.legs?.length) {
  day.legs.sort((a, b) => toMin(a.departureTime || '23:59') - toMin(b.departureTime || '23:59'));
  const first = day.legs[0];
  const last = day.legs[day.legs.length - 1];
  day.type = 'VOO';
  day.pairingCode = day.pairingCode || first.flightNumber;
  day.dutyReport = day.dutyReport || first.departureTime;
  const explicitDebrief = findColumnarDebriefForLastLegV108105(day.rawText, last);
  day.dutyDebrief = explicitDebrief || day.dutyDebrief || addMinutesRC7(last.arrivalTime, 30);
  day.isNextDay = Boolean(day.isNextDay || day.legs.some((leg) => leg.isNextDay) || toMin(day.dutyDebrief) < toMin(day.dutyReport));
  day.flyingHours = day.legs.reduce((sum, leg) => sum + (leg.duration || diffHours(leg.departureTime, leg.arrivalTime)), 0);
  day.dutyHours = diffHours(day.dutyReport, day.dutyDebrief);
 }
 if (day.type === 'OTHER' && !day.legs?.length && !day.pairingCode) return null;
 return day;
}

function dedupeAndSortColumnarDaysV108105(days) {
 const map = new Map();
 for (const day of days || []) {
  const legKey = (day.legs || []).map((leg) => `${leg.flightNumber}-${leg.origin}-${leg.destination}-${leg.departureTime}-${leg.arrivalTime}-${leg.workType}`).join(';');
  const key = `${day.date}|${day.pairingCode || day.type}|${day.dutyReport || ''}|${day.dutyDebrief || ''}|${legKey}`;
  if (!map.has(key)) map.set(key, day);
 }
 return [...map.values()].sort((a, b) => {
  const ad = new Date(a.year, a.month - 1, a.dayNumber || Number(String(a.date || '').slice(0, 2))).getTime();
  const bd = new Date(b.year, b.month - 1, b.dayNumber || Number(String(b.date || '').slice(0, 2))).getTime();
  return ad - bd || toMin(a.dutyReport || '23:59') - toMin(b.dutyReport || '23:59');
 });
}

function parseCrewRosterReportColumnarV108105(pages, fullText = '', filename = '') {
 const header = headerRC7(fullText, filename);
 const periodMatch = String(fullText || '').match(/\b(\d{2})-([A-Za-z]{3})-(\d{4})\s+to\s+(\d{2})-([A-Za-z]{3})-(\d{4})\b/i);
 if (periodMatch) {
  header.month = monthNameToNum(periodMatch[2]) || header.month;
  header.year = Number(periodMatch[3]) || header.year;
 }
 const groups = buildServerRosterColumnGroups(pages);
 if (!groups.length) throw new Error('Layout columnar não encontrado.');
 if (!periodMatch) {
  const firstToken = groups.map((group) => String(group.text || '').match(/\d{2}-[A-Za-z]{3}-\d{4}/)?.[0]).find(Boolean);
  const firstParts = firstToken ? serverDateFromToken(firstToken, header.month, header.year) : null;
  if (firstParts) { header.month = firstParts.month; header.year = firstParts.year; }
 }
 const days = [];
 let currentMarker = null;
 for (const group of groups.sort((a, b) => a.page - b.page || a.x - b.x)) {
  const text = cleanColumnarTextV108105(group.text);
  if (isColumnarIgnorableRowV108105(text) || /Airport stand by|Instructor recycle|Home Stand by|Annual fixed day off|Day off|Requested day off|Pairing\/Flight extends/i.test(text)) continue;
  const dateToken = text.match(/\d{2}-[A-Za-z]{3}-\d{4}/)?.[0] || null;
  if (dateToken) currentMarker = serverDateFromToken(dateToken, header.month, header.year);
  if (!currentMarker) continue;
  if (text.includes('<==') && !dateToken) continue;
  const parsed = parseServerColumnarGroupToDay({ ...group, text }, currentMarker, header.base);
  if (!parsed) continue;
  if (parsed.month !== header.month || parsed.year !== header.year) continue;
  days.push(parsed);
 }
 const roster = { ...header, days: dedupeAndSortColumnarDaysV108105(days), rawText: fullText, totals: extractTotals(fullText) };
 if (process.env.CREWCHECK_DEBUG_PARSER === 'true') console.warn('CrewCheck columnar parser debug', { rows: groups.length, days: roster.days.length, sample: roster.days.map((d) => `${d.date} ${d.type} ${d.pairingCode} ${d.dutyReport || ''}-${d.dutyDebrief || ''} L${d.legs?.length || 0} ${(d.legs||[]).map(l=>l.flightNumber+':'+l.origin+'-'+l.destination+'@'+l.departureTime+'/'+l.arrivalTime).join(',')}`).slice(0, 42) });
 if (!roster.days.length) throw new Error('Nenhum evento lido no layout columnar CrewRosterReport.');
 return roster;
}

const parsePdfOnServerBefore108105 = parsePdfOnServer;
parsePdfOnServer = async function parsePdfOnServerV108105({ filename, dataBase64 }) {
 if (!dataBase64 || typeof dataBase64 !== 'string') throw new Error('PDF não recebido pelo servidor.');
 const bytes = decodeBase64PdfPayload(dataBase64);
 if (!bytes.length) throw new Error('PDF vazio.');
 const candidates = [];
 const tried = [];
 let pages = [];
 let visual = '';
 let linear = '';
 try {
  const pdfjsImport = await import('pdfjs-dist/legacy/build/pdf.js');
  const pdfjs = pdfjsImport.default || pdfjsImport;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes), disableWorker: true, isEvalSupported: false, disableFontFace: true }).promise;
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
   const page = await pdf.getPage(pageNo);
   const tc = await page.getTextContent({ normalizeWhitespace: true, disableCombineTextItems: false });
   const items = tc.items.map((it) => ({
    str: String(it.str || '').trim(),
    x: Number(it.transform?.[4] || 0),
    y: Number(it.transform?.[5] || 0),
    width: Number(it.width || 0),
    page: pageNo,
   })).filter((it) => it.str);
   pages.push({ pageNo, items });
  }
  visual = buildServerFullText(pages);
  linear = pages.map((page) => page.items.map((item) => item.str).join('\n')).join('\n');
  if (/Roster\s+Report/i.test(visual + '\n' + linear)) {
   try { candidates.push({ source: 'crewroster-columnar-mac-v108105', roster: parseCrewRosterReportColumnarV108105(pages, `${visual || ''}\n${linear || ''}`, filename) }); } catch (error) { tried.push(`crewroster-columnar-mac-v108105: ${error?.message || error}`); }
  }
 } catch (error) {
  tried.push(`pdfjs-columnar: ${error?.message || error}`);
 }

 try {
  const previous = await parsePdfOnServerBefore108105({ filename, dataBase64 });
  candidates.push({ source: previous?.diagnostics?.sourceFormat || 'parser-matrix-v108104', roster: previous.roster, diagnostics: previous.diagnostics });
 } catch (error) {
  tried.push(`parser-matrix-v108104: ${error?.message || error}`);
 }

 const parsed = [];
 const seen = new Set();
 for (const candidate of candidates) {
  const isColumnarCandidate = String(candidate.source || '').includes('columnar');
  let roster = isColumnarCandidate
   ? { ...candidate.roster, days: dedupeAndSortColumnarDaysV108105(candidate.roster?.days || []) }
   : normalizeRosterForDisplayV103(candidate.roster);
  roster.rawText = roster.rawText || visual || linear || '';
  roster = applyCrewRosterWorkTypesV10867(roster);
  const diagnostics = candidate.diagnostics || diagnosticsV103(roster, candidate.source);
  const fingerprint = `${roster.month}-${roster.year}-${(roster.days || []).map((day) => `${day.date}:${day.pairingCode}:${day.dutyReport}:${day.dutyDebrief}:${(day.legs || []).map((leg) => leg.flightNumber + leg.origin + leg.destination + leg.departureTime).join(',')}`).join('|')}`;
  if (seen.has(fingerprint)) continue;
  seen.add(fingerprint);
  parsed.push({ roster, diagnostics, score: parserScoreV103(roster, candidate.source) + (candidate.source.includes('columnar') ? 250 : 0) });
  tried.push(`${candidate.source}: ${diagnostics.uniqueDays} dias, ${diagnostics.totalEvents} eventos, ${diagnostics.flights} voos, ${diagnostics.reserve} ASB, ${diagnostics.standby} HSB/HSBE, ${diagnostics.crm} CRM, ${diagnostics.confidence}`);
 }
 parsed.sort((a, b) => b.score - a.score);
 const best = parsed[0];
 if (!best) throw new Error(`Parser Matrix não conseguiu extrair eventos. Tentativas: ${tried.join(' | ') || 'sem texto extraído'}`);
 const expectedDays = new Date(best.roster.year, best.roster.month, 0).getDate();
 if (best.diagnostics.uniqueDays < Math.min(10, expectedDays) || best.diagnostics.totalEvents < 8) {
  throw new Error(`Leitura bloqueada por baixa cobertura (${best.diagnostics.uniqueDays}/${expectedDays} dias, ${best.diagnostics.totalEvents} eventos). Tentativas: ${tried.join(' | ')}`);
 }
 return { roster: best.roster, diagnostics: { ...best.diagnostics, appVersion: CREWCHECK_VERSION_V108105, attempts: tried.slice(0, 14) } };
};
// --- end CrewCheck v10.8.105 ---
