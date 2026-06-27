import React from 'react';
import { 
  ChevronRight, 
  CheckCircle2, 
  Clock, 
  ShieldCheck,
  Calendar,
  MoreVertical
} from 'lucide-react';

interface ComplianceViewProps {
  onBack: () => void;
}

const ComplianceView: React.FC<ComplianceViewProps> = ({ onBack }) => {
  return (
    <div className="flex flex-col min-h-screen bg-[#08111f] text-white font-sans pb-24">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 pt-8">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="h-10 w-10 rounded-2xl bg-white/5 flex items-center justify-center">
            <ChevronRight className="h-5 w-5 rotate-180" />
          </button>
          <h2 className="text-xl font-bold">Conformidade</h2>
        </div>
        <button className="h-10 w-10 rounded-2xl bg-white/5 flex items-center justify-center">
          <MoreVertical className="h-5 w-5 text-slate-400" />
        </button>
      </header>

      {/* Main Score */}
      <section className="px-6 py-8 flex flex-col items-center justify-center">
        <div className="relative h-48 w-48 flex items-center justify-center">
          {/* Progress Ring (Simulated) */}
          <svg className="h-full w-full transform -rotate-90">
            <circle
              cx="96"
              cy="96"
              r="80"
              stroke="currentColor"
              strokeWidth="12"
              fill="transparent"
              className="text-white/5"
            />
            <circle
              cx="96"
              cy="96"
              r="80"
              stroke="currentColor"
              strokeWidth="12"
              fill="transparent"
              strokeDasharray={502.4}
              strokeDashoffset={0}
              className="text-emerald-500"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="h-12 w-12 rounded-full bg-emerald-500 flex items-center justify-center mb-1">
              <CheckCircle2 className="h-7 w-7 text-white" />
            </div>
            <span className="text-4xl font-black">100%</span>
            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Dentro dos limites</span>
          </div>
        </div>
      </section>

      {/* Compliance List */}
      <section className="px-6 py-4 space-y-3">
        <ComplianceItem 
          icon={Clock} 
          label="Jornada" 
          status="Em conformidade" 
          iconColor="text-blue-400" 
          bgColor="bg-blue-400/10" 
        />
        <ComplianceItem 
          icon={ShieldCheck} 
          label="Descanso" 
          status="Em conformidade" 
          iconColor="text-purple-400" 
          bgColor="bg-purple-400/10" 
        />
        <ComplianceItem 
          icon={Calendar} 
          label="Sobreaviso" 
          status="Em conformidade" 
          iconColor="text-orange-400" 
          bgColor="bg-orange-400/10" 
        />
        <ComplianceItem 
          icon={CheckCircle2} 
          label="Acúmulos" 
          status="Em conformidade" 
          iconColor="text-emerald-400" 
          bgColor="bg-emerald-400/10" 
        />
      </section>

      {/* Footer Button */}
      <section className="px-6 py-4">
        <button className="w-full py-4 rounded-3xl bg-white/5 border border-white/10 font-bold text-slate-300 flex items-center justify-center gap-2">
          Ver detalhes <ChevronRight className="h-4 w-4" />
        </button>
      </section>
    </div>
  );
};

const ComplianceItem = ({ icon: Icon, label, status, iconColor, bgColor }: any) => (
  <div className="bg-white/[0.04] border border-white/10 rounded-3xl p-5 flex items-center justify-between">
    <div className="flex items-center gap-4">
      <div className={`h-12 w-12 rounded-2xl ${bgColor} flex items-center justify-center ${iconColor}`}>
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <h4 className="font-bold text-slate-200">{label}</h4>
        <p className="text-xs text-slate-400 font-medium">{status}</p>
      </div>
    </div>
    <div className="h-6 w-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
    </div>
  </div>
);

export default ComplianceView;
