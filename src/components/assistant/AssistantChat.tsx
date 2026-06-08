import { useState, useRef, useEffect } from 'react';
import { Bot, Sparkles, Send, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useSite } from '@/contexts/SiteContext';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
}

export function AssistantChat() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: '¡Hola! Soy BRIK AI ✨. Pregúntame sobre quién está adentro, reportes del día o cualquier información de la obra.',
      createdAt: new Date(),
    }
  ]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { currentSite } = useSite();
  const { user } = useAuth();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const handleSend = async () => {
    if (!input.trim() || !currentSite || !user) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      createdAt: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      // Call edge function
      const { data, error } = await supabase.functions.invoke('in-app-assistant', {
        body: {
          message: userMessage.content,
          siteId: currentSite.id,
          userId: user.id,
        }
      });

      if (error) throw error;

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data?.text || 'No pude procesar tu solicitud.',
        createdAt: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error calling assistant:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '❌ Lo siento, ocurrió un error al comunicarme con el servidor.',
        createdAt: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating Action Button */}
      <Button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 w-12 h-12 rounded-full shadow-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 z-40 p-0 overflow-hidden group"
        style={{
          boxShadow: '0 0 20px rgba(79, 70, 229, 0.4)',
        }}
      >
        <div className="absolute inset-0 bg-white/20 group-hover:scale-150 transition-transform duration-500 rounded-full" />
        <Sparkles className="w-5 h-5 text-white relative z-10" />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:w-[400px] p-0 flex flex-col bg-background/95 backdrop-blur-xl border-l border-white/10">
          <SheetHeader className="p-4 border-b border-white/5 flex flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center shadow-inner">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div>
                <SheetTitle className="text-left text-base">BRIK AI</SheetTitle>
                <p className="text-xs text-muted-foreground">Asistente Inteligente</p>
              </div>
            </div>
          </SheetHeader>

          {/* Chat Messages */}
          <ScrollArea className="flex-1 p-4" ref={scrollRef}>
            <div className="space-y-4 pb-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "flex flex-col max-w-[85%] animate-fade-in",
                    msg.role === 'user' ? "ml-auto items-end" : "mr-auto items-start"
                  )}
                >
                  <div
                    className={cn(
                      "px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap shadow-sm",
                      msg.role === 'user' 
                        ? "bg-blue-600 text-white rounded-tr-sm" 
                        : "bg-white/5 text-foreground rounded-tl-sm border border-white/10"
                    )}
                  >
                    {msg.role === 'assistant' ? (
                      <ReactMarkdown className="prose prose-invert prose-sm max-w-none">
                        {msg.content}
                      </ReactMarkdown>
                    ) : (
                      msg.content
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground mt-1 px-1">
                    {msg.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
              
              {loading && (
                <div className="flex items-start max-w-[85%] mr-auto animate-fade-in">
                  <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-white/5 border border-white/10 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                    <span className="text-xs text-muted-foreground">Pensando...</span>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Input Area */}
          <div className="p-4 border-t border-white/5 bg-background/50 backdrop-blur-md">
            <div className="relative flex items-center">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Pregunta algo..."
                className="pr-12 py-6 rounded-xl bg-white/5 border-white/10 focus-visible:ring-blue-500/50"
                disabled={loading}
              />
              <Button
                size="icon"
                onClick={handleSend}
                disabled={!input.trim() || loading}
                className="absolute right-1.5 h-9 w-9 rounded-lg bg-blue-600 hover:bg-blue-500 transition-colors"
              >
                <Send className="w-4 h-4 text-white" />
              </Button>
            </div>
            <p className="text-[10px] text-center text-muted-foreground mt-2 opacity-70">
              La IA puede cometer errores. Verifica la info importante.
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
