import { Plus, Trash2 } from 'lucide-react';
import { ChevronDown } from 'lucide-react';

interface TransferRule {
  id: string;
  label: string;
  number: string;
  type: 'conference' | 'blind' | 'sip_refer';
  condition: string;
  clientMessage: string;
  agentMessage: string;
  postDialDigits: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
}

function parseRules(val: string): TransferRule[] {
  try { return JSON.parse(val) || []; } catch { return []; }
}

function RuleField({ label, value, onChange, placeholder, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <p className="text-[11.5px] font-medium text-stone-600 flex-shrink-0 w-32">{label}</p>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 min-w-0 bg-white border border-transparent rounded-lg px-2.5 py-1.5 text-[12px] text-stone-800 placeholder-stone-300 focus:outline-none focus:border-stone-200 transition-all"
      />
    </div>
  );
}

function RuleSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <p className="text-[11.5px] font-medium text-stone-600 flex-shrink-0 w-32">{label}</p>
      <div className="relative flex-1 min-w-0">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none bg-white border border-transparent rounded-lg px-2.5 py-1.5 text-[12px] text-stone-800 focus:outline-none focus:border-stone-200 pr-6 cursor-pointer transition-all"
        >
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-stone-400 pointer-events-none" />
      </div>
    </div>
  );
}

const TRANSFER_TYPES = [
  { value: 'conference', label: 'Conference (warm transfer)' },
  { value: 'blind',      label: 'Blind transfer' },
  { value: 'sip_refer',  label: 'SIP REFER' },
];

export default function TransferNumberEditor({ value, onChange }: Props) {
  const rules = parseRules(value);

  function add() {
    const newRule: TransferRule = {
      id: `rule_${Date.now()}`, label: '', number: '', type: 'conference',
      condition: '', clientMessage: '', agentMessage: '', postDialDigits: '',
    };
    onChange(JSON.stringify([...rules, newRule]));
  }

  function remove(id: string) {
    onChange(JSON.stringify(rules.filter((r) => r.id !== id)));
  }

  function update(id: string, key: keyof TransferRule, val: string) {
    onChange(JSON.stringify(rules.map((r) => r.id === id ? { ...r, [key]: val } : r)));
  }

  return (
    <div className="space-y-2">
      {rules.length === 0 && (
        <p className="text-[11.5px] text-stone-400 py-1">No transfer rules configured. Add one to enable human handoff.</p>
      )}
      {rules.map((rule, i) => (
        <div key={rule.id} className="bg-stone-50 rounded-xl p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-3 mb-1">
            <p className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider">Rule {i + 1}</p>
            <div className="flex items-center gap-2 flex-1 justify-end">
              <input
                type="text"
                value={rule.label}
                onChange={(e) => update(rule.id, 'label', e.target.value)}
                placeholder="Label (e.g. Sales Team)"
                className="bg-transparent text-[12px] font-medium text-stone-700 placeholder-stone-300 focus:outline-none text-right border-b border-transparent focus:border-stone-300 transition-all pb-0.5 w-40"
              />
              <button
                type="button"
                onClick={() => remove(rule.id)}
                className="p-1 rounded-lg text-stone-300 hover:text-red-400 hover:bg-red-50 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <RuleField label="Phone / SIP URI" value={rule.number} onChange={(v) => update(rule.id, 'number', v)} placeholder="+12125550100 or sip:user@domain" />
          <RuleSelect label="Transfer Type" value={rule.type} onChange={(v) => update(rule.id, 'type', v as TransferRule['type'])} options={TRANSFER_TYPES} />
          <RuleField label="Trigger Condition" value={rule.condition} onChange={(v) => update(rule.id, 'condition', v)} placeholder="When user asks to speak to a human" />
          <RuleField label="Client Message" value={rule.clientMessage} onChange={(v) => update(rule.id, 'clientMessage', v)} placeholder="Please hold while I connect you..." />
          {rule.type !== 'sip_refer' && (
            <RuleField label="Operator Prompt" value={rule.agentMessage} onChange={(v) => update(rule.id, 'agentMessage', v)} placeholder="Caller needs help with billing..." />
          )}
          {rule.type !== 'sip_refer' && (
            <RuleField label="Post-dial Digits" value={rule.postDialDigits} onChange={(v) => update(rule.id, 'postDialDigits', v)} placeholder="e.g. 1w2 (w = 0.5s pause)" />
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="flex items-center gap-1.5 text-[12px] font-medium text-stone-500 hover:text-stone-800 transition-colors py-1"
      >
        <Plus className="w-3.5 h-3.5" />
        Add transfer rule
      </button>
    </div>
  );
}
