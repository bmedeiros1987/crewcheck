import fs from 'node:fs';
const path = 'client/src/pages/Home.tsx';
let home = fs.readFileSync(path, 'utf8');
const start = home.indexOf('function Brand('), end = home.indexOf('\nfunction complianceAlertSignature(', start);
if (start < 0 || end < 0) throw new Error('Pulse experience: header anchor missing');
let brand = home.slice(start, end);
if (!brand.includes('global = false')) {
 brand = brand.replace('pulse = false, backLabel }', 'pulse = false, backLabel, global = false }').replace('backLabel?: string }', 'backLabel?: string; global?: boolean }');
 brand = brand.replace(/\) \{\n/, ') {\n  if (!global && !pulse) return null;\n');
}
brand = brand.replace('{pulse ? <CrewCheckPulse compact fallback={lockup}/> : lockup}', '<div className="cc-brand-and-notice">{lockup}<CrewCheckPulse compact/></div>');
if (!brand.includes('cc-brand-and-notice')) throw new Error('Pulse experience: preserved brand lockup anchor missing');
if (!brand.includes('if (!global && !pulse) return null;')) throw new Error('Pulse experience: global header guard missing');
brand = brand.replace("aria-label={back ? backLabel || 'Voltar ao FlightDeck' : 'Menu'}", "aria-label={back ? backLabel || alertText().back : alertText().menu}");
home = home.slice(0,start) + brand + home.slice(end);
const legacyStart=home.indexOf('function Alerts('), legacyEnd=home.indexOf('function ReviewedAlerts(',legacyStart);
if(legacyStart>=0&&legacyEnd>legacyStart)home=home.slice(0,legacyStart)+home.slice(legacyEnd);
const dispositionStart=home.indexOf('type ComplianceAlertDisposition ='), dispositionEnd=home.indexOf('function analyzeSafe(',dispositionStart);
if(dispositionStart>=0&&dispositionEnd>dispositionStart)home=home.slice(0,dispositionStart)+home.slice(dispositionEnd);
fs.writeFileSync(path, home);
const cssPath='client/src/styles/ipad-header-recovery.css';
const marker='/* Single integrated Pulse header */';
const css=fs.readFileSync(cssPath,'utf8').split(marker)[0].trimEnd();
fs.writeFileSync(cssPath,css+'\n'+marker+'\n'+fs.readFileSync('client/src/components/pulse/integrated-header.css','utf8'));
console.log('Pulse experience: one header/notice, account-owned review state.');
