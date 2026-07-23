import React, { useEffect, useState } from "react";
import { useCurrency } from "../lib/store";

interface CurrencyFieldProps {
  id?: string;
  valueUSD: number;
  onChange: (valueUSD: number) => void;
  label?: string;
  step?: number;
  min?: number;
  className?: string;
}

export const CurrencyField: React.FC<CurrencyFieldProps> = ({
  id,
  valueUSD,
  onChange,
  label,
  step = 1,
  min = 0,
  className = "w-full",
}) => {
  const { currency, usdToBrl, symbol } = useCurrency();
  const [inputValue, setInputValue] = useState<string>("");

  // Convert USD to display value
  const getDisplayValue = (usd: number) => {
    if (currency === "BRL") {
      const val = usd * usdToBrl;
      return Number(val.toFixed(2)).toString();
    }
    return Number(usd.toFixed(2)).toString();
  };

  // Sync display value when valueUSD, currency, or exchange rate changes
  useEffect(() => {
    const displayVal = getDisplayValue(valueUSD);
    const parsedCurrent = parseFloat(inputValue);
    const parsedDisplay = parseFloat(displayVal);
    
    if (isNaN(parsedCurrent) || parsedCurrent !== parsedDisplay) {
      setInputValue(displayVal);
    }
  }, [valueUSD, currency, usdToBrl]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    setInputValue(rawValue);

    const numericValue = parseFloat(rawValue) || 0;
    const usdValue = currency === "BRL" ? numericValue / usdToBrl : numericValue;
    onChange(usdValue);
  };

  const handleBlur = () => {
    setInputValue(getDisplayValue(valueUSD));
  };

  return (
    <div className={`space-y-1 ${className}`}>
      {label && (
        <label className="text-xs text-gray-400 font-semibold flex items-center">
          {label}
        </label>
      )}
      <div className="relative">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-500">
          {symbol}
        </span>
        <input
          id={id}
          type="number"
          step={step}
          min={min}
          value={inputValue}
          onChange={handleInputChange}
          onBlur={handleBlur}
          className="w-full h-9 bg-gray-900 border border-gray-800 focus:border-primary text-gray-200 text-xs font-semibold pl-10 pr-2 rounded-lg focus:outline-none tabular-nums"
        />
      </div>
      {currency === "BRL" && (
        <p className="text-[10px] text-gray-500 font-medium leading-none">
          ≈ ${valueUSD.toFixed(2)} USD
        </p>
      )}
    </div>
  );
};
