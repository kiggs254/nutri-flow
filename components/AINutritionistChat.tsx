import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
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
import { supabase } from '../services/supabase';
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

const CHAT_SESSIONS_KEY = 'nutriflow_ai_chat_sessions_v1';
const MAX_STORED_CHAT_SESSIONS = 50;

interface StoredChatSession {
  id: string;
  title: string;
  clientId: string | null;
  clientName: string | null;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

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

function loadStoredSessions(): StoredChatSession[] {
  try {
    const raw = localStorage.getItem(CHAT_SESSIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s) =>
        s &&
        typeof s.id === 'string' &&
        typeof s.title === 'string' &&
        Array.isArray(s.messages) &&
        typeof s.updatedAt === 'string'
    );
  } catch {
    return [];
  }
}

function writeStoredSessions(sessions: StoredChatSession[]) {
  try {
    localStorage.setItem(CHAT_SESSIONS_KEY, JSON.stringify(sessions));
  } catch {
    // ignore storage quota errors
  }
}

function createChatTitle(messages: ChatMessage[], clientName?: string | null): string {
  const firstUser = messages.find((m) => m.role === 'user')?.content?.trim() || 'New nutrition chat';
  const short = firstUser.length > 68 ? `${firstUser.slice(0, 68)}...` : firstUser;
  return clientName ? `${clientName}: ${short}` : short;
}

export const AINutritionistChat: React.FC<AINutritionistChatProps> = ({ selectedClient }) => {
  const { showToast } = useToast();
  const initialSessionsRef = useRef<StoredChatSession[]>(loadStoredSessions());
  const sessionsRef = useRef<StoredChatSession[]>(initialSessionsRef.current);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [activeProvider, setActiveProvider] = useState<AIProvider>(() => getAIProvider());
  const [sessions, setSessions] = useState<StoredChatSession[]>(initialSessionsRef.current);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [clientContext, setClientContext] = useState('');
  const [includeClientContext, setIncludeClientContext] = useState(false);
  const [loadingContext, setLoadingContext] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const activeSessionIdRef = useRef<string | null>(null);
  const prevClientIdRef = useRef<string | null>(selectedClient?.id ?? null);
  const prevClientNameRef = useRef<string | null>(selectedClient?.name ?? null);

  const currentClientId = selectedClient?.id ?? null;

  const applySessions = useCallback((next: StoredChatSession[], commitState = true) => {
    sessionsRef.current = next;
    writeStoredSessions(next);
    if (commitState) setSessions(next);
  }, []);

  const loadSession = useCallback((session: StoredChatSession) => {
    setMessages(session.messages || []);
    messagesRef.current = session.messages || [];
    setActiveSessionId(session.id);
    activeSessionIdRef.current = session.id;
    setClientContext('');
    setIncludeClientContext(false);
  }, []);

  const persistCurrentSession = useCallback(
    (
      thread: ChatMessage[] = messagesRef.current,
      opts?: { clientId?: string | null; clientName?: string | null; commitState?: boolean }
    ) => {
      if (!thread.length) return null;

      const clientId = opts?.clientId !== undefined ? opts.clientId : prevClientIdRef.current;
      const clientName = opts?.clientName !== undefined ? opts.clientName : prevClientNameRef.current;
      const sessionId =
        activeSessionIdRef.current || `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const existing = sessionsRef.current.find((s) => s.id === sessionId);
      const nowIso = new Date().toISOString();
      const nextSession: StoredChatSession = {
        id: sessionId,
        title: createChatTitle(thread, clientName),
        clientId: clientId ?? null,
        clientName: clientName ?? null,
        messages: thread,
        createdAt: existing?.createdAt || nowIso,
        updatedAt: nowIso
      };
      const merged = [nextSession, ...sessionsRef.current.filter((s) => s.id !== sessionId)]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, MAX_STORED_CHAT_SESSIONS);

      applySessions(merged, opts?.commitState !== false);
      setActiveSessionId(sessionId);
      activeSessionIdRef.current = sessionId;
      return sessionId;
    },
    [applySessions]
  );

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

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  useEffect(() => {
    const nextClientId = selectedClient?.id ?? null;
    const nextClientName = selectedClient?.name ?? null;
    const prevClientId = prevClientIdRef.current;
    const prevClientName = prevClientNameRef.current;

    if (prevClientId !== nextClientId) {
      persistCurrentSession(messagesRef.current, {
        clientId: prevClientId,
        clientName: prevClientName
      });
      const candidate = sessionsRef.current.find((s) => s.clientId === nextClientId);
      if (candidate) {
        loadSession(candidate);
      } else {
        setMessages([]);
        messagesRef.current = [];
        setActiveSessionId(null);
        activeSessionIdRef.current = null;
        setInput('');
      }
      setClientContext('');
      setIncludeClientContext(false);
    }

    prevClientIdRef.current = nextClientId;
    prevClientNameRef.current = nextClientName;
  }, [selectedClient?.id, selectedClient?.name, loadSession, persistCurrentSession]);

  useEffect(() => {
    return () => {
      persistCurrentSession(messagesRef.current, {
        clientId: prevClientIdRef.current,
        clientName: prevClientNameRef.current,
        commitState: false
      });
    };
  }, [persistCurrentSession]);

  const scopedSessions = useMemo(
    () => sessions.filter((s) => s.clientId === currentClientId),
    [sessions, currentClientId]
  );

  const handleSend = async (text?: string) => {
    const t = (text ?? input).trim();
    if (!t || sending) return;
    setInput('');
    const userMsg: ChatMessage = { role: 'user', content: t };
    const nextThread = [...messagesRef.current, userMsg];
    setMessages(nextThread);
    persistCurrentSession(nextThread);
    setSending(true);
    try {
      const { reply, ragError } = await sendNutritionistChat(nextThread, selectedClient?.id ?? null, {
        extraContext: includeClientContext && clientContext ? clientContext : undefined
      });
      if (ragError) {
        showToast(`RAG: ${ragError}`, 'warning', 4000);
      }
      const finalThread = [...nextThread, { role: 'assistant', content: reply || '(No response)' }];
      setMessages(finalThread);
      persistCurrentSession(finalThread);
    } catch (e: any) {
      showToast(e.message || 'Chat failed', 'error');
      const rolledBack = nextThread.slice(0, -1);
      setMessages(rolledBack);
      persistCurrentSession(rolledBack);
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
    persistCurrentSession();
    setMessages([]);
    setInput('');
    setActiveSessionId(null);
    activeSessionIdRef.current = null;
    showToast('Conversation cleared', 'success', 2000);
  };

  const startNewChat = () => {
    persistCurrentSession();
    setMessages([]);
    messagesRef.current = [];
    setInput('');
    setActiveSessionId(null);
    activeSessionIdRef.current = null;
    setClientContext('');
    setIncludeClientContext(false);
  };

  const loadClientContext = async () => {
    if (!selectedClient) {
      showToast('Select a client first', 'warning');
      return;
    }
    setLoadingContext(true);
    try {
      const [progressRes, notesRes] = await Promise.all([
        supabase
          .from('progress_logs')
          .select(
            'date, weight, compliance_score, notes, body_fat_percentage, body_fat_mass, skeletal_muscle_mass, skeletal_muscle_percentage, bmr, metabolic_age, visceral_fat'
          )
          .eq('client_id', selectedClient.id)
          .order('date', { ascending: false }),
        supabase
          .from('client_notes')
          .select('created_at, content, include_in_ai_prompt')
          .eq('client_id', selectedClient.id)
          .order('created_at', { ascending: false })
      ]);

      const progressRows = (progressRes.data || []) as Array<Record<string, unknown>>;
      const noteRows = (notesRes.data || []) as Array<Record<string, unknown>>;
      const profileLines = [
        `Client name: ${selectedClient.name || 'Unknown'}`,
        `Goal: ${selectedClient.goal || 'N/A'}`,
        `Age: ${selectedClient.age ?? 'N/A'}`,
        `Gender: ${selectedClient.gender || 'N/A'}`,
        `Weight: ${selectedClient.weight ?? 'N/A'} kg`,
        `Height: ${selectedClient.height ?? 'N/A'} cm`,
        `Activity level: ${selectedClient.activityLevel || 'N/A'}`,
        `Allergies: ${selectedClient.allergies || 'N/A'}`,
        `Preferences: ${selectedClient.preferences || 'N/A'}`,
        `Medical history: ${selectedClient.medicalHistory || 'N/A'}`,
        `Medications: ${selectedClient.medications || 'N/A'}`,
        `Dietary history: ${selectedClient.dietaryHistory || 'N/A'}`,
        `Social background: ${selectedClient.socialBackground || 'N/A'}`
      ];

      const progressLines = progressRows.length
        ? progressRows.map((r) =>
            [
              `- ${String(r.date || 'unknown date')}:`,
              `weight ${r.weight ?? 'N/A'} kg,`,
              `compliance ${r.compliance_score ?? 'N/A'}%,`,
              `body fat % ${r.body_fat_percentage ?? 'N/A'},`,
              `body fat kg ${r.body_fat_mass ?? 'N/A'},`,
              `muscle kg ${r.skeletal_muscle_mass ?? 'N/A'},`,
              `muscle % ${r.skeletal_muscle_percentage ?? 'N/A'},`,
              `BMR ${r.bmr ?? 'N/A'},`,
              `metabolic age ${r.metabolic_age ?? 'N/A'},`,
              `visceral fat ${r.visceral_fat ?? 'N/A'}.`,
              r.notes ? `Notes: ${String(r.notes).slice(0, 200)}` : ''
            ]
              .filter(Boolean)
              .join(' ')
          )
        : ['- No progress reports yet.'];

      const noteLines = noteRows.length
        ? noteRows.map((n) => {
            const marker = n.include_in_ai_prompt ? '[included]' : '[note]';
            return `- ${String(n.created_at || '').slice(0, 10)} ${marker} ${String(
              n.content || ''
            ).slice(0, 220)}`;
          })
        : ['- No client notes.'];

      const context = [
        'Use this client context when answering nutritionist questions.',
        '',
        'PROFILE',
        ...profileLines,
        '',
        `PROGRESS REPORTS (${progressRows.length})`,
        ...progressLines,
        '',
        `CLIENT NOTES (${noteRows.length})`,
        ...noteLines
      ].join('\n');

      setClientContext(context);
      setIncludeClientContext(true);
      showToast(`Loaded client context (${progressRows.length} progress reports)`, 'success', 2500);
    } catch (e: any) {
      showToast(e.message || 'Failed to load client context', 'error');
    } finally {
      setLoadingContext(false);
    }
  };

  return (
    <div
      className={cn(
        'flex w-full max-w-4xl flex-col mx-auto animate-in fade-in duration-500',
        'pb-3 sm:pb-4'
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
            {selectedClient && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={loadClientContext}
                  disabled={loadingContext || sending}
                >
                  {loadingContext ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Load full client AI context
                </Button>
                <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={includeClientContext}
                    onChange={(e) => setIncludeClientContext(e.target.checked)}
                    className="h-4 w-4 accent-[#8C3A36]"
                    disabled={!clientContext}
                  />
                  Include loaded context
                </label>
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

      {/* Saved chats */}
      <Card className="mb-3 sm:mb-4">
        <CardContent className="pt-4 pb-4 sm:pt-5 sm:pb-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-bold text-slate-800">Saved chats</div>
              <div className="text-xs text-slate-500">
                {selectedClient
                  ? `Showing chats for ${selectedClient.name}`
                  : 'Showing chats without a selected client'}
              </div>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={startNewChat}>
              New chat
            </Button>
          </div>
          {scopedSessions.length === 0 ? (
            <p className="text-xs text-slate-500">No saved chats yet for this client.</p>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
              {scopedSessions.slice(0, 12).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => loadSession(s)}
                  className={cn(
                    'min-h-[44px] shrink-0 rounded-xl border px-3 py-2 text-left transition-colors',
                    activeSessionId === s.id
                      ? 'border-[#8C3A36] bg-[#F9F5F5] text-[#8C3A36]'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-[#8FAA41]/60'
                  )}
                >
                  <div className="max-w-[280px] truncate text-sm font-medium">{s.title}</div>
                  <div className="text-[11px] text-slate-500">
                    {new Date(s.updatedAt).toLocaleString()}
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
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
      <Card className="mb-3 flex min-h-0 flex-1 flex-col overflow-hidden shadow-md sm:mb-4">
        <CardContent className="flex min-h-0 flex-1 flex-col p-0">
          <div
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

      {/* Composer — sticky dock, always visible while scrolling */}
      <div className="sticky bottom-2 z-30 sm:bottom-3">
        <Card className="border-slate-200/90 bg-white/95 shadow-lg shadow-slate-900/10 backdrop-blur supports-[backdrop-filter]:bg-white/85">
          <CardContent className="p-2 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] sm:p-3">
            <div className="flex items-end gap-2">
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
                placeholder="Ask about protocols, macros, client education..."
                className={cn(
                  'min-h-[50px] max-h-36 flex-1 resize-none rounded-xl border border-slate-200 bg-white px-3 py-3 text-[15px] sm:text-sm',
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
                className="h-[50px] w-[50px] shrink-0 shadow-md"
                title="Send"
                aria-label="Send message"
              >
                {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AINutritionistChat;
