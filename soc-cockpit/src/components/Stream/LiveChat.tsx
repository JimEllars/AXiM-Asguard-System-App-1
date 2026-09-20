import React, { useState, useEffect, useRef } from 'react';

export interface ChatMetadata {
  badges?: string[];
  role?: string;
  reputation?: number;
}

export interface UserMessage {
  id: number;
  user: string;
  text: string;
  time: string;
  isSystem?: false;
  metadata?: ChatMetadata;
}

export interface SystemAlert {
  id: number;
  text: string;
  time: string;
  isSystem: true;
  user?: string;
  metadata?: ChatMetadata;
}

export type ChatMessage = UserMessage | SystemAlert;

interface LiveChatProps {
  isAuthenticated?: boolean;
}

export default function LiveChat({ isAuthenticated = false }: LiveChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 1, user: 'System', text: 'Chat active. Awaiting broadcast.', time: new Date().toISOString().substring(11, 16) + ' UTC', isSystem: true },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [latency, setLatency] = useState<number | null>(null);
  const [hasError, setHasError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeStreamContent = useRef<string>('');

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const handleOnline = () => {
      setIsReconnecting(false);
      setMessages(prev => [...prev, { id: Date.now(), text: 'Connection restored.', time: new Date().toISOString().substring(11,16) + ' UTC', isSystem: true }]);
    };
    const handleOffline = () => {
      setIsReconnecting(true);
      setMessages(prev => [...prev, { id: Date.now(), text: 'Connection lost. Reconnecting...', time: new Date().toISOString().substring(11,16) + ' UTC', isSystem: true }]);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const sanitizeInput = (str: string) => {
    return str.replace(/[<>]/g, (match) => {
      return match === '<' ? '&lt;' : '&gt;';
    });
  };

  const handleSendToAI = async (text: string) => {
    setIsGenerating(true);
    setHasError(null);
    setLatency(null);
    activeStreamContent.current = '';

    const newAiMessageId = Date.now() + 1;

    setMessages(prev => [
      ...prev,
      {
        id: newAiMessageId,
        user: 'DeepSeek',
        text: '',
        time: new Date().toISOString().substring(11, 16) + ' UTC',
        isSystem: false
      }
    ]);

    const apiMessages = messages
      .filter(m => !m.isSystem)
      .map(m => ({
        role: m.user === 'You' ? 'user' : 'assistant',
        content: m.text
      })) as { role: 'user' | 'assistant', content: string }[];

    apiMessages.push({ role: 'user', content: text });

    const startTime = Date.now();
    setIsThinking(false);
    setIsThinking(false);
    setIsThinking(false);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages: apiMessages })
      });

            if (!response.ok) {
        if (response.status === 401) {
          setHasError('Session Expired');
          throw new Error('Session expired. Please re-authenticate.');
        }
        if (response.status === 503) {
          setHasError('Config Required');
          throw new Error('AI service offline: DEEPSEEK_API_KEY not configured');
        }
        setHasError('Error');
        throw new Error(`Error: ${response.statusText}`);
      }
      if (response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) {
            setLatency(Date.now() - startTime);
            setIsThinking(false);
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Preserve incomplete trailing chunk

          for (const line of lines) {
            if (line.startsWith('data: ') && line !== 'data: [DONE]') {
              try {
                const data = JSON.parse(line.slice(6));

                if (data.choices[0]?.delta?.reasoning_content) {
                  setIsThinking(true);
                } else if (data.choices[0]?.delta?.content) {
                  setIsThinking(false);
                }

                const content = data.choices[0]?.delta?.content || '';
                if (content) {
                  activeStreamContent.current += content;
                  setMessages(prev => prev.map(m =>
                    m.id === newAiMessageId ? { ...m, text: activeStreamContent.current } : m
                  ));
                }
              } catch (e) {
                // Ignore parse errors on incomplete chunks
              }
            }
          }
        }
      }
    } catch (err: any) {
      setMessages(prev => prev.map(m =>
        m.id === newAiMessageId ? { ...m, text: `[Error: ${err.message}]` } : m
      ));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputValue.trim() || !isAuthenticated || isGenerating) return;

    const sanitizedText = sanitizeInput(inputValue.trim());

    setMessages(prev => [...prev, {
      id: Date.now(),
      user: 'You',
      text: sanitizedText,
      time: new Date().toISOString().substring(11, 16) + ' UTC',
      isSystem: false
    }]);
    setInputValue('');

    handleSendToAI(sanitizedText);
  };

  const handleTestPing = () => {
    if (!isAuthenticated || isGenerating) return;
    const prompt = "Ping: Verify DeepSeek link connectivity and report system threat status.";
    setMessages(prev => [...prev, {
      id: Date.now(),
      user: 'You',
      text: prompt,
      time: new Date().toISOString().substring(11, 16) + ' UTC',
      isSystem: false
    }]);
    handleSendToAI(prompt);
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
      {/* Chat Header */}
      <div className="bg-slate-900 border-b border-slate-800 p-4 flex items-center justify-between">
        <h3 className="font-semibold text-slate-200 flex items-center gap-2">
          <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z"></path></svg>
          Ecosystem Comms
        </h3>

        <div className="flex items-center gap-3">
          <button
            onClick={handleTestPing}
            disabled={!isAuthenticated || isGenerating}
            className="text-xs bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-blue-400 px-2 py-1 rounded border border-slate-700 transition-colors"
          >
            Test Ping
          </button>

          <div className="flex items-center gap-2 text-xs font-mono">
            {isReconnecting ? (
              <span className="text-amber-500 animate-pulse">Reconnecting...</span>
                        ) : hasError === 'Session Expired' ? (
               <span className="text-rose-500 border border-rose-500/50 bg-rose-950/30 px-2 py-0.5 rounded">Session Expired</span>
                        ) : hasError === 'Session Expired' ? (
               <span className="text-rose-500 border border-rose-500/50 bg-rose-950/30 px-2 py-0.5 rounded">Session Expired</span>
                        ) : hasError === 'Session Expired' ? (
               <span className="text-rose-500 border border-rose-500/50 bg-rose-950/30 px-2 py-0.5 rounded">Session Expired</span>
            ) : hasError === 'Config Required' ? (
               <span className="text-amber-400 border border-amber-400/50 bg-amber-950/30 px-2 py-0.5 rounded">Config Required</span>
            ) : hasError ? (
               <span className="text-rose-500 border border-rose-500/50 bg-rose-950/30 px-2 py-0.5 rounded">Error</span>
            ) : (
              <>
                <span className="relative flex h-2 w-2">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isGenerating ? 'bg-blue-400' : 'bg-emerald-400'}`}></span>
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${isGenerating ? 'bg-blue-500' : 'bg-emerald-500'}`}></span>
                </span>
                <span className={isThinking ? "text-purple-400" : isGenerating ? "text-blue-400" : "text-emerald-400"}>
                  {isThinking ? "DeepSeek Reasoning..." : isThinking ? "DeepSeek Reasoning..." : isThinking ? "DeepSeek Reasoning..." : isGenerating ? "DeepSeek Computing..." : "DeepSeek Online"}
                </span>
              </>
            )}
          </div>

          {latency !== null && !isGenerating && (
             <div className="text-[10px] text-slate-500 font-mono hidden sm:block">
               {latency}ms
             </div>
          )}
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {messages.map((msg) => (
          <div key={msg.id} className="text-sm">
            {msg.isSystem ? (
              <div className="text-center font-mono text-xs text-slate-500 my-2">
                --- {msg.text} ---
              </div>
            ) : (
              <div>
                <span className="text-xs text-slate-500 mr-2">{msg.time}</span>
                <span className={`font-semibold mr-2 ${msg.user === 'DeepSeek' ? 'text-indigo-400' : 'text-blue-400'}`}>
                  {msg.user}:
                </span>
                <span className="text-slate-300 whitespace-pre-wrap leading-relaxed">{msg.text}</span>
              </div>
            )}
          </div>
        ))}
                {hasError === 'Session Expired' && (
           <div className="text-center bg-rose-950/20 border border-rose-900/50 p-2 rounded text-xs text-rose-500 my-2">
             ⚠️ Session expired. Please re-authenticate.
           </div>
        )}
        {hasError === 'Session Expired' && (
           <div className="text-center bg-rose-950/20 border border-rose-900/50 p-2 rounded text-xs text-rose-500 my-2">
             ⚠️ Session expired. Please re-authenticate.
           </div>
        )}
        {hasError === 'Session Expired' && (
           <div className="text-center bg-rose-950/20 border border-rose-900/50 p-2 rounded text-xs text-rose-500 my-2">
             ⚠️ Session expired. Please re-authenticate.
           </div>
        )}
        {hasError === 'Config Required' && (
           <div className="text-center bg-amber-950/20 border border-amber-900/50 p-2 rounded text-xs text-amber-500 my-2">
             ⚠️ AI service offline: DEEPSEEK_API_KEY not configured
           </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-slate-900 border-t border-slate-800">
        {isAuthenticated ? (
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Send message to ecosystem..."
              disabled={isGenerating}
              className="flex-1 bg-slate-950 border border-slate-700 rounded text-slate-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!inputValue.trim() || isGenerating}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-800 disabled:text-slate-500 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
            >
              Send
            </button>
          </form>
        ) : (
          <div className="flex flex-col items-center justify-center p-3 border border-slate-800 border-dashed rounded bg-slate-950/50">
            <p className="text-sm text-slate-400 mb-2">You must be logged in to chat.</p>
            <button className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-1.5 rounded transition-colors border border-slate-700">
              Access Terminal
            </button>
          </div>
        )}
      </div>

    </div>
  );
}
