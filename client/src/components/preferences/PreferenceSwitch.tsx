import type { InputHTMLAttributes } from 'react';
import './preference-switch.css';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'role'>;

/** Native keyboard/form semantics; the decorative track never handles state. */
export function PreferenceSwitch(props: Props) {
  return <span className="cc-preference-switch"><input {...props} type="checkbox" role="switch"/><span className="cc-preference-switch-track" aria-hidden="true"/></span>;
}
