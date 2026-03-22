import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  fetchAdminKnowledgeSummary,
  fetchAdminPlatformDocuments,
  fetchAdminKnowledgeDocuments,
  adminUploadPlatformDocument,
  adminUploadPlatformText,
  adminDeletePlatformDocument,
  adminDeleteKnowledgeDocument,
  adminSyncUsda,
  adminStartFullUsdaSync,
  adminGetUsdaSyncStatus,
  type AdminUsdaSyncStatus,
  adminSearchKnowledge
} from '../services/geminiService';
import type { KnowledgeBaseSearchMatch } from '../types';
import { useToast } from '../utils/toast';
import { BookOpen, Trash2, RefreshCw, Database, Upload, Search, Loader2 } from 'lucide-react';

type PlatformDoc = {
  id: string;
  title: string;
  doc_type: string;
  file_name: string | null;
  chunk_count: number;
  created_by: string | null;
  created_at: string;
  ingest_status?: string;
  ingest_error?: string | null;
};

type UserDoc = {
  id: string;
  user_id: string;
  title: string;
  doc_type: string;
  file_name: string | null;
  chunk_count: number;
  created_at: string;
  owner_email: string | null;
};

type UnifiedRow =
  | ({ kind: 'platform' } & PlatformDoc)
  | ({ kind: 'user' } & UserDoc);

const KnowledgeHub: React.FC = () => {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<Record<string, number> | null>(null);
  const [platformDocs, setPlatformDocs] = useState<PlatformDoc[]>([]);
  const [userDocs, setUserDocs] = useState<UserDoc[]>([]);
  const [maxPages, setMaxPages] = useState(3);
  const [syncing, setSyncing] = useState(false);
  const [startingFullSync, setStartingFullSync] = useState(false);
  const [usdaStatus, setUsdaStatus] = useState<AdminUsdaSyncStatus | null>(null);
  const [platformTitle, setPlatformTitle] = useState('Platform guide');
  const [platformText, setPlatformText] = useState('');
  const [uploadingPlat, setUploadingPlat] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<KnowledgeBaseSearchMatch[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const usdaPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadSummary = async () => {
    setLoading(true);
    try {
      const s = await fetchAdminKnowledgeSummary();
      setSummary(s as Record<string, number>);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load stats';
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadPlatform = useCallback(async () => {
    try {
      const p = await fetchAdminPlatformDocuments();
      setPlatformDocs((p.documents || []) as PlatformDoc[]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load platform documents';
      showToast(msg, 'error');
    }
  }, [showToast]);

  const loadUserDocs = useCallback(async () => {
    try {
      const r = await fetchAdminKnowledgeDocuments();
      setUserDocs(r.documents || []);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load user documents';
      showToast(msg, 'error');
    }
  }, [showToast]);

  const loadUsdaStatus = useCallback(async () => {
    try {
      const status = await adminGetUsdaSyncStatus();
      setUsdaStatus(status);
    } catch {
      // keep UI usable even if status route fails
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadSummary(), loadPlatform(), loadUserDocs(), loadUsdaStatus()]);
  }, [loadPlatform, loadUserDocs, loadUsdaStatus]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const needsIngestPoll = platformDocs.some(
    (d) => d.ingest_status === 'pending' || d.ingest_status === 'processing'
  );

  useEffect(() => {
    if (!needsIngestPoll) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    pollRef.current = setInterval(() => {
      void loadPlatform();
    }, 2000);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [needsIngestPoll, loadPlatform]);

  useEffect(() => {
    if (!usdaStatus?.running) {
      if (usdaPollRef.current) {
        clearInterval(usdaPollRef.current);
        usdaPollRef.current = null;
      }
      return;
    }
    usdaPollRef.current = setInterval(() => {
      void loadUsdaStatus();
      void loadSummary();
    }, 3000);
    return () => {
      if (usdaPollRef.current) {
        clearInterval(usdaPollRef.current);
        usdaPollRef.current = null;
      }
    };
  }, [usdaStatus?.running, loadUsdaStatus]);

  const unifiedRows = useMemo((): UnifiedRow[] => {
    const plat: UnifiedRow[] = platformDocs.map((d) => ({ kind: 'platform', ...d }));
    const usr: UnifiedRow[] = userDocs.map((d) => ({ kind: 'user', ...d }));
    return [...plat, ...usr].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [platformDocs, userDocs]);

  const handleUsda = async () => {
    setSyncing(true);
    try {
      const result = await adminSyncUsda({ maxPages, pageSize: 40, startPage: 1 });
      const errCount = result.errors?.length ?? 0;
      showToast(
        `USDA: ${result.foodsProcessed} foods${errCount ? `, ${errCount} errors` : ''}`,
        errCount ? 'warning' : 'success',
        8000
      );
      await loadSummary();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'USDA failed';
      showToast(msg, 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handleStartFullUsdaSync = async () => {
    setStartingFullSync(true);
    try {
      await adminStartFullUsdaSync({ pageSize: 200, startPage: 1 });
      showToast('Started USDA full background sync', 'success', 3500);
      await loadUsdaStatus();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not start full USDA sync';
      showToast(msg, 'error');
      await loadUsdaStatus();
    } finally {
      setStartingFullSync(false);
    }
  };

  const handlePlatformPaste = async () => {
    const t = platformText.trim();
    if (!t) {
      showToast('Enter text', 'error');
      return;
    }
    setUploadingPlat(true);
    try {
      await adminUploadPlatformText({ title: platformTitle, docType: 'guide', textContent: t });
      showToast('Document queued — indexing in background', 'success');
      setPlatformText('');
      await loadPlatform();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed';
      showToast(msg, 'error');
    } finally {
      setUploadingPlat(false);
    }
  };

  const handlePlatformFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingPlat(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onloadend = () => {
          const res = r.result as string;
          const b = res?.split(',')[1];
          if (b) resolve(b);
          else reject(new Error('read failed'));
        };
        r.onerror = () => reject(new Error('read failed'));
        r.readAsDataURL(file);
      });
      await adminUploadPlatformDocument({
        title: file.name,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        base64Content: base64
      });
      showToast('Upload queued — indexing in background', 'success');
      await loadPlatform();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      showToast(msg, 'error');
    } finally {
      setUploadingPlat(false);
    }
  };

  const handleDeletePlatformDoc = async (id: string) => {
    if (!confirm('Delete this platform document and its embeddings?')) return;
    try {
      await adminDeletePlatformDocument(id);
      showToast('Removed', 'success');
      await loadPlatform();
      await loadSummary();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed';
      showToast(msg, 'error');
    }
  };

  const handleDeleteUserDoc = async (id: string, title: string) => {
    if (!confirm(`Delete legacy user document "${title}" and its embeddings?`)) return;
    try {
      await adminDeleteKnowledgeDocument(id);
      showToast('Removed', 'success');
      await loadUserDocs();
      await loadSummary();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed';
      showToast(msg, 'error');
    }
  };

  const handleSearch = async () => {
    const q = searchQuery.trim();
    if (!q) return;
    setSearching(true);
    setSearchResults([]);
    try {
      const { matches } = await adminSearchKnowledge(q, 15);
      setSearchResults(matches || []);
      if (!matches?.length) showToast('No matches', 'info');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Search failed';
      showToast(msg, 'error');
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <BookOpen className="w-8 h-8 text-amber-500" />
          Knowledge hub
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Platform uploads feed global RAG for all nutritionists. Per-user documents are legacy — list and delete only. USDA
          sync and admin search use the service role.
        </p>
      </div>

      {loading && !summary ? (
        <Loader2 className="w-8 h-8 animate-spin text-slate-500" />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            ['Foods (DB)', summary?.foodsCount],
            ['Food embeddings', summary?.foodEmbeddingsCount],
            ['Platform docs', summary?.platformDocumentsCount],
            ['Platform emb.', summary?.platformEmbeddingsCount]
          ].map(([k, v]) => (
            <div key={String(k)} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-500 uppercase font-bold leading-tight">{k}</div>
              <div className="text-2xl font-bold text-white mt-1">{v ?? '—'}</div>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => void refreshAll()}
        className="text-sm text-amber-400 hover:underline"
      >
        Refresh stats &amp; lists
      </button>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
        <h2 className="font-bold flex items-center gap-2 text-amber-400">
          <Database className="w-5 h-5" />
          USDA FoodData Central
        </h2>
        <p className="text-slate-400 text-sm">Requires backend service role. Rate-limited.</p>
        <div className="text-xs text-slate-500 bg-slate-950 border border-slate-800 rounded-lg p-3">
          Quick sync is batch-limited by <code>maxPages</code>. Use full background sync to load all USDA pages until exhausted.
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Max pages</label>
            <input
              type="number"
              min={1}
              max={30}
              value={maxPages}
              onChange={(e) => setMaxPages(Number(e.target.value) || 1)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 w-24 text-sm"
            />
          </div>
          <button
            type="button"
            disabled={syncing}
            onClick={() => void handleUsda()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-semibold disabled:opacity-50"
          >
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Run USDA sync
          </button>
          <button
            type="button"
            disabled={startingFullSync || !!usdaStatus?.running}
            onClick={() => void handleStartFullUsdaSync()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 text-white text-sm font-semibold disabled:opacity-50"
          >
            {(startingFullSync || usdaStatus?.running) ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {usdaStatus?.running ? 'USDA full sync running…' : 'Run full USDA sync (all pages)'}
          </button>
        </div>
        <div className="text-xs text-slate-400 space-y-1">
          <div>
            Status:{' '}
            <span className={usdaStatus?.running ? 'text-amber-400' : 'text-slate-300'}>
              {usdaStatus?.message || 'idle'}
            </span>
          </div>
          <div>
            Progress: {usdaStatus?.foodsProcessed ?? 0} foods, {usdaStatus?.pagesProcessed ?? 0} pages
            {usdaStatus?.currentPage ? ` (current page ${usdaStatus.currentPage})` : ''}
          </div>
          {!!(usdaStatus?.errors?.length) && (
            <div className="text-red-400">Recent errors: {usdaStatus?.errors.length}</div>
          )}
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
        <h2 className="font-bold flex items-center gap-2">Platform training (global RAG)</h2>
        <p className="text-slate-400 text-sm">New content must be added here — visible to all nutritionists in meal plans and AI chat.</p>
        <input
          type="text"
          value={platformTitle}
          onChange={(e) => setPlatformTitle(e.target.value)}
          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm"
          placeholder="Title"
        />
        <textarea
          value={platformText}
          onChange={(e) => setPlatformText(e.target.value)}
          rows={5}
          placeholder="Paste training content…"
          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm"
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={uploadingPlat}
            onClick={() => void handlePlatformPaste()}
            className="px-4 py-2 rounded-lg bg-slate-700 text-white text-sm font-medium disabled:opacity-50"
          >
            Queue pasted text
          </button>
          <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-dashed border-slate-600 cursor-pointer text-sm">
            {uploadingPlat ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Upload PDF/DOCX/TXT
            <input
              type="file"
              accept=".pdf,.docx,.txt"
              className="hidden"
              onChange={(ev) => void handlePlatformFile(ev)}
              disabled={uploadingPlat}
            />
          </label>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
        <h2 className="font-bold flex items-center gap-2 text-amber-400/90">
          <Search className="w-5 h-5" />
          Test RAG search (all sources)
        </h2>
        <p className="text-slate-400 text-sm">Food, platform, and every user document chunk — admin RPC.</p>
        <div className="flex gap-2 flex-wrap">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="e.g. high protein breakfast oats"
            className="flex-1 min-w-[200px] bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm"
            onKeyDown={(e) => e.key === 'Enter' && void handleSearch()}
          />
          <button
            type="button"
            disabled={searching}
            onClick={() => void handleSearch()}
            className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-semibold disabled:opacity-50 inline-flex items-center gap-2"
          >
            {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Search
          </button>
        </div>
        {searchResults.length > 0 && (
          <ul className="space-y-3 max-h-96 overflow-y-auto text-sm">
            {searchResults.map((m) => (
              <li key={m.id} className="border border-slate-800 rounded-lg p-3 bg-slate-950/80">
                <div className="text-xs text-slate-500 mb-1">
                  {m.source_type} · similarity {(m.similarity ?? 0).toFixed(3)}
                </div>
                <div className="text-slate-200 whitespace-pre-wrap line-clamp-6">{m.content}</div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
        <h2 className="font-bold">All documents</h2>
        <p className="text-slate-400 text-sm">Platform rows show ingest status. User rows are legacy per-account uploads.</p>
        {unifiedRows.length === 0 ? (
          <p className="text-slate-500 text-sm">No documents yet.</p>
        ) : (
          <div className="overflow-x-auto border border-slate-800 rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 uppercase border-b border-slate-800 bg-slate-950/50">
                  <th className="p-3 w-24">Type</th>
                  <th className="p-3">Title</th>
                  <th className="p-3 hidden md:table-cell">Meta</th>
                  <th className="p-3 w-40">Status</th>
                  <th className="p-3 w-12" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {unifiedRows.map((row) => (
                  <tr key={`${row.kind}-${row.id}`} className="align-top">
                    <td className="p-3">
                      <span
                        className={
                          row.kind === 'platform'
                            ? 'text-amber-400 font-medium'
                            : 'text-slate-400 font-medium'
                        }
                      >
                        {row.kind === 'platform' ? 'Platform' : 'User'}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="font-medium text-white truncate max-w-[200px] md:max-w-md">{row.title}</div>
                      <div className="text-xs text-slate-500 md:hidden mt-1">
                        {row.kind === 'user' && (
                          <>
                            {row.owner_email || row.user_id.slice(0, 8)}… · {row.chunk_count} chunks
                          </>
                        )}
                        {row.kind === 'platform' && (
                          <>
                            {row.ingest_status === 'ready' && <>{row.chunk_count} chunks · </>}
                            {row.ingest_status && row.ingest_status !== 'ready' && (
                              <span className="text-amber-400/90">{row.ingest_status} · </span>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                    <td className="p-3 hidden md:table-cell text-slate-400 text-xs">
                      {row.kind === 'user' && (
                        <div>
                          <div>{row.owner_email || row.user_id}</div>
                          <div>
                            {row.doc_type} · {row.chunk_count} chunks
                          </div>
                          {row.file_name && <div className="truncate max-w-xs">{row.file_name}</div>}
                        </div>
                      )}
                      {row.kind === 'platform' && (
                        <div>
                          <div>{row.doc_type}</div>
                          {row.file_name && <div className="truncate max-w-xs">{row.file_name}</div>}
                        </div>
                      )}
                    </td>
                    <td className="p-3 text-xs text-slate-400">
                      {row.kind === 'platform' && (
                        <>
                          {row.ingest_status === 'ready' && <span>{row.chunk_count} chunks</span>}
                          {row.ingest_status === 'pending' && <span className="text-amber-400">Queued…</span>}
                          {row.ingest_status === 'processing' && <span className="text-amber-400">Indexing…</span>}
                          {row.ingest_status === 'failed' && (
                            <span className="text-red-400" title={row.ingest_error || ''}>
                              Failed
                            </span>
                          )}
                          {!row.ingest_status && <span>—</span>}
                        </>
                      )}
                      {row.kind === 'user' && <span>{row.chunk_count} chunks</span>}
                      <div className="text-slate-600 mt-1">{new Date(row.created_at).toLocaleString()}</div>
                    </td>
                    <td className="p-3">
                      <button
                        type="button"
                        onClick={() =>
                          row.kind === 'platform'
                            ? void handleDeletePlatformDoc(row.id)
                            : void handleDeleteUserDoc(row.id, row.title)
                        }
                        className="p-2 text-red-400 hover:bg-slate-800 rounded-lg"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default KnowledgeHub;
