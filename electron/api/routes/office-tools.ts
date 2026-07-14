import type { IncomingMessage, ServerResponse } from 'http';
import type { HostApiContext } from '../context';
import type { DocumentSession, PolicyRecord } from '../../../src/modules/office-tools/types';
import { sendJson, parseJsonBody } from '../route-utils';
import { importTemplateToCsv } from '../../services/office-tools/csv';
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
  getDashboardStats,
  importPolicies,
  exportPoliciesToCsv,
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
      const stats = await getDashboardStats();
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
      const body = await parseJsonBody<{ name: string; contactInfo?: string; remark?: string }>(req);
      if (!body.name || !body.name.trim()) {
        sendJson(res, 400, { success: false, error: 'Family name is required' });
        return true;
      }
      const family = await createFamily({
        name: body.name.trim(),
        contactInfo: body.contactInfo,
        remark: body.remark,
      });
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
      const body = await parseJsonBody<{ name?: string; contactInfo?: string; remark?: string }>(req);
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

  // GET /policies — list with optional filtering / sorting / pagination
  if (url.pathname === '/api/office-tools/policies' && req.method === 'GET') {
    try {
      const familyId = url.searchParams.get('familyId') ?? undefined;
      const insuranceType = url.searchParams.get('insuranceType') ?? undefined;
      const renewalStatus = url.searchParams.get('renewalStatus') ?? undefined;
      const search = url.searchParams.get('search') ?? undefined;
      const sortBy = url.searchParams.get('sortBy') ?? 'daysToRenewal';
      const sortOrder = url.searchParams.get('sortOrder') === 'desc' ? 'desc' : 'asc';
      const pageNum = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
      const pageSizeNum = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') ?? '20', 10) || 20));

      let policies = await listPolicies();

      // Filtering
      if (familyId) policies = policies.filter((p) => p.familyId === familyId);
      if (insuranceType) policies = policies.filter((p) => p.insuranceType === insuranceType);
      if (renewalStatus) policies = policies.filter((p) => p.renewalStatus === renewalStatus);
      if (search) {
        const kw = search.toLowerCase();
        policies = policies.filter(
          (p) =>
            (p.productName || '').toLowerCase().includes(kw) ||
            (p.policyHolder || '').toLowerCase().includes(kw) ||
            (p.insuredPerson || '').toLowerCase().includes(kw) ||
            (p.insurer || '').toLowerCase().includes(kw),
        );
      }

      // Sorting
      const dir = sortOrder === 'desc' ? -1 : 1;
      policies.sort((a, b) => {
        if (sortBy === 'daysToRenewal') {
          return ((a.daysToRenewal ?? 99999) - (b.daysToRenewal ?? 99999)) * dir;
        }
        if (sortBy === 'premium') {
          return ((a.premium ?? 0) - (b.premium ?? 0)) * dir;
        }
        // productName (default text sort)
        return (a.productName || '').localeCompare(b.productName || '') * dir;
      });

      // Pagination
      const total = policies.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSizeNum));
      const items = policies.slice((pageNum - 1) * pageSizeNum, pageNum * pageSizeNum);

      sendJson(res, 200, {
        success: true,
        items,
        total,
        page: pageNum,
        pageSize: pageSizeNum,
        totalPages,
      });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  // GET /policies/import-template/csv — download empty CSV import template
  if (url.pathname === '/api/office-tools/policies/import-template/csv' && req.method === 'GET') {
    try {
      const csv = importTemplateToCsv();
      const today = new Date().toISOString().split('T')[0];
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="policy_import_template_${today}.csv"`,
      });
      res.end(csv);
    } catch (error) {
      if (!res.headersSent) {
        sendJson(res, 500, { success: false, error: String(error) });
      } else {
        res.end();
      }
    }
    return true;
  }

  // POST /policies/import — bulk import from CSV text
  // (must precede the /policies/:id route so "import" is not treated as an id)
  if (url.pathname === '/api/office-tools/policies/import' && req.method === 'POST') {
    try {
      const body = await parseJsonBody<{ csvText?: unknown; familyId?: unknown }>(req);
      if (
        typeof body.csvText !== 'string' ||
        typeof body.familyId !== 'string' ||
        !body.csvText ||
        !body.familyId
      ) {
        sendJson(res, 400, { success: false, error: 'csvText and familyId are required and must be strings' });
        return true;
      }
      const result = await importPolicies(body.csvText, body.familyId);
      sendJson(res, 200, { success: true, ...result });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  // GET /policies/export/csv — download CSV (optionally filtered by family)
  if (url.pathname === '/api/office-tools/policies/export/csv' && req.method === 'GET') {
    try {
      const familyId = url.searchParams.get('familyId') ?? undefined;
      const csv = await exportPoliciesToCsv(familyId);
      const today = new Date().toISOString().split('T')[0];
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="policies_${today}.csv"`,
      });
      res.end(csv);
    } catch (error) {
      // 响应头已发送（如流式写入中途出错）时无法再回写 JSON，直接终止流
      if (!res.headersSent) {
        sendJson(res, 500, { success: false, error: String(error) });
      } else {
        res.end();
      }
    }
    return true;
  }

  // GET /policies/dashboard/stats — advanced dashboard statistics
  if (url.pathname === '/api/office-tools/policies/dashboard/stats' && req.method === 'GET') {
    try {
      const stats = await getDashboardStats();
      sendJson(res, 200, { success: true, stats });
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
        insuranceType?: string;
        policyHolder?: string;
        insuredPerson?: string;
        relationship?: string;
        paymentAccount?: string;
        purchasePlatform?: string;
        paymentFrequency?: string;
        lastRenewalDate?: string;
        followUpRecord?: string;
        statusTag?: string;
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
        insuranceType: body.insuranceType as PolicyRecord['insuranceType'],
        policyHolder: body.policyHolder || '',
        insuredPerson: body.insuredPerson || '',
        relationship: body.relationship as PolicyRecord['relationship'],
        paymentAccount: body.paymentAccount || '',
        purchasePlatform: body.purchasePlatform || '',
        paymentFrequency: body.paymentFrequency as PolicyRecord['paymentFrequency'],
        lastRenewalDate: body.lastRenewalDate,
        followUpRecord: body.followUpRecord || '',
        statusTag: body.statusTag || '',
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
        insuranceType: string;
        policyHolder: string;
        insuredPerson: string;
        relationship: string;
        paymentAccount: string;
        purchasePlatform: string;
        paymentFrequency: string;
        lastRenewalDate: string;
        followUpRecord: string;
        statusTag: string;
      }>>(req);

      const patch: Partial<Omit<PolicyRecord, 'id' | 'createdAt'>> = {};
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
      if (body.insuranceType !== undefined) patch.insuranceType = body.insuranceType as PolicyRecord['insuranceType'];
      if (body.policyHolder !== undefined) patch.policyHolder = body.policyHolder;
      if (body.insuredPerson !== undefined) patch.insuredPerson = body.insuredPerson;
      if (body.relationship !== undefined) patch.relationship = body.relationship as PolicyRecord['relationship'];
      if (body.paymentAccount !== undefined) patch.paymentAccount = body.paymentAccount;
      if (body.purchasePlatform !== undefined) patch.purchasePlatform = body.purchasePlatform;
      if (body.paymentFrequency !== undefined) patch.paymentFrequency = body.paymentFrequency as PolicyRecord['paymentFrequency'];
      if (body.lastRenewalDate !== undefined) patch.lastRenewalDate = body.lastRenewalDate;
      if (body.followUpRecord !== undefined) patch.followUpRecord = body.followUpRecord;
      if (body.statusTag !== undefined) patch.statusTag = body.statusTag;

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

  // POST /policies/:id/mark-paid — mark the current cycle as paid
  if (url.pathname.startsWith('/api/office-tools/policies/') && url.pathname.endsWith('/mark-paid') && req.method === 'POST') {
    const idStr = url.pathname.slice('/api/office-tools/policies/'.length, -'/mark-paid'.length);
    const id = Number(idStr);
    if (!Number.isFinite(id)) {
      sendJson(res, 400, { success: false, error: 'Invalid policy id' });
      return true;
    }
    try {
      const today = new Date().toISOString();
      const policy = await updatePolicy(id, { lastRenewalDate: today } as Partial<Omit<PolicyRecord, 'id' | 'createdAt'>>);
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
