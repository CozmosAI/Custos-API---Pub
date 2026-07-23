const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// The problematic snippet looks like this now:
//                   <span className="text-emerald-400 font-bold">{getFormattedTokenPrice(selectedModel.outputUSD)}</span>
//                 </div>
//                   <div className="flex items-center justify-between border-t border-slate-800/30 pt-1.5 mt-1.5 text-xs text-emerald-400 font-medium">
//                     <span className="flex items-center gap-1">
//                       <ShieldCheck className="h-3.5 w-3.5" />
//                       Cache de Prompt:
//                     </span>
//                   </div>
//                 ) : (
//                   <div className="text-[11px] text-slate-500 italic text-right border-t border-slate-800/20 pt-1">
//                     Sem cache de prompt
//                   </div>
//                 )}
//               </div>

code = code.replace(/<div className="flex items-center justify-between border-t border-slate-800\/30 pt-1\.5 mt-1\.5 text-xs text-emerald-400 font-medium">[\s\S]*?Sem cache de prompt[\s\S]*?<\/div>\s*\)\}/g, '');

fs.writeFileSync('src/App.tsx', code);
