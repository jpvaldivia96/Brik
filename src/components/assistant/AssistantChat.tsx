import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, X, Loader2, Bot, Sparkles, Download, BarChart3 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { useSite } from '@/contexts/SiteContext';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { VERSION } from '@/lib/version';

const BOT_NAME = 'Brix';

const CHART_COLORS = ['#8b5cf6', '#06b6d4', '#f59e0b', '#10b981', '#ef4444', '#ec4899', '#6366f1', '#14b8a6'];

interface Attachment {
  type: 'csv' | 'chart';
  // CSV
  filename?: string;
  data?: string;
  // Chart
  chartType?: 'bar' | 'pie' | 'line';
  title?: string;
  labels?: string[];
  datasets?: { label: string; data: number[]; color?: string }[];
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
  typing?: boolean;
  revealedWords?: number;
  totalWords?: number;
  fullContent?: string;
  attachments?: Attachment[];
}

// Extract a clean first name from email
function getFirstName(email?: string | null): string {
  if (!email) return '';
  const raw = email.split('@')[0] || '';
  const cleaned = raw.replace(/[\d_\-.]+$/g, '');
  const spaced = cleaned.replace(/([a-z])([A-Z])/g, '$1 $2');
  const words = spaced.split(/[\s._-]+/).filter(Boolean).slice(0, 2);
  return words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

// CSV download helper
function downloadCsv(filename: string, csvData: string) {
  const blob = new Blob(['\ufeff' + csvData], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Mini chart component for bar charts
function BrixBarChart({ attachment }: { attachment: Attachment }) {
  const data = (attachment.labels || []).map((label, i) => ({
    name: label,
    value: attachment.datasets?.[0]?.data?.[i] || 0,
  }));

  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)', padding: '12px', marginTop: '8px' }}>
      <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '11px', fontWeight: 600, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        <BarChart3 className="w-3 h-3 inline mr-1" style={{ verticalAlign: '-2px' }} />
        {attachment.title}
      </p>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="name" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{ background: 'rgba(18,18,24,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white', fontSize: '12px' }}
            labelStyle={{ color: 'rgba(255,255,255,0.6)' }}
          />
          <Bar dataKey="value" fill={attachment.datasets?.[0]?.color || '#8b5cf6'} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Mini chart component for pie charts
function BrixPieChart({ attachment }: { attachment: Attachment }) {
  const data = (attachment.labels || []).map((label, i) => ({
    name: label,
    value: attachment.datasets?.[0]?.data?.[i] || 0,
  }));

  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)', padding: '12px', marginTop: '8px' }}>
      <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '11px', fontWeight: 600, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {attachment.title}
      </p>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={40}
            outerRadius={70}
            paddingAngle={2}
            dataKey="value"
            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
            labelLine={false}
            style={{ fontSize: '9px', fill: 'rgba(255,255,255,0.6)' }}
          >
            {data.map((_entry, index) => (
              <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ background: 'rgba(18,18,24,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white', fontSize: '12px' }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

// CSV download button
function CsvDownloadButton({ attachment }: { attachment: Attachment }) {
  return (
    <button
      onClick={() => downloadCsv(attachment.filename || 'reporte.csv', attachment.data || '')}
      className="flex items-center gap-2 mt-2 px-3 py-2 rounded-lg transition-all hover:scale-[1.02] active:scale-[0.98]"
      style={{
        background: 'rgba(16, 185, 129, 0.15)',
        border: '1px solid rgba(16, 185, 129, 0.3)',
        color: '#34d399',
        fontSize: '13px',
        fontWeight: 500,
      }}
    >
      <Download className="w-3.5 h-3.5" />
      {attachment.filename || 'Descargar CSV'}
    </button>
  );
}

// Attachment renderer
function AttachmentRenderer({ attachments }: { attachments: Attachment[] }) {
  return (
    <div className="space-y-2 animate-fade-in">
      {attachments.map((att, i) => {
        if (att.type === 'csv') return <CsvDownloadButton key={i} attachment={att} />;
        if (att.type === 'chart' && att.chartType === 'bar') return <BrixBarChart key={i} attachment={att} />;
        if (att.type === 'chart' && att.chartType === 'pie') return <BrixPieChart key={i} attachment={att} />;
        return null;
      })}
    </div>
  );
}

export function AssistantChat() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const { currentSite } = useSite();
  const { user } = useAuth();

  const displayName = user?.user_metadata?.full_name
    || user?.user_metadata?.name
    || getFirstName(user?.email)
    || '';

  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: `Hola ${displayName} 👋\n¿Qué necesitas saber de tu obra hoy?`,
      createdAt: new Date(),
    }
  ]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const typingRef = useRef<number | null>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // Focus input immediately when opened — keyboard ready
  useEffect(() => {
    if (open && inputRef.current) {
      // Use requestAnimationFrame for fastest possible focus
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        // Fallback: some mobile browsers need a second attempt
        setTimeout(() => inputRef.current?.focus(), 100);
      });
    }
  }, [open]);

  // Prevent body scroll
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  // Cleanup
  useEffect(() => {
    return () => { if (typingRef.current) clearInterval(typingRef.current); };
  }, []);

  // Word-by-word fade-in reveal
  const fadeReveal = useCallback((msgId: string, fullText: string, attachments?: Attachment[]) => {
    const words = fullText.split(/(?<=\s)/);
    const totalWords = words.length;
    let revealed = 0;
    const wordsPerTick = 2;
    const interval = 30;

    typingRef.current = window.setInterval(() => {
      revealed += wordsPerTick;
      if (revealed >= totalWords) {
        setMessages(prev => prev.map(m =>
          m.id === msgId ? { ...m, content: fullText, typing: false, revealedWords: totalWords, totalWords, attachments } : m
        ));
        if (typingRef.current) clearInterval(typingRef.current);
        typingRef.current = null;
      } else {
        setMessages(prev => prev.map(m =>
          m.id === msgId ? { ...m, content: words.slice(0, revealed).join(''), revealedWords: revealed, totalWords, fullContent: fullText } : m
        ));
      }
    }, interval);
  }, []);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || !currentSite || !user || loading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: trimmed,
      createdAt: new Date(),
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setLoading(true);

    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }

    const history = updatedMessages
      .filter(m => m.id !== 'welcome')
      .slice(-10)
      .map(m => ({ role: m.role, content: m.content }));

    try {
      const { data, error } = await supabase.functions.invoke('in-app-assistant', {
        body: {
          message: userMessage.content,
          siteId: currentSite.id,
          userId: user.id,
          history,
        }
      });

      if (error) throw error;

      const fullText = data?.text || 'No pude procesar tu solicitud.';
      const attachments: Attachment[] | undefined = data?.attachments;
      const assistantMsgId = (Date.now() + 1).toString();

      setMessages(prev => [...prev, {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        createdAt: new Date(),
        typing: true,
      }]);

      setLoading(false);
      setTimeout(() => fadeReveal(assistantMsgId, fullText, attachments), 50);

    } catch (error) {
      console.error('Error calling assistant:', error);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '❌ Ocurrió un error. Intenta de nuevo.',
        createdAt: new Date(),
      }]);
      setLoading(false);
    }
  };

  // Detect mobile
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Toggle event
  useEffect(() => {
    const handler = () => setOpen(prev => !prev);
    document.addEventListener('toggle-assistant', handler);
    return () => document.removeEventListener('toggle-assistant', handler);
  }, []);

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 100) + 'px';
  };

  if (!open) return null;

  const isTyping = messages.some(m => m.typing);

  // ─── Shared message list ─────────────────────────────────────────
  const renderMessages = () => (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0" style={{ overscrollBehavior: 'contain' }}>
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={cn("flex flex-col", msg.role === 'user' ? "items-end" : "items-start")}
        >
          {msg.role === 'assistant' && (
            <div className="flex items-center gap-1.5 mb-1.5 px-1">
              <Bot className="w-3 h-3" style={{ color: 'rgba(167, 139, 250, 0.6)' }} />
              <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{BOT_NAME}</span>
            </div>
          )}
          <div
            className={cn(
              "px-4 py-3 text-[14px] leading-relaxed whitespace-pre-wrap",
              msg.role === 'user' ? "max-w-[85%]" : "max-w-[92%]"
            )}
            dangerouslySetInnerHTML={{
              __html: msg.content
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\n/g, '<br/>')
            }}
            style={{
              borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
              background: msg.role === 'user' ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255,255,255,0.04)',
              border: msg.role === 'user' ? '1px solid rgba(139, 92, 246, 0.3)' : '1px solid rgba(255,255,255,0.06)',
              color: 'rgba(255,255,255,0.9)',
              ...(msg.typing ? { animation: 'brix-content-fade 0.3s ease-out' } : {}),
            }}
          />
          {!msg.typing && msg.attachments && msg.attachments.length > 0 && (
            <div className="w-full max-w-[92%] mt-1">
              <AttachmentRenderer attachments={msg.attachments} />
            </div>
          )}
          {!msg.typing && (
            <span className="text-[10px] mt-1 px-1" style={{ color: 'rgba(255,255,255,0.2)' }}>
              {msg.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      ))}

      {loading && (
        <div className="flex items-start">
          <div
            className="px-4 py-3 flex items-center gap-2"
            style={{
              borderRadius: '16px 16px 16px 4px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: '#a78bfa' }} />
            <span className="text-[13px]" style={{ color: 'rgba(255,255,255,0.4)' }}>Pensando...</span>
          </div>
        </div>
      )}
    </div>
  );

  // ─── Shared input bar ────────────────────────────────────────────
  const renderInput = () => (
    <div
      className="flex items-end gap-2"
      style={{
        borderRadius: '16px',
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.12)',
        padding: '4px 4px 4px 14px',
      }}
    >
      <textarea
        ref={inputRef}
        value={input}
        onChange={handleInputChange}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
          }
        }}
        placeholder="Pregunta algo..."
        disabled={loading || isTyping}
        rows={1}
        className="flex-1 py-2 outline-none placeholder:text-white/30 resize-none bg-transparent"
        style={{ color: 'white', maxHeight: '100px', lineHeight: '1.4', fontSize: '16px' }}
      />
      <button
        onClick={handleSend}
        disabled={!input.trim() || loading || isTyping}
        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all active:scale-90 disabled:opacity-20"
        style={{
          background: input.trim() ? 'rgba(139, 92, 246, 0.4)' : 'rgba(255,255,255,0.06)',
          border: input.trim() ? '1px solid rgba(139, 92, 246, 0.5)' : '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <Send className="w-4 h-4 text-white" />
      </button>
    </div>
  );

  // ─── Header (shared) ─────────────────────────────────────────────
  const renderHeader = () => (
    <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="flex items-center gap-2.5">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(139, 92, 246, 0.15)', border: '1.5px solid rgba(139, 92, 246, 0.4)' }}
        >
          <Sparkles className="w-4 h-4" style={{ color: '#a78bfa' }} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-white">{BOT_NAME}</span>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full"
            style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            v{VERSION.display}
          </span>
        </div>
      </div>
      <button
        onClick={() => setOpen(false)}
        className="w-9 h-9 rounded-full flex items-center justify-center transition-colors active:scale-95"
        style={{ background: 'rgba(255,255,255,0.08)' }}
      >
        <X className="w-4 h-4 text-white/60" />
      </button>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════
  // MOBILE: Fullscreen takeover (like WHOOP)
  // ═══════════════════════════════════════════════════════════════════
  if (isMobile) {
    return (
      <div
        className="fixed inset-0 z-[60] flex flex-col"
        style={{
          background: 'rgba(12, 12, 18, 1)',
        }}
      >
        {/* Safe area top */}
        <div className="shrink-0" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }} />

        {renderHeader()}
        {renderMessages()}

        {/* Input — safe area bottom */}
        <div
          className="shrink-0 px-3 pt-2"
          style={{
            borderTop: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(12, 12, 18, 1)',
            paddingBottom: 'max(8px, env(safe-area-inset-bottom, 8px))',
          }}
        >
          {renderInput()}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // DESKTOP: Original bottom-sheet (75dvh, backdrop, rounded)
  // ═══════════════════════════════════════════════════════════════════
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[59] animate-in fade-in duration-200"
        style={{ background: 'rgba(0,0,0,0.5)' }}
        onClick={() => setOpen(false)}
      />

      {/* Bottom Sheet */}
      <div className="fixed inset-0 z-[60] pointer-events-none flex items-end justify-center">
        <div
          ref={sheetRef}
          className="pointer-events-auto w-full flex flex-col animate-in slide-in-from-bottom duration-300"
          style={{
            maxWidth: '672px',
            height: '75dvh',
            maxHeight: 'calc(100dvh - 40px)',
            borderRadius: '20px 20px 0 0',
            background: 'rgba(18, 18, 24, 0.95)',
            backdropFilter: 'blur(40px) saturate(1.4)',
            WebkitBackdropFilter: 'blur(40px) saturate(1.4)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderBottom: 'none',
            boxShadow: '0 -8px 40px rgba(0,0,0,0.5)',
          }}
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-2.5 pb-1 shrink-0">
            <div className="rounded-full" style={{ width: '36px', height: '4px', background: 'rgba(255,255,255,0.2)' }} />
          </div>

          {renderHeader()}
          {renderMessages()}

          {/* Input */}
          <div
            className="px-4 py-3 shrink-0"
            style={{ borderTop: '1px solid rgba(255,255,255,0.08)', background: 'rgba(18, 18, 24, 0.98)' }}
          >
            {renderInput()}
          </div>
        </div>
      </div>
    </>
  );
}

