"use strict";

/**
 * Hall Mention Router
 * Parses @mentions in message content.
 * Adapted from Control Center's hall-mention-router.ts
 */
import type { HallParticipant, MentionTarget } from "./types";

export interface MentionRoutingResult {
  broadcastAll: boolean;
  targets: MentionTarget[];
}

export function resolveMentionTargets(
  content: string,
  participants: HallParticipant[],
): MentionRoutingResult {
  const trimmed = content.trim();
  if (!trimmed) {
    return { broadcastAll: false, targets: [] };
  }

  const broadcastAll = /(^|[\s(])@all(?=$|[\s),.!?;:])/i.test(trimmed);
  const matched = new Map<string, MentionTarget>();

  for (const participant of participants) {
    for (const alias of participant.aliases) {
      if (!alias) continue;
      const hasMention = containsExplicitMention(trimmed, alias);
      if (process.env.NODE_ENV !== "production") {
        console.log(
          "[mention-router] Checking participant=%s alias=%s hasMention=%s",
          participant.displayName,
          alias,
          hasMention,
        );
      }
      if (!hasMention) continue;
      matched.set(participant.participantId, {
        raw: `@${alias}`,
        participantId: participant.participantId,
        displayName: participant.displayName,
        semanticRole: participant.semanticRole,
      });
      break;
    }
  }

  if (process.env.NODE_ENV !== "production") {
    console.log(
      "[mention-router] content=%s matched=%d targets=%j",
      trimmed.slice(0, 60),
      matched.size,
      [...matched.values()].map((t) => t.displayName),
    );
  }

  return {
    broadcastAll,
    targets: [...matched.values()],
  };
}

function containsExplicitMention(content: string, alias: string): boolean {
  const escaped = escapeRegex(alias);
  const pattern = new RegExp(`(^|[\\s(])@${escaped}(?=$|[\\s),.!?;:])`, "i");
  return pattern.test(content);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
