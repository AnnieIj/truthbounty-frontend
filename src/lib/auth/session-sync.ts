/**
 * V2-FE-048 — Cross-tab SIWE session synchronization.
 *
 * Broadcasts session rotations and sign-outs so every tab shares one session
 * view. Prefers `BroadcastChannel` and falls back to `localStorage` `storage`
 * events. All inbound payloads are validated; malformed messages are ignored.
 */

import {
  parseSessionSyncMessage,
  type SessionSyncMessage,
} from './session-lifecycle';

export const SESSION_SYNC_CHANNEL_NAME = 'truthbounty:siwe-session';
export const SESSION_SYNC_STORAGE_KEY = 'truthbounty:siwe:sync';

/** Minimal structural interface for a `BroadcastChannel` (test-injectable). */
export interface BroadcastChannelLike {
  postMessage(data: unknown): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  removeEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  close(): void;
}

export interface SessionSyncChannel {
  publish(message: SessionSyncMessage): void;
  subscribe(handler: (message: SessionSyncMessage) => void): () => void;
  close(): void;
}

export interface SessionSyncEnvironment {
  /** Explicit channel (or null to disable BroadcastChannel). */
  channel?: BroadcastChannelLike | null;
  /** Storage used for the fallback transport. */
  storage?: Pick<Storage, 'setItem'> | null;
  /** Event target that receives storage events from other tabs. */
  eventTarget?: Pick<Window, 'addEventListener' | 'removeEventListener'> | null;
}

export interface CreateSessionSyncChannelOptions {
  channelName?: string;
  storageKey?: string;
  env?: SessionSyncEnvironment;
}

function defaultChannel(channelName: string): BroadcastChannelLike | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  try {
    return new BroadcastChannel(channelName) as unknown as BroadcastChannelLike;
  } catch {
    return null;
  }
}

/**
 * Create a validated cross-tab session sync channel. Inbound messages are
 * parsed with `parseSessionSyncMessage`; unknown payloads are dropped.
 */
export function createSessionSyncChannel(
  options: CreateSessionSyncChannelOptions = {},
): SessionSyncChannel {
  const channelName = options.channelName ?? SESSION_SYNC_CHANNEL_NAME;
  const storageKey = options.storageKey ?? SESSION_SYNC_STORAGE_KEY;
  const env = options.env ?? {};

  const channel =
    env.channel !== undefined ? env.channel : defaultChannel(channelName);
  const storage =
    env.storage !== undefined
      ? env.storage
      : typeof window !== 'undefined'
        ? window.localStorage
        : null;
  const eventTarget =
    env.eventTarget !== undefined
      ? env.eventTarget
      : typeof window !== 'undefined'
        ? window
        : null;

  const handlers = new Set<(message: SessionSyncMessage) => void>();
  let counter = 0;

  const dispatch = (raw: unknown) => {
    const message = parseSessionSyncMessage(raw);
    if (!message) return;
    for (const handler of handlers) handler(message);
  };

  const onBroadcast = (event: { data: unknown }) => dispatch(event.data);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== storageKey || !event.newValue) return;
    try {
      dispatch(JSON.parse(event.newValue));
    } catch {
      // Malformed payload — ignore (never trust cross-tab input).
    }
  };

  channel?.addEventListener('message', onBroadcast);
  eventTarget?.addEventListener('storage', onStorage as EventListener);

  return {
    publish(message) {
      if (channel) {
        channel.postMessage(message);
        return;
      }
      if (storage) {
        try {
          counter += 1;
          storage.setItem(storageKey, JSON.stringify({ ...message, nonce: `${Date.now()}-${counter}` }));
        } catch {
          // Storage unavailable — cross-tab sync is best-effort.
        }
      }
    },
    subscribe(handler) {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
    close() {
      channel?.removeEventListener('message', onBroadcast);
      eventTarget?.removeEventListener('storage', onStorage as EventListener);
      channel?.close();
      handlers.clear();
    },
  };
}
