import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireSuperAdmin } from '../middleware/superAdmin.js';
import { createServiceSupabase } from '../services/supabaseClients.js';
import { syncUsdaFoods } from '../services/nutritionIngestion.js';
import { extractKnowledgeBaseText } from '../services/knowledgeBaseExtract.js';
import {
  createPlatformDocumentPending,
  runPlatformDocumentIngest,
  deletePlatformDocumentAndEmbeddings
} from '../services/platformIngestion.js';
import { embedText } from '../services/embeddingService.js';

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

/** Platform RAG stats only */
router.get('/knowledge/summary', ...adminChain, async (req, res) => {
  try {
    const s = req.serviceSupabase;

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
    const { count: userDocsCount } = await s.from('nutrition_documents').select('*', { count: 'exact', head: true });
    const { count: userDocEmb } = await s
      .from('nutrition_embeddings')
      .select('*', { count: 'exact', head: true })
      .eq('source_type', 'document');

    res.json({
      foodsCount: foodsCount ?? 0,
      foodEmbeddingsCount: foodEmb ?? 0,
      platformDocumentsCount: platformDocs ?? 0,
      platformEmbeddingsCount: platformEmb ?? 0,
      userDocumentsCount: userDocsCount ?? 0,
      userDocumentEmbeddingsCount: userDocEmb ?? 0
    });
  } catch (error) {
    console.error('[admin/knowledge/summary]', error);
    res.status(500).json({ error: error.message || 'Summary failed' });
  }
});

router.get('/knowledge/platform', ...adminChain, async (req, res) => {
  try {
    const { data, error } = await req.serviceSupabase
      .from('platform_nutrition_documents')
      .select('id, title, doc_type, file_name, chunk_count, created_by, created_at, ingest_status, ingest_error')
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

    const { documentId } = await createPlatformDocumentPending(req.serviceSupabase, {
      title: title || fileName || 'Platform document',
      contentText,
      docType: docType || 'guide',
      fileName: fileName || null,
      mimeType: mimeType || null,
      createdBy: req.user?.id || null
    });

    const runBg = () => {
      const svc = createServiceSupabase();
      if (!svc) {
        console.error('[admin/platform upload] no service supabase for background ingest');
        return;
      }
      runPlatformDocumentIngest(svc, documentId).catch((err) => {
        console.error('[admin/platform upload] background ingest', err);
      });
    };
    if (typeof setImmediate !== 'undefined') {
      setImmediate(runBg);
    } else {
      Promise.resolve().then(runBg);
    }

    res.status(202).json({ documentId, ingestStatus: 'pending', accepted: true });
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

/** All per-user nutrition_documents (legacy); list/delete for unified admin hub */
router.get('/knowledge/documents', ...adminChain, async (req, res) => {
  try {
    const s = req.serviceSupabase;
    const { data: docs, error } = await s
      .from('nutrition_documents')
      .select('id, user_id, title, doc_type, file_name, chunk_count, created_at')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    const list = docs || [];
    const userIds = [...new Set(list.map((d) => d.user_id))];
    const emailMap = new Map();
    await Promise.all(
      userIds.map(async (uid) => {
        try {
          const { data: u, error: ue } = await s.auth.admin.getUserById(uid);
          if (!ue && u?.user?.email) emailMap.set(uid, u.user.email);
        } catch (_) {
          /* ignore */
        }
      })
    );
    const documents = list.map((d) => ({
      ...d,
      owner_email: emailMap.get(d.user_id) || null
    }));
    res.json({ documents });
  } catch (error) {
    console.error('[admin/knowledge/documents]', error);
    res.status(500).json({ error: error.message || 'List failed' });
  }
});

router.delete('/knowledge/documents/:id', ...adminChain, async (req, res) => {
  try {
    const id = req.params.id;
    console.warn('[admin] DELETE nutrition_document', id, 'by', req.user?.id);
    const s = req.serviceSupabase;
    await s.from('nutrition_embeddings').delete().eq('source_type', 'document').eq('source_id', id);
    const { error } = await s.from('nutrition_documents').delete().eq('id', id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Delete failed' });
  }
});

/** Super-admin RAG test: food + platform + all user document chunks */
router.post('/knowledge/search', ...adminChain, async (req, res) => {
  try {
    const { query, matchCount } = req.body || {};
    if (!query || String(query).trim() === '') {
      return res.status(400).json({ error: 'query is required' });
    }
    const embedding = await embedText(String(query).slice(0, 8000));
    const s = req.serviceSupabase;
    const mc = Math.min(Math.max(Number(matchCount) || 15, 1), 40);
    const { data, error } = await s.rpc('match_nutrition_embeddings_admin', {
      query_embedding: embedding,
      match_count: mc
    });
    if (error) throw error;
    res.json({ matches: data || [] });
  } catch (error) {
    console.error('[admin/knowledge/search]', error);
    res.status(500).json({ error: error.message || 'Search failed' });
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
