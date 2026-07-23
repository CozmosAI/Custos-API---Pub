import React from "react";
import { Scale, Cpu, Brain, Zap, HelpCircle } from "lucide-react";

export const AboutView: React.FC = () => {
  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-8">
      {/* Introduction */}
      <div>
        <h3 className="text-xl font-extrabold text-gray-100 flex items-center gap-2">
          <HelpCircle className="h-5 w-5 text-primary" />
          Como funciona a precificação de agentes de IA?
        </h3>
        <p className="text-xs text-gray-400 mt-2 leading-relaxed">
          Muitos construtores de automações e SDRs de vendas por IA no n8n se assustam com a primeira fatura de API. 
          Este simulador foi criado para explicar de forma matemática e didática como o consumo de tokens escala nos cenários de prospecção e vendas B2B.
        </p>
      </div>

      {/* 3 Core Conceptual Cards */}
      <div className="grid md:grid-cols-3 gap-4">
        {/* Card 1: Statelessness */}
        <div className="bg-gray-950 border border-gray-800 rounded-xl p-4 space-y-2">
          <div className="h-9 w-9 bg-primary/10 border border-primary/20 rounded-lg flex items-center justify-center text-primary">
            <Brain className="h-4.5 w-4.5" />
          </div>
          <h4 className="font-bold text-xs text-gray-200 uppercase tracking-wider">A Natureza Stateless</h4>
          <p className="text-[10px] text-gray-500 leading-relaxed">
            Modelos de IA não têm memória persistente nativa. Em um chat n8n, para que a inteligência saiba o que respondeu na mensagem anterior, todo o histórico anterior e as instruções precisam ser retransmitidos do zero a cada interação.
          </p>
        </div>

        {/* Card 2: Prompt Size */}
        <div className="bg-gray-950 border border-gray-800 rounded-xl p-4 space-y-2">
          <div className="h-9 w-9 bg-purple-500/10 border border-purple-500/20 rounded-lg flex items-center justify-center text-purple-400">
            <Cpu className="h-4.5 w-4.5" />
          </div>
          <h4 className="font-bold text-xs text-gray-200 uppercase tracking-wider">Prompt de Sistema Gigante</h4>
          <p className="text-[10px] text-gray-500 leading-relaxed">
            As diretrizes e persona do SDR (regras de objeção, tom de voz, qualificações) geralmente ultrapassam 40.000 caracteres. Esse bloco fixo é faturado no input a cada mensagem do lead, agindo como o maior ralo de dinheiro da operação.
          </p>
        </div>

        {/* Card 3: Token Ratio */}
        <div className="bg-gray-950 border border-gray-800 rounded-xl p-4 space-y-2">
          <div className="h-9 w-9 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center justify-center text-emerald-400">
            <Zap className="h-4.5 w-4.5" />
          </div>
          <h4 className="font-bold text-xs text-gray-200 uppercase tracking-wider">A Razão de Tokens</h4>
          <p className="text-[10px] text-gray-500 leading-relaxed">
            Textos em português consomem em média 35% mais recursos que inglês devido aos caracteres acentuados. Estimar 1 token = 3.5 caracteres evita que você subestime a cobrança real dos provedores em até um terço do valor planejado.
          </p>
        </div>
      </div>

      {/* Detailed Math Explanation */}
      <div className="bg-gray-950 border border-gray-800 rounded-xl p-5 space-y-3">
        <h4 className="font-bold text-xs uppercase tracking-wider text-gray-400">A Fórmula Matemática Aplicada</h4>
        <div className="text-xs text-gray-400 space-y-3 leading-relaxed">
          <p>
            O simulador modela precisamente o crescimento do contexto acumulativo da conversa por lead.
            Para cada mensagem <code className="text-primary font-bold font-mono">i</code> (de 1 até o total acumulado do lead):
          </p>
          <div className="bg-gray-900 border border-gray-800 p-4 rounded-lg font-mono text-[10px] text-gray-300 space-y-2.5">
            <p>
              <strong className="text-gray-400"># Caracteres de Entrada (Input):</strong><br />
              CharsInput = Prompt_Sistema + (i - 1) × (Tamanho_Msg_Lead + Tamanho_Resposta_IA) + Tamanho_Msg_Lead
            </p>
            <p>
              <strong className="text-gray-400"># Caracteres de Saída (Output):</strong><br />
              CharsOutput = Tamanho_Resposta_IA
            </p>
            <p>
              <strong className="text-gray-400"># Conversão e Custos:</strong><br />
              TokensInput = Ceil(CharsInput / Chars_Por_Token)<br />
              TokensOutput = Ceil(CharsOutput / Chars_Por_Token)<br />
              Custo_Msg = (TokensInput × Preço_Input + TokensOutput × Preço_Output) ÷ 1.000.000
            </p>
          </div>
          <p>
            O custo por lead é a soma dos custos de cada mensagem individual na conversa. O custo periódico é simplesmente <code className="text-gray-200">leads × custo_por_lead</code>.
          </p>
        </div>
      </div>

      {/* Strategies to Reduce Costs */}
      <div className="bg-gray-950 border border-gray-800 rounded-xl p-5 space-y-4">
        <h4 className="font-bold text-xs uppercase tracking-wider text-gray-400">Como diminuir seus custos no n8n?</h4>
        <div className="grid sm:grid-cols-2 gap-4 text-xs">
          <div className="space-y-1.5">
            <h5 className="font-bold text-gray-200 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-primary rounded-full" />
              1. Ative o Prompt Caching
            </h5>
            <p className="text-[10px] text-gray-500 leading-relaxed">
              Use modelos e provedores que ofereçam cache inteligente de prompt de sistema (como Claude 3.5 com 90% de desconto ou Gemini 1.5/2.0 com 75% de desconto). Isso faz com que as regras fixas de SDR quase não custem nada a partir da segunda mensagem.
            </p>
          </div>

          <div className="space-y-1.5">
            <h5 className="font-bold text-gray-200 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-primary rounded-full" />
              2. Use Roteadores de Intenção (Router)
            </h5>
            <p className="text-[10px] text-gray-500 leading-relaxed">
              Não processe tudo com GPT-4o. Crie um nó no n8n com um modelo super econômico (ex: GPT-4o-mini ou Gemini Flash-Lite) para fazer triagens e detectar intenção (ex: "Quer agendar" vs "Parar envio"). Envie para o modelo principal apenas quando for qualificar de fato.
            </p>
          </div>

          <div className="space-y-1.5">
            <h5 className="font-bold text-gray-200 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-primary rounded-full" />
              3. Reduza os follow-ups automáticos
            </h5>
            <p className="text-[10px] text-gray-500 leading-relaxed">
              Cada dia de follow-up extra custa exponencialmente mais caro pois a conversa está maior. Diminuir as tentativas de 8 para 4 dias, ou espaçar o tempo de contato economiza mais de 40% do custo final do lead que nunca responde.
            </p>
          </div>

          <div className="space-y-1.5">
            <h5 className="font-bold text-gray-200 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-primary rounded-full" />
              4. Compacte as diretrizes e regras
            </h5>
            <p className="text-[10px] text-gray-500 leading-relaxed">
              Evite prompts redundantes com históricos de chat de exemplo longos fixos. Substitua frases repetitivas por tabelas compactas de mapeamento de intenção e regras curtas em Markdown. Menos caracteres de regras = economia instantânea por lead.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
