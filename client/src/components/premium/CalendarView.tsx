import React from 'react';
import { 
  MoreVertical,
  ChevronLeft
} from 'lucide-react';

interface CalendarViewProps {
  onBack: () => void;
}

const CalendarView: React.FC<CalendarViewProps> = ({ onBack }) => {
  const days = Array.from({ length: 30 }, (_, i) => i + 1);
  const weekDays = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM'];
  
  return (
    <div className="flex flex-col min-h-screen bg-[#08111f] text-white font-sans pb-24">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 pt-8">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="h-10 w-10 rounded-2xl bg-white/5 flex items-center justify-center">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h2 className="text-xl font-bold">Junho 2026</h2>
        </div>
        <button className="h-10 w-10 rounded-2xl bg-white/5 flex items-center justify-center">
          <MoreVertical className="h-5 w-5 text-slate-400" />
        </button>
      </header>

      {/* Calendar Grid */}
      <section className="px-6 py-4">
        <div className="grid grid-cols-7 gap-2 mb-4">
          {weekDays.map(day => (
            <div key={day} className="text-[10px] font-bold text-slate-500 text-center py-2">{day}</div>
          ))}
        </div>
        
        <div className="grid grid-cols-7 gap-3">
          {/* Empty days for alignment (simulated) */}
          <div className="h-10 w-10"></div>
          
          {days.map(day => {
            let bgColor = "bg-white/5";
            let textColor = "text-white";
            let dotColor = "";

            if (day === 3) { dotColor = "bg-orange-500"; bgColor = "bg-orange-500/20"; }
            if ([11, 12, 13, 14, 23, 24, 25, 26, 27, 28].includes(day)) { dotColor = "bg-blue-500"; bgColor = "bg-blue-500/20"; }
            if ([15, 16, 29, 30].includes(day)) { dotColor = "bg-rose-500"; bgColor = "bg-rose-500/20"; }
            if ([17, 18, 19, 20, 21, 22].includes(day)) { dotColor = "bg-emerald-500"; bgColor = "bg-emerald-500/20"; }

            return (
              <div key={day} className={`h-10 w-10 rounded-full ${bgColor} flex flex-col items-center justify-center relative transition-transform active:scale-90`}>
                <span className={`text-xs font-bold ${textColor}`}>{day}</span>
                {dotColor && <div className={`absolute -bottom-1 h-1 w-1 rounded-full ${dotColor}`}></div>}
              </div>
            );
          })}
        </div>
      </section>

      {/* Legend */}
      <section className="px-6 py-8 grid grid-cols-3 gap-4">
        <LegendItem color="bg-blue-500" label="Voos" />
        <LegendItem color="bg-emerald-500" label="Rotina" />
        <LegendItem color="bg-orange-500" label="Sobreaviso" />
        <LegendItem color="bg-rose-500" label="Folgas" />
        <LegendItem color="bg-purple-500" label="Treinamentos" />
      </section>
    </div>
  );
};

const LegendItem = ({ color, label }: any) => (
  <div className="flex items-center gap-2">
    <div className={`h-2.5 w-2.5 rounded-sm ${color}`}></div>
    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</span>
  </div>
);

export default CalendarView;
