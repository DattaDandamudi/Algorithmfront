import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import StatsCards from './dashboard/StatsCards';
import CallVolumeChart from './dashboard/CallVolumeChart';
import LanguageBreakdown from './dashboard/LanguageBreakdown';
import SentimentChart from './dashboard/SentimentChart';
import ModelUsage from './dashboard/ModelUsage';
import RecentCalls from './dashboard/RecentCalls';
import { Activity } from 'lucide-react';

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
  transcript: { role: 'user' | 'agent'; content: string }[];
}

interface DayVolume {
  label: string;
  count: number;
}

interface LanguageStat {
  language: string;
  count: number;
  percentage: number;
}

interface ModelStat {
  model: string;
  count: number;
  percentage: number;
}

function computeDayVolumes(calls: CallLog[]): DayVolume[] {
  const days: DayVolume[] = [];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dayEnd = new Date(dayStart.getTime() + 86400000);

    const count = calls.filter((c) => {
      const t = new Date(c.created_at).getTime();
      return t >= dayStart.getTime() && t < dayEnd.getTime();
    }).length;

    days.push({ label: dayNames[dayStart.getDay()], count });
  }

  return days;
}

function computeLanguageStats(calls: CallLog[]): LanguageStat[] {
  const counts: Record<string, number> = {};
  calls.forEach((c) => {
    counts[c.language] = (counts[c.language] || 0) + 1;
  });

  const total = calls.length || 1;
  return Object.entries(counts)
    .map(([language, count]) => ({
      language,
      count,
      percentage: Math.round((count / total) * 100),
    }))
    .sort((a, b) => b.count - a.count);
}

function computeModelStats(calls: CallLog[]): ModelStat[] {
  const counts: Record<string, number> = {};
  calls.forEach((c) => {
    counts[c.llm_model] = (counts[c.llm_model] || 0) + 1;
  });

  const total = calls.length || 1;
  return Object.entries(counts)
    .map(([model, count]) => ({
      model,
      count,
      percentage: Math.round((count / total) * 100),
    }))
    .sort((a, b) => b.count - a.count);
}

export default function Dashboard() {
  const [calls, setCalls] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCalls() {
      const { data } = await supabase
        .from('call_logs')
        .select('*')
        .order('created_at', { ascending: false });

      if (data) setCalls(data);
      setLoading(false);
    }
    fetchCalls();
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-stone-200 border-t-stone-500 animate-spin" />
          <span className="text-[12px] text-stone-400 tracking-wide">Loading analytics</span>
        </div>
      </div>
    );
  }

  const totalCalls = calls.length;
  const avgDuration = totalCalls > 0
    ? Math.round(calls.reduce((sum, c) => sum + c.duration_seconds, 0) / totalCalls)
    : 0;
  const completedCount = calls.filter((c) => c.status === 'completed').length;
  const completionRate = totalCalls > 0 ? Math.round((completedCount / totalCalls) * 100) : 0;
  const totalOrders = calls.filter((c) => c.order_id && c.order_id.trim() !== '').length;

  const sentimentCounts = {
    positive: calls.filter((c) => c.sentiment === 'positive').length,
    neutral: calls.filter((c) => c.sentiment === 'neutral').length,
    negative: calls.filter((c) => c.sentiment === 'negative').length,
  };

  const dayVolumes = computeDayVolumes(calls);
  const languageStats = computeLanguageStats(calls);
  const modelStats = computeModelStats(calls);

  const today = new Date();
  const greeting = today.getHours() < 12 ? 'Good morning' : today.getHours() < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar">
      <div className="max-w-[1400px] mx-auto px-8 lg:px-12 py-8 pb-16">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <p className="text-[12px] text-stone-400 font-medium tracking-widest uppercase mb-1.5">{greeting}</p>
            <h2 className="text-2xl font-semibold text-stone-800 tracking-tight">Analytics Overview</h2>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50/80 border border-emerald-100">
            <Activity className="w-3 h-3 text-emerald-500" />
            <span className="text-[11px] font-semibold text-emerald-600 tracking-wide">Live</span>
          </div>
        </div>

        <div className="space-y-8">
          <StatsCards
            totalCalls={totalCalls}
            avgDuration={avgDuration}
            completionRate={completionRate}
            totalOrders={totalOrders}
          />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <CallVolumeChart data={dayVolumes} />
            </div>
            <SentimentChart {...sentimentCounts} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <LanguageBreakdown data={languageStats} />
            <ModelUsage data={modelStats} />
          </div>

          <RecentCalls calls={calls.slice(0, 15)} />
        </div>
      </div>
    </div>
  );
}
