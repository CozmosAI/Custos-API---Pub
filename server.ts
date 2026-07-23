import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

const app = express();
const PORT = 3000;

// Middleware to parse JSON
app.use(express.json());

// Lazy-initialized Gemini client
let aiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("A variável de ambiente 'GEMINI_API_KEY' não foi configurada. No Render, acesse Environment -> Add Environment Variable e adicione GEMINI_API_KEY com sua chave do Google AI Studio.");
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// API endpoint for AI SDR Consultant Advice
app.post("/api/recommend", async (req, res) => {
  try {
    const {
      leads,
      period,
      firstContactMessages,
      followUpDays,
      followUpMessagesPerDay,
      systemPromptChars,
      avgUserMessageChars,
      avgResponseChars,
      charsPerToken,
      inputPricePer1M,
      outputPricePer1M,
      cacheDiscount,
      useCache,
      monthlyBudget,
    } = req.body;

    // Validate inputs
    if (typeof leads !== "number" || typeof systemPromptChars !== "number") {
      res.status(400).json({ error: "Parâmetros inválidos ou incompletos para a análise." });
      return;
    }

    const ai = getGeminiClient();

    const messagesPerLead = firstContactMessages + followUpDays * followUpMessagesPerDay;
    const promptTokens = Math.ceil(systemPromptChars / charsPerToken);
    const userTokens = Math.ceil(avgUserMessageChars / charsPerToken);
    const responseTokens = Math.ceil(avgResponseChars / charsPerToken);

    // Build context-rich prompt for Gemini
    const systemPrompt = `Você é um Consultor Especialista em Arquitetura de IA, Engenharia de Prompt e Automação de Vendas (SDR/comercial) no n8n.
Seu objetivo é analisar as métricas de simulação de custo de um usuário e fornecer recomendações práticas, técnicas e estratégias de engenharia de prompt para reduzir o custo de API sem perder conversão.
Forneça as respostas em português do Brasil, em um tom profissional, amigável e direto ao ponto. Use formatação Markdown limpa com bullet points.`;

    const userMessage = `Por favor, analise a seguinte estrutura operacional de SDR por IA e recomende estratégias de economia:

--- METRICAS DO NEGÓCIO ---
- Leads Atuais: ${leads} por ${period === "day" ? "dia" : period === "week" ? "semana" : "mês"}
- Orçamento Mensal: $${monthlyBudget} USD
- Estrutura da Conversa: ${firstContactMessages} mensagens de primeiro contato, ${followUpDays} dias de follow-up, ${followUpMessagesPerDay} mensagens por dia de follow-up.
- Total de mensagens por lead: ${messagesPerLead} mensagens

--- TOKENS & TAMANHOS ---
- Tamanho do Prompt do Sistema (persona): ${systemPromptChars} caracteres (~${promptTokens} tokens)
- Tamanho Médio Mensagem do Lead: ${avgUserMessageChars} caracteres (~${userTokens} tokens)
- Tamanho Médio Resposta da IA: ${avgResponseChars} caracteres (~${responseTokens} tokens)
- Chars por Token (Português): ${charsPerToken}

--- PREÇO E CACHE ---
- Preço do Modelo: Input $${inputPricePer1M}/1M tokens, Output $${outputPricePer1M}/1M tokens
- Prompt Caching: ${useCache ? `Ativado (desconto de ${Math.round(cacheDiscount * 100)}% em tokens repetidos)` : "Desativado ou não suportado pelo modelo"}

Por favor, elabore um relatório consultivo conciso dividido em 3 seções curtas:
1. **Análise de Custos**: Identifique o maior driver de custo no cenário atual (ex: se é o tamanho do prompt do sistema, o número de follow-ups ou a falta de prompt caching). Seja quantitativo.
2. **Recomendações Práticas**: Forneça 3-4 dicas práticas específicas de como otimizar o fluxo no n8n (ex: usar um roteador de intenções com modelo menor, persistência em banco local de histórico para n8n, técnicas de compressão do prompt de sistema, etc.).
3. **Guia de Prompt Otimizado**: Dê um exemplo rápido ou estrutura de prompt de sistema (com placeholders) de como condensar regras longas em diretrizes compactas baseadas em restrições.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: userMessage,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.7,
      },
    });

    res.json({ recommendation: response.text });
  } catch (error: any) {
    console.error("Erro na API /api/recommend:", error);
    res.status(500).json({
      error: "Não foi possível obter a consultoria da IA. Certifique-se de configurar a chave da API Gemini.",
      details: error.message,
    });
  }
});

// API endpoint for general AI Chat Consultation & Auto-Calculation
app.post("/api/chat", async (req, res) => {
  try {
    const { messages, currentState, file } = req.body;

    if (!Array.isArray(messages)) {
      res.status(400).json({ error: "O parâmetro 'messages' deve ser um array." });
      return;
    }

    const ai = getGeminiClient();

    const systemPrompt = `Você é o Consultor Virtual Especialista em Custos de Inteligência Artificial para Negócios e Vendas.

DIRETRIZ DE COMUNICAÇÃO (MUITO IMPORTANTE):
O seu interlocutor é um empresário, gestor comercial ou vendedor que NÃO entende de programação nem de termos técnicos difíceis.
- Fale em português de forma extremamente simples, amigável e direta, como se estivesse conversando com alguém leigo ("como se eu não soubesse de nada").
- Evite jargões assustadores como "tokens", "API", "JSON", "Prompt Caching", "input/output" sem antes explicá-los de forma prática do mundo real (ex: "tokens são como a quantidade de palavras lidas e escritas", "cache é um desconto para quando a IA não precisa reler as regras do zero").
- Foque sempre no RESULTADO PRÁTICO do negócio: Custo mensal em Reais (R$), custo total por cliente atendido, e quantos clientes ele consegue atender com o orçamento dele.

ANÁLISE DE DOCUMENTOS E IMAGENS:
Se o usuário enviar uma imagem (ex: print do n8n, print de CRM, tabela de custos) ou um documento (PDF, texto), você deve analisar as informações visuais ou textuais contidas no arquivo para ajudar nos cálculos. Se for um fluxo de automação, tente estimar o número de chamadas de IA e o tamanho dos prompts com base no que você vê ou lê.

FUNCIONALIDADE DE APLICAR CONFIGURAÇÕES COM 1 CLIQUE:
Se o usuário descrever o projeto dele (ex: "Atendo 30 clientes por dia no WhatsApp, trocamos umas 5 mensagens cada e tenho 1 fluxo de acompanhamento de 10 dias..."), você deve calcular os valores e, NO FINAL da sua resposta, incluir OBRIGATORIAMENTE um bloco de código JSON especial no formato abaixo para que o simulador aplique os dados no painel com 1 clique:

\`\`\`json-apply
{
  "leads": 30,
  "period": "dia", // ou "semana" ou "mês"
  "avgSdrMsgs": 5,
  "promptSistema": 37728, // tamanho estimado do prompt de regras em caracteres
  "selectedModelId": "gemini-3-1-flash-lite", // modelos recomendados: gemini-3-1-flash-lite, gemini-2-5-flash, gemini-2-5-pro
  "selectedTier": "standard"
}
\`\`\`

Valores válidos para "selectedModelId":
- "gemini-3-1-flash-lite" (Ultra Barato & Mais Recomendado para Vendas/SDR)
- "gemini-2-5-flash" (Excelente para Atendimento Humano Natural)
- "gemini-2-5-pro" (Alta Inteligência para Vendas Complexas)
- "gemini-3-6-flash"
- "gemini-3-5-flash"
- "gemini-2-0-flash"

Estes são os valores e o estado atual do simulador do usuário, caso você queira fazer referência ou usá-los como base de comparação:
${JSON.stringify(currentState || {})}

Responda sempre em português brasileiro de forma amigável, clara e focada em resultados comerciais.`;

    const formattedContents = messages.map((m: any, index: number) => {
      const role = m.role === "assistant" ? "model" : m.role;
      const parts: any[] = [{ text: m.content || "" }];
      
      // Se for a última mensagem do usuário e houver um arquivo, anexa
      if (index === messages.length - 1 && role === "user" && file) {
        parts.push({
          inlineData: {
            mimeType: file.mimeType,
            data: file.data
          }
        });
      }

      return {
        role,
        parts
      };
    });

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: formattedContents,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.7,
      },
    });

    res.json({ reply: response.text });
  } catch (error: any) {
    console.error("Erro na API /api/chat:", error);
    res.status(500).json({
      error: "Erro ao processar conversa com a IA.",
      details: error.message
    });
  }
});

// Setup development or production build flows
async function main() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

main().catch((err) => {
  console.error("Failure starting the server:", err);
});
