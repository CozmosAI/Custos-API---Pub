import React, { useState } from "react";
import { useAppContext } from "../lib/store";
import { HelpTip } from "./HelpTip";
import { PresetsCard } from "./PresetsCard";
import { PromptBuilderDialog } from "./PromptBuilderDialog";
import { CurrencyField } from "./CurrencyField";
import { type Period } from "../lib/cost";
import { 
  Briefcase, 
  MessagesSquare, 
  Coins, 
  Scale, 
  ChevronRight, 
  Maximize2, 
  Sparkles, 
  PlusCircle, 
  RotateCcw,
  Zap,
  ShieldAlert,
  ChevronDown
} from "lucide-react";
import { formatMoney, formatNumber } from "../lib/format";

interface SimulatorFormProps {
  onSaveScenario: () => void;
}

export const SimulatorForm: React.FC<SimulatorFormProps> = ({ onSaveScenario }) => {
  const {
    params,
    setParams,
    resetParams,
    selectedModelLabel,
    setSelectedModelLabel,
    providers,
    models,
    currency,
    usdToBrl
  } = useAppContext();

  const [promptOpen, setPromptOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>("modelo");

  // Acha o modelo ativo
  const activeModel = models.find(m => {
    const [pid, mid] = (selectedModelLabel || "").split("||");
    return m.id === mid;
  });

  const activeProvider = providers.find(p => p.id === activeModel?.providerId);

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === "custom") {
      setSelectedModelLabel(null);
      return;
    }

    setSelectedModelLabel(val);
    const [pid, mid] = val.split("||");
    const m = models.find(x => x.id === mid);
    if (m) {
      setParams({
        inputPricePer1M: m.inputPricePer1M,
        outputPricePer1M: m.outputPricePer1M,
      });
    }
  };

  const toggleSection = (section: string) => {
    setActiveSection(prev => (prev === section ? null : section));
  };

  return (
    <div className="space-y-4">
      <PresetsCard />

      {/* 1. SEÇÃO MODELO DE IA */}
      <div className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden transition-all">
        <button
          onClick={() => toggleSection("modelo")}
          className="w-full flex items-center justify-between p-4 text-left font-bold text-xs uppercase tracking-wider text-gray-400 focus:outline-none"
        >
          <div className="flex items-center gap-2">
            <Coins className="h-4 w-4 text-primary" />
            <span>Modelo de IA & Preços</span>
          </div>
          {activeSection === "modelo" ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        {activeSection === "modelo" && (
          <div className="p-4 pt-0 border-t border-gray-900/60 space-y-4 animate-in fade-in-10 duration-200">
            <div className="space-y-1.5 mt-4">
              <label className="text-xs text-gray-400 font-semibold flex items-center">
                Selecione o Modelo de IA
                <HelpTip text="Escolha um modelo pronto ou selecione 'Preço Customizado' para digitar os valores manualmente." />
              </label>
              <select
                value={selectedModelLabel || "custom"}
                onChange={handleModelChange}
                className="w-full h-9 bg-gray-900 border border-gray-800 focus:border-primary text-gray-200 text-xs font-semibold px-2 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="custom">⚙️ Preços Manuais Customizados</option>
                {providers.map(p => {
                  const providerModels = models.filter(m => m.providerId === p.id);
                  if (providerModels.length === 0) return null;
                  return (
                    <optgroup key={p.id} label={p.name}>
                      {providerModels.map(m => (
                        <option key={m.id} value={`${p.id}||${m.id}`}>
                          {m.name} (${m.inputPricePer1M.toFixed(2)} / ${m.outputPricePer1M.toFixed(2)})
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </div>

            {/* Inputs de Preço */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-gray-400 font-semibold flex items-center">
                  Custo Input / 1M
                  <HelpTip text="Preço cobrado pelo modelo a cada 1 milhão de tokens enviados para a API (USD)." />
                </label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-500">$</span>
                  <input
                    type="number"
                    value={params.inputPricePer1M}
                    onChange={(e) => {
                      setSelectedModelLabel(null);
                      setParams({ inputPricePer1M: Math.max(0, parseFloat(e.target.value) || 0) });
                    }}
                    step="0.001"
                    min="0"
                    className="w-full h-9 bg-gray-900 border border-gray-800 focus:border-primary text-gray-200 text-xs font-semibold pl-6 pr-2 rounded-lg focus:outline-none tabular-nums"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-gray-400 font-semibold flex items-center">
                  Custo Output / 1M
                  <HelpTip text="Preço cobrado pelo modelo a cada 1 milhão de tokens gerados na resposta da API (USD)." />
                </label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-500">$</span>
                  <input
                    type="number"
                    value={params.outputPricePer1M}
                    onChange={(e) => {
                      setSelectedModelLabel(null);
                      setParams({ outputPricePer1M: Math.max(0, parseFloat(e.target.value) || 0) });
                    }}
                    step="0.001"
                    min="0"
                    className="w-full h-9 bg-gray-900 border border-gray-800 focus:border-primary text-gray-200 text-xs font-semibold pl-6 pr-2 rounded-lg focus:outline-none tabular-nums"
                  />
                </div>
              </div>
            </div>



            {/* Margem de Erro / Segurança Switch */}
            <div className="bg-gray-900/60 border border-gray-800 rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <ShieldAlert className="h-4 w-4 text-amber-400" />
                  <span className="text-xs font-bold text-gray-300">Margem de Erro / Segurança (+{params.safetyMarginPct}%)</span>
                  <HelpTip text="Adiciona uma margem de contingência percentual sobre os custos calculados para cobrir variações de respostas, retentativas ou mensagens atípicas." />
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={params.useSafetyMargin}
                    onChange={(e) => setParams({ useSafetyMargin: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-8 h-4.5 bg-gray-800 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-gray-200 after:border-gray-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-amber-500"></div>
                </label>
              </div>

              {params.useSafetyMargin && (
                <div className="flex items-center justify-between text-xs animate-in fade-in-0 duration-100">
                  <span className="text-gray-400">Porcentagem de margem</span>
                  <div className="flex items-center gap-1">
                    <span className="text-amber-400 font-bold">+</span>
                    <input
                      type="number"
                      value={params.safetyMarginPct}
                      onChange={(e) => {
                        const val = Math.min(200, Math.max(0, parseInt(e.target.value) || 0));
                        setParams({ safetyMarginPct: val });
                      }}
                      className="w-12 h-6 text-center text-xs bg-gray-950 border border-gray-800 text-gray-200 rounded font-semibold focus:outline-none focus:border-amber-500"
                    />
                    <span className="text-gray-400 font-semibold">%</span>
                  </div>
                </div>
              )}
              <p className="text-[10px] text-gray-500 leading-normal">
                Aumenta a estimativa em +{params.safetyMarginPct}% para simular orçamentos com margem de segurança contra imprevistos ou conversas longas.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 2. SEÇÃO NEGÓCIO / LEADS */}
      <div className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden transition-all">
        <button
          onClick={() => toggleSection("negocio")}
          className="w-full flex items-center justify-between p-4 text-left font-bold text-xs uppercase tracking-wider text-gray-400 focus:outline-none"
        >
          <div className="flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-primary" />
            <span>Volume & Escala</span>
          </div>
          {activeSection === "negocio" ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        {activeSection === "negocio" && (
          <div className="p-4 pt-0 border-t border-gray-900/60 space-y-4 animate-in fade-in-10 duration-200">
            <div className="grid grid-cols-2 gap-3 mt-4">
              <div className="space-y-1.5">
                <label className="text-xs text-gray-400 font-semibold flex items-center">
                  Leads Atuais
                  <HelpTip text="O volume de novos contatos gerados no período selecionado." />
                </label>
                <input
                  type="number"
                  value={params.leads}
                  onChange={(e) => setParams({ leads: Math.max(0, parseInt(e.target.value) || 0) })}
                  min="0"
                  className="w-full h-9 bg-gray-900 border border-gray-800 focus:border-primary text-gray-200 text-xs font-semibold px-2 rounded-lg focus:outline-none tabular-nums"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-gray-400 font-semibold">Período</label>
                <select
                  value={params.period}
                  onChange={(e) => setParams({ period: e.target.value as Period })}
                  className="w-full h-9 bg-gray-900 border border-gray-800 focus:border-primary text-gray-200 text-xs font-semibold px-2 rounded-lg focus:outline-none"
                >
                  <option value="day">Por Dia</option>
                  <option value="week">Por Semana</option>
                  <option value="month">Por Mês</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-gray-400 font-semibold flex items-center">
                Simular Escala Até (Max Leads)
                <HelpTip text="Quantos leads quer testar no gráfico de simulação para planejar o crescimento?" />
              </label>
              <input
                type="number"
                value={params.maxLeadsToSimulate}
                onChange={(e) => setParams({ maxLeadsToSimulate: Math.max(1, parseInt(e.target.value) || 1) })}
                min="1"
                className="w-full h-9 bg-gray-900 border border-gray-800 focus:border-primary text-gray-200 text-xs font-semibold px-2 rounded-lg focus:outline-none tabular-nums"
              />
            </div>
          </div>
        )}
      </div>

      {/* 3. SEÇÃO ESTRUTURA DA CONVERSA */}
      <div className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden transition-all">
        <button
          onClick={() => toggleSection("conversa")}
          className="w-full flex items-center justify-between p-4 text-left font-bold text-xs uppercase tracking-wider text-gray-400 focus:outline-none"
        >
          <div className="flex items-center gap-2">
            <MessagesSquare className="h-4 w-4 text-primary" />
            <span>Estrutura da Conversa</span>
          </div>
          {activeSection === "conversa" ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        {activeSection === "conversa" && (
          <div className="p-4 pt-0 border-t border-gray-900/60 space-y-4 animate-in fade-in-10 duration-200">
            <div className="space-y-1.5 mt-4">
              <label className="text-xs text-gray-400 font-semibold flex items-center">
                Mensagens de Primeiro Contato
                <HelpTip text="Quantas interações da IA ocorrem no dia em que o lead é criado (ex: primeiro gancho + follow-up rápido)." />
              </label>
              <input
                type="number"
                value={params.firstContactMessages}
                onChange={(e) => setParams({ firstContactMessages: Math.max(0, parseInt(e.target.value) || 0) })}
                min="0"
                className="w-full h-9 bg-gray-900 border border-gray-800 focus:border-primary text-gray-200 text-xs font-semibold px-2 rounded-lg focus:outline-none tabular-nums"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-gray-400 font-semibold flex items-center">
                  Dias de Follow-up
                  <HelpTip text="Quantos dias subsequentes a IA continuará tentando falar com o lead caso ele suma." />
                </label>
                <input
                  type="number"
                  value={params.followUpDays}
                  onChange={(e) => setParams({ followUpDays: Math.max(0, parseInt(e.target.value) || 0) })}
                  min="0"
                  className="w-full h-9 bg-gray-900 border border-gray-800 focus:border-primary text-gray-200 text-xs font-semibold px-2 rounded-lg focus:outline-none tabular-nums"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-gray-400 font-semibold flex items-center">
                  Msgs / Dia de Follow
                  <HelpTip text="Quantas interações ocorrem por dia de follow-up ativo." />
                </label>
                <input
                  type="number"
                  value={params.followUpMessagesPerDay}
                  onChange={(e) => setParams({ followUpMessagesPerDay: Math.max(0, parseInt(e.target.value) || 0) })}
                  min="0"
                  className="w-full h-9 bg-gray-900 border border-gray-800 focus:border-primary text-gray-200 text-xs font-semibold px-2 rounded-lg focus:outline-none tabular-nums"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-gray-400 font-semibold flex items-center">
                Chamadas API por Mensagem
                <HelpTip text="Quantas requisições de API a automação faz por mensagem visível (ex: 1 chamada principal para responder + 1 chamada 'Fraciona' para quebrar em blocos no WhatsApp)." />
              </label>
              <input
                type="number"
                value={params.apiCallsPerMessage}
                onChange={(e) => setParams({ apiCallsPerMessage: Math.max(1, parseInt(e.target.value) || 1) })}
                min="1"
                className="w-full h-9 bg-gray-900 border border-gray-800 focus:border-primary text-gray-200 text-xs font-semibold px-2 rounded-lg focus:outline-none tabular-nums"
              />
            </div>

            <div className="p-3 bg-gray-900/60 rounded-lg text-xs text-gray-400 border border-gray-800 space-y-1.5">
              <div className="flex items-center justify-between">
                <span>Total de mensagens por conversa:</span>
                <span className="font-bold text-gray-100">
                  {params.firstContactMessages + params.followUpDays * params.followUpMessagesPerDay} mensagens
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-gray-800/60 pt-1.5">
                <span>Total de chamadas API por lead:</span>
                <span className="font-bold text-primary">
                  {(params.firstContactMessages + params.followUpDays * params.followUpMessagesPerDay) * params.apiCallsPerMessage} chamadas
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 4. SEÇÃO TOKENS & CARACTERES */}
      <div className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden transition-all">
        <button
          onClick={() => toggleSection("tokens")}
          className="w-full flex items-center justify-between p-4 text-left font-bold text-xs uppercase tracking-wider text-gray-400 focus:outline-none"
        >
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span>Tokens, Caracteres & Prompt</span>
          </div>
          {activeSection === "tokens" ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        {activeSection === "tokens" && (
          <div className="p-4 pt-0 border-t border-gray-900/60 space-y-4 animate-in fade-in-10 duration-200">
            <div className="space-y-1.5 mt-4">
              <label className="text-xs text-gray-400 font-semibold flex items-center justify-between">
                <span className="flex items-center">
                  Tamanho Prompt de Sistema
                  <HelpTip text="O número total de caracteres de instrução da persona do seu SDR (ex: 40.000 caracteres)." />
                </span>
                {params.systemPromptText && (
                  <span className="text-[10px] text-emerald-400 font-mono">Simulado ✓</span>
                )}
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={params.systemPromptChars}
                  onChange={(e) => setParams({ systemPromptChars: Math.max(0, parseInt(e.target.value) || 0) })}
                  min="0"
                  step="1000"
                  className="flex-1 h-9 bg-gray-900 border border-gray-800 focus:border-primary text-gray-200 text-xs font-semibold px-2 rounded-lg focus:outline-none tabular-nums"
                />
                <button
                  type="button"
                  onClick={() => setPromptOpen(true)}
                  className="bg-primary/10 border border-primary/30 hover:bg-primary/20 text-primary-foreground text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
                >
                  Editor
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-gray-400 font-semibold flex items-center">
                  Tamanho Msg do Lead
                  <HelpTip text="Média de caracteres de cada resposta enviada pelo lead (ex: 500 caracteres)." />
                </label>
                <input
                  type="number"
                  value={params.avgUserMessageChars}
                  onChange={(e) => setParams({ avgUserMessageChars: Math.max(0, parseInt(e.target.value) || 0) })}
                  min="0"
                  step="50"
                  className="w-full h-9 bg-gray-900 border border-gray-800 focus:border-primary text-gray-200 text-xs font-semibold px-2 rounded-lg focus:outline-none tabular-nums"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-gray-400 font-semibold flex items-center">
                  Tamanho Resp da IA
                  <HelpTip text="Média de caracteres de cada resposta gerada pelo robô (ex: 800 caracteres)." />
                </label>
                <input
                  type="number"
                  value={params.avgResponseChars}
                  onChange={(e) => setParams({ avgResponseChars: Math.max(0, parseInt(e.target.value) || 0) })}
                  min="0"
                  step="50"
                  className="w-full h-9 bg-gray-900 border border-gray-800 focus:border-primary text-gray-200 text-xs font-semibold px-2 rounded-lg focus:outline-none tabular-nums"
                />
              </div>
            </div>

            {/* Slider de Caracteres por Token */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400 font-semibold flex items-center">
                  Chars por Token
                  <HelpTip text="Quantos caracteres equivalem a 1 token. Em português (com acentos) costuma ser ~3.5. Em inglês simples é ~4.0." />
                </span>
                <span className="font-bold text-gray-200">{params.charsPerToken.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min="2.0"
                max="6.0"
                step="0.1"
                value={params.charsPerToken}
                onChange={(e) => setParams({ charsPerToken: parseFloat(e.target.value) })}
                className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-primary"
              />
            </div>
          </div>
        )}
      </div>

      {/* Botões de Ação */}
      <div className="grid grid-cols-2 gap-2 pt-2">
        <button
          onClick={resetParams}
          className="flex items-center justify-center gap-1.5 bg-gray-900 hover:bg-gray-800 border border-gray-800 text-gray-300 hover:text-white text-xs font-semibold px-4 py-2.5 rounded-lg transition-all"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Resetar Campos
        </button>
        <button
          onClick={onSaveScenario}
          className="flex items-center justify-center gap-1.5 bg-primary hover:bg-primary/95 text-white text-xs font-bold px-4 py-2.5 rounded-lg shadow transition-all"
        >
          <PlusCircle className="h-3.5 w-3.5" />
          Salvar Cenário
        </button>
      </div>

      <PromptBuilderDialog
        isOpen={promptOpen}
        onClose={() => setPromptOpen(false)}
        initialText={params.systemPromptText}
        charsPerToken={params.charsPerToken}
        onApply={(text, count) => setParams({ systemPromptText: text, systemPromptChars: count })}
      />
    </div>
  );
};
