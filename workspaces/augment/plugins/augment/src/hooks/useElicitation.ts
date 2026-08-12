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

import { useState, useEffect, useCallback, useRef } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { augmentApiRef } from '../api';
import type { StreamingState } from '../components/StreamingMessage';
import type { PendingElicitationInfo } from '../components/StreamingMessage/StreamingMessage.types';
import { debugError, isAbortError } from '../utils';

export interface UseElicitationOptions {
  streamingState: StreamingState | null;
}

export interface UseElicitationReturn {
  pendingElicitation: PendingElicitationInfo | null;
  isElicitationSubmitting: boolean;
  elicitationError: string | null;
  handleElicitationSubmit: (
    elicitationId: string,
    content: Record<string, unknown>,
  ) => Promise<void>;
  handleElicitationDecline: (elicitationId: string) => Promise<void>;
  handleElicitationCancel: (elicitationId: string) => Promise<void>;
}

/**
 * Hook to manage MCP elicitation — mid-tool-call user input requests.
 * Watches for pending_elicitation phase in streaming state and handles
 * submit/decline/cancel actions.
 */
export function useElicitation({
  streamingState,
}: UseElicitationOptions): UseElicitationReturn {
  const api = useApi(augmentApiRef);
  const [pendingElicitation, setPendingElicitation] =
    useState<PendingElicitationInfo | null>(null);
  const [isElicitationSubmitting, setIsElicitationSubmitting] = useState(false);
  const [elicitationError, setElicitationError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const submittingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const respondedIdsRef = useRef(new Set<string>());

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  // Sync pending elicitation from streaming state
  useEffect(() => {
    if (
      streamingState?.phase === 'pending_elicitation' &&
      streamingState.pendingElicitation &&
      !pendingElicitation &&
      !respondedIdsRef.current.has(
        streamingState.pendingElicitation.elicitationId,
      )
    ) {
      setPendingElicitation(streamingState.pendingElicitation);
      setElicitationError(null);
    }
    // Clear when phase leaves pending_elicitation (unless we're in the middle of submitting)
    if (
      streamingState?.phase !== 'pending_elicitation' &&
      pendingElicitation &&
      !submittingRef.current
    ) {
      setPendingElicitation(null);
      setElicitationError(null);
    }
  }, [streamingState, pendingElicitation]);

  const respond = useCallback(
    async (
      elicitationId: string,
      action: 'accept' | 'decline' | 'cancel',
      content?: Record<string, unknown>,
    ) => {
      if (submittingRef.current) return;
      submittingRef.current = true;
      setIsElicitationSubmitting(true);
      setElicitationError(null);

      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const timeoutId = setTimeout(() => controller.abort(), 60_000);

      try {
        await api.respondToElicitation(
          elicitationId,
          action,
          content,
          controller.signal,
        );
        if (!mountedRef.current) return;
        respondedIdsRef.current.add(elicitationId);
        setPendingElicitation(null);
        setElicitationError(null);
      } catch (err) {
        debugError('Error responding to elicitation:', err);
        if (mountedRef.current) {
          let msg: string;
          if (isAbortError(err)) {
            msg = 'Elicitation response timed out after 60 seconds';
          } else if (err instanceof Error) {
            msg = err.message;
          } else {
            msg = 'Failed to submit elicitation response';
          }
          setElicitationError(msg);
        }
      } finally {
        clearTimeout(timeoutId);
        submittingRef.current = false;
        if (mountedRef.current) {
          setIsElicitationSubmitting(false);
        }
      }
    },
    [api],
  );

  const handleElicitationSubmit = useCallback(
    async (elicitationId: string, content: Record<string, unknown>) => {
      await respond(elicitationId, 'accept', content);
    },
    [respond],
  );

  const handleElicitationDecline = useCallback(
    async (elicitationId: string) => {
      await respond(elicitationId, 'decline');
    },
    [respond],
  );

  const handleElicitationCancel = useCallback(
    async (elicitationId: string) => {
      await respond(elicitationId, 'cancel');
    },
    [respond],
  );

  return {
    pendingElicitation,
    isElicitationSubmitting,
    elicitationError,
    handleElicitationSubmit,
    handleElicitationDecline,
    handleElicitationCancel,
  };
}
