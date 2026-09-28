import fs from 'node:fs';

const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const platform = fs.readFileSync('client/src/components/platform/PlatformCenter.tsx', 'utf8');
const premiumCss = fs.readFileSync('client/src/premium-audit-v13-8-8.css', 'utf8');
const platformCss = fs.readFileSync('client/src/platform-v13-8.css', 'utf8');
const server = fs.readFileSync('server.mjs', 'utf8');
const hotels = fs.readFileSync('client/src/data/crewHotels.ts', 'utf8');

function assert(condition, message) {
  if (!condition) {
    console.error('ERRO:', message);
    process.exitCode = 1;
  } else {
    console.log('OK:', message);
  }
}

const hotelRows = (hotels.match(/"name":/g) || []).length;
assert(hotelRows >= 150, 'catálogo possui pelo menos 150 hotéis');
assert(hotels.includes('"airport":  "GRU"') && hotels.includes('"airport":  "BSB"'), 'catálogo cobre aeroportos brasileiros');
assert(home.includes('CREW_HOTEL_CATALOG') && home.includes('searchCrewHotels'), 'pesquisa usa catálogo local de hotéis');
assert(home.includes("openNearbyPlaces('hotel', '', 'current')"), 'hotel pode ser pesquisado pela localização atual');
assert(home.includes('Informar manualmente') && home.includes('saveManualPlace'), 'hotel e serviços aceitam cadastro manual');
assert(home.includes("type PlaceCategory = 'hotel' | 'gym'"), 'hotéis participam da busca de locais próximos');
assert(server.includes("hotel: { label: 'hotéis'") && server.includes("const customQuery = String(url.searchParams.get('query')"), 'backend pesquisa hotéis e nomes personalizados');
assert(platform.includes('QrPreviewModal') && platform.includes('openWhatsAppShare'), 'QR amplia e compartilha conteúdo no WhatsApp');
assert(platform.includes('cp-id-qr-trigger') && platform.includes('cp-qr-trigger'), 'QR de ID e de escala são clicáveis');
assert(premiumCss.includes('.cz-hotel-catalog-results') && premiumCss.includes('.cz-place-query-row'), 'layout premium de hotéis e serviços aplicado');
assert(premiumCss.includes('scroll-snap-type: x mandatory'), 'categorias móveis possuem rolagem estável');
assert(platformCss.includes('.cp-qr-modal') && platformCss.includes('@media(max-width:520px)'), 'modal QR possui ajuste mobile');

if (process.exitCode) process.exit(process.exitCode);
console.log('CrewCheck mobile hotels, nearby services and QR share regression OK');
