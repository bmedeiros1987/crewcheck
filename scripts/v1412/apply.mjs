import fs from 'node:fs';

const deliveryPath = 'server/v139/delivery.mjs';
if (fs.existsSync(deliveryPath)) {
  let source = fs.readFileSync(deliveryPath, 'utf8');
  source = source.replace(
    'for (const provider of [sendEmailSenderApi, sendMailerSend]) {',
    'for (const provider of [sendMailerSend, sendEmailSenderApi]) {'
  );
  fs.writeFileSync(deliveryPath, source, 'utf8');
}

console.log('[v1412] MailerSend definido como provedor principal; EmailSender e SMTP permanecem como contingência.');
