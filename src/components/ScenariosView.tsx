import React, { useState } from "react";
import { useAppContext, type SavedScenario } from "../lib/store";
import { simulate } from "../lib/cost";
import { formatMoney, formatNumber } from "../lib/format";
import { FolderOpen, Trash2, Calendar, ClipboardList } from "lucide-react";

export const ScenariosView: React.FC = () => {
  const { scenarios, loadScenario, deleteScenario, currency, usdToBrl } = useAppContext();
  const [search, setSearch] = useState("");

  const filtered = scenarios.filter(s => 
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  if (scenarios.length === 0) {
    return (
      <div className="bg-gray-950 border border-gray-800 rounded-xl p-12 text-center flex flex-col items-center justify-center text-gray-500">
        <ClipboardList className="h-10 w-10 opacity-30 mb-2" />
        <p className="text-xs font-bold">Nenhum cenário salvo ainda</p>
        <p className="text-[10px] mt-1 max-w-sm">No simulador principal, ajuste seus parâmetros de leads, conversa ou prompt e clique em "Salvar Cenário" para guardar seu planejamento.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search Filter */}
      <div className="bg-gray-950 border border-gray-800 p-4 rounded-xl max-w-md">
        <input
          type="text"
          placeholder="Filtrar cenários salvos..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full h-9 bg-gray-900 border border-gray-800 focus:border-primary text-gray-200 text-xs font-semibold px-3 rounded-lg focus:outline-none"
        />
      </div>

      {/* Grid of Saved Scenarios */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((s) => {
          const result = simulate(s.params);
          const dateStr = new Date(s.createdAt).toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit"
          });

          return (
            <div key={s.id} className="bg-gray-950 border border-gray-800 rounded-xl p-4 flex flex-col justify-between gap-4">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h5 className="font-bold text-xs text-gray-100 truncate">{s.name}</h5>
                    {s.modelLabel && (
                      <p className="text-[9px] text-gray-500 font-bold truncate mt-0.5">{s.modelLabel}</p>
                    )}
                  </div>
                  <button
                    onClick={() => deleteScenario(s.id)}
                    className="text-gray-500 hover:text-red-400 p-1 rounded hover:bg-gray-900 transition-all shrink-0"
                    title="Excluir cenário permanentemente"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* KPI Metrics Grid */}
                <div className="grid grid-cols-3 gap-2 mt-4 bg-gray-900/60 p-2 rounded-lg border border-gray-900 text-center font-bold">
                  <div>
                    <p className="text-[8px] text-gray-500 uppercase tracking-wider">Leads</p>
                    <p className="text-xs text-gray-300 mt-0.5 tabular-nums">{formatNumber(s.params.leads)}</p>
                  </div>
                  <div>
                    <p className="text-[8px] text-gray-500 uppercase tracking-wider">Custo / Lead</p>
                    <p className="text-xs text-gray-300 mt-0.5 tabular-nums">{formatMoney(result.perLead, currency, usdToBrl, 2)}</p>
                  </div>
                  <div>
                    <p className="text-[8px] text-gray-500 uppercase tracking-wider">Custo Mensal</p>
                    <p className="text-xs text-emerald-400 mt-0.5 tabular-nums">{formatMoney(result.monthlyEquivalentCost, currency, usdToBrl, 2)}</p>
                  </div>
                </div>
              </div>

              {/* Card Footer Actions */}
              <div className="flex items-center justify-between gap-4 pt-2 border-t border-gray-900/60">
                <span className="text-[9px] text-gray-500 font-semibold flex items-center gap-1 shrink-0">
                  <Calendar className="h-3 w-3" />
                  {dateStr}
                </span>

                <button
                  onClick={() => loadScenario(s.id)}
                  className="flex items-center gap-1.5 bg-primary/10 border border-primary/20 hover:bg-primary/20 text-primary-foreground text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all"
                >
                  <FolderOpen className="h-3 w-3" />
                  Carregar Parâmetros
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
