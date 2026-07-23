// Engine de custos operacionais e TCO total
// Isolada de qualquer cálculo de IA

export interface OperationalItem {
  id: string;
  label: string;
  category: "infra" | "labor" | "setup";
  enabled: boolean;       // toggle individual (default true)
  monthlyValue: number;   // R$/mês (para infra e labor)
  oneTimeValue?: number;  // R$ (apenas setup)
}

export interface OperationalParams {
  items: OperationalItem[];
  clientMarkupEnabled: boolean; // default true
  clientMarkup: number;         // default 0.30 (30%)
  setupInstallments: number;    // default 1 (1x a 12x)
}

export const DEFAULT_OPERATIONAL_ITEMS: OperationalItem[] = [
  // INFRA
  { id: "vps", label: "VPS (hospeda n8n)", category: "infra", enabled: true, monthlyValue: 149.99 },
  { id: "supabase", label: "Supabase (banco)", category: "infra", enabled: true, monthlyValue: 127.75 },
  { id: "uazapi", label: "Uazapi (WhatsApp API)", category: "infra", enabled: true, monthlyValue: 38 },
  { id: "redis", label: "Redis (cache n8n)", category: "infra", enabled: true, monthlyValue: 51.10 },
  // MÃO DE OBRA MENSAL
  { id: "maintenance", label: "Manutenção mensal", category: "labor", enabled: true, monthlyValue: 800 },
  // SETUP ÚNICO (one-time)
  { id: "flowbuild", label: "Montagem dos fluxos (one-time)", category: "setup", enabled: true, monthlyValue: 0, oneTimeValue: 3200 },
];

export const DEFAULT_OPERATIONAL_PARAMS: OperationalParams = {
  items: DEFAULT_OPERATIONAL_ITEMS,
  clientMarkupEnabled: true,
  clientMarkup: 0.30,
  setupInstallments: 1,
};

export interface BreakdownItem {
  id: string;
  label: string;
  category: "ia" | "infra" | "labor" | "setup" | "markup";
  value: number;
  percent: number;
  enabled: boolean;
  color: string;
}

export interface OperationalReport {
  infrastructureMonthly: number;
  laborMonthly: number;
  setupOneTime: number;
  aiMonthly: number;
  totalMonthlyBase: number;
  clientMarkupAmount: number;
  totalMonthlyWithMarkup: number;
  setupInstallments: number;
  setupInstallmentValue: number;
  totalFirstMonth: number; // Apenas a parcela do setup (Mês 1 não tem recorrência)
  breakdown: BreakdownItem[];
  pieData: { name: string; value: number; color: string }[];
}

export function computeOperationalReport(aiMonthlyBrl: number, op: OperationalParams): OperationalReport {
  const items = op.items || DEFAULT_OPERATIONAL_ITEMS;
  const installments = Math.max(1, op.setupInstallments || 1);

  const infrastructureMonthly = items
    .filter((i) => i.enabled && i.category === "infra")
    .reduce((acc, i) => acc + (i.monthlyValue || 0), 0);

  const laborMonthly = items
    .filter((i) => i.enabled && i.category === "labor")
    .reduce((acc, i) => acc + (i.monthlyValue || 0), 0);

  const setupOneTime = items
    .filter((i) => i.enabled && i.category === "setup")
    .reduce((acc, i) => acc + (i.oneTimeValue || 0), 0);

  const aiMonthly = Math.max(0, aiMonthlyBrl || 0);

  const totalMonthlyBase = aiMonthly + infrastructureMonthly + laborMonthly;
  const markupRate = op.clientMarkupEnabled ? (op.clientMarkup || 0) : 0;
  const clientMarkupAmount = totalMonthlyBase * markupRate;
  const totalMonthlyWithMarkup = totalMonthlyBase + clientMarkupAmount;

  // No primeiro mês, o cliente NÃO paga mensalidade recorrente, apenas a parcela da implementação
  const setupInstallmentValue = setupOneTime / installments;
  const totalFirstMonth = setupInstallmentValue;

  const totalForPercent = totalMonthlyWithMarkup > 0 ? totalMonthlyWithMarkup : 1;

  // Items breakdown detail
  const breakdown: BreakdownItem[] = [
    {
      id: "ai",
      label: "💬 TOKEN (IA)",
      category: "ia",
      value: aiMonthly,
      percent: (aiMonthly / totalForPercent) * 100,
      enabled: true,
      color: "#10b981", // emerald
    },
    ...items.map((item) => {
      const val = item.category === "setup" ? (item.oneTimeValue || 0) : (item.monthlyValue || 0);
      return {
        id: item.id,
        label: item.label,
        category: item.category as "infra" | "labor" | "setup",
        value: item.enabled ? val : 0,
        percent: item.enabled ? (val / totalForPercent) * 100 : 0,
        enabled: item.enabled,
        color: item.category === "infra" ? "#3b82f6" : item.category === "labor" ? "#a855f7" : "#64748b",
      };
    }),
  ];

  if (op.clientMarkupEnabled && clientMarkupAmount > 0) {
    breakdown.push({
      id: "markup",
      label: `Repasse / Markup (${Math.round(markupRate * 100)}%)`,
      category: "markup",
      value: clientMarkupAmount,
      percent: (clientMarkupAmount / totalForPercent) * 100,
      enabled: true,
      color: "#f59e0b",
    });
  }

  // Pie Chart Data (only enabled > 0)
  const pieData = [
    { name: "💬 Token (IA)", value: aiMonthly, color: "#10b981" },
    { name: "🖥️ Infraestrutura", value: infrastructureMonthly, color: "#3b82f6" },
    { name: "🔧 Manutenção", value: laborMonthly, color: "#a855f7" },
  ];

  if (op.clientMarkupEnabled && clientMarkupAmount > 0) {
    pieData.push({ name: "💰 Markup", value: clientMarkupAmount, color: "#f59e0b" });
  }

  if (setupOneTime > 0) {
    pieData.push({ name: "🚧 Setup (One-time)", value: setupOneTime, color: "#64748b" });
  }

  const filteredPieData = pieData.filter((p) => p.value > 0);

  return {
    infrastructureMonthly,
    laborMonthly,
    setupOneTime,
    aiMonthly,
    totalMonthlyBase,
    clientMarkupAmount,
    totalMonthlyWithMarkup,
    setupInstallments: installments,
    setupInstallmentValue,
    totalFirstMonth,
    breakdown,
    pieData: filteredPieData,
  };
}
