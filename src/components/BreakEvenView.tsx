import React, { useState, useMemo } from "react";
import { useAppContext } from "../lib/store";
import { breakEvenAnalysis } from "../lib/cost";
import { formatMoney, formatNumber, periodLabel } from "../lib/format";
import { CurrencyField } from "./CurrencyField";
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ReferenceLine,
  ReferenceArea
} from "recharts";
import { Scale, ArrowRight, CheckCircle2, XCircle, AlertCircle, TrendingDown, Wallet, Calendar, Trophy, Sparkles } from "lucide-react";

interface BreakEvenViewProps {
  onPickModel?: (providerId: string, modelId: string) => void;
}

export const BreakEvenView: React.FC<BreakEvenViewProps> = () => {
  const { params, models, providers, currency, usdToBrl, setSelectedModelLabel, setParams, setView } = useAppContext();

  // Modelos selecionados para análise
  const [modelAId, setModelAId] = useState<string>("m-gpt-4o");
  const [modelBId, setModelBId] = useState<string>("m-gpt-4o-mini");
  const [migrationCost, setMigrationCost] = useState<number>(100);

  const flatModels = useMemo(() => {
    return models.map(m => {
      const provider = providers.find(p => p.id === m.providerId);
      return {
        id: m.id,
        name: m.name,
        fullName: `${provider?.name || ""} ${m.name}`,
        providerName: provider?.name || "",
        color: provider?.color || "#888",
        inputPricePer1M: m.inputPricePer1M,
        outputPricePer1M: m.outputPricePer1M,
        cacheDiscount: m.cacheDiscount
      };
    });
  }, [models, providers]);

  const modelA = flatModels.find(m => m.id === modelAId);
  const modelB = flatModels.find(m => m.id === modelBId);

  const result = useMemo(() => {
    if (!modelA || !modelB) return null;
    return breakEvenAnalysis({
      modelA,
      modelB,
      baseParams: params,
      migrationCost
    });
  }, [modelA, modelB, params, migrationCost]);

  const handleApplyModelB = () => {
    if (!modelB) return;
    const label = `${modelB.id.startsWith("custom") ? "custom" : "p-" + modelB.fullName.split(" ")[0].toLowerCase()}||${modelB.id}`;
    setSelectedModelLabel(label);
    setParams({
      inputPricePer1M: modelB.inputPricePer1M,
      outputPricePer1M: modelB.outputPricePer1M,
      cacheDiscount: modelB.cacheDiscount,
      useCache: modelB.cacheDiscount > 0
    });
    setView("simulator");
  };

  const formatYAxis = (val: number) => {
    const rate = currency === "BRL" ? usdToBrl : 1;
    const prefix = currency === "BRL" ? "R$ " : "$";
    const converted = val * rate;
    if (converted >= 1000) return `${prefix}${(converted / 1000).toFixed(0)}k`;
    return `${prefix}${converted.toFixed(0)}`;
  };

  const formatTooltip = (val: number, name: string) => {
    const label = name === "costA" ? "Modelo A (Acumulado)" : "Modelo B + Migração";
    return [formatMoney(val, currency, usdToBrl, 2), label];
  };

  return (
    <div className="space-y-4">
      {/* Introduction Card */}
      <div className="bg-gray-950 border border-gray-800 rounded-xl p-4 flex items-center gap-3">
        <div className="h-10 w-10 shrink-0 bg-primary/10 border border-primary/20 rounded-lg flex items-center justify-center text-primary">
          <Scale className="h-5 w-5" />
        </div>
        <div className="text-xs leading-relaxed">
          <h4 className="font-bold text-gray-100">Calculadora de Break-even de Migração</h4>
          <p className="text-gray-500 mt-0.5">
            Analise se o custo de reescrever prompts e alterar fluxos do n8n para migrar para um modelo mais barato é viável comercialmente e qual é o prazo de retorno (payback).
          </p>
        </div>
      </div>

      {/* Selectors and parameters */}
      <div className="bg-gray-950 border border-gray-800 rounded-xl p-4 space-y-4">
        <div className="grid md:grid-cols-3 gap-3">
          {/* Model A */}
          <div className="space-y-1.5">
            <label className="text-xs text-gray-400 font-semibold">Modelo A (Atual mais caro)</label>
            <select
              value={modelAId}
              onChange={(e) => setModelAId(e.target.value)}
              className="w-full h-9 bg-gray-900 border border-gray-800 focus:border-primary text-gray-200 text-xs font-semibold px-2 rounded-lg focus:outline-none"
            >
              {flatModels.map(m => (
                <option key={m.id} value={m.id}>{m.fullName}</option>
              ))}
            </select>
          </div>

          {/* Model B */}
          <div className="space-y-1.5">
            <label className="text-xs text-gray-400 font-semibold">Modelo B (Destino mais barato)</label>
            <select
              value={modelBId}
              onChange={(e) => setModelBId(e.target.value)}
              className="w-full h-9 bg-gray-900 border border-gray-800 focus:border-primary text-gray-200 text-xs font-semibold px-2 rounded-lg focus:outline-none"
            >
              {flatModels.map(m => (
                <option key={m.id} value={m.id}>{m.fullName}</option>
              ))}
            </select>
          </div>

          {/* Custo de Migração */}
          <div className="space-y-1.5">
            <label className="text-xs text-gray-400 font-semibold flex items-center">
              Custo Estimado de Transição ({currency})
            </label>
            <CurrencyField
              id="breakeven-migration-cost-field"
              valueUSD={migrationCost}
              onChange={(vUSD) => setMigrationCost(vUSD)}
              step={currency === "BRL" ? 50 : 10}
              min={0}
            />
          </div>
        </div>
      </div>

      {result && (
        <>
          {/* Recommendation Banner */}
          <div className={`p-4 rounded-xl border flex items-start gap-3 transition-all ${
            result.recommendation.type === "migrate"
              ? "bg-emerald-950/20 border-emerald-900/50 text-emerald-400"
              : result.recommendation.type === "stay"
              ? "bg-red-950/20 border-red-900/50 text-red-400"
              : "bg-gray-900/50 border-gray-800 text-gray-400"
          }`}>
            <div className="mt-0.5 shrink-0">
              {result.recommendation.type === "migrate" ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              ) : result.recommendation.type === "stay" ? (
                <XCircle className="h-5 w-5 text-red-400" />
              ) : (
                <AlertCircle className="h-5 w-5 text-gray-400" />
              )}
            </div>
            <div className="text-xs leading-relaxed flex-1">
              <p className="font-bold">
                {result.recommendation.type === "migrate"
                  ? "Recomendado: Migrar para o Modelo B!"
                  : result.recommendation.type === "stay"
                  ? "Recomendado: Permanecer no Modelo A!"
                  : "Empate financeiro técnico"}
              </p>
              <p className="text-gray-400 mt-1">{result.recommendation.reason}</p>
            </div>
            {result.recommendation.type === "migrate" && (
              <button
                onClick={handleApplyModelB}
                className="bg-primary hover:bg-primary/95 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg shadow-sm transition-all"
              >
                Aplicar B no Simulador
              </button>
            )}
          </div>

          {/* 4 KPIs de Break Even */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* KPI 1: Custo Lead A */}
            <div className="bg-gray-950 border border-gray-800 p-4 rounded-xl">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1">Custo/Lead A</span>
              <p className="text-lg font-bold text-gray-200 tabular-nums">{formatMoney(result.costPerLeadA, currency, usdToBrl, 4)}</p>
              <p className="text-[9px] text-gray-500 font-semibold">{modelA?.name}</p>
            </div>

            {/* KPI 2: Custo Lead B */}
            <div className="bg-gray-950 border border-gray-800 p-4 rounded-xl">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1">Custo/Lead B</span>
              <p className="text-lg font-bold text-gray-200 tabular-nums">{formatMoney(result.costPerLeadB, currency, usdToBrl, 4)}</p>
              <p className="text-[9px] text-gray-500 font-semibold">{modelB?.name}</p>
            </div>

            {/* KPI 3: Economia / Lead */}
            <div className="bg-gray-950 border border-emerald-950 bg-emerald-950/10 p-4 rounded-xl">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block mb-1">Economia por Lead</span>
              <p className="text-lg font-bold text-emerald-400 tabular-nums">
                {result.savingPerLead > 0 ? "+" : ""}
                {formatMoney(result.savingPerLead, currency, usdToBrl, 4)}
              </p>
              <p className="text-[9px] text-gray-500 font-semibold">B vs A por lead completo</p>
            </div>

            {/* KPI 4: Leads de Break-even */}
            <div className="bg-gray-950 border border-gray-800 p-4 rounded-xl">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1">Ponto de Break-even</span>
              <p className="text-lg font-bold text-gray-200 tabular-nums">
                {result.breakEvenLeads === Infinity ? "Nunca" : `${formatNumber(result.breakEvenLeads)} leads`}
              </p>
              <p className="text-[9px] text-gray-500 font-semibold">
                {result.breakEvenMonths > 0 ? `Payback em ${result.breakEvenMonths.toFixed(1)} meses` : "—"}
              </p>
            </div>
          </div>

          {/* Crossing curves chart */}
          {result.breakEvenLeads !== Infinity && (
            <div className="bg-gray-950 border border-gray-800 rounded-xl p-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-4">Cruzamento de Custos Acumulados</h4>
              <div className="h-64 w-full text-xs">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={result.series}
                    margin={{ top: 10, right: 10, bottom: 5, left: -20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#16181d" />
                    <XAxis 
                      dataKey="leads" 
                      stroke="#4b5563" 
                      tickLine={false} 
                      tickFormatter={(v) => formatNumber(v)}
                    />
                    <YAxis 
                      stroke="#4b5563" 
                      tickLine={false} 
                      tickFormatter={formatYAxis}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: "#030712", borderColor: "#1f2937", borderRadius: "8px" }}
                      labelFormatter={(v) => `Leads acumulados: ${formatNumber(v)}`}
                    />
                    
                    {/* Linha vertical no break even */}
                    <ReferenceLine 
                      x={result.breakEvenLeads} 
                      stroke="#10b981" 
                      strokeDasharray="4 4" 
                      label={{ value: "Ponto de Equilíbrio", fill: "#10b981", fontSize: 9, fontWeight: "bold" }}
                    />

                    <Line 
                      type="monotone" 
                      dataKey="costA" 
                      stroke={modelA?.color || "#ef4444"} 
                      strokeWidth={2} 
                      dot={false}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="costBWithMigration" 
                      stroke={modelB?.color || "#10b981"} 
                      strokeWidth={2} 
                      strokeDasharray="5 3"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 flex gap-4 text-[10px] text-gray-500 font-semibold justify-center">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-0.5" style={{ backgroundColor: modelA?.color }} />
                  Custo acumulado Modelo A
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-0.5 border-t border-dashed" style={{ borderColor: modelB?.color }} />
                  Custo acumulado B + Custo Migração
                </span>
              </div>
            </div>
          )}

          {/* Business Insights Bottom Cards */}
          <div className="grid md:grid-cols-3 gap-3">
            <div className="bg-gray-950 border border-gray-800 p-4 rounded-xl flex items-start gap-3">
              <Trophy className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <h5 className="text-xs font-bold text-gray-300">Economia Anual Projetada</h5>
                <p className="text-lg font-bold text-emerald-400 mt-1 tabular-nums">
                  {result.savingPerLead > 0 ? "+" : ""}
                  {formatMoney(result.annualSaving, currency, usdToBrl, 2)}
                </p>
                <p className="text-[9px] text-gray-500 mt-0.5 leading-normal">
                  Considerando volume ativo de {formatNumber(params.leads)} leads/{periodLabel(params.period)} nos próximos 12 meses.
                </p>
              </div>
            </div>

            <div className="bg-gray-950 border border-gray-800 p-4 rounded-xl flex items-start gap-3">
              <Calendar className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <div>
                <h5 className="text-xs font-bold text-gray-300">Retorno do Investimento (Payback)</h5>
                <p className="text-lg font-bold text-gray-100 mt-1 tabular-nums">
                  {result.breakEvenMonths === Infinity ? "Nunca" : `${result.breakEvenMonths.toFixed(1)} meses`}
                </p>
                <p className="text-[9px] text-gray-500 mt-0.5 leading-normal">
                  Prazo de tempo necessário para que a economia de faturamento com B amortize o investimento de {formatMoney(migrationCost, currency, usdToBrl, 2)}.
                </p>
              </div>
            </div>

            <div className="bg-gray-950 border border-gray-800 p-4 rounded-xl flex items-start gap-3">
              <Sparkles className="h-5 w-5 text-purple-500 mt-0.5 shrink-0" />
              <div>
                <h5 className="text-xs font-bold text-gray-300">Diferença Percentual</h5>
                <p className="text-lg font-bold text-purple-400 mt-1">
                  {modelA && modelB
                    ? `${(((modelA.inputPricePer1M - modelB.inputPricePer1M) / modelA.inputPricePer1M) * 100).toFixed(0)}%`
                    : "—"}
                </p>
                <p className="text-[9px] text-gray-500 mt-0.5 leading-normal">
                  Redução percentual de preço do token de entrada (Input) de A para B.
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
