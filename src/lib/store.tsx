import React, { createContext, useContext, useState, useEffect } from "react";
import { DEFAULT_PARAMS, type SimulationParams, type Period } from "./cost";
import { type Currency, DEFAULT_USD_TO_BRL } from "./format";

export type ViewKey =
  | "simulator"
  | "optimizer"
  | "compare"
  | "multi"
  | "breakeven"
  | "catalog"
  | "scenarios"
  | "about";

export interface CatalogModel {
  id: string;
  providerId: string;
  name: string;
  inputPricePer1M: number;
  outputPricePer1M: number;
  cacheDiscount: number;
  contextWindow: number | null;
  modality: string;
}

export interface CatalogProvider {
  id: string;
  name: string;
  slug: string;
  color: string;
  website?: string;
}

export interface SavedScenario {
  id: string;
  name: string;
  createdAt: string;
  params: SimulationParams;
  modelLabel: string | null;
}

interface AppContextType {
  view: ViewKey;
  setView: (v: ViewKey) => void;
  params: SimulationParams;
  setParams: (p: Partial<SimulationParams>) => void;
  resetParams: () => void;
  selectedModelLabel: string | null;
  setSelectedModelLabel: (label: string | null) => void;
  
  // Moeda
  currency: Currency;
  setCurrency: (c: Currency) => void;
  usdToBrl: number;
  setUsdToBrl: (rate: number) => void;

  // Catálogo
  providers: CatalogProvider[];
  models: CatalogModel[];
  addCustomModel: (m: Omit<CatalogModel, "id">) => void;
  addCustomProvider: (p: Omit<CatalogProvider, "id">) => void;
  updateModelPrice: (id: string, updates: { inputPricePer1M: number; outputPricePer1M: number; cacheDiscount: number }) => void;

  // Cenários
  scenarios: SavedScenario[];
  saveScenario: (name: string, modelName: string | null) => void;
  deleteScenario: (id: string) => void;
  loadScenario: (id: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const INITIAL_PROVIDERS: CatalogProvider[] = [
  { id: "p-openai", name: "OpenAI", slug: "openai", color: "#10a37f", website: "https://openai.com/api/pricing" },
  { id: "p-anthropic", name: "Anthropic", slug: "anthropic", color: "#d97757", website: "https://www.anthropic.com/pricing" },
  { id: "p-google", name: "Google", slug: "google", color: "#4285f4", website: "https://ai.google.dev/pricing" },
  { id: "p-mistral", name: "Mistral AI", slug: "mistral", color: "#ff7000", website: "https://mistral.ai/products/pricing" },
  { id: "p-deepseek", name: "DeepSeek", slug: "deepseek", color: "#4d6bfe", website: "https://api-docs.deepseek.com/quick_start/pricing" },
  { id: "p-meta", name: "Meta", slug: "meta", color: "#0866ff", website: "https://www.together.ai/pricing" },
  { id: "p-groq", name: "Groq", slug: "groq", color: "#f55036", website: "https://groq.com/pricing/" }
];

const INITIAL_MODELS: CatalogModel[] = [
  // OpenAI
  { id: "m-gpt-4o", providerId: "p-openai", name: "GPT-4o", inputPricePer1M: 2.5, outputPricePer1M: 10.0, cacheDiscount: 0.50, contextWindow: 128000, modality: "text+vision" },
  { id: "m-gpt-4o-mini", providerId: "p-openai", name: "GPT-4o mini", inputPricePer1M: 0.15, outputPricePer1M: 0.60, cacheDiscount: 0.50, contextWindow: 128000, modality: "text+vision" },
  { id: "m-o1", providerId: "p-openai", name: "o1", inputPricePer1M: 15.0, outputPricePer1M: 60.0, cacheDiscount: 0.50, contextWindow: 200000, modality: "text" },
  { id: "m-o3-mini", providerId: "p-openai", name: "o3-mini", inputPricePer1M: 1.1, outputPricePer1M: 4.4, cacheDiscount: 0.50, contextWindow: 200000, modality: "text" },
  { id: "m-gpt-35", providerId: "p-openai", name: "GPT-3.5 Turbo", inputPricePer1M: 0.50, outputPricePer1M: 1.50, cacheDiscount: 0.50, contextWindow: 16385, modality: "text" },

  // Anthropic
  { id: "m-claude-35-sonnet", providerId: "p-anthropic", name: "Claude 3.5 Sonnet", inputPricePer1M: 3.0, outputPricePer1M: 15.0, cacheDiscount: 0.90, contextWindow: 200000, modality: "text+vision" },
  { id: "m-claude-35-haiku", providerId: "p-anthropic", name: "Claude 3.5 Haiku", inputPricePer1M: 0.80, outputPricePer1M: 4.0, cacheDiscount: 0.90, contextWindow: 200000, modality: "text+vision" },
  { id: "m-claude-3-opus", providerId: "p-anthropic", name: "Claude 3 Opus", inputPricePer1M: 15.0, outputPricePer1M: 75.0, cacheDiscount: 0.90, contextWindow: 200000, modality: "text+vision" },
  { id: "m-claude-3-haiku", providerId: "p-anthropic", name: "Claude 3 Haiku", inputPricePer1M: 0.25, outputPricePer1M: 1.25, cacheDiscount: 0.90, contextWindow: 200000, modality: "text+vision" },

  // Google
  { id: "m-gemini-15-pro", providerId: "p-google", name: "Gemini 1.5 Pro", inputPricePer1M: 1.25, outputPricePer1M: 5.0, cacheDiscount: 0.75, contextWindow: 2000000, modality: "text+vision+audio" },
  { id: "m-gemini-15-flash", providerId: "p-google", name: "Gemini 1.5 Flash", inputPricePer1M: 0.075, outputPricePer1M: 0.30, cacheDiscount: 0.75, contextWindow: 1000000, modality: "text+vision+audio" },
  { id: "m-gemini-20-flash", providerId: "p-google", name: "Gemini 2.0 Flash", inputPricePer1M: 0.10, outputPricePer1M: 0.40, cacheDiscount: 0.75, contextWindow: 1000000, modality: "text+vision+audio" },
  { id: "m-gemini-20-flash-lite", providerId: "p-google", name: "Gemini 2.0 Flash-Lite", inputPricePer1M: 0.075, outputPricePer1M: 0.30, cacheDiscount: 0.75, contextWindow: 1000000, modality: "text+vision" },

  // Mistral
  { id: "m-mistral-large", providerId: "p-mistral", name: "Mistral Large", inputPricePer1M: 2.0, outputPricePer1M: 6.0, cacheDiscount: 0, contextWindow: 128000, modality: "text" },
  { id: "m-mistral-small", providerId: "p-mistral", name: "Mistral Small", inputPricePer1M: 0.20, outputPricePer1M: 0.60, cacheDiscount: 0, contextWindow: 32000, modality: "text" },
  { id: "m-codestral", providerId: "p-mistral", name: "Codestral", inputPricePer1M: 0.30, outputPricePer1M: 0.90, cacheDiscount: 0, contextWindow: 32000, modality: "text" },

  // DeepSeek
  { id: "m-deepseek-v3", providerId: "p-deepseek", name: "DeepSeek-V3", inputPricePer1M: 0.27, outputPricePer1M: 1.10, cacheDiscount: 0, contextWindow: 64000, modality: "text" },
  { id: "m-deepseek-r1", providerId: "p-deepseek", name: "DeepSeek-R1", inputPricePer1M: 0.55, outputPricePer1M: 2.19, cacheDiscount: 0, contextWindow: 64000, modality: "text" },

  // Meta
  { id: "m-llama-33-70b", providerId: "p-meta", name: "Llama 3.3 70B", inputPricePer1M: 0.88, outputPricePer1M: 0.88, cacheDiscount: 0, contextWindow: 128000, modality: "text" },
  { id: "m-llama-31-8b", providerId: "p-meta", name: "Llama 3.1 8B", inputPricePer1M: 0.18, outputPricePer1M: 0.18, cacheDiscount: 0, contextWindow: 128000, modality: "text" },

  // Groq
  { id: "m-llama-33-groq", providerId: "p-groq", name: "Llama 3.3 70B (Groq)", inputPricePer1M: 0.59, outputPricePer1M: 0.79, cacheDiscount: 0, contextWindow: 128000, modality: "text" },
  { id: "m-llama-31-8b-groq", providerId: "p-groq", name: "Llama 3.1 8B (Groq)", inputPricePer1M: 0.05, outputPricePer1M: 0.08, cacheDiscount: 0, contextWindow: 128000, modality: "text" }
];

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [view, setView] = useState<ViewKey>("simulator");
  const [currency, setCurrency] = useState<Currency>("BRL");
  const [usdToBrl, setUsdToBrl] = useState<number>(DEFAULT_USD_TO_BRL);
  const [params, setParamsState] = useState<SimulationParams>({ ...DEFAULT_PARAMS });
  const [selectedModelLabel, setSelectedModelLabel] = useState<string | null>("p-openai||m-gpt-4o");

  // Persistidos no localStorage
  const [providers, setProviders] = useState<CatalogProvider[]>(INITIAL_PROVIDERS);
  const [models, setModels] = useState<CatalogModel[]>(INITIAL_MODELS);
  const [scenarios, setScenarios] = useState<SavedScenario[]>([]);

  // Carregar dados salvos no primeiro render
  useEffect(() => {
    const savedCurrency = localStorage.getItem("custoia_currency");
    if (savedCurrency) setCurrency(savedCurrency as Currency);

    const savedUsdToBrl = localStorage.getItem("custoia_usd_to_brl");
    if (savedUsdToBrl) setUsdToBrl(parseFloat(savedUsdToBrl));

    const savedParams = localStorage.getItem("custoia_params");
    if (savedParams) {
      try {
        setParamsState({ ...DEFAULT_PARAMS, ...JSON.parse(savedParams) });
      } catch (e) {
        console.error(e);
      }
    }

    const savedModelLabel = localStorage.getItem("custoia_model_label");
    if (savedModelLabel !== null) {
      setSelectedModelLabel(savedModelLabel === "null" ? null : savedModelLabel);
    }

    const savedProviders = localStorage.getItem("custoia_providers");
    if (savedProviders) {
      try {
        setProviders(JSON.parse(savedProviders));
      } catch (e) {
        console.error(e);
      }
    }

    const savedModels = localStorage.getItem("custoia_models");
    if (savedModels) {
      try {
        setModels(JSON.parse(savedModels));
      } catch (e) {
        console.error(e);
      }
    }

    const savedScenarios = localStorage.getItem("custoia_scenarios");
    if (savedScenarios) {
      try {
        setScenarios(JSON.parse(savedScenarios));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  // Helpers de gravação
  const setParams = (newParams: Partial<SimulationParams>) => {
    setParamsState((prev) => {
      const updated = { ...prev, ...newParams };
      localStorage.setItem("custoia_params", JSON.stringify(updated));
      return updated;
    });
  };

  const resetParams = () => {
    setParamsState(DEFAULT_PARAMS);
    setSelectedModelLabel("p-openai||m-gpt-4o");
    localStorage.setItem("custoia_params", JSON.stringify(DEFAULT_PARAMS));
    localStorage.setItem("custoia_model_label", "p-openai||m-gpt-4o");
  };

  const updateSelectedModelLabel = (label: string | null) => {
    setSelectedModelLabel(label);
    localStorage.setItem("custoia_model_label", label ? label : "null");
  };

  const updateCurrency = (c: Currency) => {
    setCurrency(c);
    localStorage.setItem("custoia_currency", c);
  };

  const updateUsdToBrl = (rate: number) => {
    setUsdToBrl(rate);
    localStorage.setItem("custoia_usd_to_brl", rate.toString());
  };

  // Funções do Catálogo
  const addCustomModel = (newModel: Omit<CatalogModel, "id">) => {
    const id = `custom-m-${Date.now()}`;
    const model: CatalogModel = { ...newModel, id };
    setModels((prev) => {
      const updated = [...prev, model];
      localStorage.setItem("custoia_models", JSON.stringify(updated));
      return updated;
    });
  };

  const addCustomProvider = (newProvider: Omit<CatalogProvider, "id">) => {
    const id = `custom-p-${Date.now()}`;
    const provider: CatalogProvider = { ...newProvider, id };
    setProviders((prev) => {
      const updated = [...prev, provider];
      localStorage.setItem("custoia_providers", JSON.stringify(updated));
      return updated;
    });
  };

  const updateModelPrice = (id: string, updates: { inputPricePer1M: number; outputPricePer1M: number; cacheDiscount: number }) => {
    setModels((prev) => {
      const updated = prev.map((m) => (m.id === id ? { ...m, ...updates } : m));
      localStorage.setItem("custoia_models", JSON.stringify(updated));
      return updated;
    });
  };

  // Funções de Cenários
  const saveScenario = (name: string, modelName: string | null) => {
    const scenario: SavedScenario = {
      id: `sc-${Date.now()}`,
      name,
      createdAt: new Date().toISOString(),
      params: { ...params },
      modelLabel: modelName,
    };
    setScenarios((prev) => {
      const updated = [scenario, ...prev];
      localStorage.setItem("custoia_scenarios", JSON.stringify(updated));
      return updated;
    });
  };

  const deleteScenario = (id: string) => {
    setScenarios((prev) => {
      const updated = prev.filter((s) => s.id !== id);
      localStorage.setItem("custoia_scenarios", JSON.stringify(updated));
      return updated;
    });
  };

  const loadScenario = (id: string) => {
    const s = scenarios.find((x) => x.id === id);
    if (s) {
      setParamsState(s.params);
      setSelectedModelLabel(s.modelLabel);
      localStorage.setItem("custoia_params", JSON.stringify(s.params));
      localStorage.setItem("custoia_model_label", s.modelLabel ? s.modelLabel : "null");
      setView("simulator");
    }
  };

  return (
    <AppContext.Provider
      value={{
        view,
        setView,
        params,
        setParams,
        resetParams,
        selectedModelLabel,
        setSelectedModelLabel: updateSelectedModelLabel,
        currency,
        setCurrency: updateCurrency,
        usdToBrl,
        setUsdToBrl: updateUsdToBrl,
        providers,
        models,
        addCustomModel,
        addCustomProvider,
        updateModelPrice,
        scenarios,
        saveScenario,
        deleteScenario,
        loadScenario,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppContext deve ser usado dentro de um AppProvider");
  }
  return context;
};

export const useCurrency = () => {
  const { currency, usdToBrl } = useAppContext();
  const symbol = currency === "BRL" ? "R$" : "$";
  return { currency, usdToBrl, symbol };
};
