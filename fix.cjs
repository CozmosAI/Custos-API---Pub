const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// 1. Remove cacheDiscount from MODELS
code = code.replace(/,\s*cacheDiscount:\s*[0-9.]+/g, '');
code = code.replace(/cacheDiscount\?:\s*number;\s*\/\/.*?$/gm, '');
code = code.replace(/cacheDiscount\?:\s*number;/g, '');

// 2. Replace the if-else block for caching with just the else body
const cacheBlockRegex = /if\s*\(usePromptCache\s*&&\s*cacheDiscount\s*>\s*0\)\s*\{[\s\S]*?\}\s*else\s*\{([\s\S]*?)\}/g;
code = code.replace(cacheBlockRegex, (match, elseBody) => {
  return elseBody.trim();
});

// Also there's one where custoSummary is used
const cacheBlockSummaryRegex = /if\s*\(usePromptCache\s*&&\s*cacheDiscount\s*>\s*0\)\s*\{[\s\S]*?\}\s*else\s*\{([\s\S]*?)\}/g;
code = code.replace(cacheBlockSummaryRegex, (match, elseBody) => {
  return elseBody.trim();
});

// 3. Remove usePromptCache from useState
code = code.replace(/const \[usePromptCache, setUsePromptCache\] = useState<boolean>\(true\);.*?\n/, '');

// 4. Remove usePromptCache from dependencies and configs
code = code.replace(/usePromptCache,/g, '');
code = code.replace(/<div>Cache:.*?<\/div>/g, '');
code = code.replace(/if \(parsedConfig\.usePromptCache !== undefined\).*?\n/g, '');

// 5. Replace period logic to match exactly what the user asked
const periodLogicOld = /let dailyLeadsIntake = leads;[\s\S]*?const mensagensSDR = Math\.max\(1, avgSdrMsgs\);/;

const periodLogicNew = `let leadsPorDia = leads;
    if (period === "semana") {
      leadsPorDia = leads / 7;
    } else if (period === "mês") {
      leadsPorDia = leads / 30;
    }

    const dailyLeadsIntake = leadsPorDia; // Keep variable for other uses if any
    const mensagensSDR = Math.max(1, avgSdrMsgs);`;

code = code.replace(periodLogicOld, periodLogicNew);

const periodSummaryOld = /const multiplicadorPeriodo = period === "dia"\s*\?\s*1\s*:\s*period === "semana"\s*\?\s*7\s*:\s*30;[\s\S]*?const maxLeadsNoOrcamento = Math\.max\(0, Math\.floor\(\(maxLeadsMensal \/ 30\) \* multiplicadorPeriodo\)\);/;

const periodSummaryNew = `const multiplicadorPeriodo = period === "dia" ? 1 : period === "semana" ? 7 : 30;

    const dailyFollowupMsgs = totalDailyFollowMsgs;
    const activeQueueSize = Math.round(dailyFollowupMsgs);

    // Custo SDR no período e mensal
    const sdrCustoNoPeriodo = leads * custoSDRPorLead;
    const sdrCustoMensal = leadsPorDia * 30 * custoSDRPorLead;

    // Custo Follow no período e mensal
    const followupCustoNoPeriodo = dailyFollowupMsgs * multiplicadorPeriodo * custoMensagemFollow;
    const followCustoMensal = dailyFollowupMsgs * 30 * custoMensagemFollow;

    // Custos Totais
    const custoPeriodo = sdrCustoNoPeriodo + followupCustoNoPeriodo;
    const custoMensal = sdrCustoMensal + followCustoMensal;

    // Custo Total por Lead (SDR + Follow-up do lifecycle completo)
    const custoFollowPorLead = calcMode === "regua"
      ? totalFollowCostPerLead
      : (leadsPorDia > 0 ? (dailyFollowupMsgs * custoMensagemFollow) / leadsPorDia : 0);

    const custoPorLead = custoSDRPorLead + custoFollowPorLead;
    const mensagensPorLead = avgSdrMsgs + totalFollowMsgsPerLead;

    // Orçamento convertido para BRL
    const orçamentoEmBRL = isUSD ? (budget * usdBrlRate) : budget;
    const maxLeadsMensal = Math.floor(orçamentoEmBRL / (custoPorLead || 0.0001));
    const maxLeadsNoOrcamento = Math.max(0, Math.floor((maxLeadsMensal / 30) * multiplicadorPeriodo));`;

code = code.replace(periodSummaryOld, periodSummaryNew);

fs.writeFileSync('src/App.tsx', code);
console.log("Done");
