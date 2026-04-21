/**
 * AIAssistant.tsx
 * Google Gemini 2.5 Pro powered AI Operations Advisor for JNPA ICCC.
 * Renders structured response cards with impact analysis, recommendations, and severity.
 * Maintains rolling 8-message conversation window.
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import { useSimulationStore, AIMessage } from '@/store/useSimulationStore';
import { Bot, Send, Loader as Loader2, TriangleAlert as AlertTriangle, SquareCheck as CheckSquare, Square, ChartBar as BarChart3, Zap, ChevronDown, MessageSquare } from 'lucide-react';

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: 'text-red-400 bg-red-950/40 border-red-700/50',
  HIGH: 'text-red-300 bg-red-900/30 border-red-700/40',
  MEDIUM: 'text-amber-300 bg-amber-900/30 border-amber-700/40',
  LOW: 'text-blue-300 bg-blue-900/30 border-blue-700/40',
};

const SUGGESTED_QUERIES = [
  'What happens if Gate 3 stays closed for 6 hours?',
  'Analyze current vessel bunching risk',
  'How can I reduce carbon emissions index?',
  'What is the impact on DPD if truck volume increases 30%?',
  'Recommend actions for pre-berthing detention above threshold',
];

function AIResponseCard({ msg }: { msg: AIMessage }) {
  const p = msg.parsed;
  const [checkedRecs, setCheckedRecs] = useState<Set<number>>(new Set());

  if (!p) {
    return (
      <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3 mb-3">
        <p className="text-xs text-slate-300 leading-relaxed">{msg.content}</p>
      </div>
    );
  }

  const severityStyle = SEVERITY_COLORS[p.severity] || SEVERITY_COLORS.LOW;

  return (
    <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl overflow-hidden mb-3">
      {/* Header bar */}
      <div className={`flex items-center justify-between px-3 py-2 border-b border-slate-700/50 ${
        p.severity === 'HIGH' || p.severity === 'CRITICAL' ? 'bg-red-950/30' : 'bg-slate-800/80'
      }`}>
        <div className="flex items-center gap-2">
          <Bot className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-xs text-slate-400 font-medium">AI Advisor Response</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] px-2 py-0.5 rounded border font-semibold ${severityStyle}`}>
            {p.severity}
          </span>
          <span className="text-[10px] text-slate-500">
            {(p.confidence * 100).toFixed(0)}% confidence
          </span>
        </div>
      </div>

      {/* Summary */}
      <div className="px-3 py-2.5 border-b border-slate-700/40">
        <p className="text-xs text-slate-200 leading-relaxed">{p.summary}</p>
      </div>

      {/* Impact grid */}
      <div className="px-3 py-2.5 border-b border-slate-700/40">
        <div className="flex items-center gap-1.5 mb-2">
          <BarChart3 className="w-3 h-3 text-cyan-400" />
          <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Operational Impact</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {[
            { label: 'TAT Delta', value: p.impact.tat_delta },
            { label: 'Congestion', value: p.impact.congestion_change },
            { label: 'Carbon Delta', value: p.impact.carbon_delta },
            { label: 'Affected Vessels', value: String(p.impact.affected_vessels) },
          ].map(({ label, value }) => (
            <div key={label} className="bg-slate-900/60 rounded-lg px-2 py-1.5">
              <p className="text-[10px] text-slate-500 mb-0.5">{label}</p>
              <p className="text-xs text-slate-300 font-medium leading-snug">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Recommendations */}
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-1.5 mb-2">
          <Zap className="w-3 h-3 text-amber-400" />
          <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Recommended Actions</span>
        </div>
        <div className="space-y-1.5">
          {p.recommendations.map((rec, i) => (
            <button
              key={i}
              onClick={() => setCheckedRecs(s => {
                const n = new Set(s);
                n.has(i) ? n.delete(i) : n.add(i);
                return n;
              })}
              className="flex items-start gap-2 w-full text-left group"
            >
              {checkedRecs.has(i)
                ? <CheckSquare className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                : <Square className="w-3.5 h-3.5 text-slate-600 shrink-0 mt-0.5 group-hover:text-slate-400" />
              }
              <span className={`text-xs leading-snug transition-colors ${
                checkedRecs.has(i) ? 'text-emerald-400 line-through opacity-60' : 'text-slate-300 group-hover:text-slate-200'
              }`}>
                {rec}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function UserMessage({ msg }: { msg: AIMessage }) {
  return (
    <div className="flex justify-end mb-3">
      <div className="max-w-[85%] bg-cyan-950/50 border border-cyan-800/40 rounded-xl px-3 py-2">
        <p className="text-xs text-cyan-200">{msg.content}</p>
      </div>
    </div>
  );
}

export function AIAssistant() {
  const { chatMessages, addChatMessage, userRole, vessels, gates, trucks, kpis, alerts } = useSimulationStore();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  async function sendMessage(text?: string) {
    const content = text || input.trim();
    if (!content) return;

    setInput('');
    setShowSuggestions(false);
    setLoading(true);

    const userMsg: AIMessage = {
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };
    addChatMessage(userMsg);

    // Build conversation history (last 8 exchanges)
    const historyToSend = [...chatMessages.slice(-14), userMsg];

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: historyToSend.map(m => ({ role: m.role, content: m.content })),
          context: { vessels, gates, trucks, kpis, alerts },
          userRole,
        }),
      });

      const data = await res.json();

      const assistantMsg: AIMessage = {
        role: 'assistant',
        content: JSON.stringify(data),
        timestamp: new Date().toISOString(),
        parsed: data,
      };
      addChatMessage(assistantMsg);
    } catch {
      addChatMessage({
        role: 'assistant',
        content: 'Failed to reach AI service. Check network connection.',
        timestamp: new Date().toISOString(),
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/60 shrink-0">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-semibold text-slate-200">AI Advisor</span>
          <span className="text-[10px] bg-cyan-950 text-cyan-400 px-1.5 py-0.5 rounded font-medium border border-cyan-800/50">
            Gemini 2.5 Pro
          </span>
        </div>
        <span className="text-[10px] text-slate-500">{userRole}</span>
      </div>

      {/* Conversation */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3">
        {chatMessages.length === 0 && showSuggestions && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-[11px] text-slate-500">Suggested queries for {userRole}</span>
            </div>
            <div className="space-y-1.5">
              {SUGGESTED_QUERIES.map(q => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  className="w-full text-left text-xs text-slate-400 bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-2 hover:bg-slate-700/60 hover:border-slate-600/60 hover:text-slate-300 transition-all"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {chatMessages.map((msg, i) => (
          msg.role === 'user'
            ? <UserMessage key={i} msg={msg} />
            : <AIResponseCard key={i} msg={msg} />
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-3">
            <Loader2 className="w-3 h-3 animate-spin text-cyan-400" />
            <span>AI analyzing port state...</span>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-3 pb-3 shrink-0">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            placeholder="Ask about port operations, congestion, or vessel schedules..."
            className="flex-1 bg-slate-800/80 border border-slate-700/60 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50 focus:bg-slate-800"
            disabled={loading}
          />
          <button
            onClick={() => sendMessage()}
            disabled={loading || !input.trim()}
            className="px-3 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
            ) : (
              <Send className="w-3.5 h-3.5 text-white" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
