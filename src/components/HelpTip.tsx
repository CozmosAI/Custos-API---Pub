import React, { useState } from "react";
import { HelpCircle } from "lucide-react";

interface HelpTipProps {
  text: string;
}

export const HelpTip: React.FC<HelpTipProps> = ({ text }) => {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative inline-flex items-center ml-1">
      <button
        type="button"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onClick={() => setVisible(!visible)}
        className="text-gray-400 hover:text-gray-200 transition-colors p-0.5 focus:outline-none focus:ring-1 focus:ring-primary rounded"
      >
        <HelpCircle className="h-3 w-3" />
      </button>
      {visible && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50 w-52 p-2 bg-gray-900 border border-gray-800 text-[10px] text-gray-300 rounded shadow-xl pointer-events-none leading-relaxed animate-in fade-in-0 zoom-in-95 duration-100">
          {text}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
        </div>
      )}
    </div>
  );
};
