import React from 'react';
import {
  ChevronRight,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Calendar,
  MoreVertical,
} from 'lucide-react';

interface ComplianceViewProps {
  onBack: () => void;
}

const ComplianceView: React.FC<ComplianceViewProps> = ({ onBack }) => {
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
            <ChevronRight className="h-5 w-5 rotate-180" />
          </button>
          <h2 className="text-xl font-bold" style={{ color: 'var(--foreground)' }}>Conformidade</h2>
        </div>
        <button
          className="h-10 w-10 rounded-2xl flex items-center justify-center transition-colors"
          style={{ background: 'var(--surface)', color: 'var(--foreground-muted)' }}
        >
          <MoreVertical className="h-5 w-5" />
        </button>
      </header>

      {/* Main Score */}
      <section className="px-6 py-8 flex flex-col items-center justify-center">
        <div className="relative h-48 w-48 flex items-center justify-center">
          <svg className="h-full w-full transform -rotate-90">
            <circle
              cx="96" cy="96" r="80"
              stroke="var(--surface-border)"
              strokeWidth="12"
              fill="transparent"
            />
            <circle
              cx="96" cy="96" r="80"
              stroke="var(--event-conforme)"
              strokeWidth="12"
              fill="transparent"
              strokeDasharray={502.4}
              strokeDashoffset={0}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div
              className="h-12 w-12 rounded-full flex items-center justify-center mb-1"
              style={{ background: 'var(--event-conforme)' }}
            >
              <CheckCircle2 className="h-7 w-7 text-white" />
            </div>
            <span className="text-4xl font-black" style={{ color: 'var(--foreground)' }}>100%</span>
            <span
              className="text-[10px] font-bold uppercase tracking-widest"
              style={{ color: 'var(--event-conforme)' }}
            >
              Dentro dos limites
            </span>
          </div>
        </div>
      </section>

      {/* Compliance List */}
      <section className="px-6 py-4 space-y-3">
        <ComplianceItem icon={Clock}        label="Jornada"    status="Em conformidade" accentVar="var(--event-flight)"   />
        <ComplianceItem icon={ShieldCheck}  label="Descanso"   status="Em conformidade" accentVar="var(--event-reserve)"  />
        <ComplianceItem icon={Calendar}     label="Sobreaviso" status="Em conformidade" accentVar="var(--event-standby)"  />
        <ComplianceItem icon={CheckCircle2} label="Acúmulos"   status="Em conformidade" accentVar="var(--event-conforme)" />
      </section>

      {/* Footer Button */}
      <section className="px-6 py-4">
        <button
          className="w-full py-4 rounded-3xl font-bold flex items-center justify-center gap-2 transition-colors"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--surface-border)',
            color: 'var(--foreground-muted)',
          }}
        >
          Ver detalhes <ChevronRight className="h-4 w-4" />
        </button>
      </section>
    </div>
  );
};

const ComplianceItem = ({
  icon: Icon,
  label,
  status,
  accentVar,
}: {
  icon: React.ElementType;
  label: string;
  status: string;
  accentVar: string;
}) => (
  <div
    className="rounded-3xl p-5 flex items-center justify-between"
    style={{
      background: 'var(--surface)',
      border: '1px solid var(--surface-border)',
    }}
  >
    <div className="flex items-center gap-4">
      <div
        className="h-12 w-12 rounded-2xl flex items-center justify-center"
        style={{ background: `color-mix(in srgb, ${accentVar} 15%, transparent)`, color: accentVar }}
      >
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <h4 className="font-bold" style={{ color: 'var(--foreground)' }}>{label}</h4>
        <p className="text-xs font-medium" style={{ color: 'var(--foreground-muted)' }}>{status}</p>
      </div>
    </div>
    <div
      className="h-6 w-6 rounded-full flex items-center justify-center"
      style={{ background: 'color-mix(in srgb, var(--event-conforme) 20%, transparent)' }}
    >
      <CheckCircle2 className="h-4 w-4" style={{ color: 'var(--event-conforme)' }} />
    </div>
  </div>
);

export default ComplianceView;
