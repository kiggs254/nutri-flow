import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchAdminMe,
  fetchAdminKnowledgeSummary,
  fetchAdminPlatformDocuments,
  adminUploadPlatformDocument,
  adminUploadPlatformText,
  adminDeletePlatformDocument,
  adminSyncUsda
} from '../services/geminiService';
import { useToast } from '../utils/toast';
import { Shield, BookOpen, LogOut, Loader2, Trash2, RefreshCw, ChevronLeft, Database, Upload } from 'lucide-react';

interface SuperAdminPanelProps {
  onLogout: () => void;
}

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

const SuperAdminPanel: React.FC<SuperAdminPanelProps> = ({ onLogout }) => {
  const { showToast } = useToast();
  const [checked, setChecked] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<Record<string, number> | null>(null);
  const [platformDocs, setPlatformDocs] = useState<PlatformDoc[]>([]);
  const [maxPages, setMaxPages] = useState(3);
  const [syncing, setSyncing] = useState(false);
  const [platformTitle, setPlatformTitle] = useState('Platform guide');
  const [platformText, setPlatformText] = useState('');
  const [uploadingPlat, setUploadingPlat] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkAccess = useCallback(async () => {
    try {
      const { isSuperAdmin } = await fetchAdminMe();
      setAllowed(!!isSuperAdmin);
    } catch {
      setAllowed(false);
    } finally {
      setChecked(true);
    }
  }, []);

  useEffect(() => {
    checkAccess();
  }, [checkAccess]);

  const loadSummary = async () => {
    setLoading(true);
    try {
      const s = await fetchAdminKnowledgeSummary();
      setSummary(s as Record<string, number>);
    } catch (e: any) {
      showToast(e.message || 'Failed to load stats', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadPlatform = useCallback(async () => {
    try {
      const p = await fetchAdminPlatformDocuments();
      setPlatformDocs((p.documents || []) as PlatformDoc[]);
    } catch (e: any) {
      showToast(e.message || 'Failed to load documents', 'error');
    }
  }, [showToast]);

  useEffect(() => {
    if (!allowed) return;
    loadSummary();
    loadPlatform();
  }, [allowed, loadPlatform]);

  const needsIngestPoll = platformDocs.some(
    (d) => d.ingest_status === 'pending' || d.ingest_status === 'processing'
  );

  useEffect(() => {
    if (!allowed || !needsIngestPoll) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    pollRef.current = setInterval(() => {
      loadPlatform();
    }, 2000);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [allowed, needsIngestPoll, loadPlatform]);

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
      loadSummary();
    } catch (e: any) {
      showToast(e.message || 'USDA failed', 'error');
    } finally {
      setSyncing(false);
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
    } catch (e: any) {
      showToast(e.message || 'Failed', 'error');
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
    } catch (err: any) {
      showToast(err.message || 'Upload failed', 'error');
    } finally {
      setUploadingPlat(false);
    }
  };

  const handleDeletePlatformDoc = async (id: string) => {
    if (!confirm('Delete this platform document and its embeddings?')) return;
    try {
      await adminDeletePlatformDocument(id);
      showToast('Removed', 'success');
      loadPlatform();
      loadSummary();
    } catch (e: any) {
      showToast(e.message || 'Failed', 'error');
    }
  };

  if (!checked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white gap-2">
        <Loader2 className="w-8 h-8 animate-spin" />
        Checking access…
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-white p-6">
        <Shield className="w-16 h-16 text-amber-500 mb-4" />
        <h1 className="text-xl font-bold">Access denied</h1>
        <p className="text-slate-400 text-center mt-2 max-w-md">
          This area is for platform super admins only. Ask your administrator to add your user ID to{' '}
          <code className="text-xs bg-slate-800 px-1 rounded">super_admins</code> in Supabase.
        </p>
        <div className="flex gap-3 mt-8">
          <a
            href="#/"
            className="px-4 py-2 rounded-lg bg-[#8C3A36] text-white font-medium"
            onClick={() => {
              window.location.hash = '';
            }}
          >
            Back to app
          </a>
          <button type="button" onClick={onLogout} className="px-4 py-2 rounded-lg border border-slate-600 text-slate-300">
            Log out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex font-sans">
      <aside className="w-56 border-r border-slate-800 flex flex-col shrink-0">
        <div className="p-4 border-b border-slate-800 flex items-center gap-2">
          <Shield className="w-6 h-6 text-amber-500" />
          <span className="font-bold text-sm">Platform KB</span>
        </div>
        <div className="flex-1 p-4 text-xs text-slate-500">
          Manage global RAG: USDA foods, platform training documents.
        </div>
        <div className="p-2 border-t border-slate-800 space-y-1">
          <a
            href="#/"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-400 hover:bg-slate-800 hover:text-white"
            onClick={() => {
              window.location.hash = '';
            }}
          >
            <ChevronLeft className="w-4 h-4" />
            Main app
          </a>
          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-400 hover:bg-slate-800 hover:text-red-400"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <BookOpen className="w-8 h-8 text-amber-500" />
            Platform knowledge base
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Documents are chunked and embedded in the background after upload. USDA sync runs on the server (may take several
            minutes).
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
              ['Platform embeddings', summary?.platformEmbeddingsCount]
            ].map(([k, v]) => (
              <div key={String(k)} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <div className="text-xs text-slate-500 uppercase font-bold">{k}</div>
                <div className="text-2xl font-bold text-white mt-1">{v ?? '—'}</div>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            loadSummary();
            loadPlatform();
          }}
          className="text-sm text-amber-400 hover:underline"
        >
          Refresh stats &amp; list
        </button>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
          <h2 className="font-bold flex items-center gap-2 text-amber-400">
            <Database className="w-5 h-5" />
            USDA FoodData Central
          </h2>
          <p className="text-slate-400 text-sm">Requires backend service role. Rate-limited.</p>
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
              onClick={handleUsda}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-semibold disabled:opacity-50"
            >
              {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Run USDA sync
            </button>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
          <h2 className="font-bold flex items-center gap-2">Platform training documents (global RAG)</h2>
          <p className="text-slate-400 text-sm">Visible to all nutritionists in meal plans and AI chat.</p>
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
              onClick={handlePlatformPaste}
              className="px-4 py-2 rounded-lg bg-slate-700 text-white text-sm font-medium disabled:opacity-50"
            >
              Queue pasted text
            </button>
            <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-dashed border-slate-600 cursor-pointer text-sm">
              {uploadingPlat ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Upload PDF/DOCX/TXT
              <input type="file" accept=".pdf,.docx,.txt" className="hidden" onChange={handlePlatformFile} disabled={uploadingPlat} />
            </label>
          </div>

          <ul className="divide-y divide-slate-800 border border-slate-800 rounded-lg">
            {platformDocs.map((d) => (
              <li key={d.id} className="p-3 flex justify-between gap-2 items-start">
                <div className="min-w-0">
                  <div className="font-medium truncate">{d.title}</div>
                  <div className="text-xs text-slate-500">
                    {d.ingest_status === 'ready' && <>{d.chunk_count} chunks · </>}
                    {d.ingest_status && d.ingest_status !== 'ready' && (
                      <span className="text-amber-400/90">
                        {d.ingest_status === 'pending' && 'Queued… '}
                        {d.ingest_status === 'processing' && 'Indexing… '}
                        {d.ingest_status === 'failed' && 'Failed — '}
                      </span>
                    )}
                    {new Date(d.created_at).toLocaleString()}
                  </div>
                  {d.ingest_status === 'failed' && d.ingest_error && (
                    <div className="text-xs text-red-400 mt-1 break-words">{d.ingest_error}</div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleDeletePlatformDoc(d.id)}
                  className="p-2 text-red-400 hover:bg-slate-800 rounded-lg shrink-0"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  );
};

export default SuperAdminPanel;
