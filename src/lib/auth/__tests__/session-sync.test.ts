/**
 * V2-FE-048 — Cross-tab session sync channel (unit tests).
 */

import {
  buildRotationMessage,
  buildSignedOutMessage,
} from '../session-lifecycle';
import {
  createSessionSyncChannel,
  type BroadcastChannelLike,
} from '../session-sync';
import type { SiweSession } from '../siwe-types';

const NOW = Date.parse('2026-08-31T12:00:00.000Z');

const SESSION: SiweSession = {
  address: '0x742d35cc6634c0532925a3b844bc9e7595f0eb1e',
  chainId: 10,
  token: 'token-new',
  expiresAt: NOW + 3_600_000,
  issuedAt: NOW,
};

function makeBus() {
  const listeners = new Set<(event: { data: unknown }) => void>();
  return {
    makeChannel(): BroadcastChannelLike {
      const own = new Set<(event: { data: unknown }) => void>();
      return {
        postMessage(data) {
          for (const listener of [...listeners]) listener({ data });
        },
        addEventListener(_type, listener) {
          listeners.add(listener);
          own.add(listener);
        },
        removeEventListener(_type, listener) {
          listeners.delete(listener);
          own.delete(listener);
        },
        close() {
          for (const listener of own) listeners.delete(listener);
          own.clear();
        },
      };
    },
    emit(data: unknown) {
      for (const listener of [...listeners]) listener({ data });
    },
  };
}

function makeStorageEnv() {
  const map = new Map<string, string>();
  const listeners = new Map<string, (event: unknown) => void>();
  return {
    map,
    emitStorage(event: { key: string; newValue: string | null }) {
      listeners.get('storage')?.(event);
    },
    env: {
      channel: null,
      storage: {
        setItem: (key: string, value: string) => {
          map.set(key, value);
        },
      },
      eventTarget: {
        addEventListener: (type: string, listener: (event: unknown) => void) => {
          listeners.set(type, listener);
        },
        removeEventListener: (type: string) => {
          listeners.delete(type);
        },
      },
    },
  };
}

describe('session sync — BroadcastChannel transport', () => {
  it('delivers a rotation message to another channel and validates it', () => {
    const bus = makeBus();
    const tabA = createSessionSyncChannel({ env: { channel: bus.makeChannel() } });
    const tabB = createSessionSyncChannel({ env: { channel: bus.makeChannel() } });
    const received = jest.fn();
    tabB.subscribe(received);

    tabA.publish(buildRotationMessage(SESSION));

    expect(received).toHaveBeenCalledWith({ type: 'rotated', version: 1, session: SESSION });
  });

  it('delivers a signed-out message', () => {
    const bus = makeBus();
    const tabA = createSessionSyncChannel({ env: { channel: bus.makeChannel() } });
    const tabB = createSessionSyncChannel({ env: { channel: bus.makeChannel() } });
    const received = jest.fn();
    tabB.subscribe(received);

    tabA.publish(buildSignedOutMessage('revoked'));

    expect(received).toHaveBeenCalledWith({
      type: 'signed-out',
      version: 1,
      reason: 'revoked',
    });
  });

  it('ignores malformed payloads and stops delivering after unsubscribe', () => {
    const bus = makeBus();
    const tab = createSessionSyncChannel({ env: { channel: bus.makeChannel() } });
    const received = jest.fn();
    const unsubscribe = tab.subscribe(received);

    bus.emit({ type: 'rotated', session: { token: 'nope' } });
    expect(received).not.toHaveBeenCalled();

    unsubscribe();
    bus.emit(buildSignedOutMessage('expired'));
    expect(received).not.toHaveBeenCalled();
  });
});

describe('session sync — storage fallback transport', () => {
  it('publishes to storage and validates incoming storage events', () => {
    const { env, map, emitStorage } = makeStorageEnv();
    const channel = createSessionSyncChannel({
      storageKey: 'sync-key',
      env: env as never,
    });
    const received = jest.fn();
    channel.subscribe(received);

    channel.publish(buildSignedOutMessage('expired'));

    const raw = map.get('sync-key');
    expect(raw).toBeTruthy();
    emitStorage({ key: 'sync-key', newValue: raw ?? null });

    expect(received).toHaveBeenCalledWith({
      type: 'signed-out',
      version: 1,
      reason: 'expired',
    });
  });

  it('ignores malformed storage payloads', () => {
    const { env, emitStorage } = makeStorageEnv();
    const channel = createSessionSyncChannel({
      storageKey: 'sync-key',
      env: env as never,
    });
    const received = jest.fn();
    channel.subscribe(received);

    emitStorage({ key: 'sync-key', newValue: '{not json' });
    expect(received).not.toHaveBeenCalled();
  });
});
