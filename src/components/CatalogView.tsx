import React, { useState, useMemo } from "react";
import { useAppContext, type CatalogModel, type CatalogProvider } from "../lib/store";
import { formatPricePer1M, formatNumber } from "../lib/format";
import { Search, PlusCircle, Edit2, Zap, Check, ExternalLink } from "lucide-react";

interface CatalogViewProps {
  onPickModel: (providerId: string, modelId: string) => void;
}

export const CatalogView: React.FC<CatalogViewProps> = ({ onPickModel }) => {
  const { 
    providers, 
    models, 
    addCustomModel, 
    addCustomProvider, 
    updateModelPrice, 
    currency, 
    usdToBrl 
  } = useAppContext();

  const [search, setSearch] = useState("");
  const [editingModel, setEditingModel] = useState<CatalogModel | null>(null);
  
  // States para edição
  const [editInput, setEditInput] = useState(0);
  const [editOutput, setEditOutput] = useState(0);
  const [editCache, setEditCache] = useState(0);

  // States para criação
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newProviderId, setNewProviderId] = useState("");
  const [newInput, setNewInput] = useState(0.5);
  const [newOutput, setNewOutput] = useState(1.5);
  const [newCache, setNewCache] = useState(0);
  const [newContext, setNewContext] = useState(128000);
  const [newModality, setNewModality] = useState("text");

  // Filtra catálogo
  const filteredProviders = useMemo(() => {
    if (!search.trim()) return providers;
    const query = search.toLowerCase();
    
    return providers.map(p => {
      const filteredModels = models.filter(m => 
        m.providerId === p.id && 
        (m.name.toLowerCase().includes(query) || p.name.toLowerCase().includes(query) || m.modality.toLowerCase().includes(query))
      );
      return { ...p, models: filteredModels };
    }).filter(p => p.models.length > 0);
  }, [providers, models, search]);

  const handleStartEdit = (model: CatalogModel) => {
    setEditingModel(model);
    setEditInput(model.inputPricePer1M);
    setEditOutput(model.outputPricePer1M);
    setEditCache(Math.round(model.cacheDiscount * 100));
  };

  const handleSaveEdit = () => {
    if (!editingModel) return;
    updateModelPrice(editingModel.id, {
      inputPricePer1M: editInput,
      outputPricePer1M: editOutput,
      cacheDiscount: editCache / 100
    });
    setEditingModel(null);
  };

  const handleAddCustomModel = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newProviderId) return;

    addCustomModel({
      providerId: newProviderId,
      name: newName,
      inputPricePer1M: newInput,
      outputPricePer1M: newOutput,
      cacheDiscount: newCache / 100,
      contextWindow: newContext > 0 ? newContext : null,
      modality: newModality
    });

    // Reset form
    setNewName("");
    setNewInput(0.5);
    setNewOutput(1.5);
    setNewCache(0);
    setNewContext(128000);
    setNewModality("text");
    setIsAdding(false);
  };

  return (
    <div className="space-y-4">
      {/* Search and Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gray-950 border border-gray-800 p-4 rounded-xl">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          <input
            type="text"
            placeholder="Buscar modelo, provedor ou modalidade..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-9 bg-gray-900 border border-gray-800 focus:border-primary text-gray-200 text-xs font-semibold pl-9 pr-3 rounded-lg focus:outline-none"
          />
        </div>
        <button
          onClick={() => {
            setIsAdding(true);
            if (providers.length > 0) setNewProviderId(providers[0].id);
          }}
          className="flex items-center justify-center gap-1.5 bg-primary hover:bg-primary/95 text-white text-xs font-bold px-4 h-9 rounded-lg shadow-sm transition-all"
        >
          <PlusCircle className="h-4 w-4" />
          Adicionar Modelo Customizado
        </button>
      </div>

      {/* Grid of Providers */}
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredProviders.map((p) => {
          const providerModels = models.filter(m => m.providerId === p.id);
          const displayModels = (p as any).models || providerModels;

          return (
            <div key={p.id} className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden flex flex-col justify-between">
              {/* Card Header */}
              <div 
                className="px-4 py-3 flex items-center justify-between border-b border-gray-900/60"
                style={{ borderLeft: `4px solid ${p.color}` }}
              >
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
                  <h4 className="font-bold text-sm text-gray-100">{p.name}</h4>
                </div>
                {p.website && (
                  <a 
                    href={p.website} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="text-gray-500 hover:text-gray-300 transition-colors p-0.5"
                    title="Ver precificação oficial"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>

              {/* Card Content List of Models */}
              <div className="divide-y divide-gray-900/40 overflow-y-auto max-h-72 scrollbar-thin">
                {displayModels.map((m) => {
                  const pricingTextIn = formatPricePer1M(m.inputPricePer1M, currency, usdToBrl);
                  const pricingTextOut = formatPricePer1M(m.outputPricePer1M, currency, usdToBrl);

                  return (
                    <div key={m.id} className="p-3.5 flex items-center justify-between gap-4 group hover:bg-gray-900/10 transition-colors">
                      <div 
                        onClick={() => onPickModel(p.id, m.id)}
                        className="cursor-pointer min-w-0 flex-1 space-y-1"
                      >
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-xs text-gray-200 group-hover:text-primary transition-colors truncate">{m.name}</span>
                          {m.cacheDiscount > 0 && (
                            <span 
                              className="inline-flex items-center gap-0.5 bg-emerald-950 text-emerald-400 text-[8px] font-extrabold px-1.5 py-0.5 rounded-full"
                              title={`Suporte a Prompt Caching de até ${(m.cacheDiscount * 100).toFixed(0)}%`}
                            >
                              <Zap className="h-2 w-2" />
                              {(m.cacheDiscount * 100).toFixed(0)}%
                            </span>
                          )}
                        </div>
                        <p className="text-[9px] text-gray-500 font-bold uppercase">
                          {m.modality} {m.contextWindow ? `· ctx ${formatNumber(m.contextWindow)}` : ""}
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-[10px] text-gray-400 font-semibold tabular-nums"><span className="text-[9px] text-gray-500 font-bold">IN</span> {pricingTextIn}</p>
                          <p className="text-[10px] text-gray-400 font-semibold tabular-nums"><span className="text-[9px] text-gray-500 font-bold">OUT</span> {pricingTextOut}</p>
                        </div>
                        <button
                          onClick={() => handleStartEdit(m)}
                          className="text-gray-500 hover:text-gray-200 transition-colors p-1"
                          title="Editar preços do modelo"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* dialog de edição */}
      {editingModel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-gray-950 border border-gray-800 rounded-xl w-full max-w-sm shadow-2xl p-6 space-y-4">
            <h3 className="font-bold text-sm text-gray-100 flex items-center gap-2">
              <Edit2 className="h-4 w-4 text-primary" />
              Editar preços: {editingModel.name}
            </h3>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs text-gray-400 font-semibold">Preço Input / 1M ($ USD)</label>
                <input
                  type="number"
                  value={editInput}
                  onChange={(e) => setEditInput(Math.max(0, parseFloat(e.target.value) || 0))}
                  step="0.001"
                  className="w-full h-9 bg-gray-900 border border-gray-800 focus:border-primary text-gray-200 text-xs font-semibold px-2 rounded-lg focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-gray-400 font-semibold">Preço Output / 1M ($ USD)</label>
                <input
                  type="number"
                  value={editOutput}
                  onChange={(e) => setEditOutput(Math.max(0, parseFloat(e.target.value) || 0))}
                  step="0.001"
                  className="w-full h-9 bg-gray-900 border border-gray-800 focus:border-primary text-gray-200 text-xs font-semibold px-2 rounded-lg focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-gray-400 font-semibold">Prompt Caching (%)</label>
                <input
                  type="number"
                  value={editCache}
                  onChange={(e) => setEditCache(Math.min(95, Math.max(0, parseInt(e.target.value) || 0)))}
                  step="1"
                  className="w-full h-9 bg-gray-900 border border-gray-800 focus:border-primary text-gray-200 text-xs font-semibold px-2 rounded-lg focus:outline-none"
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setEditingModel(null)}
                className="bg-gray-850 hover:bg-gray-800 text-gray-300 text-xs font-semibold px-4 h-9 rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveEdit}
                className="bg-primary hover:bg-primary/95 text-white text-xs font-bold px-4 h-9 rounded-lg"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* dialog de criação */}
      {isAdding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <form onSubmit={handleAddCustomModel} className="bg-gray-950 border border-gray-800 rounded-xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <h3 className="font-bold text-sm text-gray-100 flex items-center gap-2">
              <PlusCircle className="h-4 w-4 text-primary" />
              Adicionar Novo Modelo Customizado
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-gray-400 font-semibold">Nome do Modelo</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="ex: fine-tuning-sdr-v1"
                  className="w-full h-9 bg-gray-900 border border-gray-800 focus:border-primary text-gray-200 text-xs font-semibold px-2 rounded-lg focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-gray-400 font-semibold">Provedor</label>
                <select
                  value={newProviderId}
                  onChange={(e) => setNewProviderId(e.target.value)}
                  className="w-full h-9 bg-gray-900 border border-gray-800 focus:border-primary text-gray-200 text-xs font-semibold px-2 rounded-lg focus:outline-none"
                >
                  {providers.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-gray-400 font-semibold">Preço Input/1M ($ USD)</label>
                <input
                  type="number"
                  required
                  value={newInput}
                  onChange={(e) => setNewInput(Math.max(0, parseFloat(e.target.value) || 0))}
                  step="0.001"
                  className="w-full h-9 bg-gray-900 border border-gray-800 focus:border-primary text-gray-200 text-xs font-semibold px-2 rounded-lg focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-gray-400 font-semibold">Preço Output/1M ($ USD)</label>
                <input
                  type="number"
                  required
                  value={newOutput}
                  onChange={(e) => setNewOutput(Math.max(0, parseFloat(e.target.value) || 0))}
                  step="0.001"
                  className="w-full h-9 bg-gray-900 border border-gray-800 focus:border-primary text-gray-200 text-xs font-semibold px-2 rounded-lg focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-gray-400 font-semibold">Cache %</label>
                <input
                  type="number"
                  value={newCache}
                  onChange={(e) => setNewCache(Math.min(95, Math.max(0, parseInt(e.target.value) || 0)))}
                  className="w-full h-9 bg-gray-900 border border-gray-800 focus:border-primary text-gray-200 text-xs font-semibold px-2 rounded-lg focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-gray-400 font-semibold">Contexto (Tokens)</label>
                <input
                  type="number"
                  value={newContext}
                  onChange={(e) => setNewContext(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full h-9 bg-gray-900 border border-gray-800 focus:border-primary text-gray-200 text-xs font-semibold px-2 rounded-lg focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-gray-400 font-semibold">Modalidade</label>
                <select
                  value={newModality}
                  onChange={(e) => setNewModality(e.target.value)}
                  className="w-full h-9 bg-gray-900 border border-gray-800 focus:border-primary text-gray-200 text-xs font-semibold px-2 rounded-lg focus:outline-none"
                >
                  <option value="text">text</option>
                  <option value="text+vision">text+vision</option>
                  <option value="text+vision+audio">text+vision+audio</option>
                </select>
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="bg-gray-850 hover:bg-gray-800 text-gray-300 text-xs font-semibold px-4 h-9 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="bg-primary hover:bg-primary/95 text-white text-xs font-bold px-4 h-9 rounded-lg"
              >
                Criar Modelo
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
