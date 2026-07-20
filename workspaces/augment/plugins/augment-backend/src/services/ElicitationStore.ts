/*
 * Copyright Red Hat, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * The result returned by the user when responding to an MCP elicitation request.
 * Compatible with the @modelcontextprotocol/sdk ElicitResult type.
 */
export interface ElicitResult {
  action: 'accept' | 'decline' | 'cancel';
  content?: Record<string, string | number | boolean | string[]>;
}

interface PendingElicitation {
  resolve: (result: ElicitResult) => void;
  reject: (err: Error) => void;
  createdAt: number;
}

const TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_PENDING = 100;

/**
 * In-memory store for pending MCP elicitation requests.
 *
 * When an MCP server calls elicitInput() during a tool call, the backend
 * registers a Promise here keyed by a UUID, emits a stream.elicitation.request
 * SSE event to the frontend, and awaits the Promise. When the user responds
 * via POST /chat/elicitation/respond, the route resolves the Promise and the
 * MCP tool call continues.
 *
 * Bounded by MAX_PENDING to prevent unbounded growth. Expired entries are
 * rejected on both store() and resolve()/reject() calls.
 */
export class ElicitationStore {
  private readonly pending = new Map<string, PendingElicitation>();

  /**
   * Register a pending elicitation. Returns a Promise that resolves when the
   * user responds or rejects on timeout / capacity eviction.
   */
  store(elicitationId: string): Promise<ElicitResult> {
    this.cleanup();
    if (this.pending.size >= MAX_PENDING) {
      let oldestKey: string | undefined;
      let oldestTime = Infinity;
      for (const [key, val] of this.pending) {
        if (val.createdAt < oldestTime) {
          oldestTime = val.createdAt;
          oldestKey = key;
        }
      }
      if (oldestKey) {
        const evicted = this.pending.get(oldestKey);
        evicted?.reject(
          new Error('Elicitation store capacity exceeded; request was dropped'),
        );
        this.pending.delete(oldestKey);
      }
    }
    return new Promise<ElicitResult>((resolve, reject) => {
      this.pending.set(elicitationId, {
        resolve,
        reject,
        createdAt: Date.now(),
      });
    });
  }

  /** Resolve a pending elicitation with the user's response. Returns true if found. */
  resolve(elicitationId: string, result: ElicitResult): boolean {
    const entry = this.pending.get(elicitationId);
    if (!entry) return false;
    this.pending.delete(elicitationId);
    entry.resolve(result);
    return true;
  }

  /** Reject a pending elicitation with an error. Returns true if found. */
  reject(elicitationId: string, error: Error): boolean {
    const entry = this.pending.get(elicitationId);
    if (!entry) return false;
    this.pending.delete(elicitationId);
    entry.reject(error);
    return true;
  }

  get size(): number {
    return this.pending.size;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, val] of this.pending) {
      if (now - val.createdAt > TTL_MS) {
        val.reject(
          new Error(
            'Elicitation timed out — user did not respond within 10 minutes',
          ),
        );
        this.pending.delete(key);
      }
    }
  }
}
