import React from "react";
import { useAppContext } from "../lib/store";
import { SCENARIO_PRESETS } from "../lib/cost";
import { Layers } from "lucide-react";

export const PresetsCard: React.FC = () => {
  const { params, setParams } = useAppContext();

  const handleApplyPreset = (patch: Partial<typeof params>) => {
    setParams(patch);
  };

  return (
    <div className="bg-gray-950 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Layers className="h-4 w-4 text-primary" />
        <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Presets de Cenário</h4>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {SCENARIO_PRESETS.map((p) => {
          const totalMessages = (p.patch.firstContactMessages ?? params.firstContactMessages) +
            (p.patch.followUpDays ?? params.followUpDays) * (p.patch.followUpMessagesPerDay ?? params.followUpMessagesPerDay);

          return (
            <button
              key={p.id}
              onClick={() => handleApplyPreset(p.patch)}
              className="group flex flex-col gap-1 p-2.5 bg-gray-900 border border-gray-800 hover:border-primary/50 text-left rounded-lg transition-all focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <div className="flex items-center gap-1.5">
                <span className="text-sm">{p.emoji}</span>
                <span className="text-xs font-bold text-gray-200 group-hover:text-white transition-colors">{p.name}</span>
              </div>
              <p className="text-[10px] text-gray-500 leading-normal line-clamp-1">{p.description}</p>
              <div className="mt-1 flex items-center justify-between text-[9px] font-semibold text-gray-400">
                <span>{p.patch.leads ?? params.leads} leads</span>
                <span className="bg-gray-800/80 px-1.5 py-0.5 rounded text-[8px] text-gray-400 font-mono">
                  {totalMessages} msgs/lead
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
