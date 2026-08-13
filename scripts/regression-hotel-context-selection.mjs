import fs from 'node:fs';

const stayContextPath = 'client/src/lib/stayContext.ts';
const applyPath = 'scripts/v14388/apply.mjs';

for (const path of [stayContextPath, applyPath]) {
  if (!fs.existsSync(path)) throw new Error(`[hotel-context-selection] arquivo ausente: ${path}`);
}

const stayContext = fs.readFileSync(stayContextPath, 'utf8');
const apply = fs.readFileSync(applyPath, 'utf8');

function expect(condition, message) {
  if (!condition) throw new Error(`[hotel-context-selection] ${message}`);
}

expect(stayContext.includes('export function selectContextualStay'), 'helper selectContextualStay ausente.');
expect(stayContext.includes('const active = normalized'), 'seleção de pernoite vigente ausente.');
expect(stayContext.includes('item.start <= timestamp && timestamp < item.end'), 'limites do pernoite vigente devem usar início inclusivo e fim exclusivo.');
expect(stayContext.includes('const todayStay = normalized'), 'fallback para pernoite de hoje ausente.');
expect(stayContext.includes('const future = normalized'), 'fallback para próximo pernoite futuro ausente.');
expect(stayContext.includes('return normalized.sort((a, b) => b.start - a.start'), 'fallback para pernoite passado mais recente ausente.');
expect(stayContext.includes('.map((stay) => {'), 'seleção deve derivar uma coleção antes de ordenar.');
expect(!/\bstays\.sort\(/.test(stayContext), 'não pode ordenar/mutar o array original de stays.');

const activeIndex = stayContext.indexOf('const active = normalized');
const todayIndex = stayContext.indexOf('const todayStay = normalized');
const futureIndex = stayContext.indexOf('const future = normalized');
const pastIndex = stayContext.indexOf('return normalized.sort((a, b) => b.start - a.start');
expect(activeIndex >= 0 && activeIndex < todayIndex && todayIndex < futureIndex && futureIndex < pastIndex,
  'prioridade deve permanecer vigente -> hoje -> próximo futuro -> passado mais recente.');

expect(apply.includes("import { selectContextualStay } from '@/lib/stayContext';"), 'HotelsView não está ligado ao helper compartilhado.');
expect(apply.includes('const [selectedEventId, setSelectedEventId] = useState(() => contextualStayId(stays));'), 'seleção inicial não usa contexto temporal.');
expect(apply.includes("if (!stays.some((event) => event.id === selectedEventId)) setSelectedEventId(contextualStayId(stays));"), 'reconciliação deve preservar seleção manual válida e recalcular somente quando ela deixar de existir.');
expect(apply.includes("startAt: event.kind === 'stay' ? event.canonical?.startDateTime : null"), 'limite canônico de início do pernoite não é encaminhado.');
expect(apply.includes("endAt: event.kind === 'stay' ? event.canonical?.endDateTime : null"), 'limite canônico de fim do pernoite não é encaminhado.');

const hotelsStart = apply.indexOf('function HotelsView({ events }');
expect(hotelsStart >= 0, 'template de HotelsView ausente no apply v14388.');
const hotelsScope = apply.slice(hotelsStart);
expect(!/selectedEventId[^\n]*stays\[0\]|selectedEvent[^\n]*stays\[0\]/.test(hotelsScope), 'stays[0] não pode voltar como regra contextual de HotelsView.');

console.log('[hotel-context-selection] OK — seleção protegida: vigente -> hoje -> futuro -> passado, sem mutar stays e sem fallback contextual stays[0].');
