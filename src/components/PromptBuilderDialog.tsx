import React, { useState, useEffect } from "react";
import { X, Sparkles, Hash, AlignLeft, Clipboard, Trash, HelpCircle } from "lucide-react";

interface PromptBuilderDialogProps {
  isOpen: boolean;
  onClose: () => void;
  initialText: string;
  charsPerToken: number;
  onApply: (text: string, count: number) => void;
}

const SAMPLE_PROMPTS = [
  {
    label: "SDR Comercial Inbound",
    text: `Você é uma SDR (Sales Development Representative) sênior de agendamento de reuniões.
SOBRE A EMPRESA:
Vendemos soluções de inteligência de dados comerciais e enriquecimento de leads B2B para times de marketing e CRM.

SEU OBJETIVO:
- Engajar o lead que acabou de baixar um ebook ou se cadastrar no site.
- Qualificar o lead fazendo 3 perguntas essenciais (tamanho do time, dor principal de leads, orçamento atual).
- Agendar uma reunião de 15 minutos com um executivo de contas.

REGRAS DE CONVERSA:
- Use sempre o primeiro nome do lead com entusiasmo moderado.
- Respostas curtas de até 2 parágrafos no WhatsApp.
- Evite linguagem comercial clichê. Seja consultiva e empática.
- Se o lead apresentar objeção sobre preço, ressalte o ROI e ofereça um teste gratuito de 5 leads.`
  },
  {
    label: "SDR Outbound Frio",
    text: `Você é um SDR focado em prospecção outbound de empresas de tecnologia SaaS.
DOR DA PERSONA (Diretores de Vendas):
Falta de pipeline previsível e baixa conversão nas ligações frias dos vendedores deles.

OBJETIVO DA ABORDAGEM:
- Despertar curiosidade oferecendo um mini-diagnóstico ou um insight prático da concorrência.
- Agendar uma breve conversa de 10 minutos.

ESTRUTURA DE RESPOSTA:
- Nunca use jargões de vendas invasivos.
- Faça perguntas desafiadoras (ex: "Quantos por cento das cold calls do seu time hoje geram reunião de fato?").
- Seja curto, incisivo e seguro nas afirmações.`
  }
];

export const PromptBuilderDialog: React.FC<PromptBuilderDialogProps> = ({
  isOpen,
  onClose,
  initialText,
  charsPerToken,
  onApply
}) => {
  const [text, setText] = useState(initialText);

  useEffect(() => {
    if (isOpen) {
      setText(initialText);
    }
  }, [isOpen, initialText]);

  if (!isOpen) return null;

  const charCount = text.length;
  const tokenEstimate = Math.ceil(charCount / charsPerToken);
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  
  const handleApply = () => {
    onApply(text, charCount);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-gray-950 border border-gray-800 rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h3 className="font-bold text-gray-100">Editor e Analisador de Prompt</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-100 rounded-lg p-1 hover:bg-gray-900 transition-all">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {/* Stats Bar */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-gray-900 border border-gray-800 p-3 rounded-lg flex items-center gap-3">
              <Hash className="h-5 w-5 text-primary opacity-80" />
              <div>
                <p className="text-[10px] uppercase font-semibold text-gray-500">Caracteres</p>
                <p className="text-lg font-bold text-gray-200 tabular-nums">{charCount.toLocaleString()}</p>
              </div>
            </div>
            <div className="bg-gray-900 border border-emerald-950/60 p-3 rounded-lg flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-emerald-500 opacity-80" />
              <div>
                <p className="text-[10px] uppercase font-semibold text-gray-500">Tokens Estimados</p>
                <p className="text-lg font-bold text-emerald-400 tabular-nums">{tokenEstimate.toLocaleString()}</p>
              </div>
            </div>
            <div className="bg-gray-900 border border-gray-800 p-3 rounded-lg flex items-center gap-3">
              <AlignLeft className="h-5 w-5 text-purple-500 opacity-80" />
              <div>
                <p className="text-[10px] uppercase font-semibold text-gray-500">Palavras</p>
                <p className="text-lg font-bold text-purple-400 tabular-nums">{wordCount.toLocaleString()}</p>
              </div>
            </div>
          </div>

          {/* Quick Presets */}
          <div>
            <p className="text-xs text-gray-400 font-semibold mb-2">Carregar Exemplo de Prompt de SDR:</p>
            <div className="flex gap-2 flex-wrap">
              {SAMPLE_PROMPTS.map((sample, idx) => (
                <button
                  key={idx}
                  onClick={() => setText(sample.text)}
                  className="bg-gray-900 hover:bg-gray-800 border border-gray-800 text-gray-300 hover:text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
                >
                  {sample.label}
                </button>
              ))}
            </div>
          </div>

          {/* Editor Textarea */}
          <div className="space-y-1.5">
            <label className="text-xs text-gray-400 font-semibold">Instruções do Sistema (System Prompt):</label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Cole aqui as diretrizes e regras do seu SDR que vão junto em todas as requisições..."
              className="w-full h-56 bg-gray-900 border border-gray-800 focus:border-primary text-gray-200 text-xs font-mono p-3 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary leading-relaxed resize-none"
            />
          </div>

          {/* Prompt cost warnings */}
          <div className="bg-amber-950/20 border border-amber-900/50 rounded-lg p-3 text-xs text-amber-400 flex items-start gap-2.5">
            <span className="text-sm">⚠️</span>
            <p className="leading-normal">
              <strong>Atenção:</strong> Como o SDR utiliza histórico acumulado, as instruções do sistema
              serão enviadas em <strong>TODAS</strong> as chamadas de API feitas na conversa. Se o seu prompt de sistema tiver{" "}
              <strong>{charCount.toLocaleString()} caracteres</strong> (~{tokenEstimate.toLocaleString()} tokens), só o custo para enviar
              essas diretrizes representará a maior fatia do valor total do lead.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 bg-gray-900 border-t border-gray-800">
          <button
            onClick={() => setText("")}
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 hover:text-red-400 transition-colors"
          >
            <Trash className="h-3.5 w-3.5" />
            Limpar tudo
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white text-xs font-semibold px-4 py-2 rounded-lg transition-all"
            >
              Cancelar
            </button>
            <button
              onClick={handleApply}
              className="bg-primary hover:bg-primary/95 text-white text-xs font-bold px-4 py-2 rounded-lg shadow-md transition-all"
            >
              Aplicar ao Simulador
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
