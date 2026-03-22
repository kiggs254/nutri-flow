import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { MessageCircle, Send, Loader2, Sparkles, Copy, User } from 'lucide-react';
import { sendNutritionistChat, ChatMessage } from '../services/geminiService';
import { Client } from '../types';
import { useToast } from '../utils/toast';

const SUGGESTED_PROMPTS = [
  'How do I explain a sustainable calorie deficit to a hesitant client?',
  'High-protein vegetarian meal ideas for muscle maintenance',
  'What to watch for with metformin and alcohol?',
  'Outline a 3-day low-FODMAP reintroduction check-in script'
];

interface AINutritionistChatProps {
  selectedClient: Client | null;
}

export const AINutritionistChat: React.FC<AINutritionistChatProps> = ({ selectedClient }) => {
  const { showToast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const handleSend = async (text?: string) => {
    const t = (text ?? input).trim();
    if (!t || sending) return;
    setInput('');
    const userMsg: ChatMessage = { role: 'user', content: t };
    const nextThread = [...messages, userMsg];
    setMessages(nextThread);
    setSending(true);
    try {
      const { reply, ragError } = await sendNutritionistChat(nextThread, selectedClient?.id ?? null);
      if (ragError) {
        showToast(`RAG: ${ragError}`, 'warning', 4000);
      }
      setMessages((prev) => [...prev, { role: 'assistant', content: reply || '(No response)' }]);
    } catch (e: any) {
      showToast(e.message || 'Chat failed', 'error');
      setMessages((prev) => prev.slice(0, -1));
      setInput(t);
    } finally {
      setSending(false);
    }
  };

  const copyLast = () => {
    const last = [...messages].reverse().find((m) => m.role === 'assistant');
    if (!last) return;
    navigator.clipboard.writeText(last.content).then(
      () => showToast('Copied', 'success', 2000),
      () => showToast('Copy failed', 'error')
    );
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-500 pb-24 md:pb-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <MessageCircle className="w-8 h-8 text-[#8C3A36]" />
          AI Nutritionist
        </h1>
        <p className="text-slate-600 text-sm mt-1">
          Professional nutrition coaching assistant. Answers use your knowledge base (foods, your docs, and platform training
          material) when relevant. Not medical advice.
        </p>
        {selectedClient && (
          <div className="mt-3 flex items-center gap-2 text-sm bg-[#F9F5F5] border border-stone-200 rounded-lg px-3 py-2 text-[#8C3A36]">
            <User className="w-4 h-4 shrink-0" />
            <span>
              Context: <strong>{selectedClient.name}</strong> — goal, allergies, and preferences are included in retrieval.
            </span>
          </div>
        )}
      </div>

      {messages.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center gap-2 text-[#8FAA41] font-bold text-sm mb-3">
            <Sparkles className="w-4 h-4" />
            Try asking
          </div>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_PROMPTS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => handleSend(p)}
                disabled={sending}
                className="text-left text-sm px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 hover:border-[#8FAA41] hover:bg-white text-slate-700 transition-colors disabled:opacity-50"
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm min-h-[320px] max-h-[55vh] overflow-y-auto p-4 space-y-4">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm ${
                m.role === 'user'
                  ? 'bg-[#8C3A36] text-white rounded-br-md'
                  : 'bg-slate-50 border border-slate-100 text-slate-800 rounded-bl-md'
              }`}
            >
              {m.role === 'assistant' ? (
                <div className="prose prose-sm prose-slate max-w-none prose-p:my-2 prose-ul:my-2 prose-headings:text-slate-900">
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{m.content}</p>
              )}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-slate-50 border border-slate-100 rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-2 text-slate-500 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Thinking…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="fixed bottom-0 left-0 right-0 md:static md:bottom-auto border-t border-slate-200 bg-white/95 backdrop-blur md:border-0 md:bg-transparent p-3 md:p-0 z-20">
        <div className="max-w-3xl mx-auto flex gap-2 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            rows={2}
            placeholder="Ask about protocols, macros, client education…"
            className="flex-1 resize-none border border-slate-300 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-[#8FAA41]/30 focus:border-[#8C3A36] outline-none"
            disabled={sending}
          />
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => handleSend()}
              disabled={sending || !input.trim()}
              className="p-3 rounded-xl bg-[#8C3A36] text-white hover:bg-[#7a2f2b] disabled:opacity-40 shadow-md"
              title="Send"
            >
              {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
            <button
              type="button"
              onClick={copyLast}
              className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hidden md:block"
              title="Copy last reply"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AINutritionistChat;
