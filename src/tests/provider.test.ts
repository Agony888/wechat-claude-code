import { test } from 'node:test';
import assert from 'node:assert/strict';
import { finalizeStream, handleStreamLine, type StreamParserState } from '../codex/provider.js';

function freshState(): StreamParserState {
  return { sessionId: '', textParts: [] };
}

test('thread.started captures the Codex thread ID', () => {
  const state = freshState();
  handleStreamLine(JSON.stringify({ type: 'thread.started', thread_id: 'thread-123' }), state, {});
  assert.equal(state.sessionId, 'thread-123');
});

test('the first agent message stays buffered until its role is known', () => {
  const state = freshState();
  const calls: string[] = [];
  handleStreamLine(
    JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'working' } }),
    state,
    { onText: (text) => calls.push(text) },
  );
  assert.equal(state.pendingAgentMessage, 'working');
  assert.deepEqual(calls, []);
});

test('a later agent message turns the previous message into progress', () => {
  const state = freshState();
  const texts: string[] = [];
  const reasons: string[] = [];
  const callbacks = { onText: (text: string) => texts.push(text), onTurnEnd: (reason: string) => reasons.push(reason) };
  handleStreamLine(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'progress' } }), state, callbacks);
  handleStreamLine(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'answer' } }), state, callbacks);
  assert.deepEqual(texts, ['progress']);
  assert.deepEqual(reasons, ['tool_use']);
  assert.equal(state.pendingAgentMessage, 'answer');
});

test('turn.completed emits the buffered message as the final answer', () => {
  const state = freshState();
  const texts: string[] = [];
  const reasons: string[] = [];
  const callbacks = { onText: (text: string) => texts.push(text), onTurnEnd: (reason: string) => reasons.push(reason) };
  handleStreamLine(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'done' } }), state, callbacks);
  handleStreamLine(JSON.stringify({ type: 'turn.completed', usage: {} }), state, callbacks);
  assert.deepEqual(texts, ['done']);
  assert.deepEqual(reasons, ['end_turn']);
  assert.deepEqual(state.textParts, ['done']);
});

test('turn.failed preserves partial text and records the error', () => {
  const state = freshState();
  handleStreamLine(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'partial' } }), state, {});
  handleStreamLine(JSON.stringify({ type: 'turn.failed', error: { message: 'network unavailable' } }), state, {});
  assert.deepEqual(state.textParts, ['partial']);
  assert.equal(state.errorMessage, 'network unavailable');
});

test('finalizeStream drains a message when the CLI exits without turn.completed', () => {
  const state = freshState();
  handleStreamLine(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'last' } }), state, {});
  finalizeStream(state, {});
  assert.deepEqual(state.textParts, ['last']);
});

test('blank lines and malformed JSON are ignored', () => {
  const state = freshState();
  handleStreamLine('', state, {});
  handleStreamLine('not json', state, {});
  assert.deepEqual(state, freshState());
});
