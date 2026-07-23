import React, { useState } from "react";
import { useAppContext } from "../lib/store";
import { DollarSign, Coins, TrendingUp } from "lucide-react";

export const CurrencySelector: React.FC = () => {
  const { currency, setCurrency, usdToBrl, setUsdToBrl } = useAppContext();
  const [showRateInput, setShowRateInput] = useState(false);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
      <div className="inline-flex rounded-lg border border-gray-800 bg-gray-950 p-0.5">
        <button
          onClick={() => {
            setCurrency("BRL");
            setShowRateInput(true);
          }}
          className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition-all ${
            currency === "BRL"
              ? "bg-primary text-white shadow"
              : "text-gray-400 hover:text-gray-200"
          }`}
        >
          <Coins className="h-3 w-3" />
          R$ BRL
        </button>
        <button
          onClick={() => {
            setCurrency("USD");
            setShowRateInput(false);
          }}
          className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition-all ${
            currency === "USD"
              ? "bg-primary text-white shadow"
              : "text-gray-400 hover:text-gray-200"
          }`}
        >
          <DollarSign className="h-3 w-3" />
          $ USD
        </button>
      </div>

      {currency === "BRL" && (
        <div className="flex items-center gap-2 animate-in slide-in-from-left-2 duration-150">
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-500 font-semibold uppercase">
              Cotação
            </span>
            <input
              type="number"
              value={usdToBrl}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                if (val > 0) setUsdToBrl(val);
              }}
              step="0.01"
              min="0.1"
              className="h-7 w-24 pl-14 pr-2 text-xs bg-gray-900 border border-gray-800 text-gray-200 rounded font-semibold focus:outline-none focus:border-primary tabular-nums"
              title="Taxa de câmbio de 1 USD para BRL"
            />
          </div>
          <span className="text-[10px] text-gray-500 font-medium">USD ➔ BRL</span>
        </div>
      )}
    </div>
  );
};
