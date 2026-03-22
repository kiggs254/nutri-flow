import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireSuperAdmin } from '../middleware/superAdmin.js';
import { createServiceSupabase } from '../services/supabaseClients.js';
import { syncUsdaFoods } from '../services/nutritionIngestion.js';
import { extractKnowledgeBaseText } from '../services/knowledgeBaseExtract.js';
import { ingestPlatformDocument, deletePlatformDocumentAndEmbeddings } from '../services/platformIngestion.js';

const router = express.Router();

router.get('/me', authenticate, async (req, res) => {
  try {
    const svc = createServiceSupabase();
    if (!svc || !req.user?.id) {
      return res.json({ isSuperAdmin: false });
    }
    const { data, error } = await svc.from('super_admins').select('user_id').eq('user_id', req.user.id).maybeSingle();
    if (error) {
      console.error('[admin/me]', error);
      return res.json({ isSuperAdmin: false });
    }
    res.json({ isSuperAdmin: !!data });
  } catch (e) {
    res.json({ isSuperAdmin: false });
  }
});

const adminChain = [authenticate, requireSuperAdmin];

router.get('/overview', ...adminChain, async (req, res) => {
  try {
    const s = req.serviceSupabase;

    const [{ count: clientsCount }, { count: mealPlansCount }, { count: foodLogsCount }, { count: userDocsCount }] =
      await Promise.all([
        s.from('clients').select('*', { count: 'exact', head: true }),
        s.from('meal_plans').select('*', { count: 'exact', head: true }),
        s.from('food_logs').select('*', { count: 'exact', head: true }),
        s.from('nutrition_documents').select('*', { count: 'exact', head: true })
      ]);

    const { count: foodsCount } = await s.from('nutrition_foods').select('*', { count: 'exact', head: true });
    const { count: foodEmb } = await s
      .from('nutrition_embeddings')
      .select('*', { count: 'exact', head: true })
      .eq('source_type', 'food');
    const { count: platformEmb } = await s
      .from('nutrition_embeddings')
      .select('*', { count: 'exact', head: true })
      .eq('source_type', 'platform');
    const { count: platformDocs } = await s.from('platform_nutrition_documents').select('*', { count: 'exact', head: true });

    let usersCount = 0;
    try {
      const { data: lu, error: luErr } = await s.auth.admin.listUsers({ page: 1, perPage: 2000 });
      if (!luErr && lu?.users) usersCount = lu.users.length;
    } catch (_) {
      usersCount = 0;
    }

    res.json({
      usersCount,
      clientsCount: clientsCount ?? 0,
      mealPlansCount: mealPlansCount ?? 0,
      foodLogsCount: foodLogsCount ?? 0,
      userKnowledgeDocumentsCount: userDocsCount ?? 0,
      foodsCount: foodsCount ?? 0,
      foodEmbeddingsCount: foodEmb ?? 0,
      platformDocumentsCount: platformDocs ?? 0,
      platformEmbeddingsCount: platformEmb ?? 0
    });
  } catch (error) {
    console.error('[admin/overview]', error);
    res.status(500).json({ error: error.message || 'Overview failed' });
  }
});

router.get('/nutritionists', ...adminChain, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const perPage = Math.min(100, Math.max(10, parseInt(String(req.query.perPage || '50'), 10) || 50));
    const { data, error } = await req.serviceSupabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const list = data?.users || [];
    const users = list.map((u) => ({
      id: u.id,
      email: u.email,
      created_at: u.created_at
    }));
    res.json({ users, page, perPage, count: users.length, hasMore: list.length >= perPage });
  } catch (error) {
    console.error('[admin/nutritionists]', error);
    res.status(500).json({ error: error.message || 'List failed' });
  }
});

router.get('/clients', ...adminChain, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(100, Math.max(10, parseInt(String(req.query.limit || '40'), 10) || 40));
    const offset = (page - 1) * limit;
    const userId = req.query.user_id ? String(req.query.user_id) : null;

    let q = req.serviceSupabase.from('clients').select('*', { count: 'exact' }).order('created_at', { ascending: false });
    if (userId) q = q.eq('user_id', userId);
    q = q.range(offset, offset + limit - 1);

    const { data, error, count } = await q;
    if (error) throw error;
    res.json({ clients: data || [], page, limit, total: count ?? 0 });
  } catch (error) {
    console.error('[admin/clients]', error);
    res.status(500).json({ error: error.message || 'List failed' });
  }
});

router.get('/meal-plans', ...adminChain, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(100, Math.max(10, parseInt(String(req.query.limit || '30'), 10) || 30));
    const offset = (page - 1) * limit;

    const { data, error, count } = await req.serviceSupabase
      .from('meal_plans')
      .select('id, client_id, created_at, day_label, clients(id, name, user_id)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    res.json({ mealPlans: data || [], page, limit, total: count ?? 0 });
  } catch (error) {
    console.error('[admin/meal-plans]', error);
    res.status(500).json({ error: error.message || 'List failed' });
  }
});

router.get('/meal-plans/:id', ...adminChain, async (req, res) => {
  try {
    const { data, error } = await req.serviceSupabase.from('meal_plans').select('*').eq('id', req.params.id).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Not found' });
    res.json({ mealPlan: data });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed' });
  }
});

router.delete('/meal-plans/:id', ...adminChain, async (req, res) => {
  try {
    console.warn('[admin] DELETE meal_plan', req.params.id, 'by', req.user?.id);
    const { error } = await req.serviceSupabase.from('meal_plans').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Delete failed' });
  }
});

router.get('/food-logs', ...adminChain, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(100, Math.max(10, parseInt(String(req.query.limit || '40'), 10) || 40));
    const offset = (page - 1) * limit;

    const { data, error, count } = await req.serviceSupabase
      .from('food_logs')
      .select('id, client_id, created_at, notes, ai_analysis', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    res.json({ foodLogs: data || [], page, limit, total: count ?? 0 });
  } catch (error) {
    res.status(500).json({ error: error.message || 'List failed' });
  }
});

router.get('/knowledge/documents', ...adminChain, async (req, res) => {
  try {
    const { data, error } = await req.serviceSupabase
      .from('nutrition_documents')
      .select('id, user_id, title, doc_type, file_name, chunk_count, created_at')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    res.json({ documents: data || [] });
  } catch (error) {
    res.status(500).json({ error: error.message || 'List failed' });
  }
});

router.delete('/knowledge/documents/:id', ...adminChain, async (req, res) => {
  try {
    const id = req.params.id;
    console.warn('[admin] DELETE nutrition_document', id, 'by', req.user?.id);
    await req.serviceSupabase.from('nutrition_embeddings').delete().eq('source_type', 'document').eq('source_id', id);
    const { error } = await req.serviceSupabase.from('nutrition_documents').delete().eq('id', id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Delete failed' });
  }
});

router.get('/knowledge/platform', ...adminChain, async (req, res) => {
  try {
    const { data, error } = await req.serviceSupabase
      .from('platform_nutrition_documents')
      .select('id, title, doc_type, file_name, chunk_count, created_by, created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ documents: data || [] });
  } catch (error) {
    res.status(500).json({ error: error.message || 'List failed' });
  }
});

router.post('/knowledge/platform/upload', ...adminChain, async (req, res) => {
  try {
    const { title, docType, fileName, mimeType, base64Content, textContent } = req.body || {};
    let contentText = typeof textContent === 'string' ? textContent : '';
    if (!contentText.trim()) {
      if (!base64Content || !mimeType) {
        return res.status(400).json({ error: 'Provide textContent or base64Content + mimeType' });
      }
      contentText = await extractKnowledgeBaseText({
        mimeType,
        fileName: fileName || 'upload',
        base64Content
      });
    }
    const result = await ingestPlatformDocument(req.serviceSupabase, {
      title: title || fileName || 'Platform document',
      contentText,
      docType: docType || 'guide',
      fileName: fileName || null,
      mimeType: mimeType || null,
      createdBy: req.user?.id || null
    });
    res.json(result);
  } catch (error) {
    console.error('[admin/platform upload]', error);
    res.status(500).json({ error: error.message || 'Upload failed' });
  }
});

router.delete('/knowledge/platform/:id', ...adminChain, async (req, res) => {
  try {
    console.warn('[admin] DELETE platform doc', req.params.id, 'by', req.user?.id);
    await deletePlatformDocumentAndEmbeddings(req.serviceSupabase, req.params.id);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Delete failed' });
  }
});

router.post('/knowledge/sync-usda', ...adminChain, async (req, res) => {
  try {
    const { maxPages, pageSize, startPage } = req.body || {};
    const result = await syncUsdaFoods({ maxPages, pageSize, startPage });
    res.json(result);
  } catch (error) {
    console.error('[admin USDA]', error);
    res.status(500).json({ error: error.message || 'USDA sync failed' });
  }
});

export default router;
