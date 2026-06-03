import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, Save, Check } from 'lucide-react';
import SettingsSection from './settings/SettingsSection';
import SettingsField from './settings/SettingsField';
import SegmentedControl from './settings/SegmentedControl';
import SelectField from './settings/SelectField';
import SecretField from './settings/SecretField';
import TransferNumberEditor from './settings/TransferNumberEditor';
import AgentTransferEditor from './settings/AgentTransferEditor';

interface SettingRow {
  key: string;
  value: string;
}

const SECTIONS = [
  { id: 'general',            label: 'General' },
  { id: 'voice-synthesis',    label: 'Voice Synthesis' },
  { id: 'speech-recognition', label: 'Speech Recognition' },
  { id: 'conversation-flow',  label: 'Conversation Flow' },
  { id: 'tools',              label: 'Tools' },
  { id: 'integration',        label: 'Integration & API' },
  { id: 'notifications',      label: 'Notifications' },
];

const TTS_MODELS = [
  { value: 'eleven_multilingual_v2', label: 'Multilingual v2' },
  { value: 'eleven_flash_v2_5',      label: 'Flash v2.5 (Ultra-low latency)' },
  { value: 'eleven_v3',              label: 'Eleven v3 (Most expressive)' },
  { value: 'eleven_flash_v2',        label: 'Flash v2 (English only)' },
];

const OUTPUT_FORMATS = [
  { value: 'mp3_44100_128',  label: 'MP3 44.1kHz / 128kbps' },
  { value: 'mp3_44100_192',  label: 'MP3 44.1kHz / 192kbps' },
  { value: 'mp3_24000_48',   label: 'MP3 24kHz / 48kbps' },
  { value: 'pcm_16000',      label: 'PCM 16kHz (low latency)' },
  { value: 'pcm_24000',      label: 'PCM 24kHz' },
  { value: 'pcm_44100',      label: 'PCM 44.1kHz' },
  { value: 'opus_48000_96',  label: 'Opus 48kHz / 96kbps' },
  { value: 'opus_48000_128', label: 'Opus 48kHz / 128kbps' },
  { value: 'ulaw_8000',      label: 'µ-law 8kHz (telephony)' },
];

const STT_MODELS = [
  { value: 'scribe_v2', label: 'Scribe v2 (recommended)' },
  { value: 'scribe_v1', label: 'Scribe v1 (legacy)' },
];

const NORM_OPTIONS     = [{ value: 'auto', label: 'Auto' }, { value: 'on', label: 'On' }, { value: 'off', label: 'Off' }];
const TS_OPTIONS       = [{ value: 'none', label: 'None' }, { value: 'word', label: 'Word' }, { value: 'character', label: 'Char' }];
const EAGERNESS_OPT    = [{ value: 'eager', label: 'Eager' }, { value: 'normal', label: 'Normal' }, { value: 'patient', label: 'Patient' }];

function InlineRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-8">
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] font-medium text-stone-800">{label}</p>
        {hint && <p className="text-[11px] text-stone-400 mt-0.5 leading-relaxed max-w-xs">{hint}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

export default function Settings() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [activeSection, setActiveSection] = useState('general');
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('settings').select('key, value');
      if (data) {
        const map: Record<string, string> = {};
        data.forEach((row: SettingRow) => { map[row.key] = row.value; });
        setSettings(map);
      }
      setLoading(false);
    }
    load();
  }, []);

  useEffect(() => {
    if (loading) return;
    const container = contentRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveSection(entry.target.id);
        });
      },
      { root: container, rootMargin: '-5% 0px -75% 0px', threshold: 0 }
    );

    SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [loading]);

  const update = useCallback((key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
    setSaved(false);
  }, []);

  async function handleSave() {
    setSaving(true);
    await Promise.all(
      Object.entries(settings).map(([key, value]) =>
        supabase.from('settings').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
      )
    );
    setSaving(false);
    setDirty(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  function scrollToSection(id: string) {
    const el = document.getElementById(id);
    const container = contentRef.current;
    if (!el || !container) return;
    container.scrollTo({ top: el.offsetTop - 24, behavior: 'smooth' });
    setActiveSection(id);
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-4 h-4 text-stone-300 animate-spin" />
      </div>
    );
  }

  const s = settings;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#fafaf8]">
      {/* Top bar */}
      <div className="flex-shrink-0 flex items-center justify-between px-8 h-14 bg-white border-b border-stone-100">
        <h2 className="text-[14px] font-semibold text-stone-900 tracking-tight">Settings</h2>
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty && !saving}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[12px] font-medium transition-all duration-200 ${
            saved
              ? 'bg-emerald-50 text-emerald-600'
              : dirty
                ? 'bg-stone-900 text-white hover:bg-stone-800'
                : 'text-stone-300 cursor-not-allowed'
          }`}
        >
          {saving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : saved ? (
            <Check className="w-3.5 h-3.5" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}
          {saving ? 'Saving' : saved ? 'Saved' : 'Save'}
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left nav */}
        <aside className="w-[180px] flex-shrink-0 bg-white border-r border-stone-100 overflow-y-auto py-6 px-4">
          <nav className="space-y-px">
            {SECTIONS.map((sec) => {
              const isActive = activeSection === sec.id;
              return (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => scrollToSection(sec.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-[12.5px] transition-colors duration-150 ${
                    isActive
                      ? 'text-stone-900 font-semibold bg-stone-50'
                      : 'text-stone-400 hover:text-stone-700 hover:bg-stone-50 font-medium'
                  }`}
                >
                  {sec.label}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Content */}
        <main ref={contentRef} className="flex-1 overflow-y-auto custom-scrollbar px-8 py-6 space-y-4">

          <SettingsSection id="general" title="General">
            <SettingsField
              type="text" label="Agent Name"
              value={s.agent_name ?? ''} onChange={(v) => update('agent_name', v)}
              placeholder="Samvaad Agent"
            />
            <SettingsField
              type="text" label="Greeting Message" hint="First message spoken when a call starts"
              value={s.greeting_message ?? ''} onChange={(v) => update('greeting_message', v)}
              placeholder="Hello! How can I help you?"
            />
            <SettingsField
              type="number" label="Max Call Duration" hint="Limit in seconds"
              value={s.max_call_duration ?? '600'} onChange={(v) => update('max_call_duration', v)}
              suffix="s"
            />
            <SettingsField
              type="text" label="Default Language"
              value={s.default_language ?? ''} onChange={(v) => update('default_language', v)}
              placeholder="Telugu"
            />
            <SettingsField
              type="toggle" label="Auto Translate" hint="Translate between source and target languages"
              value={s.auto_translate ?? 'true'} onChange={(v) => update('auto_translate', v)}
            />
          </SettingsSection>

          <SettingsSection id="voice-synthesis" title="Voice Synthesis">
            <SelectField
              label="Model" hint="Flash models offer the lowest latency"
              value={s.el_tts_model_id ?? 'eleven_multilingual_v2'}
              onChange={(v) => update('el_tts_model_id', v)} options={TTS_MODELS}
            />
            <SettingsField
              type="slider" label="Stability"
              hint="Higher = consistent delivery. Lower = broader emotional range."
              value={s.el_stability ?? '0.5'} onChange={(v) => update('el_stability', v)}
              min={0} max={1} step={0.01}
            />
            <SettingsField
              type="slider" label="Similarity Boost"
              hint="How closely the AI matches the original voice"
              value={s.el_similarity_boost ?? '0.75'} onChange={(v) => update('el_similarity_boost', v)}
              min={0} max={1} step={0.01}
            />
            <SettingsField
              type="slider" label="Style Exaggeration"
              hint="Amplifies speaker style. Keep at 0 for most use cases."
              value={s.el_style_exaggeration ?? '0.0'} onChange={(v) => update('el_style_exaggeration', v)}
              min={0} max={1} step={0.01}
            />
            <SettingsField
              type="slider" label="Speed"
              value={s.el_tts_speed ?? '1.0'} onChange={(v) => update('el_tts_speed', v)}
              min={0.7} max={1.2} step={0.05} suffix="×"
            />
            <SettingsField
              type="toggle" label="Speaker Boost" hint="Boosts similarity to original speaker. Slightly increases latency."
              value={s.el_speaker_boost ?? 'true'} onChange={(v) => update('el_speaker_boost', v)}
            />
            <SelectField
              label="Output Format" hint="PCM and Opus formats offer lower latency"
              value={s.el_output_format ?? 'mp3_44100_128'}
              onChange={(v) => update('el_output_format', v)} options={OUTPUT_FORMATS}
            />
            <SettingsField
              type="text" label="Language Code" hint="ISO 639-1 code (e.g. te, en, hi)"
              value={s.el_language_code ?? 'te'} onChange={(v) => update('el_language_code', v)}
              placeholder="te"
            />
            <InlineRow label="Text Normalization" hint="How numbers, symbols, and abbreviations are handled">
              <div className="w-40">
                <SegmentedControl
                  options={NORM_OPTIONS} value={s.el_apply_text_normalization ?? 'auto'}
                  onChange={(v) => update('el_apply_text_normalization', v)}
                />
              </div>
            </InlineRow>
            <SettingsField
              type="toggle" label="Enable Logging" hint="Log generations to ElevenLabs history"
              value={s.el_enable_logging ?? 'true'} onChange={(v) => update('el_enable_logging', v)}
            />
            <SettingsField
              type="number" label="Seed" hint="Optional integer for reproducible output"
              value={s.el_tts_seed ?? ''} onChange={(v) => update('el_tts_seed', v)}
              placeholder="Leave blank for random"
            />
          </SettingsSection>

          <SettingsSection id="speech-recognition" title="Speech Recognition">
            <SelectField
              label="Model" hint="Scribe v2 supports 90+ languages and diarization"
              value={s.el_stt_model_id ?? 'scribe_v2'}
              onChange={(v) => update('el_stt_model_id', v)} options={STT_MODELS}
            />
            <SettingsField
              type="text" label="Language Code" hint="ISO 639-1 hint for better accuracy. Leave blank to auto-detect."
              value={s.el_stt_language_code ?? 'te'} onChange={(v) => update('el_stt_language_code', v)}
              placeholder="te"
            />
            <SettingsField
              type="toggle" label="Speaker Diarization" hint="Annotate which speaker is talking"
              value={s.el_diarize ?? 'false'} onChange={(v) => update('el_diarize', v)}
            />
            <SettingsField
              type="number" label="Max Speakers" hint="0 for auto-detection"
              value={s.el_num_speakers ?? '0'} onChange={(v) => update('el_num_speakers', v)}
            />
            <InlineRow label="Timestamps" hint="Level of timestamp detail in transcript output">
              <div className="w-40">
                <SegmentedControl
                  options={TS_OPTIONS} value={s.el_timestamps_granularity ?? 'word'}
                  onChange={(v) => update('el_timestamps_granularity', v)}
                />
              </div>
            </InlineRow>
            <SettingsField
              type="toggle" label="Tag Audio Events" hint="Label sounds like (laughter), (footsteps) in transcript"
              value={s.el_tag_audio_events ?? 'true'} onChange={(v) => update('el_tag_audio_events', v)}
            />
            <SettingsField
              type="toggle" label="Filter Filler Words" hint="Remove um, uh, and false starts. Scribe v2 only."
              value={s.el_filter_fillers ?? 'false'} onChange={(v) => update('el_filter_fillers', v)}
            />
            <SettingsField
              type="slider" label="Temperature" hint="Higher values produce more varied transcriptions"
              value={s.el_stt_temperature ?? '0.0'} onChange={(v) => update('el_stt_temperature', v)}
              min={0} max={2} step={0.1}
            />
          </SettingsSection>

          <SettingsSection id="conversation-flow" title="Conversation Flow">
            <SettingsField
              type="slider" label="Turn Timeout" hint="Seconds of silence before agent prompts the user"
              value={s.el_turn_timeout ?? '7'} onChange={(v) => update('el_turn_timeout', v)}
              min={1} max={30} step={1} suffix="s"
            />
            <InlineRow label="Turn Eagerness" hint="How quickly the agent responds to pauses">
              <div className="w-48">
                <SegmentedControl
                  options={EAGERNESS_OPT} value={s.el_turn_eagerness ?? 'normal'}
                  onChange={(v) => update('el_turn_eagerness', v)}
                />
              </div>
            </InlineRow>
            <SettingsField
              type="toggle" label="Allow Interruptions" hint="Let users interrupt the agent mid-speech"
              value={s.el_allow_interruptions ?? 'true'} onChange={(v) => update('el_allow_interruptions', v)}
            />
            <SettingsField
              type="slider" label="Soft Timeout" hint="Seconds before a filler phrase is spoken while waiting for LLM"
              value={s.el_soft_timeout ?? '3.0'} onChange={(v) => update('el_soft_timeout', v)}
              min={0} max={10} step={0.5} suffix="s"
            />
            <SettingsField
              type="slider" label="VAD Silence Threshold" hint="Silence duration required to commit a user turn"
              value={s.el_vad_silence_threshold ?? '1.5'} onChange={(v) => update('el_vad_silence_threshold', v)}
              min={0.5} max={5} step={0.1} suffix="s"
            />
            <SettingsField
              type="slider" label="VAD Confidence" hint="Minimum voice activity confidence score"
              value={s.el_vad_threshold ?? '0.4'} onChange={(v) => update('el_vad_threshold', v)}
              min={0} max={1} step={0.05}
            />
          </SettingsSection>

          <SettingsSection id="tools" title="Tools">
            <SettingsField
              type="toggle" label="End Call"
              hint="Agent can automatically terminate the conversation when appropriate"
              value={s.el_tool_end_call_enabled ?? 'true'} onChange={(v) => update('el_tool_end_call_enabled', v)}
            />
            <SettingsField
              type="toggle" label="Language Detection"
              hint="Automatically switch voice and responses to match the user's detected language"
              value={s.el_tool_language_detection_enabled ?? 'false'} onChange={(v) => update('el_tool_language_detection_enabled', v)}
            />
            <SettingsField
              type="toggle" label="Agent Transfer"
              hint="Route conversations to specialized AI agents based on user needs"
              value={s.el_tool_agent_transfer_enabled ?? 'false'} onChange={(v) => update('el_tool_agent_transfer_enabled', v)}
            />
            <SettingsField
              type="toggle" label="Transfer to Number"
              hint="Hand off calls to a human operator via phone number or SIP URI"
              value={s.el_tool_transfer_number_enabled ?? 'false'} onChange={(v) => update('el_tool_transfer_number_enabled', v)}
            />
            <SettingsField
              type="toggle" label="Skip Turn"
              hint="Agent can pause and wait for user input without speaking"
              value={s.el_tool_skip_turn_enabled ?? 'false'} onChange={(v) => update('el_tool_skip_turn_enabled', v)}
            />
            <SettingsField
              type="toggle" label="DTMF Tones"
              hint="Play keypad tones to interact with automated phone systems (IVR menus)"
              value={s.el_tool_dtmf_enabled ?? 'false'} onChange={(v) => update('el_tool_dtmf_enabled', v)}
            />
            <SettingsField
              type="toggle" label="Voicemail Detection"
              hint="Detect voicemail systems and optionally leave a message"
              value={s.el_tool_voicemail_enabled ?? 'false'} onChange={(v) => update('el_tool_voicemail_enabled', v)}
            />
          </SettingsSection>

          {s.el_tool_end_call_enabled === 'true' && (
            <SettingsSection id="tool-end-call" title="End Call — Configuration">
              <SettingsField
                type="text" label="Farewell Message"
                hint="Optional message spoken before hanging up"
                value={s.el_tool_end_call_message ?? ''} onChange={(v) => update('el_tool_end_call_message', v)}
                placeholder="Thank you for calling. Goodbye!"
              />
            </SettingsSection>
          )}

          {s.el_tool_language_detection_enabled === 'true' && (
            <SettingsSection id="tool-language-detection" title="Language Detection — Configuration">
              <SettingsField
                type="text" label="Supported Languages"
                hint="Comma-separated ISO 639-1 codes the agent can switch to"
                value={s.el_tool_lang_detection_langs ?? ''} onChange={(v) => update('el_tool_lang_detection_langs', v)}
                placeholder="en, te, hi, ta, kn"
              />
            </SettingsSection>
          )}

          {s.el_tool_agent_transfer_enabled === 'true' && (
            <SettingsSection id="tool-agent-transfer" title="Agent Transfer — Rules">
              <AgentTransferEditor
                value={s.el_agent_transfer_rules ?? '[]'}
                onChange={(v) => update('el_agent_transfer_rules', v)}
              />
            </SettingsSection>
          )}

          {s.el_tool_transfer_number_enabled === 'true' && (
            <SettingsSection id="tool-transfer-number" title="Transfer to Number — Rules">
              <TransferNumberEditor
                value={s.el_transfer_number_rules ?? '[]'}
                onChange={(v) => update('el_transfer_number_rules', v)}
              />
            </SettingsSection>
          )}

          {s.el_tool_voicemail_enabled === 'true' && (
            <SettingsSection id="tool-voicemail" title="Voicemail Detection — Configuration">
              <InlineRow label="On Voicemail Detected" hint="What the agent should do when a voicemail system is detected">
                <div className="w-44">
                  <SegmentedControl
                    options={[{ value: 'leave_message', label: 'Leave message' }, { value: 'hang_up', label: 'Hang up' }]}
                    value={s.el_tool_voicemail_action ?? 'hang_up'}
                    onChange={(v) => update('el_tool_voicemail_action', v)}
                  />
                </div>
              </InlineRow>
              {s.el_tool_voicemail_action === 'leave_message' && (
                <SettingsField
                  type="text" label="Voicemail Message"
                  hint="Message spoken after the beep"
                  value={s.el_tool_voicemail_message ?? ''} onChange={(v) => update('el_tool_voicemail_message', v)}
                  placeholder="Hi, this is a message from..."
                />
              )}
            </SettingsSection>
          )}

          <SettingsSection id="integration" title="Integration & API">
            <SecretField
              label="ElevenLabs API Key"
              hint="From elevenlabs.io → Profile → API Keys"
              value={s.elevenlabs_api_key ?? ''} onChange={(v) => update('elevenlabs_api_key', v)}
              placeholder="sk_••••••••••••••••••••••••••"
            />
            <SettingsField
              type="url" label="Webhook URL" hint="Receive call events and transcripts via POST"
              value={s.webhook_url ?? ''} onChange={(v) => update('webhook_url', v)}
              placeholder="https://hooks.example.com/..."
            />
          </SettingsSection>

          <SettingsSection id="notifications" title="Notifications">
            <SettingsField
              type="toggle" label="Email Notifications"
              value={s.email_notifications ?? 'false'} onChange={(v) => update('email_notifications', v)}
            />
            {s.email_notifications === 'true' && (
              <SettingsField
                type="email" label="Notification Email"
                value={s.notification_email ?? ''} onChange={(v) => update('notification_email', v)}
                placeholder="you@company.com"
              />
            )}
            <SettingsField
              type="toggle" label="Alert on Failed Calls" hint="Notify when a call drops or fails to connect"
              value={s.notify_on_failed_calls ?? 'true'} onChange={(v) => update('notify_on_failed_calls', v)}
            />
            <SettingsField
              type="toggle" label="Daily Report" hint="Summary of call volumes, durations, and sentiment"
              value={s.daily_report ?? 'false'} onChange={(v) => update('daily_report', v)}
            />
          </SettingsSection>

          <div className="h-6" />
        </main>
      </div>
    </div>
  );
}
