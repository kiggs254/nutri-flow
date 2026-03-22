import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  MessageCircle,
  Send,
  Loader2,
  Sparkles,
  Copy,
  User,
  Bot,
  RotateCcw
} from 'lucide-react';
import {
  sendNutritionistChat,
  ChatMessage,
  getAIProvider,
  AI_PROVIDER_CHANGED_EVENT,
  type AIProvider
} from '../services/geminiService';
import { Client } from '../types';
import { useToast } from '../utils/toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Skeleton } from './ui/skeleton';
import { cn } from './ui/cn';

const SUGGESTED_PROMPTS = [
  'How do I explain a sustainable calorie deficit to a hesitant client?',
  'High-protein vegetarian meal ideas for muscle maintenance',
  'What to watch for with metformin and alcohol?',
  'Outline a 3-day low-FODMAP reintroduction check-in script'
];

interface AINutritionistChatProps {
  selectedClient: Client | null;
}

function chatProviderLabel(p: AIProvider): string {
  switch (p) {
    case 'openai':
      return 'OpenAI (GPT-4o)';
    case 'deepseek':
      return 'DeepSeek';
    default:
      return 'Google Gemini';
  }
}

export const AINutritionistChat: React.FC<AINutritionistChatProps> = ({ selectedClient }) => {
  const { showToast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [activeProvider, setActiveProvider] = useState<AIProvider>(() => getAIProvider());
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sync = () => setActiveProvider(getAIProvider());
    sync();
    window.addEventListener('storage', sync);
    window.addEventListener(AI_PROVIDER_CHANGED_EVENT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(AI_PROVIDER_CHANGED_EVENT, sync);
    };
  }, []);

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

  const clearChat = () => {
    if (messages.length === 0) return;
    if (!window.confirm('Clear this conversation?')) return;
    setMessages([]);
    setInput('');
    showToast('Conversation cleared', 'success', 2000);
  };

  return (
    <div
      className={cn(
        'flex w-full max-w-4xl flex-col mx-auto animate-in fade-in duration-500',
        /* Space for fixed composer on mobile + safe area */
        'pb-[calc(5.75rem+env(safe-area-inset-bottom,0px))] md:pb-2'
      )}
    >
      {/* Header */}
      <Card className="mb-3 overflow-hidden sm:mb-4">
        <CardHeader className="gap-3 bg-gradient-to-br from-[#F9F5F5] to-white sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#8C3A36]/10 text-[#8C3A36]">
                <MessageCircle className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base sm:text-xl">AI Nutritionist</CardTitle>
                <CardDescription className="mt-0.5 text-xs sm:text-sm">
                  Coaching assistant — uses indexed nutrition data when relevant. Not medical advice.
                </CardDescription>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Badge variant="default">Model: {chatProviderLabel(activeProvider)}</Badge>
              <span className="text-[11px] text-slate-500 sm:text-xs">Change in Settings → AI provider</span>
            </div>
            {selectedClient && (
              <div className="flex items-start gap-2 rounded-xl border border-stone-200 bg-white/80 px-3 py-2.5 text-sm text-[#8C3A36]">
                <User className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="min-w-0 leading-snug">
                  <span className="font-semibold">{selectedClient.name}</span>
                  <span className="text-slate-600"> — goal, allergies, and preferences shape retrieval.</span>
                </span>
              </div>
            )}
          </div>
          <div className="flex shrink-0 gap-2 self-start sm:flex-col sm:items-stretch">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={copyLast}
              disabled={!messages.some((m) => m.role === 'assistant')}
              className="min-h-[44px] flex-1 sm:flex-none"
              aria-label="Copy last reply"
            >
              <Copy className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Copy</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearChat}
              disabled={messages.length === 0}
              className="min-h-[44px] flex-1 text-slate-600 sm:flex-none"
              aria-label="Clear conversation"
            >
              <RotateCcw className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Clear</span>
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Suggested prompts — horizontal scroll on narrow screens */}
      {messages.length === 0 && (
        <Card className="mb-3 sm:mb-4">
          <CardContent className="pt-4 pb-4 sm:pt-5 sm:pb-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-bold text-[#8FAA41]">
              <Sparkles className="h-4 w-4 shrink-0" />
              Try asking
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch] sm:flex-wrap sm:overflow-visible">
              {SUGGESTED_PROMPTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => handleSend(p)}
                  disabled={sending}
                  className={cn(
                    'min-h-[44px] shrink-0 snap-start rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-left text-sm text-slate-700',
                    'transition-colors hover:border-[#8FAA41]/60 hover:bg-white active:bg-slate-100',
                    'disabled:opacity-50 sm:max-w-none sm:shrink',
                    'max-w-[min(100vw-4rem,320px)] sm:max-w-md'
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Messages */}
      <Card className="mb-0 flex min-h-0 flex-1 flex-col overflow-hidden shadow-md">
        <CardContent className="flex min-h-0 flex-1 flex-col p-0">
          <div
            ref={scrollRef}
            className={cn(
              'min-h-[min(42dvh,280px)] max-h-[min(58dvh,420px)] flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:min-h-[320px] sm:max-h-[min(62dvh,520px)] sm:px-5 sm:py-5'
            )}
          >
            {messages.length === 0 && !sending && (
              <div className="flex h-full min-h-[180px] flex-col items-center justify-center gap-2 px-4 text-center text-slate-500">
                <Bot className="h-10 w-10 text-slate-300" />
                <p className="max-w-sm text-sm">Start a message below or tap a suggestion above.</p>
              </div>
            )}
            <div className="space-y-4">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={cn('flex gap-2 sm:gap-3', m.role === 'user' ? 'flex-row-reverse' : 'flex-row')}
                >
                  <div
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full sm:h-9 sm:w-9',
                      m.role === 'user' ? 'bg-[#8C3A36] text-white' : 'bg-slate-200 text-slate-600'
                    )}
                    aria-hidden
                  >
                    {m.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                  </div>
                  <div
                    className={cn(
                      'min-w-0 max-w-[min(100%,calc(100vw-5.5rem))] rounded-2xl px-3.5 py-2.5 text-sm sm:max-w-[85%] sm:px-4 sm:py-3',
                      m.role === 'user'
                        ? 'bg-[#8C3A36] text-white shadow-sm rounded-br-md'
                        : 'border border-slate-100 bg-slate-50/90 text-slate-800 shadow-sm rounded-bl-md'
                    )}
                  >
                    {m.role === 'assistant' ? (
                      <div
                        className={cn(
                          'prose prose-sm max-w-none break-words text-slate-800',
                          'prose-p:my-2 prose-ul:my-2 prose-ol:my-2',
                          'prose-headings:mt-3 prose-headings:mb-1 prose-headings:text-slate-900',
                          'prose-a:text-[#8C3A36] prose-strong:text-slate-900',
                          'prose-code:rounded prose-code:bg-slate-200/60 prose-code:px-1 prose-code:text-xs'
                        )}
                      >
                        <ReactMarkdown>{m.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap break-words leading-relaxed">{m.content}</p>
                    )}
                  </div>
                </div>
              ))}
              {sending && (
                <div className="flex gap-2 sm:gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-600 sm:h-9 sm:w-9">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                  <div className="min-w-0 max-w-[85%] space-y-2 rounded-2xl rounded-bl-md border border-slate-100 bg-slate-50 px-4 py-3">
                    <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                      <span>Thinking</span>
                      <span className="inline-flex gap-0.5">
                        <span className="h-1 w-1 animate-bounce rounded-full bg-slate-400 [animation-delay:0ms]" />
                        <span className="h-1 w-1 animate-bounce rounded-full bg-slate-400 [animation-delay:150ms]" />
                        <span className="h-1 w-1 animate-bounce rounded-full bg-slate-400 [animation-delay:300ms]" />
                      </span>
                    </div>
                    <div className="space-y-2">
                      <Skeleton className="h-2.5 w-[78%]" />
                      <Skeleton className="h-2.5 w-full" />
                      <Skeleton className="h-2.5 w-[65%]" />
                    </div>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Composer — fixed on mobile with safe area */}
      <div
        className={cn(
          'fixed bottom-0 left-0 right-0 z-20 border-t border-slate-200/90 bg-white/95 backdrop-blur-md',
          'md:relative md:z-auto md:mt-4 md:border-0 md:bg-transparent md:backdrop-blur-none'
        )}
      >
        <div
          className={cn(
            'mx-auto flex max-w-4xl gap-2 px-3 pt-2',
            'pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] md:px-0 md:pb-0 md:pt-0'
          )}
        >
          <label className="sr-only" htmlFor="ai-nutritionist-input">
            Message to AI Nutritionist
          </label>
          <textarea
            id="ai-nutritionist-input"
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
            className={cn(
              'min-h-[48px] flex-1 resize-none rounded-xl border border-slate-200 bg-white px-3 py-3 text-base sm:text-sm',
              'shadow-inner shadow-slate-900/5 placeholder:text-slate-400',
              'focus:border-[#8C3A36] focus:outline-none focus:ring-2 focus:ring-[#8FAA41]/25'
            )}
            disabled={sending}
          />
          <Button
            type="button"
            variant="primary"
            size="icon"
            onClick={() => handleSend()}
            disabled={sending || !input.trim()}
            className="shrink-0 self-end shadow-md"
            title="Send"
            aria-label="Send message"
          >
            {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AINutritionistChat;
