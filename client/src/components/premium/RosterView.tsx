import React from 'react';
import { 
  Search, 
  Filter, 
  MoreVertical, 
  ChevronRight, 
  Plane, 
  Moon,
  Sun
} from 'lucide-react';

interface RosterViewProps {
  onBack: () => void;
}

const RosterView: React.FC<RosterViewProps> = ({ onBack }) => {
  return (
    <div className="flex flex-col min-h-screen bg-[#08111f] text-white font-sans pb-24">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 pt-8">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="h-10 w-10 rounded-2xl bg-white/5 flex items-center justify-center">
            <ChevronRight className="h-5 w-5 rotate-180" />
          </button>
          <div>
            <h2 className="text-xl font-bold">Minha Escala</h2>
            <div className="flex items-center gap-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">30 Mai 2026 - 02 Jul 2026</p>
              <span className="px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-[8px] font-black text-blue-400 uppercase tracking-widest">LT</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="h-10 w-10 rounded-2xl bg-white/5 flex items-center justify-center">
            <Search className="h-5 w-5 text-slate-400" />
          </button>
          <button className="h-10 w-10 rounded-2xl bg-white/5 flex items-center justify-center">
            <Filter className="h-5 w-5 text-slate-400" />
          </button>
          <button className="h-10 w-10 rounded-2xl bg-white/5 flex items-center justify-center">
            <MoreVertical className="h-5 w-5 text-slate-400" />
          </button>
        </div>
      </header>

      {/* Roster List */}
      <section className="px-6 py-4 space-y-4">
        {/* Day Item - Active/Flight */}
        <div className="flex gap-4">
          <div className="flex flex-col items-center pt-2">
            <span className="text-[10px] font-black text-slate-500 uppercase">Dom</span>
            <span className="text-2xl font-black">21</span>
            <span className="text-[10px] font-black text-slate-500 uppercase">Jun</span>
          </div>
          
          <div className="flex-1 space-y-3">
            <div className="bg-blue-600/10 border border-blue-500/20 rounded-3xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-blue-400">
                  <Plane className="h-4 w-4 rotate-45" />
                  <span className="text-xs font-bold">Apresentação: 13:45</span>
                </div>
              </div>
              
              <div className="space-y-2">
                <FlightRow flight="LA3818" from="BSB" to="FLN" dep="14:40" arr="16:55" />
                <FlightRow flight="LA3819" from="FLN" to="BSB" dep="17:50" arr="20:00" />
                <FlightRow flight="LA3500" from="BSB" to="MAB" dep="22:55" arr="00:45" nextDay />
              </div>

              <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                   <div className="h-8 w-8 rounded-xl bg-white/5 flex items-center justify-center text-[10px] font-bold text-slate-400">OP</div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-slate-500 uppercase">Fim de Jornada</p>
                  <p className="text-lg font-black">01:15</p>
                  <p className="text-[10px] font-bold text-slate-500 uppercase">22/06</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Day Item - Continuity */}
        <div className="flex gap-4">
          <div className="flex flex-col items-center pt-2">
            <span className="text-[10px] font-black text-slate-500 uppercase">Seg</span>
            <span className="text-2xl font-black">22</span>
            <span className="text-[10px] font-black text-slate-500 uppercase">Jun</span>
          </div>
          <div className="flex-1">
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-3xl p-5 flex items-center gap-3">
              <Moon className="h-5 w-5 text-emerald-400" />
              <span className="font-bold text-emerald-100">Continuação da Jornada</span>
            </div>
          </div>
        </div>

        {/* Day Item - Another Flight */}
        <div className="flex gap-4">
          <div className="flex flex-col items-center pt-2">
            <span className="text-[10px] font-black text-slate-500 uppercase">Ter</span>
            <span className="text-2xl font-black">23</span>
            <span className="text-[10px] font-black text-slate-500 uppercase">Jun</span>
          </div>
          
          <div className="flex-1 space-y-3">
            <div className="bg-purple-600/10 border border-purple-500/20 rounded-3xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-purple-400">
                  <Moon className="h-4 w-4" />
                  <span className="text-xs font-bold">Apresentação: 05:00</span>
                </div>
              </div>
              
              <div className="space-y-2">
                <FlightRow flight="LA3501" from="MAB" to="BSB" dep="05:30" arr="07:35" />
                <FlightRow flight="LA3980" from="BSB" to="CPV" dep="08:40" arr="10:55" />
              </div>

              <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                   <div className="h-8 w-8 rounded-xl bg-white/5 flex items-center justify-center text-[10px] font-bold text-slate-400">OP</div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-slate-500 uppercase">Fim de Jornada</p>
                  <div className="flex items-center gap-1 justify-end">
                    <Sun className="h-4 w-4 text-amber-400" />
                    <p className="text-lg font-black">11:25</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

const FlightRow = ({ flight, from, to, dep, arr, nextDay }: any) => (
  <div className="flex items-center justify-between py-1">
    <div className="flex items-center gap-3">
      <Plane className="h-3 w-3 text-slate-500 rotate-90" />
      <span className="text-xs font-bold tracking-wider">{flight}</span>
    </div>
    <div className="flex items-center gap-3 flex-1 justify-center px-4">
      <span className="text-xs font-black">{from}</span>
      <span className="text-[10px] font-bold text-slate-500">{dep}</span>
      <ChevronRight className="h-3 w-3 text-slate-600" />
      <span className="text-xs font-black">{to}</span>
      <span className="text-[10px] font-bold text-slate-500">{arr} {nextDay && <span className="text-blue-400">+1</span>}</span>
    </div>
    <div className="h-6 w-8 rounded bg-white/5 flex items-center justify-center text-[8px] font-bold text-slate-500">OP</div>
  </div>
);

export default RosterView;
