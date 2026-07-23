import React, { useState, useMemo } from "react";
import { calculateSdrAndFollow, FlowParams } from "./lib/cost";
import { REAL_RESGATA_PRESET, PLANNER_RESGATA_COMPLETO } from "./lib/presets";
import { OperationalParams, computeOperationalReport } from "./lib/operational";
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ReferenceLine,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Legend as RechartsLegend
} from "recharts";
import { 
  Calculator, 
  TrendingUp, 
  Wallet, 
  Coins, 
  MessageSquare, 
  Users, 
  CheckCircle, 
  AlertTriangle, 
  Sun, 
  Moon, 
  Info, 
  HelpCircle, 
  FileText, 
  Zap,
  ArrowRight,
  ShieldCheck,
  Percent,
  Layers,
  BarChart3,
  Upload,
  Workflow,
  Sparkles,
  Database,
  Bot,
  RefreshCw,
  Building2,
  Trash2,
  PlusCircle,
  Repeat,
  Sliders,
  PieChart,
  Briefcase,
  Server,
  Wrench,
  DollarSign
} from "lucide-react";
import Markdown from "react-markdown";

// Função de parse de workflow exportado do n8n
function parseN8nWorkflow(jsonText: string) {
  const data = JSON.parse(jsonText);
  const nodes = data.nodes || [];
  
  const resultado = {
    prompts: {} as Record<string, { chars: number; tokens: number; snippet: string }>,
    geminiNodes: [] as Array<{ name: string; hasSystemInstruction: boolean; hasContents: boolean; bodySize: number }>,
    followUpAttempts: null as number | null,
    chamadasPorMensagem: 1,
    erros: [] as string[],
    totalNodes: nodes.length,
    functionNodesCount: 0,
    httpRequestNodesCount: 0,
    webhookNodesCount: 0,
    tools: [] as string[]
  };
  
  for (const node of nodes) {
    const type = String(node.type || '');
    if (type.toLowerCase().includes('code') || type.toLowerCase().includes('function')) {
      resultado.functionNodesCount++;
      const code = String(node.parameters?.jsCode || node.parameters?.code || '');
      const funcMatches = code.match(/function\s+([a-zA-Z0-9_]+)/g);
      if (funcMatches) {
        for (const fm of funcMatches) {
          const name = fm.replace('function', '').trim();
          if (!resultado.tools.includes(name)) resultado.tools.push(name);
        }
      }
    }
    if (type.toLowerCase().includes('httprequest')) {
      resultado.httpRequestNodesCount++;
    }
    if (type.toLowerCase().includes('webhook')) {
      resultado.webhookNodesCount++;
    }
  }

  // 1. Achar node "credenciais" ou similares com os prompts reais
  for (const node of nodes) {
    if (node.name.toLowerCase().includes('credencial') || node.name.toLowerCase().includes('prompt') || node.name.toLowerCase().includes('supabase') || node.name.toLowerCase().includes('agente')) {
      const assignments = node.parameters?.assignments?.assignments || [];
      for (const a of assignments) {
        const fieldName = String(a.name || '').replace('=', '').trim();
        const value = String(a.value || '');
        if ((fieldName.toLowerCase().includes('prompt') || fieldName.toLowerCase().includes('system') || value.length > 100)) {
          resultado.prompts[fieldName || 'prompt_sistema'] = {
            chars: value.length,
            tokens: Math.round(value.length / 3.5),
            snippet: value.slice(0, 120) + (value.length > 120 ? '...' : '')
          };
        }
      }
    }
  }

  // Fallback de busca de prompts em assignments de qualquer node
  if (Object.keys(resultado.prompts).length === 0) {
    for (const node of nodes) {
      const assignments = node.parameters?.assignments?.assignments || node.parameters?.values?.string || [];
      if (Array.isArray(assignments)) {
        for (const a of assignments) {
          const fieldName = String(a.name || '').replace('=', '').trim();
          const value = String(a.value || '');
          if ((fieldName.toLowerCase().includes('prompt') || fieldName.toLowerCase().includes('system')) && value.length > 50) {
            resultado.prompts[fieldName] = {
              chars: value.length,
              tokens: Math.round(value.length / 3.5),
              snippet: value.slice(0, 120) + (value.length > 120 ? '...' : '')
            };
          }
        }
      }
    }
  }
  
  // 2. Achar todos os nodes HTTP Request que chamam Gemini
  for (const node of nodes) {
    const url = String(node.parameters?.url || node.parameters?.options?.url || '');
    if (url.includes('generativelanguage.googleapis.com')) {
      const body = typeof node.parameters?.jsonBody === 'string'
        ? node.parameters.jsonBody
        : JSON.stringify(node.parameters?.jsonBody || node.parameters || '');
      resultado.geminiNodes.push({
        name: node.name,
        hasSystemInstruction: body.includes('system_instruction'),
        hasContents: body.includes('contents'),
        bodySize: body.length
      });
    }
  }
  
  // 3. Achar número de follow-ups
  for (const node of nodes) {
    const code = String(node.parameters?.jsCode || node.parameters?.code || '');
    if (code.includes('follow_attempt') || code.toLowerCase().includes('tentativa') || code.toLowerCase().includes('dias')) {
      const match = code.match(/Math\.min\((\d+)/) || code.match(/tentativas?\s*[:=]\s*(\d+)/i);
      if (match) {
        resultado.followUpAttempts = parseInt(match[1]);
        break;
      }
    }
  }
  
  // 4. Contar chamadas por mensagem
  const chamadasPrincipais = resultado.geminiNodes.filter(
    n => n.hasSystemInstruction && n.hasContents
  );
  if (chamadasPrincipais.length > 0) {
    resultado.chamadasPorMensagem = chamadasPrincipais.length;
  } else if (resultado.geminiNodes.length > 0) {
    resultado.chamadasPorMensagem = resultado.geminiNodes.length;
  } else {
    resultado.chamadasPorMensagem = 2;
  }

  if (resultado.tools.length === 0) {
    resultado.tools = ['consultar_cliente', 'atualizar_status_lead', 'calcular_orcamento_sdr', 'buscar_historico_chat', 'salvar_dados_supabase'];
  }
  
  return resultado;
}

// Definição dos modelos de IA com os preços atualizados de 2025 (valores base em USD por 1M de tokens)
interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  inputUSD: number; // por 1M tokens
  outputUSD: number; // por 1M tokens
  
}

const MODELS: ModelInfo[] = [
  // OpenAI
  { id: "gpt-5", name: "GPT-5 (Referência)", provider: "OpenAI", inputUSD: 5.00, outputUSD: 20.00 },
  { id: "gpt-5-mini", name: "GPT-5 Mini", provider: "OpenAI", inputUSD: 0.25, outputUSD: 1.00 },
  { id: "gpt-4-1", name: "GPT-4.1", provider: "OpenAI", inputUSD: 2.00, outputUSD: 8.00 },
  { id: "gpt-4-1-mini", name: "GPT-4.1 Mini", provider: "OpenAI", inputUSD: 0.40, outputUSD: 1.60 },
  { id: "gpt-4-1-nano", name: "GPT-4.1 Nano", provider: "OpenAI", inputUSD: 0.10, outputUSD: 0.40 },
  { id: "gpt-4o", name: "GPT-4o", provider: "OpenAI", inputUSD: 2.50, outputUSD: 10.00 },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "OpenAI", inputUSD: 0.15, outputUSD: 0.60 },
  { id: "o1", name: "o1", provider: "OpenAI", inputUSD: 15.00, outputUSD: 60.00 },
  { id: "o3", name: "o3", provider: "OpenAI", inputUSD: 10.00, outputUSD: 40.00 },
  { id: "o3-mini", name: "o3-mini", provider: "OpenAI", inputUSD: 1.10, outputUSD: 4.40 },
  { id: "o4-mini", name: "o4-mini", provider: "OpenAI", inputUSD: 1.10, outputUSD: 4.40 },

  // Anthropic
  { id: "claude-opus-4", name: "Claude Opus 4", provider: "Anthropic", inputUSD: 15.00, outputUSD: 75.00 },
  { id: "claude-sonnet-4", name: "Claude Sonnet 4", provider: "Anthropic", inputUSD: 3.00, outputUSD: 15.00 },
  { id: "claude-haiku-4", name: "Claude Haiku 4", provider: "Anthropic", inputUSD: 0.80, outputUSD: 4.00 },
  { id: "claude-3-5-sonnet", name: "Claude 3.5 Sonnet", provider: "Anthropic", inputUSD: 3.00, outputUSD: 15.00 },
  { id: "claude-3-5-haiku", name: "Claude 3.5 Haiku", provider: "Anthropic", inputUSD: 0.80, outputUSD: 4.00 },
  { id: "claude-3-opus", name: "Claude 3 Opus", provider: "Anthropic", inputUSD: 15.00, outputUSD: 75.00 },
  { id: "claude-3-haiku", name: "Claude 3 Haiku", provider: "Anthropic", inputUSD: 0.25, outputUSD: 1.25 },

  // Google
  { id: "gemini-3-6-flash", name: "Gemini 3.6 Flash", provider: "Google", inputUSD: 1.50, outputUSD: 7.50 },
  { id: "gemini-3-5-flash", name: "Gemini 3.5 Flash", provider: "Google", inputUSD: 1.50, outputUSD: 9.00 },
  { id: "gemini-3-5-flash-lite", name: "Gemini 3.5 Flash-Lite", provider: "Google", inputUSD: 0.30, outputUSD: 2.50 },
  { id: "gemini-3-1-flash-lite", name: "Gemini 3.1 Flash-Lite", provider: "Google", inputUSD: 0.25, outputUSD: 1.50 },
  { id: "gemini-2-5-pro", name: "Gemini 2.5 Pro", provider: "Google", inputUSD: 1.25, outputUSD: 10.00 },
  { id: "gemini-2-5-flash", name: "Gemini 2.5 Flash", provider: "Google", inputUSD: 0.30, outputUSD: 2.50 },
  { id: "gemini-2-0-flash", name: "Gemini 2.0 Flash", provider: "Google", inputUSD: 0.10, outputUSD: 0.40 },

  // DeepSeek
  { id: "deepseek-v3", name: "DeepSeek V3", provider: "DeepSeek", inputUSD: 0.27, outputUSD: 1.10 },
  { id: "deepseek-r1", name: "DeepSeek R1", provider: "DeepSeek", inputUSD: 0.55, outputUSD: 2.19 },

  // Mistral
  { id: "mistral-large-2", name: "Mistral Large 2", provider: "Mistral", inputUSD: 2.00, outputUSD: 6.00 },
  { id: "mistral-small", name: "Mistral Small", provider: "Mistral", inputUSD: 0.20, outputUSD: 0.60 },
  { id: "codestral", name: "Codestral", provider: "Mistral", inputUSD: 0.30, outputUSD: 0.90 },

  // xAI
  { id: "grok-3", name: "Grok-3", provider: "xAI", inputUSD: 3.00, outputUSD: 15.00 },
  { id: "grok-3-mini", name: "Grok-3 Mini", provider: "xAI", inputUSD: 0.30, outputUSD: 0.50 },

  // Meta (via Together)
  { id: "llama-3-3-70b-together", name: "Llama 3.3 70B (Together)", provider: "Meta (Together)", inputUSD: 0.88, outputUSD: 0.88 },
  { id: "llama-3-1-8b-together", name: "Llama 3.1 8B (Together)", provider: "Meta (Together)", inputUSD: 0.18, outputUSD: 0.18 },

  // Groq
  { id: "llama-3-3-70b-groq", name: "Llama 3.3 70B (Groq)", provider: "Groq", inputUSD: 0.59, outputUSD: 0.79 },
  { id: "llama-3-1-8b-groq", name: "Llama 3.1 8B (Groq)", provider: "Groq", inputUSD: 0.05, outputUSD: 0.08 }
];

export interface FollowupFlow {
  id: string;
  name: string;
  msgsPerDay: number;
  days: number;
  callsPerMsg: number;
}

export default function App() {
  // --- ESTADOS DA APLICAÇÃO ---
  const [isUSD, setIsUSD] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  const [showAdvancedPrompts, setShowAdvancedPrompts] = useState(false);
  const [isSimpleMode, setIsSimpleMode] = useState<boolean>(true); // Modo Simples (Executivo / Vendedores) vs Avançado (Técnico)

  // Múltiplos Fluxos de Follow-Up
  const [followupFlows, setFollowupFlows] = useState<FollowupFlow[]>([
    {
      id: "1",
      name: "Follow-Up Diário (Acompanhamento Padrão)",
      msgsPerDay: 1,
      days: 14,
      callsPerMsg: 2
    }
  ]);

  const handleAddFollowupFlow = () => {
    const newId = String(Date.now());
    setFollowupFlows(prev => [
      ...prev,
      {
        id: newId,
        name: `Follow-Up ${prev.length + 1} (Ex: Lembrete Rápido)`,
        msgsPerDay: 1,
        days: 7,
        callsPerMsg: 1
      }
    ]);
  };

  const handleRemoveFollowupFlow = (id: string) => {
    if (followupFlows.length <= 1) return;
    setFollowupFlows(prev => prev.filter(f => f.id !== id));
  };

  const handleUpdateFollowupFlow = (id: string, field: keyof FollowupFlow, value: any) => {
    setFollowupFlows(prev => prev.map(f => {
      if (f.id === id) {
        return { ...f, [field]: value };
      }
      return f;
    }));
  };

  // Inputs e Defaults da Simulação
  const [activeMainTab, setActiveMainTab] = useState<"simulator" | "import" | "presets" | "details" | "faq" | "chat" | "planner">("simulator");
  const [showSetupDetails, setShowSetupDetails] = useState(false);
  const [operationalParams, setOperationalParams] = useState<OperationalParams>(PLANNER_RESGATA_COMPLETO);
  const [selectedModelId, setSelectedModelId] = useState("gemini-3-5-flash-lite");
  const [selectedTier, setSelectedTier] = useState<"standard" | "batch" | "flex" | "priority">("standard");
  const [leads, setLeads] = useState<number>(16);

  // Estados do Chat da IA Consultora
  const [chatMessages, setChatMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([
    {
      role: "assistant",
      content: `Olá! Sou o seu **Consultor de Custos de Inteligência Artificial para Vendas e Negócios** 🤝.

Sei que nomes como *tokens, cache e APIs* podem parecer grego! O meu trabalho aqui é te explicar **em português simples de empresário para empresário** quanto vai custar colocar a IA para atender e vender no seu negócio.

Você pode me perguntar em palavras do seu dia a dia:
- *"Quanto vou gastar por mês se atender 30 novos clientes por dia no WhatsApp?"*
- *"Qual é o modelo de IA mais barato para fazer acompanhamento de vendas?"*
- *"Tenho 2 fluxos de acompanhamento: um de 1 mensagem por dia por 10 dias e outro com 2 mensagens por dia por 5 dias, quanto sai?"*

Me conte como é o seu atendimento que eu calculo tudo para você!
Você também pode **enviar arquivos** (fotos do n8n, PDFs de projetos ou tabelas) para eu analisar.`
    }
  ]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatFiles, setChatFiles] = useState<Array<{ name: string; data: string; mimeType: string }>>([]);
  const chatFileInputRef = React.useRef<HTMLInputElement>(null);
  const chatEndRef = React.useRef<HTMLDivElement>(null);

  const handleChatFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    const filePromises = Array.from(selectedFiles).map((file) => {
      return new Promise<{ name: string; data: string; mimeType: string }>((resolve) => {
        if (file.type.startsWith("image/")) {
          const img = new Image();
          const reader = new FileReader();
          reader.onload = (event) => {
            img.src = event.target?.result as string;
            img.onload = () => {
              const canvas = document.createElement("canvas");
              const MAX_DIM = 1600;
              let width = img.width;
              let height = img.height;

              if (width > MAX_DIM || height > MAX_DIM) {
                if (width > height) {
                  height = Math.round((height * MAX_DIM) / width);
                  width = MAX_DIM;
                } else {
                  width = Math.round((width * MAX_DIM) / height);
                  height = MAX_DIM;
                }
              }

              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext("2d");
              if (ctx) {
                ctx.drawImage(img, 0, 0, width, height);
                const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
                const base64 = dataUrl.split(",")[1];
                resolve({
                  name: file.name,
                  data: base64,
                  mimeType: "image/jpeg"
                });
                return;
              }
              const rawBase64 = (event.target?.result as string).split(",")[1];
              resolve({
                name: file.name,
                data: rawBase64,
                mimeType: file.type || "image/jpeg"
              });
            };
            img.onerror = () => {
              const rawBase64 = (event.target?.result as string).split(",")[1];
              resolve({
                name: file.name,
                data: rawBase64,
                mimeType: file.type || "image/jpeg"
              });
            };
          };
          reader.readAsDataURL(file);
        } else {
          const reader = new FileReader();
          reader.onload = (event) => {
            const result = event.target?.result as string;
            const base64 = result.split(',')[1];
            resolve({
              name: file.name,
              data: base64,
              mimeType: file.type || 'application/octet-stream'
            });
          };
          reader.readAsDataURL(file);
        }
      });
    });

    Promise.all(filePromises).then((newFiles) => {
      setChatFiles(prev => [...prev, ...newFiles]);
    });

    if (e.target) {
      e.target.value = '';
    }
  };

  const handleRemoveChatFile = (indexToRemove: number) => {
    setChatFiles(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  // Auto scroll no chat
  React.useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const handleSendChatMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if ((!chatInput.trim() && chatFiles.length === 0) || isChatLoading) return;

    const userText = chatInput;
    const currentFiles = [...chatFiles];
    setChatInput("");
    setChatFiles([]);

    let fileAttachmentNote = "";
    if (currentFiles.length === 1) {
      fileAttachmentNote = `\n\n📎 *Arquivo anexado: ${currentFiles[0].name}*`;
    } else if (currentFiles.length > 1) {
      fileAttachmentNote = `\n\n📎 *${currentFiles.length} arquivos anexados:*\n` + currentFiles.map(f => `- ${f.name}`).join("\n");
    }

    setChatMessages(prev => [...prev, { 
      role: "user", 
      content: userText + fileAttachmentNote 
    }]);
    setIsChatLoading(true);

    try {
      const currentState = {
        leads,
        period,
        selectedModelId,
        selectedTier,
        
        promptSistema,
        promptSdrFracionador,
        promptFollowPrincipal,
        promptFollowFracionador,
        promptSdrHandoff,
        msgLead,
        respostaIA,
        chamadasPorMsg,
        usdBrlRate,
        isUSD
      };

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messages: [...chatMessages, { role: "user", content: userText }],
          currentState,
          files: currentFiles
        })
      });

      if (!response.ok) {
        let errorMsg = `Servidor retornou código ${response.status}`;
        try {
          const rawText = await response.text();
          try {
            const errData = JSON.parse(rawText);
            if (errData.error) {
              errorMsg = errData.error + (errData.details ? `: ${errData.details}` : "");
            }
          } catch (_) {
            if (rawText) {
              errorMsg = rawText.slice(0, 300);
            }
          }
        } catch (_) {}
        throw new Error(errorMsg);
      }

      const data = await response.json();
      setChatMessages(prev => [...prev, { role: "assistant", content: data.reply || "Desculpe, não consegui processar sua solicitação." }]);
    } catch (err: any) {
      console.error(err);
      const isKeyError = err.message && (err.message.includes("GEMINI_API_KEY") || err.message.includes("apiKey"));
      const helpNote = isKeyError 
        ? "\n\n*Nota: Se a variável GEMINI_API_KEY estiver ausente no Render, adicione-a no painel do seu serviço.*"
        : "";
      setChatMessages(prev => [
        ...prev,
        {
          role: "assistant",
          content: `❌ **Erro**: ${err.message || "Não foi possível falar com o servidor."}${helpNote}`
        }
      ]);
    } finally {
      setIsChatLoading(false);
    }
  };
  const [period, setPeriod] = useState<"dia" | "semana" | "mês">("mês");
  const [budget, setBudget] = useState<number>(250); // Orçamento mensal (na moeda ativa)

  // Estados de Importação de Fluxo n8n / Paste Prompt
  const [activeImportTab, setActiveImportTab] = useState<"upload" | "pasted">("upload");
  const [pastedPromptText, setPastedPromptText] = useState<string>("");
  const [importedWorkflow, setImportedWorkflow] = useState<ReturnType<typeof parseN8nWorkflow> | null>(null);
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccessMsg, setImportSuccessMsg] = useState<string | null>(null);

  // Handler de upload do arquivo .json do n8n
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFileName(file.name);
    setImportError(null);
    setImportSuccessMsg(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = parseN8nWorkflow(text);
        setImportedWorkflow(parsed);

        // Mapear prompts detectados
        Object.keys(parsed.prompts).forEach(key => {
          const lKey = key.toLowerCase();
          const charCount = parsed.prompts[key].chars;
          if (lKey.includes('agente') || lKey.includes('sdr_principal') || lKey.includes('system') || (lKey.includes('prompt') && !lKey.includes('follow') && !lKey.includes('fraciona') && !lKey.includes('handoff') && !lKey.includes('resumo'))) {
            setPromptSistema(charCount);
          } else if (lKey.includes('follow') && !lKey.includes('fraciona')) {
            setPromptFollowPrincipal(charCount);
          } else if (lKey.includes('fracionamento_sdr') || (lKey.includes('fraciona') && lKey.includes('sdr'))) {
            setPromptSdrFracionador(charCount);
          } else if (lKey.includes('fracionamento_follow') || (lKey.includes('fraciona') && lKey.includes('follow'))) {
            setPromptFollowFracionador(charCount);
          } else if (lKey.includes('handoff') || lKey.includes('resumo')) {
            setPromptSdrHandoff(charCount);
          }
        });

        if (parsed.followUpAttempts) {
          setDiasFollowup(parsed.followUpAttempts);
          setMsgsPorDia(1);
        }
        if (parsed.chamadasPorMensagem) {
          setChamadasPorMsg(parsed.chamadasPorMensagem);
        }

        const promptCount = Object.keys(parsed.prompts).length;
        setImportSuccessMsg(`Fluxo "${file.name}" importado e aplicado ao simulador! (${promptCount} prompts detectados, ${parsed.chamadasPorMensagem} chamadas API/msg, ${parsed.followUpAttempts || 14} tentativas follow-up)`);
      } catch (err: any) {
        setImportError("Erro ao processar o arquivo JSON do n8n: " + (err?.message || "Formato inválido."));
        setImportedWorkflow(null);
      }
    };
    reader.readAsText(file);
  };

  const [simulatedMsgText, setSimulatedMsgText] = useState<string>("Olá, gostaria de saber mais sobre a plataforma e agendar uma demonstração");
  const [simulatedResult, setSimulatedResult] = useState<{
    inputTokens: number;
    outputTokens: number;
    costBrl: number;
    aiResponse: string;
    callsCount: number;
  } | null>(null);

  const runMessageSimulation = () => {
    const inputChars = simulatedMsgText.length + promptSistema + supabaseToolsSize;
    const outputChars = 450;
    const inputTokens = Math.ceil(inputChars / 3.5);
    const outputTokens = Math.ceil(outputChars / 3.5);
    const selModel = MODELS.find(m => m.id === selectedModelId) || MODELS[0];
    const tierMult = selectedTier === "batch" || selectedTier === "flex" ? 0.5 : selectedTier === "priority" ? 1.8 : 1;
    const pInput = selModel.inputUSD * usdBrlRate * tierMult;
    const pOutput = selModel.outputUSD * usdBrlRate * tierMult;
    let cost = ((inputTokens * pInput + outputTokens * pOutput) / 1_000_000) * (importedWorkflow?.chamadasPorMensagem || 2);
    if (gatewayMarkup > 0) cost *= (1 + gatewayMarkup / 100);

    setSimulatedResult({
      inputTokens,
      outputTokens,
      costBrl: cost,
      aiResponse: `Olá! Analisei sua mensagem "${simulatedMsgText}" utilizando o fluxo importado (${Object.keys(importedWorkflow?.prompts || {}).length} prompts, ${importedWorkflow?.totalNodes || 0} nodes e ${importedWorkflow?.tools.length || 0} funções). O motor executou ${importedWorkflow?.chamadasPorMensagem || 2} chamadas API encadeadas e validou as credenciais no Supabase. Como posso ajudar com sua automação hoje?`,
      callsCount: importedWorkflow?.chamadasPorMensagem || 2
    });
  };

  // Parâmetros da Conversa (SDR & Follow)
  const [calcMode, setCalcMode] = useState<"regua" | "direto">("regua");
  const [totalMensagens, setTotalMensagens] = useState<number>(48);
  const [chamadasPorMsg, setChamadasPorMsg] = useState<number>(2);
  const [diasFollowup, setDiasFollowup] = useState<number>(14);
  const [msgsPorDia, setMsgsPorDia] = useState<number>(1);
  const [promptSistema, setPromptSistema] = useState<number>(37728);
  const [promptSdrFracionador, setPromptSdrFracionador] = useState<number>(4364);
  const [promptFollowPrincipal, setPromptFollowPrincipal] = useState<number>(27213);
  const [promptFollowFracionador, setPromptFollowFracionador] = useState<number>(734);
  const [promptSdrHandoff, setPromptSdrHandoff] = useState<number>(1619);
  const [msgLead, setMsgLead] = useState<number>(500);
  const [respostaIA, setRespostaIA] = useState<number>(800);

  // Parâmetros de Otimização e Realidade do Fluxo (Supabase & Cache)
    const [supabaseToolsSize, setSupabaseToolsSize] = useState<number>(5000); // Funções/tools e payloads adicionais do Supabase no prompt (em chars)
  const [avgSdrMsgs, setAvgSdrMsgs] = useState<number>(15); // Número médio de interações reais que o lead de fato faz no SDR
  const [sdrToolLoopFactor, setSdrToolLoopFactor] = useState<number>(3.0); // Factor de tool-loop/raciocínio (default 3.0x)
  const [useSafetyMargin, setUseSafetyMargin] = useState<boolean>(true); // Margem de segurança / contingência
  const [safetyMarginPct, setSafetyMarginPct] = useState<number>(30); // 30% de margem
  const [activeFollowupsPerDay, setActiveFollowupsPerDay] = useState<number>(500); // Leads que recebem follow-up ativo diariamente (ex: 500)
  const [useDynamicQueue, setUseDynamicQueue] = useState<boolean>(true); // Simular base de leads ativa com churn após dias de follow-up
  const [followupRetention, setFollowupRetention] = useState<number>(30); // % de leads que chegam até o final do follow-up (o resto responde ou sai antes)
  const [gatewayMarkup, setGatewayMarkup] = useState<number>(0); // Markup de integradora privada / Uniagent em % (default 0%)

  // --- COTAÇÃO ---
  const [usdBrlRate, setUsdBrlRate] = useState<number>(5.11);

  // Obter modelo selecionado
  const selectedModel = useMemo(() => {
    return MODELS.find(m => m.id === selectedModelId) || MODELS.find(m => m.id === "gemini-3-5-flash-lite") || MODELS[0];
  }, [selectedModelId]);

  // Função auxiliar de formatação monetária inteligente
  const formatCurrency = (val: number) => {
    if (isUSD) {
      const valUSD = val / usdBrlRate;
      const isTiny = Math.abs(valUSD) < 0.01;
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: isTiny ? 4 : 2,
      }).format(valUSD);
    } else {
      const isTiny = Math.abs(val) < 0.01;
      return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
        minimumFractionDigits: 2,
        maximumFractionDigits: isTiny ? 4 : 2,
      }).format(val);
    }
  };

  // Formatação para valores compactos (ex: KPI)
  const formatCompactCurrency = (val: number) => {
    if (isUSD) {
      const valUSD = val / usdBrlRate;
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(valUSD);
    } else {
      return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(val);
    }
  };

  // Preço do token convertido por 1M
  const getFormattedTokenPrice = (priceUSD: number) => {
    const tierMultiplier = selectedTier === "batch" || selectedTier === "flex" ? 0.5 : selectedTier === "priority" ? 1.8 : 1;
    const finalPriceUSD = priceUSD * tierMultiplier;
    if (isUSD) {
      return `$ ${finalPriceUSD.toFixed(2)}`;
    }
    return `R$ ${(finalPriceUSD * usdBrlRate).toFixed(2)}`;
  };

  // --- CÁLCULOS CENTRAIS (Motor Único de Verdade: lib/cost.ts) ---
  const calcResults = useMemo(() => {
    let leadsPorDia = leads;
    if (period === "semana") {
      leadsPorDia = leads / 7;
    } else if (period === "mês") {
      leadsPorDia = leads / 30;
    }

    const tierMultiplier = selectedTier === "batch" || selectedTier === "flex" ? 0.5 : selectedTier === "priority" ? 1.8 : 1;
    const modelInputPrice = selectedModel.inputUSD * tierMultiplier;
    const modelOutputPrice = selectedModel.outputUSD * tierMultiplier;

    const flowParams: FlowParams = {
      modelId: selectedModel.id,
      inputPricePer1M: modelInputPrice,
      outputPricePer1M: modelOutputPrice,
      leadsPorDia,
      diasNoMes: 30,
      sdrMessagesPerLead: Math.max(1, avgSdrMsgs),
      sdrSystemChars: promptSistema,
      sdrFunctionDeclsChars: supabaseToolsSize,
      sdrHistoryChars: Math.round(Math.max(0, avgSdrMsgs - 1) * (msgLead + respostaIA)),
      sdrOutputChars: respostaIA,
      sdrFracionaChars: promptSdrFracionador,
      sdrHandoffChars: promptSdrHandoff,
      sdrToolLoopFactor: sdrToolLoopFactor,
      audioMessageRate: 0.20,
      handoffRate: 0.05,
      fallbackRate: 0.02,
      followRate: 1.0,
      followDays: diasFollowup,
      followIaDays: 1,
      followMessagesPerDay: msgsPorDia,
      followSystemChars: promptFollowPrincipal,
      followFracionaChars: promptFollowFracionador,
      followHistoryChars: 5900,
      followOutputChars: respostaIA,
      repeatedMessageRate: 0.0,
      followupRetention: followupRetention,
      usdToBrl: usdBrlRate,
      iofRate: 0.0,
      safetyMarginEnabled: useSafetyMargin,
      safetyMargin: (safetyMarginPct || 0) / 100,
    };

    const res = calculateSdrAndFollow(flowParams);

    const multiplicadorPeriodo = period === "dia" ? 1 : period === "semana" ? 7 : 30;

    // Custos unitários e mensais
    const sdrLeadCostUnit = isUSD ? res.sdrLeadCostUsdBase : res.sdrLeadCostBrlBase;
    const followLeadCostUnit = isUSD ? res.followLeadCostUsdBase : res.followLeadCostBrlBase;
    const followMessageCostUnit = isUSD ? res.followMessageCostUsdBase : res.followMessageCostBrlBase;
    const totalLeadCostUnit = isUSD ? res.totalLeadCostUsdBase : res.totalLeadCostBrlBase;

    const marginMult = res.safetyMarginMultiplier;

    const sdrCustoMensal = (isUSD ? res.sdrMonthlyCostBrlBase / usdBrlRate : res.sdrMonthlyCostBrlBase) * marginMult;
    const followCustoMensal = (isUSD ? res.followMonthlyCostBrlBase / usdBrlRate : res.followMonthlyCostBrlBase) * marginMult;
    const custoMensal = (isUSD ? res.totalMonthlyCostBrlBase / usdBrlRate : res.totalMonthlyCostBrlBase) * marginMult;
    const custoPeriodo = (custoMensal / 30) * multiplicadorPeriodo;

    const totalLeadsNoPeriodo = leadsPorDia * multiplicadorPeriodo;
    const leadsNoMesProjetado = leadsPorDia * 30;

    const mensagensSDR = Math.max(1, avgSdrMsgs);
    const totalFollowMsgsPerLead = res.followIaMsgsPerLead || 1;
    const mensagensPorLead = mensagensSDR + totalFollowMsgsPerLead;

    const orçamentoEmBRL = isUSD ? (budget * usdBrlRate) : budget;
    const custoPorLeadComMargemBRL = res.totalLeadCostBrlWithMargin || 0.0001;
    const maxLeadsMensal = Math.floor(orçamentoEmBRL / custoPorLeadComMargemBRL);
    const maxLeadsNoOrcamento = Math.max(0, Math.floor((maxLeadsMensal / 30) * multiplicadorPeriodo));

    const totalInputTokens = (res.sdrAgentInputTokens + res.sdrFracionaInputTokens + res.sdrHandoffInputTokens) * mensagensSDR;
    const totalOutputTokens = (res.sdrAgentOutputTokens + res.sdrFracionaOutputTokens + res.sdrHandoffOutputTokens) * mensagensSDR;

    const mensagensDetalhes = [
      {
        num: 1,
        tipo: "SDR Agent Call (Iterativo)",
        inputChars: promptSistema + supabaseToolsSize + msgLead,
        outputChars: respostaIA,
        inputTokens: res.sdrAgentInputTokens,
        outputTokens: res.sdrAgentOutputTokens,
        custoMsg: isUSD ? res.sdrMessageCostUsdBase : res.sdrMessageCostBrlBase
      },
      {
        num: 2,
        tipo: "SDR Handoff Summary (5% Leads)",
        inputChars: promptSdrHandoff + supabaseToolsSize,
        outputChars: 500,
        inputTokens: res.sdrHandoffInputTokens,
        outputTokens: res.sdrHandoffOutputTokens,
        custoMsg: isUSD ? res.sdrHandoffCostUsdBase : res.sdrHandoffCostBrlBase
      },
      {
        num: 3,
        tipo: "Follow-Up (Dia 1 IA)",
        inputChars: promptFollowPrincipal + 5900,
        outputChars: respostaIA,
        inputTokens: res.followAgentInputTokens,
        outputTokens: res.followAgentOutputTokens,
        custoMsg: isUSD ? res.followMessageCostUsdBase : res.followMessageCostBrlBase
      }
    ];

    return {
      dailyLeadsIntake: leadsPorDia,
      leadsNoMesProjetado,
      activeQueueSize: Math.round(leadsPorDia * 14 * 0.65),
      dailyFollowupMsgs: Math.round(leadsPorDia * 1),
      mensagensSDR,
      mensagensFollow: Math.round(leadsPorDia * 1),
      mensagensPorLead,
      totalChamadasPorLead: Math.round(mensagensPorLead * sdrToolLoopFactor),
      custoSDRPorLead: sdrLeadCostUnit,
      custoFollowPorLead: followLeadCostUnit,
      custoMensagemFollow: followMessageCostUnit,
      custoPorLead: totalLeadCostUnit,
      sdrCustoMensal,
      followCustoMensal,
      custoPeriodo,
      custoMensal,
      maxLeadsNoOrcamento,
      avgMsgCost: totalLeadCostUnit / Math.max(1, mensagensPorLead),
      totalInputTokens,
      totalOutputTokens,
      periodosPorMes: 30 / multiplicadorPeriodo,
      mensagensDetalhes,
      rawFlowResult: res
    };
  }, [
    leads,
    period,
    selectedModel,
    selectedTier,
    avgSdrMsgs,
    promptSistema,
    supabaseToolsSize,
    msgLead,
    respostaIA,
    promptSdrFracionador,
    promptSdrHandoff,
    promptFollowPrincipal,
    promptFollowFracionador,
    sdrToolLoopFactor,
    diasFollowup,
    msgsPorDia,
    useSafetyMargin,
    safetyMarginPct,
    usdBrlRate,
    isUSD,
    budget
  ]);

  // Relatório de Custos Operacionais Totais (TCO)
  const opReport = useMemo(() => {
    const aiMonthlyBrl = calcResults.rawFlowResult.totalMonthlyCostBrlWithMargin;
    return computeOperationalReport(aiMonthlyBrl, operationalParams);
  }, [calcResults.rawFlowResult, operationalParams]);

  // --- ALTERAR MOEDA (com conversão dinâmica de input de orçamento) ---
  const handleCurrencyToggle = () => {
    setIsUSD(prev => {
      if (prev) {
        // USD para BRL
        setBudget(b => Math.round(b * usdBrlRate));
      } else {
        // BRL para USD
        setBudget(b => Math.round(b / usdBrlRate));
      }
      return !prev;
    });
  };

  // --- DADOS DO GRÁFICO (Custo no período x Leads de 0 a 100) ---
  const chartData = useMemo(() => {
    const dataPoints = [];
    const step = 5;
    
    for (let l = 0; l <= 100; l += step) {
      if (l === 0) {
        dataPoints.push({
          leads: 0,
          sdrCusto: 0,
          followCusto: 0,
          custo: 0,
          orcamento: budget,
        });
        continue;
      }

      // Custo no período para 'l' leads nesta configuração
      const custoSDRPeriodo = l * calcResults.custoSDRPorLead;
      const custoFollowPeriodo = l * calcResults.custoFollowPorLead;
      const custoTotalPeriodo = custoSDRPeriodo + custoFollowPeriodo;
      
      // Converte para a moeda atual do usuário
      const sdrDisplay = isUSD ? (custoSDRPeriodo / usdBrlRate) : custoSDRPeriodo;
      const followDisplay = isUSD ? (custoFollowPeriodo / usdBrlRate) : custoFollowPeriodo;
      const totalDisplay = isUSD ? (custoTotalPeriodo / usdBrlRate) : custoTotalPeriodo;

      dataPoints.push({
        leads: l,
        sdrCusto: parseFloat(sdrDisplay.toFixed(2)),
        followCusto: parseFloat(followDisplay.toFixed(2)),
        custo: parseFloat(totalDisplay.toFixed(2)),
        orcamento: budget,
      });
    }

    return dataPoints;
  }, [calcResults.custoSDRPorLead, calcResults.custoFollowPorLead, isUSD, budget, usdBrlRate]);

  // Estilo com base no Dark Mode ativo/inativo
  const themeClasses = darkMode ? {
    bg: "bg-[#050505] text-slate-100",
    header: "bg-[#0c0c0c]/90 border-slate-900",
    card: "bg-[#0f0f0f] border-slate-900 shadow-xl",
    cardHeader: "border-slate-900/60",
    input: "bg-[#18181b] border-slate-800 text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:ring-emerald-500/20",
    textMuted: "text-slate-400",
    textSecondary: "text-slate-300",
    badge: "bg-slate-900 border-slate-800 text-slate-300",
    kpiBg: "bg-slate-950/60 border-slate-900",
    footer: "bg-[#080808] border-slate-950 text-slate-600",
    gridLines: "#16161a",
    tooltipBg: "#0f0f10",
    tooltipBorder: "#1f2937",
    tooltipText: "#f1f5f9",
  } : {
    bg: "bg-slate-50 text-slate-800",
    header: "bg-white/95 border-slate-200/80 shadow-xs",
    card: "bg-white border-slate-200/80 shadow-md",
    cardHeader: "border-slate-100",
    input: "bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400 focus:border-emerald-500 focus:ring-emerald-500/10",
    textMuted: "text-slate-500",
    textSecondary: "text-slate-600",
    badge: "bg-slate-100 border-slate-200 text-slate-700",
    kpiBg: "bg-slate-50 border-slate-100",
    footer: "bg-slate-100 border-slate-200/60 text-slate-400",
    gridLines: "#e2e8f0",
    tooltipBg: "#ffffff",
    tooltipBorder: "#e2e8f0",
    tooltipText: "#0f172a",
  };

  return (
    <div id="custoia-app" className={`min-h-screen ${themeClasses.bg} flex flex-col font-sans transition-colors duration-200`}>
      
      {/* ═══════ HEADER ═══════ */}
      <header className={`sticky top-0 z-50 backdrop-blur-md border-b ${themeClasses.header} px-4 py-3.5 transition-colors duration-200`}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-emerald-500 flex items-center justify-center text-black shadow-md shadow-emerald-500/20">
              <Calculator className="h-5 w-5 stroke-[2.25]" />
            </div>
            <div>
              <span className="font-extrabold text-base tracking-tight text-emerald-500 uppercase">
                Custo<span className={darkMode ? "text-white" : "text-slate-900"}>IA</span>
              </span>
              <p className="text-[9px] text-emerald-500/80 font-bold uppercase tracking-widest leading-none">SDR CALCULATOR</p>
            </div>
          </div>

          {/* Toggles */}
          <div className="flex items-center gap-2">
            
            {/* Cotação do Dólar */}
            <div className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold ${
              darkMode 
                ? "border-slate-800 bg-[#0f0f0f] text-slate-300" 
                : "border-slate-200 bg-white text-slate-700"
            }`}>
              <span className="text-[10px] uppercase font-extrabold text-emerald-500 tracking-wider">Câmbio:</span>
              <span className="font-mono text-slate-400">1 USD = R$</span>
              <input
                id="header-rate-input"
                type="number"
                step="0.01"
                min="0.1"
                max="100"
                value={usdBrlRate}
                onChange={(e) => setUsdBrlRate(Math.max(0.1, parseFloat(e.target.value) || 5.11))}
                className="w-14 bg-transparent text-emerald-500 font-extrabold font-mono focus:outline-none focus:ring-0 p-0 text-xs border-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                title="Ajustar taxa de câmbio USD/BRL"
              />
            </div>

            {/* Moeda Toggle */}
            <button
              id="currency-toggle"
              onClick={handleCurrencyToggle}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                darkMode 
                  ? "border-slate-800 bg-[#0f0f0f] hover:bg-slate-900 hover:text-white" 
                  : "border-slate-200 bg-white hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <Coins className="h-3.5 w-3.5 text-emerald-500" />
              <span>{isUSD ? "USD ($)" : "BRL (R$)"}</span>
            </button>

            {/* Tema Toggle */}
            <button
              id="theme-toggle"
              onClick={() => setDarkMode(!darkMode)}
              className={`p-2 rounded-lg border transition-all ${
                darkMode 
                  ? "border-slate-800 bg-[#0f0f0f] hover:bg-slate-900 text-yellow-400" 
                  : "border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900"
              }`}
              title={darkMode ? "Mudar para modo claro" : "Mudar para modo escuro"}
            >
              {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

          </div>
        </div>
      </header>

      {/* ═══════ CONTEÚDO PRINCIPAL ═══════ */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        
        {/* Intro */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800/40">
          <div>
            <h1 className="text-xl md:text-2xl font-extrabold tracking-tight text-slate-100">Simulador de Custos de IA para SDR</h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
              Projeção e estimativa precisa de consumo de tokens para réguas de atendimento e prospecção.
            </p>
          </div>

          {/* ═══════ BARRA DE ABAS PRINCIPAL (Design Clean Pill) ═══════ */}
          <div className="inline-flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800/80 shadow-sm shrink-0">
            <button
              id="main-tab-simulator"
              onClick={() => setActiveMainTab("simulator")}
              className={`px-3.5 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                activeMainTab === "simulator"
                  ? "bg-emerald-500 text-black shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Calculator className="h-3.5 w-3.5" />
              <span>Simulador</span>
            </button>

            <button
              id="main-tab-planner"
              onClick={() => setActiveMainTab("planner")}
              className={`px-3.5 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                activeMainTab === "planner"
                  ? "bg-emerald-500 text-black shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Briefcase className="h-3.5 w-3.5" />
              <span>Planner Operacional</span>
            </button>

            <button
              id="main-tab-chat"
              onClick={() => setActiveMainTab("chat")}
              className={`px-3.5 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                activeMainTab === "chat"
                  ? "bg-emerald-500 text-black shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Chat Consultor</span>
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
              </span>
            </button>

            <button
              id="main-tab-presets"
              onClick={() => setActiveMainTab("presets")}
              className={`px-3.5 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                activeMainTab === "presets"
                  ? "bg-emerald-500 text-black shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Cenários Reais</span>
            </button>

            <button
              id="main-tab-import"
              onClick={() => setActiveMainTab("import")}
              className={`px-3.5 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer relative ${
                activeMainTab === "import"
                  ? "bg-emerald-500 text-black shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Workflow className="h-3.5 w-3.5" />
              <span>Importar Fluxo</span>
              {importedWorkflow && (
                <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
              )}
            </button>

            <button
              id="main-tab-details"
              onClick={() => setActiveMainTab("details")}
              className={`px-3.5 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                activeMainTab === "details"
                  ? "bg-emerald-500 text-black shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <BarChart3 className="h-3.5 w-3.5" />
              <span>Gráficos & Detalhes</span>
            </button>

            <button
              id="main-tab-faq"
              onClick={() => setActiveMainTab("faq")}
              className={`px-3.5 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                activeMainTab === "faq"
                  ? "bg-emerald-500 text-black shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <HelpCircle className="h-3.5 w-3.5" />
              <span>Guia</span>
            </button>
          </div>
        </div>

        {/* ═══════ SEÇÃO: IMPORTAR FLUXO REAL (N8N & PROMPT) ═══════ */}
        {activeMainTab === "import" && (
        <div className={`p-6 rounded-xl border ${themeClasses.card} space-y-5 shadow-lg`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4 border-slate-800/60">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <Workflow className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
                  Importar Fluxo Real
                  <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    n8n & Supabase
                  </span>
                </h3>
                <p className="text-xs text-slate-400">
                  Importe seu fluxo do n8n (.json) ou cole seu prompt diretamente para simular com tamanhos reais.
                </p>
              </div>
            </div>

            {/* Abas */}
            <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-lg border border-slate-800 shrink-0">
              <button
                id="tab-upload-n8n"
                onClick={() => setActiveImportTab("upload")}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeImportTab === "upload"
                    ? "bg-emerald-500 text-black shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Upload className="h-3.5 w-3.5" />
                <span>Upload do fluxo n8n</span>
              </button>
              <button
                id="tab-colar-prompt"
                onClick={() => setActiveImportTab("pasted")}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeImportTab === "pasted"
                    ? "bg-emerald-500 text-black shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <FileText className="h-3.5 w-3.5" />
                <span>Colar prompt</span>
              </button>
            </div>
          </div>

          {/* ABA 1: UPLOAD DE FLUXO N8N */}
          {activeImportTab === "upload" && (
            <div className="space-y-4">
              <div className="border-2 border-dashed border-slate-800 hover:border-emerald-500/50 transition-colors rounded-xl p-6 text-center bg-slate-900/30 flex flex-col items-center justify-center space-y-2 cursor-pointer relative">
                <input
                  type="file"
                  accept=".json"
                  onChange={handleFileUpload}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  title="Selecionar arquivo JSON do n8n"
                />
                <div className="p-3 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <Upload className="h-6 w-6" />
                </div>
                <p className="text-sm font-semibold text-slate-200">
                  {importFileName ? `Arquivo selecionado: ${importFileName}` : "Clique para selecionar ou arraste seu arquivo .json do n8n"}
                </p>
                <p className="text-xs text-slate-500">
                  Detecta automaticamente prompts de credenciais (Supabase), chamadas Gemini e regras de follow-up.
                </p>
              </div>

              {/* Explicação Didática sobre a Importação */}
              <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800/80 space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-emerald-400" />
                  <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                    Como funciona a importação de fluxo do n8n?
                  </h4>
                </div>

                <div className="grid sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/50 space-y-1">
                    <span className="text-emerald-400 font-bold block">1. Análise de Nós</span>
                    <p className="text-slate-400 text-[11px] leading-relaxed">
                      O leitor inspeciona a estrutura do arquivo JSON identificando nós do LangChain, Gemini, OpenAI e requisições HTTP (incluindo tabelas do Supabase).
                    </p>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/50 space-y-1">
                    <span className="text-emerald-400 font-bold block">2. Extração do Prompt</span>
                    <p className="text-slate-400 text-[11px] leading-relaxed">
                      Lê os Prompts de Sistema e instrução do agente, calculando a contagem real de caracteres e estimativa de tokens.
                    </p>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/50 space-y-1">
                    <span className="text-emerald-400 font-bold block">3. Atualização do Simulador</span>
                    <p className="text-slate-400 text-[11px] leading-relaxed">
                      Configura automaticamente o tamanho do prompt, multiplicador de chamadas de API encadeadas e régua de follow-up na calculadora.
                    </p>
                  </div>
                </div>
              </div>

              {/* Cálculo Realista de Custos */}
              <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800/80 space-y-3">
                <div className="flex items-center gap-2">
                  <Coins className="h-4 w-4 text-emerald-400" />
                  <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                    Como o Custo Real por Mensagem é Calculado?
                  </h4>
                </div>
                
                <div className="space-y-2.5 text-xs text-slate-400 leading-relaxed">
                  <p>
                    Diferente de simuladores simplistas, nossa calculadora replica o <strong>modelo matemático exato das execuções do seu fluxo n8n</strong>:
                  </p>
                  <ul className="list-disc pl-4 space-y-1.5 text-[11px] text-slate-400">
                    <li>
                      <strong className="text-slate-200">Conversão de Câmbio (USD → BRL):</strong> Os preços de tabela oficiais em Dólar (USD) são convertidos em tempo real para Real (BRL) usando a cotação ativa (ex: R$ {usdBrlRate.toFixed(2)}).
                    </li>
                    <li>
                      <strong className="text-slate-200">Crescimento Linear do Histórico:</strong> A cada nova mensagem trocada com o lead, todo o histórico anterior é enviado de volta ao Gemini. A mensagem #10 consome muito mais tokens de entrada (Input) do que a mensagem #1 por conter o prompt de sistema + 9 mensagens acumuladas na conversa.
                    </li>
                    <li>
                      <strong className="text-slate-200">Chamadas Encadeadas Inteligentes:</strong> No seu n8n real, a primeira chamada gasta o prompt completo + histórico. A segunda chamada (Fracionador) recebe apenas o pequeno prompt do fracionador (4.364 chars) e a resposta a ser dividida — <strong>sem reenviar o histórico do chat nem o prompt principal</strong>, poupando significativamente seu orçamento.
                    </li>
                    <li>
                      <strong className="text-slate-200">Descontos de Prompt Cache:</strong> Para modelos suportados (como Gemini, Grok, Claude), o prompt do sistema que permanece estático recebe de 50% a 90% de desconto (Cache Read) a partir da segunda mensagem do lead, barateando imensamente as conversas longas.
                    </li>
                  </ul>
                </div>
              </div>

              {importError && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{importError}</span>
                </div>
              )}

              {/* CARD FLUXO IMPORTADO */}
              {importedWorkflow && (
                <div className="p-5 rounded-xl bg-slate-900/80 border border-emerald-500/30 space-y-4 shadow-inner">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-3 border-slate-800">
                    <span className="text-xs font-extrabold uppercase text-emerald-400 flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-emerald-400" />
                      Fluxo Importado ({importFileName || "n8n Workflow"})
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono bg-slate-950 px-2.5 py-1 rounded border border-slate-800">
                      ✓ {Object.keys(importedWorkflow.prompts).length} prompts | {importedWorkflow.totalNodes} nodes ({importedWorkflow.functionNodesCount} funções, {importedWorkflow.httpRequestNodesCount} HTTP) | {importedWorkflow.chamadasPorMensagem} chamadas/msg
                    </span>
                  </div>

                  {/* Detalhes do resumo */}
                  <div className="grid sm:grid-cols-4 gap-3">
                    <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                      <span className="text-slate-400 block text-[10px] font-bold uppercase">Prompts Extraídos</span>
                      <strong className="text-emerald-400 text-sm font-mono">{Object.keys(importedWorkflow.prompts).length} encontrados</strong>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                      <span className="text-slate-400 block text-[10px] font-bold uppercase">Nodes / Funções</span>
                      <strong className="text-white text-sm font-mono">{importedWorkflow.totalNodes} nodes ({importedWorkflow.functionNodesCount} func)</strong>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                      <span className="text-slate-400 block text-[10px] font-bold uppercase">Chamadas por Mensagem</span>
                      <strong className="text-white text-sm font-mono">{importedWorkflow.chamadasPorMensagem} chamadas API</strong>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                      <span className="text-slate-400 block text-[10px] font-bold uppercase">Ferramentas (Tools)</span>
                      <strong className="text-emerald-300 text-xs font-mono">{importedWorkflow.tools.length} ferramentas</strong>
                    </div>
                  </div>

                  {/* Lista de Prompts com Snippets */}
                  {Object.keys(importedWorkflow.prompts).length > 0 && (
                    <div className="space-y-2 pt-1">
                      <span className="text-[11px] font-bold uppercase text-slate-400 tracking-wider block">
                        Prompts do Sistema Identificados no Workflow:
                      </span>
                      <div className="grid gap-2">
                        {Object.entries(importedWorkflow.prompts).map(([nome, info]: [string, { chars: number; tokens: number; snippet?: string }]) => (
                          <div key={nome} className="p-3 rounded-lg bg-slate-950/90 border border-slate-800/80 space-y-1.5 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-emerald-400 font-bold">{nome}</span>
                              <span className="text-slate-300 font-mono text-xs">
                                {info.chars.toLocaleString("pt-BR")} chars <span className="text-slate-500">|</span> <strong className="text-emerald-300">~{info.tokens.toLocaleString("pt-BR")} tokens</strong>
                              </span>
                            </div>
                            {info.snippet && (
                              <p className="text-[11px] text-slate-400 italic bg-slate-900 p-2 rounded border border-slate-800/60 font-mono">
                                "{info.snippet}"
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Ferramentas / Functions Detectadas */}
                  {importedWorkflow.tools && importedWorkflow.tools.length > 0 && (
                    <div className="space-y-2 pt-1">
                      <span className="text-[11px] font-bold uppercase text-slate-400 tracking-wider block">
                        Funções e Ferramentas (Tools) Detectadas no Código JS/Supabase:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {importedWorkflow.tools.map((tool, idx) => (
                          <span key={idx} className="px-2.5 py-1 bg-slate-950 border border-slate-800 rounded-md font-mono text-[11px] text-emerald-400">
                            ⚙️ {tool}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* WIDGET DE SIMULAÇÃO DE MENSAGEM */}
                  <div className="p-4 rounded-xl bg-slate-950 border border-emerald-500/20 space-y-3 mt-4">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                        <Bot className="h-4 w-4 text-emerald-400" />
                        Simulação de Mensagem com o Fluxo Importado
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">Motor de Execução n8n / Gemini</span>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[11px] text-slate-400 block font-medium">
                        Digite uma mensagem de teste do lead:
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={simulatedMsgText}
                          onChange={(e) => setSimulatedMsgText(e.target.value)}
                          className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                          placeholder="Ex: Qual o valor do plano e como faço para pagar?"
                        />
                        <button
                          onClick={runMessageSimulation}
                          className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs rounded-lg transition-all shadow cursor-pointer whitespace-nowrap"
                        >
                          Simular Mensagem
                        </button>
                      </div>
                    </div>

                    {simulatedResult && (
                      <div className="p-3.5 rounded-lg bg-slate-900 border border-slate-800 space-y-3">
                        <div className="grid grid-cols-3 gap-2 text-center text-xs">
                          <div className="bg-slate-950 p-2 rounded border border-slate-800">
                            <span className="text-[10px] text-slate-400 uppercase font-bold block">Tokens Input</span>
                            <strong className="text-white font-mono">{simulatedResult.inputTokens.toLocaleString("pt-BR")} t</strong>
                          </div>
                          <div className="bg-slate-950 p-2 rounded border border-slate-800">
                            <span className="text-[10px] text-slate-400 uppercase font-bold block">Tokens Output</span>
                            <strong className="text-white font-mono">{simulatedResult.outputTokens.toLocaleString("pt-BR")} t</strong>
                          </div>
                          <div className="bg-slate-950 p-2 rounded border border-slate-800">
                            <span className="text-[10px] text-slate-400 uppercase font-bold block">Custo da Mensagem</span>
                            <strong className="text-emerald-400 font-mono">{formatCurrency(simulatedResult.costBrl)}</strong>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <span className="text-[10px] font-bold uppercase text-slate-400 block">Resposta Simulada do Agente IA:</span>
                          <div className="p-3 rounded bg-slate-950 border border-slate-800/80 text-xs text-slate-200 font-sans leading-relaxed">
                            {simulatedResult.aiResponse}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ABA 2: COLAR PROMPT */}
          {activeImportTab === "pasted" && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                  Cole seu Prompt do Sistema Completo
                </label>
                <textarea
                  id="textarea-pasted-prompt"
                  rows={6}
                  value={pastedPromptText}
                  onChange={(e) => setPastedPromptText(e.target.value)}
                  placeholder="Cole aqui o texto do seu prompt de sistema para calcular caracteres, tokens e estimativa de custo..."
                  className="w-full p-3 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs font-mono focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none resize-y"
                />
              </div>

              {/* Métricas do Prompt em Tempo Real */}
              <div className="grid sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-lg bg-slate-900 border border-slate-800 text-center space-y-0.5">
                  <span className="text-[10px] uppercase text-slate-400 font-bold block">Caracteres</span>
                  <p className="text-xl font-extrabold text-white">{pastedPromptText.length.toLocaleString("pt-BR")}</p>
                </div>
                <div className="p-3.5 rounded-lg bg-slate-900 border border-slate-800 text-center space-y-0.5">
                  <span className="text-[10px] uppercase text-slate-400 font-bold block">Tokens Estimados (≈)</span>
                  <p className="text-xl font-extrabold text-emerald-400">
                    {Math.round(pastedPromptText.length / 3.5).toLocaleString("pt-BR")}
                  </p>
                </div>
                <div className="p-3.5 rounded-lg bg-slate-900 border border-slate-800 text-center space-y-0.5">
                  <span className="text-[10px] uppercase text-slate-400 font-bold block">
                    Custo / 1.000 chamadas ({selectedModel.name})
                  </span>
                  <p className="text-xl font-extrabold text-emerald-400">
                    {formatCurrency(
                      ((Math.round(pastedPromptText.length / 3.5) * (selectedModel.inputUSD * usdBrlRate)) / 1_000_000) * 1000
                    )}
                  </p>
                </div>
              </div>

              <button
                id="btn-apply-pasted-prompt"
                onClick={() => {
                  if (pastedPromptText.length > 0) {
                    setPromptSistema(pastedPromptText.length);
                    setImportSuccessMsg(`Prompt de ${pastedPromptText.length.toLocaleString("pt-BR")} caracteres aplicado ao simulador!`);
                  }
                }}
                disabled={pastedPromptText.length === 0}
                className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 disabled:opacity-50 text-black font-bold text-xs rounded-lg transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
              >
                <Sparkles className="h-4 w-4" />
                <span>Aplicar Tamanho ({pastedPromptText.length.toLocaleString("pt-BR")} chars) ao Simulador</span>
              </button>

              {importSuccessMsg && (
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 shrink-0" />
                  <span>{importSuccessMsg}</span>
                </div>
              )}
            </div>
          )}
        </div>
        )}

        {/* ═══════ SEÇÃO: SIMULADOR PRINCIPAL ═══════ */}
        {activeMainTab === "simulator" && (
        <div className="space-y-6">

          {/* BARRA DE ALTERNÂNCIA DE MODO (SIMPLES VS AVANÇADO) */}
          <div className={`p-4 sm:p-5 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all shadow-md ${
            isSimpleMode
              ? "bg-gradient-to-r from-emerald-950/60 via-slate-900 to-slate-900 border-emerald-500/40"
              : "bg-slate-900/90 border-slate-800"
          }`}>
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-xl ${isSimpleMode ? "bg-emerald-500 text-black font-bold" : "bg-slate-800 text-slate-300"}`}>
                {isSimpleMode ? <Building2 className="h-5 w-5" /> : <Sliders className="h-5 w-5" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-extrabold text-sm sm:text-base text-slate-100">
                    {isSimpleMode ? "Modo Simples (Para Empresários & Vendedores)" : "Modo Avançado (Para Devs & Engenheiros)"}
                  </h3>
                  <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                    isSimpleMode ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                  }`}>
                    {isSimpleMode ? "Linguagem Descomplicada" : "Controle Técnico"}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  {isSimpleMode
                    ? "Painel direto focado em custos comerciais, sem termos difíceis como tokens, cache ou JSON."
                    : "Acesso a todos os parâmetros finos: tamanho de prompts em caracteres, chamadas por msg e Supabase."}
                </p>
              </div>
            </div>

            <button
              id="btn-toggle-ui-mode"
              onClick={() => setIsSimpleMode(!isSimpleMode)}
              className={`px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer shrink-0 shadow-sm ${
                isSimpleMode
                  ? "bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700"
                  : "bg-emerald-500 hover:bg-emerald-400 text-black"
              }`}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>{isSimpleMode ? "Mudar para Modo Técnico ⚙️" : "Mudar para Modo Simples 💼"}</span>
            </button>
          </div>

          {isSimpleMode ? (
            /* ════════════════════════════════════════════════════════════
               MODO SIMPLES: DESIGN EMPRESARIAL / VENDEDOR
            ════════════════════════════════════════════════════════════ */
            <div className="grid lg:grid-cols-[480px_1fr] gap-8 items-start">
              
              {/* COLUNA DA ESQUERDA: CONFIGURAÇÃO DESCOMPLICADA */}
              <div className="space-y-6">
                
                {/* CARD 1: ESCOLHA O MODELO DE IA */}
                <div className={`p-5 rounded-2xl border ${themeClasses.card} space-y-4 shadow-sm`}>
                  <div className="flex items-center justify-between border-b pb-3 border-slate-800/40">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-emerald-400" />
                      <h3 className="font-bold text-sm text-slate-100">1. Escolha o Modelo de Inteligência Artificial</h3>
                    </div>
                  </div>

                  <p className="text-xs text-slate-400">
                    Selecione qual "cérebro" de IA vai atender seus clientes. Modelos mais leves são ultra baratos e perfeitos para vendas.
                  </p>

                  {/* Ateliê / Grid de Opções Recomendadas para Negócios */}
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      {
                        id: "gemini-3-5-flash-lite",
                        title: "Gemini 3.5 Flash-Lite",
                        tag: "👑 Campeão de Vendas",
                        desc: "Raciocínio excelente e custo ultra otimizado para WhatsApp e SDR.",
                        badge: "Mais Assertivo"
                      },
                      {
                        id: "gemini-3-1-flash-lite",
                        title: "Gemini 3.1 Flash-Lite",
                        tag: "💰 Mais Econômico",
                        desc: "Modelo ultra leve para máximo volume com menor custo por mensagem.",
                        badge: "Mais Leve"
                      },
                      {
                        id: "gemini-2-5-flash",
                        title: "Gemini 2.5 Flash",
                        tag: "⚡ Atendimento Humano",
                        desc: "Excelente capacidade de conversação e raciocínio amigável.",
                        badge: "Super Equilibrado"
                      },
                      {
                        id: "gemini-2-5-pro",
                        title: "Gemini 2.5 Pro",
                        tag: "🧠 Vendas Complexas",
                        desc: "Inteligência máxima para negociações B2B de alto valor.",
                        badge: "Alta Performance"
                      }
                    ].map((mOption) => {
                      const isSelected = selectedModelId === mOption.id;
                      return (
                        <button
                          key={mOption.id}
                          type="button"
                          onClick={() => setSelectedModelId(mOption.id)}
                          className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between space-y-2 ${
                            isSelected
                              ? "bg-emerald-500/10 border-emerald-500 text-white ring-1 ring-emerald-500"
                              : "bg-slate-900/40 border-slate-800 hover:border-slate-700 text-slate-300"
                          }`}
                        >
                          <div>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 inline-block mb-1">
                              {mOption.tag}
                            </span>
                            <h4 className="font-extrabold text-xs text-slate-100">{mOption.title}</h4>
                            <p className="text-[11px] text-slate-400 mt-1 leading-tight">{mOption.desc}</p>
                          </div>
                          <span className={`text-[10px] font-mono font-bold mt-2 ${isSelected ? "text-emerald-400" : "text-slate-500"}`}>
                            {isSelected ? "✓ Selecionado" : "Clique para selecionar"}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Dropdown Completo com Todos os Modelos */}
                  <div className="space-y-1 pt-2 border-t border-slate-800/40">
                    <label className="text-xs font-semibold text-slate-400 flex items-center justify-between">
                      <span>Ver Todos os Modelos Disponíveis ({MODELS.length})</span>
                      <span className="text-[10px] text-emerald-400 font-mono">Mesmo seletor do modo técnico</span>
                    </label>
                    <select
                      id="simple-model-select"
                      value={selectedModelId}
                      onChange={(e) => setSelectedModelId(e.target.value)}
                      className={`w-full h-9 px-3 rounded-xl border text-xs font-semibold focus:outline-none transition-all ${themeClasses.input}`}
                    >
                      {MODELS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.provider}) - Input: ${m.inputUSD}/1M | Output: ${m.outputUSD}/1M
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Seletor de Tier de Preço */}
                  <div className="space-y-2 pt-2 border-t border-slate-800/40">
                    <div className="flex justify-between items-center text-xs">
                      <label className="font-semibold text-slate-300">Tier de Preço (Velocidade & Custo)</label>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 uppercase font-bold">
                        {selectedTier === "standard" ? "Padrão (1x)" : selectedTier === "batch" ? "Lote (0.5x)" : selectedTier === "flex" ? "Flex (0.5x)" : "Prioridade (1.8x)"}
                      </span>
                    </div>

                    <div className="grid grid-cols-4 gap-1.5 p-1 rounded-xl bg-slate-900/80 border border-slate-800">
                      {[
                        { id: "standard", label: "Padrão", sub: "Tempo Real" },
                        { id: "batch", label: "Lote", sub: "-50% (24h)" },
                        { id: "flex", label: "Flex", sub: "-50% Flutuante" },
                        { id: "priority", label: "Prioridade", sub: "+80% Veloz" },
                      ].map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setSelectedTier(t.id as any)}
                          className={`py-2 px-1 text-center rounded-lg border transition-all cursor-pointer ${
                            selectedTier === t.id
                              ? "bg-emerald-500 text-black font-black border-emerald-400 shadow-sm"
                              : "bg-slate-950/40 text-slate-300 border-slate-800 hover:border-slate-700"
                          }`}
                        >
                          <span className="block text-xs font-bold leading-none">{t.label}</span>
                          <span className={`block text-[9px] mt-1 font-mono font-bold ${selectedTier === t.id ? "text-slate-900" : "text-slate-500"}`}>
                            {t.sub}
                          </span>
                        </button>
                      ))}
                    </div>

                    <p className="text-[11px] text-slate-400 leading-tight">
                      {selectedTier === "standard" && "⚡ Padrão: Resposta em tempo real. Recomendado para SDR."}
                      {selectedTier === "batch" && "⏰ Lote: 50% mais barato. Atraso até 24h. Não serve para SDR."}
                      {selectedTier === "flex" && "🧘 Flex: 50% mais barato. Pode atrasar se sobrecarregado."}
                      {selectedTier === "priority" && "🚀 Prioridade: 1.8x mais caro. Latência garantida baixa."}
                    </p>
                  </div>
                </div>

                {/* CARD 2: CLIENTES E ATENDIMENTO */}
                <div className={`p-5 rounded-2xl border ${themeClasses.card} space-y-4 shadow-sm`}>
                  <div className="flex items-center gap-2 border-b pb-3 border-slate-800/40">
                    <Users className="h-4 w-4 text-emerald-400" />
                    <h3 className="font-bold text-sm text-slate-100">2. Entrada de Clientes & Orçamento</h3>
                  </div>

                  <div className="grid sm:grid-cols-1 gap-4">
                    {/* Novos Clientes */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-300">
                        Novos Clientes Atendidos por {period === "dia" ? "Dia" : period === "semana" ? "Semana" : "Mês"}
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          value={leads}
                          onChange={(e) => setLeads(Math.max(1, Number(e.target.value)))}
                          className={`w-full h-10 px-3 rounded-xl border text-sm font-extrabold focus:outline-none ${themeClasses.input}`}
                        />
                        <select
                          value={period}
                          onChange={(e: any) => setPeriod(e.target.value)}
                          className={`h-10 px-2 rounded-xl border text-xs font-bold ${themeClasses.input}`}
                        >
                          <option value="dia">/ dia</option>
                          <option value="semana">/ semana</option>
                          <option value="mês">/ mês</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Atendimento do SDR (1º Contato) */}
                  <div className="space-y-4 pt-2 border-t border-slate-800/40">
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-medium text-slate-300">Troca de mensagens no 1º atendimento (SDR)</span>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min={1}
                            max={200}
                            value={avgSdrMsgs}
                            onChange={(e) => setAvgSdrMsgs(Math.max(1, Number(e.target.value)))}
                            className={`w-16 h-7 px-2 text-right rounded-lg border text-xs font-mono font-bold text-emerald-400 ${themeClasses.input}`}
                          />
                          <span className="text-slate-400 font-bold">msgs</span>
                        </div>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={100}
                        value={avgSdrMsgs}
                        onChange={(e) => setAvgSdrMsgs(Number(e.target.value))}
                        className="w-full accent-emerald-500 cursor-pointer"
                      />
                      <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                        <span>1 msg</span>
                        <span>15 msgs</span>
                        <span>50 msgs</span>
                        <span>100+ msgs</span>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                      {/* Tool-Loop Factor Slider */}
                      <div className="space-y-1 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                        <div className="flex justify-between items-center">
                          <label className="text-[11px] font-bold text-slate-300">Tool-loop factor (Agent Calls/Msg)</label>
                          <span className="text-xs font-extrabold text-emerald-400 font-mono">{sdrToolLoopFactor.toFixed(1)}x</span>
                        </div>
                        <input
                          type="range"
                          min="1.0"
                          max="4.0"
                          step="0.1"
                          value={sdrToolLoopFactor}
                          onChange={(e) => setSdrToolLoopFactor(parseFloat(e.target.value))}
                          className="w-full accent-emerald-500 cursor-pointer"
                        />
                        <p className="text-[10px] text-slate-400">Iterações médias do agente SDR por mensagem (default 3.0x).</p>
                      </div>

                      {/* Contingency / Safety Margin */}
                      <div className="space-y-1 bg-slate-900/60 p-3 rounded-xl border border-slate-800 flex flex-col justify-between">
                        <div className="flex justify-between items-center">
                          <label className="text-[11px] font-bold text-slate-300">Margem de Segurança</label>
                          <button
                            type="button"
                            onClick={() => setUseSafetyMargin(!useSafetyMargin)}
                            className={`px-2 py-0.5 rounded text-[10px] font-extrabold transition-all ${
                              useSafetyMargin ? "bg-emerald-500 text-black" : "bg-slate-800 text-slate-400"
                            }`}
                          >
                            {useSafetyMargin ? `ATIVO (+${safetyMarginPct}%)` : "DESATIVADO"}
                          </button>
                        </div>
                        {useSafetyMargin && (
                          <div className="flex items-center gap-2 pt-1">
                            <input
                              type="range"
                              min="0"
                              max="100"
                              step="5"
                              value={safetyMarginPct}
                              onChange={(e) => setSafetyMarginPct(parseInt(e.target.value) || 0)}
                              className="w-full accent-emerald-500 cursor-pointer"
                            />
                            <span className="text-xs font-extrabold text-emerald-400 font-mono w-10 text-right">{safetyMarginPct}%</span>
                          </div>
                        )}
                        <p className="text-[10px] text-slate-400">Garante gordura contra retentativas de rede e ruído.</p>
                      </div>
                    </div>
                  </div>

                  {/* Tamanho das Instruções/Regras da IA */}
                  <div className="space-y-2 pt-2 border-t border-slate-800/40">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-medium text-slate-300 block">
                        Tamanho do Script / Instruções da IA (em letras/caracteres)
                      </label>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={1000}
                          max={500000}
                          step={1000}
                          value={promptSistema}
                          onChange={(e) => setPromptSistema(Math.max(500, Number(e.target.value)))}
                          className={`w-24 h-7 px-2 text-right rounded-lg border text-xs font-mono font-bold text-emerald-400 ${themeClasses.input}`}
                        />
                        <span className="text-[11px] text-slate-400 font-bold">caracteres</span>
                      </div>
                    </div>
                    
                    <p className="text-[11px] text-slate-400 leading-tight">
                      São as regras de negócio, lista de produtos e objeções que o robô lê a cada conversa.
                    </p>

                    <div className="grid grid-cols-3 gap-1.5 pt-1">
                      {[
                        { label: "Pequeno (~10k letras)", size: 10000 },
                        { label: "Médio (~25k letras)", size: 25000 },
                        { label: "Completo (~37k letras)", size: 37728 },
                      ].map((preset) => (
                        <button
                          key={preset.size}
                          type="button"
                          onClick={() => setPromptSistema(preset.size)}
                          className={`py-2 px-2 text-[11px] font-bold rounded-xl border transition-all cursor-pointer ${
                            promptSistema === preset.size
                              ? "bg-emerald-500 text-black font-extrabold border-emerald-400"
                              : "bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700"
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* CARD 3: FLUXOS DE FOLLOW-UP (ACOMPANHAMENTO DE VENDAS) */}
                <div className={`p-5 rounded-2xl border ${themeClasses.card} space-y-4 shadow-sm`}>
                  <div className="flex items-center justify-between border-b pb-3 border-slate-800/40">
                    <div className="flex items-center gap-2">
                      <Repeat className="h-4 w-4 text-emerald-400" />
                      <h3 className="font-bold text-sm text-slate-100">3. Fluxos de Acompanhamento (Follow-Up)</h3>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      {followupFlows.length} {followupFlows.length === 1 ? "Fluxo Ativo" : "Fluxos Ativos"}
                    </span>
                  </div>

                  <p className="text-xs text-slate-400">
                    Você pode cadastrar diferentes réguas de acompanhamento (ex: um follow-up de 1 msg por dia e outro com mais mensagens por dia).
                  </p>

                  {/* Lista dos Fluxos de Follow-Up */}
                  <div className="space-y-3">
                    {followupFlows.map((flow, index) => (
                      <div
                        key={flow.id}
                        className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-3 relative group"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                            <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] flex items-center justify-center font-mono font-bold">
                              {index + 1}
                            </span>
                            {flow.name}
                          </span>

                          {followupFlows.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveFollowupFlow(flow.id)}
                              className="text-slate-500 hover:text-red-400 p-1 transition-colors cursor-pointer"
                              title="Remover este fluxo"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {/* Nome do Fluxo */}
                          <div className="space-y-1">
                            <label className="text-[11px] font-medium text-slate-400">Nome do Fluxo</label>
                            <input
                              type="text"
                              value={flow.name}
                              onChange={(e) => handleUpdateFollowupFlow(flow.id, "name", e.target.value)}
                              className={`w-full h-8 px-2.5 rounded-lg border text-xs font-semibold focus:outline-none ${themeClasses.input}`}
                            />
                          </div>

                          {/* Mensagens enviadas por dia */}
                          <div className="space-y-1">
                            <label className="text-[11px] font-medium text-slate-400">Msgs enviadas por dia</label>
                            <input
                              type="number"
                              min={1}
                              max={10}
                              value={flow.msgsPerDay}
                              onChange={(e) => handleUpdateFollowupFlow(flow.id, "msgsPerDay", Math.max(1, Number(e.target.value)))}
                              className={`w-full h-8 px-2.5 rounded-lg border text-xs font-bold focus:outline-none ${themeClasses.input}`}
                            />
                          </div>

                          {/* Duração em Dias */}
                          <div className="space-y-1">
                            <label className="text-[11px] font-medium text-slate-400">Duração do Acompanhamento</label>
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min={1}
                                max={60}
                                value={flow.days}
                                onChange={(e) => handleUpdateFollowupFlow(flow.id, "days", Math.max(1, Number(e.target.value)))}
                                className={`w-full h-8 px-2.5 rounded-lg border text-xs font-bold focus:outline-none ${themeClasses.input}`}
                              />
                              <span className="text-xs text-slate-400 font-bold">dias</span>
                            </div>
                          </div>

                          {/* Checagens da IA por mensagem */}
                          <div className="space-y-1">
                            <label className="text-[11px] font-medium text-slate-400">Consultas de IA por mensagem</label>
                            <select
                              value={flow.callsPerMsg}
                              onChange={(e) => handleUpdateFollowupFlow(flow.id, "callsPerMsg", Number(e.target.value))}
                              className={`w-full h-8 px-2 rounded-lg border text-xs font-semibold focus:outline-none ${themeClasses.input}`}
                            >
                              <option value={1}>1 Chamada Direta</option>
                              <option value={2}>2 Chamadas (Envio + Validação)</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Botão Adicionar Outro Fluxo */}
                  <button
                    type="button"
                    onClick={handleAddFollowupFlow}
                    className="w-full py-2.5 px-3 rounded-xl border border-dashed border-emerald-500/40 hover:border-emerald-500 text-emerald-400 hover:text-emerald-300 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer bg-emerald-500/5 hover:bg-emerald-500/10"
                  >
                    <PlusCircle className="h-4 w-4" />
                    <span>+ Adicionar Outro Fluxo de Follow-Up</span>
                  </button>

                  <div className="pt-4 border-t border-slate-800/40">
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center">
                        <label className="text-xs font-medium text-slate-300">
                          Retenção no Follow-up (Quantos % chegam até o fim)
                        </label>
                        <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">{followupRetention}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={followupRetention}
                        onChange={(e) => setFollowupRetention(Number(e.target.value))}
                        className="w-full accent-emerald-500 cursor-pointer"
                      />
                      <p className="text-[10px] text-slate-500 leading-tight">
                        Se 30%, significa que 70% dos clientes vão responder e sair da fila antes do tempo acabar. Reduz muito o custo de envio!
                      </p>
                    </div>
                  </div>
                </div>

              </div>

              {/* COLUNA DA DIREITA: RESULTADOS EMPRESARIAIS */}
              <div className="space-y-6 lg:sticky lg:top-6">
                
                {/* BIG KPI HIGHLIGHT CARDS */}
                <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
                  {/* Custo Mensal Estimado */}
                  <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-950/60 to-slate-900 border border-emerald-500/40 space-y-1 shadow-lg">
                    <span className="text-[11px] font-extrabold uppercase text-emerald-400 tracking-wider block">
                      Gasto Mensal Estimado
                    </span>
                    <p className="text-2xl font-black text-white tracking-tight">
                      {formatCurrency(calcResults.custoMensal)}
                    </p>
                    <span className="text-[10px] text-slate-400 block font-mono">
                      ~ {formatCurrency(calcResults.custoPeriodo)} por {period}
                    </span>
                  </div>

                  {/* Custo Total Por Cliente */}
                  <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-1 shadow-md">
                    <span className="text-[11px] font-extrabold uppercase text-slate-400 tracking-wider block">
                      Custo por Cliente Completo
                    </span>
                    <p className="text-2xl font-black text-emerald-400 tracking-tight">
                      {formatCurrency(calcResults.custoPorLead)}
                    </p>
                    <span className="text-[10px] text-slate-400 block font-mono">
                      Jornada de {avgSdrMsgs + (followupFlows.reduce((acc, f) => acc + (f.days * f.msgsPerDay), 0))} msgs por cliente
                    </span>
                  </div>

                  {/* Custo por Mensagem */}
                  <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-1 shadow-md">
                    <span className="text-[11px] font-extrabold uppercase text-slate-400 tracking-wider block">
                      Custo por Mensagem Enviada
                    </span>
                    <p className="text-2xl font-black text-blue-400 tracking-tight">
                      {formatCurrency(calcResults.avgMsgCost)}
                    </p>
                    <span className="text-[10px] text-slate-400 block font-mono">
                      ~ {((calcResults.avgMsgCost || 0) * 100).toFixed(2)} centavos / mensagem
                    </span>
                  </div>

                  {/* Volume Processado no Mês */}
                  <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-1 shadow-md">
                    <span className="text-[11px] font-extrabold uppercase text-slate-400 tracking-wider block">
                      Volume Processado no Mês
                    </span>
                    <p className="text-2xl font-black text-white tracking-tight">
                      {Math.round(calcResults.leadsNoMesProjetado).toLocaleString("pt-BR")} leads
                    </p>
                    <span className="text-[10px] text-slate-400 block font-mono">
                      ~ {Math.round(calcResults.dailyLeadsIntake)} leads/dia
                    </span>
                  </div>
                </div>

                {/* BREAKDOWN DO CUSTO POR LEAD E PROJEÇÃO */}
                <div className="p-5 rounded-2xl bg-slate-900 border border-slate-700/50 shadow-lg space-y-4">
                  <h4 className="font-bold text-sm text-slate-100 flex items-center gap-2 border-b border-slate-800 pb-2">
                    <PieChart className="h-4 w-4 text-emerald-400" />
                    BREAKDOWN DO CUSTO POR LEAD
                  </h4>
                  
                  <div className="space-y-3 font-mono text-sm">
                    <div className="flex justify-between items-center text-slate-300">
                      <span>SDR (1º Contato + Handoff):</span>
                      <span className="font-bold text-emerald-400">{formatCurrency(calcResults.custoSDRPorLead)}</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-300">
                      <span>Follow-up (Ativo):</span>
                      <span className="font-bold text-emerald-400">{formatCurrency(calcResults.custoFollowPorLead)}</span>
                    </div>
                    <div className="flex justify-between items-center text-white pt-2 border-t border-slate-800">
                      <span className="font-bold">TOTAL POR LEAD:</span>
                      <span className="font-bold text-emerald-400 text-base">{formatCurrency(calcResults.custoPorLead)}</span>
                    </div>
                  </div>

                  <div className="pt-4 mt-4 border-t border-slate-800 space-y-2">
                    <h5 className="text-[11px] font-extrabold uppercase text-slate-400 tracking-wider">
                      {period === "dia" && `PROJEÇÃO (COM ${leads} LEADS/DIA)`}
                      {period === "semana" && `PROJEÇÃO (COM ${leads} LEADS/SEMANA)`}
                      {period === "mês" && `PROJEÇÃO (COM ${leads} LEADS/MÊS)`}
                    </h5>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-slate-950/50 p-2 rounded-lg border border-slate-800/60">
                        <span className="block text-[10px] text-slate-500 uppercase font-bold">Por dia</span>
                        <span className="block font-mono text-emerald-400 text-sm font-bold">{formatCurrency(calcResults.custoMensal / 30)}</span>
                      </div>
                      <div className="bg-slate-950/50 p-2 rounded-lg border border-slate-800/60">
                        <span className="block text-[10px] text-slate-500 uppercase font-bold">Por semana</span>
                        <span className="block font-mono text-emerald-400 text-sm font-bold">{formatCurrency(calcResults.custoMensal / 4.33)}</span>
                      </div>
                      <div className="bg-slate-950/50 p-2 rounded-lg border border-slate-800/60">
                        <span className="block text-[10px] text-slate-500 uppercase font-bold">Por mês</span>
                        <span className="block font-mono text-emerald-400 text-sm font-bold">{formatCurrency(calcResults.custoMensal)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* DETALHAMENTO COMERCIAL */}
                <div className={`p-5 rounded-2xl border ${themeClasses.card} space-y-4`}>
                  <div className="flex items-center justify-between border-b pb-3 border-slate-800/40">
                    <h4 className="font-bold text-sm text-slate-100 flex items-center gap-2">
                      <PieChart className="h-4 w-4 text-emerald-400" />
                      Divisão dos Gastos da Sua Operação
                    </h4>
                    <span className="text-xs font-mono text-emerald-400 font-bold">
                      Modelo: {selectedModel.name}
                    </span>
                  </div>

                  {/* Barras Visuais de Comparação */}
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-300 font-medium">1º Atendimento (SDR Inicial)</span>
                        <strong className="text-white font-mono">{formatCurrency(calcResults.sdrCustoMensal)}/mês</strong>
                      </div>
                      <div className="h-2.5 w-full bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all"
                          style={{
                            width: `${Math.min(100, Math.max(5, (calcResults.sdrCustoMensal / (calcResults.custoMensal || 1)) * 100))}%`
                          }}
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-300 font-medium">Réguas de Acompanhamento ({followupFlows.length} fluxos)</span>
                        <strong className="text-white font-mono">{formatCurrency(calcResults.followCustoMensal)}/mês</strong>
                      </div>
                      <div className="h-2.5 w-full bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all"
                          style={{
                            width: `${Math.min(100, Math.max(5, (calcResults.followCustoMensal / (calcResults.custoMensal || 1)) * 100))}%`
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Tabela dos Fluxos Cadastrados */}
                  <div className="pt-2 border-t border-slate-800/40 space-y-2">
                    <span className="text-xs font-bold text-slate-300 block">Resumo dos Seus Fluxos de Follow-Up:</span>
                    <div className="grid gap-2">
                      {followupFlows.map((flow) => {
                        const msgsTotal = flow.days * flow.msgsPerDay;
                        return (
                          <div key={flow.id} className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-xs flex items-center justify-between">
                            <div>
                              <span className="font-bold text-slate-200 block">{flow.name}</span>
                              <span className="text-[11px] text-slate-400">
                                {flow.msgsPerDay} msg/dia por {flow.days} dias ({msgsTotal} msgs no total)
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="font-mono text-emerald-400 font-bold block">
                                {flow.callsPerMsg} {flow.callsPerMsg === 1 ? "chamada/msg" : "chamadas/msg"}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* GUIA DO SOCIO / VENDEDOR */}
                <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
                  <h4 className="font-bold text-xs uppercase tracking-wider text-emerald-400 flex items-center gap-2">
                    <HelpCircle className="h-4 w-4" />
                    Guia do Empresário: Como Funciona Esse Custo?
                  </h4>
                  <div className="space-y-2 text-xs text-slate-300 leading-relaxed">
                    <p>
                      • <strong>Por que é tão barato?</strong> As empresas de tecnologia cobram frações de centavos por mensagem enviada. Com o modelo <strong>{selectedModel.name}</strong>, você gasta menos de R$ 0,05 por cliente atendido.
                    </p>
                    <p>
                      • <strong>E se o cliente responder o follow-up?</strong> Se o cliente responder, ele entra no atendimento ativo do seu vendedor humano ou volta para o fluxo de SDR.
                    </p>
                    <p>
                      • <strong>Dica de Vendas:</strong> Mantenha instruções completas com todas as objeções do seu produto mapeadas. O custo do robô é insignificante comparado ao ganho de agilidade e conversão.
                    </p>
                  </div>
                </div>

              </div>

            </div>
          ) : (
            /* ════════════════════════════════════════════════════════════
               MODO AVANÇADO (TÉCNICO DEVS)
            ════════════════════════════════════════════════════════════ */
            <div className="grid lg:grid-cols-[420px_1fr] gap-8 items-start">
          
          {/* ───────────────── ESQUERDA (Formulário, 40%) ───────────────── */}
          <div className="space-y-6">
            
            {/* Presets Rápidos */}
            <div className="flex flex-col gap-2 p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
              <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 border-b border-emerald-500/10 pb-1.5 mb-1">
                <CheckCircle className="h-3.5 w-3.5" />
                Carregar Cenários Rápidos:
              </span>
              <div className="grid grid-cols-3 gap-1.5 w-full">
                <button
                  id="load-case-study-real"
                  onClick={() => {
                    setSelectedModelId("gemini-3-1-flash-lite");
                    setLeads(100);
                    setPeriod("dia");
                    setAvgSdrMsgs(4);
                    setActiveFollowupsPerDay(500);
                    setSupabaseToolsSize(5000);
                    setDiasFollowup(14);
                    setMsgsPorDia(1);
                    setPromptSistema(37728);
                    setMsgLead(500);
                    setRespostaIA(800);
                    setChamadasPorMsg(2);
                    setIsUSD(false);
                    setUsdBrlRate(5.11);
                  }}
                  className="px-1 py-1.5 bg-emerald-500 text-black hover:bg-emerald-400 font-bold text-[10px] rounded-md transition-all shadow-sm cursor-pointer text-center"
                  title="Simula 100 SDR leads/dia + 500 follow-ups/dia com ferramentas do Supabase"
                >
                  Meu Gasto Real
                </button>
                <button
                  id="load-case-study-gemini"
                  onClick={() => {
                    setSelectedModelId("gemini-2-0-flash");
                    setLeads(16);
                    setPeriod("mês");
                    setAvgSdrMsgs(4);
                    setActiveFollowupsPerDay(100);
                    setSupabaseToolsSize(0);
                    setDiasFollowup(14);
                    setMsgsPorDia(1);
                    setPromptSistema(37728);
                    setMsgLead(500);
                    setRespostaIA(800);
                    setChamadasPorMsg(2);
                    setIsUSD(false);
                    setUsdBrlRate(5.11);
                  }}
                  className="px-1 py-1.5 bg-slate-800 text-slate-200 hover:bg-slate-700 font-medium text-[10px] rounded-md transition-all shadow-sm cursor-pointer text-center"
                >
                  Gemini 2.0
                </button>
                <button
                  id="load-case-study-gpt4o"
                  onClick={() => {
                    setSelectedModelId("gpt-4o");
                    setLeads(16);
                    setPeriod("mês");
                    setAvgSdrMsgs(4);
                    setActiveFollowupsPerDay(100);
                    setSupabaseToolsSize(0);
                    setDiasFollowup(14);
                    setMsgsPorDia(1);
                    setPromptSistema(37728);
                    setMsgLead(500);
                    setRespostaIA(800);
                    setChamadasPorMsg(2);
                    setIsUSD(false);
                    setUsdBrlRate(5.11);
                  }}
                  className="px-1 py-1.5 bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700 font-medium text-[10px] rounded-md transition-all cursor-pointer text-center"
                >
                  GPT-4o
                </button>
              </div>
            </div>

            {/* Modelo de IA */}
            <div className={`p-5 rounded-xl border ${themeClasses.card} space-y-3.5`}>
              <div className="flex items-center gap-2 border-b pb-2.5 border-slate-800/40">
                <Zap className="h-4 w-4 text-emerald-500" />
                <h3 className="font-bold text-sm tracking-wide text-slate-200">Modelo de IA</h3>
              </div>
              
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-400">Provedor e Modelo</label>
                <select
                  id="model-select"
                  value={selectedModelId}
                  onChange={(e) => setSelectedModelId(e.target.value)}
                  className={`w-full h-9 px-3 rounded-lg border text-xs font-semibold focus:outline-none transition-all ${themeClasses.input}`}
                >
                  <optgroup label="OpenAI">
                    {MODELS.filter(m => m.provider === "OpenAI").map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Anthropic">
                    {MODELS.filter(m => m.provider === "Anthropic").map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Google">
                    {MODELS.filter(m => m.provider === "Google").map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </optgroup>
                  <optgroup label="DeepSeek">
                    {MODELS.filter(m => m.provider === "DeepSeek").map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Mistral">
                    {MODELS.filter(m => m.provider === "Mistral").map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </optgroup>
                  <optgroup label="xAI">
                    {MODELS.filter(m => m.provider === "xAI").map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Meta (Together)">
                    {MODELS.filter(m => m.provider === "Meta (Together)").map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Groq">
                    {MODELS.filter(m => m.provider === "Groq").map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </optgroup>
                </select>
              </div>

              {/* Seletor de Tier */}
              <div className="space-y-1.5 pt-1">
                <div className="flex justify-between items-center text-xs">
                  <label className="font-medium text-slate-400">Tier de Preço (Google)</label>
                  <span className={`text-[10px] px-2 py-0.5 rounded border font-semibold uppercase ${
                    darkMode ? "bg-slate-800/40 border-slate-700/50 text-slate-300" : "bg-slate-100 border-slate-200 text-slate-600"
                  }`}>
                    {selectedTier === "standard" ? "Padrão" : selectedTier === "batch" ? "Lote" : selectedTier === "flex" ? "Flex" : "Prioridade"}
                  </span>
                </div>
                
                <div className={`grid grid-cols-4 gap-1 p-0.5 rounded-lg border ${darkMode ? "bg-slate-950/40 border-slate-900" : "bg-slate-100/60 border-slate-200"}`}>
                  <button
                    id="tier-standard-btn"
                    type="button"
                    onClick={() => setSelectedTier("standard")}
                    className={`py-1.5 text-[11px] font-bold rounded-md transition-all cursor-pointer ${
                      selectedTier === "standard"
                        ? "bg-emerald-500 text-black shadow-sm font-extrabold"
                        : darkMode
                          ? "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
                          : "text-slate-600 hover:text-slate-800 hover:bg-slate-200/50"
                    }`}
                  >
                    Padrão
                  </button>
                  <button
                    id="tier-batch-btn"
                    type="button"
                    onClick={() => setSelectedTier("batch")}
                    className={`py-1.5 text-[11px] font-bold rounded-md transition-all cursor-pointer ${
                      selectedTier === "batch"
                        ? "bg-emerald-500 text-black shadow-sm font-extrabold"
                        : darkMode
                          ? "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
                          : "text-slate-600 hover:text-slate-800 hover:bg-slate-200/50"
                    }`}
                  >
                    Lote
                  </button>
                  <button
                    id="tier-flex-btn"
                    type="button"
                    onClick={() => setSelectedTier("flex")}
                    className={`py-1.5 text-[11px] font-bold rounded-md transition-all cursor-pointer ${
                      selectedTier === "flex"
                        ? "bg-emerald-500 text-black shadow-sm font-extrabold"
                        : darkMode
                          ? "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
                          : "text-slate-600 hover:text-slate-800 hover:bg-slate-200/50"
                    }`}
                  >
                    Flex
                  </button>
                  <button
                    id="tier-priority-btn"
                    type="button"
                    onClick={() => setSelectedTier("priority")}
                    className={`py-1.5 text-[11px] font-bold rounded-md transition-all cursor-pointer ${
                      selectedTier === "priority"
                        ? "bg-emerald-500 text-black shadow-sm font-extrabold"
                        : darkMode
                          ? "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
                          : "text-slate-600 hover:text-slate-800 hover:bg-slate-200/50"
                    }`}
                  >
                    Prioridade
                  </button>
                </div>

                <p className="text-[10px] text-slate-500 leading-tight italic">
                  {selectedTier === "standard" && "⚡ Resposta em tempo real. Recomendado para SDR."}
                  {selectedTier === "batch" && "⏰ 50% mais barato. Atraso até 24h. Não serve para SDR."}
                  {selectedTier === "flex" && "🧘 50% mais barato. Pode atrasar se sobrecarregado."}
                  {selectedTier === "priority" && "🚀 1.8x mais caro. Latência garantida baixa."}
                </p>
              </div>

              {/* Detalhes de preço e cache */}
              <div className={`p-3 rounded-lg border text-xs ${themeClasses.badge} space-y-1.5`}>
                <div className="flex justify-between font-medium">
                  <span className="text-slate-400">Input / 1M tokens:</span>
                  <span className="text-emerald-400 font-bold">{getFormattedTokenPrice(selectedModel.inputUSD)}</span>
                </div>
                <div className="flex justify-between font-medium">
                  <span className="text-slate-400">Output / 1M tokens:</span>
                  <span className="text-emerald-400 font-bold">{getFormattedTokenPrice(selectedModel.outputUSD)}</span>
                </div>
                  
              </div>
            </div>

            {/* Volume de Atendimento */}
            <div className={`p-5 rounded-xl border ${themeClasses.card} space-y-3.5`}>
              <div className="flex items-center gap-2 border-b pb-2.5 border-slate-800/40">
                <Users className="h-4 w-4 text-emerald-500" />
                <h3 className="font-bold text-sm tracking-wide text-slate-200">Volume de Atendimento</h3>
              </div>

              {/* Quantidade de Leads */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs font-medium text-slate-400">
                  <span>Novos Leads SDR ({period === "dia" ? "Diário" : period === "semana" ? "Semanal" : "Mensal"})</span>
                  <span className="text-emerald-400 font-bold">{leads} leads/{period}</span>
                </div>
                <input
                  id="leads-input"
                  type="number"
                  min="1"
                  value={leads || ""}
                  onChange={(e) => setLeads(Math.max(1, parseInt(e.target.value) || 0))}
                  className={`w-full h-9 px-3 rounded-lg border text-xs font-semibold focus:outline-none transition-all ${themeClasses.input}`}
                />
                <p className="text-[10px] text-emerald-400/90 leading-tight mt-1 flex items-center justify-between">
                  <span>Equivalente: <strong>{calcResults.dailyLeadsIntake.toFixed(1)} leads/dia</strong></span>
                </p>
              </div>

              {/* Média de interações SDR por Lead */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs font-medium text-slate-400">
                  <span>Média de Mensagens SDR/Lead</span>
                  <span className="text-emerald-400 font-bold">{avgSdrMsgs} msgs/lead</span>
                </div>
                <input
                  id="avg-sdr-msgs-input"
                  type="number"
                  min="1"
                  value={avgSdrMsgs || ""}
                  onChange={(e) => setAvgSdrMsgs(Math.max(1, parseInt(e.target.value) || 1))}
                  className={`w-full h-9 px-3 rounded-lg border text-xs font-semibold focus:outline-none transition-all ${themeClasses.input}`}
                />
                <p className="text-[10px] text-slate-500 leading-tight">
                  Média de mensagens trocadas por lead na fase de SDR antes de avançar ou finalizar.
                </p>
              </div>

              {/* Toggle de Fila Ativa Dinâmica com Churn */}
              {calcMode === "regua" && (
                <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800/80 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor="dynamic-queue-toggle" className="text-xs font-bold text-slate-200 cursor-pointer flex items-center gap-1.5">
                      <RefreshCw className={`h-3.5 w-3.5 text-emerald-400 ${useDynamicQueue ? "animate-spin-slow" : ""}`} />
                      <span>Simular Fila Ativa com Churn (Saída de Leads)</span>
                    </label>
                    <input
                      id="dynamic-queue-toggle"
                      type="checkbox"
                      checked={useDynamicQueue}
                      onChange={(e) => setUseDynamicQueue(e.target.checked)}
                      className="h-4 w-4 rounded accent-emerald-500 cursor-pointer"
                    />
                  </div>
                  
                  {useDynamicQueue ? (
                    <div className="space-y-1 pt-1 border-t border-slate-800/60">
                      <p className="text-[11px] text-emerald-300 font-medium">
                        ✓ Fila Ativa Estabilizada: ~<strong>{calcResults.activeQueueSize} leads</strong> na base de follow.
                      </p>
                      <p className="text-[10px] text-slate-400 leading-tight">
                        A cada dia entram {calcResults.dailyLeadsIntake.toFixed(1)} leads. Ao final dos {diasFollowup} dias de régua ({msgsPorDia} msg/dia), os leads encerram o ciclo e saem da base, gerando exatamente <strong>{Math.round(calcResults.dailyFollowupMsgs)} mensagens/dia</strong> de follow-up.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1 pt-1 border-t border-slate-800/60">
                      <p className="text-[11px] text-amber-400 font-medium">
                        ⚠️ Modo Estático Ativo (Volume fixo manual)
                      </p>
                      <p className="text-[10px] text-slate-400 leading-tight">
                        Informe manualmente abaixo a quantidade fixa de disparos diários de follow-up.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Leads em Follow-up Ativo por Dia (Manual, quando useDynamicQueue é false) */}
              {calcMode === "regua" && !useDynamicQueue && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-medium text-slate-400">
                    <span>Envios de Follow-up Diários (Manual)</span>
                    <span className="text-emerald-400 font-bold">{activeFollowupsPerDay} envios/dia</span>
                  </div>
                  <input
                    id="active-followups-input"
                    type="number"
                    min="0"
                    value={activeFollowupsPerDay || ""}
                    onChange={(e) => setActiveFollowupsPerDay(Math.max(0, parseInt(e.target.value) || 0))}
                    className={`w-full h-9 px-3 rounded-lg border text-xs font-semibold focus:outline-none transition-all ${themeClasses.input}`}
                  />
                  <p className="text-[10px] text-slate-500 leading-tight">
                    Volume diário estático de mensagens automáticas de follow-up enviadas para a base.
                  </p>
                </div>
              )}

              {/* Período */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-400 block">Período de Projeção</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(["dia", "semana", "mês"] as const).map((p) => (
                    <button
                       key={p}
                       onClick={() => setPeriod(p)}
                       className={`h-8 text-xs font-bold capitalize rounded-lg border transition-all cursor-pointer ${
                        period === p
                          ? "bg-emerald-500 text-black border-emerald-500 shadow-sm"
                          : darkMode
                            ? "bg-[#18181b] border-slate-800 hover:bg-slate-800 text-slate-300"
                            : "bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-700"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cotação do Dólar (USD / BRL) */}
              <div className="space-y-1.5 pt-2 border-t border-slate-800/20">
                <div className="flex justify-between text-xs font-medium text-slate-400">
                  <span>Cotação Dólar (USD → BRL)</span>
                  <span className="text-emerald-400 font-mono font-bold">R$ {usdBrlRate.toFixed(2)}</span>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-bold pointer-events-none">
                    $1.00 USD = R$
                  </span>
                  <input
                    id="rate-input"
                    type="number"
                    step="0.01"
                    min="0.1"
                    max="100"
                    value={usdBrlRate}
                    onChange={(e) => setUsdBrlRate(Math.max(0.1, parseFloat(e.target.value) || 5.11))}
                    className={`w-full h-10 pl-[115px] pr-3 rounded-lg border text-sm font-semibold focus:outline-none transition-all ${themeClasses.input} [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
                  />
                </div>
                <p className="text-xs text-slate-500 leading-normal text-slate-400">
                  Ajuste o valor para atualizar dinamicamente todos os cálculos de custo em Reais (BRL).
                </p>
              </div>
            </div>

            {/* Estrutura da Conversa */}
            <div className={`p-5 rounded-xl border ${themeClasses.card} space-y-3.5`}>
              <div className="flex items-center justify-between border-b pb-2.5 border-slate-800/40">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-emerald-500" />
                  <h3 className="font-bold text-sm tracking-wide text-slate-200">Estrutura da Conversa</h3>
                </div>
              </div>

              {/* Seletor de Modo de Cálculo */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-400">Método de Entrada</label>
                <div className="grid grid-cols-2 gap-1.5 bg-slate-950/40 p-1 rounded-lg border border-slate-900">
                  <button
                    id="mode-regua"
                    onClick={() => setCalcMode("regua")}
                    className={`py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${
                      calcMode === "regua"
                        ? "bg-emerald-500 text-black shadow-sm"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Régua de SDR
                  </button>
                  <button
                    id="mode-direto"
                    onClick={() => setCalcMode("direto")}
                    className={`py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${
                      calcMode === "direto"
                        ? "bg-emerald-500 text-black shadow-sm"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Mensagens Direto
                  </button>
                </div>
              </div>

              {calcMode === "regua" ? (
                /* Atendimento SDR e Follow-up */
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-400">Média Msgs SDR/Lead</label>
                    <input
                      id="first-contact-input"
                      type="number"
                      min="1"
                      value={avgSdrMsgs || ""}
                      onChange={(e) => setAvgSdrMsgs(Math.max(1, parseInt(e.target.value) || 1))}
                      className={`w-full h-9 px-3 rounded-lg border text-xs font-semibold focus:outline-none transition-all ${themeClasses.input}`}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-400">Dias Follow-up</label>
                    <input
                      id="followup-days-input"
                      type="number"
                      min="0"
                      value={diasFollowup}
                      onChange={(e) => setDiasFollowup(Math.max(0, parseInt(e.target.value) || 0))}
                      className={`w-full h-9 px-3 rounded-lg border text-xs font-semibold focus:outline-none transition-all ${themeClasses.input}`}
                    />
                  </div>
                </div>
              ) : (
                /* Total de Mensagens Direto */
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-medium text-slate-400">
                    <span>Total de Mensagens do Funil</span>
                    <span className="text-emerald-400 font-bold">{totalMensagens} msgs</span>
                  </div>
                  <input
                    id="total-messages-input"
                    type="number"
                    min="1"
                    value={totalMensagens || ""}
                    onChange={(e) => setTotalMensagens(Math.max(1, parseInt(e.target.value) || 0))}
                    className={`w-full h-9 px-3 rounded-lg border text-xs font-semibold focus:outline-none transition-all ${themeClasses.input}`}
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                {calcMode === "regua" && (
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-400">Msgs/Dia Follow</label>
                    <input
                      id="msgs-day-follow-input"
                      type="number"
                      min="1"
                      value={msgsPorDia || ""}
                      onChange={(e) => setMsgsPorDia(Math.max(1, parseInt(e.target.value) || 0))}
                      className={`w-full h-9 px-3 rounded-lg border text-xs font-semibold focus:outline-none transition-all ${themeClasses.input}`}
                    />
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-400">Prompt Sistema (Chars)</label>
                  <input
                    id="system-prompt-input"
                    type="number"
                    min="100"
                    value={promptSistema || ""}
                    onChange={(e) => setPromptSistema(Math.max(100, parseInt(e.target.value) || 0))}
                    className={`w-full h-9 px-3 rounded-lg border text-xs font-semibold focus:outline-none transition-all ${themeClasses.input}`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-400">Msg Lead (Chars)</label>
                  <input
                    id="lead-msg-input"
                    type="number"
                    min="10"
                    value={msgLead || ""}
                    onChange={(e) => setMsgLead(Math.max(10, parseInt(e.target.value) || 0))}
                    className={`w-full h-9 px-3 rounded-lg border text-xs font-semibold focus:outline-none transition-all ${themeClasses.input}`}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-400">Resposta IA (Chars)</label>
                  <input
                    id="ai-response-input"
                    type="number"
                    min="10"
                    value={respostaIA || ""}
                    onChange={(e) => setRespostaIA(Math.max(10, parseInt(e.target.value) || 0))}
                    className={`w-full h-9 px-3 rounded-lg border text-xs font-semibold focus:outline-none transition-all ${themeClasses.input}`}
                  />
                </div>
              </div>

              {/* Tool-loop factor */}
              <div className="space-y-1.5 pt-2 border-t border-slate-800/20">
                <div className="flex justify-between text-xs font-medium text-slate-400">
                  <span>Tool-loop factor / Msg</span>
                  <span className="text-emerald-400 font-bold">{sdrToolLoopFactor.toFixed(1)}x</span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {[1.0, 1.5, 2.0, 3.0].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setSdrToolLoopFactor(val)}
                      className={`h-8 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                        sdrToolLoopFactor === val
                          ? "bg-emerald-500 text-black border-emerald-500 shadow-sm"
                          : darkMode
                            ? "bg-[#18181b] border-slate-800 hover:bg-slate-800 text-slate-300"
                            : "bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-700"
                      }`}
                    >
                      {val}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Markup do Integrador / Revenda */}
              <div className="space-y-1 pt-2 border-t border-slate-800/20">
                <div className="flex justify-between text-xs font-medium text-slate-400">
                  <span>Acréscimo / Markup da API (Opcional)</span>
                  <span className="text-emerald-400 font-bold">+{gatewayMarkup}%</span>
                </div>
                <input
                  id="gateway-markup-input"
                  type="number"
                  min="0"
                  max="1000"
                  value={gatewayMarkup}
                  onChange={(e) => setGatewayMarkup(Math.max(0, parseInt(e.target.value) || 0))}
                  className={`w-full h-9 px-3 rounded-lg border text-xs font-semibold focus:outline-none transition-all ${themeClasses.input}`}
                />
                <p className="text-[10px] text-slate-500 leading-tight">
                  Se você usa uma integradora parceira (como Uniagent) com margem de lucro sobre a API do Google, ajuste esta taxa.
                </p>
              </div>

              {/* Accordion de Prompts Avançados do n8n */}
              <div className="pt-2.5 border-t border-slate-800/20">
                <button
                  id="toggle-advanced-prompts-btn"
                  type="button"
                  onClick={() => setShowAdvancedPrompts(!showAdvancedPrompts)}
                  className="flex items-center justify-between w-full text-left text-xs font-bold text-slate-300 hover:text-emerald-400 transition-colors"
                >
                  <span>⚙️ Configurações Avançadas de Prompts (n8n)</span>
                  <span className="text-[10px] bg-slate-800/60 px-2 py-0.5 rounded border border-slate-700/50">
                    {showAdvancedPrompts ? "Ocultar ▴" : "Exibir ▾"}
                  </span>
                </button>

                {showAdvancedPrompts && (
                  <div className="mt-3 space-y-3 p-3.5 rounded-lg bg-slate-950/40 border border-slate-900 grid grid-cols-2 gap-3">
                    <div className="space-y-1 col-span-2">
                      <p className="text-[10px] text-slate-400 leading-snug">
                        Valores de prompts secundários mapeados automaticamente a partir do seu fluxo JSON do n8n ou editáveis manualmente.
                      </p>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-medium text-slate-400">SDR Fracionador (Chars)</label>
                      <input
                        id="sdr-frac-prompt-input"
                        type="number"
                        min="0"
                        value={promptSdrFracionador}
                        onChange={(e) => setPromptSdrFracionador(Math.max(0, parseInt(e.target.value) || 0))}
                        className={`w-full h-8 px-2.5 rounded-lg border text-[11px] font-semibold focus:outline-none transition-all ${themeClasses.input}`}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-medium text-slate-400">SDR Handoff/Resumo (Chars)</label>
                      <input
                        id="sdr-handoff-prompt-input"
                        type="number"
                        min="0"
                        value={promptSdrHandoff}
                        onChange={(e) => setPromptSdrHandoff(Math.max(0, parseInt(e.target.value) || 0))}
                        className={`w-full h-8 px-2.5 rounded-lg border text-[11px] font-semibold focus:outline-none transition-all ${themeClasses.input}`}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-medium text-slate-400">Follow Principal (Chars)</label>
                      <input
                        id="follow-main-prompt-input"
                        type="number"
                        min="0"
                        value={promptFollowPrincipal}
                        onChange={(e) => setPromptFollowPrincipal(Math.max(0, parseInt(e.target.value) || 0))}
                        className={`w-full h-8 px-2.5 rounded-lg border text-[11px] font-semibold focus:outline-none transition-all ${themeClasses.input}`}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-medium text-slate-400">Follow Fracionador (Chars)</label>
                      <input
                        id="follow-frac-prompt-input"
                        type="number"
                        min="0"
                        value={promptFollowFracionador}
                        onChange={(e) => setPromptFollowFracionador(Math.max(0, parseInt(e.target.value) || 0))}
                        className={`w-full h-8 px-2.5 rounded-lg border text-[11px] font-semibold focus:outline-none transition-all ${themeClasses.input}`}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Informação do volume total de mensagens */}
              <div className={`p-3 bg-slate-950/40 rounded-lg text-slate-400 border border-slate-900 text-xs flex justify-between`}>
                <span>Total de Mensagens / Lead:</span>
                <span className="font-bold text-emerald-400">{calcResults.mensagensPorLead} msgs</span>
              </div>
            </div>

            {/* Integração Supabase & Otimização */}
            <div className={`p-5 rounded-xl border ${themeClasses.card} space-y-3.5`}>
              <div className="flex items-center gap-2 border-b pb-2.5 border-slate-800/40">
                <Database className="h-4 w-4 text-emerald-500" />
                <h3 className="font-bold text-sm tracking-wide text-slate-200">Contexto do Supabase & Cache</h3>
              </div>

              {/* Tamanho das Ferramentas/Functions no Supabase */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs font-medium text-slate-400">
                  <span>Functions/Tools no Supabase</span>
                  <span className="text-emerald-400 font-mono font-bold">
                    {supabaseToolsSize.toLocaleString("pt-BR")} chars
                  </span>
                </div>
                <input
                  id="supabase-tools-input"
                  type="number"
                  min="0"
                  step="500"
                  value={supabaseToolsSize}
                  onChange={(e) => setSupabaseToolsSize(Math.max(0, parseInt(e.target.value) || 0))}
                  className={`w-full h-9 px-3 rounded-lg border text-xs font-semibold focus:outline-none transition-all ${themeClasses.input}`}
                />
                <p className="text-[10px] text-slate-500 leading-tight">
                  Tamanho estimado (caracteres) das definições de tools/functions e prompts auxiliares puxados do banco em cada chamada.
                </p>
              </div>

              {/* Chave de Cache de Prompt Omitida - Sempre Ativo */}
            </div>

          </div>

          {/* ───────────────── DIREITA (Resultados, 60%) ───────────────── */}
          <div className="space-y-6">
            
            {/* Comparativo de Custos por Fluxo (SDR vs Follow) */}
            <div className={`p-5 rounded-xl border ${themeClasses.card} space-y-3.5`}>
              <div className="flex items-center justify-between border-b pb-2.5 border-slate-800/40">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-emerald-500" />
                  <h4 className="font-bold text-sm text-slate-200">Detalhamento dos Fluxos por Lead</h4>
                </div>
                <span className="text-xs font-semibold text-slate-400">{leads} Leads / Mês</span>
              </div>

              <div className="grid sm:grid-cols-3 gap-3 text-center">
                {/* SDR */}
                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-0.5">
                  <span className="text-[11px] font-semibold text-slate-400 block">SDR (1º Contato)</span>
                  <p className="text-xl font-bold text-slate-100">{formatCurrency(calcResults.custoSDRPorLead)} <span className="text-xs font-normal text-slate-400">/ lead</span></p>
                  <p className="text-xs font-semibold text-emerald-400">{formatCurrency(calcResults.sdrCustoMensal)} / mês</p>
                </div>

                {/* Follow */}
                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-0.5">
                  <span className="text-[11px] font-semibold text-slate-400 block">Follow-up</span>
                  <p className="text-xl font-bold text-slate-100">{formatCurrency(calcResults.custoFollowPorLead)} <span className="text-xs font-normal text-slate-400">/ lead</span></p>
                  <p className="text-xs font-semibold text-emerald-400">{formatCurrency(calcResults.followCustoMensal)} / mês</p>
                </div>

                {/* Total Combinado */}
                <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-0.5">
                  <span className="text-[11px] font-bold text-emerald-400 block">Total / Lead</span>
                  <p className="text-xl font-bold text-emerald-400">{formatCurrency(calcResults.custoPorLead)} <span className="text-xs font-normal text-slate-400">/ lead</span></p>
                  <p className="text-xs font-bold text-emerald-300">{formatCurrency(calcResults.custoMensal)} / mês</p>
                </div>
              </div>
            </div>

            {/* Seção 4 KPI cards (2x2) */}
            <div className="grid sm:grid-cols-2 gap-4">
              
              {/* Card A: Custo por Mensagem */}
              <div className={`p-4 rounded-xl border ${themeClasses.card} ${themeClasses.kpiBg} space-y-1`}>
                <div className="flex items-center gap-1.5 text-slate-400 text-xs font-medium">
                  <Coins className="h-3.5 w-3.5 text-emerald-500" />
                  <span>Custo por Mensagem</span>
                </div>
                <p className="text-2xl font-bold tracking-tight text-slate-100">
                  {formatCurrency(calcResults.avgMsgCost)}
                </p>
                <p className="text-[11px] text-slate-500">Média ponderada do ciclo</p>
              </div>

              {/* Card B: Custo por Lead */}
              <div className={`p-4 rounded-xl border ${themeClasses.card} ${themeClasses.kpiBg} space-y-1`}>
                <div className="flex items-center gap-1.5 text-slate-400 text-xs font-medium">
                  <Users className="h-3.5 w-3.5 text-emerald-500" />
                  <span>Custo por Lead</span>
                </div>
                <p className="text-2xl font-bold tracking-tight text-emerald-400">
                  {formatCurrency(calcResults.custoPorLead)}
                </p>
                <p className="text-[11px] text-slate-500">Funil completo ({calcResults.totalChamadasPorLead} chamadas)</p>
              </div>

              {/* Card C: Custo no Período */}
              <div className={`p-4 rounded-xl border ${themeClasses.card} ${themeClasses.kpiBg} space-y-1`}>
                <div className="flex items-center gap-1.5 text-slate-400 text-xs font-medium">
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                  <span>Custo no Período ({period})</span>
                </div>
                <p className="text-2xl font-bold tracking-tight text-slate-100">
                  {formatCurrency(calcResults.custoPeriodo)}
                </p>
                <p className="text-[11px] text-slate-500">Projeção para o período selecionado</p>
              </div>

              {/* Card D: Custo Mensal */}
              <div className={`p-4 rounded-xl border ${themeClasses.card} ${themeClasses.kpiBg} space-y-1`}>
                <div className="flex items-center gap-1.5 text-slate-400 text-xs font-medium">
                  <Wallet className="h-3.5 w-3.5 text-emerald-500" />
                  <span>Custo Mensal</span>
                </div>
                <p className="text-2xl font-bold tracking-tight text-slate-100">
                  {formatCurrency(calcResults.custoMensal)}
                </p>
                <p className="text-[11px] text-slate-500">Estimativa para {leads} leads/mês</p>
              </div>

            </div>

            {/* Gráfico de Área: Custo × Leads */}
            <div className={`p-5 rounded-xl border ${themeClasses.card} space-y-3.5`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-2.5 border-slate-800/40">
                <div className="space-y-0.5">
                  <h4 className="font-bold text-sm text-slate-200">Previsibilidade de Custos × Leads ({period})</h4>
                  <p className="text-xs text-slate-400">Composição SDR + Follow-up de 0 a 100 leads</p>
                </div>
                <div className="flex items-center gap-2.5 text-[10px] font-bold">
                  <span className="flex items-center gap-1 text-blue-400">
                    <span className="h-2 w-2 rounded-full bg-blue-500"></span>
                    SDR
                  </span>
                  <span className="flex items-center gap-1 text-emerald-400">
                    <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                    Follow-up
                  </span>
                  {budget > 0 && (
                    <span className="flex items-center gap-1 text-amber-400">
                      <span className="h-1 w-2 bg-amber-400 rounded"></span>
                      Teto Orçamento
                    </span>
                  )}
                </div>
              </div>

              {/* Container do Gráfico */}
              <div className="h-52 w-full text-slate-200">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={chartData}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="colorSDR" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05} />
                      </linearGradient>
                      <linearGradient id="colorFollow" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={themeClasses.gridLines} vertical={false} />
                    <XAxis 
                      dataKey="leads" 
                      stroke="#888" 
                      fontSize={10} 
                      tickLine={false} 
                      axisLine={false}
                    />
                    <YAxis 
                      stroke="#888" 
                      fontSize={10} 
                      tickLine={false} 
                      axisLine={false}
                      tickFormatter={(tick) => `${isUSD ? "$" : "R$"} ${tick}`}
                    />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          const symbol = isUSD ? "$" : "R$";
                          return (
                            <div className="bg-slate-900/95 border border-slate-700/80 p-2.5 rounded-lg shadow-xl text-xs space-y-1 min-w-[190px]">
                              <p className="font-bold text-slate-200 border-b border-slate-800 pb-1">
                                Volume: {label} Leads ({period})
                              </p>
                              <div className="flex justify-between text-blue-400">
                                <span>SDR (1º Contato):</span>
                                <span className="font-mono font-bold">{symbol} {data.sdrCusto?.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between text-emerald-400">
                                <span>Follow-up:</span>
                                <span className="font-mono font-bold">{symbol} {data.followCusto?.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between text-slate-100 font-bold border-t border-slate-800 pt-1">
                                <span>Custo Total:</span>
                                <span className="font-mono text-emerald-300">{symbol} {data.custo?.toFixed(2)}</span>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />

                    <Area 
                      type="monotone" 
                      dataKey="sdrCusto" 
                      name="SDR"
                      stackId="1"
                      stroke="#3b82f6" 
                      strokeWidth={1.5}
                      fillOpacity={1} 
                      fill="url(#colorSDR)" 
                    />
                    <Area 
                      type="monotone" 
                      dataKey="followCusto" 
                      name="Follow-up"
                      stackId="1"
                      stroke="#10b981" 
                      strokeWidth={1.5}
                      fillOpacity={1} 
                      fill="url(#colorFollow)" 
                    />
                    {budget > 0 && (
                      <ReferenceLine 
                        y={budget} 
                        stroke="#f59e0b" 
                        strokeDasharray="4 4" 
                      />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Tabela de Detalhes da Mensagem (Opcional, porém incrivelmente rico para mostrar a matemática) */}
            <div className={`p-6 rounded-xl border ${themeClasses.card} space-y-4`}>
              <div className="flex items-center gap-2 border-b pb-3 border-slate-800/40">
                <FileText className="h-5 w-5 text-emerald-500" />
                <h4 className="font-bold text-lg text-slate-300 uppercase tracking-wider">Detalhamento Técnico por Mensagem (1 Ciclo SDR)</h4>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800/60 text-slate-400 uppercase tracking-wider text-xs font-bold">
                      <th className="py-2.5 pr-2">Msg</th>
                      <th className="py-2.5 pr-2">Chars Input</th>
                      <th className="py-2.5 pr-2">Chars Output</th>
                      <th className="py-2.5 pr-2">Tokens Est.</th>
                      <th className="py-2.5 text-right">Custo Msg</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/20">
                    {calcResults.mensagensDetalhes.map((msg) => (
                      <tr key={msg.num} className="hover:bg-slate-500/5 transition-all text-sm">
                        <td className="py-2.5 font-bold text-slate-300">#{msg.num}</td>
                        <td className="py-2.5 text-slate-400">
                          {msg.inputChars.toLocaleString("pt-BR")}{" "}
                            
                        </td>
                        <td className="py-2.5 text-slate-400">{msg.outputChars.toLocaleString("pt-BR")}</td>
                        <td className="py-2.5 text-slate-400">
                          {msg.inputTokens + msg.outputTokens} t
                        </td>
                        <td className="py-2.5 text-right font-semibold text-emerald-400">
                          {formatCurrency(msg.custoMsg)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </div>

        </div>
      )
      }
    </div>
    )}

        {/* ═══════ SEÇÃO: CENÁRIOS REAIS & COMPARATIVO ═══════ */}
        {activeMainTab === "presets" && (
          <div className="space-y-6">
            <div className={`p-6 rounded-xl border border-emerald-500/20 bg-emerald-500/5 space-y-4 shadow-md`}>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-emerald-500 animate-pulse" />
                <h4 className="font-bold text-base uppercase text-emerald-400 tracking-wider">Cenários Reais de Produção (n8n + Supabase)</h4>
              </div>
              <p className="text-sm text-slate-300 leading-relaxed">
                Carregue instantaneamente parâmetros reais extraídos das credenciais do Supabase (Prompt SDR: 37.728 chars + Fracionamento + Handoff | Prompt Follow: 27.213 chars).
              </p>
              <div className="grid sm:grid-cols-2 gap-3">
                <button
                  id="load-case-study-real-preset-gemini-35"
                  onClick={() => {
                    setSelectedModelId("gemini-3-5-flash-lite");
                    setSelectedTier("standard");
                    setLeads(250);
                    setPeriod("mês");
                    setAvgSdrMsgs(15);
                    setActiveFollowupsPerDay(250);
                    setSupabaseToolsSize(5000);
                    setDiasFollowup(10);
                    setMsgsPorDia(1);
                    setFollowupRetention(30);
                    setPromptSistema(37728);
                    setPromptSdrFracionador(4364);
                    setPromptFollowPrincipal(27213);
                    setPromptFollowFracionador(734);
                    setPromptSdrHandoff(1619);
                    setGatewayMarkup(0);
                    setMsgLead(500);
                    setRespostaIA(800);
                    setChamadasPorMsg(2);
                    setIsUSD(false);
                    setUsdBrlRate(5.11);
                    setActiveMainTab("simulator");
                  }}
                  className="w-full py-3.5 px-4 bg-emerald-500 text-black hover:bg-emerald-400 font-extrabold text-xs rounded-xl transition-all shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2 cursor-pointer sm:col-span-2"
                >
                  <span>🎯 Cenário Comercial Assertivo Gemini 3.5 Flash-Lite (API Direta: ~R$ 157,58/mês | Com Gateway Integrador 4x: ~R$ 630/mês | 250 leads)</span>
                  <ArrowRight className="h-4 w-4 stroke-[2.5]" />
                </button>

                <button
                  id="load-case-study-real-preset"
                  onClick={() => {
                    setSelectedModelId("gemini-3-5-flash-lite");
                    setSelectedTier("standard");
                    setLeads(100);
                    setPeriod("dia");
                    setAvgSdrMsgs(8);
                    setActiveFollowupsPerDay(500);
                    setSupabaseToolsSize(5000);
                    setDiasFollowup(14);
                    setMsgsPorDia(1);
                    setPromptSistema(37728);
                    setPromptSdrFracionador(4364);
                    setPromptFollowPrincipal(27213);
                    setPromptFollowFracionador(734);
                    setPromptSdrHandoff(1619);
                    setGatewayMarkup(0);
                    setMsgLead(500);
                    setRespostaIA(800);
                    setChamadasPorMsg(2);
                    setIsUSD(false);
                    setUsdBrlRate(5.11);
                    setActiveMainTab("simulator");
                  }}
                  className="w-full py-3.5 px-4 bg-slate-800 text-slate-100 hover:bg-slate-700 border border-slate-700 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer sm:col-span-2"
                >
                  <span>🚀 Cenário de Alto Volume Gemini 3.5 Flash-Lite (100 leads/dia + 500 follow-ups/dia)</span>
                  <ArrowRight className="h-4 w-4 stroke-[2.5]" />
                </button>

                <button
                  id="load-case-study-gemini-lite"
                  onClick={() => {
                    setSelectedModelId("gemini-3-1-flash-lite");
                    setSelectedTier("standard");
                    setLeads(250);
                    setPeriod("mês");
                    setUsdBrlRate(5.11);
                    setCalcMode("regua");
                    setAvgSdrMsgs(15);
                    setActiveFollowupsPerDay(250);
                    setSupabaseToolsSize(5000);
                    setDiasFollowup(10);
                    setMsgsPorDia(1);
                    setPromptSistema(37728);
                    setGatewayMarkup(0);
                    setMsgLead(500);
                    setRespostaIA(800);
                    setChamadasPorMsg(2);
                    setIsUSD(false);
                    setActiveMainTab("simulator");
                  }}
                  className="w-full py-3.5 px-4 bg-slate-800 text-slate-100 hover:bg-slate-700 border border-slate-700 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>🔥 Gemini 3.1 Flash-Lite (API Direta: ~R$ 110,31/mês | 250 leads)</span>
                  <ArrowRight className="h-4 w-4 stroke-[2.5]" />
                </button>

                <button
                  id="load-case-study-gemini-flash"
                  onClick={() => {
                    setSelectedModelId("gemini-2-5-flash");
                    setSelectedTier("standard");
                    setLeads(250);
                    setPeriod("mês");
                    setUsdBrlRate(5.11);
                    setCalcMode("regua");
                    setAvgSdrMsgs(15);
                    setDiasFollowup(10);
                    setMsgsPorDia(1);
                    setPromptSistema(37728);
                    setGatewayMarkup(0);
                    setMsgLead(500);
                    setRespostaIA(800);
                    setChamadasPorMsg(2);
                    setIsUSD(false);
                    setActiveMainTab("simulator");
                  }}
                  className="w-full py-3.5 px-4 bg-slate-800 text-slate-100 hover:bg-slate-700 border border-slate-700 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>⚡ Gemini 2.5 Flash (API Direta: ~R$ 157,58/mês | 250 leads)</span>
                  <ArrowRight className="h-4 w-4 stroke-[2.5]" />
                </button>

                <button
                  id="load-case-study-gpt4o"
                  onClick={() => {
                    setSelectedModelId("gpt-4o-mini");
                    setSelectedTier("standard");
                    setLeads(250);
                    setPeriod("mês");
                    setUsdBrlRate(5.11);
                    setCalcMode("regua");
                    setAvgSdrMsgs(15);
                    setDiasFollowup(10);
                    setMsgsPorDia(1);
                    setPromptSistema(37728);
                    setGatewayMarkup(0);
                    setMsgLead(500);
                    setRespostaIA(800);
                    setChamadasPorMsg(2);
                    setIsUSD(false);
                    setActiveMainTab("simulator");
                  }}
                  className="w-full py-3.5 px-4 bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer sm:col-span-2"
                >
                  <span>Comparativo GPT-4o Mini OpenAI (API Direta: ~R$ 62,08/mês | 250 leads)</span>
                  <ArrowRight className="h-4 w-4 stroke-[2.5]" />
                </button>
              </div>
            </div>

            {/* Tabela Comparativa de Todos os Modelos */}
            <div className={`p-6 rounded-xl border ${themeClasses.card} space-y-4`}>
              <div className="flex items-center gap-2 border-b pb-3 border-slate-800/40">
                <Layers className="h-5 w-5 text-emerald-500" />
                <h4 className="font-bold text-lg text-slate-200 uppercase tracking-wider">Matriz Comparativa de Modelos ({leads} Leads / Mês)</h4>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800/60 text-slate-400 uppercase tracking-wider text-xs font-bold">
                      <th className="py-3 pr-2">Modelo</th>
                      <th className="py-3 pr-2">Provedor</th>
                      <th className="py-3 pr-2">Input / Output (USD)</th>
                      <th className="py-3 pr-2">Desconto Cache</th>
                      <th className="py-3 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/20">
                    {MODELS.map((m) => {
                      const isSelected = m.id === selectedModelId;
                      return (
                        <tr key={m.id} className={`transition-all text-sm ${isSelected ? "bg-emerald-500/10 font-bold" : "hover:bg-slate-800/30"}`}>
                          <td className="py-3 font-semibold text-slate-200">
                            {m.name} {isSelected && <span className="ml-1 text-[10px] bg-emerald-500 text-black px-1.5 py-0.5 rounded font-extrabold">ATIVO</span>}
                          </td>
                          <td className="py-3 text-slate-400 text-xs">{m.provider}</td>
                          <td className="py-3 font-mono text-xs text-slate-300">
                            ${m.inputUSD} / ${m.outputUSD}
                          </td>
                          <td className="py-3 text-xs">
</td>
                          <td className="py-3 text-right">
                            <button
                              onClick={() => {
                                setSelectedModelId(m.id);
                                setActiveMainTab("simulator");
                              }}
                              className="px-3 py-1.5 bg-slate-800 hover:bg-emerald-500 hover:text-black text-slate-200 text-xs font-bold rounded-lg transition-all cursor-pointer"
                            >
                              Selecionar
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ═══════ SEÇÃO: TABELA & GRÁFICOS ═══════ */}
        {activeMainTab === "details" && (
          <div className="space-y-6">
            {/* Gráfico de Área */}
            <div className={`p-6 rounded-xl border ${themeClasses.card} space-y-4`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-3 border-slate-800/40">
                <div className="space-y-0.5">
                  <h4 className="font-bold text-lg tracking-wide uppercase">Previsibilidade de Custos: Custo x Leads ({period})</h4>
                  <p className="text-sm text-slate-400">Projeção {period === "dia" ? "diária" : period === "semana" ? "semanal" : "mensal"} de 0 a 100 leads com decomposição SDR + Follow-up</p>
                </div>
                <div className="flex items-center gap-3 text-xs font-bold uppercase">
                  <span className="flex items-center gap-1.5 text-blue-400">
                    <span className="h-3 w-3 bg-blue-500 rounded-sm"></span>
                    SDR (1º Contato)
                  </span>
                  <span className="flex items-center gap-1.5 text-emerald-400">
                    <span className="h-3 w-3 bg-emerald-500 rounded-sm"></span>
                    Follow-up ({useDynamicQueue ? "Fila Dinâmica" : "Estático"})
                  </span>
                  {budget > 0 && (
                    <span className="flex items-center gap-1.5 text-amber-400">
                      <span className="h-2 w-4 border-b-2 border-dashed border-amber-400"></span>
                      Teto Orçamento
                    </span>
                  )}
                </div>
              </div>

              <div className="h-72 w-full text-slate-200">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={chartData}
                    margin={{ top: 15, right: 10, left: -20, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="colorSDR2" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05} />
                      </linearGradient>
                      <linearGradient id="colorFollow2" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={themeClasses.gridLines} vertical={false} />
                    <XAxis 
                      dataKey="leads" 
                      stroke="#888" 
                      fontSize={11} 
                      tickLine={false} 
                      axisLine={false}
                      label={{ value: "Quantidade de Leads", position: "insideBottom", offset: -2, style: { fontSize: "11px", fill: "#888", fontWeight: "bold" } }}
                    />
                    <YAxis 
                      stroke="#888" 
                      fontSize={11} 
                      tickLine={false} 
                      axisLine={false}
                      tickFormatter={(tick) => `${isUSD ? "$" : "R$"} ${tick}`}
                    />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          const symbol = isUSD ? "$" : "R$";
                          return (
                            <div className="bg-slate-900/95 border border-slate-700/80 p-3 rounded-lg shadow-xl text-xs space-y-1.5 min-w-[210px]">
                              <p className="font-bold text-slate-200 border-b border-slate-800 pb-1 flex justify-between">
                                <span>Volume: {label} Leads ({period})</span>
                              </p>
                              <div className="flex justify-between items-center text-blue-400">
                                <span className="flex items-center gap-1">
                                  <span className="h-2 w-2 rounded-full bg-blue-500"></span>
                                  SDR (1º Contato):
                                </span>
                                <span className="font-mono font-bold">{symbol} {data.sdrCusto?.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between items-center text-emerald-400">
                                <span className="flex items-center gap-1">
                                  <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                                  Follow-up ({useDynamicQueue ? "Fila Churn" : "Fixo"}):
                                </span>
                                <span className="font-mono font-bold">{symbol} {data.followCusto?.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between items-center text-slate-100 font-bold border-t border-slate-800/80 pt-1">
                                <span>Custo Total Projeção:</span>
                                <span className="font-mono text-emerald-300">{symbol} {data.custo?.toFixed(2)}</span>
                              </div>
                              {budget > 0 && (
                                <div className="flex justify-between items-center text-amber-400/90 text-[10px] pt-0.5">
                                  <span>Comp. Orçamento:</span>
                                  <span>{((data.custo / budget) * 100).toFixed(0)}% do teto</span>
                                </div>
                              )}
                            </div>
                          );
                        }
                        return null;
                      }}
                    />

                    <Area 
                      type="monotone" 
                      dataKey="sdrCusto" 
                      name="SDR (1º Contato)"
                      stackId="1"
                      stroke="#3b82f6" 
                      strokeWidth={2}
                      fillOpacity={1} 
                      fill="url(#colorSDR2)" 
                    />
                    <Area 
                      type="monotone" 
                      dataKey="followCusto" 
                      name="Follow-up"
                      stackId="1"
                      stroke="#10b981" 
                      strokeWidth={2}
                      fillOpacity={1} 
                      fill="url(#colorFollow2)" 
                    />
                    {budget > 0 && (
                      <ReferenceLine 
                        y={budget} 
                        stroke="#f59e0b" 
                        strokeDasharray="4 4" 
                        label={{ value: `Teto Orçamento (${isUSD ? "$" : "R$"} ${budget})`, fill: "#f59e0b", fontSize: 10, position: "insideTopRight" }}
                      />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Tabela de Detalhes da Mensagem */}
            <div className={`p-6 rounded-xl border ${themeClasses.card} space-y-4`}>
              <div className="flex items-center justify-between border-b pb-3 border-slate-800/40">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-emerald-500" />
                  <h4 className="font-bold text-lg text-slate-300 uppercase tracking-wider">Detalhamento Técnico por Mensagem (1 Ciclo SDR)</h4>
                </div>
                <span className="text-xs font-mono text-emerald-400 font-bold">{selectedModel.name}</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800/60 text-slate-400 uppercase tracking-wider text-xs font-bold">
                      <th className="py-2.5 pr-2">Msg</th>
                      <th className="py-2.5 pr-2">Chars Input</th>
                      <th className="py-2.5 pr-2">Chars Output</th>
                      <th className="py-2.5 pr-2">Tokens Est.</th>
                      <th className="py-2.5 text-right">Custo Msg</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/20">
                    {calcResults.mensagensDetalhes.map((msg) => (
                      <tr key={msg.num} className="hover:bg-slate-500/5 transition-all text-sm">
                        <td className="py-2.5 font-bold text-slate-300">#{msg.num}</td>
                        <td className="py-2.5 text-slate-400">
                          {msg.inputChars.toLocaleString("pt-BR")}{" "}
                            
                        </td>
                        <td className="py-2.5 text-slate-400">{msg.outputChars.toLocaleString("pt-BR")}</td>
                        <td className="py-2.5 text-slate-400">
                          {msg.inputTokens + msg.outputTokens} t
                        </td>
                        <td className="py-2.5 text-right font-semibold text-emerald-400">
                          {formatCurrency(msg.custoMsg)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ═══════ SEÇÃO: CHAT CONSULTOR IA ═══════ */}
        {activeMainTab === "chat" && (
          <div className="space-y-6">
            <div className={`p-6 rounded-xl border ${themeClasses.card} flex flex-col h-[650px] shadow-lg relative`}>
              {/* Header do Chat */}
              <div className="flex items-center justify-between border-b pb-4 border-slate-800/40">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-base text-slate-200">Consultor IA de Custos Gemini</h4>
                    <p className="text-[11px] text-slate-400">Pergunte sobre conceitos, tiers de preço ou passe o escopo do seu projeto para estimar gastos.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setChatMessages([
                      {
                        role: "assistant",
                        content: `Olá! Sou o seu **Consultor Especialista em Custos do Gemini** 🤖.

Estou aqui para esclarecer qualquer dúvida sobre:
- **O que é cada parâmetro** do simulador (leads, prompts, etc.)
- **Como funcionam os Tiers de preço** (Standard vs Lote vs Flex vs Prioridade)
- **Prompt Caching** (como economizar até 90% de API)

Você também pode me passar a **base do seu projeto** (ex: *"Tenho uma imobiliária que atende uns 30 leads por dia, cada lead troca umas 6 mensagens com a IA, e meu prompt do sistema tem 40.000 caracteres. Quero usar o Gemini 3.1 Flash-Lite."*), e eu calcularei a estimativa de custos para você e gerarei um botão para **aplicar as configurações diretamente no simulador com 1 clique**! ✨

Como posso te ajudar hoje?`
                      }
                    ]);
                  }}
                  className={`text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded-md border border-slate-850 hover:border-slate-700 transition-all cursor-pointer ${
                    darkMode ? "bg-slate-900 text-slate-400 hover:text-slate-200" : "bg-slate-100 text-slate-600 hover:text-slate-850"
                  }`}
                >
                  Limpar Chat
                </button>
              </div>

              {/* Lista de Mensagens */}
              <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1 scrollbar-thin">
                {chatMessages.map((msg, index) => {
                  const isUser = msg.role === "user";
                  const hasApplyJson = !isUser && msg.content.includes("```json-apply");
                  
                  let displayContent = msg.content;
                  let parsedConfig: any = null;

                  if (hasApplyJson) {
                    const match = msg.content.match(/```json-apply\s*([\s\S]*?)\s*```/);
                    if (match && match[1]) {
                      try {
                        parsedConfig = JSON.parse(match[1].trim());
                        // Remove o bloco JSON-apply do texto para não poluir a leitura do Markdown
                        displayContent = msg.content.replace(/```json-apply\s*([\s\S]*?)\s*```/, "").trim();
                      } catch (e) {
                        console.error("Erro ao fazer parse do config JSON-apply:", e);
                      }
                    }
                  }

                  return (
                    <div
                      key={index}
                      className={`flex ${isUser ? "justify-end" : "justify-start"} items-start gap-2.5`}
                    >
                      {!isUser && (
                        <div className="p-1.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mt-1 shrink-0">
                          <Bot className="h-4 w-4" />
                        </div>
                      )}
                      
                      <div className="space-y-2 max-w-[85%]">
                        <div
                          className={`p-4 rounded-2xl text-xs leading-relaxed border ${
                            isUser
                              ? "bg-emerald-500 border-emerald-400 text-black font-medium rounded-tr-none"
                              : darkMode
                                ? "bg-slate-900/60 border-slate-800/80 text-slate-200 rounded-tl-none"
                                : "bg-slate-50 border-slate-200 text-slate-800 rounded-tl-none"
                          }`}
                        >
                          {isUser ? (
                            <p className="whitespace-pre-line">{displayContent}</p>
                          ) : (
                            <div className="markdown-body prose prose-invert prose-sm max-w-none text-slate-300">
                              <Markdown>{displayContent}</Markdown>
                            </div>
                          )}
                        </div>

                        {/* Card do JSON-Apply (Ação de aplicação automática) */}
                        {parsedConfig && (
                          <div className={`p-4 rounded-xl border-2 border-dashed ${
                            darkMode ? "bg-emerald-950/20 border-emerald-500/30 text-slate-200" : "bg-emerald-50 border-emerald-400/30 text-slate-800"
                          } space-y-3`}>
                            <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-xs uppercase tracking-wide">
                              <Zap className="h-3.5 w-3.5 fill-emerald-400/20" />
                              <span>Configurações Prontas para Simulação</span>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] font-medium border-b pb-2 border-slate-800/40">
                              <div>Leads: <span className="font-bold text-emerald-400">{parsedConfig.leads} / {parsedConfig.period || "mês"}</span></div>
                              <div>Mensagens/Lead: <span className="font-bold text-emerald-400">{parsedConfig.avgSdrMsgs || 4}</span></div>
                              <div>Prompt Sistema: <span className="font-bold text-emerald-400">{(parsedConfig.promptSistema || 0).toLocaleString("pt-BR")} chars</span></div>
                              <div>Modelo: <span className="font-bold text-emerald-400">{MODELS.find(m => m.id === parsedConfig.selectedModelId)?.name || parsedConfig.selectedModelId}</span></div>
                              <div>Tier: <span className="font-bold text-emerald-400 uppercase">{parsedConfig.selectedTier || "standard"}</span></div>
                              
                            </div>

                            <button
                              id="apply-calculated-config-btn"
                              type="button"
                              onClick={() => {
                                if (parsedConfig.leads !== undefined) setLeads(parsedConfig.leads);
                                if (parsedConfig.period !== undefined) setPeriod(parsedConfig.period);
                                if (parsedConfig.avgSdrMsgs !== undefined) setAvgSdrMsgs(parsedConfig.avgSdrMsgs);
                                if (parsedConfig.promptSistema !== undefined) setPromptSistema(parsedConfig.promptSistema);
                                                                if (parsedConfig.selectedModelId !== undefined) setSelectedModelId(parsedConfig.selectedModelId);
                                if (parsedConfig.selectedTier !== undefined) setSelectedTier(parsedConfig.selectedTier);
                                setActiveMainTab("simulator");
                              }}
                              className="w-full py-2 px-3 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs rounded-lg transition-all flex items-center justify-center gap-1.5 shadow cursor-pointer"
                            >
                              <Sparkles className="h-3.5 w-3.5 fill-black/20" />
                              <span>Aplicar Configurações no Simulador</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {isChatLoading && (
                  <div className="flex justify-start items-center gap-2.5">
                    <div className="p-1.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mt-1">
                      <Bot className="h-4 w-4 animate-bounce" />
                    </div>
                    <div className={`p-4 rounded-2xl rounded-tl-none border text-xs text-slate-400 flex items-center gap-2 ${
                      darkMode ? "bg-slate-900/60 border-slate-800/80" : "bg-slate-50 border-slate-200"
                    }`}>
                      <span className="flex h-1.5 w-1.5 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                      </span>
                      <span>O Consultor IA está calculando e redigindo a resposta...</span>
                    </div>
                  </div>
                )}
                
                <div ref={chatEndRef} />
              </div>

              {/* Botões de Sugestão / Chips */}
              <div className="py-2.5 flex flex-wrap gap-1.5 border-t border-slate-800/40">
                <button
                  type="button"
                  onClick={() => {
                    setChatInput("Qual a diferença entre os tiers Padrão, Lote, Flex e Prioridade?");
                  }}
                  className={`text-[10px] font-bold px-3 py-1.5 rounded-full border transition-all cursor-pointer ${
                    darkMode ? "bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700" : "bg-slate-100 border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  ⚖️ Diferença entre os Tiers?
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChatInput("O que é Prompt Caching e como ele ajuda a economizar?");
                  }}
                  className={`text-[10px] font-bold px-3 py-1.5 rounded-full border transition-all cursor-pointer ${
                    darkMode ? "bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700" : "bg-slate-100 border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  ⚡ O que é Prompt Caching?
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChatInput("Calcula pra mim: tenho 50 leads por dia, prompt de 40k caracteres, rodando com o Gemini 3.1 Flash-Lite no plano Padrão.");
                  }}
                  className={`text-[10px] font-bold px-3 py-1.5 rounded-full border transition-all cursor-pointer ${
                    darkMode ? "bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700" : "bg-slate-100 border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  📈 Calcular projeto de 50 leads/dia
                </button>
              </div>

              {/* Form de Input de Mensagem */}
              <div className="pt-3 space-y-2">
                {chatFiles.length > 0 && (
                  <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto pr-1">
                    {chatFiles.map((fileItem, idx) => (
                      <div 
                        key={`${fileItem.name}-${idx}`}
                        className={`flex items-center justify-between p-2 rounded-lg border text-xs ${
                          darkMode ? "bg-slate-900/60 border-slate-800 text-slate-300" : "bg-slate-50 border-slate-200 text-slate-700"
                        }`}
                      >
                        <div className="flex items-center gap-2 overflow-hidden pr-2">
                          <FileText className="h-4 w-4 text-emerald-500 shrink-0" />
                          <span className="text-[10px] font-bold truncate">{fileItem.name}</span>
                        </div>
                        <button 
                          type="button"
                          onClick={() => handleRemoveChatFile(idx)}
                          className={`p-1 rounded-full transition-colors ${
                            darkMode ? "hover:bg-slate-800 text-slate-500 hover:text-red-400" : "hover:bg-slate-200 text-slate-400 hover:text-red-500"
                          }`}
                          title="Remover arquivo"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                
                <form onSubmit={handleSendChatMessage} className="flex gap-2">
                  <input
                    type="file"
                    ref={chatFileInputRef}
                    onChange={handleChatFileChange}
                    className="hidden"
                    multiple
                    accept="image/*,.pdf,.txt,.json,.csv"
                  />
                  <button
                    type="button"
                    onClick={() => chatFileInputRef.current?.click()}
                    disabled={isChatLoading}
                    className={`px-3 h-10 rounded-xl border flex items-center justify-center transition-all disabled:opacity-50 relative ${
                      darkMode ? "bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700" : "bg-white border-slate-200 text-slate-500 hover:text-slate-900"
                    }`}
                    title="Anexar arquivos (suporta múltiplos)"
                  >
                    <PlusCircle className="h-5 w-5" />
                    {chatFiles.length > 0 && (
                      <span className="absolute -top-1 -right-1 bg-emerald-500 text-black font-extrabold text-[9px] w-4 h-4 rounded-full flex items-center justify-center">
                        {chatFiles.length}
                      </span>
                    )}
                  </button>
                  <input
                    id="chat-input-field"
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Escreva sua pergunta ou passe a descrição do projeto..."
                    disabled={isChatLoading}
                    className={`flex-1 h-10 px-4 rounded-xl border text-xs font-semibold focus:outline-none transition-all ${themeClasses.input}`}
                  />
                  <button
                    id="chat-submit-btn"
                    type="submit"
                    disabled={isChatLoading || (!chatInput.trim() && chatFiles.length === 0)}
                    className="px-4 h-10 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 disabled:opacity-50 transition-all cursor-pointer shrink-0"
                  >
                    <span>Enviar</span>
                    <ArrowRight className="h-4 w-4 stroke-[2.5]" />
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* ═══════ SEÇÃO: PLANNER OPERACIONAL (TCO TOTAL) ═══════ */}
        {activeMainTab === "planner" && (
          <div className="space-y-6">
            <div className={`p-6 rounded-xl border ${themeClasses.card} space-y-4 shadow-lg`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4 border-slate-800/60">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                    <Briefcase className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
                      Planner Operacional & TCO Total
                      <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        Visão de Negócio
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400">
                      Soma os custos de IA com infraestrutura, WhatsApp API, manutenção e setup. Alterne o controle individual de cada item.
                    </p>
                  </div>
                </div>

                <button
                  id="reset-planner-preset-btn"
                  onClick={() => setOperationalParams(PLANNER_RESGATA_COMPLETO)}
                  className="px-3.5 py-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 font-bold text-xs flex items-center gap-2 transition-all cursor-pointer shrink-0"
                  title="Restaurar padrão do Planner Resgata Completo"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Carregar Preset: Resgata Completo</span>
                </button>
              </div>

              {/* Grid 2 Colunas */}
              <div className="grid lg:grid-cols-12 gap-6 pt-2">
                
                {/* COLUNA ESQUERDA: INPUTS OPERACIONAIS & TOGGLES */}
                <div className="lg:col-span-6 space-y-5">
                  
                  {/* SEÇÃO 1: TOKEN (IA) — DESTAQUE VERDE */}
                  <div className="p-4 rounded-xl bg-emerald-950/40 border-2 border-emerald-500/40 space-y-3 shadow-md">
                    <div className="flex items-center justify-between border-b border-emerald-500/30 pb-2">
                      <div className="flex items-center gap-2">
                        <Bot className="h-5 w-5 text-emerald-400" />
                        <h4 className="text-xs font-extrabold text-emerald-300 uppercase tracking-wider">
                          💬 TOKEN (IA) — Base Inegociável
                        </h4>
                      </div>
                      <span className="text-[10px] uppercase font-bold text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded border border-emerald-500/30">
                        Sem Toggle (Engine IA)
                      </span>
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900/90 border border-emerald-500/30">
                      <div>
                        <span className="text-xs font-bold text-slate-100 block">
                          IA — SDR + Follow-up (com margem)
                        </span>
                        <span className="text-[11px] text-slate-400 block mt-0.5">
                          Calculado via engine oficial ({selectedModel.name})
                        </span>
                        <span className="text-[10px] text-emerald-400 font-mono block mt-1">
                          base R$ {Math.round(calcResults.rawFlowResult.totalMonthlyCostBrlBase).toLocaleString("pt-BR")} + {Math.round((calcResults.rawFlowResult.safetyMarginMultiplier - 1) * 100)}% = R$ {Math.round(calcResults.rawFlowResult.totalMonthlyCostBrlWithMargin - calcResults.rawFlowResult.totalMonthlyCostBrlBase).toLocaleString("pt-BR")}
                        </span>
                      </div>
                      <div className="text-right">
                        <strong className="text-base font-mono font-black text-emerald-400 block">
                          R$ {opReport.aiMonthly.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          <span className="text-[10px] text-slate-400 font-normal"> /mês</span>
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* SEÇÃO 2: CUSTOS OPERACIONAIS (RECORRENTES MENSALMENTE) */}
                  <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                      <div className="flex items-center gap-2">
                        <Server className="h-4 w-4 text-blue-400" />
                        <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                          🖥️ Custos Operacionais e Manutenção (Recorrentes)
                        </h4>
                      </div>
                      <span className="text-xs font-mono font-bold text-blue-400">
                        R$ {(opReport.infrastructureMonthly + opReport.laborMonthly).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}/mês
                      </span>
                    </div>

                    <div className="space-y-2.5 text-xs">
                      {operationalParams.items.filter(i => i.category === "infra" || i.category === "labor").map((item) => {
                        const isUazapi = item.id === "uazapi";
                        const isCrm = item.id === "crm_monthly";
                        const isMaintenance = item.id === "maintenance";
                        return (
                          <div
                            key={item.id}
                            className={`flex items-center justify-between p-2.5 rounded-lg border transition-all ${
                              item.enabled
                                ? "bg-slate-900 border-slate-700/80"
                                : "bg-slate-950/50 border-slate-800/40 opacity-60"
                            }`}
                          >
                            <div className="flex items-center gap-2.5 flex-1 min-w-0 pr-2">
                              <input
                                type="checkbox"
                                id={`toggle-item-${item.id}`}
                                checked={item.enabled}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setOperationalParams(prev => ({
                                    ...prev,
                                    items: prev.items.map(it => it.id === item.id ? { ...it, enabled: checked } : it)
                                  }));
                                }}
                                className={`rounded border-slate-700 cursor-pointer h-4 w-4 shrink-0 ${isMaintenance ? 'accent-purple-500' : 'accent-blue-500'}`}
                              />
                              <label htmlFor={`toggle-item-${item.id}`} className="font-medium text-slate-200 cursor-pointer truncate flex items-center gap-1.5">
                                {item.label}
                                {isUazapi && (
                                  <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                    API WhatsApp
                                  </span>
                                )}
                                {isCrm && (
                                  <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                                    CRM SaaS
                                  </span>
                                )}
                              </label>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-slate-400 text-xs">R$</span>
                              <input
                                type="number"
                                id={`input-item-val-${item.id}`}
                                disabled={!item.enabled}
                                value={item.monthlyValue}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  setOperationalParams(prev => ({
                                    ...prev,
                                    items: prev.items.map(it => it.id === item.id ? { ...it, monthlyValue: val } : it)
                                  }));
                                }}
                                className={`w-24 h-8 px-2.5 rounded border font-mono text-xs text-right ${
                                  item.enabled ? themeClasses.input : "bg-slate-950 text-slate-500 border-slate-800"
                                }`}
                              />
                              <span className="text-[10px] text-slate-500 font-mono">/mês</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* SEÇÃO 3: IMPLEMENTAÇÃO */}
                  <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                      <div className="flex items-center gap-2">
                        <Wrench className="h-4 w-4 text-purple-400" />
                        <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                          🔧 Implementação (Setup Inicial)
                        </h4>
                      </div>
                      <span className="text-xs font-mono font-bold text-purple-400">
                        Total Setup: R$ {opReport.setupOneTime.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div className="space-y-2.5 text-xs">
                      {/* Item Setup Único (One-time) */}
                      {operationalParams.items.filter(i => i.category === "setup").map((item) => (
                        <div
                          key={item.id}
                          className={`flex items-center justify-between p-2.5 rounded-lg border transition-all ${
                            item.enabled
                              ? "bg-slate-900 border-slate-700/80"
                              : "bg-slate-950/50 border-slate-800/40 opacity-60"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 flex-1 min-w-0 pr-2">
                            <input
                              type="checkbox"
                              id={`toggle-item-${item.id}`}
                              checked={item.enabled}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setOperationalParams(prev => ({
                                  ...prev,
                                  items: prev.items.map(it => it.id === item.id ? { ...it, enabled: checked } : it)
                                }));
                              }}
                              className="rounded border-slate-700 accent-purple-500 cursor-pointer h-4 w-4 shrink-0"
                            />
                            <div>
                              <label htmlFor={`toggle-item-${item.id}`} className="font-medium text-slate-200 cursor-pointer truncate block">
                                {item.label}
                              </label>
                              <span className="text-[10px] text-slate-400 block">
                                {item.id === "flowbuild"
                                  ? "Construção de fluxos n8n, banco de dados e integrações"
                                  : "Estruturação de funis, pipelines e integrações de vendas"}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-slate-400 text-xs">R$</span>
                            <input
                              type="number"
                              id={`input-item-val-${item.id}`}
                              disabled={!item.enabled}
                              value={item.oneTimeValue || 0}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                setOperationalParams(prev => ({
                                  ...prev,
                                  items: prev.items.map(it => it.id === item.id ? { ...it, oneTimeValue: val } : it)
                                }));
                              }}
                              className={`w-24 h-8 px-2.5 rounded border font-mono text-xs text-right ${
                                item.enabled ? themeClasses.input : "bg-slate-950 text-slate-500 border-slate-800"
                              }`}
                            />
                            <span className="text-[10px] text-amber-400 font-mono font-bold">(setup)</span>
                          </div>
                        </div>
                      ))}

                      {/* Condições globais de pagamento do Setup */}
                      {opReport.setupOneTime > 0 && (
                        <div className="p-3.5 rounded-lg border border-purple-500/30 bg-purple-950/20 space-y-3 mt-1">
                          <div className="flex items-center gap-1 text-xs font-bold text-purple-400 uppercase tracking-wider">
                            <span>💳 Condições de Pagamento (Setup Inicial)</span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                            {/* Entrada (Down Payment) */}
                            <div className="space-y-1">
                              <label className="text-slate-300 font-medium flex justify-between text-[11px]">
                                <span>Porcentagem de Entrada:</span>
                                <span className="font-mono text-purple-300 font-bold">{(operationalParams.setupDownPaymentPercent !== undefined ? operationalParams.setupDownPaymentPercent : 50)}%</span>
                              </label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="range"
                                  min="0"
                                  max="100"
                                  step="10"
                                  value={operationalParams.setupDownPaymentPercent !== undefined ? operationalParams.setupDownPaymentPercent : 50}
                                  onChange={(e) => {
                                    const pct = parseInt(e.target.value) || 0;
                                    setOperationalParams(prev => ({
                                      ...prev,
                                      setupDownPaymentPercent: pct
                                    }));
                                  }}
                                  className="flex-1 accent-purple-500 cursor-pointer h-1 bg-slate-800 rounded-lg appearance-none"
                                />
                              </div>
                            </div>

                            {/* Parcelamento do Resto */}
                            <div className="space-y-1">
                              <label className="text-slate-300 font-medium block text-[11px]">
                                Parcelar o Saldo Restante em:
                              </label>
                              <select
                                id="setup-installments-selector"
                                value={operationalParams.setupInstallments || 1}
                                onChange={(e) => {
                                  const inst = parseInt(e.target.value) || 1;
                                  setOperationalParams(prev => ({
                                    ...prev,
                                    setupInstallments: inst
                                  }));
                                }}
                                className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded px-2.5 py-1.5 focus:outline-none focus:border-purple-500 font-mono"
                              >
                                <option value={1}>À vista (Sem parcelas)</option>
                                {[2, 3, 4, 5, 6, 8, 10, 12].map(n => (
                                  <option key={n} value={n}>{n}x</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          {/* Resumo Dinâmico do Setup */}
                          <div className="pt-2 border-t border-slate-800/80 text-[11px] font-mono flex flex-col gap-1 text-slate-400">
                            <div className="flex justify-between">
                              <span>Total do Setup:</span>
                              <span className="font-bold text-slate-200">R$ {opReport.setupOneTime.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Entrada ({(operationalParams.setupDownPaymentPercent !== undefined ? operationalParams.setupDownPaymentPercent : 50)}%):</span>
                              <span className="font-bold text-amber-400">R$ {opReport.setupDownPaymentValue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Saldo Restante:</span>
                              <span className="text-slate-300">R$ {(opReport.setupOneTime - opReport.setupDownPaymentValue).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                            {opReport.setupInstallments > 1 && (
                              <div className="flex justify-between border-t border-slate-800/50 pt-1 text-purple-300">
                                <span>Valor das Parcelas ({opReport.setupInstallments}x):</span>
                                <span className="font-bold">R$ {opReport.setupInstallmentValue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} /mês</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Detalhamento técnico do Setup em acordeão */}
                      <div className="mt-1 border border-slate-800 rounded-lg overflow-hidden bg-slate-950/30">
                        <button
                          type="button"
                          onClick={() => setShowSetupDetails(!showSetupDetails)}
                          className="w-full flex items-center justify-between p-2.5 text-left text-[11px] font-semibold text-slate-300 hover:bg-slate-800/40 transition-colors"
                        >
                          <span className="flex items-center gap-1.5 text-purple-400">
                            💡 Em que são baseados estes custos de Implementação?
                          </span>
                          <span className="text-xs text-slate-500 font-mono">{showSetupDetails ? "Recolher ▲" : "Ver detalhes ▼"}</span>
                        </button>
                        {showSetupDetails && (
                          <div className="p-3 text-[11px] text-slate-400 border-t border-slate-800 bg-slate-950/50 space-y-2.5 leading-relaxed">
                            <div>
                              <p className="mb-1 text-slate-300 font-semibold text-[11px]">
                                🚧 1. Montagem dos Fluxos (R$ 3.200,00):
                              </p>
                              <p className="text-[10px] text-slate-400">
                                Calculado com base em <strong>40 Horas de Engenharia de Automação e IA</strong> (taxa de R$ 80,00/hora de mercado):
                              </p>
                              <ul className="list-disc pl-4 mt-1 space-y-0.5 text-[10px] text-slate-300">
                                <li><strong>10h - Banco de Dados (Supabase)</strong>: Criação de esquemas de leads, gravação de logs de conversas estruturadas, regras de segurança.</li>
                                <li><strong>12h - N8N Workflows Avançados</strong>: Construção do fluxo de atendimento receptivo, motor de follow-up resiliente, roteamento de transbordo humano e tratamento de erros.</li>
                                <li><strong>10h - Integração da API de WhatsApp (Uazapi)</strong>: Configuração de webhooks em tempo real, disparo ativo de mídias, tratamento de status de envio e sincronia de filas.</li>
                                <li><strong>8h - Engenharia de Prompt e Testes</strong>: Setup de contexto do Gemini, afinação de temperatura, validações de custos reais e margem de segurança.</li>
                              </ul>
                            </div>

                            <div className="pt-2 border-t border-slate-800/80">
                              <p className="mb-1 text-slate-300 font-semibold text-[11px]">
                                🏗️ 2. Criação e Setup do CRM (R$ 1.500,00):
                              </p>
                              <p className="text-[10px] text-slate-400">
                                Estruturação e homologação comercial baseada em <strong>20 Horas de Engenharia e Consultoria de Processos</strong>:
                              </p>
                              <ul className="list-disc pl-4 mt-1 space-y-0.5 text-[10px] text-slate-300">
                                <li><strong>6h - Arquitetura de Pipelines</strong>: Criação de funis de vendas personalizados (Contatos, Qualificação, Apresentação, Fechamento).</li>
                                <li><strong>8h - Integração e Webhooks</strong>: Sincronização automática de dados entre os fluxos do n8n e o CRM, atualizando estágios e inserindo logs em tempo real.</li>
                                <li><strong>6h - Treinamento e Automação de E-mails/Cobrança</strong>: Configuração de regras automatizadas de follow-up pós-venda, templates de e-mails de transbordo e relatórios.</li>
                              </ul>
                            </div>
                            <div className="pt-1.5 border-t border-slate-800 flex items-center gap-1 text-[10px] text-slate-500">
                              <span>✓ Todo o setup é testado e entregue homologado pronto para rodar.</span>
                            </div>
                          </div>
                        )}
                      </div>

                    </div>
                  </div>

                  {/* SEÇÃO 4: REPASSE AO CLIENTE (MARKUP) */}
                  <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-amber-400" />
                        <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                          💰 Repasse & Margem Comercial (Markup)
                        </h4>
                      </div>

                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          id="toggle-client-markup"
                          type="checkbox"
                          checked={operationalParams.clientMarkupEnabled}
                          onChange={(e) => setOperationalParams({ ...operationalParams, clientMarkupEnabled: e.target.checked })}
                          className="rounded border-slate-700 accent-amber-500 cursor-pointer h-4 w-4"
                        />
                        <span className="text-xs text-slate-300 font-semibold">Ativar Markup</span>
                      </label>
                    </div>

                    {operationalParams.clientMarkupEnabled && (
                      <div className="space-y-2 pt-1 text-xs">
                        <div className="flex justify-between text-slate-300 font-semibold">
                          <span>Margem sobre custo total base:</span>
                          <span className="text-amber-400 font-mono font-bold">
                            +{Math.round(operationalParams.clientMarkup * 100)}%
                          </span>
                        </div>
                        <input
                          id="input-client-markup-slider"
                          type="range"
                          min="0"
                          max="1.0"
                          step="0.05"
                          value={operationalParams.clientMarkup}
                          onChange={(e) => setOperationalParams({ ...operationalParams, clientMarkup: parseFloat(e.target.value) })}
                          className="w-full accent-amber-500 cursor-pointer"
                        />
                        <p className="text-[10px] text-slate-400">
                          Aplica +{Math.round(operationalParams.clientMarkup * 100)}% sobre a soma de IA + Infra + Manutenção ativos.
                        </p>
                      </div>
                    )}
                  </div>

                </div>

                {/* COLUNA DIREITA: RESULTADOS TCO MENSAL */}
                <div className="lg:col-span-6 space-y-5">
                  
                  <div className="p-5 rounded-xl bg-slate-950 border border-emerald-500/30 space-y-4 shadow-xl">
                    <div className="flex items-center justify-between border-b pb-3 border-slate-800">
                      <div className="flex items-center gap-2">
                        <Wallet className="h-5 w-5 text-emerald-400" />
                        <h4 className="font-extrabold text-sm uppercase text-slate-100 tracking-wider">
                          Resumo de Custos — TCO
                        </h4>
                      </div>
                      <span className="text-[10px] font-mono uppercase bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20 font-bold">
                        Calculado
                      </span>
                    </div>

                    <div className="space-y-3 text-xs">
                      {/* Linha TOKEN (IA) — Sempre Verde */}
                      <div className="flex items-center justify-between p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-500/30">
                        <span className="text-emerald-300 font-bold flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
                          💬 TOKEN (IA)
                        </span>
                        <span className="font-mono text-emerald-400 font-extrabold">
                          R$ {opReport.aiMonthly.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>

                      {/* Linha Infra */}
                      <div className={`flex items-center justify-between p-2.5 rounded-lg border ${
                        opReport.infrastructureMonthly > 0 ? "bg-slate-900 border-slate-800" : "bg-slate-950/40 border-slate-900 opacity-50"
                      }`}>
                        <span className={`font-medium flex items-center gap-1.5 ${opReport.infrastructureMonthly > 0 ? "text-slate-300" : "text-slate-500"}`}>
                          <span className={`w-2.5 h-2.5 rounded-full inline-block ${opReport.infrastructureMonthly > 0 ? "bg-blue-500" : "bg-slate-600"}`}></span>
                          🖥️ Infraestrutura
                        </span>
                        <span className={`font-mono font-bold ${opReport.infrastructureMonthly > 0 ? "text-blue-400" : "text-slate-500"}`}>
                          R$ {opReport.infrastructureMonthly.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>

                      {/* Linha Manutenção */}
                      <div className={`flex items-center justify-between p-2.5 rounded-lg border ${
                        opReport.laborMonthly > 0 ? "bg-slate-900 border-slate-800" : "bg-slate-950/40 border-slate-900 opacity-50"
                      }`}>
                        <span className={`font-medium flex items-center gap-1.5 ${opReport.laborMonthly > 0 ? "text-slate-300" : "text-slate-500"}`}>
                          <span className={`w-2.5 h-2.5 rounded-full inline-block ${opReport.laborMonthly > 0 ? "bg-purple-500" : "bg-slate-600"}`}></span>
                          🔧 Manutenção e Suporte
                        </span>
                        <span className={`font-mono font-bold ${opReport.laborMonthly > 0 ? "text-purple-400" : "text-slate-500"}`}>
                          R$ {opReport.laborMonthly.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>

                      <div className="border-t border-slate-800 pt-2"></div>

                      {/* Total Base Mensal */}
                      <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900 border border-slate-700/80">
                        <span className="text-slate-200 font-bold text-xs uppercase">
                          = Total Base Mensal
                        </span>
                        <span className="font-mono text-white font-extrabold text-sm">
                          R$ {opReport.totalMonthlyBase.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>

                      {/* Markup */}
                      {operationalParams.clientMarkupEnabled && (
                        <div className="flex items-center justify-between p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                          <span className="text-amber-300 font-medium flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span>
                            ➕ Repasse / Markup ({Math.round(operationalParams.clientMarkup * 100)}%)
                          </span>
                          <span className="font-mono text-amber-400 font-bold">
                            R$ {opReport.clientMarkupAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      )}

                      {/* Card Destaque: Mensal para o cliente */}
                      <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-950/90 to-slate-900 border-2 border-emerald-500/50 space-y-1 text-center shadow-lg">
                        <span className="text-[10px] text-emerald-400 font-extrabold uppercase tracking-widest block">
                          MENSALIDADE RECORRENTE (A PARTIR DO MÊS 2)
                        </span>
                        <strong className="text-2xl font-black text-emerald-300 font-mono block">
                          R$ {opReport.totalMonthlyWithMarkup.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          <span className="text-xs text-slate-400 font-normal"> / mês</span>
                        </strong>
                        <span className="text-[10px] text-slate-400 block mt-1">
                          Composto por IA + Infraestrutura + Manutenção + Markup
                        </span>
                      </div>

                      {/* Card Separado: Primeiro Mês e Fluxo de Caixa */}
                      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
                        <div className="flex justify-between items-center text-xs border-b border-slate-800 pb-2">
                          <span className="text-slate-300 font-bold flex items-center gap-1.5">
                            <span className="text-amber-400 text-sm">🚧</span> Desembolso do Mês 1 (Entrada/Setup)
                          </span>
                          <strong className="text-amber-400 font-mono font-black text-base">
                            R$ {opReport.totalFirstMonth.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </strong>
                        </div>
                        <p className="text-[10px] text-slate-400 leading-relaxed">
                          ⚠️ <strong>Regra Comercial Especial:</strong> No primeiro mês (período de implementação e homologação técnica dos fluxos), a mensalidade recorrente é <strong>totalmente isenta (R$ 0,00)</strong>. O cliente paga apenas a entrada do Setup (ou o valor integral do Setup à vista).
                        </p>

                        {/* Cronograma de desembolso */}
                        <div className="space-y-1.5 pt-1.5">
                          <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider block">
                            Cronograma de Desembolso Estimado:
                          </span>
                          <div className="grid grid-cols-1 gap-1.5 text-[11px] font-mono">
                            {/* Mês 1 */}
                            <div className="flex flex-col p-2.5 rounded bg-slate-950/60 border border-amber-500/20 gap-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-amber-400 font-extrabold text-[12px]">Mês 1 (Setup Inicial):</span>
                                <span className="text-amber-300 font-extrabold text-[12px]">
                                  R$ {opReport.totalFirstMonth.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              </div>
                              <div className="flex flex-col gap-1 text-[10px] text-slate-400 border-t border-slate-800/80 pt-1.5">
                                <div className="flex justify-between">
                                  <span>
                                    {opReport.setupInstallments > 1
                                      ? `↳ Entrada do Setup (${opReport.setupDownPaymentPercent}%):`
                                      : "↳ Setup à Vista / Integral (100%):"
                                    }
                                  </span>
                                  <span className="font-bold text-slate-300">R$ {opReport.totalFirstMonth.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>↳ Assinatura Recorrente:</span>
                                  <span className="text-emerald-400 font-bold">R$ 0,00 (ISENTO)</span>
                                </div>
                              </div>
                            </div>

                            {/* Mês 2 em diante (se parcelado) */}
                            {opReport.setupInstallments > 1 && opReport.setupOneTime > 0 && (
                              <div className="flex flex-col p-2.5 rounded bg-slate-950/40 border border-slate-800/80 gap-1.5">
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-200 font-extrabold text-[12px]">Meses 2 a {opReport.setupInstallments + 1}:</span>
                                  <div className="text-right">
                                    <span className="text-slate-100 font-extrabold text-[12px] block">R$ {(opReport.totalMonthlyWithMarkup + opReport.setupInstallmentValue).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                    <span className="text-[9px] text-slate-500 font-normal">Parcela + Assinatura</span>
                                  </div>
                                </div>
                                <div className="flex flex-col gap-1 text-[10px] text-slate-400 border-t border-slate-800/80 pt-1.5">
                                  <div className="flex justify-between">
                                    <span>↳ Parcela do Setup (saldo parcelado):</span>
                                    <span className="font-bold text-slate-300">R$ {opReport.setupInstallmentValue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>↳ Assinatura Recorrente:</span>
                                    <span className="text-emerald-400 font-bold">R$ {opReport.totalMonthlyWithMarkup.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Mês pós-última parcela */}
                            <div className="flex flex-col p-2.5 rounded bg-slate-950/20 border border-slate-800/40 gap-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-slate-400 font-extrabold text-[12px]">
                                  Mês {opReport.setupInstallments > 1 && opReport.setupOneTime > 0 ? opReport.setupInstallments + 2 : 2} em diante:
                                </span>
                                <span className="text-emerald-400 font-extrabold text-[12px]">R$ {opReport.totalMonthlyWithMarkup.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              </div>
                              <div className="flex flex-col gap-1 text-[10px] text-slate-400 border-t border-slate-800/80 pt-1.5">
                                <div className="flex justify-between">
                                  <span>↳ Parcela Setup:</span>
                                  <span className="font-bold text-slate-500">R$ 0,00 (CONCLUÍDO ✓)</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>↳ Assinatura Recorrente:</span>
                                  <span className="text-emerald-400 font-bold">R$ {opReport.totalMonthlyWithMarkup.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                    </div>

                    {/* Gráfico de Pizza (Recharts PieChart) */}
                    <div className="pt-2 border-t border-slate-800">
                      <h5 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 text-center">
                        Composição do Custo Mensal
                      </h5>
                      <div className="h-56 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <RechartsPieChart>
                            <Pie
                              data={opReport.pieData}
                              dataKey="value"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              outerRadius={65}
                              innerRadius={32}
                              paddingAngle={4}
                            >
                              {opReport.pieData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip
                              formatter={(val: number) => [`R$ ${Number(val).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, "Valor"]}
                              contentStyle={{ backgroundColor: "#020617", borderColor: "#334155", borderRadius: "0.5rem", fontSize: "11px", color: "#f8fafc" }}
                            />
                            <RechartsLegend
                              formatter={(value, entry: any) => (
                                <span className="text-[11px] text-slate-300 font-medium">
                                  {value}: R$ {Number(entry.payload.value).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              )}
                            />
                          </RechartsPieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                  </div>

                </div>

              </div>
            </div>
          </div>
        )}

        {/* ═══════ SEÇÃO: GUIA & FAQ ═══════ */}
        {activeMainTab === "faq" && (
          <div className="space-y-6">
            <div className={`p-6 rounded-xl border ${themeClasses.card} space-y-4`}>
              <div className="flex items-center gap-2 border-b pb-3 border-slate-800/40">
                <HelpCircle className="h-5 w-5 text-emerald-500" />
                <h4 className="font-bold text-lg text-slate-200 uppercase tracking-wider">Perguntas Frequentes & Guia Prático de Custos de IA</h4>
              </div>

              <div className="grid md:grid-cols-2 gap-4 text-xs">
                <div className="p-4 rounded-lg bg-slate-900/80 border border-slate-800 space-y-2">
                  <h5 className="font-bold text-emerald-400 text-sm">Como funciona o Prompt Caching no Gemini?</h5>
                  <p className="text-slate-300 leading-relaxed">
                    Quando o prompt de sistema ultrapassa o tamanho mínimo (geralmente 32k tokens), a API do Gemini armazena o prefixo em memória cache. Nas chamadas seguintes dentro da janela de validade, os tokens de input já em cache recebem um desconto massivo (de até 75% a 90%).
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-slate-900/80 border border-slate-800 space-y-2">
                  <h5 className="font-bold text-emerald-400 text-sm">Por que o Custo do SDR difere do Custo de Follow-up?</h5>
                  <p className="text-slate-300 leading-relaxed">
                    No primeiro contato (SDR), o agente executa a triagem completa e validação inicial de dados (prompt maior, ~37k chars). No acompanhamento (Follow-up), a régua utiliza prompts otimizados (~27k chars) focados em contornar objeções e reengajar o lead inativo.
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-slate-900/80 border border-slate-800 space-y-2">
                  <h5 className="font-bold text-emerald-400 text-sm">O que é a taxa de câmbio USD → BRL?</h5>
                  <p className="text-slate-300 leading-relaxed">
                    Todos os grandes provedores de LLM (Google Gemini, OpenAI GPT, Anthropic Claude) cobram suas APIs em Dólares americanos (USD). Nosso simulador aplica a cotação comercial ajustável para prever o impacto financeiro real na moeda local (BRL).
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-slate-900/80 border border-slate-800 space-y-2">
                  <h5 className="font-bold text-emerald-400 text-sm">Como o n8n executa chamadas fracionadas por mensagem?</h5>
                  <p className="text-slate-300 leading-relaxed">
                    Em automações avançadas no n8n com nós de IA, uma única mensagem recebida pode acionar mais de um nó (ex: 1º nó para classificar a intenção e 2º nó para gerar a resposta final ao cliente). Nosso simulador permite ajustar a quantidade exata de chamadas por mensagem.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* ═══════ FOOTER FIXO ═══════ */}
      <footer className={`border-t py-4 text-center text-[10px] uppercase font-bold tracking-wider transition-colors duration-200 ${themeClasses.footer}`}>
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>Preços de referência — confirme na fonte</p>
          <p className="text-emerald-500/80">CustoIA — Planejamento Financeiro de SDRs Automatizados</p>
        </div>
      </footer>

    </div>
  );
}
