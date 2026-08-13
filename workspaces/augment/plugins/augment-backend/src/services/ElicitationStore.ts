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

export interface ElicitResult {
  action: 'accept' | 'decline' | 'cancel';
  content?: Record<string, string | number | boolean | string[]>;
}

interface PendingElicitation {
  resolve: (result: ElicitResult) => void;
  createdAt: number;
  timer: ReturnType<typeof setTimeout>;
}

const TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_PENDING = 100;

export class ElicitationStore {
  private readonly pending = new Map<string, PendingElicitation>();

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
      if (oldestKey) this.remove(oldestKey, { action: 'decline' });
    }

    return new Promise<ElicitResult>(resolve => {
      const timer = setTimeout(() => {
        this.remove(elicitationId, { action: 'decline' });
      }, TTL_MS);

      this.pending.set(elicitationId, {
        resolve,
        createdAt: Date.now(),
        timer,
      });
    });
  }

  resolve(elicitationId: string, result: ElicitResult): boolean {
    const entry = this.pending.get(elicitationId);
    if (!entry) return false;
    clearTimeout(entry.timer);
    this.pending.delete(elicitationId);
    entry.resolve(result);
    return true;
  }

  get size(): number {
    return this.pending.size;
  }

  private remove(elicitationId: string, fallbackResult: ElicitResult): void {
    const entry = this.pending.get(elicitationId);
    if (entry) {
      clearTimeout(entry.timer);
      this.pending.delete(elicitationId);
      entry.resolve(fallbackResult);
    }
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, val] of this.pending) {
      if (now - val.createdAt > TTL_MS) {
        this.remove(key, { action: 'decline' });
      }
    }
  }
}
