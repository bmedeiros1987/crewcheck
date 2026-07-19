import fs from 'node:fs';

const calendarPath = 'client/src/lib/googleCalendarSync.ts';
if (fs.existsSync(calendarPath)) {
  let calendar = fs.readFileSync(calendarPath, 'utf8');
  const signature = "export async function connectGoogleCalendar(prompt = 'consent select_account'): Promise<void> {";
  const disclosure = "  if (/consent|select_account/i.test(prompt)) confirmGoogleCalendarOwnedEventsDisclosure();";
  const start = calendar.indexOf(signature);
  if (start >= 0) {
    const end = calendar.indexOf('\n}', start);
    const block = end >= 0 ? calendar.slice(start, end) : '';
    if (!block.includes('confirmGoogleCalendarOwnedEventsDisclosure()')) {
      calendar = calendar.replace(signature, `${signature}\n${disclosure}`);
    }
  }
  fs.writeFileSync(calendarPath, calendar, 'utf8');
}

console.log('CrewCheck v14.0.5: divulgação OAuth e compatibilidade de verificação preservadas.');
