// Helpers de formatação (moeda, tokens, números, datas)
// Preços são armazenados em USD; a camada de exibição converte para BRL se necessário.

export type Currency = "USD" | "BRL";

// Taxa de câmbio padrão (~5.11 BRL/USD). O usuário pode ajustar.
export const DEFAULT_USD_TO_BRL = 5.11;

export function toBRL(usd: number, rate: number = DEFAULT_USD_TO_BRL): number {
  return usd * rate;
}

// Formata valor em USD
export function formatUSD(value: number, decimals = 2): string {
  if (!isFinite(value)) return "$0.00";
  if (value === 0) return "$0.00";
  
  let finalDecimals = decimals;
  if (Math.abs(value) < 0.01) {
    // Para micro-valores, exibe no máximo 4 casas decimais para manter legível
    finalDecimals = Math.max(decimals, 4);
  }
  if (finalDecimals > 4) {
    finalDecimals = 4;
  }

  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Math.min(finalDecimals, 2),
    maximumFractionDigits: finalDecimals,
  });
}

// Formata valor em BRL
export function formatBRL(valueUSD: number, rate: number = DEFAULT_USD_TO_BRL, decimals = 2): string {
  const brl = toBRL(valueUSD, rate);
  if (!isFinite(brl)) return "R$ 0,00";
  if (brl === 0) return "R$ 0,00";
  
  let finalDecimals = decimals;
  if (Math.abs(brl) < 0.01) {
    // Para micro-valores, exibe no máximo 4 casas decimais para manter legível
    finalDecimals = Math.max(decimals, 4);
  }
  if (finalDecimals > 4) {
    finalDecimals = 4;
  }

  return brl.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: Math.min(finalDecimals, 2),
    maximumFractionDigits: finalDecimals,
  });
}

// Formata de acordo com a moeda selecionada
export function formatMoney(
  valueUSD: number,
  currency: Currency = "BRL",
  rate: number = DEFAULT_USD_TO_BRL,
  decimals = 2
): string {
  if (currency === "BRL") return formatBRL(valueUSD, rate, decimals);
  return formatUSD(valueUSD, decimals);
}

// Versão curta para eixos de gráficos
export function formatMoneyShort(
  valueUSD: number,
  currency: Currency = "BRL",
  rate: number = DEFAULT_USD_TO_BRL
): string {
  if (!isFinite(valueUSD)) return currency === "BRL" ? "R$0" : "$0";
  const value = currency === "BRL" ? toBRL(valueUSD, rate) : valueUSD;
  const prefix = currency === "BRL" ? "R$" : "$";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${prefix}${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${prefix}${(value / 1_000).toFixed(2)}K`;
  if (abs >= 1) return `${prefix}${value.toFixed(2)}`;
  return `${prefix}${value.toFixed(4)}`;
}

export function formatUSDShort(value: number): string {
  return formatMoneyShort(value, "USD");
}

export function formatTokens(tokens: number): string {
  if (!isFinite(tokens)) return "0";
  const abs = Math.abs(tokens);
  if (abs >= 1_000_000) return `${(tokens / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return Math.round(tokens).toLocaleString("en-US");
}

export function formatNumber(value: number): string {
  if (!isFinite(value)) return "0";
  return Math.round(value).toLocaleString("en-US");
}

// Formata preço por 1M tokens na moeda selecionada
export function formatPricePer1M(
  priceUSD: number,
  currency: Currency = "BRL",
  rate: number = DEFAULT_USD_TO_BRL
): string {
  if (priceUSD === 0) return "Grátis";
  const value = currency === "BRL" ? toBRL(priceUSD, rate) : priceUSD;
  const prefix = currency === "BRL" ? "R$" : "$";
  if (value < 0.01) return `${prefix} ${value.toFixed(4)}`;
  if (value < 1) return `${prefix} ${value.toFixed(3)}`;
  return `${prefix} ${value.toFixed(2)}`;
}

export function formatPricePer1MUSD(price: number): string {
  return formatPricePer1M(price, "USD");
}

export function formatChars(chars: number): string {
  if (chars >= 1_000_000) return `${(chars / 1_000_000).toFixed(1)}M chars`;
  if (chars >= 1_000) return `${(chars / 1_000).toFixed(0)}K chars`;
  return `${chars} chars`;
}

export function periodLabel(period: "day" | "week" | "month"): string {
  return period === "day" ? "dia" : period === "week" ? "semana" : "mês";
}

export function periodLabelPlural(period: "day" | "week" | "month"): string {
  return period === "day" ? "dias" : period === "week" ? "semanas" : "meses";
}

// Símbolo da moeda
export function currencySymbol(currency: Currency = "BRL"): string {
  return currency === "BRL" ? "R$" : "$";
}

// Nome da moeda por extenso
export function currencyName(currency: Currency = "BRL"): string {
  return currency === "BRL" ? "Real (R$)" : "Dólar (US$)";
}
