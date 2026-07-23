// Motor de cálculo de custo de IA por lead/conversa
// Modelo: tokens acumulados (histórico cresce a cada mensagem)

export type Period = "day" | "week" | "month";

export interface SimulationParams {
  // ---- Negócio ----
  leads: number;
  period: Period;
  firstContactMessages: number; // mensagens por lead no primeiro contato
  followUpDays: number;
  followUpMessagesPerDay: number;
  apiCallsPerMessage: number; // chamadas API por mensagem visível
  // ---- Conversa ----
  systemPromptChars: number; // ex: 40000
  systemPromptText: string; // texto real do prompt (opcional)
  avgUserMessageChars: number; // msg do lead
  avgResponseChars: number; // resposta da IA
  charsPerToken: number; // ex: 3.5 para PT, 4 para EN
  // ---- Preço ----
  inputPricePer1M: number; // USD por 1M tokens input
  outputPricePer1M: number; // USD por 1M tokens output
  cacheDiscount: number; // 0 a 0.95 — fração de desconto em tokens repetidos
  useCache: boolean; // considerar cache de prompt
  // ---- Escala ----
  maxLeadsToSimulate: number;
  // ---- Orçamento ----
  monthlyBudget: number; // USD
  // ---- Throughput (limite operacional real) ----
  maxLeadsPerDay: number; // teto de leads/dia (capacidade do time/SDR). 0 = sem limite
}

export interface MessageBreakdown {
  index: number;
  inputTokens: number;
  cachedTokens: number;
  freshTokens: number;
  outputTokens: number;
  cost: number;
  costWithoutCache: number;
  cumulativeCost: number;
}

export interface ConversationResult {
  messagesPerLead: number;
  totalInputTokens: number;
  totalCachedTokens: number;
  totalFreshTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCost: number;
  totalCostWithoutCache: number;
  costPerMessage: number;
  cacheSavings: number;
  cacheSavingsPct: number;
  messageBreakdown: MessageBreakdown[];
}

export interface ScalingPoint {
  leads: number;
  cost: number;
  messages: number;
  costPerLead: number;
  withinBudget: boolean;
}

export interface SimulationResult {
  // Por lead
  perMessage: number;
  perLead: number;
  messagesPerLead: number;
  conversation: ConversationResult;
  // No período (considerando 'period' multiplicador para mês)
  periodLeads: number;
  periodMessages: number;
  periodInputTokens: number;
  periodOutputTokens: number;
  periodCost: number;
  monthlyEquivalentCost: number;
  monthlyCacheSavings: number;
  // Escala
  scalingSeries: ScalingPoint[];
  maxLeadsInBudget: number;
  costIncrementalPerLead: number; // custo marginal de 1 lead a mais
  // Comparação rápida de raw
  inputPricePer1M: number;
  outputPricePer1M: number;
  cacheDiscount: number;
  useCache: boolean;
  // Novas métricas de chamadas API
  apiCallsPerLead: number;
  periodApiCalls: number;
  monthlyEquivalentApiCalls: number;
}

// Quantos períodos cabem num mês (para calcular custo mensal equivalente)
export function periodsPerMonth(period: Period): number {
  switch (period) {
    case "day":
      return 30;
    case "week":
      return 4.33;
    case "month":
      return 1;
  }
}

// Custo de uma conversa completa (1 lead) com histórico acumulado
// Modela prompt caching: tokens repetidos (prompt do sistema + histórico já visto)
// recebem desconto. A mensagem atual do lead é sempre "fresca" (preço cheio).
export function calculateConversation(params: SimulationParams): ConversationResult {
  const messagesPerLead =
    params.firstContactMessages +
    params.followUpDays * params.followUpMessagesPerDay;

  const useCache = params.useCache && params.cacheDiscount > 0;
  const discount = useCache ? params.cacheDiscount : 0;

  let totalInputTokens = 0;
  let totalCachedTokens = 0;
  let totalFreshTokens = 0;
  let totalOutputTokens = 0;
  let cumulativeCost = 0;
  let cumulativeCostWithoutCache = 0;
  const messageBreakdown: MessageBreakdown[] = [];

  const K = Math.max(1, params.apiCallsPerMessage || 1);

  for (let i = 0; i < messagesPerLead; i++) {
    // histórico anterior = i mensagens (cada uma com user msg + resposta)
    const previousChars = i * (params.avgUserMessageChars + params.avgResponseChars);

    let msgInputTokens = 0;
    let msgCachedTokens = 0;
    let msgFreshTokens = 0;
    let msgOutputTokens = 0;
    let msgCost = 0;
    let msgCostWithoutCache = 0;

    for (let k = 1; k <= K; k++) {
      // 1ª chamada API: prompt de sistema + histórico + mensagem do lead
      // Demais chamadas API: prompt de sistema + histórico + mensagem do lead + resposta IA
      const cachedChars = params.systemPromptChars + previousChars;
      const freshChars = k === 1 
        ? params.avgUserMessageChars 
        : params.avgUserMessageChars + params.avgResponseChars;
      const outputChars = params.avgResponseChars;

      const cachedTokens = Math.ceil(cachedChars / params.charsPerToken);
      const freshTokens = Math.ceil(freshChars / params.charsPerToken);
      const inputTokens = cachedTokens + freshTokens;
      const outputTokens = Math.ceil(outputChars / params.charsPerToken);

      // Preço efetivo do input: tokens em cache pagam (1 - discount), frescos pagam cheio
      const effectiveInputPrice =
        (cachedTokens * params.inputPricePer1M * (1 - discount) +
          freshTokens * params.inputPricePer1M) /
        1_000_000;
      const inputCost = effectiveInputPrice;
      const inputCostWithoutCache = (inputTokens / 1_000_000) * params.inputPricePer1M;
      const outputCost = (outputTokens / 1_000_000) * params.outputPricePer1M;
      
      const cost = inputCost + outputCost;
      const costWithoutCache = inputCostWithoutCache + outputCost;

      msgInputTokens += inputTokens;
      msgCachedTokens += cachedTokens;
      msgFreshTokens += freshTokens;
      msgOutputTokens += outputTokens;
      msgCost += cost;
      msgCostWithoutCache += costWithoutCache;
    }

    totalInputTokens += msgInputTokens;
    totalCachedTokens += msgCachedTokens;
    totalFreshTokens += msgFreshTokens;
    totalOutputTokens += msgOutputTokens;
    cumulativeCost += msgCost;
    cumulativeCostWithoutCache += msgCostWithoutCache;

    messageBreakdown.push({
      index: i + 1,
      inputTokens: msgInputTokens,
      cachedTokens: msgCachedTokens,
      freshTokens: msgFreshTokens,
      outputTokens: msgOutputTokens,
      cost: msgCost,
      costWithoutCache: msgCostWithoutCache,
      cumulativeCost,
    });
  }

  const totalCost = cumulativeCost;
  const totalCostWithoutCache = cumulativeCostWithoutCache;
  const cacheSavings = totalCostWithoutCache - totalCost;
  const cacheSavingsPct =
    totalCostWithoutCache > 0 ? (cacheSavings / totalCostWithoutCache) * 100 : 0;

  return {
    messagesPerLead,
    totalInputTokens,
    totalCachedTokens,
    totalFreshTokens,
    totalOutputTokens,
    totalTokens: totalInputTokens + totalOutputTokens,
    totalCost,
    totalCostWithoutCache,
    costPerMessage: messagesPerLead > 0 ? totalCost / messagesPerLead : 0,
    cacheSavings,
    cacheSavingsPct,
    messageBreakdown,
  };
}

export function simulate(params: SimulationParams): SimulationResult {
  const convo = calculateConversation(params);
  const perLead = convo.totalCost;
  const perMessage = convo.costPerMessage;

  const K = Math.max(1, params.apiCallsPerMessage || 1);
  const apiCallsPerLead = convo.messagesPerLead * K;

  // período → mês
  const ppm = periodsPerMonth(params.period);
  const periodCost = params.leads * perLead;
  const monthlyEquivalentCost = periodCost * ppm;

  const periodApiCalls = params.leads * apiCallsPerLead;
  const monthlyEquivalentApiCalls = periodApiCalls * ppm;

  // série de escala
  const scalingSeries: ScalingPoint[] = [];
  const maxLeads = Math.max(params.maxLeadsToSimulate, params.leads, 1);
  const stepSize = Math.max(1, Math.ceil(maxLeads / 25));
  for (let l = 1; l <= maxLeads; l += stepSize) {
    const cost = l * perLead * ppm;
    scalingSeries.push({
      leads: l,
      cost,
      messages: l * convo.messagesPerLead * ppm,
      costPerLead: perLead,
      withinBudget: params.monthlyBudget > 0 ? cost <= params.monthlyBudget : true,
    });
  }
  // garantir que o último ponto esteja presente
  if (scalingSeries[scalingSeries.length - 1]?.leads !== maxLeads) {
    const cost = maxLeads * perLead * ppm;
    scalingSeries.push({
      leads: maxLeads,
      cost,
      messages: maxLeads * convo.messagesPerLead * ppm,
      costPerLead: perLead,
      withinBudget: params.monthlyBudget > 0 ? cost <= params.monthlyBudget : true,
    });
  }

  const maxLeadsInBudget =
    params.monthlyBudget > 0 && perLead > 0
      ? Math.floor((params.monthlyBudget / ppm) / perLead)
      : 0;

  return {
    perMessage,
    perLead,
    messagesPerLead: convo.messagesPerLead,
    conversation: convo,
    periodLeads: params.leads,
    periodMessages: params.leads * convo.messagesPerLead,
    periodInputTokens: params.leads * convo.totalInputTokens,
    periodOutputTokens: params.leads * convo.totalOutputTokens,
    periodCost,
    monthlyEquivalentCost,
    monthlyCacheSavings: convo.cacheSavings * params.leads * ppm,
    scalingSeries,
    maxLeadsInBudget,
    costIncrementalPerLead: perLead,
    inputPricePer1M: params.inputPricePer1M,
    outputPricePer1M: params.outputPricePer1M,
    cacheDiscount: params.cacheDiscount,
    useCache: params.useCache,
    apiCallsPerLead,
    periodApiCalls,
    monthlyEquivalentApiCalls,
  };
}

// Cenários padrão úteis
export const DEFAULT_PARAMS: SimulationParams = {
  leads: 16,
  period: "month",
  firstContactMessages: 10,
  followUpDays: 14,
  followUpMessagesPerDay: 1,
  apiCallsPerMessage: 2,
  systemPromptChars: 37728,
  systemPromptText: "",
  avgUserMessageChars: 500,
  avgResponseChars: 800,
  charsPerToken: 3.5,
  inputPricePer1M: 0.10,
  outputPricePer1M: 0.40,
  cacheDiscount: 0.75,
  useCache: true,
  maxLeadsToSimulate: 100,
  monthlyBudget: 0,
  maxLeadsPerDay: 0,
};

// Presets de cenário
export interface ScenarioPreset {
  id: string;
  name: string;
  description: string;
  emoji: string;
  patch: Partial<SimulationParams>;
}

export const SCENARIO_PRESETS: ScenarioPreset[] = [
  {
    id: "sdr-inbound",
    name: "SDR Inbound",
    description: "Lead quente que solicitou contato — conversa curta e direta",
    emoji: "🔥",
    patch: {
      leads: 30,
      period: "month",
      firstContactMessages: 4,
      followUpDays: 3,
      followUpMessagesPerDay: 1,
      avgUserMessageChars: 600,
      avgResponseChars: 700,
    },
  },
  {
    id: "sdr-outbound-cold",
    name: "SDR Outbound Cold",
    description: "Prospecto frio — precisa de mais tentativas de follow-up",
    emoji: "❄️",
    patch: {
      leads: 50,
      period: "month",
      firstContactMessages: 2,
      followUpDays: 8,
      followUpMessagesPerDay: 1,
      avgUserMessageChars: 400,
      avgResponseChars: 900,
    },
  },
  {
    id: "suporte-n1",
    name: "Suporte Nível 1",
    description: "Triagem e FAQ rápido — respostas curtas e resolução rápida",
    emoji: "🎧",
    patch: {
      leads: 100,
      period: "month",
      firstContactMessages: 3,
      followUpDays: 1,
      followUpMessagesPerDay: 1,
      avgUserMessageChars: 800,
      avgResponseChars: 500,
    },
  },
  {
    id: "suporte-n2",
    name: "Suporte Nível 2",
    description: "Casos complexos — histórico longo e muitas mensagens",
    emoji: "🛠️",
    patch: {
      leads: 40,
      period: "month",
      firstContactMessages: 6,
      followUpDays: 4,
      followUpMessagesPerDay: 2,
      avgUserMessageChars: 1000,
      avgResponseChars: 1200,
    },
  },
];

// Otimizador
export interface OptimizerModelInput {
  id: string;
  providerName: string;
  modelName: string;
  color: string | null;
  inputPricePer1M: number;
  outputPricePer1M: number;
  cacheDiscount: number;
  contextWindow: number | null;
  modality: string;
}

export interface OptimizerResult {
  id: string;
  providerName: string;
  modelName: string;
  color: string | null;
  inputPricePer1M: number;
  outputPricePer1M: number;
  cacheDiscount: number;
  contextWindow: number | null;
  modality: string;
  costPerLead: number;
  costPerMessage: number;
  maxLeadsInBudget: number;
  monthlyCostAtMax: number;
  totalMessagesAtMax: number;
  totalTokensAtMax: number;
  fitsBudget: boolean;
  promptExceedsContext: boolean;
  cappedByThroughput: boolean;
  uncappedLeadsInBudget: number;
}

export interface OptimizeOutput {
  budget: number;
  results: OptimizerResult[];
  best: OptimizerResult | null;
  throughputCapPerMonth: number;
  conversationParams: Pick<
    SimulationParams,
    | "firstContactMessages"
    | "followUpDays"
    | "followUpMessagesPerDay"
    | "apiCallsPerMessage"
    | "systemPromptChars"
    | "avgUserMessageChars"
    | "avgResponseChars"
    | "charsPerToken"
    | "useCache"
  >;
}

export function optimizeForBudget(
  baseParams: SimulationParams,
  models: OptimizerModelInput[],
  budget?: number
): OptimizeOutput {
  const monthlyBudget = budget ?? baseParams.monthlyBudget;
  const ppm = periodsPerMonth(baseParams.period);
  const throughputCapPerMonth =
    baseParams.maxLeadsPerDay > 0 ? Math.floor(baseParams.maxLeadsPerDay * 30) : 0;

  const results: OptimizerResult[] = models.map((m) => {
    const params: SimulationParams = {
      ...baseParams,
      inputPricePer1M: m.inputPricePer1M,
      outputPricePer1M: m.outputPricePer1M,
      cacheDiscount: m.cacheDiscount,
      useCache: baseParams.useCache && m.cacheDiscount > 0,
    };
    const convo = calculateConversation(params);
    const costPerLead = convo.totalCost;

    const uncappedLeadsInBudget =
      monthlyBudget > 0 && costPerLead > 0
        ? Math.floor(monthlyBudget / (costPerLead * ppm))
        : monthlyBudget > 0
        ? 999999
        : 0;

    const maxLeadsInBudget =
      throughputCapPerMonth > 0
        ? Math.min(uncappedLeadsInBudget, throughputCapPerMonth)
        : uncappedLeadsInBudget;
    const cappedByThroughput =
      throughputCapPerMonth > 0 && uncappedLeadsInBudget > throughputCapPerMonth;

    const monthlyCostAtMax = maxLeadsInBudget * costPerLead * ppm;
    const messagesPerLead = convo.messagesPerLead;

    const promptTokens = Math.ceil(baseParams.systemPromptChars / baseParams.charsPerToken);
    const promptExceedsContext = m.contextWindow !== null && promptTokens > m.contextWindow;

    return {
      id: m.id,
      providerName: m.providerName,
      modelName: m.modelName,
      color: m.color,
      inputPricePer1M: m.inputPricePer1M,
      outputPricePer1M: m.outputPricePer1M,
      cacheDiscount: m.cacheDiscount,
      contextWindow: m.contextWindow,
      modality: m.modality,
      costPerLead,
      costPerMessage: convo.costPerMessage,
      maxLeadsInBudget,
      monthlyCostAtMax,
      totalMessagesAtMax: maxLeadsInBudget * messagesPerLead,
      totalTokensAtMax: maxLeadsInBudget * convo.totalTokens,
      fitsBudget: maxLeadsInBudget > 0,
      promptExceedsContext,
      cappedByThroughput,
      uncappedLeadsInBudget,
    };
  });

  results.sort((a, b) => {
    if (b.maxLeadsInBudget !== a.maxLeadsInBudget) {
      return b.maxLeadsInBudget - a.maxLeadsInBudget;
    }
    return a.costPerLead - b.costPerLead;
  });

  return {
    budget: monthlyBudget,
    results,
    best: results[0] ?? null,
    throughputCapPerMonth,
    conversationParams: {
      firstContactMessages: baseParams.firstContactMessages,
      followUpDays: baseParams.followUpDays,
      followUpMessagesPerDay: baseParams.followUpMessagesPerDay,
      apiCallsPerMessage: baseParams.apiCallsPerMessage,
      systemPromptChars: baseParams.systemPromptChars,
      avgUserMessageChars: baseParams.avgUserMessageChars,
      avgResponseChars: baseParams.avgResponseChars,
      charsPerToken: baseParams.charsPerToken,
      useCache: baseParams.useCache,
    },
  };
}

// Análise de sensibilidade
export interface SensitivityPoint {
  budget: number;
  bestModelId: string;
  bestModelName: string;
  bestProviderName: string;
  bestColor: string | null;
  bestLeads: number;
  bestCostPerLead: number;
  top3: { id: string; name: string; leads: number; color: string | null }[];
}

export interface SensitivityOutput {
  points: SensitivityPoint[];
  winners: { id: string; name: string; providerName: string; color: string | null }[];
  switchPoints: { budget: number; from: string; to: string }[];
  budgetMin: number;
  budgetMax: number;
}

export function sensitivityAnalysis(
  baseParams: SimulationParams,
  models: OptimizerModelInput[],
  budgetMin = 5,
  budgetMax = 500,
  steps = 24
): SensitivityOutput {
  const points: SensitivityPoint[] = [];
  const stepSize = (budgetMax - budgetMin) / steps;

  for (let i = 0; i <= steps; i++) {
    const budget = Math.round(budgetMin + stepSize * i);
    const out = optimizeForBudget(baseParams, models, budget);
    const top3 = out.results.slice(0, 3).map((r) => ({
      id: r.id,
      name: `${r.providerName} ${r.modelName}`,
      leads: r.maxLeadsInBudget,
      color: r.color,
    }));
    const best = out.best;
    if (best) {
      points.push({
        budget,
        bestModelId: best.id,
        bestModelName: best.modelName,
        bestProviderName: best.providerName,
        bestColor: best.color,
        bestLeads: best.maxLeadsInBudget,
        bestCostPerLead: best.costPerLead,
        top3,
      });
    }
  }

  const winnersMap = new Map<string, { id: string; name: string; providerName: string; color: string | null }>();
  for (const p of points) {
    if (!winnersMap.has(p.bestModelId)) {
      winnersMap.set(p.bestModelId, {
        id: p.bestModelId,
        name: p.bestModelName,
        providerName: p.bestProviderName,
        color: p.bestColor,
      });
    }
  }

  const switchPoints: { budget: number; from: string; to: string }[] = [];
  for (let i = 1; i < points.length; i++) {
    if (points[i].bestModelId !== points[i - 1].bestModelId) {
      switchPoints.push({
        budget: points[i].budget,
        from: points[i - 1].bestModelName,
        to: points[i].bestModelName,
      });
    }
  }

  return {
    points,
    winners: [...winnersMap.values()],
    switchPoints,
    budgetMin,
    budgetMax,
  };
}

// Análise de Break-even
export interface BreakEvenInput {
  modelA: {
    id: string;
    name: string;
    providerName: string;
    color: string | null;
    inputPricePer1M: number;
    outputPricePer1M: number;
    cacheDiscount: number;
  };
  modelB: {
    id: string;
    name: string;
    providerName: string;
    color: string | null;
    inputPricePer1M: number;
    outputPricePer1M: number;
    cacheDiscount: number;
  };
  baseParams: SimulationParams;
  migrationCost: number; // USD
}

export interface BreakEvenResult {
  costPerLeadA: number;
  costPerLeadB: number;
  savingPerLead: number;
  breakEvenLeads: number;
  breakEvenMonths: number;
  series: { leads: number; costA: number; costBWithMigration: number; costB: number }[];
  recommendation:
    | { type: "migrate"; reason: string }
    | { type: "stay"; reason: string }
    | { type: "neutral"; reason: string };
  annualSaving: number;
  bIsMoreExpensive: boolean;
}

export function breakEvenAnalysis(input: BreakEvenInput): BreakEvenResult {
  const { modelA, modelB, baseParams, migrationCost } = input;
  const ppm = periodsPerMonth(baseParams.period);

  const paramsA: SimulationParams = {
    ...baseParams,
    inputPricePer1M: modelA.inputPricePer1M,
    outputPricePer1M: modelA.outputPricePer1M,
    cacheDiscount: modelA.cacheDiscount,
    useCache: baseParams.useCache && modelA.cacheDiscount > 0,
  };
  const costPerLeadA = calculateConversation(paramsA).totalCost;

  const paramsB: SimulationParams = {
    ...baseParams,
    inputPricePer1M: modelB.inputPricePer1M,
    outputPricePer1M: modelB.outputPricePer1M,
    cacheDiscount: modelB.cacheDiscount,
    useCache: baseParams.useCache && modelB.cacheDiscount > 0,
  };
  const costPerLeadB = calculateConversation(paramsB).totalCost;

  const savingPerLead = costPerLeadA - costPerLeadB;
  const bIsMoreExpensive = savingPerLead < 0;

  const breakEvenLeads =
    savingPerLead > 0 ? Math.ceil(migrationCost / savingPerLead) : Infinity;
  const breakEvenMonths =
    savingPerLead > 0 && baseParams.leads > 0
      ? breakEvenLeads / (baseParams.leads * ppm)
      : 0;

  const maxLeads = Math.max(
    baseParams.maxLeadsToSimulate,
    baseParams.leads,
    breakEvenLeads === Infinity ? 100 : breakEvenLeads * 2,
    100
  );
  const series: BreakEvenResult["series"] = [];
  const step = Math.max(1, Math.ceil(maxLeads / 30));
  for (let l = 0; l <= maxLeads; l += step) {
    series.push({
      leads: l,
      costA: l * costPerLeadA * ppm,
      costBWithMigration: l * costPerLeadB * ppm + migrationCost,
      costB: l * costPerLeadB * ppm,
    });
  }

  if (series[series.length - 1]?.leads !== maxLeads) {
    series.push({
      leads: maxLeads,
      costA: maxLeads * costPerLeadA * ppm,
      costBWithMigration: maxLeads * costPerLeadB * ppm + migrationCost,
      costB: maxLeads * costPerLeadB * ppm,
    });
  }

  const annualSaving = baseParams.leads > 0 ? baseParams.leads * ppm * 12 * savingPerLead : 0;

  let recommendation: BreakEvenResult["recommendation"];
  if (bIsMoreExpensive) {
    recommendation = {
      type: "stay",
      reason: `B é mais caro que A por lead. Não migrar.`,
    };
  } else if (savingPerLead === 0) {
    recommendation = {
      type: "neutral",
      reason: "Custo por lead idêntico. A decisão é por qualidade, não preço.",
    };
  } else if (breakEvenLeads === Infinity || breakEvenMonths > 24) {
    recommendation = {
      type: "stay",
      reason: `Break-even em ${breakEvenLeads === Infinity ? "∞" : breakEvenMonths.toFixed(1) + " meses"} — muito longo. Economia por lead não cobre a migração em prazo razoável.`,
    };
  } else if (breakEvenMonths <= 3) {
    recommendation = {
      type: "migrate",
      reason: `Break-even em ${breakEvenMonths.toFixed(1)} meses (${breakEvenLeads.toLocaleString()} leads). Migração se paga rápido — vale muito a pena!`,
    };
  } else {
    recommendation = {
      type: "migrate",
      reason: `Break-even em ${breakEvenMonths.toFixed(1)} meses (${breakEvenLeads.toLocaleString()} leads). Economia anual de $${annualSaving.toFixed(2)}.`,
    };
  }

  return {
    costPerLeadA,
    costPerLeadB,
    savingPerLead,
    breakEvenLeads,
    breakEvenMonths,
    series,
    recommendation,
    annualSaving,
    bIsMoreExpensive,
  };
}
