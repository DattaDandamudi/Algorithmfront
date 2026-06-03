import { useState, Fragment } from 'react';
import { Phone, PhoneOff, AlertCircle, ChevronDown, ChevronUp, MessageSquare, User, Bot, PhoneCall } from 'lucide-react';

interface TranscriptMessage {
  role: 'user' | 'agent';
  content: string;
}

interface CallLog {
  id: string;
  caller_name: string;
  language: string;
  persona: string;
  llm_model: string;
  duration_seconds: number;
  status: string;
  sentiment: string;
  message_count: number;
  created_at: string;
  order_id: string;
  items: string;
  price: number;
  phone_number: string;
  transcript: TranscriptMessage[];
}

interface RecentCallsProps {
  calls: CallLog[];
}

const STATUS_CONFIG: Record<string, { icon: typeof Phone; bg: string; text: string; label: string }> = {
  completed: { icon: Phone, bg: 'bg-emerald-50', text: 'text-emerald-600', label: 'Completed' },
  dropped: { icon: PhoneOff, bg: 'bg-amber-50', text: 'text-amber-600', label: 'Dropped' },
  failed: { icon: AlertCircle, bg: 'bg-rose-50', text: 'text-rose-500', label: 'Failed' },
};

const SENTIMENT_COLORS: Record<string, string> = {
  positive: 'bg-emerald-400',
  neutral: 'bg-amber-400',
  negative: 'bg-rose-400',
};

const AVATAR_GRADIENTS = [
  'from-amber-200 to-orange-200',
  'from-teal-200 to-emerald-200',
  'from-sky-200 to-blue-200',
  'from-rose-200 to-pink-200',
  'from-stone-200 to-stone-300',
];

function getAvatarGradient(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatTime(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours}h ago`;
  const days = Math.floor(diffHours / 24);
  return `${days}d ago`;
}

function formatPrice(price: number) {
  if (!price) return '';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(price);
}

function TranscriptPanel({ transcript, callerName }: { transcript: TranscriptMessage[]; callerName: string }) {
  if (!transcript || transcript.length === 0) {
    return (
      <div className="flex items-center gap-2.5 py-8 px-6 text-stone-400">
        <MessageSquare className="w-4 h-4" />
        <span className="text-[12px]">No transcript available for this call.</span>
      </div>
    );
  }

  return (
    <div className="space-y-3 py-5 px-6 max-h-72 overflow-y-auto custom-scrollbar">
      {transcript.map((msg, i) => {
        const isAgent = msg.role === 'agent';
        return (
          <div key={i} className={`flex gap-3 ${isAgent ? '' : 'flex-row-reverse'}`}>
            <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
              isAgent ? 'bg-sky-50' : 'bg-stone-100'
            }`}>
              {isAgent
                ? <Bot className="w-3.5 h-3.5 text-sky-500" />
                : <User className="w-3.5 h-3.5 text-stone-500" />
              }
            </div>
            <div className={`flex flex-col gap-0.5 max-w-[65%] ${isAgent ? '' : 'items-end'}`}>
              <span className="text-[9px] font-semibold text-stone-400 uppercase tracking-widest">
                {isAgent ? 'Agent' : callerName}
              </span>
              <div className={`text-[12px] leading-relaxed px-3.5 py-2.5 rounded-2xl ${
                isAgent
                  ? 'bg-white text-stone-700 shadow-sm border border-stone-100/60'
                  : 'bg-stone-800 text-stone-100'
              }`}>
                {msg.content}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function RecentCalls({ calls }: RecentCallsProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function toggleTranscript(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  return (
    <div className="bg-white rounded-2xl border border-stone-100/80 overflow-hidden">
      <div className="px-6 py-5 flex items-center justify-between border-b border-stone-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-stone-50 flex items-center justify-center">
            <PhoneCall className="w-4 h-4 text-stone-400" strokeWidth={1.5} />
          </div>
          <div>
            <h3 className="text-[13px] font-semibold text-stone-700 tracking-tight">Recent Calls</h3>
            <p className="text-[11px] text-stone-400 mt-0.5">Click transcript to expand conversation</p>
          </div>
        </div>
        <span className="text-[11px] font-medium text-stone-400 bg-stone-50 px-2.5 py-1 rounded-full tabular-nums">
          {calls.length} calls
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-stone-50/80">
              {['Caller', 'Phone', 'Order', 'Items', 'Price', 'Language', 'Duration', 'Status', 'Sentiment', 'Time', ''].map((h) => (
                <th
                  key={h}
                  className={`text-[10px] font-semibold text-stone-400 uppercase tracking-widest py-3 ${
                    h === '' ? 'px-5 text-center' : h === 'Time' ? 'px-4 text-right' : h === 'Caller' ? 'pl-6 pr-4 text-left' : 'px-4 text-left'
                  }`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {calls.map((call) => {
              const status = STATUS_CONFIG[call.status] ?? STATUS_CONFIG.completed;
              const StatusIcon = status.icon;
              const sentimentDot = SENTIMENT_COLORS[call.sentiment] ?? 'bg-stone-300';
              const isExpanded = expandedId === call.id;
              const initials = call.caller_name.split(' ').map((n) => n[0]).join('').slice(0, 2);
              const gradient = getAvatarGradient(call.caller_name);

              return (
                <Fragment key={call.id}>
                  <tr className={`border-b transition-colors duration-200 ${
                    isExpanded
                      ? 'border-stone-100 bg-stone-50/30'
                      : 'border-stone-50/60 hover:bg-stone-50/30'
                  }`}>
                    <td className="pl-6 pr-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center flex-shrink-0`}>
                          <span className="text-[10px] font-bold text-stone-600/80">{initials}</span>
                        </div>
                        <span className="text-[12px] font-medium text-stone-700 whitespace-nowrap">{call.caller_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-[11px] font-mono text-stone-400">{call.phone_number || '\u2014'}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      {call.order_id ? (
                        <span className="text-[10px] font-mono bg-stone-50 text-stone-600 px-2 py-0.5 rounded-md border border-stone-100/60">
                          {call.order_id}
                        </span>
                      ) : (
                        <span className="text-[11px] text-stone-300">\u2014</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-[11px] text-stone-500 max-w-[120px] truncate block" title={call.items}>
                        {call.items || '\u2014'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-[12px] font-medium text-stone-600 tabular-nums">{formatPrice(call.price) || '\u2014'}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-[11px] text-stone-500">{call.language}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-[12px] font-mono text-stone-500 tabular-nums">{formatDuration(call.duration_seconds)}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full ${status.bg}`}>
                        <StatusIcon className={`w-3 h-3 ${status.text}`} strokeWidth={2} />
                        <span className={`text-[10px] font-semibold ${status.text}`}>{status.label}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full ${sentimentDot}`} />
                        <span className="text-[11px] text-stone-500 capitalize">{call.sentiment}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <span className="text-[11px] text-stone-400">{formatTime(call.created_at)}</span>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <button
                        onClick={() => toggleTranscript(call.id)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-semibold transition-all duration-200 ${
                          isExpanded
                            ? 'bg-stone-800 text-white shadow-sm'
                            : 'bg-stone-50 text-stone-400 hover:bg-stone-100 hover:text-stone-600'
                        }`}
                      >
                        <MessageSquare className="w-3 h-3" />
                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr className="border-b border-stone-100">
                      <td colSpan={11} className="bg-stone-50/50">
                        <div className="border-l-2 border-stone-300 ml-8">
                          <TranscriptPanel transcript={call.transcript} callerName={call.caller_name} />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {calls.length === 0 && (
        <div className="px-6 py-16 text-center">
          <div className="w-12 h-12 rounded-full bg-stone-50 flex items-center justify-center mx-auto mb-3">
            <PhoneCall className="w-5 h-5 text-stone-300" />
          </div>
          <p className="text-[12px] text-stone-400">No calls recorded yet</p>
        </div>
      )}
    </div>
  );
}
