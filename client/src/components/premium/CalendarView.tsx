import React from 'react';
import { MoreVertical, ChevronLeft } from 'lucide-react';

interface CalendarViewProps {
  onBack: () => void;
}

const CalendarView: React.FC<CalendarViewProps> = ({ onBack }) => {
  const days = Array.from({ length: 30 }, (_, i) => i + 1);
  const weekDays = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM'];

  return (
    <div
      className="flex flex-col min-h-screen font-sans pb-24"
      style={{ background: 'var(--background)', color: 'var(--foreground)' }}
    >
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 pt-8">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="h-10 w-10 rounded-2xl flex items-center justify-center transition-colors"
            style={{ background: 'var(--surface)', color: 'var(--foreground)' }}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h2 className="text-xl font-bold" style={{ color: 'var(--foreground)' }}>Junho 2026</h2>
        </div>
        <button
          className="h-10 w-10 rounded-2xl flex items-center justify-center transition-colors"
          style={{ background: 'var(--surface)', color: 'var(--foreground-muted)' }}
        >
          <MoreVertical className="h-5 w-5" />
        </button>
      </header>

      {/* Calendar Grid */}
      <section className="px-6 py-4">
        <div className="grid grid-cols-7 gap-2 mb-4">
          {weekDays.map(day => (
            <div
              key={day}
              className="text-[10px] font-bold text-center py-2"
              style={{ color: 'var(--foreground-subtle)' }}
            >
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-3">
          {/* Empty day for alignment */}
          <div className="h-10 w-10" />

          {days.map(day => {
            let accent = '';
            let bgStyle: React.CSSProperties = { background: 'var(--surface)' };
            let textStyle: React.CSSProperties = { color: 'var(--foreground)' };

            if (day === 3) {
              accent = 'var(--event-standby)';
              bgStyle = { background: 'rgba(251,146,60,0.18)' };
            }
            if ([11, 12, 13, 14, 23, 24, 25, 26, 27, 28].includes(day)) {
              accent = 'var(--event-flight)';
              bgStyle = { background: 'rgba(34,211,238,0.14)' };
            }
            if ([15, 16, 29, 30].includes(day)) {
              accent = 'var(--event-alert)';
              bgStyle = { background: 'rgba(248,113,113,0.14)' };
            }
            if ([17, 18, 19, 20, 21, 22].includes(day)) {
              accent = 'var(--event-conforme)';
              bgStyle = { background: 'rgba(16,185,129,0.14)' };
            }

            return (
              <div
                key={day}
                className="h-10 w-10 rounded-full flex flex-col items-center justify-center relative transition-transform active:scale-90"
                style={bgStyle}
              >
                <span className="text-xs font-bold" style={textStyle}>{day}</span>
                {accent && (
                  <div
                    className="absolute -bottom-1 h-1 w-1 rounded-full"
                    style={{ background: accent }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Legend */}
      <section className="px-6 py-8 grid grid-cols-3 gap-4">
        <LegendItem accentVar="var(--event-flight)" label="Voos" />
        <LegendItem accentVar="var(--event-conforme)" label="Rotina" />
        <LegendItem accentVar="var(--event-standby)" label="Sobreaviso" />
        <LegendItem accentVar="var(--event-alert)" label="Folgas" />
        <LegendItem accentVar="var(--event-reserve)" label="Treinamentos" />
      </section>
    </div>
  );
};

const LegendItem = ({ accentVar, label }: { accentVar: string; label: string }) => (
  <div className="flex items-center gap-2">
    <div className="h-2.5 w-2.5 rounded-sm" style={{ background: accentVar }} />
    <span
      className="text-[10px] font-bold uppercase tracking-wider"
      style={{ color: 'var(--foreground-muted)' }}
    >
      {label}
    </span>
  </div>
);

export default CalendarView;
