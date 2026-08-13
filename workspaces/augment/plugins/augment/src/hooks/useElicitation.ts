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
  handleElicitationSubmit: (values: Record<string, unknown>) => Promise<void>;
  handleElicitationDecline: () => Promise<void>;
}

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

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!streamingState || streamingState.phase !== 'pending_elicitation') {
      if (pendingElicitation && !submittingRef.current) {
        setPendingElicitation(null);
        setElicitationError(null);
      }
    }
  }, [streamingState, pendingElicitation]);

  useEffect(() => {
    if (
      streamingState?.phase === 'pending_elicitation' &&
      streamingState.pendingElicitation &&
      !pendingElicitation
    ) {
      setPendingElicitation(streamingState.pendingElicitation);
    }
  }, [streamingState, pendingElicitation]);

  const handleElicitationSubmit = useCallback(
    async (values: Record<string, unknown>) => {
      if (!pendingElicitation || submittingRef.current) return;

      submittingRef.current = true;
      setIsElicitationSubmitting(true);
      setElicitationError(null);

      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      try {
        await api.submitElicitationResponse(
          pendingElicitation.elicitationId,
          'accept',
          values,
          controller.signal,
        );

        if (mountedRef.current) {
          setPendingElicitation(null);
        }
      } catch (err) {
        debugError('Error submitting elicitation response:', err);
        if (mountedRef.current) {
          if (isAbortError(err)) {
            setElicitationError('Elicitation response timed out');
          } else if (err instanceof Error) {
            setElicitationError(err.message);
          } else {
            setElicitationError('Failed to submit response');
          }
        }
      } finally {
        clearTimeout(timeoutId);
        submittingRef.current = false;
        if (mountedRef.current) {
          setIsElicitationSubmitting(false);
        }
      }
    },
    [api, pendingElicitation],
  );

  const handleElicitationDecline = useCallback(async () => {
    if (!pendingElicitation || submittingRef.current) return;

    submittingRef.current = true;
    setIsElicitationSubmitting(true);
    setElicitationError(null);

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      await api.submitElicitationResponse(
        pendingElicitation.elicitationId,
        'decline',
        undefined,
        controller.signal,
      );

      if (mountedRef.current) {
        setPendingElicitation(null);
      }
    } catch (err) {
      debugError('Error declining elicitation:', err);
      if (mountedRef.current) {
        if (isAbortError(err)) {
          setElicitationError('Elicitation decline timed out');
        } else if (err instanceof Error) {
          setElicitationError(err.message);
        } else {
          setElicitationError('Failed to decline');
        }
      }
    } finally {
      clearTimeout(timeoutId);
      submittingRef.current = false;
      if (mountedRef.current) {
        setIsElicitationSubmitting(false);
      }
    }
  }, [api, pendingElicitation]);

  return {
    pendingElicitation,
    isElicitationSubmitting,
    elicitationError,
    handleElicitationSubmit,
    handleElicitationDecline,
  };
}
