import React, { useState, useMemo } from "react";
import { useAppContext } from "../lib/store";
import { optimizeForBudget, sensitivityAnalysis, periodsPerMonth } from "../lib/cost";
import { formatMoney, formatNumber } from "../lib/format";
import { CurrencyField } from "./CurrencyField";
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ReferenceLine 
} from "recharts";
import { Crown, Sparkles, Filter, AlertTriangle, ArrowRight, Gauge, HelpCircle, Activity } from "lucide-react";

export const OptimizerView: React.FC = () => {
  const { params, models, providers, currency, usdToBrl, setParams, setSelectedModelLabel, setView } = useAppContext();
  
  const [budgetInput, setBudgetInput] = useState<number>(params.monthlyBudget || 50);
  const [maxLeadsPerDay, setMaxLeadsPerDay] = useState<number>(params.maxLeadsPerDay || 0);
  const [sortKey, setSortKey] = useState<"maxLeads" | "costPerLead" | "costPerMsg">("maxLeads");
  const [filterCache, setFilterCache] = useState(false);
  const [filterVision, setFilterVision] = useState(false);

  // Efetiva parâmetros locais e calcula otimização
  const effectiveParams = useMemo(() => ({
    ...params,
    monthlyBudget: budgetInput,
    maxLeadsPerDay
  }), [params, budgetInput, maxLeadsPerDay]);

  const flatModels = useMemo(() => {
    return models.map(m => {
      const provider = providers.find(p => p.id === m.providerId);
      return {
        id: `${m.providerId}||${m.id}`,
        providerName: provider?.name || "",
        modelName: m.name,
        color: provider?.color || "#888",
        inputPricePer1M: m.inputPricePer1M,
        outputPricePer1M: m.outputPricePer1M,
        contextWindow: m.contextWindow,
        modality: m.modality
      };
    });
  }, [models, providers]);

  const output = useMemo(() => {
    return optimizeForBudget(effectiveParams, flatModels, budgetInput);
  }, [effectiveParams, flatModels, budgetInput]);

  const sensitivity = useMemo(() => {
    return sensitivityAnalysis(effectiveParams, flatModels);
  }, [effectiveParams, flatModels]);

  const filtered = useMemo(() => {
    let r = output.results;
    if (filterVision) r = r.filter(x => x.modality.includes("vision"));

    const sorted = [...r];
    if (sortKey === "maxLeads") {
      sorted.sort((a, b) => b.maxLeadsInBudget - a.maxLeadsInBudget);
    } else if (sortKey === "costPerLead") {
      sorted.sort((a, b) => a.costPerLead - b.costPerLead);
    } else {
      sorted.sort((a, b) => a.costPerMessage - b.costPerMessage);
    }
    return sorted;
  }, [output.results, sortKey, filterVision]);

  const best = output.best;
  const maxLeadsAmongFiltered = filtered[0]?.maxLeadsInBudget ?? 0;

  const handleApplyModel = (label: string, inputPrice: number, outputPrice: number) => {
    setSelectedModelLabel(label);
    setParams({
      inputPricePer1M: inputPrice,
      outputPricePer1M: outputPrice,
      monthlyBudget: budgetInput,
      maxLeadsPerDay
    });
    setView("simulator");
  };

  const formatYAxis = (val: number) => {
    if (val >= 1000) return `${(val / 1000).toFixed(0)}k`;
    return String(val);
  };

  const formatTooltip = (val: number) => {
    return [`${formatNumber(val)} leads`, "Capacidade Máxima"];
  };

  return (
    <div className="space-y-4">
      {/* Configuration Header Card */}
      <div className="bg-gray-950 border border-gray-800 rounded-xl p-4 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1.5 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-primary/10 text-primary border border-primary/20 p-1.5 rounded-lg">
              <Activity className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-gray-100">Otimizador de Pipeline</h3>
              <p className="text-[10px] text-gray-500">Veja quantos leads cabem no seu orçamento em cada modelo de inteligência</p>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <div className="space-y-1.5">
            <label className="text-[10px] text-gray-500 font-bold uppercase">
              Orçamento mensal ({currency})
            </label>
            <CurrencyField
              id="optimizer-budget-field"
              valueUSD={budgetInput}
              onChange={(vUSD) => setBudgetInput(vUSD)}
              step={currency === "BRL" ? 10 : 5}
              min={0}
              className="w-28"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] text-gray-500 font-bold uppercase flex items-center">
              Limite Leads/Dia
            </label>
            <input
              type="number"
              value={maxLeadsPerDay}
              onChange={(e) => setMaxLeadsPerDay(Math.max(0, parseInt(e.target.value) || 0))}
              placeholder="0 = Sem teto"
              className="w-24 h-9 bg-gray-900 border border-gray-800 focus:border-primary text-gray-200 text-xs font-semibold px-2 rounded-lg focus:outline-none tabular-nums"
            />
          </div>
        </div>
      </div>

      {/* Champion Model Card */}
      {best && best.maxLeadsInBudget > 0 && (
        <div className="bg-emerald-950/20 border border-emerald-900/50 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 shrink-0 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center justify-center text-emerald-400">
              <Crown className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: best.color || "#888" }} />
                <h4 className="font-bold text-gray-100">{best.providerName} {best.modelName}</h4>
              </div>
              <p className="text-xs text-gray-400 mt-1">Este modelo entrega a maior capacidade de leads possíveis dentro de seu orçamento.</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-2xl font-bold text-emerald-400 tabular-nums">{formatNumber(best.maxLeadsInBudget)}</p>
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Leads / Mês</p>
            </div>
            <button
              onClick={() => handleApplyModel(best.id, best.inputPricePer1M, best.outputPricePer1M)}
              className="bg-primary hover:bg-primary/95 text-white text-xs font-bold px-3 py-2 rounded-lg shadow-md transition-all whitespace-nowrap"
            >
              Usar no Simulador
            </button>
          </div>
        </div>
      )}

      {/* Toolbar Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-gray-400">Ordenar por:</span>
        <button
          onClick={() => setSortKey("maxLeads")}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
            sortKey === "maxLeads" ? "bg-primary text-white" : "bg-gray-950 border border-gray-800 text-gray-400 hover:text-gray-200"
          }`}
        >
          Mais Leads
        </button>
        <button
          onClick={() => setSortKey("costPerLead")}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
            sortKey === "costPerLead" ? "bg-primary text-white" : "bg-gray-950 border border-gray-800 text-gray-400 hover:text-gray-200"
          }`}
        >
          Menor Custo/Lead
        </button>
        
        <span className="h-4 w-px bg-gray-800 mx-1" />

        <button
          onClick={() => setFilterCache(!filterCache)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
            filterCache ? "bg-emerald-950 border border-emerald-900/50 text-emerald-400" : "bg-gray-950 border border-gray-800 text-gray-400 hover:text-gray-200"
          }`}
        >
          ⚡ Só com Cache
        </button>
        <button
          onClick={() => setFilterVision(!filterVision)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
            filterVision ? "bg-primary/10 border border-primary/20 text-primary-foreground" : "bg-gray-950 border border-gray-800 text-gray-400 hover:text-gray-200"
          }`}
        >
          👁 Só Multimodais
        </button>
      </div>

      {/* Ranking List of Results */}
      <div className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden p-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Ranking de Capacidade de Atendimento</h4>
        <div className="space-y-3 divide-y divide-gray-900/50">
          {filtered.map((r, idx) => {
            const progressWidth = maxLeadsAmongFiltered > 0
              ? (r.maxLeadsInBudget / maxLeadsAmongFiltered) * 100
              : 0;

            return (
              <div key={r.id} className={`pt-3 first:pt-0 flex items-center justify-between gap-4`}>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs font-mono font-bold text-gray-500 w-4 text-center">{idx + 1}</span>
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: r.color || "#888" }} />
                  <div>
                    <h5 className="text-xs font-bold text-gray-200">{r.modelName}</h5>
                    <p className="text-[10px] text-gray-500 font-semibold">{r.providerName}</p>
                  </div>
                </div>

                <div className="flex-1 max-w-sm hidden sm:block">
                  <div className="h-1.5 w-full bg-gray-900 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${progressWidth}%` }}
                    />
                  </div>
                </div>

                <div className="text-right">
                  <p className="text-xs font-bold text-gray-200 tabular-nums">{formatNumber(r.maxLeadsInBudget)} leads</p>
                  <p className="text-[9px] text-gray-500 font-bold uppercase tabular-nums">
                    {formatMoney(r.costPerLead, currency, usdToBrl, 4)}/lead
                  </p>
                </div>

                <button
                  onClick={() => handleApplyModel(r.id, r.inputPricePer1M, r.outputPricePer1M)}
                  className="bg-gray-900 hover:bg-gray-800 border border-gray-800 text-[10px] font-bold px-2 py-1.5 rounded transition-all shrink-0"
                >
                  Selecionar
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sensitivity Analysis Line Chart */}
      <div className="bg-gray-950 border border-gray-800 rounded-xl p-4">
        <div className="flex items-center gap-1.5 mb-3">
          <Activity className="h-4 w-4 text-primary" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Análise de Elasticidade / Sensibilidade</h4>
        </div>
        <p className="text-[10px] text-gray-500 mb-4">Veja como a capacidade do líder de escala se comporta dinamicamente em diferentes faixas orçamentárias ($5 a $500)</p>

        <div className="h-60 w-full text-xs">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={sensitivity.points}
              margin={{ top: 10, right: 10, bottom: 5, left: -20 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#16181d" />
              <XAxis 
                dataKey="budget" 
                stroke="#4b5563" 
                tickLine={false} 
                tickFormatter={(v) => `$${v}`}
              />
              <YAxis 
                stroke="#4b5563" 
                tickLine={false} 
                tickFormatter={formatYAxis}
              />
              <Tooltip 
                contentStyle={{ backgroundColor: "#030712", borderColor: "#1f2937", borderRadius: "8px" }}
                labelFormatter={(v) => `Orçamento: $${v}`}
                formatter={formatTooltip}
              />
              <ReferenceLine 
                x={budgetInput} 
                stroke="#6366f1" 
                strokeDasharray="3 3"
                label={{ value: "Atual", fill: "#6366f1", fontSize: 9, fontWeight: "bold" }}
              />
              <Line 
                type="monotone" 
                dataKey="bestLeads" 
                stroke="#10b981" 
                strokeWidth={2} 
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
