import React from 'react';
import {
  ChevronRight,
  ChevronLeft,
  Clock,
  MapPin,
  FileText,
  CheckCircle2,
  Edit2,
} from 'lucide-react';

interface EventDetailViewProps {
  onBack: () => void;
}

const EventDetailView: React.FC<EventDetailViewProps> = ({ onBack }) => {
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
          <h2 className="text-xl font-bold" style={{ color: 'var(--foreground)' }}>Detalhes do evento</h2>
        </div>
        <button
          className="h-10 w-10 rounded-2xl flex items-center justify-center transition-colors"
          style={{ background: 'var(--surface)', color: 'var(--foreground-muted)' }}
        >
          <Edit2 className="h-4 w-4" />
        </button>
      </header>

      {/* Event Header */}
      <section className="px-6 py-4">
        <div
          className="rounded-3xl p-5 flex items-center justify-between"
          style={{
            background: 'color-mix(in srgb, var(--event-standby) 10%, transparent)',
            border: '1px solid color-mix(in srgb, var(--event-standby) 25%, transparent)',
          }}
        >
          <div className="flex items-center gap-4">
            <div
              className="h-14 w-14 rounded-2xl flex items-center justify-center"
              style={{ background: 'color-mix(in srgb, var(--event-standby) 20%, transparent)' }}
            >
              <div
                className="h-7 w-7 rounded-full"
                style={{ background: 'var(--event-standby)' }}
              />
            </div>
            <div>
              <h3 className="text-xl font-bold" style={{ color: 'var(--foreground)' }}>HSB - Sobreaviso</h3>
              <p
                className="text-xs font-bold uppercase tracking-wider"
                style={{ color: 'var(--event-standby)' }}
              >
                HSB
              </p>
            </div>
          </div>
          <button
            className="h-10 w-10 rounded-full flex items-center justify-center transition-colors"
            style={{ background: 'var(--surface)', color: 'var(--foreground-muted)' }}
          >
            <Edit2 className="h-4 w-4" />
          </button>
        </div>
      </section>

      {/* Time Section */}
      <section className="px-6 py-4 grid grid-cols-2 gap-4">
        <div
          className="rounded-3xl p-5"
          style={{ background: 'var(--surface)', border: '1px solid var(--surface-border)' }}
        >
          <p className="text-[10px] font-bold uppercase mb-1" style={{ color: 'var(--foreground-subtle)' }}>Início</p>
          <p className="text-2xl font-black" style={{ color: 'var(--foreground)' }}>11:07</p>
          <p className="text-xs" style={{ color: 'var(--foreground-muted)' }}>Qua, 03 Jun</p>
        </div>
        <div
          className="rounded-3xl p-5"
          style={{ background: 'var(--surface)', border: '1px solid var(--surface-border)' }}
        >
          <p className="text-[10px] font-bold uppercase mb-1" style={{ color: 'var(--foreground-subtle)' }}>Fim</p>
          <p className="text-2xl font-black" style={{ color: 'var(--foreground)' }}>12:08</p>
          <p className="text-xs" style={{ color: 'var(--foreground-muted)' }}>Qua, 03 Jun</p>
        </div>
      </section>

      {/* Details List */}
      <section className="px-6 py-4 space-y-3">
        <DetailItem icon={MapPin}       label="Base"   value="BSB"                      subValue="Brasília"              showChevron />
        <DetailItem icon={FileText}     label="Tipo"   value="Sobreaviso / Home Standby" />
        <DetailItem icon={CheckCircle2} label="Status" value="Programado"
          statusIcon={<CheckCircle2 className="h-5 w-5" style={{ color: 'var(--event-conforme)' }} />}
        />
      </section>
    </div>
  );
};

const DetailItem = ({
  icon: Icon,
  label,
  value,
  subValue,
  showChevron,
  statusIcon,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  subValue?: string;
  showChevron?: boolean;
  statusIcon?: React.ReactNode;
}) => (
  <div
    className="rounded-3xl p-5 flex items-center justify-between"
    style={{ background: 'var(--surface)', border: '1px solid var(--surface-border)' }}
  >
    <div className="flex items-center gap-4">
      <div
        className="h-10 w-10 rounded-xl flex items-center justify-center"
        style={{ background: 'var(--muted)', color: 'var(--foreground-muted)' }}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase mb-0.5" style={{ color: 'var(--foreground-subtle)' }}>{label}</p>
        <h4 className="font-bold" style={{ color: 'var(--foreground)' }}>{value}</h4>
        {subValue && <p className="text-xs" style={{ color: 'var(--foreground-muted)' }}>{subValue}</p>}
      </div>
    </div>
    {statusIcon
      ? statusIcon
      : showChevron && <ChevronRight className="h-5 w-5" style={{ color: 'var(--foreground-subtle)' }} />}
  </div>
);

export default EventDetailView;
