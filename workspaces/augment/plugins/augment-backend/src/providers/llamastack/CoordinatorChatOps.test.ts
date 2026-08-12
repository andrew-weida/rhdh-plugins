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

import { coordinatorChat, coordinatorChatStream } from './CoordinatorChatOps';
import type { ChatOpsContext } from './CoordinatorChatOps';
import type { ChatRequest } from '../../types';
import { createMockLogger } from '../../test-utils/mocks';

const mockRun = jest.fn();

jest.mock('./workflow/WorkflowHydrator', () => ({
  WorkflowHydrator: jest.fn().mockImplementation(() => ({
    hydrate: jest.fn().mockReturnValue({
      runner: { run: mockRun },
      entryAgent: { name: 'test-agent' },
      maxTurns: 5,
    }),
  })),
}));

jest.mock('../../services/WorkflowMigration', () => ({
  migrateAgentConfigsToWorkflow: jest.fn().mockReturnValue({
    nodes: [],
    edges: [],
    settings: { maxTurns: 5 },
  }),
}));

function createCtx(): ChatOpsContext {
  const logger = createMockLogger();
  return {
    logger: logger as any,
    chatService: {} as any,
    chatDepsBuilder: {
      buildChatDeps: jest.fn().mockResolvedValue({
        client: {},
        config: { model: 'test-model' },
      }),
    } as any,
    getOrchestrator: jest.fn().mockReturnValue({
      discoverBackendTools: jest.fn().mockResolvedValue([]),
    }) as any,
    requireAgentGraphManager: jest.fn().mockReturnValue({
      getSnapshot: jest.fn().mockResolvedValue({
        agents: new Map([
          [
            'default',
            { config: { instructions: 'test', model: 'test-model' } },
          ],
        ]),
        defaultAgentKey: 'default',
        maxTurns: 5,
      }),
    }) as any,
    ensureInitialized: jest.fn(),
  };
}

function createRequest(overrides?: Partial<ChatRequest>): ChatRequest {
  return {
    messages: [{ role: 'user', content: 'hello' }],
    ...overrides,
  };
}

describe('CoordinatorChatOps', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRun.mockResolvedValue({
      newItems: [],
      rawResponses: [],
      finalOutput: 'hi',
      lastAgent: { name: 'test-agent' },
    });
  });

  describe('coordinatorChat', () => {
    it('forwards conversationId and previousResponseId to runner.run()', async () => {
      const ctx = createCtx();
      const request = createRequest({
        conversationId: 'conv-123',
        previousResponseId: 'resp-456',
      });

      await coordinatorChat(ctx, request);

      expect(mockRun).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'test-agent' }),
        'hello',
        expect.objectContaining({
          conversationId: 'conv-123',
          previousResponseId: 'resp-456',
        }),
      );
    });

    it('passes undefined conversation fields without error', async () => {
      const ctx = createCtx();
      const request = createRequest();

      await coordinatorChat(ctx, request);

      expect(mockRun).toHaveBeenCalledWith(
        expect.anything(),
        'hello',
        expect.objectContaining({
          conversationId: undefined,
          previousResponseId: undefined,
          maxTurns: 5,
        }),
      );
    });
  });

  describe('coordinatorChatStream', () => {
    beforeEach(() => {
      mockRun.mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          /* empty stream */
        },
        lastAgent: { name: 'test-agent' },
      });
    });

    it('forwards conversationId and previousResponseId to runner.run()', async () => {
      const ctx = createCtx();
      const request = createRequest({
        conversationId: 'conv-789',
        previousResponseId: 'resp-012',
      });
      const onEvent = jest.fn();

      await coordinatorChatStream(ctx, request, onEvent);

      expect(mockRun).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'test-agent' }),
        'hello',
        expect.objectContaining({
          stream: true,
          conversationId: 'conv-789',
          previousResponseId: 'resp-012',
        }),
      );
    });

    it('passes undefined conversation fields without error', async () => {
      const ctx = createCtx();
      const request = createRequest();
      const onEvent = jest.fn();

      await coordinatorChatStream(ctx, request, onEvent);

      expect(mockRun).toHaveBeenCalledWith(
        expect.anything(),
        'hello',
        expect.objectContaining({
          stream: true,
          conversationId: undefined,
          previousResponseId: undefined,
          maxTurns: 5,
        }),
      );
    });
  });
});
