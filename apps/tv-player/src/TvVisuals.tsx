import React from 'react';
import { CloudSun, Wind, Radio, CalendarDays, CalendarRange, RefreshCw, Settings, Newspaper, Plane, Car, Clock3, MapPin, Headphones, ShieldCheck, ArrowRight, BedDouble, BriefcaseBusiness, ChevronLeft, ChevronRight, Sun, Moon, Sparkles } from 'lucide-react';
import { weatherArt } from './presentation';
// The mobile preparation script v14340 copies this exact PNG to its v3 alias.
// Import the original bytes, never redraw/recolor the user's brand or fetch remotely.
import originalLogo from '../../../client/public/icons/crewcheck-icon-v2.png';
export { Plane, Car, Clock3, MapPin, Headphones, ShieldCheck, ArrowRight, BedDouble, BriefcaseBusiness, ChevronLeft, ChevronRight, Sun, Moon, Sparkles };
export function TvBrand() {
  return <div className="brand"><img src={originalLogo} alt="CrewCheck" className="brand-logo"/><div><strong>CrewCheck <span className="tv-badge">TV</span></strong><small>ROSTER INTELLIGENCE</small></div></div>;
}
export function NavIcon({ name }: { name: string }) {
  const Icon = name === 'Agora' ? Radio : name === 'Semana' ? CalendarRange : name === 'Mês' ? CalendarDays : name === 'Mudanças' ? RefreshCw : name === 'Notícias' ? Newspaper : Settings;
  return <Icon aria-hidden="true" />;
}
export function WeatherArtwork({ label }: { label?: string | null }) {
  const art = weatherArt(label);
  if (art === 'unknown') return <div className="weather-art weather-unknown" data-condition="unknown" aria-hidden="true"><CloudSun/><span>—</span></div>;
  if (art === 'wind') return <div className="weather-art weather-wind" data-condition="wind" aria-hidden="true"><Wind/></div>;
  const hasSun = art === 'sun' || art === 'partly';
  const hasCloud = art !== 'sun';
  return <svg className={'weather-art weather-' + art} data-condition={art} viewBox="0 0 200 160" aria-hidden="true" focusable="false">
    <defs>
      <radialGradient id="wx-sun"><stop offset="0" stopColor="#fff3b0"/><stop offset=".63" stopColor="#ffd467"/><stop offset="1" stopColor="#f6a83b"/></radialGradient>
      <linearGradient id="wx-cloud" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffffff"/><stop offset=".53" stopColor="#deeff8"/><stop offset="1" stopColor="#91b7d1"/></linearGradient>
      <linearGradient id="wx-cloud-dark" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#d3e3f1"/><stop offset="1" stopColor="#728da8"/></linearGradient>
      <linearGradient id="wx-rain" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#9eeefe"/><stop offset="1" stopColor="#27c3e8"/></linearGradient>
    </defs>
    <ellipse cx="104" cy="144" rx="67" ry="7" fill="#020817" opacity=".12"/>
    {hasSun && <g className="weather-sun">
      <g className="sun-rays" stroke="#ffd76e" strokeWidth="5" strokeLinecap="round">
        <path d="M64 7V17M64 91V101M17 54H27M101 54H111M31 21L38 28M90 80L97 87M31 87L38 80M90 28L97 21"/>
      </g>
      <circle cx="64" cy="54" r="29" fill="url(#wx-sun)"/>
      <path d="M48 38A23 23 0 0 1 75 34" stroke="#fff8d7" strokeWidth="4" opacity=".65" fill="none" strokeLinecap="round"/>
    </g>}
    {hasCloud && <g className="weather-float">
      <path d="M52 112C31 112 25 101 25 90C25 76 37 65 52 65C58 42 73 35 91 38C108 40 120 51 123 67C131 63 139 65 145 69C155 68 169 77 170 90C173 103 162 114 147 114Z" fill={art === 'storm' ? 'url(#wx-cloud-dark)' : 'url(#wx-cloud)'} stroke="#fff" strokeOpacity=".3" strokeWidth="1.5"/>
      <path d="M56 66C63 45 91 41 106 59" stroke="#fff" strokeWidth="4" strokeOpacity=".6" fill="none" strokeLinecap="round"/>
    </g>}
    {(art === 'rain' || art === 'storm') && <g fill="url(#wx-rain)">{[64, 95, 126].map((x, i) => <path key={x} className={'rain-drop drop-' + i} d={'M' + x + ' 119l-5 10a5 5 0 0 0 9 3z'}/>)}</g>}
    {art === 'storm' && <path d="M103 93L86 120h14l-9 22 33-32h-17l10-17z" fill="#ffd768"/>}
    {art === 'snow' && <g stroke="#b9efff" strokeWidth="3" strokeLinecap="round">{[62, 101, 140].map((x, i) => <g key={x} className={'rain-drop drop-' + i}><path d={'M' + x + ' 121v18M' + (x-8) + ' 125l16 10M' + (x-8) + ' 135l16-10'}/></g>)}</g>}
    {art === 'fog' && <g className="fog-lines" stroke="#c0d9e8" strokeWidth="5" strokeLinecap="round"><path d="M38 122h120M48 135h102M64 146h70"/></g>}
  </svg>;
}
