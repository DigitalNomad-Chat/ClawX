import type { IncomingMessage, ServerResponse } from 'http';
import type { HostApiContext } from '../context';
import type { DocumentSession } from '../../../src/modules/office-tools/types';
import { parseJsonBody, sendJson } from '../route-utils';
import {
  listFamilies,
  getFamily,
  createFamily,
  updateFamily,
  deleteFamily,
  listPolicies,
  getPolicy,
  createPolicy,
  updatePolicy,
  deletePolicy,
  getOfficeToolsStats,
} from '../../services/office-tools/policy-store';
import { refineText } from '../services/ai-refine';
import {
  listSessions,
  getSession,
  createSession,
  updateSession,
  deleteSession,
  deleteAllSessions,
} from '../../services/office-tools/document-session-store';

export async function handleOfficeToolsRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  _ctx: HostApiContext,
): Promise<boolean> {
  // ── Stats ────────────────────────────────────────────────────────────────
  if (url.pathname === '/api/office-tools/stats' && req.method === 'GET') {
    try {
      const stats = await getOfficeToolsStats();
      sendJson(res, 200, { success: true, stats });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  // ── Families ─────────────────────────────────────────────────────────────
  if (url.pathname === '/api/office-tools/families' && req.method === 'GET') {
    try {
      const families = await listFamilies();
      sendJson(res, 200, { success: true, families });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  if (url.pathname === '/api/office-tools/families' && req.method === 'POST') {
    try {
      const body = await parseJsonBody<{ name: string }>(req);
      if (!body.name || !body.name.trim()) {
        sendJson(res, 400, { success: false, error: 'Family name is required' });
        return true;
      }
      const family = await createFamily(body.name.trim());
      sendJson(res, 200, { success: true, family });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  if (url.pathname.startsWith('/api/office-tools/families/') && req.method === 'GET') {
    try {
      const familyId = decodeURIComponent(url.pathname.slice('/api/office-tools/families/'.length));
      const family = await getFamily(familyId);
      if (!family) {
        sendJson(res, 404, { success: false, error: 'Family not found' });
        return true;
      }
      sendJson(res, 200, { success: true, family });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  if (url.pathname.startsWith('/api/office-tools/families/') && req.method === 'PUT') {
    try {
      const familyId = decodeURIComponent(url.pathname.slice('/api/office-tools/families/'.length));
      const body = await parseJsonBody<{ name?: string }>(req);
      const ok = await updateFamily(familyId, body);
      if (!ok) {
        sendJson(res, 404, { success: false, error: 'Family not found' });
        return true;
      }
      sendJson(res, 200, { success: true });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  if (url.pathname.startsWith('/api/office-tools/families/') && req.method === 'DELETE') {
    try {
      const familyId = decodeURIComponent(url.pathname.slice('/api/office-tools/families/'.length));
      const ok = await deleteFamily(familyId);
      if (!ok) {
        sendJson(res, 404, { success: false, error: 'Family not found' });
        return true;
      }
      sendJson(res, 200, { success: true });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  // ── Policies ─────────────────────────────────────────────────────────────
  if (url.pathname === '/api/office-tools/policies' && req.method === 'GET') {
    try {
      const policies = await listPolicies();
      sendJson(res, 200, { success: true, policies });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  if (url.pathname === '/api/office-tools/policies' && req.method === 'POST') {
    try {
      const body = await parseJsonBody<{
        familyId: string;
        familyName: string;
        policyNo: string;
        insurer: string;
        productName: string;
        premium: number;
        sumAssured: number;
        effectiveDate: string;
        expiryDate: string;
        status?: string;
        beneficiary?: string;
        remarks?: string;
      }>(req);

      if (!body.familyId || !body.policyNo || !body.insurer) {
        sendJson(res, 400, { success: false, error: 'familyId, policyNo and insurer are required' });
        return true;
      }

      const policy = await createPolicy({
        familyId: body.familyId,
        familyName: body.familyName || '',
        policyNo: body.policyNo.trim(),
        insurer: body.insurer.trim(),
        productName: body.productName || '',
        premium: Number(body.premium) || 0,
        sumAssured: Number(body.sumAssured) || 0,
        effectiveDate: body.effectiveDate || '',
        expiryDate: body.expiryDate || '',
        status: (body.status as 'active' | 'lapsed' | 'terminated' | 'pending') || 'active',
        beneficiary: body.beneficiary || '',
        remarks: body.remarks || '',
      });
      sendJson(res, 200, { success: true, policy });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  if (url.pathname.startsWith('/api/office-tools/policies/') && req.method === 'GET') {
    try {
      const id = Number(url.pathname.slice('/api/office-tools/policies/'.length));
      if (!Number.isFinite(id)) {
        sendJson(res, 400, { success: false, error: 'Invalid policy id' });
        return true;
      }
      const policy = await getPolicy(id);
      if (!policy) {
        sendJson(res, 404, { success: false, error: 'Policy not found' });
        return true;
      }
      sendJson(res, 200, { success: true, policy });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  if (url.pathname.startsWith('/api/office-tools/policies/') && req.method === 'PUT') {
    try {
      const id = Number(url.pathname.slice('/api/office-tools/policies/'.length));
      if (!Number.isFinite(id)) {
        sendJson(res, 400, { success: false, error: 'Invalid policy id' });
        return true;
      }
      const body = await parseJsonBody<Partial<{
        familyName: string;
        policyNo: string;
        insurer: string;
        productName: string;
        premium: number;
        sumAssured: number;
        effectiveDate: string;
        expiryDate: string;
        status: string;
        beneficiary: string;
        remarks: string;
      }>>(req);

      const patch: Partial<{ familyName: string; policyNo: string; insurer: string; productName: string; premium: number; sumAssured: number; effectiveDate: string; expiryDate: string; status: 'active' | 'lapsed' | 'terminated' | 'pending'; beneficiary: string; remarks: string; familyId: string; updatedAt: string }> = {};
      if (body.familyName !== undefined) patch.familyName = body.familyName;
      if (body.policyNo !== undefined) patch.policyNo = body.policyNo.trim();
      if (body.insurer !== undefined) patch.insurer = body.insurer.trim();
      if (body.productName !== undefined) patch.productName = body.productName;
      if (body.premium !== undefined) patch.premium = Number(body.premium) || 0;
      if (body.sumAssured !== undefined) patch.sumAssured = Number(body.sumAssured) || 0;
      if (body.effectiveDate !== undefined) patch.effectiveDate = body.effectiveDate;
      if (body.expiryDate !== undefined) patch.expiryDate = body.expiryDate;
      if (body.status !== undefined) patch.status = body.status as 'active' | 'lapsed' | 'terminated' | 'pending';
      if (body.beneficiary !== undefined) patch.beneficiary = body.beneficiary;
      if (body.remarks !== undefined) patch.remarks = body.remarks;

      const policy = await updatePolicy(id, patch);
      if (!policy) {
        sendJson(res, 404, { success: false, error: 'Policy not found' });
        return true;
      }
      sendJson(res, 200, { success: true, policy });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  if (url.pathname.startsWith('/api/office-tools/policies/') && req.method === 'DELETE') {
    try {
      const id = Number(url.pathname.slice('/api/office-tools/policies/'.length));
      if (!Number.isFinite(id)) {
        sendJson(res, 400, { success: false, error: 'Invalid policy id' });
        return true;
      }
      const ok = await deletePolicy(id);
      if (!ok) {
        sendJson(res, 404, { success: false, error: 'Policy not found' });
        return true;
      }
      sendJson(res, 200, { success: true });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  // ── AI Refine ────────────────────────────────────────────────────────────
  if (url.pathname === '/api/office-tools/ai-refine' && req.method === 'POST') {
    try {
      const body = await parseJsonBody<{
        text: string;
        instruction?: string;
        sceneId?: string;
        temperature?: number;
        maxTokens?: number;
      }>(req);
      if (!body.text || typeof body.text !== 'string') {
        sendJson(res, 400, { success: false, error: 'text field is required' });
        return true;
      }
      const result = await refineText({
        text: body.text,
        instruction: body.instruction,
        sceneId: body.sceneId,
        temperature: body.temperature,
        maxTokens: body.maxTokens,
      });
      if (!result.success) {
        sendJson(res, 500, { success: false, error: result.error || 'AI refine failed' });
        return true;
      }
      sendJson(res, 200, { success: true, text: result.text, model: result.model, provider: result.provider, latencyMs: result.latencyMs });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  // ── Document Sessions ────────────────────────────────────────────────────
  if (url.pathname === '/api/office-tools/document-sessions' && req.method === 'GET') {
    try {
      const sessions = await listSessions();
      sendJson(res, 200, { success: true, sessions });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  if (url.pathname === '/api/office-tools/document-sessions' && req.method === 'POST') {
    try {
      const body = await parseJsonBody<{
        name: string;
        sourceType: 'upload' | 'paste';
        originalText: string;
        desensitizedText?: string;
        refinedText?: string;
        sensitiveMap?: Record<string, string>;
        status: string;
        aiInstruction?: string;
        sceneId?: string;
      }>(req);
      if (!body.name || !body.sourceType || !body.originalText) {
        sendJson(res, 400, { success: false, error: 'name, sourceType and originalText are required' });
        return true;
      }
      const session = await createSession({
        name: body.name.trim(),
        sourceType: body.sourceType,
        originalText: body.originalText,
        desensitizedText: body.desensitizedText,
        refinedText: body.refinedText,
        sensitiveMap: body.sensitiveMap,
        status: (body.status as DocumentSession['status']) || 'idle',
        aiInstruction: body.aiInstruction,
        sceneId: body.sceneId,
      });
      sendJson(res, 200, { success: true, session });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  if (url.pathname === '/api/office-tools/document-sessions' && req.method === 'DELETE') {
    try {
      await deleteAllSessions();
      sendJson(res, 200, { success: true });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  if (url.pathname.startsWith('/api/office-tools/document-sessions/') && req.method === 'GET') {
    try {
      const id = decodeURIComponent(url.pathname.slice('/api/office-tools/document-sessions/'.length));
      const session = await getSession(id);
      if (!session) {
        sendJson(res, 404, { success: false, error: 'Session not found' });
        return true;
      }
      sendJson(res, 200, { success: true, session });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  if (url.pathname.startsWith('/api/office-tools/document-sessions/') && req.method === 'PUT') {
    try {
      const id = decodeURIComponent(url.pathname.slice('/api/office-tools/document-sessions/'.length));
      const body = await parseJsonBody<Partial<{
        name: string;
        originalText: string;
        desensitizedText: string;
        refinedText: string;
        sensitiveMap: Record<string, string>;
        status: string;
        aiInstruction: string;
        sceneId: string;
      }>>(req);
      const patch: Partial<Omit<DocumentSession, 'id' | 'createdAt'>> = {};
      if (body.name !== undefined) patch.name = body.name.trim();
      if (body.originalText !== undefined) patch.originalText = body.originalText;
      if (body.desensitizedText !== undefined) patch.desensitizedText = body.desensitizedText;
      if (body.refinedText !== undefined) patch.refinedText = body.refinedText;
      if (body.sensitiveMap !== undefined) patch.sensitiveMap = body.sensitiveMap;
      if (body.status !== undefined) patch.status = body.status as DocumentSession['status'];
      if (body.aiInstruction !== undefined) patch.aiInstruction = body.aiInstruction;
      if (body.sceneId !== undefined) patch.sceneId = body.sceneId;
      const session = await updateSession(id, patch);
      if (!session) {
        sendJson(res, 404, { success: false, error: 'Session not found' });
        return true;
      }
      sendJson(res, 200, { success: true, session });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  if (url.pathname.startsWith('/api/office-tools/document-sessions/') && req.method === 'DELETE') {
    try {
      const id = decodeURIComponent(url.pathname.slice('/api/office-tools/document-sessions/'.length));
      const ok = await deleteSession(id);
      if (!ok) {
        sendJson(res, 404, { success: false, error: 'Session not found' });
        return true;
      }
      sendJson(res, 200, { success: true });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  return false;
}
