import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, X, Loader2, Bot, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSite } from '@/contexts/SiteContext';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { VERSION } from '@/lib/version';

const BOT_NAME = 'Brix';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
  typing?: boolean;
  revealedWords?: number; // how many words are currently visible
  totalWords?: number;    // total words in the full response
  fullContent?: string;   // full response text for reveal
}

// Extract a clean first name from email
function getFirstName(email?: string | null): string {
  if (!email) return '';
  const raw = email.split('@')[0] || '';
  // Remove numbers and special chars at the end
  const cleaned = raw.replace(/[\d_\-.]+$/g, '');
  // Try to split camelCase or common patterns
  // "juanpablo" → "Juan Pablo" (heuristic: insert space before uppercase)
  const spaced = cleaned.replace(/([a-z])([A-Z])/g, '$1 $2');
  // Take first 2 words max
  const words = spaced.split(/[\s._-]+/).filter(Boolean).slice(0, 2);
  return words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
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

  // Focus input when opened
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 400);
    }
  }, [open]);

  // Prevent body scroll when sheet is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  // Cleanup typing interval on unmount
  useEffect(() => {
    return () => {
      if (typingRef.current) clearInterval(typingRef.current);
    };
  }, []);

  // Word-by-word fade-in reveal
  const fadeReveal = useCallback((msgId: string, fullText: string) => {
    const words = fullText.split(/(?<=\s)/); // split keeping whitespace
    const totalWords = words.length;
    let revealed = 0;
    const wordsPerTick = 2;
    const interval = 30; // ms between reveals

    typingRef.current = window.setInterval(() => {
      revealed += wordsPerTick;
      if (revealed >= totalWords) {
        setMessages(prev => prev.map(m =>
          m.id === msgId ? { ...m, content: fullText, typing: false, revealedWords: totalWords, totalWords } : m
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

    // Build conversation history (last 10 messages, excluding welcome)
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
      const assistantMsgId = (Date.now() + 1).toString();

      // Add message with empty content, then start typewriter
      setMessages(prev => [...prev, {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        createdAt: new Date(),
        typing: true,
      }]);

      setLoading(false);

      // Start fade-in reveal after a tiny delay
      setTimeout(() => fadeReveal(assistantMsgId, fullText), 50);

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

  // Listen for toggle event
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
            height: '70dvh',
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
            <div
              className="rounded-full"
              style={{ width: '36px', height: '4px', background: 'rgba(255,255,255,0.2)' }}
            />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-4 pb-3 pt-1 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{
                  background: 'rgba(139, 92, 246, 0.15)',
                  border: '1.5px solid rgba(139, 92, 246, 0.4)',
                }}
              >
                <Sparkles className="w-4 h-4" style={{ color: '#a78bfa' }} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white">{BOT_NAME}</span>
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded-full"
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    color: 'rgba(255,255,255,0.5)',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  Beta v{VERSION.display}
                </span>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
              style={{ background: 'rgba(255,255,255,0.06)' }}
            >
              <X className="w-4 h-4 text-white/50" />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0" style={{ overscrollBehavior: 'contain' }}>
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex flex-col",
                  msg.role === 'user' ? "items-end" : "items-start"
                )}
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
                    msg.role === 'user' ? "max-w-[80%]" : "max-w-[90%]"
                  )}
                  dangerouslySetInnerHTML={{
                    __html: msg.content
                      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                      .replace(/\n/g, '<br/>')
                  }}
                  style={{
                    borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    background: msg.role === 'user'
                      ? 'rgba(139, 92, 246, 0.2)'
                      : 'rgba(255,255,255,0.04)',
                    border: msg.role === 'user'
                      ? '1px solid rgba(139, 92, 246, 0.3)'
                      : '1px solid rgba(255,255,255,0.06)',
                    color: 'rgba(255,255,255,0.9)',
                    ...(msg.typing ? { animation: 'brix-content-fade 0.3s ease-out' } : {}),
                  }}
                />
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

          {/* Input Area */}
          <div
            className="px-4 py-3 shrink-0"
            style={{
              borderTop: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(18, 18, 24, 0.98)',
            }}
          >
            <div
              className="flex items-end gap-2"
              style={{
                borderRadius: '16px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.1)',
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
                className="flex-1 py-2 text-[14px] outline-none placeholder:text-white/25 resize-none bg-transparent"
                style={{
                  color: 'white',
                  maxHeight: '100px',
                  lineHeight: '1.4',
                }}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || loading || isTyping}
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all disabled:opacity-20"
                style={{
                  background: input.trim() ? 'rgba(139, 92, 246, 0.3)' : 'rgba(255,255,255,0.06)',
                  border: input.trim() ? '1px solid rgba(139, 92, 246, 0.4)' : '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <Send className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
