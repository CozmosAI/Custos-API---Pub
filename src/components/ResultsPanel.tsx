import React from "react";
import { useAppContext } from "../lib/store";
import { simulate, periodsPerMonth } from "../lib/cost";
import { formatMoney, formatTokens, formatNumber, periodLabel } from "../lib/format";
import { 
  ResponsiveContainer, 
  ComposedChart, 
  Line, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ReferenceLine 
} from "recharts";
import { 
  MessageSquare, 
  User, 
  Calendar, 
  TrendingUp, 
  AlertTriangle, 
  Zap, 
  Target, 
  Cpu, 
  Download,
  ShieldAlert
} from "lucide-react";

interface ResultsPanelProps {
  onSaveScenario?: () => void;
}

export const ResultsPanel: React.FC<ResultsPanelProps> = () => {
  const { params, currency, usdToBrl, selectedModelLabel, models } = useAppContext();

  // Calcula client-side de forma instantânea
  const result = simulate(params);
  
  // Acha o modelo selecionado para rotular o gráfico
  const activeModel = models.find(m => {
    const [pid, mid] = (selectedModelLabel || "").split("||");
    return m.id === mid;
  });

  const modelLabelText = activeModel ? activeModel.name : "Preços Customizados";

  const ppm = periodsPerMonth(params.period);
  const budgetUsedPct = params.monthlyBudget > 0
    ? Math.min(100, (result.monthlyEquivalentCost / params.monthlyBudget) * 100)
    : 0;

  const overBudget = result.monthlyEquivalentCost > params.monthlyBudget && params.monthlyBudget > 0;

  // Formata os eixos com escala K/M abreviada
  const formatYAxis = (val: number) => {
    const rate = currency === "BRL" ? usdToBrl : 1;
    const converted = val * rate;
    const prefix = currency === "BRL" ? "R$ " : "$";
    if (converted >= 1000) return `${prefix}${(converted / 1000).toFixed(0)}k`;
    return `${prefix}${converted.toFixed(0)}`;
  };

  const formatTooltip = (val: number) => {
    return [formatMoney(val, currency, usdToBrl, 2), "Custo Mensal"];
  };

  // Exportar dados de mensagens para CSV
  const handleExportCSV = () => {
    const rows: string[][] = [
      ["ID Mensagem", "Tokens Entrada", "Tokens Saída", "Custo Mensal por Lead ($)"]
    ];

    result.conversation.messageBreakdown.forEach((m) => {
      rows.push([
        String(m.index),
        String(m.inputTokens),
        String(m.outputTokens),
        m.cost.toFixed(6)
      ]);
    });

    const csvContent = "data:text/csv;charset=utf-8,\ufeff" 
      + rows.map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `custoia_mensagens_${modelLabelText.toLowerCase().replace(/\s+/g, "_")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4">
      {/* 4 KPIs Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* KPI 1: Custo por Mensagem */}
        <div className="bg-gray-950 border border-gray-800 p-4 rounded-xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-gray-400">
            <span className="text-[10px] font-bold uppercase tracking-wider">Custo / Mensagem</span>
            <MessageSquare className="h-4 w-4 opacity-75" />
          </div>
          <div className="mt-2">
            <p className="text-xl font-bold text-gray-100 tabular-nums">
              {formatMoney(result.perMessage, currency, usdToBrl, 2)}
            </p>
            <p className="text-[9px] text-gray-500 font-medium">Média por retorno da IA</p>
          </div>
        </div>

        {/* KPI 2: Custo por Lead */}
        <div className="bg-gray-950 border border-primary/20 bg-primary/5 p-4 rounded-xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-primary-foreground">
            <span className="text-[10px] font-bold uppercase tracking-wider">Custo por Lead</span>
            <User className="h-4 w-4 opacity-75 text-primary" />
          </div>
          <div className="mt-2">
            <p className="text-xl font-bold text-primary-foreground tabular-nums">
              {formatMoney(result.perLead, currency, usdToBrl, 2)}
            </p>
            <p className="text-[9px] text-gray-400 font-medium">
              {result.messagesPerLead} msgs | {result.apiCallsPerLead} chamadas API por lead
            </p>
          </div>
        </div>

        {/* KPI 3: Custo por Período */}
        <div className="bg-gray-950 border border-gray-800 p-4 rounded-xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-gray-400">
            <span className="text-[10px] font-bold uppercase tracking-wider">Custo / {periodLabel(params.period)}</span>
            <Calendar className="h-4 w-4 opacity-75" />
          </div>
          <div className="mt-2">
            <p className="text-xl font-bold text-gray-100 tabular-nums">
              {formatMoney(result.periodCost, currency, usdToBrl, 2)}
            </p>
            <p className="text-[9px] text-gray-500 font-medium">Para {formatNumber(params.leads)} leads atuais</p>
          </div>
        </div>

        {/* KPI 4: Custo Mensal Equivalente */}
        <div className="bg-gray-950 border border-emerald-950 bg-emerald-950/10 p-4 rounded-xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-emerald-400">
            <span className="text-[10px] font-bold uppercase tracking-wider">Gasto Mensal Est.</span>
            <TrendingUp className="h-4 w-4 opacity-75" />
          </div>
          <div className="mt-2">
            <p className="text-xl font-bold text-emerald-400 tabular-nums">
              {formatMoney(result.monthlyEquivalentCost, currency, usdToBrl, 2)}
            </p>
            <p className="text-[9px] text-emerald-500 font-medium">
              {formatNumber(result.monthlyEquivalentApiCalls)} chamadas API / mês
            </p>
          </div>
        </div>
      </div>

      {/* Alerta de Estourou Orçamento */}
      {overBudget && (
        <div className="bg-red-950/20 border border-red-900/50 rounded-xl p-4 text-xs text-red-400 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-red-500" />
          <div className="leading-relaxed">
            <p className="font-bold text-red-300">Aviso: Você excedeu seu limite financeiro mensal!</p>
            <p className="text-gray-400 mt-1">
              Sua projeção de gasto mensal de <strong>{formatMoney(result.monthlyEquivalentCost, currency, usdToBrl, 2)}</strong> ultrapassa o orçamento estipulado de <strong>{formatMoney(params.monthlyBudget, currency, usdToBrl, 2)}</strong>.
              Sua capacidade máxima suportada é de <strong className="text-red-300">{formatNumber(result.maxLeadsInBudget)} leads por mês</strong>.
            </p>
          </div>
        </div>
      )}



      {/* Banner de Margem de Segurança / Contingência */}
      {params.useSafetyMargin && params.safetyMarginPct > 0 && (
        <div className="bg-amber-950/20 border border-amber-900/40 rounded-xl p-4 text-xs text-amber-400 flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 shrink-0 text-amber-400" />
          <div className="leading-relaxed">
            <p className="font-bold text-amber-300">Margem de Erro / Segurança (+{params.safetyMarginPct}%) Ativa</p>
            <p className="text-gray-400 mt-1">
              Os custos calculados acima já incluem um acréscimo de <strong>+{params.safetyMarginPct}%</strong> de margem financeira de contingência para cobrir variações de uso e mensagens atípicas.
            </p>
          </div>
        </div>
      )}

      {/* Gráfico de Escala */}
      <div className="bg-gray-950 border border-gray-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Curva de Escala Financeira</h4>
            <p className="text-[10px] text-gray-500 mt-0.5">Evolução do custo mensal à medida que escala de 1 para {formatNumber(params.maxLeadsToSimulate)} leads</p>
          </div>
          <span className="bg-gray-900 border border-gray-800 text-[10px] text-gray-400 font-semibold px-2 py-0.5 rounded-full">
            {modelLabelText}
          </span>
        </div>

        <div className="h-64 w-full text-xs">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={result.scalingSeries}
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
                formatter={formatTooltip}
              />
              
              {/* Orçamento mensal limitador */}
              {params.monthlyBudget > 0 && (
                <ReferenceLine 
                  y={params.monthlyBudget} 
                  stroke="#ef4444" 
                  strokeDasharray="4 4" 
                  label={{ value: "Orçamento", position: "top", fill: "#ef4444", fontSize: 9, fontWeight: "bold" }} 
                />
              )}

              {/* Volume atual */}
              <ReferenceLine 
                x={params.leads} 
                stroke="var(--color-primary, #6366f1)" 
                strokeDasharray="2 2"
                label={{ value: "Atual", position: "insideTopLeft", fill: "var(--color-primary, #6366f1)", fontSize: 9, fontWeight: "bold" }} 
              />

              <Area 
                type="monotone" 
                dataKey="cost" 
                fill="rgba(99, 102, 241, 0.05)" 
                stroke="var(--color-primary, #6366f1)" 
                strokeWidth={2} 
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tokens & Orçamento Breakdown Side-by-Side */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Consumo de Tokens */}
        <div className="bg-gray-950 border border-gray-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-1.5 pb-1 border-b border-gray-900/60">
            <Cpu className="h-4 w-4 text-purple-500" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Consumo de Tokens & Chamadas</h4>
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-500 font-medium">Tokens de Entrada / Lead:</span>
              <span className="font-bold text-gray-300 tabular-nums">{formatTokens(result.conversation.totalInputTokens)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 font-medium">Tokens de Saída / Lead:</span>
              <span className="font-bold text-gray-300 tabular-nums">{formatTokens(result.conversation.totalOutputTokens)}</span>
            </div>
            <div className="flex justify-between border-t border-gray-900/60 pt-2 font-bold text-gray-200">
              <span>Total por Lead (Conversa):</span>
              <span className="text-primary tabular-nums">{formatTokens(result.conversation.totalTokens)}</span>
            </div>
            <div className="flex justify-between border-t border-gray-900/60 pt-2 text-gray-400 font-medium">
              <span>Chamadas API por Lead:</span>
              <span className="font-bold text-gray-200 tabular-nums">{result.apiCallsPerLead}</span>
            </div>
            <div className="flex justify-between">
              <span>Chamadas API no período:</span>
              <span className="font-bold text-gray-200 tabular-nums">{formatNumber(result.periodApiCalls)}</span>
            </div>
            <div className="flex justify-between">
              <span>Previsão Mensal de Chamadas API:</span>
              <span className="font-bold text-emerald-400 tabular-nums">{formatNumber(result.monthlyEquivalentApiCalls)}</span>
            </div>
            <div className="flex justify-between border-t border-gray-900/60 pt-2">
              <span className="text-gray-500 font-medium">Total de Tokens no período:</span>
              <span className="font-bold text-gray-300 tabular-nums">{formatTokens((result.periodInputTokens + result.periodOutputTokens))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 font-medium">Previsão Mensal de Tokens:</span>
              <span className="font-bold text-emerald-400 tabular-nums">{formatTokens((result.periodInputTokens + result.periodOutputTokens) * ppm)}</span>
            </div>
          </div>
        </div>

        {/* Orçamento & Capacidade */}
        {params.monthlyBudget > 0 && (
          <div className="bg-gray-950 border border-gray-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-1.5 pb-1 border-b border-gray-900/60">
              <Target className="h-4 w-4 text-emerald-500" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Orçamento & Capacidade</h4>
            </div>
            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between text-gray-400">
                <span>Orçamento Mensal Definido:</span>
                <span className="font-bold text-gray-200 tabular-nums">{formatMoney(params.monthlyBudget, currency, usdToBrl, 2)}</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>Projeção de Consumo Mensal:</span>
                <span className={`font-bold tabular-nums ${overBudget ? "text-red-400" : "text-emerald-400"}`}>
                  {formatMoney(result.monthlyEquivalentCost, currency, usdToBrl, 2)}
                </span>
              </div>
              
              {/* Progress bar de orçamento */}
              <div className="space-y-1">
                <div className="h-2 w-full bg-gray-900 border border-gray-800 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all ${overBudget ? "bg-red-500" : "bg-primary"}`}
                    style={{ width: `${budgetUsedPct}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-gray-500 font-bold">
                  <span>{budgetUsedPct.toFixed(0)}% Utilizado</span>
                  <span>{overBudget ? "Excedeu" : `${(100 - budgetUsedPct).toFixed(0)}% Disponível`}</span>
                </div>
              </div>

              <div className="flex justify-between border-t border-gray-900/60 pt-2 font-bold text-gray-200">
                <span>Capacidade Máxima Suportada:</span>
                <span className="text-emerald-400 tabular-nums">{formatNumber(result.maxLeadsInBudget)} leads/mês</span>
              </div>
              <div className="flex justify-between text-[10px] text-gray-500">
                <span>Custo de +1 lead operacional:</span>
                <span className="font-bold text-gray-400 tabular-nums">{formatMoney(result.costIncrementalPerLead, currency, usdToBrl, 2)}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tabela de Mensagens da Conversa */}
      <div className="bg-gray-950 border border-gray-800 rounded-xl p-4">
        <div className="flex items-center justify-between pb-3 border-b border-gray-900/60 mb-3">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Detalhe por Mensagem da Conversa</h4>
            <p className="text-[10px] text-gray-500 mt-0.5">Visão sequencial do acúmulo de contexto a cada interação do SDR por lead</p>
          </div>
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1 bg-gray-900 hover:bg-gray-800 border border-gray-800 text-[10px] text-gray-300 font-bold px-2.5 py-1.5 rounded-lg transition-all"
          >
            <Download className="h-3.5 w-3.5 text-primary" />
            Exportar CSV
          </button>
        </div>

        <div className="overflow-x-auto max-h-64 scrollbar-thin">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400 font-semibold bg-gray-950 sticky top-0 z-10">
                <th className="py-2 px-3 text-center">Interação</th>
                <th className="py-2 px-3">Tokens Entrada</th>
                <th className="py-2 px-3">Tokens Saída</th>
                <th className="py-2 px-3 text-right">Custo Msg</th>
                <th className="py-2 px-3 text-right">Custo Acumulado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-900/40 text-gray-300 font-medium">
              {result.conversation.messageBreakdown.map((m) => {
                return (
                  <tr key={m.index} className="hover:bg-gray-900/20 transition-colors">
                    <td className="py-2.5 px-3 text-center text-gray-500 font-mono">#{m.index}</td>
                    <td className="py-2.5 px-3 tabular-nums">{formatTokens(m.inputTokens)}</td>
                    <td className="py-2.5 px-3 text-sky-400 tabular-nums">{formatTokens(m.outputTokens)}</td>
                    <td className="py-2.5 px-3 text-right font-bold tabular-nums">
                      <span>{formatMoney(m.cost, currency, usdToBrl, 2)}</span>
                    </td>
                    <td className="py-2.5 px-3 text-right text-gray-400 tabular-nums">{formatMoney(m.cumulativeCost, currency, usdToBrl, 2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-gray-500 mt-2.5 leading-normal">
          <strong>Por que os custos aumentam a cada mensagem?</strong> Em automações SDR (ex: n8n), a API é <em>stateless</em>. Para que o robô lembre o que foi conversado nas mensagens anteriores, todo o histórico anterior mais as regras do prompt do sistema precisam ser reenviados juntos em <strong>todas</strong> as requisições subsequentes.
        </p>
      </div>
    </div>
  );
};
