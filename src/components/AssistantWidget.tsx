import { useEffect, useRef, useState } from 'react';
import { Bot, Send, X, Sparkles, Check, Loader2 } from 'lucide-react';
import { useData } from '@/lib/useData';
import { useAuth } from '@/lib/AuthContext';
import {
  getAssistantResponse,
  parseAssistantAction,
  createPurchaseRequestAction,
  updateObjectProgressAction,
  ASSISTANT_SUGGESTIONS,
  type AssistantAction,
  type AssistantMessage,
} from '@/lib/aiAssistant';

const GREETING = 'Здравствуйте! Я ваш ИИ-помощник. Могу отвечать на вопросы по проекту, создавать заявки на закуп и править готовность объектов.';

export default function AssistantWidget() {
  const { data, loading, refresh } = useData();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<AssistantMessage[]>([
    { id: 'greeting', role: 'assistant', text: GREETING },
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setInput('');

    const action = parseAssistantAction(data, trimmed);
    if (action) {
      setMessages((prev) => [
        ...prev,
        { id: `u-${Date.now()}`, role: 'user', text: trimmed },
        { id: `a-${Date.now() + 1}`, role: 'assistant', text: action.confirmText, pendingAction: action },
      ]);
      return;
    }

    const progressMatch = trimmed.match(/(?:готовность|прогресс)\s+(.+?)\s+(-?\d+)\s*%?\s*$/i);
    if (progressMatch) {
      setMessages((prev) => [
        ...prev,
        { id: `u-${Date.now()}`, role: 'user', text: trimmed },
        { id: `a-${Date.now() + 1}`, role: 'assistant', text: 'Обновляю готовность…' },
      ]);
      const result = await updateObjectProgressAction(data, progressMatch[1], parseInt(progressMatch[2], 10));
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = { id: copy[copy.length - 1].id, role: 'assistant', text: result };
        return copy;
      });
      await refresh();
      return;
    }

    setMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, role: 'user', text: trimmed },
      { id: `a-${Date.now() + 1}`, role: 'assistant', text: getAssistantResponse(data, trimmed) },
    ]);
  };

  const confirmAction = async (messageId: string) => {
    const msg = messages.find((m) => m.id === messageId);
    if (!msg?.pendingAction) return;
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, pendingAction: undefined, text: 'Выполняю…' } : m)));
    const result = await createPurchaseRequestAction(msg.pendingAction);
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, text: result } : m)));
    await refresh();
  };

  const cancelAction = (messageId: string) => {
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, pendingAction: undefined, text: 'Действие отменено.' } : m)));
  };

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-500 text-white shadow-xl flex items-center justify-center transition-all hover:scale-105 active:scale-95"
          title="ИИ-помощник"
        >
          <Bot className="w-7 h-7" />
        </button>
      )}

      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-[calc(100vw-3rem)] sm:w-96 max-h-[32rem] h-[28rem] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 bg-slate-900 text-white">
            <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
              <Bot className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold leading-tight">ИИ-помощник</div>
              <div className="text-xs text-slate-400 truncate">
                {user ? `${user.phone} · доступ как у авторизованного пользователя` : 'Работает на данных проекта'}
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-700 transition-colors" title="Закрыть">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-slate-50">
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm whitespace-pre-line leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-blue-600 text-white rounded-br-md'
                      : 'bg-white text-slate-700 border border-slate-200 rounded-bl-md shadow-sm'
                  }`}
                >
                  {m.text}
                  {m.pendingAction && (
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => confirmAction(m.id)}
                        className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-blue-600 text-white text-xs hover:bg-blue-500 transition-colors"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Подтвердить
                      </button>
                      <button
                        onClick={() => cancelAction(m.id)}
                        className="px-3 py-1 rounded-lg border border-slate-200 text-slate-600 text-xs hover:bg-slate-50 transition-colors"
                      >
                        Отмена
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {messages.length === 1 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {ASSISTANT_SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs bg-white border border-slate-200 text-slate-600 hover:border-blue-400 hover:text-blue-600 transition-colors"
                  >
                    <Sparkles className="w-3 h-3" />
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); send(input); }}
            className="flex items-center gap-2 border-t border-slate-200 bg-white px-3 py-2.5"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Спросите или дайте команду…"
              className="flex-1 text-sm rounded-full border border-slate-200 px-4 py-2 focus:outline-none focus:border-blue-400 bg-slate-50"
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center disabled:opacity-40 hover:bg-blue-500 transition-colors"
              title="Отправить"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
