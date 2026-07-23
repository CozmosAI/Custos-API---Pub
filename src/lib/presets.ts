import { OperationalParams } from "./operational";

export interface SDRPreset {
  id: string;
  name: string;
  description: string;
  modelId: string;
  inputPricePer1M: number;
  outputPricePer1M: number;
  leadsPorDia: number;
  diasNoMes: number;
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
  followDays: number;
  followIaDays: number;
  followMessagesPerDay: number;
  followSystemChars: number;
  followFracionaChars: number;
  followHistoryChars: number;
  followOutputChars: number;
  repeatedMessageRate: number;
  followRate: number;
  usdToBrl: number;
  iofRate: number;
  safetyMarginEnabled: boolean;
  safetyMargin: number;
}

export const REAL_RESGATA_PRESET: SDRPreset = {
  id: "preset-real-resgata",
  name: "Cenário Real Resgata (20 leads/dia)",
  description: "Parâmetros fiéis extraídos do fluxo n8n Resgata Uniagent SDR v9.1 e Follow v4",
  modelId: "gemini-3-5-flash-lite",
  inputPricePer1M: 0.30,
  outputPricePer1M: 2.50,
  leadsPorDia: 20,
  diasNoMes: 30,
  sdrMessagesPerLead: 15,
  sdrSystemChars: 37727,
  sdrFunctionDeclsChars: 3500,
  sdrHistoryChars: 10000,
  sdrOutputChars: 1500,
  sdrFracionaChars: 4363,
  sdrHandoffChars: 1618,
  sdrToolLoopFactor: 3.0,
  audioMessageRate: 0.20,
  handoffRate: 0.05,
  fallbackRate: 0.02,
  followDays: 14,
  followIaDays: 1,
  followMessagesPerDay: 1,
  followSystemChars: 27212,
  followFracionaChars: 733,
  followHistoryChars: 9000,
  followOutputChars: 400,
  repeatedMessageRate: 0.20,
  followRate: 0.60,
  usdToBrl: 5.09,
  iofRate: 0.0918,
  safetyMarginEnabled: true,
  safetyMargin: 0.30,
};

export const PLANNER_RESGATA_COMPLETO: OperationalParams = {
  items: [
    { id: "vps", label: "🖥️ VPS (hospeda n8n)", category: "infra", enabled: true, monthlyValue: 149.99 },
    { id: "supabase", label: "🗄️ Supabase (banco)", category: "infra", enabled: true, monthlyValue: 127.75 },
    { id: "uazapi", label: "💬 Uazapi (WhatsApp API)", category: "infra", enabled: true, monthlyValue: 38 },
    { id: "redis", label: "⚡ Redis (cache n8n)", category: "infra", enabled: true, monthlyValue: 51.10 },
    { id: "crm_monthly", label: "📊 CRM (Mensal)", category: "infra", enabled: true, monthlyValue: 150.00 },
    { id: "maintenance", label: "🔧 Manutenção mensal", category: "labor", enabled: true, monthlyValue: 800 },
    { id: "flowbuild", label: "🚧 Montagem dos fluxos (one-time)", category: "setup", enabled: true, monthlyValue: 0, oneTimeValue: 3200 },
    { id: "crm_setup", label: "🏗️ Criação e Setup do CRM (one-time)", category: "setup", enabled: true, monthlyValue: 0, oneTimeValue: 1500 },
  ],
  clientMarkupEnabled: true,
  clientMarkup: 0.30,
  setupInstallments: 3,
  setupDownPaymentPercent: 50,
};

