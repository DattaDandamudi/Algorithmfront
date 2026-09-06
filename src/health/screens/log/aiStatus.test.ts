import { describe, expect, it } from 'vitest';
import { AI_LOADING_LABEL, aiBarCaption, describeClientError, photoAINote } from './aiStatus';

// R7-3: a configured key that has no client yet must never read as "connect an AI key".
describe('aiBarCaption', () => {
  it('only suggests adding a key when none is configured', () => {
    expect(aiBarCaption('none', null)).toMatch(/add an AI key/);
    for (const s of ['loading', 'slow', 'ready', 'error'] as const) {
      expect(aiBarCaption(s, 'boom')).not.toMatch(/add an AI key|connect an AI key/);
    }
  });
  it('names the loading and error states with their reason', () => {
    expect(aiBarCaption('loading', null)).toBe('Loading the AI module — a moment.');
    expect(aiBarCaption('slow', null)).toMatch(/local parser answers meanwhile/);
    expect(aiBarCaption('error', 'the AI module could not be downloaded — check your connection and reload')).toBe(
      'AI unavailable — the AI module could not be downloaded — check your connection and reload. Using the local parser.',
    );
    expect(aiBarCaption('error', null)).toBe('AI unavailable — the AI client could not be created. Using the local parser.');
    expect(aiBarCaption('ready', null)).toMatch(/^Claude estimates/);
  });
});

describe('photoAINote', () => {
  it('waits through slow loads (no local fallback for photos) and explains a failed load', () => {
    expect(photoAINote('ready', null)).toBeNull();
    expect(photoAINote('none', null)).toBeNull();
    expect(photoAINote('loading', null)).toMatch(/Loading the AI module/);
    expect(photoAINote('slow', null)).toMatch(/Loading the AI module/);
    expect(photoAINote('error', 'boom')).toBe('AI unavailable — boom. Photo estimates need it; type the meal instead.');
    expect(photoAINote('error', 'boom')).not.toMatch(/Add an AI key/);
  });
  it('shares the loading label', () => {
    expect(AI_LOADING_LABEL).toBe('Loading AI…');
  });
});

describe('describeClientError', () => {
  it('maps a failed chunk load to an offline hint and keeps other messages', () => {
    expect(describeClientError(new TypeError('Failed to fetch dynamically imported module: http://x/@anthropic-ai_sdk.js'))).toBe('the AI module could not be downloaded — check your connection and reload');
    expect(describeClientError(new TypeError('Importing a module script failed.'))).toBe('the AI module could not be downloaded — check your connection and reload');
    expect(describeClientError(new Error('boom'))).toBe('boom');
    expect(describeClientError('nope')).toBe('the AI client could not be created');
    expect(describeClientError(new Error(''))).toBe('the AI client could not be created');
  });
});
