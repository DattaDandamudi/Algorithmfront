/*
  # Add ElevenLabs Settings

  ## Summary
  Adds comprehensive ElevenLabs configuration settings across four new categories:
  voice_synthesis, speech_recognition, conversation_flow, and integration.

  ## New Settings

  ### Voice Synthesis (ElevenLabs TTS)
  - `el_stability` — Voice consistency (0.0–1.0), default 0.5
  - `el_similarity_boost` — Clarity & similarity to original voice (0.0–1.0), default 0.75
  - `el_style_exaggeration` — Amplifies speaker style (0.0–1.0), default 0.0
  - `el_speaker_boost` — Boosts speaker similarity, slightly increases latency, default true
  - `el_tts_speed` — Playback speed (0.7–1.2), default 1.0
  - `el_tts_model_id` — TTS model identifier, default eleven_multilingual_v2
  - `el_output_format` — Audio output format, default mp3_44100_128
  - `el_language_code` — ISO 639-1 language code, default te (Telugu)
  - `el_apply_text_normalization` — Text normalization mode (auto/on/off), default auto
  - `el_enable_logging` — Enable generation logging, default true
  - `el_tts_seed` — Deterministic sampling seed (optional), default empty

  ### Speech Recognition (ElevenLabs STT)
  - `el_stt_model_id` — STT model, default scribe_v2
  - `el_stt_language_code` — Language hint for transcription, default te
  - `el_diarize` — Speaker diarization, default false
  - `el_num_speakers` — Max speakers to detect (0=auto), default 0
  - `el_timestamps_granularity` — Timestamp detail (none/word/character), default word
  - `el_tag_audio_events` — Tag non-speech sounds, default true
  - `el_filter_fillers` — Remove filler words, default false
  - `el_stt_temperature` — Transcription randomness (0.0–2.0), default 0.0

  ### Conversation Flow
  - `el_turn_timeout` — Seconds of silence before agent prompts (1–30), default 7
  - `el_turn_eagerness` — How quickly agent responds to pauses (eager/normal/patient), default normal
  - `el_allow_interruptions` — Allow user to interrupt agent mid-speech, default true
  - `el_soft_timeout` — Seconds before filler phrase on LLM delay, default 3.0
  - `el_vad_silence_threshold` — Silence duration for turn commit (seconds), default 1.5
  - `el_vad_threshold` — Voice activity detection confidence threshold (0–1), default 0.4

  ### Integration
  - `elevenlabs_api_key` — ElevenLabs API key for authentication, default empty

  ## Notes
  - All keys use `ON CONFLICT DO NOTHING` to be safe for re-runs
  - Existing settings are preserved
  - No destructive operations
*/

INSERT INTO settings (key, value, category) VALUES
  ('el_stability', '0.5', 'voice_synthesis'),
  ('el_similarity_boost', '0.75', 'voice_synthesis'),
  ('el_style_exaggeration', '0.0', 'voice_synthesis'),
  ('el_speaker_boost', 'true', 'voice_synthesis'),
  ('el_tts_speed', '1.0', 'voice_synthesis'),
  ('el_tts_model_id', 'eleven_multilingual_v2', 'voice_synthesis'),
  ('el_output_format', 'mp3_44100_128', 'voice_synthesis'),
  ('el_language_code', 'te', 'voice_synthesis'),
  ('el_apply_text_normalization', 'auto', 'voice_synthesis'),
  ('el_enable_logging', 'true', 'voice_synthesis'),
  ('el_tts_seed', '', 'voice_synthesis'),
  ('el_stt_model_id', 'scribe_v2', 'speech_recognition'),
  ('el_stt_language_code', 'te', 'speech_recognition'),
  ('el_diarize', 'false', 'speech_recognition'),
  ('el_num_speakers', '0', 'speech_recognition'),
  ('el_timestamps_granularity', 'word', 'speech_recognition'),
  ('el_tag_audio_events', 'true', 'speech_recognition'),
  ('el_filter_fillers', 'false', 'speech_recognition'),
  ('el_stt_temperature', '0.0', 'speech_recognition'),
  ('el_turn_timeout', '7', 'conversation_flow'),
  ('el_turn_eagerness', 'normal', 'conversation_flow'),
  ('el_allow_interruptions', 'true', 'conversation_flow'),
  ('el_soft_timeout', '3.0', 'conversation_flow'),
  ('el_vad_silence_threshold', '1.5', 'conversation_flow'),
  ('el_vad_threshold', '0.4', 'conversation_flow'),
  ('elevenlabs_api_key', '', 'integration')
ON CONFLICT (key) DO NOTHING;
