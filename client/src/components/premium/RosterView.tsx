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
        {/* White Card Theme based on screenshot */}
        <div className="bg-white rounded-[32px] p-5 shadow-sm text-slate-900">
          <div className="flex justify-between items-start mb-4">
            <div>
              <span className="text-[14px] font-black text-slate-800 uppercase block leading-none">SEG</span>
              <div className="flex items-baseline gap-1">
                <span className="text-[40px] font-black text-[#071D33] leading-none tracking-tighter">06</span>
                <span className="text-[14px] font-black text-[#071D33] uppercase leading-none">JUL</span>
              </div>
            </div>
            <div className="w-full max-w-[200px] h-1 rounded-full bg-gradient-to-r from-emerald-400 to-blue-500 mt-2"></div>
          </div>
          
          <div className="flex gap-3 mb-6">
            <div className="flex-1 bg-[#20C997] rounded-full py-2.5 px-4 flex items-center justify-center shadow-[0_4px_12px_rgba(32,201,151,0.3)]">
              <span className="text-xs font-bold text-white">Diárias R$ 355,68</span>
            </div>
            <div className="flex-1 bg-[#6366F1] rounded-full py-2.5 px-4 flex items-center justify-center shadow-[0_4px_12px_rgba(99,102,241,0.3)]">
              <span className="text-xs font-bold text-white">Ganhos R$ 458,23</span>
            </div>
          </div>

          <div className="space-y-3">
            {/* Flight Item */}
            <div className="bg-white border border-slate-100 rounded-2xl p-4 flex gap-4 shadow-sm relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-2 bg-[#0ea5e9]"></div>
              <div className="flex flex-col items-center justify-center min-w-[48px]">
                <Plane className="h-5 w-5 text-slate-800 mb-1" />
                <span className="text-lg font-black text-slate-800 leading-none">04:45</span>
                <span className="text-lg font-black text-slate-800 leading-none">08:20</span>
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-black text-slate-800 tracking-tight">LA3455 · FOR → GRU</h3>
                  <ChevronRight className="h-5 w-5 text-slate-400 rotate-90" />
                </div>
                <p className="text-sm text-slate-600 font-medium mt-1">Apres. 04:15 · Chegada 08:20 · Solo 15h15 ·...</p>
                <div className="mt-3 bg-[#f1f5f9] rounded-2xl p-3 flex gap-2 items-start border border-slate-200">
                  <div className="mt-0.5"><div className="w-3.5 h-3.5 rounded-full border border-slate-400 flex items-center justify-center"><div className="w-1.5 h-1.5 bg-slate-400 rounded-full"></div></div></div>
                  <p className="text-[11px] font-bold text-slate-600 leading-tight">RBAC 117 B.1 / ACT · 9h · 1-2 etapas · início 04:15 · encerra até 13:15 · aplica o mais restritivo</p>
                </div>
              </div>
            </div>

            {/* Layover Item */}
            <div className="bg-white border border-slate-100 rounded-2xl p-4 flex gap-4 shadow-sm relative overflow-hidden">
              <div className="flex flex-col items-center justify-center min-w-[48px]">
                <Moon className="h-5 w-5 text-slate-800 mb-1" />
                <span className="text-lg font-black text-slate-800 leading-none">15h</span>
                <span className="text-lg font-black text-slate-800 leading-none">15min</span>
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-black text-slate-800 tracking-tight">Pernoite diurno · GRU</h3>
                  <ChevronRight className="h-5 w-5 text-slate-400 rotate-90" />
                </div>
                <p className="text-sm text-slate-600 font-medium mt-1">Pernoite diurno em Guarulhos · 15h 15min ·...</p>
                <div className="mt-3 bg-[#f1f5f9] rounded-2xl p-3 flex gap-2 items-start border border-slate-200">
                  <div className="mt-0.5"><div className="w-3.5 h-3.5 rounded-full border border-slate-400 flex items-center justify-center"><div className="w-1.5 h-1.5 bg-slate-400 rounded-full"></div></div></div>
                  <p className="text-[11px] font-bold text-slate-600 leading-tight">RBAC 117 B.1 / ACT · 9h · 1-2 etapas · início 04:15 · encerra até 13:15 · aplica o mais restritivo</p>
                </div>
              </div>
            </div>
            
            {/* Flight Item 2 */}
            <div className="bg-white border border-slate-100 rounded-2xl p-4 flex gap-4 shadow-sm relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-2 bg-[#0ea5e9]"></div>
              <div className="flex flex-col items-center justify-center min-w-[48px]">
                <Plane className="h-5 w-5 text-slate-800 mb-1" />
                <span className="text-lg font-black text-slate-800 leading-none">23:35</span>
                <span className="text-lg font-black text-slate-800 leading-none">02:00</span>
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-black text-slate-800 tracking-tight">LA3394 · GRU → PMW</h3>
                  <ChevronRight className="h-5 w-5 text-slate-400 rotate-90" />
                </div>
                <p className="text-sm text-slate-600 font-medium mt-1">Decolagem 23:35 · Chegada 02:00 +1 · Após...</p>
                <div className="mt-3 bg-[#f1f5f9] rounded-2xl p-3 flex gap-2 items-start border border-slate-200">
                  <div className="mt-0.5"><div className="w-3.5 h-3.5 rounded-full border border-slate-400 flex items-center justify-center"><div className="w-1.5 h-1.5 bg-slate-400 rounded-full"></div></div></div>
                  <p className="text-[11px] font-bold text-slate-600 leading-tight">RBAC 117 B.1 / ACT · 9h · 1-2 etapas · início 04:15 · encerra até 13:15 · aplica o mais restritivo</p>
                </div>
              </div>
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
