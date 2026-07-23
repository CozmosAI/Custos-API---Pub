const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(/<span className="ml-1 text-\[10px\] bg-emerald-500\/10 text-emerald-400 px-1\.5 py-0\.5 rounded-sm border border-emerald-500\/20 font-bold">\s*Cached\s*<\/span>\s*\)\}/g, '');

// There is also another similar one
code = code.replace(/<span className="text-emerald-400 font-bold">-\{Math\.round\(\(1 - m\.cacheDiscount\) \* 100\)\}%<\/span>\s*\)\s*:\s*\(\s*<span className="text-slate-500">-<\/span>\s*\)\}/g, '');

code = code.replace(/<span className="text-emerald-400 font-bold">-\{Math\.round\(\(1 - m\.cacheDiscount\) \* 100\)\}%<\/span>\s*\)\s*:\s*\(\s*<span className="text-slate-500">-<\/span>\s*\)\}/g, '');

fs.writeFileSync('src/App.tsx', code);
