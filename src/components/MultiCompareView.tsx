import React, { useState, useMemo } from "react";
import { useAppContext } from "../lib/store";
import { simulate } from "../lib/cost";
import { formatMoney, formatNumber, formatMoneyShort, formatTokens } from "../lib/format";
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ReferenceLine,
  Legend
} from "recharts";
import { Layers, X, Check, HelpCircle, AlertTriangle } from "lucide-react";

export const MultiCompareView: React.FC = () => {
  const { params, models, providers, currency, usdToBrl } = useAppContext();
  const [selectedIds, setSelectedIds] = useState<string[]>(["m-gpt-4o", "m-claude-35-sonnet", "m-gemini-20-flash"]);

  const flatModels = useMemo(() => {
    return models.map(m => {
      const provider = providers.find(p => p.id === m.providerId);
      return {
        id: m.id,
        name: m.name,
        fullName: `${provider?.name || ""} ${m.name}`,
        color: provider?.color || "#888",
        inputPricePer1M: m.inputPricePer1M,
        outputPricePer1M: m.outputPricePer1M,
        cacheDiscount: m.cacheDiscount,
        modality: m.modality
      };
    });
  }, [models, providers]);

  const toggleModel = (id: string) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(x => x !== id);
      }
      if (prev.length >= 4) {
        return prev; // limite de 4 selecionados
      }
      return [...prev, id];
    });
  };

  const results = useMemo(() => {
    return selectedIds.map(id => {
      const m = flatModels.find(x => x.id === id);
      if (!m) return null;
      const simParams = {
        ...params,
        inputPricePer1M: m.inputPricePer1M,
        outputPricePer1M: m.outputPricePer1M,
        cacheDiscount: m.cacheDiscount,
        useCache: m.cacheDiscount > 0
      };
      const result = simulate(simParams);
      return { model: m, result };
    }).filter(Boolean);
  }, [selectedIds, flatModels, params]);

  // Junta as séries em um único array estruturado de pontos p/ recharts
  const mergedSeries = useMemo(() => {
    if (results.length === 0) return [];
    
    // Pega o mapeamento de leads do primeiro resultado (todas as séries têm o mesmo tamanho/escalabilidade de leads)
    const leadPoints = results[0]!.result.scalingSeries.map(s => s.leads);
    
    return leadPoints.map(leads => {
      const point: any = { leads };
      results.forEach(r => {
        const costPoint = r!.result.scalingSeries.find(s => s.leads === leads);
        point[r!.model.id] = costPoint ? costPoint.cost : 0;
      });
      return point;
    });
  }, [results]);

  const formatYAxis = (val: number) => {
    const rate = currency === "BRL" ? usdToBrl : 1;
    const prefix = currency === "BRL" ? "R$ " : "$";
    const converted = val * rate;
    if (converted >= 1000) return `${prefix}${(converted / 1000).toFixed(0)}k`;
    return `${prefix}${converted.toFixed(0)}`;
  };

  return (
    <div className="space-y-4">
      <div className="grid lg:grid-cols-[250px_1fr] gap-4">
        {/* Painel Esquerdo: Seletor de Modelos */}
        <div className="bg-gray-950 border border-gray-800 rounded-xl p-4 flex flex-col gap-3 h-[460px]">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Selecionar Modelos</h4>
            <p className="text-[10px] text-gray-500 mt-0.5">Escolha até 4 modelos para cruzar as curvas no gráfico ao lado</p>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-gray-900/50 pr-1 scrollbar-thin">
            {flatModels.map((m) => {
              const isSelected = selectedIds.includes(m.id);
              const disabled = !isSelected && selectedIds.length >= 4;

              return (
                <button
                  key={m.id}
                  onClick={() => toggleModel(m.id)}
                  disabled={disabled}
                  className={`w-full flex items-center justify-between py-2 text-left transition-all ${
                    disabled ? "opacity-35 cursor-not-allowed" : "hover:bg-gray-900/40"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
                    <div className="truncate">
                      <p className="text-xs font-bold text-gray-200 truncate">{m.name}</p>
                      <p className="text-[9px] text-gray-500 font-semibold truncate">{m.fullName.split(" ")[0]}</p>
                    </div>
                  </div>

                  <div className={`h-4 w-4 rounded border flex items-center justify-center transition-all ${
                    isSelected ? "border-primary bg-primary text-white" : "border-gray-800 bg-gray-900"
                  }`}>
                    {isSelected && <Check className="h-3 w-3" />}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="pt-2 border-t border-gray-900/60 flex items-center justify-between text-[10px] font-bold text-gray-400">
            <span>Selecionados:</span>
            <span>{selectedIds.length} / 4</span>
          </div>
        </div>

        {/* Painel Direito: Gráfico de Curvas Sobrepostas */}
        <div className="bg-gray-950 border border-gray-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Curvas Sobrepostas de Escala</h4>
              <p className="text-[10px] text-gray-500 mt-0.5">Custo mensal unificado em função do número de leads</p>
            </div>
            {params.monthlyBudget > 0 && (
              <span className="bg-gray-900 border border-gray-800 text-[10px] text-gray-400 font-bold px-2 py-0.5 rounded-full">
                Orçamento de {formatMoney(params.monthlyBudget, currency, usdToBrl, 0)}
              </span>
            )}
          </div>

          {selectedIds.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-gray-500 min-h-[300px]">
              <Layers className="h-10 w-10 opacity-30 mb-2" />
              <p className="text-xs font-bold">Nenhum modelo selecionado</p>
              <p className="text-[10px] mt-1">Marque pelo menos 1 modelo no painel lateral esquerdo para gerar as curvas comparativas.</p>
            </div>
          ) : (
            <div className="h-72 w-full text-xs">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={mergedSeries}
                  margin={{ top: 10, right: 10, bottom: 5, left: -20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#16181d" />
                  <XAxis 
                    dataKey="leads" 
                    stroke="#4b5563" 
                    tickLine={false} 
                    tickMargin={8}
                    tickFormatter={(v) => formatNumber(v)}
                  />
                  <YAxis 
                    stroke="#4b5563" 
                    tickLine={false} 
                    tickMargin={8}
                    tickFormatter={formatYAxis}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: "#030712", borderColor: "#1f2937", borderRadius: "8px" }}
                    labelFormatter={(v) => `Leads: ${formatNumber(v)}`}
                    formatter={(value: any, name: any) => {
                      const m = flatModels.find(x => x.id === name);
                      return [formatMoney(value, currency, usdToBrl, 2), m?.fullName || name];
                    }}
                  />
                  
                  {params.monthlyBudget > 0 && (
                    <ReferenceLine 
                      y={params.monthlyBudget} 
                      stroke="#ef4444" 
                      strokeDasharray="4 4"
                    />
                  )}

                  {results.map((r) => (
                    <Line
                      key={r!.model.id}
                      type="monotone"
                      dataKey={r!.model.id}
                      name={r!.model.id}
                      stroke={r!.model.color}
                      strokeWidth={2}
                      dot={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Legenda de Cores */}
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 pt-2 border-t border-gray-900/60">
            {results.map((r) => (
              <div key={r!.model.id} className="flex items-center gap-1.5 text-[10px] font-semibold">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: r!.model.color }} />
                <span className="text-gray-300">{r!.model.fullName}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tabela de Resultados Rápidos Side-by-Side */}
      {results.length > 0 && (
        <div className="bg-gray-950 border border-gray-800 rounded-xl p-4 overflow-hidden">
          <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Tabela Comparativa Rápida</h4>
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-800 text-gray-400 font-semibold">
                  <th className="py-2 px-3">Modelo</th>
                  <th className="py-2 px-3 text-right">Custo / Lead</th>
                  <th className="py-2 px-3 text-right">Custo Mensal Est.</th>
                  <th className="py-2 px-3 text-right">Capacidade de Leads</th>
                  <th className="py-2 px-3 text-right">Tokens / Lead</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-900/40 text-gray-300 font-medium">
                {results.map((r) => (
                  <tr key={r!.model.id} className="hover:bg-gray-900/20 transition-colors">
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: r!.model.color }} />
                        <span className="font-bold text-gray-200">{r!.model.fullName}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums">
                      {formatMoney(r!.result.perLead, currency, usdToBrl, 4)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold tabular-nums">
                      {formatMoney(r!.result.monthlyEquivalentCost, currency, usdToBrl, 2)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-emerald-400 font-bold tabular-nums">
                      {params.monthlyBudget > 0 ? `${formatNumber(r!.result.maxLeadsInBudget)} leads` : "—"}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums">
                      {formatTokens(r!.result.conversation.totalTokens)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
