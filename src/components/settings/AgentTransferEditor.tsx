import { Plus, Trash2 } from 'lucide-react';

interface AgentTransferRule {
  id: string;
  agentId: string;
  condition: string;
  handoffMessage: string;
  delayMs: number;
  playInitialMessage: boolean;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
}

function parseRules(val: string): AgentTransferRule[] {
  try { return JSON.parse(val) || []; } catch { return []; }
}

function RuleField({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <p className="text-[11.5px] font-medium text-stone-600 flex-shrink-0 w-36">{label}</p>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 min-w-0 bg-white border border-transparent rounded-lg px-2.5 py-1.5 text-[12px] text-stone-800 placeholder-stone-300 focus:outline-none focus:border-stone-200 transition-all"
      />
    </div>
  );
}

export default function AgentTransferEditor({ value, onChange }: Props) {
  const rules = parseRules(value);

  function add() {
    const rule: AgentTransferRule = {
      id: `agent_rule_${Date.now()}`, agentId: '', condition: '',
      handoffMessage: '', delayMs: 0, playInitialMessage: false,
    };
    onChange(JSON.stringify([...rules, rule]));
  }

  function remove(id: string) {
    onChange(JSON.stringify(rules.filter((r) => r.id !== id)));
  }

  function update(id: string, key: keyof AgentTransferRule, val: string | number | boolean) {
    onChange(JSON.stringify(rules.map((r) => r.id === id ? { ...r, [key]: val } : r)));
  }

  return (
    <div className="space-y-2">
      {rules.length === 0 && (
        <p className="text-[11.5px] text-stone-400 py-1">No agent transfer rules configured. Add one to route conversations to specialized agents.</p>
      )}
      {rules.map((rule, i) => (
        <div key={rule.id} className="bg-stone-50 rounded-xl p-4 space-y-2.5">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider">Agent {i + 1}</p>
            <button
              type="button"
              onClick={() => remove(rule.id)}
              className="p-1 rounded-lg text-stone-300 hover:text-red-400 hover:bg-red-50 transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
          <RuleField
            label="Agent ID"
            value={rule.agentId}
            onChange={(v) => update(rule.id, 'agentId', v)}
            placeholder="ElevenLabs agent ID"
          />
          <RuleField
            label="Trigger Condition"
            value={rule.condition}
            onChange={(v) => update(rule.id, 'condition', v)}
            placeholder="When user needs billing support"
          />
          <RuleField
            label="Handoff Message"
            value={rule.handoffMessage}
            onChange={(v) => update(rule.id, 'handoffMessage', v)}
            placeholder="Let me connect you to a specialist..."
          />
          <div className="flex items-center justify-between gap-4">
            <p className="text-[11.5px] font-medium text-stone-600 flex-shrink-0 w-36">Delay before transfer</p>
            <div className="flex items-center gap-2 flex-1">
              <input
                type="number"
                value={rule.delayMs}
                onChange={(e) => update(rule.id, 'delayMs', Number(e.target.value))}
                min={0}
                className="w-20 bg-white border border-transparent rounded-lg px-2.5 py-1.5 text-[12px] text-stone-800 focus:outline-none focus:border-stone-200 transition-all"
              />
              <span className="text-[11px] text-stone-400">ms</span>
            </div>
          </div>
          <div className="flex items-center justify-between gap-4">
            <p className="text-[11.5px] font-medium text-stone-600 flex-shrink-0 w-36">Play initial message</p>
            <button
              type="button"
              onClick={() => update(rule.id, 'playInitialMessage', !rule.playInitialMessage)}
              className={`relative w-[36px] h-[20px] rounded-full transition-all duration-200 ${
                rule.playInitialMessage ? 'bg-stone-900' : 'bg-stone-200'
              }`}
            >
              <div className={`absolute top-[3px] w-[14px] h-[14px] rounded-full bg-white shadow-sm transition-transform duration-200 ${
                rule.playInitialMessage ? 'translate-x-[18px]' : 'translate-x-[3px]'
              }`} />
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="flex items-center gap-1.5 text-[12px] font-medium text-stone-500 hover:text-stone-800 transition-colors py-1"
      >
        <Plus className="w-3.5 h-3.5" />
        Add agent target
      </button>
    </div>
  );
}
