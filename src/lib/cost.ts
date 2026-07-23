// Motor de cálculo de custo de IA por lead/conversa (SDR + Follow-Up)
// Fonte Única de Verdade de Cálculo

import { SDRPreset, REAL_RESGATA_PRESET } from "./presets";

export type Period = "day" | "week" | "month";

export interface FlowParams {
  modelId: string;
  inputPricePer1M: number;
  outputPricePer1M: number;
  
  // Volume
  leadsPorDia: number;
  diasNoMes: number;
  
  // SDR
  sdrMessagesPerLead: number;
  sdrSystemChars: number;
  sdrFunctionDeclsChars: number;
  sdrHistoryChars: number;
  sdrOutputChars: number;
  sdrFracionaChars: number;
  sdrHandoffChars: number;
  sdrToolLoopFactor: number;
  audioMessageRate: number;
  handoffRate: number;
  fallbackRate: number;
  
  // Follow
  followRate: number;
  followDays: number;
  followIaDays: number;
  followMessagesPerDay: number;
  followSystemChars: number;
  followFracionaChars: number;
  followHistoryChars: number;
  followOutputChars: number;
  repeatedMessageRate: number;
  
  // Câmbio & Contingência
  usdToBrl: number;
  iofRate: number;
  safetyMarginEnabled: boolean;
  safetyMargin: number;
}

export interface FlowResult {
  effectiveUsdBrl: number;
  
  // Tokens por Chamada
  sdrAgentInputTokens: number;
  sdrAgentOutputTokens: number;
  sdrFracionaInputTokens: number;
  sdrFracionaOutputTokens: number;
  sdrHandoffInputTokens: number;
  sdrHandoffOutputTokens: number;
  
  followAgentInputTokens: number;
  followAgentOutputTokens: number;
  followFracionaInputTokens: number;
  followFracionaOutputTokens: number;

  // Custos unitários Base (USD e BRL)
  sdrMessageCostUsdBase: number;
  sdrMessageCostBrlBase: number;
  
  sdrHandoffCostUsdBase: number;
  sdrHandoffCostBrlBase: number;
  
  sdrLeadCostUsdBase: number;
  sdrLeadCostBrlBase: number;
  
  followMessageCostUsdBase: number;
  followMessageCostBrlBase: number;
  
  followLeadCostUsdBase: number;
  followLeadCostBrlBase: number;

  totalLeadCostUsdBase: number;
  totalLeadCostBrlBase: number;

  // Totais Mensais Base
  totalLeadsPerMonth: number;
  sdrMonthlyCostBrlBase: number;
  followMonthlyCostBrlBase: number;
  totalMonthlyCostBrlBase: number;

  // Totais Mensais Com Margem de Segurança
  safetyMarginMultiplier: number;
  followIaMsgsPerLead: number;
  sdrMessageCostBrlWithMargin: number;
  sdrLeadCostBrlWithMargin: number;
  followMessageCostBrlWithMargin: number;
  followLeadCostBrlWithMargin: number;
  totalLeadCostBrlWithMargin: number;
  
  sdrMonthlyCostBrlWithMargin: number;
  followMonthlyCostBrlWithMargin: number;
  totalMonthlyCostBrlWithMargin: number;
}

export function presetToFlowParams(preset: SDRPreset): FlowParams {
  return {
    modelId: preset.modelId,
    inputPricePer1M: preset.inputPricePer1M,
    outputPricePer1M: preset.outputPricePer1M,
    leadsPorDia: preset.leadsPorDia,
    diasNoMes: preset.diasNoMes,
    sdrMessagesPerLead: preset.sdrMessagesPerLead,
    sdrSystemChars: preset.sdrSystemChars,
    sdrFunctionDeclsChars: preset.sdrFunctionDeclsChars,
    sdrHistoryChars: preset.sdrHistoryChars,
    sdrOutputChars: preset.sdrOutputChars,
    sdrFracionaChars: preset.sdrFracionaChars,
    sdrHandoffChars: preset.sdrHandoffChars,
    sdrToolLoopFactor: preset.sdrToolLoopFactor,
    audioMessageRate: preset.audioMessageRate,
    handoffRate: preset.handoffRate,
    fallbackRate: preset.fallbackRate,
    followRate: preset.followRate,
    followDays: preset.followDays,
    followIaDays: preset.followIaDays,
    followMessagesPerDay: preset.followMessagesPerDay,
    followSystemChars: preset.followSystemChars,
    followFracionaChars: preset.followFracionaChars,
    followHistoryChars: preset.followHistoryChars,
    followOutputChars: preset.followOutputChars,
    repeatedMessageRate: preset.repeatedMessageRate,
    usdToBrl: preset.usdToBrl,
    iofRate: preset.iofRate,
    safetyMarginEnabled: preset.safetyMarginEnabled,
    safetyMargin: preset.safetyMargin,
  };
}

export function calculateSdrAndFollow(params: FlowParams): FlowResult {
  const charsPerToken = 4;
  const effectiveUsdBrl = params.usdToBrl * (1 + params.iofRate);
  
  // 1. Agente SDR principal (por mensagem)
  const sdrAgentInputTokens = Math.ceil((params.sdrSystemChars + params.sdrFunctionDeclsChars + params.sdrHistoryChars) / charsPerToken);
  const sdrAgentOutputTokens = Math.ceil(params.sdrOutputChars / charsPerToken);
  const sdrAgentCallUsd = ((sdrAgentInputTokens * params.inputPricePer1M) + (sdrAgentOutputTokens * params.outputPricePer1M)) / 1_000_000;
  const sdrAgentWeightedUsd = sdrAgentCallUsd * Math.max(1, params.sdrToolLoopFactor);

  // 2. Fraciona SDR (sempre 1x)
  const sdrFracionaInputTokens = Math.ceil((params.sdrFracionaChars + params.sdrOutputChars) / charsPerToken);
  const sdrFracionaOutputTokens = Math.ceil(200 / charsPerToken);
  const sdrFracionaCallUsd = ((sdrFracionaInputTokens * params.inputPricePer1M) + (sdrFracionaOutputTokens * params.outputPricePer1M)) / 1_000_000;

  // 3. Transcrição de Áudio (Whisper)
  const whisperMinCostUsd = 0.006;
  const avgAudioMinutes = 0.5; // 30s
  const audioCostUsdWeighted = (params.audioMessageRate || 0) * (avgAudioMinutes * whisperMinCostUsd);

  // 4. Fallback OpenAI gpt-4.1-mini
  const openAiInputPrice = 0.40;
  const openAiOutputPrice = 1.60;
  const fallbackCallUsd = ((sdrAgentInputTokens * openAiInputPrice) + (sdrAgentOutputTokens * openAiOutputPrice)) / 1_000_000;
  const fallbackWeightedUsd = (params.fallbackRate || 0) * fallbackCallUsd;

  // Custo base por mensagem SDR
  const sdrMessageCostUsdBase = sdrAgentWeightedUsd + sdrFracionaCallUsd + audioCostUsdWeighted + fallbackWeightedUsd;
  const sdrMessageCostBrlBase = sdrMessageCostUsdBase * effectiveUsdBrl;

  // 5. Resumo Handoff SDR (por LEAD)
  const sdrHandoffInputTokens = Math.ceil((params.sdrHandoffChars + params.sdrHistoryChars) / charsPerToken);
  const sdrHandoffOutputTokens = Math.ceil(500 / charsPerToken);
  const sdrHandoffCallUsd = ((sdrHandoffInputTokens * params.inputPricePer1M) + (sdrHandoffOutputTokens * params.outputPricePer1M)) / 1_000_000;
  const sdrHandoffCostUsdWeightedPerLead = (params.handoffRate || 0) * sdrHandoffCallUsd;

  // Custo base por Lead SDR
  const sdrLeadCostUsdBase = (params.sdrMessagesPerLead * sdrMessageCostUsdBase) + sdrHandoffCostUsdWeightedPerLead;
  const sdrLeadCostBrlBase = sdrLeadCostUsdBase * effectiveUsdBrl;

  // 6. Agente Follow-Up
  const followAgentInputTokens = Math.ceil((params.followSystemChars + params.followHistoryChars) / charsPerToken);
  const followAgentOutputTokens = Math.ceil(params.followOutputChars / charsPerToken);
  const followAgentCallUsd = ((followAgentInputTokens * params.inputPricePer1M) + (followAgentOutputTokens * params.outputPricePer1M)) / 1_000_000;

  // Alternativo Follow (mensagem repetida)
  const followAlternativoWeightedUsd = (params.repeatedMessageRate || 0) * followAgentCallUsd;

  // Fraciona Follow
  const followFracionaInputTokens = Math.ceil((params.followFracionaChars + params.followOutputChars) / charsPerToken);
  const followFracionaOutputTokens = Math.ceil(100 / charsPerToken);
  const followFracionaCallUsd = ((followFracionaInputTokens * params.inputPricePer1M) + (followFracionaOutputTokens * params.outputPricePer1M)) / 1_000_000;

  // Custo por mensagem Follow (Dia de IA)
  const followMessageCostUsdBase = followAgentCallUsd + followAlternativoWeightedUsd + followFracionaCallUsd;
  const followMessageCostBrlBase = followMessageCostUsdBase * effectiveUsdBrl;

  // Custo por Lead Follow (IA apenas nos dias configurados em followIaDays)
  const followIaMsgsPerLead = (params.followRate || 0) * (params.followIaDays || 1) * (params.followMessagesPerDay || 1);
  const followLeadCostUsdBase = followIaMsgsPerLead * followMessageCostUsdBase;
  const followLeadCostBrlBase = followLeadCostUsdBase * effectiveUsdBrl;

  // Custo Total por Lead
  const totalLeadCostUsdBase = sdrLeadCostUsdBase + followLeadCostUsdBase;
  const totalLeadCostBrlBase = totalLeadCostUsdBase * effectiveUsdBrl;

  // Totais Mensais
  const totalLeadsPerMonth = params.leadsPorDia * params.diasNoMes;
  const sdrMonthlyCostBrlBase = totalLeadsPerMonth * sdrLeadCostBrlBase;
  const followMonthlyCostBrlBase = totalLeadsPerMonth * followLeadCostBrlBase;
  const totalMonthlyCostBrlBase = sdrMonthlyCostBrlBase + followMonthlyCostBrlBase;

  // Margem de segurança
  const marginMultiplier = params.safetyMarginEnabled ? (1 + (params.safetyMargin || 0)) : 1;

  return {
    effectiveUsdBrl,
    sdrAgentInputTokens,
    sdrAgentOutputTokens,
    sdrFracionaInputTokens,
    sdrFracionaOutputTokens,
    sdrHandoffInputTokens,
    sdrHandoffOutputTokens,
    followAgentInputTokens,
    followAgentOutputTokens,
    followFracionaInputTokens,
    followFracionaOutputTokens,

    sdrMessageCostUsdBase,
    sdrMessageCostBrlBase,
    sdrHandoffCostUsdBase: sdrHandoffCallUsd,
    sdrHandoffCostBrlBase: sdrHandoffCallUsd * effectiveUsdBrl,
    sdrLeadCostUsdBase,
    sdrLeadCostBrlBase,

    followMessageCostUsdBase,
    followMessageCostBrlBase,
    followLeadCostUsdBase,
    followLeadCostBrlBase,

    totalLeadCostUsdBase,
    totalLeadCostBrlBase,

    totalLeadsPerMonth,
    sdrMonthlyCostBrlBase,
    followMonthlyCostBrlBase,
    totalMonthlyCostBrlBase,

    safetyMarginMultiplier: marginMultiplier,
    followIaMsgsPerLead,
    sdrMessageCostBrlWithMargin: sdrMessageCostBrlBase * marginMultiplier,
    sdrLeadCostBrlWithMargin: sdrLeadCostBrlBase * marginMultiplier,
    followMessageCostBrlWithMargin: followMessageCostBrlBase * marginMultiplier,
    followLeadCostBrlWithMargin: followLeadCostBrlBase * marginMultiplier,
    totalLeadCostBrlWithMargin: totalLeadCostBrlBase * marginMultiplier,

    sdrMonthlyCostBrlWithMargin: sdrMonthlyCostBrlBase * marginMultiplier,
    followMonthlyCostBrlWithMargin: followMonthlyCostBrlBase * marginMultiplier,
    totalMonthlyCostBrlWithMargin: totalMonthlyCostBrlBase * marginMultiplier,
  };
}

// Compatibilidade legada para SimulationParams / simulate
export interface SimulationParams {
  leads: number;
  period: Period;
  firstContactMessages: number;
  followUpDays: number;
  followUpMessagesPerDay: number;
  apiCallsPerMessage: number;
  systemPromptChars: number;
  systemPromptText: string;
  avgUserMessageChars: number;
  avgResponseChars: number;
  charsPerToken: number;
  inputPricePer1M: number;
  outputPricePer1M: number;
  useSafetyMargin: boolean;
  safetyMarginPct: number;
  maxLeadsToSimulate: number;
  monthlyBudget: number;
  maxLeadsPerDay: number;
}

export interface MessageBreakdown {
  index: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  cumulativeCost: number;
}

export interface ConversationResult {
  messagesPerLead: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCost: number;
  costPerMessage: number;
  messageBreakdown: MessageBreakdown[];
}

export interface SimulationResult {
  perMessage: number;
  perLead: number;
  messagesPerLead: number;
  conversation: ConversationResult;
  periodLeads: number;
  periodMessages: number;
  periodInputTokens: number;
  periodOutputTokens: number;
  periodCost: number;
  monthlyEquivalentCost: number;
  scalingSeries: { leads: number; cost: number; messages: number; costPerLead: number; withinBudget: boolean }[];
  maxLeadsInBudget: number;
  costIncrementalPerLead: number;
  inputPricePer1M: number;
  outputPricePer1M: number;
  useSafetyMargin: boolean;
  safetyMarginPct: number;
  apiCallsPerLead: number;
  periodApiCalls: number;
  monthlyEquivalentApiCalls: number;
}

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

export function calculateConversation(params: SimulationParams): ConversationResult {
  const messagesPerLead = params.firstContactMessages + params.followUpDays * params.followUpMessagesPerDay;
  const safetyMultiplier = params.useSafetyMargin && params.safetyMarginPct > 0 ? 1 + params.safetyMarginPct / 100 : 1;

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let cumulativeCost = 0;
  const messageBreakdown: MessageBreakdown[] = [];

  const K = Math.max(1, params.apiCallsPerMessage || 1);

  for (let i = 0; i < messagesPerLead; i++) {
    const previousChars = i * (params.avgUserMessageChars + params.avgResponseChars);

    let msgInputTokens = 0;
    let msgOutputTokens = 0;
    let msgCost = 0;

    for (let k = 1; k <= K; k++) {
      const inputChars = params.systemPromptChars + previousChars + (k === 1 ? params.avgUserMessageChars : params.avgUserMessageChars + params.avgResponseChars);
      const outputChars = params.avgResponseChars;

      const inputTokens = Math.ceil(inputChars / params.charsPerToken);
      const outputTokens = Math.ceil(outputChars / params.charsPerToken);

      const inputCost = (inputTokens / 1_000_000) * params.inputPricePer1M;
      const outputCost = (outputTokens / 1_000_000) * params.outputPricePer1M;

      const rawCost = inputCost + outputCost;
      const cost = rawCost * safetyMultiplier;

      msgInputTokens += inputTokens;
      msgOutputTokens += outputTokens;
      msgCost += cost;
    }

    totalInputTokens += msgInputTokens;
    totalOutputTokens += msgOutputTokens;
    cumulativeCost += msgCost;

    messageBreakdown.push({
      index: i + 1,
      inputTokens: msgInputTokens,
      outputTokens: msgOutputTokens,
      cost: msgCost,
      cumulativeCost,
    });
  }

  return {
    messagesPerLead,
    totalInputTokens,
    totalOutputTokens,
    totalTokens: totalInputTokens + totalOutputTokens,
    totalCost: cumulativeCost,
    costPerMessage: messagesPerLead > 0 ? cumulativeCost / messagesPerLead : 0,
    messageBreakdown,
  };
}

export function simulate(params: SimulationParams): SimulationResult {
  const convo = calculateConversation(params);
  const perLead = convo.totalCost;
  const perMessage = convo.costPerMessage;

  const K = Math.max(1, params.apiCallsPerMessage || 1);
  const apiCallsPerLead = convo.messagesPerLead * K;

  const ppm = periodsPerMonth(params.period);
  const periodCost = params.leads * perLead;
  const monthlyEquivalentCost = periodCost * ppm;

  const periodApiCalls = params.leads * apiCallsPerLead;
  const monthlyEquivalentApiCalls = periodApiCalls * ppm;

  const scalingSeries: { leads: number; cost: number; messages: number; costPerLead: number; withinBudget: boolean }[] = [];
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
    scalingSeries,
    maxLeadsInBudget,
    costIncrementalPerLead: perLead,
    inputPricePer1M: params.inputPricePer1M,
    outputPricePer1M: params.outputPricePer1M,
    useSafetyMargin: params.useSafetyMargin,
    safetyMarginPct: params.safetyMarginPct,
    apiCallsPerLead,
    periodApiCalls,
    monthlyEquivalentApiCalls,
  };
}

export const DEFAULT_PARAMS: SimulationParams = {
  leads: 16,
  period: "month",
  firstContactMessages: 10,
  followUpDays: 14,
  followUpMessagesPerDay: 1,
  apiCallsPerMessage: 1.5,
  systemPromptChars: 37728,
  systemPromptText: "",
  avgUserMessageChars: 500,
  avgResponseChars: 800,
  charsPerToken: 4,
  inputPricePer1M: 0.25,
  outputPricePer1M: 1.50,
  useSafetyMargin: true,
  safetyMarginPct: 30,
  maxLeadsToSimulate: 100,
  monthlyBudget: 0,
  maxLeadsPerDay: 0,
};

export interface OptimizerModelInput {
  id: string;
  providerName: string;
  modelName: string;
  color: string | null;
  inputPricePer1M: number;
  outputPricePer1M: number;
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
}

export function optimizeForBudget(
  baseParams: SimulationParams,
  models: OptimizerModelInput[],
  budget?: number
): OptimizeOutput {
  const monthlyBudget = budget ?? baseParams.monthlyBudget;
  const ppm = periodsPerMonth(baseParams.period);
  const throughputCapPerMonth = baseParams.maxLeadsPerDay > 0 ? Math.floor(baseParams.maxLeadsPerDay * 30) : 0;

  const results: OptimizerResult[] = models.map((m) => {
    const params: SimulationParams = {
      ...baseParams,
      inputPricePer1M: m.inputPricePer1M,
      outputPricePer1M: m.outputPricePer1M,
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
    const cappedByThroughput = throughputCapPerMonth > 0 && uncappedLeadsInBudget > throughputCapPerMonth;

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
  };
}

export function breakEvenAnalysis(input: {
  modelA: { inputPricePer1M: number; outputPricePer1M: number; name?: string; fullName?: string };
  modelB: { inputPricePer1M: number; outputPricePer1M: number; name?: string; fullName?: string };
  baseParams: SimulationParams;
  migrationCost: number;
}) {
  const paramsA = { ...input.baseParams, inputPricePer1M: input.modelA.inputPricePer1M, outputPricePer1M: input.modelA.outputPricePer1M };
  const paramsB = { ...input.baseParams, inputPricePer1M: input.modelB.inputPricePer1M, outputPricePer1M: input.modelB.outputPricePer1M };
  const costPerLeadA = calculateConversation(paramsA).totalCost;
  const costPerLeadB = calculateConversation(paramsB).totalCost;
  const savingPerLead = costPerLeadA - costPerLeadB;
  const monthlySavings = Math.max(0, savingPerLead * input.baseParams.leads * periodsPerMonth(input.baseParams.period));
  const annualSaving = monthlySavings * 12;
  const breakEvenMonths = savingPerLead > 0 ? (input.migrationCost / Math.max(0.0001, monthlySavings)) : Infinity;
  const breakEvenLeads = savingPerLead > 0 ? Math.ceil(input.migrationCost / Math.max(0.0001, savingPerLead)) : Infinity;

  const series = [1, 2, 3, 6, 12, 24].map((m) => ({
    month: m,
    cumA: m * input.baseParams.leads * periodsPerMonth(input.baseParams.period) * costPerLeadA,
    cumB: m * input.baseParams.leads * periodsPerMonth(input.baseParams.period) * costPerLeadB + input.migrationCost,
  }));

  const chartData = [100, 500, 1000, 2500, 5000, 10000].map((leads) => ({
    leads,
    costATotal: leads * costPerLeadA,
    costBTotal: leads * costPerLeadB + input.migrationCost,
  }));

  const recommendation = savingPerLead > 0
    ? { type: "migrate", reason: `A migração se paga em cerca de ${breakEvenMonths.toFixed(1)} meses (${breakEvenLeads} leads).` }
    : savingPerLead < 0
    ? { type: "stay", reason: "O Modelo B possui custo superior ao Modelo A para a sua régua atual." }
    : { type: "equal", reason: "Ambos os modelos possuem custo idêntico nesta simulação." };

  return {
    costA: costPerLeadA,
    costB: costPerLeadB,
    costPerLeadA,
    costPerLeadB,
    savingPerLead,
    savingsPerLead: savingPerLead,
    monthlySavings,
    annualSaving,
    breakEvenLeads,
    breakEvenMonths,
    paybackMonths: breakEvenMonths,
    recommendation,
    chartData,
    series
  };
}

export function sensitivityAnalysis(params: SimulationParams, models: OptimizerModelInput[]) {
  const budgets = [10, 25, 50, 100, 200, 350, 500];
  const points = budgets.map((b) => {
    const opt = optimizeForBudget(params, models, b);
    const top = opt.best;
    return {
      budget: b,
      maxLeads: top ? top.maxLeadsInBudget : 0,
      bestModel: top ? top.modelName : "N/A",
    };
  });
  return { points };
}

export const SCENARIO_PRESETS = [
  {
    id: "resgata",
    emoji: "👑",
    name: "Cenário Real Resgata",
    title: "Cenário Real Resgata (n8n v9.1)",
    description: "SDR + Follow com 37.7k chars e 1 dia de IA",
    patch: {
      leads: 20,
      firstContactMessages: 15,
      followUpDays: 14,
      followUpMessagesPerDay: 1,
      systemPromptChars: 37727,
    }
  },
  {
    id: "econ-sdr",
    emoji: "⚡",
    name: "SDR Ultra Enxuto",
    title: "SDR Ultra Enxuto",
    description: "System prompt reduzido (~10k chars), 8 msgs/lead",
    patch: {
      leads: 20,
      firstContactMessages: 8,
      followUpDays: 14,
      followUpMessagesPerDay: 1,
      systemPromptChars: 10000,
    }
  }
];
