"use strict";

/**
 * Collaboration Hall — REST API Routes
 *
 * Endpoints:
 *   GET    /api/collaboration/overview
 *   GET    /api/collaboration/messages
 *   POST   /api/collaboration/messages
 *   GET    /api/collaboration/task-cards
 *   POST   /api/collaboration/task-cards
 *   PATCH  /api/collaboration/task-cards/:id
 *   POST   /api/collaboration/task-cards/:id/archive
 *   DELETE /api/collaboration/task-cards/:id
 *   POST   /api/collaboration/task-cards/:id/assign
 *   POST   /api/collaboration/task-cards/:id/handoff
 *   POST   /api/collaboration/task-cards/:id/review
 *   POST   /api/collaboration/task-cards/:id/stop
 *   POST   /api/collaboration/task-cards/:id/execution-order
 *   POST   /api/collaboration/task-cards/:id/continue-discussion
 *   POST   /api/collaboration/task-cards/:id/open-discussion
 *   POST   /api/collaboration/task-cards/:id/auto-assign
 *   POST   /api/collaboration/task-cards/:id/auto-advance
 *   POST   /api/collaboration/task-cards/:id/dispatch
 *   GET    /api/collaboration/stream
 *   GET    /api/collaboration/orchestrator/status
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { HostApiContext } from "../../api/context";
import { parseJsonBody, sendJson } from "../../api/route-utils";
import {
  loadHallStore,
  loadMessageStore,
  loadTaskCardStore,
  getHall,
  listMessages,
  listTaskCards,
  getTaskCard,
  appendMessage,
  createTaskCard,
  updateTaskCard,
  archiveTaskCard,
  deleteTaskCard,
  recordDiscussionResponse,
  getActiveLock,
  acquireExecutionLock,
  releaseExecutionLock,
  listArtifacts,
  addArtifact,
  removeArtifact,
  DEFAULT_COLLABORATION_HALL_ID,
} from "./store";
import { resolveMentionTargets } from "./mention-router";
import { openDiscussionCycle } from "./speaker-policy";
import { dispatchAgentRun, runtimeDispatch } from "./runtime-dispatch";

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

function extractTaskCardId(path: string): string | undefined {
  const prefix = "/api/collaboration/task-cards/";
  if (!path.startsWith(prefix)) return undefined;
  const suffix = path.slice(prefix.length);
  const id = suffix.split("/")[0];
  return id ? decodeURIComponent(id) : undefined;
}

function extractTaskCardAction(path: string): string | undefined {
  const prefix = "/api/collaboration/task-cards/";
  if (!path.startsWith(prefix)) return undefined;
  const suffix = path.slice(prefix.length);
  const parts = suffix.split("/").filter(Boolean);
  return parts[1]; // e.g. "archive", "assign", "handoff", "review", "open-discussion"
}

function extractArtifactId(path: string): string | undefined {
  const prefix = "/api/collaboration/task-cards/";
  if (!path.startsWith(prefix)) return undefined;
  const suffix = path.slice(prefix.length);
  const parts = suffix.split("/").filter(Boolean);
  return parts[2]; // artifacts/:artifactId
}

// ---------------------------------------------------------------------------
//  Route handler
// ---------------------------------------------------------------------------

export async function handleCollaborationRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  ctx: HostApiContext,
): Promise<boolean> {
  const pathname = url.pathname;

  // ========================================================================
  //  SSE Stream
  // ========================================================================

  if (pathname === "/api/collaboration/stream" && req.method === "GET") {
    const { createCollabStreamHandler } = await import("./stream-manager");
    const handler = createCollabStreamHandler(ctx);
    handler(req, res);
    return true;
  }

  // ========================================================================
  //  Debug
  // ========================================================================

  if (pathname === "/api/collaboration/debug" && req.method === "GET") {
    try {
      const hStore = await loadHallStore();
      const hall = getHall(hStore, url.searchParams.get("hallId") || undefined);
      const tStore = await loadTaskCardStore();
      const mStore = await loadMessageStore();
      const gatewayStatus = ctx?.gatewayManager?.getStatus?.();
      sendJson(res, 200, {
        success: true,
        hallExists: !!hall,
        hallId: hall?.hallId ?? null,
        participantCount: hall?.participants?.length ?? 0,
        participants: hall?.participants?.map((p) => ({
          participantId: p.participantId,
          agentId: p.agentId,
          displayName: p.displayName,
          aliases: p.aliases,
          semanticRole: p.semanticRole,
          isHuman: p.isHuman,
          active: p.active,
        })),
        taskCardCount: tStore.taskCards.length,
        messageCount: mStore.messages.length,
        gatewayState: gatewayStatus?.state ?? "unknown",
        ctxExists: !!ctx,
      });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  // ========================================================================
  //  Overview
  // ========================================================================

  if (pathname === "/api/collaboration/overview" && req.method === "GET") {
    try {
      const [hStore, mStore, tStore] = await Promise.all([
        loadHallStore(),
        loadMessageStore(),
        loadTaskCardStore(),
      ]);
      const hall = getHall(hStore);
      const messages = listMessages(mStore, { hallId: DEFAULT_COLLABORATION_HALL_ID, limit: 50 });
      const taskCards = listTaskCards(tStore, { hallId: DEFAULT_COLLABORATION_HALL_ID });

      sendJson(res, 200, {
        success: true,
        hall: hall ?? null,
        messages,
        taskCards,
        stats: {
          totalMessages: messages.length,
          activeTasks: taskCards.filter((t) => !t.archivedAt && t.status !== "done").length,
          completedTasks: taskCards.filter((t) => t.status === "done").length,
          blockedTasks: taskCards.filter((t) => t.status === "blocked").length,
        },
      });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  // ========================================================================
  //  Messages
  // ========================================================================

  if (pathname === "/api/collaboration/messages" && req.method === "GET") {
    try {
      const mStore = await loadMessageStore();
      const hallId = url.searchParams.get("hallId")?.trim() || undefined;
      const taskCardId = url.searchParams.get("taskCardId")?.trim() || undefined;
      const limitParam = url.searchParams.get("limit");
      const limit = limitParam ? parseInt(limitParam, 10) : undefined;
      const messages = listMessages(mStore, { hallId, taskCardId, limit });
      sendJson(res, 200, { success: true, messages });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  if (pathname === "/api/collaboration/messages" && req.method === "POST") {
    try {
      const body = await parseJsonBody<{
        hallId?: string;
        kind?: import("./types").HallMessageKind;
        authorParticipantId: string;
        authorLabel: string;
        authorSemanticRole?: import("./types").HallSemanticRole;
        content: string;
        targetParticipantIds?: string[];
        taskCardId?: string;
        taskId?: string;
        roomId?: string;
        payload?: import("./types").HallMessagePayload;
      }>(req);

      if (!body.authorParticipantId || !body.content) {
        sendJson(res, 400, { success: false, error: "authorParticipantId and content are required" });
        return true;
      }

      // Resolve mentions from content
      const hStore = await loadHallStore();
      const hall = getHall(hStore, body.hallId);
      const mentionResult = hall
        ? resolveMentionTargets(body.content, hall.participants)
        : { broadcastAll: false, targets: [] };
      const mentionTargets = mentionResult.targets;

      console.log(
        "[collab-routes] POST messages content=%s hallExists=%s participantCount=%s mentionTargets=%j",
        body.content?.slice(0, 60),
        !!hall,
        hall?.participants?.length ?? 0,
        mentionTargets.map((t) => ({ id: t.participantId, name: t.displayName })),
      );

      const message = await appendMessage({
        hallId: body.hallId,
        kind: body.kind,
        authorParticipantId: body.authorParticipantId,
        authorLabel: body.authorLabel,
        authorSemanticRole: body.authorSemanticRole,
        content: body.content,
        targetParticipantIds: body.targetParticipantIds,
        mentionTargets,
        taskCardId: body.taskCardId,
        taskId: body.taskId,
        roomId: body.roomId,
        payload: body.payload,
      });

      sendJson(res, 200, { success: true, message });

      // ── Auto-dispatch to mentioned participants (fire-and-forget) ──
      const shouldDispatch = mentionTargets.length > 0 && hall && ctx;
      if (!shouldDispatch) {
        // Broadcast diagnostic event so frontend can see why dispatch was skipped
        import("./event-publisher").then(({ publishCollabEvent }) => {
          publishCollabEvent({
            type: "invalidate",
            hallId: body.hallId ?? DEFAULT_COLLABORATION_HALL_ID,
            reason: "draft_abort",
            payload: {
              draftId: "dispatch-diag",
              abortReason:
                `派发被跳过: mentionTargets=${mentionTargets.length}, ` +
                `hallExists=${!!hall}, ctxExists=${!!ctx}, ` +
                `content=${body.content?.slice(0, 40)}`,
            },
          });
        });
      } else {
        Promise.resolve().then(async () => {
          console.log("[collab-routes] Starting auto-dispatch for %d targets", mentionTargets.length);
          const { publishCollabEvent } = await import("./event-publisher");
          // Load task card once for discussion cycle checking
          let dispatchTaskCard = body.taskCardId
            ? getTaskCard(await loadTaskCardStore(), body.taskCardId)
            : undefined;

          // If a discussion cycle is active, determine the next expected speaker
          let nextExpectedSpeakerId: string | undefined;
          if (dispatchTaskCard?.discussionCycle && !dispatchTaskCard.discussionCycle.closedAt) {
            const { resolveNextDiscussionSpeaker } = await import("./speaker-policy");
            nextExpectedSpeakerId = resolveNextDiscussionSpeaker(dispatchTaskCard);
            if (nextExpectedSpeakerId) {
              console.log(
                "[collab-routes] Discussion cycle active; next expected speaker=%s",
                nextExpectedSpeakerId,
              );
            }
          }

          for (const target of mentionTargets) {
            // If discussion cycle is active and this target is not the next expected speaker, skip
            if (nextExpectedSpeakerId && target.participantId !== nextExpectedSpeakerId) {
              console.log(
                "[collab-routes] Skipping dispatch for %s (not next expected speaker %s)",
                target.participantId,
                nextExpectedSpeakerId,
              );
              continue;
            }

            const participant = hall.participants.find(
              (p) => p.participantId === target.participantId
            );
            console.log(
              "[collab-routes] Dispatch target=%s participantFound=%s agentId=%s",
              target.participantId,
              !!participant,
              participant?.agentId ?? "N/A"
            );
            if (!participant?.agentId) {
              publishCollabEvent({
                type: "invalidate",
                hallId: hall.hallId,
                reason: "draft_abort",
                payload: {
                  draftId: `dispatch-${target.participantId}`,
                  abortReason: `Participant ${target.displayName} has no agentId`,
                },
              });
              continue;
            }

            const dispatchDraftId = `dispatch-${target.participantId}`;

            publishCollabEvent({
              type: "invalidate",
              hallId: hall.hallId,
              reason: "draft_chunk",
              payload: {
                draftId: dispatchDraftId,
                chunk: `${participant.displayName} 正在思考…`,
                authorLabel: participant.displayName,
                authorSemanticRole: participant.semanticRole,
              },
            });

            let taskCard = dispatchTaskCard;

            if (!taskCard) {
              try {
                taskCard = await createTaskCard({
                  hallId: body.hallId,
                  title: message.content.slice(0, 60),
                  description: message.content,
                  createdByParticipantId: message.authorParticipantId,
                  stage: "discussion",
                  status: "todo",
                  currentOwnerParticipantId: participant.participantId,
                  currentOwnerLabel: participant.displayName,
                });
              } catch (createErr) {
                const reason = createErr instanceof Error ? createErr.message : String(createErr);
                console.error("[collaboration] Failed to create ad-hoc taskCard:", reason);
                publishCollabEvent({
                  type: "invalidate",
                  hallId: hall.hallId,
                  reason: "draft_abort",
                  payload: {
                    draftId: `dispatch-${target.participantId}`,
                    abortReason: `创建任务失败: ${reason}`,
                  },
                });
                continue;
              }
            }

            try {
              console.log("[collab-routes] Calling runtimeDispatch for agent=%s", participant.agentId);
              const result = await runtimeDispatch({
                ctx,
                mode: "discussion",
                participant,
                taskCard,
                hall,
                triggerMessage: message,
                operatorIntent: { type: "direct_ask", text: message.content },
                draftId: dispatchDraftId,
              });
              console.log(
                "[collab-routes] runtimeDispatch success=%s error=%s nextAction=%s structured=%s",
                result.success, result.error ?? "none", result.nextAction ?? "none", !!result.structured,
              );

              // Record discussion cycle response when dispatch succeeds
              if (result.success) {
                try {
                  const { cycleCompleted } = await recordDiscussionResponse(
                    taskCard.taskCardId,
                    participant.participantId,
                  );
                  if (cycleCompleted) {
                    console.log("[collab-routes] Discussion cycle completed for taskCard=%s", taskCard.taskCardId);
                  }
                } catch (cycleErr) {
                  console.warn("[collab-routes] Failed to record discussion response:", cycleErr);
                }
              }

              if (!result.success) {
                publishCollabEvent({
                  type: "invalidate",
                  hallId: hall.hallId,
                  reason: "draft_abort",
                  payload: {
                    draftId: `dispatch-${target.participantId}`,
                    abortReason: result.error || "Gateway dispatch failed",
                  },
                });
              } else if (result.message) {
                publishCollabEvent({
                  type: "invalidate",
                  hallId: hall.hallId,
                  reason: "draft_finalize",
                  payload: {
                    draftId: `dispatch-${target.participantId}`,
                    message: result.message,
                  },
                });
              } else {
                // dispatch succeeded but no message persisted (should not happen)
                publishCollabEvent({
                  type: "invalidate",
                  hallId: hall.hallId,
                  reason: "draft_abort",
                  payload: {
                    draftId: `dispatch-${target.participantId}`,
                    abortReason: result.error || "Agent 未返回有效消息",
                  },
                });
              }
            } catch (dispatchErr) {
              const reason = dispatchErr instanceof Error ? dispatchErr.message : String(dispatchErr);
              console.error("[collaboration] Auto-dispatch failed:", reason);
              publishCollabEvent({
                type: "invalidate",
                hallId: hall.hallId,
                reason: "draft_abort",
                payload: {
                  draftId: `dispatch-${target.participantId}`,
                  abortReason: `派发失败: ${reason}`,
                },
              });
            }
          }
        });
      }
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  // ========================================================================
  //  Task Cards — list / create
  // ========================================================================

  if (pathname === "/api/collaboration/task-cards" && req.method === "GET") {
    try {
      const tStore = await loadTaskCardStore();
      const hallId = url.searchParams.get("hallId")?.trim() || undefined;
      const stage = url.searchParams.get("stage")?.trim() as import("./types").HallTaskStage | undefined;
      const includeArchived = url.searchParams.get("includeArchived") === "true";
      const taskCards = listTaskCards(tStore, { hallId, stage, includeArchived });
      sendJson(res, 200, { success: true, taskCards });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  if (pathname === "/api/collaboration/task-cards" && req.method === "POST") {
    try {
      const body = await parseJsonBody<{
        hallId?: string;
        title: string;
        description: string;
        createdByParticipantId: string;
        stage?: import("./types").HallTaskStage;
        status?: import("./types").TaskState;
        currentOwnerParticipantId?: string;
        currentOwnerLabel?: string;
        plannedExecutionItems?: import("./types").HallExecutionItem[];
        doneWhen?: string;
      }>(req);

      if (!body.title || !body.description || !body.createdByParticipantId) {
        sendJson(res, 400, { success: false, error: "title, description and createdByParticipantId are required" });
        return true;
      }

      const taskCard = await createTaskCard(body);
      sendJson(res, 200, { success: true, taskCard });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  // ========================================================================
  //  Task Cards — single resource actions
  // ========================================================================

  const taskCardId = extractTaskCardId(pathname);
  const taskAction = extractTaskCardAction(pathname);

  if (taskCardId && pathname.startsWith("/api/collaboration/task-cards/") && req.method === "PATCH" && !taskAction) {
    try {
      const body = await parseJsonBody<import("./store").UpdateTaskCardInput>(req);
      const taskCard = await updateTaskCard(taskCardId, body);
      sendJson(res, 200, { success: true, taskCard });
    } catch (error) {
      const status = String(error).includes("not found") ? 404 : 500;
      sendJson(res, status, { success: false, error: String(error) });
    }
    return true;
  }

  if (taskCardId && pathname.startsWith("/api/collaboration/task-cards/") && req.method === "DELETE" && !taskAction) {
    try {
      const taskCard = await deleteTaskCard(taskCardId);
      sendJson(res, 200, { success: true, taskCard });
    } catch (error) {
      const status = String(error).includes("not found") ? 404 : 500;
      sendJson(res, status, { success: false, error: String(error) });
    }
    return true;
  }

  // ========================================================================
  //  Task Cards — archive
  // ========================================================================

  if (taskCardId && taskAction === "archive" && req.method === "POST") {
    try {
      const body = await parseJsonBody<{ archivedByParticipantId?: string; archivedByLabel?: string }>(req);
      const taskCard = await archiveTaskCard(taskCardId, body.archivedByParticipantId, body.archivedByLabel);
      sendJson(res, 200, { success: true, taskCard });
    } catch (error) {
      const status = String(error).includes("not found") ? 404 : 500;
      sendJson(res, status, { success: false, error: String(error) });
    }
    return true;
  }

  // ========================================================================
  //  Task Cards — assign
  // ========================================================================

  if (taskCardId && taskAction === "assign" && req.method === "POST") {
    try {
      const body = await parseJsonBody<{
        participantId: string;
        label: string;
        note?: string;
        dispatch?: boolean;
      }>(req);

      if (!body.participantId) {
        sendJson(res, 400, { success: false, error: "participantId is required" });
        return true;
      }

      // Execution lock check — reject if locked by a different participant
      const activeLock = await getActiveLock(taskCardId);
      if (activeLock && activeLock.participantId !== body.participantId) {
        sendJson(res, 409, {
          success: false,
          error: `任务已被 ${activeLock.participantLabel || activeLock.participantId} 锁定`,
        });
        return true;
      }

      let taskCard = await updateTaskCard(taskCardId, {
        currentOwnerParticipantId: body.participantId,
        currentOwnerLabel: body.label,
        stage: "execution",
        status: "in_progress",
      });

      // Append system message for assignment
      await appendMessage({
        hallId: taskCard.hallId,
        kind: "handoff",
        authorParticipantId: body.participantId,
        authorLabel: body.label || body.participantId,
        content: body.note || `任务已指派给 ${body.label || body.participantId}`,
        taskCardId: taskCard.taskCardId,
        taskId: taskCard.taskId,
        payload: {
          nextOwnerParticipantId: body.participantId,
          taskStage: "execution",
          taskStatus: "in_progress",
        },
      });

      // Acquire execution lock for the assigned participant
      await acquireExecutionLock(
        taskCardId,
        body.participantId,
        body.label || body.participantId,
        "execution",
      );

      // Optional: dispatch to Gateway runtime if requested
      if (body.dispatch) {
        const hStore = await loadHallStore();
        const hall = getHall(hStore, taskCard.hallId);
        const participant = hall?.participants.find((p) => p.participantId === body.participantId);
        if (participant && hall) {
          void runtimeDispatch({
            ctx,
            mode: "execution",
            participant,
            taskCard,
            hall,
            operatorIntent: { type: "direct_ask", text: body.note || `你被指派了任务: ${taskCard.title}` },
          }).catch((err: Error) => {
            console.warn("[collaboration] Runtime dispatch failed:", err);
          });
        }
      }

      sendJson(res, 200, { success: true, taskCard });
    } catch (error) {
      const status = String(error).includes("not found") ? 404 : 500;
      sendJson(res, status, { success: false, error: String(error) });
    }
    return true;
  }

  // ========================================================================
  //  Task Cards — handoff
  // ========================================================================

  if (taskCardId && taskAction === "handoff" && req.method === "POST") {
    try {
      const body = await parseJsonBody<{
        nextParticipantId: string;
        nextLabel: string;
        note?: string;
        dispatch?: boolean;
        handoffPacket?: import("./types").StructuredHandoffPacket;
      }>(req);

      if (!body.nextParticipantId) {
        sendJson(res, 400, { success: false, error: "nextParticipantId is required" });
        return true;
      }

      const tStore = await loadTaskCardStore();
      let taskCard = getTaskCard(tStore, taskCardId);
      if (!taskCard) {
        sendJson(res, 404, { success: false, error: `Task card '${taskCardId}' not found` });
        return true;
      }

      const previousOwnerId = taskCard.currentOwnerParticipantId;
      const previousLabel = taskCard.currentOwnerLabel;

      // Validate handoff packet if provided
      const { validateHandoffPacket } = await import("./handoff-validator");
      const hStoreForHandoff = await loadHallStore();
      const hall = getHall(hStoreForHandoff, taskCard.hallId);
      const participants = hall?.participants ?? [];
      const handoffPacket = body.handoffPacket as import("./types").StructuredHandoffPacket | undefined;
      const handoffValidation = validateHandoffPacket(handoffPacket, participants);

      if (handoffPacket && !handoffValidation.valid) {
        sendJson(res, 422, {
          success: false,
          error: "移交数据验证失败",
          validation: handoffValidation,
        });
        return true;
      }

      // Release previous execution lock on handoff
      await releaseExecutionLock(taskCardId, "handoff_complete");

      taskCard = await updateTaskCard(taskCardId, {
        currentOwnerParticipantId: body.nextParticipantId,
        currentOwnerLabel: body.nextLabel,
      });

      // Append handoff message with validation result
      await appendMessage({
        hallId: taskCard.hallId,
        kind: "handoff",
        authorParticipantId: previousOwnerId || body.nextParticipantId,
        authorLabel: previousLabel || "system",
        content: body.note || `任务交接给 ${body.nextLabel || body.nextParticipantId}`,
        taskCardId: taskCard.taskCardId,
        taskId: taskCard.taskId,
        payload: {
          nextOwnerParticipantId: body.nextParticipantId,
          taskStage: taskCard.stage,
          taskStatus: taskCard.status,
          handoff: handoffPacket,
          handoffValidation: handoffPacket
            ? { valid: handoffValidation.valid, errors: handoffValidation.errors, warnings: handoffValidation.warnings }
            : undefined,
        },
      });

      if (body.dispatch) {
        const participant = hall?.participants.find((p) => p.participantId === body.nextParticipantId);
        if (participant && hall) {
          void runtimeDispatch({
            ctx,
            mode: "handoff",
            participant,
            taskCard,
            hall,
            operatorIntent: { type: "direct_ask", text: body.note || `请接手任务: ${taskCard.title}` },
          }).catch((err: Error) => {
            console.warn("[collaboration] Runtime dispatch failed:", err);
          });
        }
      }

      sendJson(res, 200, { success: true, taskCard });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  // ========================================================================
  //  Task Cards — review
  // ========================================================================

  if (taskCardId && taskAction === "review" && req.method === "POST") {
    try {
      const body = await parseJsonBody<{
        participantId: string;
        outcome: "approved" | "rejected";
        note?: string;
      }>(req);

      if (!body.participantId || !body.outcome) {
        sendJson(res, 400, { success: false, error: "participantId and outcome are required" });
        return true;
      }

      const tStore = await loadTaskCardStore();
      let taskCard = getTaskCard(tStore, taskCardId);
      if (!taskCard) {
        sendJson(res, 404, { success: false, error: `Task card '${taskCardId}' not found` });
        return true;
      }

      const newStage = body.outcome === "approved" ? "completed" : "blocked";
      const newStatus = body.outcome === "approved" ? "done" : "blocked";

      taskCard = await updateTaskCard(taskCardId, {
        stage: newStage,
        status: newStatus,
      });

      await appendMessage({
        hallId: taskCard.hallId,
        kind: "review",
        authorParticipantId: body.participantId,
        authorLabel: "reviewer",
        content: body.note || `评审结果: ${body.outcome === "approved" ? "通过" : "驳回"}`,
        taskCardId: taskCard.taskCardId,
        taskId: taskCard.taskId,
        payload: {
          reviewOutcome: body.outcome,
          taskStage: newStage,
          taskStatus: newStatus,
        },
      });

      sendJson(res, 200, { success: true, taskCard });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  // ========================================================================
  //  Task Cards — stop
  // ========================================================================

  if (taskCardId && taskAction === "stop" && req.method === "POST") {
    try {
      const tStore = await loadTaskCardStore();
      let taskCard = getTaskCard(tStore, taskCardId);
      if (!taskCard) {
        sendJson(res, 404, { success: false, error: `Task card '${taskCardId}' not found` });
        return true;
      }

      // Release execution lock if active
      const activeLock = await getActiveLock(taskCardId);
      if (activeLock) {
        await releaseExecutionLock(taskCardId, "stopped_by_operator");
      }

      taskCard = await updateTaskCard(taskCardId, {
        stage: "discussion",
        status: "todo",
        currentOwnerParticipantId: null,
        currentOwnerLabel: null,
        currentExecutionItem: null,
      });

      await appendMessage({
        hallId: taskCard.hallId,
        kind: "system",
        authorParticipantId: "system",
        authorLabel: "system",
        content: `执行已停止: ${taskCard.title}。任务回到讨论阶段。`,
        taskCardId: taskCard.taskCardId,
        taskId: taskCard.taskId,
        payload: {
          taskStage: "discussion",
          taskStatus: "todo",
        },
      });

      sendJson(res, 200, { success: true, taskCard });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  // ========================================================================
  //  Task Cards — execution-order
  // ========================================================================

  if (taskCardId && taskAction === "execution-order" && req.method === "POST") {
    try {
      const body = await parseJsonBody<{
        plannedExecutionOrder?: string[];
        plannedExecutionItems?: import("./types").HallExecutionItem[];
      }>(req);

      const tStore = await loadTaskCardStore();
      let taskCard = getTaskCard(tStore, taskCardId);
      if (!taskCard) {
        sendJson(res, 404, { success: false, error: `Task card '${taskCardId}' not found` });
        return true;
      }

      const updates: Parameters<typeof updateTaskCard>[1] = {};
      if (body.plannedExecutionOrder !== undefined) {
        updates.plannedExecutionOrder = body.plannedExecutionOrder;
      }
      if (body.plannedExecutionItems !== undefined) {
        updates.plannedExecutionItems = body.plannedExecutionItems;
      }

      if (Object.keys(updates).length > 0) {
        taskCard = await updateTaskCard(taskCardId, updates);
      }

      sendJson(res, 200, { success: true, taskCard });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  // ========================================================================
  //  Task Cards — continue-discussion
  // ========================================================================

  if (taskCardId && taskAction === "continue-discussion" && req.method === "POST") {
    try {
      const body = await parseJsonBody<{
        openedByParticipantId: string;
        expectedParticipantIds?: string[];
      }>(req);

      if (!body.openedByParticipantId) {
        sendJson(res, 400, { success: false, error: "openedByParticipantId is required" });
        return true;
      }

      const tStore = await loadTaskCardStore();
      let taskCard = getTaskCard(tStore, taskCardId);
      if (!taskCard) {
        sendJson(res, 404, { success: false, error: `Task card '${taskCardId}' not found` });
        return true;
      }

      const hStore = await loadHallStore();
      const hall = getHall(hStore, taskCard.hallId);
      const participants = hall?.participants ?? [];

      // Open a new discussion cycle
      taskCard = openDiscussionCycle(
        taskCard,
        body.openedByParticipantId,
        participants,
        body.expectedParticipantIds,
      );

      taskCard = await updateTaskCard(taskCardId, {
        stage: "discussion",
        status: "todo",
        currentOwnerParticipantId: null,
        currentOwnerLabel: null,
        currentExecutionItem: null,
        discussionCycle: taskCard.discussionCycle,
      });

      // Release execution lock if active
      const activeLock = await getActiveLock(taskCardId);
      if (activeLock) {
        await releaseExecutionLock(taskCardId, "continued_to_discussion");
      }

      const { publishCollabEvent: publishCycleOpen } = await import("./event-publisher");
      publishCycleOpen({
        type: "invalidate",
        hallId: taskCard.hallId,
        taskCardId: taskCard.taskCardId,
        reason: "discussion_cycle_open",
        payload: {
          discussionCycle: taskCard.discussionCycle,
        },
      });

      await appendMessage({
        hallId: taskCard.hallId,
        kind: "system",
        authorParticipantId: "system",
        authorLabel: "system",
        content: `继续讨论: ${taskCard.title}`,
        taskCardId: taskCard.taskCardId,
        taskId: taskCard.taskId,
        payload: {
          taskStage: "discussion",
          taskStatus: "todo",
        },
      });

      sendJson(res, 200, { success: true, taskCard });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  // ========================================================================
  //  Task Cards — open-discussion
  // ========================================================================

  if (taskCardId && taskAction === "open-discussion" && req.method === "POST") {
    try {
      const body = await parseJsonBody<{
        openedByParticipantId: string;
        expectedParticipantIds?: string[];
      }>(req);

      if (!body.openedByParticipantId) {
        sendJson(res, 400, { success: false, error: "openedByParticipantId is required" });
        return true;
      }

      const tStore = await loadTaskCardStore();
      let taskCard = getTaskCard(tStore, taskCardId);
      if (!taskCard) {
        sendJson(res, 404, { success: false, error: `Task card '${taskCardId}' not found` });
        return true;
      }

      const hStore = await loadHallStore();
      const hall = getHall(hStore, taskCard.hallId);
      const participants = hall?.participants ?? [];

      taskCard = openDiscussionCycle(
        taskCard,
        body.openedByParticipantId,
        participants,
        body.expectedParticipantIds,
      );

      await updateTaskCard(taskCardId, {
        stage: taskCard.stage,
        discussionCycle: taskCard.discussionCycle,
      });

      // Notify frontend about discussion cycle open
      const { publishCollabEvent: publishCycleOpen } = await import("./event-publisher");
      publishCycleOpen({
        type: "invalidate",
        hallId: taskCard.hallId,
        taskCardId: taskCard.taskCardId,
        reason: "discussion_cycle_open",
        payload: {
          discussionCycle: taskCard.discussionCycle,
        },
      });

      await appendMessage({
        hallId: taskCard.hallId,
        kind: "system",
        authorParticipantId: body.openedByParticipantId,
        authorLabel: "system",
        content: `讨论轮次已开启: ${taskCard.title}`,
        taskCardId: taskCard.taskCardId,
        taskId: taskCard.taskId,
        payload: {
          taskStage: "discussion",
        },
      });

      sendJson(res, 200, { success: true, taskCard });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  // ========================================================================
  //  Task Cards — auto-assign
  // ========================================================================

  if (taskCardId && taskAction === "auto-assign" && req.method === "POST") {
    try {
      const { autoAssignTask } = await import("./orchestrator");
      const result = await autoAssignTask(ctx, taskCardId);
      sendJson(res, 200, { success: true, ...result });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  // ========================================================================
  //  Task Cards — auto-advance
  // ========================================================================

  if (taskCardId && taskAction === "auto-advance" && req.method === "POST") {
    try {
      const { autoAdvanceTask } = await import("./orchestrator");
      const context = await autoAdvanceTask(ctx, taskCardId);
      sendJson(res, 200, { success: true, context });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  // ========================================================================
  //  Task Cards — dispatch to participant
  // ========================================================================

  if (taskCardId && taskAction === "dispatch" && req.method === "POST") {
    try {
      const body = await parseJsonBody<{
        participantId: string;
        mode?: "discussion" | "execution" | "handoff" | "review";
        message?: string;
      }>(req);

      if (!body.participantId) {
        sendJson(res, 400, { success: false, error: "participantId is required" });
        return true;
      }

      const { dispatchToParticipant } = await import("./orchestrator");
      const [hStore, tStore] = await Promise.all([loadHallStore(), loadTaskCardStore()]);
      const taskCard = getTaskCard(tStore, taskCardId);
      if (!taskCard) {
        sendJson(res, 404, { success: false, error: `Task card '${taskCardId}' not found` });
        return true;
      }

      const hall = getHall(hStore, taskCard.hallId);
      if (!hall) {
        sendJson(res, 404, { success: false, error: `Hall '${taskCard.hallId}' not found` });
        return true;
      }

      const participant = hall.participants.find((p) => p.participantId === body.participantId);
      if (!participant) {
        sendJson(res, 404, { success: false, error: `Participant '${body.participantId}' not found` });
        return true;
      }

      // Execution lock check
      const activeLock = await getActiveLock(taskCardId);
      if (activeLock && activeLock.participantId !== body.participantId) {
        sendJson(res, 409, {
          success: false,
          error: `任务已被 ${activeLock.participantLabel || activeLock.participantId} 锁定（原因: ${activeLock.reason}）`,
        });
        return true;
      }

      const result = await dispatchToParticipant(
        ctx,
        taskCard,
        participant,
        hall,
        body.mode ?? "execution",
      );

      sendJson(res, 200, { success: true, result });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  // ========================================================================
  //  Task Cards — artifacts
  // ========================================================================

  const artifactId = extractArtifactId(pathname);

  if (taskCardId && taskAction === "artifacts" && req.method === "GET") {
    try {
      const artifacts = await listArtifacts(taskCardId);
      sendJson(res, 200, { success: true, artifacts });
    } catch (error) {
      const status = String(error).includes("not found") ? 404 : 500;
      sendJson(res, status, { success: false, error: String(error) });
    }
    return true;
  }

  if (taskCardId && taskAction === "artifacts" && req.method === "POST") {
    try {
      const body = await parseJsonBody<{
        type: "code" | "doc" | "link" | "other";
        label: string;
        location: string;
      }>(req);

      if (!body.location) {
        sendJson(res, 400, { success: false, error: "location is required" });
        return true;
      }

      const artifact = await addArtifact(taskCardId, body);
      sendJson(res, 200, { success: true, artifact });
    } catch (error) {
      const status = String(error).includes("not found") ? 404 : String(error).includes("already exists") ? 409 : 500;
      sendJson(res, status, { success: false, error: String(error) });
    }
    return true;
  }

  if (taskCardId && taskAction === "artifacts" && artifactId && req.method === "DELETE") {
    try {
      await removeArtifact(taskCardId, artifactId);
      sendJson(res, 200, { success: true });
    } catch (error) {
      const status = String(error).includes("not found") ? 404 : 500;
      sendJson(res, status, { success: false, error: String(error) });
    }
    return true;
  }

  // ========================================================================
  //  Task Cards — execution log
  // ========================================================================

  if (taskCardId && taskAction === "execution-log" && req.method === "GET") {
    try {
      const { getExecutionLog } = await import("./task-lifecycle");
      const logs = await getExecutionLog(taskCardId);
      sendJson(res, 200, { success: true, logs });
    } catch (error) {
      const status = String(error).includes("not found") ? 404 : 500;
      sendJson(res, status, { success: false, error: String(error) });
    }
    return true;
  }

  // ========================================================================
  //  Task Cards — heartbeat check
  // ========================================================================

  if (taskCardId && taskAction === "heartbeat" && req.method === "GET") {
    try {
      const tStore = await loadTaskCardStore();
      const taskCard = getTaskCard(tStore, taskCardId);
      if (!taskCard) {
        sendJson(res, 404, { success: false, error: `Task card '${taskCardId}' not found` });
        return true;
      }
      const { checkTaskHeartbeat } = await import("./task-lifecycle");
      const status = checkTaskHeartbeat(taskCard);
      sendJson(res, 200, { success: true, taskCardId, heartbeat: status, updatedAt: taskCard.updatedAt });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  // ========================================================================
  //  Orchestrator status
  // ========================================================================

  if (pathname === "/api/collaboration/orchestrator/status" && req.method === "GET") {
    try {
      const tStore = await loadTaskCardStore();
      const { getOrchestratorContext } = await import("./orchestrator");
      const cards = listTaskCards(tStore, { includeArchived: false })
        .filter((c) => c.status !== "done" && c.stage !== "completed");

      const states = cards.map((c) => {
        const ctx = getOrchestratorContext(c);
        return {
          taskCardId: c.taskCardId,
          title: c.title,
          state: ctx.state,
          enteredAt: ctx.enteredAt,
          timeoutAt: ctx.timeoutAt,
          currentOwner: c.currentOwnerLabel,
        };
      });

      sendJson(res, 200, { success: true, states });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  // ========================================================================//  Budget Policies
  // ========================================================================

  if (pathname === "/api/collaboration/budget-policies" && req.method === "GET") {
    try {
      const { listPolicies } = await import("./budget-store");
      const policies = await listPolicies();
      sendJson(res, 200, { success: true, policies });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  if (pathname === "/api/collaboration/budget-policies" && req.method === "POST") {
    try {
      const body = await parseJsonBody<{
        name: string;
        dailyTokenLimit?: number;
        dailyCostLimit?: number;
        perTaskTokenLimit?: number;
        alertThreshold: number;
      }>(req);
      const { createPolicy } = await import("./budget-store");
      const policy = await createPolicy(body);
      sendJson(res, 200, { success: true, policy });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  return false;
}
