import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Send,
  Paperclip,
  Settings,
  MessageSquare,
  Plus,
  User,
  Bot,
  Copy,
  RotateCcw,
  Sparkles,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen
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

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-[56px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-inner shadow-slate-900/5',
        'placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8FAA41]/35',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  );
});
Textarea.displayName = 'Textarea';

function useAutoResizeTextarea({ minHeight, maxHeight }: { minHeight: number; maxHeight?: number }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(
    (reset?: boolean) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      if (reset) {
        textarea.style.height = `${minHeight}px`;
        return;
      }

      textarea.style.height = `${minHeight}px`;
      const nextHeight = Math.max(
        minHeight,
        Math.min(textarea.scrollHeight, maxHeight ?? Number.POSITIVE_INFINITY)
      );
      textarea.style.height = `${nextHeight}px`;
    },
    [minHeight, maxHeight]
  );

  useEffect(() => {
    if (textareaRef.current) textareaRef.current.style.height = `${minHeight}px`;
  }, [minHeight]);

  useEffect(() => {
    const onResize = () => adjustHeight();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [adjustHeight]);

  return { textareaRef, adjustHeight };
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
    // ignore storage quota issues
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

  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [streamingReply, setStreamingReply] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [activeProvider, setActiveProvider] = useState<AIProvider>(() => getAIProvider());

  const [sessions, setSessions] = useState<StoredChatSession[]>(initialSessionsRef.current);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const [clientContext, setClientContext] = useState('');
  const [includeContext, setIncludeContext] = useState(false);
  const [loadingContext, setLoadingContext] = useState(false);

  const mountedRef = useRef(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const activeSessionIdRef = useRef<string | null>(null);
  const prevClientIdRef = useRef<string | null>(selectedClient?.id ?? null);
  const prevClientNameRef = useRef<string | null>(selectedClient?.name ?? null);

  const { textareaRef, adjustHeight } = useAutoResizeTextarea({ minHeight: 56, maxHeight: 200 });

  const currentClientId = selectedClient?.id ?? null;

  const applySessions = useCallback((next: StoredChatSession[], commitState = true) => {
    sessionsRef.current = next;
    writeStoredSessions(next);
    if (commitState) setSessions(next);
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

  const loadSession = useCallback((session: StoredChatSession) => {
    setMessages(session.messages || []);
    messagesRef.current = session.messages || [];
    setActiveSessionId(session.id);
    activeSessionIdRef.current = session.id;
    setClientContext('');
    setIncludeContext(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

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
      persistCurrentSession(messagesRef.current, { clientId: prevClientId, clientName: prevClientName });

      setMessages([]);
      messagesRef.current = [];
      setActiveSessionId(null);
      activeSessionIdRef.current = null;
      setInput('');
      adjustHeight(true);
      setClientContext('');
      setIncludeContext(false);
    }

    prevClientIdRef.current = nextClientId;
    prevClientNameRef.current = nextClientName;
  }, [selectedClient?.id, selectedClient?.name, adjustHeight, persistCurrentSession]);

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

  const streamAssistantMessage = async (baseThread: ChatMessage[], fullReply: string) => {
    const reply = (fullReply || '(No response)').trim() || '(No response)';
    const total = reply.length;

    if (total < 80) {
      const finalThread = [...baseThread, { role: 'assistant', content: reply }];
      setMessages(finalThread);
      persistCurrentSession(finalThread);
      return;
    }

    const chunkSize = Math.max(6, Math.ceil(total / 90));
    let i = 0;

    while (i < total) {
      if (!mountedRef.current) return;
      i = Math.min(i + chunkSize, total);
      const partial = reply.slice(0, i);
      setMessages([...baseThread, { role: 'assistant', content: partial }]);
      await new Promise((r) => setTimeout(r, 18));
    }

    const finalThread = [...baseThread, { role: 'assistant', content: reply }];
    setMessages(finalThread);
    persistCurrentSession(finalThread);
  };

  const handleSend = async (text?: string) => {
    const t = (text ?? input).trim();
    if (!t || sending) return;

    const userMsg: ChatMessage = { role: 'user', content: t };
    const nextThread = [...messagesRef.current, userMsg];

    setInput('');
    adjustHeight(true);
    setMessages(nextThread);
    persistCurrentSession(nextThread);
    setSending(true);

    try {
      const { reply, ragError } = await sendNutritionistChat(nextThread, selectedClient?.id ?? null, {
        extraContext: includeContext && clientContext ? clientContext : undefined
      });

      if (ragError) showToast(`RAG: ${ragError}`, 'warning', 4000);

      setStreamingReply(true);
      await streamAssistantMessage(nextThread, reply || '(No response)');
    } catch (e: any) {
      showToast(e.message || 'Chat failed', 'error');
      const rolledBack = nextThread.slice(0, -1);
      setMessages(rolledBack);
      persistCurrentSession(rolledBack);
      setInput(t);
      requestAnimationFrame(() => adjustHeight());
    } finally {
      setStreamingReply(false);
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
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
    if (!messages.length) return;
    if (!window.confirm('Clear this conversation?')) return;
    persistCurrentSession();
    setMessages([]);
    setInput('');
    setActiveSessionId(null);
    activeSessionIdRef.current = null;
    adjustHeight(true);
    showToast('Conversation cleared', 'success', 2000);
  };

  const startNewChat = () => {
    persistCurrentSession();
    setMessages([]);
    messagesRef.current = [];
    setInput('');
    setActiveSessionId(null);
    activeSessionIdRef.current = null;
    adjustHeight(true);
    setClientContext('');
    setIncludeContext(false);
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
        ? progressRows.map((r) => {
            return [
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
              .join(' ');
          })
        : ['- No progress reports yet.'];

      const noteLines = noteRows.length
        ? noteRows.map((n) => {
            const marker = n.include_in_ai_prompt ? '[included]' : '[note]';
            return `- ${String(n.created_at || '').slice(0, 10)} ${marker} ${String(n.content || '').slice(0, 220)}`;
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
      setIncludeContext(true);
      showToast(`Loaded client context (${progressRows.length} progress reports)`, 'success', 2500);
    } catch (e: any) {
      showToast(e.message || 'Failed to load client context', 'error');
    } finally {
      setLoadingContext(false);
    }
  };

  return (
    <div className="h-[calc(100vh-10rem)] min-h-[640px] w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex h-full text-slate-900">
        <AnimatePresence initial={false}>
          {showSidebar && (
            <motion.aside
              initial={{ x: -280, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -280, opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="flex w-[320px] flex-col border-r border-slate-200 bg-slate-50"
            >
              <div className="border-b border-slate-200 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-lg font-semibold">AI Nutritionist</h2>
                  <Button variant="ghost" size="icon" className="h-9 w-9 text-slate-500">
                    <Settings className="h-4 w-4" />
                  </Button>
                </div>
                <p className="mb-2 text-sm text-slate-600">
                  Coaching assistant — uses indexed nutrition data when relevant. Not medical advice.
                </p>
                <div className="space-y-1 text-xs text-slate-500">
                  <p>
                    <strong>Model:</strong> {chatProviderLabel(activeProvider)}
                  </p>
                  <p className="text-[#8C3A36]">Change in Settings → AI provider</p>
                </div>
              </div>

              <div className="border-b border-slate-200 p-4 space-y-2">
                <p className="text-sm text-slate-700">
                  <strong>{selectedClient?.name || 'No client selected'}</strong>
                  <span className="text-slate-500"> — goal, allergies, and preferences shape retrieval.</span>
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadClientContext}
                  disabled={!selectedClient || loadingContext || sending}
                  className={cn('w-full justify-start', clientContext && 'border-[#8C3A36]/30 bg-[#8C3A36]/5')}
                >
                  {loadingContext ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                  Load full client AI context
                </Button>
                <label className="flex items-center gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={includeContext}
                    onChange={(e) => setIncludeContext(e.target.checked)}
                    disabled={!clientContext}
                    className="h-4 w-4 rounded accent-[#8C3A36]"
                  />
                  Include loaded context
                </label>
              </div>

              <div className="border-b border-slate-200 p-4">
                <Button variant="primary" size="sm" onClick={startNewChat} className="w-full">
                  <Plus className="mr-2 h-4 w-4" />
                  New chat
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                <h3 className="mb-1 text-sm font-semibold text-slate-700">Saved chats</h3>
                <p className="mb-3 text-xs text-slate-500">
                  {selectedClient ? `Showing chats for ${selectedClient.name}` : 'Showing chats without a selected client'}
                </p>
                <div className="space-y-2">
                  {scopedSessions.length === 0 && (
                    <div className="rounded-lg border border-dashed border-slate-300 p-3 text-xs text-slate-500">
                      No saved chats yet.
                    </div>
                  )}
                  {scopedSessions.map((chat) => (
                    <motion.button
                      key={chat.id}
                      whileHover={{ scale: 1.01 }}
                      type="button"
                      onClick={() => loadSession(chat)}
                      className={cn(
                        'w-full rounded-lg border p-3 text-left transition-colors',
                        activeSessionId === chat.id
                          ? 'border-[#8C3A36]/40 bg-[#F9F5F5]'
                          : 'border-slate-200 bg-white hover:border-[#8FAA41]/40 hover:bg-slate-50'
                      )}
                    >
                      <p className="line-clamp-2 text-sm font-medium text-slate-800">{chat.title}</p>
                      <p className="mt-1 text-[11px] text-slate-500">{new Date(chat.updatedAt).toLocaleString()}</p>
                    </motion.button>
                  ))}
                </div>
              </div>

              <div className="border-t border-slate-200 p-4">
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={copyLast}>
                    <Copy className="mr-1 h-3.5 w-3.5" />
                    Copy
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1" onClick={clearChat}>
                    <RotateCcw className="mr-1 h-3.5 w-3.5" />
                    Clear
                  </Button>
                </div>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        <main className="flex min-w-0 flex-1 flex-col bg-white">
          <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
            <Button variant="ghost" size="icon" onClick={() => setShowSidebar((v) => !v)} className="h-9 w-9 text-slate-600">
              {showSidebar ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
            </Button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-semibold sm:text-lg">AI Nutritionist</h1>
              <div className="mt-0.5 flex items-center gap-2">
                <Badge variant="default">{chatProviderLabel(activeProvider)}</Badge>
                {includeContext && clientContext ? (
                  <Badge variant="outline" className="text-[10px]">Client context included</Badge>
                ) : null}
              </div>
            </div>
            <Button variant="ghost" size="icon" className="h-9 w-9 text-slate-500">
              <MessageSquare className="h-4 w-4" />
            </Button>
          </header>

          <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
            {messages.length === 0 ? (
              <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#8C3A36]/10 text-[#8C3A36]">
                  <Bot className="h-8 w-8" />
                </div>
                <h2 className="text-2xl font-semibold">Welcome to AI Nutritionist</h2>
                <p className="mt-2 text-slate-600">
                  Ask anything about nutrition, meal planning, and client coaching.
                </p>
                <div className="mt-6 flex max-w-3xl flex-wrap justify-center gap-2">
                  {SUGGESTED_PROMPTS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => void handleSend(p)}
                      className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700 hover:border-[#8FAA41]/50 hover:bg-white"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mx-auto w-full max-w-3xl space-y-5">
                {messages.map((message, idx) => (
                  <motion.div
                    key={`${message.role}-${idx}`}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn('flex gap-3', message.role === 'user' ? 'justify-end' : 'justify-start')}
                  >
                    {message.role === 'assistant' && (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#8C3A36]/10 text-[#8C3A36]">
                        <Bot className="h-4 w-4" />
                      </div>
                    )}

                    <div
                      className={cn(
                        'max-w-[78%] rounded-2xl px-4 py-3 text-sm shadow-sm',
                        message.role === 'user'
                          ? 'rounded-br-md bg-[#8C3A36] text-white'
                          : 'rounded-bl-md border border-slate-200 bg-slate-50 text-slate-800'
                      )}
                    >
                      {message.role === 'assistant' ? (
                        <div className="prose prose-sm max-w-none break-words prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-code:rounded prose-code:bg-slate-200/70 prose-code:px-1 prose-code:text-xs">
                          <ReactMarkdown>{message.content}</ReactMarkdown>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap break-words leading-relaxed">{message.content}</p>
                      )}
                    </div>

                    {message.role === 'user' && (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-700">
                        <User className="h-4 w-4" />
                      </div>
                    )}
                  </motion.div>
                ))}

                {sending && !streamingReply && (
                  <div className="flex gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-600">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                    <div className="max-w-[78%] space-y-2 rounded-2xl rounded-bl-md border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span>Thinking</span>
                        <span className="inline-flex gap-0.5">
                          <span className="h-1 w-1 animate-bounce rounded-full bg-slate-400 [animation-delay:0ms]" />
                          <span className="h-1 w-1 animate-bounce rounded-full bg-slate-400 [animation-delay:150ms]" />
                          <span className="h-1 w-1 animate-bounce rounded-full bg-slate-400 [animation-delay:300ms]" />
                        </span>
                      </div>
                      <Skeleton className="h-2.5 w-[78%]" />
                      <Skeleton className="h-2.5 w-full" />
                      <Skeleton className="h-2.5 w-[65%]" />
                    </div>
                  </div>
                )}

                <div ref={bottomRef} />
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 bg-white p-4">
            <div className="mx-auto w-full max-w-3xl">
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    adjustHeight();
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about nutrition, meal plans, or dietary guidance..."
                  className="w-full min-h-[56px] resize-none border-none bg-transparent px-4 py-3 focus-visible:ring-0"
                  style={{ overflow: 'hidden' }}
                  disabled={sending}
                />
                <div className="flex items-center justify-between border-t border-slate-200 p-3">
                  <Button variant="ghost" size="icon" className="h-9 w-9 text-slate-500">
                    <Paperclip className="h-4 w-4" />
                  </Button>
                  <Button
                    onClick={() => void handleSend()}
                    disabled={sending || !input.trim()}
                    size="icon"
                    className="h-10 w-10 rounded-full"
                    title="Send"
                  >
                    {sending && !streamingReply ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default AINutritionistChat;
