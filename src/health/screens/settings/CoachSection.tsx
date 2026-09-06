/**
 * Settings §7 — Coach & AI (SPEC §4/§5 "coach tone", ai/client.ts modes).
 *
 * provider: none (offline rule-based coach + local food DB) · anthropic-direct
 * (the user's own key, kept in this browser's localStorage and sent straight
 * to api.anthropic.com) · proxy (a URL that injects the key server-side — the
 * safer choice anywhere but the user's own machine). The key is never
 * rendered in full (guardrails.maskKey) and is entered via a draft + Save so
 * half-typed secrets never hit storage. "Test connection" sends one tiny turn
 * through askCoach — the same code path the Coach screen uses — and reports
 * success or the mapped CoachError; nothing is appended to the chat.
 */
import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, KeyRound, Wifi } from 'lucide-react';
import { createClient, isAIConfigured, MODEL_OPTIONS, resolveModel } from '../../ai/client';
import { askCoach, toCoachError } from '../../ai/coach';
import { maskKey } from '../../ai/guardrails';
import { useHealth } from '../../data/store';
import type { AISettings, CoachTone } from '../../data/types';
import { Banner, Button, SegmentedControl, toast } from '../../ui';
import { useConfirm } from './useConfirm';
import { CONTROL, Field, Note, SelectField, SubHeading, TextField } from './fields';

const PROVIDER_OPTIONS: Array<{ value: AISettings['provider']; label: string }> = [
  { value: 'none', label: 'Offline coach only (no AI calls)' },
  { value: 'anthropic-direct', label: 'Anthropic API key in this browser' },
  { value: 'proxy', label: 'Proxy URL (key held server-side)' },
];

const TONE_OPTIONS: Array<{ value: CoachTone; label: string }> = [
  { value: 'conversational', label: 'Conversational' },
  { value: 'direct', label: 'Direct' },
];

interface TestResult {
  ok: boolean;
  message: string;
}

export default function CoachSection() {
  const { state, actions } = useHealth();
  const confirm = useConfirm();
  const ai = state.settings.ai;
  const configured = isAIConfigured(ai);

  const modelOptions = MODEL_OPTIONS.some((m) => m.id === ai.model)
    ? MODEL_OPTIONS.map((m) => ({ value: m.id, label: m.label }))
    : [...MODEL_OPTIONS.map((m) => ({ value: m.id, label: m.label })), { value: ai.model, label: `${ai.model} (custom)` }];

  // --- Test connection ------------------------------------------------------
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const test = async () => {
    const client = createClient(ai);
    if (!client) {
      setResult({ ok: false, message: ai.provider === 'proxy' ? 'Add a proxy URL first.' : ai.provider === 'anthropic-direct' ? 'Save an API key first.' : 'Pick a provider and add a key or proxy URL first.' });
      return;
    }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setTesting(true);
    setResult(null);
    const t0 = performance.now();
    try {
      const model = resolveModel(ai);
      const res = await askCoach({
        client,
        model,
        system: 'You are a connectivity check for a health app. Reply with exactly one word: OK',
        messages: [{ role: 'user', content: 'Connection test — reply with exactly: OK' }],
        signal: ctrl.signal,
      });
      const secs = ((performance.now() - t0) / 1000).toFixed(1);
      setResult({ ok: true, message: `Connected — ${res.servedBy ?? model} replied “${res.text.slice(0, 24) || '…'}” in ${secs} s${res.fallbackRan ? ' (a fallback model answered)' : ''}.` });
    } catch (err) {
      const e = toCoachError(err);
      if (e.kind !== 'abort') setResult({ ok: false, message: e.message });
    } finally {
      if (abortRef.current === ctrl) setTesting(false);
    }
  };

  const clearKey = async () => {
    const ok = await confirm({
      title: 'Remove the API key from this browser?',
      body: 'The coach and food estimator fall back to offline mode until you add a key or proxy again.',
      confirmLabel: 'Remove key',
      danger: true,
    });
    if (!ok) return;
    actions.updateAI({ apiKey: undefined });
    setResult(null);
    toast('API key removed');
  };

  return (
    <>
      <SelectField<AISettings['provider']> label="Provider" value={ai.provider} options={PROVIDER_OPTIONS} onChange={(provider) => actions.updateAI({ provider })} />

      {ai.provider === 'none' && <Note>Chips and questions are answered by the rule-based offline coach from your own numbers; meals are parsed by the local food database. Nothing leaves this device.</Note>}

      {ai.provider === 'anthropic-direct' && (
        <>
          <KeyEditor apiKey={ai.apiKey} onSave={(apiKey) => actions.updateAI({ apiKey })} onClear={clearKey} />
          <Banner kind="warn">
            Stored only in this browser’s localStorage and sent directly to api.anthropic.com. Anyone who can open this browser profile can read it — on a shared or hosted setup use the proxy option instead.
          </Banner>
        </>
      )}

      {ai.provider === 'proxy' && (
        <TextField
          label="Proxy URL"
          type="url"
          value={ai.proxyUrl ?? ''}
          placeholder="https://<project>.functions.supabase.co/coach-proxy"
          hint="Same-origin or CORS-enabled endpoint that speaks the Anthropic Messages API and injects the real key server-side. No key is stored here."
          onChange={(v) => actions.updateAI({ proxyUrl: v.trim() || undefined })}
        />
      )}

      {ai.provider !== 'none' && (
        <>
          <SelectField label="Model" value={ai.model} options={modelOptions} hint="Opus 5 is the all-round default; Sonnet 5 is faster and cheaper for quick questions." onChange={(model) => actions.updateAI({ model })} />
          <div className="space-y-2">
            <Button variant="secondary" fullWidth icon={<Wifi aria-hidden />} loading={testing} disabled={!configured} onClick={test}>
              {testing ? 'Testing…' : 'Test connection'}
            </Button>
            {testing && (
              <Button variant="ghost" size="sm" fullWidth onClick={() => abortRef.current?.abort()}>
                Cancel
              </Button>
            )}
            {result && <Banner kind={result.ok ? 'success' : 'error'}>{result.message}</Banner>}
            <Note className="text-hx-muted">Sends a one-line request; nothing is added to your chat history.</Note>
          </div>
        </>
      )}

      <SubHeading>Style</SubHeading>
      <Field label="Coach tone" hint={ai.tone === 'direct' ? 'Terse — verdict, numbers, action. ≤80 words.' : 'Warm — one line of context, then the verdict and the action.'}>
        <SegmentedControl<CoachTone> ariaLabel="Coach tone" options={TONE_OPTIONS} value={ai.tone} onChange={(tone) => actions.updateAI({ tone })} />
      </Field>
      <TextField label="App / coach name" value={ai.appName} maxLength={24} placeholder="Pulse" hint="How the coach introduces itself." onChange={(appName) => actions.updateAI({ appName })} />
    </>
  );
}

// ---------------------------------------------------------------------------
// API key editor: masked display when saved, draft + Save when editing
// ---------------------------------------------------------------------------

function KeyEditor({ apiKey, onSave, onClear }: { apiKey: string | undefined; onSave: (key: string) => void; onClear: () => void }) {
  const has = !!apiKey?.trim();
  const [editing, setEditing] = useState(!has);
  const [draft, setDraft] = useState('');
  const [reveal, setReveal] = useState(false);

  const save = () => {
    const k = draft.trim();
    if (!k) return;
    onSave(k);
    setDraft('');
    setReveal(false);
    setEditing(false);
    toast('API key saved in this browser');
  };

  if (has && !editing) {
    return (
      <Field label="API key" hint="Only the last 4 characters are ever shown.">
        <div className="flex items-center gap-2">
          <div className={`${CONTROL} flex-1 min-w-0 flex items-center gap-2 rounded-xl border border-hx-border bg-hx-card2 font-mono text-[14px] text-hx-text`}>
            <KeyRound className="w-4 h-4 text-hx-muted shrink-0" aria-hidden />
            <span className="truncate">{maskKey(apiKey)}</span>
          </div>
          <Button variant="secondary" size="md" onClick={() => setEditing(true)}>
            Replace
          </Button>
          <Button variant="danger" size="md" onClick={onClear}>
            Clear
          </Button>
        </div>
      </Field>
    );
  }

  return (
    <TextField
      label="API key"
      type={reveal ? 'text' : 'password'}
      value={draft}
      placeholder="sk-ant-…"
      autoComplete="off"
      hint="Paste a key from console.anthropic.com. Saved only when you press Save."
      onChange={setDraft}
      trailing={
        <div className="flex items-center gap-1.5 shrink-0">
          <button type="button" onClick={() => setReveal((r) => !r)} aria-label={reveal ? 'Hide key' : 'Show key'} aria-pressed={reveal} className="w-11 h-11 inline-flex items-center justify-center rounded-xl text-hx-muted hover:text-hx-text hover:bg-hx-card2">
            {reveal ? <EyeOff className="w-[18px] h-[18px]" aria-hidden /> : <Eye className="w-[18px] h-[18px]" aria-hidden />}
          </button>
          <Button size="md" disabled={!draft.trim()} onClick={save}>
            Save
          </Button>
          {has && (
            <Button variant="ghost" size="md" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          )}
        </div>
      }
    />
  );
}
