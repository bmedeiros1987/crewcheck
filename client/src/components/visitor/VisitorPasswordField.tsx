import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { VISITOR_PASSWORD_MAX } from '@/lib/visitorAccessUi';

type Props = { id: string; label: string; value: string; onChange: (value: string) => void; autoComplete: 'current-password' | 'new-password'; minLength?: number; describedBy?: string };
export default function VisitorPasswordField({ id, label, value, onChange, autoComplete, minLength, describedBy }: Props) {
  const [visible, setVisible] = useState(false);
  return <div className="cv-access-password">
    <label htmlFor={id}><span>{label}</span></label>
    <div className="cv-access-password-row">
      <input id={id} name={id} type={visible ? 'text' : 'password'} value={value} onChange={(event) => onChange(event.target.value)} autoComplete={autoComplete} autoCapitalize="none" spellCheck={false} required minLength={minLength} maxLength={VISITOR_PASSWORD_MAX} aria-describedby={describedBy}/>
      <button type="button" aria-label={`${visible ? 'Ocultar' : 'Mostrar'} ${label.toLowerCase()}`} aria-controls={id} aria-pressed={visible} onClick={() => setVisible((previous) => !previous)}>{visible ? <EyeOff aria-hidden="true"/> : <Eye aria-hidden="true"/>}</button>
    </div>
  </div>;
}
