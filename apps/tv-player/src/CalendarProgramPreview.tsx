import React from 'react';
import { Plane, BedDouble, Moon, BriefcaseBusiness, MoreHorizontal } from 'lucide-react';
import type { TvActivity } from '../../../packages/tv-core/src/index';
import { programsForDay, programKicker, programRouteCodes, programTitle, visitorAirportLabel } from './programming';
import './calendar-program-preview.css';

function Icon({kind}:{kind:'journey'|'stay'|'rest'|'duty'}) {
  if (kind==='stay') return <BedDouble/>;
  if (kind==='rest') return <Moon/>;
  if (kind==='duty') return <BriefcaseBusiness/>;
  return <Plane/>;
}

export function CalendarProgramPreview({activities,visitor=false,max=3}:{activities:TvActivity[];visitor?:boolean;max?:number}) {
  const programs=programsForDay(activities);
  if (!programs.length) return <span className="calendar-program-empty">Sem programação</span>;
  const visible=programs.slice(0,max);
  return <div className="calendar-program-preview" aria-label={programs.length+' programações publicadas'}>
    {visible.map(program=>{
      const route=program.kind==='journey'
        ? programRouteCodes(program).map(code=>visitorAirportLabel(code,visitor)).join(' → ')
        : programTitle(program,visitor);
      const meta=program.kind==='journey'
        ? (program.flights.length===1?'1 etapa':program.flights.length+' etapas')
        : program.kind==='stay'?'Pernoite'
        : program.kind==='rest'?'Descanso'
        : programKicker(program);
      return <span className={'calendar-program-line program-'+program.kind} key={program.key}>
        <i><Icon kind={program.kind}/></i>
        <b>{route}</b>
        <small>{meta}</small>
      </span>;
    })}
    {programs.length>visible.length&&<span className="calendar-program-more"><MoreHorizontal/><b>+{programs.length-visible.length}</b><small>mais</small></span>}
  </div>;
}
