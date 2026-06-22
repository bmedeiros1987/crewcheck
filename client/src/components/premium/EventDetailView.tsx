import React from 'react';
import { 
  ChevronRight, 
  ChevronLeft,
  MoreVertical,
  Clock,
  MapPin,
  FileText,
  CheckCircle2,
  Edit2
} from 'lucide-react';

interface EventDetailViewProps {
  onBack: () => void;
}

const EventDetailView: React.FC<EventDetailViewProps> = ({ onBack }) => {
  return (
    <div className="flex flex-col min-h-screen bg-[#08111f] text-white font-sans pb-24">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 pt-8">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="h-10 w-10 rounded-2xl bg-white/5 flex items-center justify-center">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h2 className="text-xl font-bold">Detalhes do evento</h2>
        </div>
        <button className="h-10 w-10 rounded-2xl bg-white/5 flex items-center justify-center">
          <Edit2 className="h-4 w-4 text-slate-400" />
        </button>
      </header>

      {/* Event Header */}
      <section className="px-6 py-4">
        <div className="bg-orange-500/10 border border-orange-500/20 rounded-3xl p-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-orange-500/20 flex items-center justify-center">
              <div className="h-7 w-7 rounded-full bg-orange-500" />
            </div>
            <div>
              <h3 className="text-xl font-bold">HSB - Sobreaviso</h3>
              <p className="text-xs text-orange-400 font-bold uppercase tracking-wider">HSB</p>
            </div>
          </div>
          <button className="h-10 w-10 rounded-full bg-white/5 flex items-center justify-center">
            <Edit2 className="h-4 w-4 text-slate-400" />
          </button>
        </div>
      </section>

      {/* Time Section */}
      <section className="px-6 py-4 grid grid-cols-2 gap-4">
        <div className="bg-white/[0.04] border border-white/10 rounded-3xl p-5">
          <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Início</p>
          <p className="text-2xl font-black">11:07</p>
          <p className="text-xs text-slate-400">Qua, 03 Jun</p>
        </div>
        <div className="bg-white/[0.04] border border-white/10 rounded-3xl p-5">
          <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Fim</p>
          <p className="text-2xl font-black">12:08</p>
          <p className="text-xs text-slate-400">Qua, 03 Jun</p>
        </div>
      </section>

      {/* Details List */}
      <section className="px-6 py-4 space-y-3">
        <DetailItem 
          icon={MapPin} 
          label="Base" 
          value="BSB" 
          subValue="Brasília" 
          showChevron 
        />
        <DetailItem 
          icon={FileText} 
          label="Tipo" 
          value="Sobreaviso / Home Standby" 
        />
        <DetailItem 
          icon={CheckCircle2} 
          label="Status" 
          value="Programado" 
          statusIcon={<CheckCircle2 className="h-5 w-5 text-emerald-500" />} 
        />
      </section>
    </div>
  );
};

const DetailItem = ({ icon: Icon, label, value, subValue, showChevron, statusIcon }: any) => (
  <div className="bg-white/[0.04] border border-white/10 rounded-3xl p-5 flex items-center justify-between">
    <div className="flex items-center gap-4">
      <div className="h-10 w-10 rounded-xl bg-white/5 flex items-center justify-center text-slate-400">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-[10px] font-bold text-slate-500 uppercase mb-0.5">{label}</p>
        <h4 className="font-bold text-slate-200">{value}</h4>
        {subValue && <p className="text-xs text-slate-400">{subValue}</p>}
      </div>
    </div>
    {statusIcon ? statusIcon : (showChevron && <ChevronRight className="h-5 w-5 text-slate-600" />)}
  </div>
);

export default EventDetailView;
