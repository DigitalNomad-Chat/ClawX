import { describe, expect, it } from 'vitest';
import { getSessionActivityMs, getSessionBucket, groupSessionsByAgent } from '@/components/layout/session-buckets';

describe('sidebar session date buckets', () => {
  it('uses the timestamp embedded in a locally-created session key as activity fallback', () => {
    const createdAtMs = new Date('2026-05-06T10:00:00.000Z').getTime();
    const nowMs = new Date('2026-05-06T12:00:00.000Z').getTime();
    const session = {
      key: `agent:main:session-${createdAtMs}`,
      displayName: `agent:main:session-${createdAtMs}`,
    };

    const activityMs = getSessionActivityMs(session, {});

    expect(activityMs).toBe(createdAtMs);
    expect(getSessionBucket(activityMs, nowMs)).toBe('today');
  });

  it('prefers real message activity over backend metadata or key creation time', () => {
    const keyCreatedAtMs = new Date('2026-05-06T10:00:00.000Z').getTime();
    const updatedAtMs = new Date('2026-05-06T11:00:00.000Z').getTime();
    const messageActivityMs = new Date('2026-05-06T12:00:00.000Z').getTime();

    expect(getSessionActivityMs(
      {
        key: `agent:main:session-${keyCreatedAtMs}`,
        updatedAt: updatedAtMs,
      },
      { [`agent:main:session-${keyCreatedAtMs}`]: messageActivityMs },
    )).toBe(messageActivityMs);
  });

  describe('groupSessionsByAgent', () => {
    it('groups sessions by agentId', () => {
      const sessions = [
        { key: 'agent:main:session-1' },
        { key: 'agent:main:session-2' },
        { key: 'agent:reviewer:session-3' },
      ];
      const groups = groupSessionsByAgent(sessions, {}, { main: 'Main Agent', reviewer: 'Code Reviewer' });

      expect(groups).toHaveLength(2);
      expect(groups[0]!.agentId).toBe('main');
      expect(groups[0]!.sessions).toHaveLength(2);
      expect(groups[1]!.agentId).toBe('reviewer');
      expect(groups[1]!.sessions).toHaveLength(1);
    });

    it('sorts sessions within group by activity descending', () => {
      const sessions = [
        { key: 'agent:main:session-old' },
        { key: 'agent:main:session-new' },
      ];
      const lastActivity = {
        'agent:main:session-old': 1000,
        'agent:main:session-new': 3000,
      };
      const groups = groupSessionsByAgent(sessions, lastActivity, {});

      expect(groups[0]!.sessions[0]!.key).toBe('agent:main:session-new');
      expect(groups[0]!.sessions[1]!.key).toBe('agent:main:session-old');
    });

    it('sorts agent groups by latest activity descending', () => {
      const sessions = [
        { key: 'agent:alpha:session-1' },
        { key: 'agent:beta:session-2' },
      ];
      const lastActivity = {
        'agent:alpha:session-1': 1000,
        'agent:beta:session-2': 5000,
      };
      const groups = groupSessionsByAgent(sessions, lastActivity, {});

      expect(groups[0]!.agentId).toBe('beta');
      expect(groups[1]!.agentId).toBe('alpha');
    });

    it('falls back to agentId when name is not found', () => {
      const sessions = [{ key: 'agent:unknown:session-1' }];
      const groups = groupSessionsByAgent(sessions, {}, {});

      expect(groups[0]!.agentName).toBe('unknown');
    });

    it('treats non-agent keys as main', () => {
      const sessions = [{ key: 'legacy:session-1' }];
      const groups = groupSessionsByAgent(sessions, {}, { main: 'Main' });

      expect(groups[0]!.agentId).toBe('main');
      expect(groups[0]!.agentName).toBe('Main');
    });
  });
});
