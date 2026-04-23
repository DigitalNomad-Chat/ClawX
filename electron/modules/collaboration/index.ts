"use strict";

import type { BackendModule } from '../types';
import { handleCollaborationRoutes } from './routes';
import { setCollabEventBus } from './event-publisher';
import { ensureDefaultHall } from './store';
import { resolveParticipantsFromRoster } from './role-resolver';
import type { HostApiContext } from '../../api/context';
import { listAgentsSnapshot } from '../../utils/agent-config';
import { startOrchestratorScheduler } from './orchestrator-scheduler';

const collaborationModule: BackendModule = {
  id: 'collaboration',
  name: '协作大厅',
  routeHandlers: [handleCollaborationRoutes],
  enabledByDefault: false,

  init(ctx: HostApiContext) {
    // Wire up event bus for real-time frontend updates
    setCollabEventBus(ctx.eventBus);

    // Start orchestrator scheduler for automatic task flow
    startOrchestratorScheduler(ctx);

    // Ensure the default collaboration hall exists with a sensible participant roster.
    // We defer this so the rest of the app (and Gateway) has had a chance to boot.
    setTimeout(() => {
      listAgentsSnapshot()
        .then((snapshot) => {
          const roster = Array.isArray(snapshot.agents)
            ? snapshot.agents.map((a) => ({
                agentId: a.id || 'main',
                displayName: a.name || a.id || 'Main',
              }))
            : [];
          const participants = resolveParticipantsFromRoster(roster);
          return ensureDefaultHall(participants);
        })
        .catch((err: Error) => {
          console.warn('[collaboration] Failed to ensure default hall:', err);
        });
    }, 2000);
  },
};

export default collaborationModule;
