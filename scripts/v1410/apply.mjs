import fs from 'node:fs';

const appPath = 'client/src/App.tsx';

if (fs.existsSync(appPath)) {
  let source = fs.readFileSync(appPath, 'utf8');

  const importLine = 'import PartnerWelcome from "./components/PartnerWelcome";';
  if (!source.includes(importLine)) {
    source = source.replace(
      'import TermsGate from "./components/TermsGate";',
      `import TermsGate from "./components/TermsGate";\n${importLine}`,
    );
  }

  if (!source.includes('<PartnerWelcome />')) {
    source = source.replace(
      '      <Router />\n      <CrewCheckGlobalBottomMenu />',
      '      <Router />\n      <PartnerWelcome />\n      <CrewCheckGlobalBottomMenu />',
    );
  }

  fs.writeFileSync(appPath, source, 'utf8');
}
