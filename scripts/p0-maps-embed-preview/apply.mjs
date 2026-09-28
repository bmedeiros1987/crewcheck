import fs from 'node:fs';

const homePath = 'client/src/pages/Home.tsx';
const before = `function buildGoogleMapsEmbedDirectionsUrl(origin: string, destination: string, travelmode: 'driving' | 'walking' | 'transit' = 'driving'): string {
  const key = mapsBrowserKey();
  if (!key || !origin || !destination) return '';
  return \`https://www.google.com/maps/embed/v1/directions?key=\${encodeURIComponent(key)}&origin=\${encodeURIComponent(origin)}&destination=\${encodeURIComponent(destination)}&mode=\${travelmode}\`;
}`;
const after = `function buildGoogleMapsEmbedDirectionsUrl(origin: string, destination: string, travelmode: 'driving' | 'walking' | 'transit' = 'driving'): string {
  if (!origin || !destination) return '';
  const dirFlag = travelmode === 'walking' ? 'w' : travelmode === 'transit' ? 'r' : 'd';
  return \`https://www.google.com/maps?output=embed&saddr=\${encodeURIComponent(origin)}&daddr=\${encodeURIComponent(destination)}&dirflg=\${dirFlag}\`;
}`;

const source = fs.readFileSync(homePath, 'utf8');
if (source.includes(after)) {
  console.log('[p0-maps-embed-preview] keyless directions preview already applied.');
} else {
  if (!source.includes(before)) throw new Error('[p0-maps-embed-preview] prepared Embed directions block not found.');
  fs.writeFileSync(homePath, source.replace(before, after), 'utf8');
  console.log('[p0-maps-embed-preview] embedded directions decoupled from restricted browser API key.');
}
