import React, { useMemo } from "react";
import { useAppContext } from "../lib/store";
import { simulate } from "../lib/cost";
import { formatMoney, formatNumber, formatMoneyShort } from "../lib/format";
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Cell 
} from "recharts";
import { Trophy, ArrowDown, Award, Zap, Download, Layers } from "lucide-react";

export const CompareView: React.FC = () => {
  const { params, models, providers, currency, usdToBrl, setSelectedModelLabel, setParams, setView } = useAppContext();

  // Calcula simulação para cada modelo do catálogo
  const results = useMemo(() => {
    return models.map((m) => {
      const provider = providers.find((p) => p.id === m.providerId);
      const simParams = {
        ...params,
        inputPricePer1M: m.inputPricePer1M,
        outputPricePer1M: m.outputPricePer1M,
        cacheDiscount: m.cacheDiscount,
        useCache: m.cacheDiscount > 0
      };
      const r = simulate(simParams);
      return {
        model: m,
        provider,
        result: r,
        monthlyCost: r.monthlyEquivalentCost
      };
    });
  }, [models, providers, params]);

  // Ordena pelo custo mensal (do mais barato para o mais caro)
  const sorted = useMemo(() => {
    return [...results].sort((a, b) => a.monthlyCost - b.monthlyCost);
  }, [results]);

  const cheapest = sorted[0];

  const handleApplyModel = (providerId: string, modelId: string, inputPrice: number, outputPrice: number, cacheDiscount: number) => {
    setSelectedModelLabel(`${providerId}||${modelId}`);
    setParams({
      inputPricePer1M: inputPrice,
      outputPricePer1M: outputPrice,
      cacheDiscount,
      useCache: cacheDiscount > 0
    });
    setView("simulator");
  };

  // Top 10 mais baratos para renderizar no gráfico
  const chartData = useMemo(() => {
    return sorted.slice(0, 10).map((s) => ({
      name: s.model.name,
      fullName: `${s.provider?.name || ""} ${s.model.name}`,
      custo: s.monthlyCost,
      color: s.provider?.color || "#888"
    }));
  }, [sorted]);

  const formatYAxis = (val: number) => {
    const rate = currency === "BRL" ? usdToBrl : 1;
    const prefix = currency === "BRL" ? "R$ " : "$";
    const converted = val * rate;
    if (converted >= 1000) return `${prefix}${(converted / 1000).toFixed(1)}k`;
    return `${prefix}${converted.toFixed(0)}`;
  };

  const formatTooltip = (val: number) => {
    return [formatMoney(val, currency, usdToBrl, 2), "Custo Mensal"];
  };

  // Exportar dados de comparação para CSV
  const handleExportCSV = () => {
    const rows: string[][] = [
      ["Provedor", "Modelo", "Preço Input/1M ($)", "Preço Output/1M ($)", "Custo Mensal Equivalente ($)", "Custo por Lead ($)"]
    ];

    sorted.forEach((s) => {
      rows.push([
        s.provider?.name || "",
        s.model.name,
        String(s.model.inputPricePer1M),
        String(s.model.outputPricePer1M),
        s.monthlyCost.toFixed(4),
        s.result.perLead.toFixed(6)
      ]);
    });

    const csvContent = "data:text/csv;charset=utf-8,\ufeff" 
      + rows.map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "custoia_comparativo_completo.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4">
      {/* Crown Banner */}
      {cheapest && (
        <div className="bg-emerald-950/20 border border-emerald-900/50 rounded-xl p-4 flex items-center gap-3">
          <div className="h-10 w-10 shrink-0 bg-emerald-500/10 border border-emerald-500/30 rounded-lg flex items-center justify-center text-emerald-400">
            <Trophy className="h-5 w-5" />
          </div>
          <div className="text-xs leading-relaxed flex-1">
            <p className="font-bold text-emerald-400">Opção Recomendada por Economia:</p>
            <p className="text-gray-400 mt-0.5">
              Para a volumetria atual, o modelo <strong>{cheapest.provider?.name} {cheapest.model.name}</strong> é o campeão de economia, totalizando apenas <strong className="text-emerald-300">{formatMoney(cheapest.monthlyCost, currency, usdToBrl, 2)}</strong> por mês.
            </p>
          </div>
          <button
            onClick={() => handleApplyModel(cheapest.model.providerId, cheapest.model.id, cheapest.model.inputPricePer1M, cheapest.model.outputPricePer1M, cheapest.model.cacheDiscount)}
            className="bg-emerald-500 hover:bg-emerald-400 text-gray-950 text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm transition-all whitespace-nowrap"
          >
            Aplicar no Simulador
          </button>
        </div>
      )}

      {/* Gráfico de barras Top 10 */}
      <div className="bg-gray-950 border border-gray-800 rounded-xl p-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-4">Top 10 Modelos Mais Econômicos</h4>
        <div className="h-64 w-full text-xs">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 5, right: 10, bottom: 5, left: 10 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#16181d" horizontal={false} />
              <XAxis 
                type="number" 
                stroke="#4b5563" 
                tickLine={false} 
                tickMargin={8}
                tickFormatter={formatYAxis}
              />
              <YAxis 
                type="category" 
                dataKey="name" 
                stroke="#4b5563" 
                tickLine={false} 
                tickMargin={8}
                width={90}
              />
              <Tooltip 
                contentStyle={{ backgroundColor: "#030712", borderColor: "#1f2937", borderRadius: "8px" }}
                formatter={formatTooltip}
              />
              <Bar dataKey="custo" radius={[0, 4, 4, 0]} maxBarSize={16}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tabela Comparativa Completa */}
      <div className="bg-gray-950 border border-gray-800 rounded-xl p-4">
        <div className="flex items-center justify-between pb-3 border-b border-gray-900/60 mb-3">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Comparativo Completo</h4>
            <p className="text-[10px] text-gray-500 mt-0.5">Todos os modelos do catálogo ordenados pelo custo mensal total de simulação</p>
          </div>
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1 bg-gray-900 hover:bg-gray-800 border border-gray-800 text-[10px] text-gray-300 font-bold px-2.5 py-1.5 rounded-lg transition-all"
          >
            <Download className="h-3.5 w-3.5 text-primary" />
            Exportar Comparativo
          </button>
        </div>

        <div className="overflow-x-auto max-h-[480px] scrollbar-thin">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400 font-semibold bg-gray-950 sticky top-0 z-10">
                <th className="py-2 px-3">Modelo</th>
                <th className="py-2 px-3 text-center">Preço Input/Output</th>
                <th className="py-2 px-3 text-center">Cache</th>
                <th className="py-2 px-3 text-right">Custo / Msg</th>
                <th className="py-2 px-3 text-right">Custo / Lead</th>
                <th className="py-2 px-3 text-right">Custo Mensal Est.</th>
                <th className="py-2 px-3 text-center">Diferença vs Top</th>
                <th className="py-2 px-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-900/40 text-gray-300 font-medium">
              {sorted.map((s, idx) => {
                const diffPercent = cheapest.monthlyCost > 0
                  ? ((s.monthlyCost - cheapest.monthlyCost) / cheapest.monthlyCost) * 100
                  : 0;

                return (
                  <tr key={s.model.id} className={`hover:bg-gray-900/20 transition-colors ${idx === 0 ? "bg-emerald-950/5" : ""}`}>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        <span 
                          className="h-2.5 w-2.5 rounded-full shrink-0" 
                          style={{ backgroundColor: s.provider?.color || "#888" }}
                        />
                        <div>
                          <p className="font-bold text-gray-200">{s.model.name}</p>
                          <p className="text-[10px] text-gray-500">{s.provider?.name}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-center text-gray-400 font-mono">
                      ${s.model.inputPricePer1M.toFixed(2)} / ${s.model.outputPricePer1M.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {s.model.cacheDiscount > 0 ? (
                        <span className="inline-flex items-center gap-0.5 bg-emerald-950 text-emerald-400 border border-emerald-900/50 text-[10px] px-2 py-0.5 rounded-full font-bold">
                          <Zap className="h-2.5 w-2.5" />
                          {(s.model.cacheDiscount * 100).toFixed(0)}%
                        </span>
                      ) : (
                        <span className="text-gray-600 text-[10px] font-bold">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums">
                      {formatMoney(s.result.perMessage, currency, usdToBrl, 2)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-gray-200 tabular-nums">
                      {formatMoney(s.result.perLead, currency, usdToBrl, 2)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-gray-200 tabular-nums">
                      {formatMoney(s.monthlyCost, currency, usdToBrl, 2)}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {idx === 0 ? (
                        <span className="bg-emerald-950 text-emerald-400 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">Top 1</span>
                      ) : (
                        <span className="text-red-400 inline-flex items-center text-[10px] font-bold">
                          <ArrowDown className="h-3 w-3 rotate-180" />
                          {diffPercent.toFixed(0)}%
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        onClick={() => handleApplyModel(s.model.providerId, s.model.id, s.model.inputPricePer1M, s.model.outputPricePer1M, s.model.cacheDiscount)}
                        className="bg-gray-900 border border-gray-800 hover:border-primary/50 text-gray-300 hover:text-white text-[10px] font-bold px-2 py-1 rounded"
                      >
                        Aplicar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
