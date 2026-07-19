import fs from 'node:fs';

const VERSION = '14.0.3';
const VERSION_CODE = '140003';
const read = (path) => fs.readFileSync(path, 'utf8');
const write = (path, content) => fs.writeFileSync(path, content, 'utf8');

function requiredReplace(source, pattern, replacement, label) {
  pattern.lastIndex = 0;
  if (!pattern.test(source)) throw new Error(`CrewCheck v${VERSION}: ponto nГЈo localizado вЂ” ${label}.`);
  pattern.lastIndex = 0;
  return source.replace(pattern, replacement);
}

const snippets = {
  keyboards: 'server/v1403/keyboards.snippet',
  requestUser: 'server/v1403/request-user.snippet',
  helpers: 'server/v1403/premium-helpers.snippet',
  buildReply: 'server/v1403/build-reply.snippet',
  navigation: 'server/v1403/navigation-callback.snippet',
};
for (const file of ['server/v1403/telegram-human.mjs', ...Object.values(snippets)]) {
  if (!fs.existsSync(file)) throw new Error(`CrewCheck v${VERSION}: arquivo obrigatГіrio ausente: ${file}`);
}

const serverPath = 'server.mjs';
let server = read(serverPath);

const importAnchor = "import { buildInfobipTtsRequest, infobipConfiguration, infobipPublicStatus } from './server/v1396/infobip.mjs';";
const premiumImport = "import { DEFAULT_CONCIERGE_NAME, airportName, buildBlankDaySummary, buildConciergeSettingsReply, buildDepartureSummary, buildProgramSummary, cleanDisplayName, isPremiumConcierge, preferredConciergeName, preferredUserName, premiumGreeting, premiumVoicePolicy, premiumVoiceText, spokenTime } from './server/v1403/telegram-human.mjs';";
if (!server.includes(premiumImport)) {
  if (!server.includes(importAnchor)) throw new Error(`CrewCheck v${VERSION}: import base nГЈo localizado.`);
  server = server.replace(importAnchor, `${importAnchor}\n${premiumImport}`);
}

server = server
  .replace("|| 0.48),", "|| 0.34),")
  .replace("|| 0.78),", "|| 0.86),")
  .replace(" || 0.18),", "|| 0.32),")
  .replace(
    /const policy = (?:telegramVoiceReplyPolicy|premiumVoicePolicy)\(ЧЉЧ1;n]+;/,
    "const policy = premiumVoicePolicy(replyText, transcript, Math.max(420, Math.min(700, Number(envAny(['TELEGRAM_CONCIERGE_MAX_VOICE_CHARS', 'CREWCHECK_TELEGRAM_MAX_VOICE_CHARS']) || 650))));",
   )
  .replace(
    /const finalReply = (?:humanizeTelegramVoiceText|premiumVoiceText)\(replyText\);/,
    'const finalReply = premiumVoiceText(replyText);',
   )
  .replace('await showHumanRecordingAction(chatId, 2);', 'await showHumanRecordingAction(chatId, 1);');

server = requiredReplace(
  server,
  /const conciergeKeyboard = \{[\s]*?\n\};\n(?:const conciergeFunctionKeyboard = \{[\s\S]{0,}?\n\};\nconst conciergeSettingsKeyboard = \{[\s\S]{0,}?\n\};\n)?function normalizeConciergeButtonText\(value = ''\) \{[\s]*?\n\}/,
  read(snippets.keyboards).trim(),
   'teclados',
[];

server = requiredReplace(
  server,
  /function telegramRequestUser\(req, body = \{\}\) \{[\s\S]*?\n\}/,
  read(snippets.requestUser).trim(),
   'identidade Telegram',
[]);

const helperMarker = '// CrewCheck v14.0.3 вЂ” Concierge humano, natural e personalizГЎvel.';
if (!server.includes(helperMarker)) {
  const anchor = "async function buildTelegramConciergeReply(text = '', profile = {}, snapshot = null) {";
  if (!server.includes(anchor)) throw new Error(`CrewCheck v${VERSION}: builder nГЈo localizado.`);
  server = server.replace(anchor, $ {read(snippets.helpers).trim()}\n${anchor}`);
}

server = requiredReplace(
  server,
  /async function buildTelegramConciergeReply\(text = '', profile = \{\}, snapshot = null\) \{[\s\S]{0,}?\n\}\nasync function handleParsePdfApi/,
  `${read(snippets.buildReply).trim()}\nasync function handleParsePdfApi`,
  'roteador natural',
[]);

server = server.replace(
  "const snapshot = await conciergeSaveSnapshotAsync(profile, roster, { source: String(body.source || 'app'), fileName: String(body.fileName || ''), diagnostics: body.diagnostics || null });",
  "const snapshot = await conciergeSaveSnapshotAsync(profile, roster, { source: String(body.source || 'app'), fileName: String(body.fileName || ''), diagnostics: body.diagnostics || null, premiumAccess: user.premiumAccess, subscriptionPlan: user.subscriptionPlan, subscriptionStatus: user.subscriptionStatus, preferences: { premiumAccess: user.premiumAccess, subscriptionPlan: user.subscriptionPlan, subscriptionStatus: user.subscriptionStatus, userRole: user.role || body.rank || body.role || '', conciergeName: existingSnapshot?.preferences?.conciergeName || DEFAULT_CONCIERGE_NAME } });",
);
server = server.replace(
  "const snapshot = await conciergeSaveSnapshotAsync(profile, roster, { source: 'telegram-pdf', fileName: document.file_name || 'escala.pdf', parserDiagnostics: parsed.diagnostics || null });",
  "const snapshot = await conciergeSaveSnapshotAsync(profile, roster, { source: 'telegram-pdf', fileName: document.file_name || 'escala.pdf', parserDiagnostics: parsed.diagnostics || null, preferences: { conciergeName: (await conciergeLoadSnapshot(profile))?.preferences?.conciergeName || DEFAULT_CONCIERGE_NAME } });",
);

if (!server.includes("preferences: { conciergeName: DEFAULT_CONCIERGE_NAME, onboardingStep: 'ask-user-name' }")) {
  server = server.replace(
    "await conciergeMergeChatSnapshot({ email, name: pending.name || '', chatId: String(chatId), accessKeyHash: pending.accessKeyHash || '' });\n  await sendTelegramMessage(chatId, [\n    'Telegram vinculado ao CrewCheck.',",
    "await conciergeMergeChatSnapshot({ email, name: pending.name || '', chatId: String(chatId), accessKeyHash: pending.accessKeyHash || '' });\n  await conciergeSaveSnapshotAsync({ email, name: pending.name || '', chatId: String(chatId), accessKeyHash: pending.accessKeyHash || '' }, null, { preferences: { conciergeName: DEFAULT_CONCIERGE_NAME, onboardingStep: 'ask-user-name' } });\n  await sendTelegramMessage(chatId, [\n    `Telegram vinculado. Eu sou ${DEFAULT_CONCIERGE_NAME}, o concierge da sua escala.`,",
  );
  server = server.replace(
    "'VocГЄ jГЎ pode enviar oPDF da escala aqui e consultar programaГ§ГЈo, radar, meteorologia, hotГ©is, academias, rotina e SaГ­da Inteligente.',",
    "'Antes de comeГ§ar, como vocГЄ gostaria que eu chamasse vocГ©? Responda somente por texto com seu nome ou apelido.',",
   );
  server = server.replace(
    "'Use /ajuda para ver os comandos antigos restaurados. Para testar alertas, volte ao CrewCheck e use Despertador > Testar canal.'",
    "'Depois disso, eu libero o menu completo e respondo de forma mais natural.'",
   );
}

if (!server.includes("command: 'configuracoes'")) {
  server = server.replace(
    "{ command: 'ajuda', description: 'Todos os comandos' },",
    "{ command: 'configuracoes', description: 'Nome e preferГЄncias do concierge' },\n    { command: 'ajuda', description: 'Todos os comandos' },",
  );
}

if (!/function conciergeWeatherKeyboard[\s\S]*?cc_nav:menu[\s\S]*? async function handleTelegramWeatherCallback/.test(server)) {
  server = server.replace(
    "{ text: 'рџ”¦ ATIS em voz', callback_data: `cc_weather:atis:${icao}:both` },\n    ],\n  ] };",
    "{ text: 'рџ”¦ ATIS em voz', callback_data: `cc_weather:atis:${icao}:both` },\n    ],\n    [{ text: 'в­ђпёЏ Voltar ao menu', callback_data: 'cc_nav:menu' }],\n  ] };",
   );
}
if (!/function conciergeCallConfirmationKeyboard[\s\S]*?cc_nav:menu[\s\S]*?async function requestConciergeCallConfirmation/.test(server)) {
  server = server.replace(
    "{ text: 'Cancelar', callback_data: 'cc_call:cancel' },\n  ]] };",
    "{ text: 'Cancelar', callback_data: 'cc_call:cancel' },\n  ], [{^€	ш«d;о#И›Ы\€[ИY[ќIЛШ[XЪЧЩ]N€	ШШЧЫ]Ћ›Y[ќIИWWHNИ‹€
NВџB‚љY€
\Щ\ќ™\‹љ[ЫY\К	Ш\Ю[Иќ[Э[Ы€[™U[YЬ[S]љYШ][ЫђШ[XЪК\]HHЯJIКJHВ€ЫЫњЭ[ЪЬ€H	Ш\Ю[Иќ[Э[Ы€[™U[YЬ[UЩX]\ђШ[XЪК\]HHЯJHЙОВ€Y€
\Щ\ќ™\‹љ[ЫY\К[ЪЬЉJH›ЭИ™]И\њ›ЬЉЬ™]РЪXЪИ‰Х‘T”ТSУџN€Ш[XЪИH[\И°иЫИШШ[^YЛ
NВ€Щ\ќ™\€HЩ\ќ™\‹њ™\XЩJ[ЪЬ‹	Ь™XY
Ыљ\]Л›]љYШ][ЫЉKќљ[J
_W‰Ш[ЪЬџX
NВџBљY€
\Щ\ќ™\‹љ[ЫY\КЪ[›™[€	Ы]љYШ][Ы‹Xќ]Ы‰ИЉJHВ€Щ\ќ™\€HЩ\ќ™\‹њ™\XЩJ€љY€
]ШZ][™U[YЬ[UЩX]\ђШ[XЪК\]JJH™]\›€Щ[™њЫЫЉ™\ЛЊИЪО€ќYK[™Y€ќYKЪ[›™[€	ЭЩX]\‹Xќ]Ы‰ИJNИ‹€љY€
]ШZ][™U[YЬ[S]љYШ][ЫђШ[XЪК\]JJH™]\›€Щ[™њЫЫЉ™\ЛЊИЪО€ќYK[™Y€ќYKЪ[›™[€	Ы]љYШ][Ы‹Xќ]Ы‰ИJNЧ€Y€
]ШZ][™U[YЬ[UЩX]\ђШ[XЪК\]JJH™]\›€Щ[™њЫЫЉ™\ЛЊИЪО€ќYK[™Y€ќYKЪ[›™[€	ЭЩX]\‹Xќ]Ы‰ИJNИ‹€
NВџB‚њЩ\ќ™\€HЩ\ќ™\‹њ™\XЩJ€]ШZ]Щ[™[YЬ[SY\ЬШYЩJЪ]Y™\KИ™\WЫX\љЭ\€\ХЩX]\€ИЫЫЪY\™ЩUЩX]\’Щ^X›Ш\™
ЩX]\”Э][Ы‹ЭY‹ЪKќ\Э
›Ь›X[^™Y^
HИ	ЭY‰И€	ЫY]\‰КH€ЫЫЪY\™ЩRЩ^X›Ш\™JNИ‹€]ШZ]Щ[™[YЬ[SY\ЬШYЩJЪ]Y™\KИ™\WЫX\љЭ\€\ХЩX]\€ИЫЫЪY\™ЩUЩX]\’Щ^X›Ш\™
ЩX]\”Э][Ы‹ЭY‹ЪKќ\Э
›Ь›X[^™Y^
HИ	ЭY‰И€	ЫY]\‰КH€ЫЫЪY\™ЩT™\RЩ^X›Ш\™
›Ь›X[^™Y^
HJNИ‹ЉNВ‚њЩ\ќ™\€HЩ\ќ™\‹њ™\XЩJ€]ШZ]Щ[™[YЬ[SY\ЬШYЩJЪ]YШЭ]љN€8 '	Э[њШЬљ\њЫXЩJМ
_x 'X	ЙЛ™\WKљ›Ъ[Љ	Ч‰КJNИ‹€]ШZ]Щ[™[YЬ[SY\ЬШYЩJЪ]Y™\KИ™\WЫX\љЭ\€ЫЫЪY\™ЩT™\RЩ^X›Ш\™
›Ь›X[^™PЫЫЪY\™ЩPќ]Ы•^
[њШЬљ\
JHJNИ‹ЉNВњЩ\ќ™\€HЩ\ќ™\‹њ™\XЩJ€]ШZ]Щ[™[YЬ[SY\ЬШYЩJЪ]Y	УШШ[^pйриЫИ]X[^YK€YЫЬHЬЬЫИШ[Э[\€ЬШZYHH›ШЭ\\€ЪЬЬ]Z\ЛЩ\›XXЪX\ИЭHШXШY[ZX\И\ќИH›Шрк‹‰ЛИ™\WЫX\љЭ\€ЫЫЪY\™ЩRЩ^X›Ш\™JNИ‹€]ШZ]Щ[™[YЬ[SY\ЬШYЩJЪ]Y	Ь™[Z][QЬ™Y][™К›Щљ[K]ШZ]ЫЫЪY\™ЩSШYЫ\ЪЭ
›Щљ[JHЯJ_HШШ[^pйриЫИ]X[^YK€YЫЬHЫЫњЪYЫИШ[Э[\€HШpлYH[ќ[YЩ[ќHH^™\€ќ\ШШ\И\ќИH›Шрк‹И™\WЫX\љЭ\€ЫЫЪY\™ЩQќ[Э[Ы’Щ^X›Ш\™JNИ‹ЉNВњЩ\ќ™\€HЩ\ќ™\‹њ™\XЩJ€™›Ь›K\[™
	Ь›Ы\	Л	РЬ™]РЪXЪЛ\ШШ[K›ЫЛ™\Щ\ќKЫШњ™]љ\ЫЛ\››Ъ]KQUT‹Q‹Ьќ0йЫЛY\‹”Р‹Ф•KСТУ‘‹ТQЛСKХР‹РK‘PЛ“Ф‹У‹ФРK‰КNИ‹€™›Ь›K\[™
	Ь›Ы\	Л	РЫЫќ™\њШH]\[[HЬќYЭpкњИИњ\Ъ[ЫШњ™H\ШШ[HHљ\[[ќK€™XЫЫљpйШHЬ\ИЫЫ[ИLЋЊМ\™\Щ[ќpйриЫЛ0к\›Z[›ИHЪ]™K°о›Y\›ИH\›\Л›ЫЬИUSKЫЫH^ќ[™\Щ\ќKЫШњ™]љ\ЫЛ\››Ъ]KЬќ0иЫЛY\‹ШpлYH[ќ[YЩ[ќK”Р‹Ф•KСТУ‘‹ТQЛСKХР‹РK‘PЛ“Ф‹У€HФРK‰КNИ‹ЉKњ™\XЩJ€	Ы]]™U›ЪXЩS›Э\О€ќYKЫЫЪ\ЩU›ЪXЩSЫ›N€ќYKШШ][Ы‘\™XЭЬљY\Х^Ы›N€ќYK]\ФЭ\ЬќY€ќYIЛ€	Ы]]™U›ЪXЩS›Э\О€ќYKЫЫЪ\ЩU›ЪXЩSЫ›N€ќYK]\[ЬќYЭY\ЩU›ЪXЩN€ќYK›YЪYТ[ќ\њ™]][ЫЋ€ќYKЬЪЩ[•[YR[ќ\њ™]][ЫЋ€ќYK^Ы›RY[ќ]TЩ][™ЬО€ќYKXЪУ]љYШ][ЫЋ€ќYKШШ][Ы‘\™XЭЬљY\Х^Ы›N€ќYK]\ФЭ\ЬќY€ќYIЛЉNВ‚™›Ь€
ЫЫњЭY]Y]T]Щ€ЙЬXЪШYЩKљњЫЫ‰Л	ЬXЪШYЩK[ШЪЛљњЫЫ‰ЧJHВ€Y€
YњЛ™^\ЭФЮ[КY]Y]T]
JHЫЫќ[ќYNВ€ЫЫњЭY]Y]HH”УУ‹њ\њЩJ™XY
Y]Y]T]
JNВ€Y]Y]Kќ™\њЪ[Ы€H‘T”ТSУЋВ€Y€
Y]Y]T]OOH	ЬXЪШYЩKљњЫЫ‰КHВ€Y]Y]K›[YHH	ШЬ™]ШЪXЪЛ]ЊMLLЛ\™[Z][KZ[X[‹][YЬ[KXЫЫЪY\™ЩIОВ€Y]Y]K™\ШЬљ\[Ы€H	РЬ™]РЪXЪИЊMЊЊИHЫЫЪY\™ЩH[YЬ[H]\[\њЫЫ[^YЛШљ™]]›ИHЫЫH]™YШpйриЫИ™[Z][IОВ€Y]Y]KњШЬљ\ИHY]Y]KњШЬљ\ИЯNВ€Y]Y]KњШЬљ\ЦЙЬ™YЬ™\ЬЪ[ЫЋќЊMЊЊОќ[YЬ[KZ[X[‰ЧHH	Ы›ЩHШЬљ\ЛЬ™YЬ™\ЬЪ[Ы‹]ЊMLLЛ][YЬ[KZ[X[‹XЫЫЪY\™ЩK›ZњЙОВ€B€Y€
Y]Y]KњXЪШYЩ\ПЛ–ЙЙЧJHВ€Y]Y]KњXЪШYЩ\ЦЙЧK›[YHH	ШЬ™]ШЪXЪЛ]ЊMLLЛ\™[Z][KZ[X[‹][YЬ[KXЫЫЪY\™ЩIОВ€Y]Y]KњXЪШYЩ\ЦЙЙЧKќ™\њЪ[Ы€H‘T”ТSУЋВ€B€Ьљ]JY]Y]T]	Т”УУ‹њЭљ[™ЪYћJY]Y]Kќ[Љ_W
NВџB‚ЫЫњЭЫYT]H	ШЫY[ќЬЬЛЬYЩ\ЛТЫYKќЮ	ОВљY€
њЛ™^\ЭФЮ[КЫYT]
JHВ€]ЫYHH™XY
ЫYT]
NВ€ЫYHHЫYKњ™\XЩJШЫЫњЭQђUSХ‘T”ТSУ€H	ЦЧ‰ЧJЙОЛЛЫЫњЭQђUSХ‘T”ТSУ€H	ЙХ‘T”ТSУџIОШ
NВ€ЫYHHЫYKњ™\XЩJШЫЫњЭФ‘UРТPТЧХRWРУФ‘WУ“ХHH	ЦЧ‰ЧJЙОЛЛЫЫњЭФ‘UРТPТЧХRWРУФ‘WУ“ХHH	ЭЊMЊЊО€ЫЫЪY\™ЩH[YЬ[H[X[›Л]\[\њЫЫ[^YИHЫЫH]™YШpйриЫИ™[Z][IОИЉNВ€Ьљ]JЫYT]ЫYJNВџB‚ЫЫњЭX[љY™\Э]H	ШЫY[ќЬX›XЛЫX[љY™\ЭљњЫЫ‰ОВљY€
њЛ™^\ЭФЮ[КX[љY™\Э]
JHВ€ЫЫњЭX[љY™\ЭH”УУ‹њ\њЩJ™XY
X[љY™\Э]
JNВ€X[љY™\Эќ™\њЪ[Ы€H‘T”ТSУЋВ€ЫЫњЭЭ\ќ\›HЭљ[™КX[љY™\ЭњЭ\ќЭ\›	ЛЙКNВ€X[љY™\ЭњЭ\ќЭ\›HКПЙ—O]ЏJVЧ‰—JЛЛќ\Э
Э\ќ\›
B€ИЭ\ќ\›њ™\XЩJКЏЙ—]ЏJVЧ‰—JЛЛ	М_IХ‘T”ТSУџX
B€€	ЬЭ\ќ\›IЬЭ\ќ\›љ[ЫY\К	ПЙКHИ	Й‰И€	ПЙЯ]ЏIХ‘T”ТSУџXВ€Ьљ]JX[љY™\Э]	Т”УУ‹њЭљ[™ЪYћJX[љY™\Эќ[Љ_W
NВџB‚ЫЫњЭ[™›ЪY]H	Ш[™›ЪY]Ь\\‹Ш\ШќZ[™ЬYIОВљY€
њЛ™^\ЭФЮ[К[™›ЪY]
JHВ€][™›ЪYH™XY
[™›ЪY]
NВ€[™›ЪYH[™›ЪYњ™\XЩJЭ™\њЪ[ЫђЫЩWКЧ
Ч‹Л™\њЪ[ЫђЫЩH	Х‘T”ТSУ—РУС_X
NВ€[™›ЪYH[™›ЪYњ™\XЩJЭ™\њЪ[Ы“[YWКЙЦЧ‰ЧJЙЛЛ™\њЪ[Ы“[YH	ЙХ‘T”ТSУџIШ
NВ€Ьљ]J[™›ЪY][™›ЪY
NВџB‚њЩ\ќ™\€HЩ\ќ™\‹њ™\XЩJЭ™\њЪ[Ы—К——К‰ЦМLЧWЋW—
К_MЊ—
КIЛЩЛ™\њЪ[ЫЋ‰ЙХ‘T”ТSУџIШ
NВќЬљ]JЩ\ќ™\”]Щ\ќ™\ЉNВ‚ЫЫњЫЫK›ЩКЬ™]РЪXЪИ‰Х‘T”ТSУџN€ЫЫЪY\™ЩH[YЬ[H]\[\њЫЫ[^YЛШљ™]]›ИHЫЫH]™YШpйриЫИ™[Z][H\XШYЛ
NВ