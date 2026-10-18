import './notification-help.css';
import type {ReactNode} from 'react';

export function NotificationHelp({label,children}:{label:string;children:ReactNode}) {
  return <details className="cc-notification-help-icon"><summary aria-label={`Ajuda: ${label}`} title={label}>?</summary><div>{children}</div></details>;
}
