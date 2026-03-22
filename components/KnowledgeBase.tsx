import React, { useState, useEffect, useCallback } from 'react';
import {
  fetchKnowledgeBaseStats,
  fetchKnowledgeDocuments,
  deleteKnowledgeDocument,
  searchKnowledgeBase,
  uploadKnowledgeBaseDocument,
  uploadKnowledgeBaseText
} from '../services/geminiService';
import type { KnowledgeBaseStats, KnowledgeBaseSearchMatch } from '../types';
import { useToast } from '../utils/toast';
import { BookOpen, Upload, Trash2, Search, Loader2 } from 'lucide-react';

const KnowledgeBase: React.FC = () => {
  const { showToast } = useToast();
  const [stats, setStats] = useState<KnowledgeBaseStats | null>(null);
  const [documents, setDocuments] = useState<
    Array<{ id: string; title: string; doc_type: string; file_name: string | null; chunk_count: number; created_at: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<KnowledgeBaseSearchMatch[]>([]);
  const [pasteTitle, setPasteTitle] = useState('Pasted notes');
  const [pasteText, setPasteText] = useState('');

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [s, d] = await Promise.all([fetchKnowledgeBaseStats(), fetchKnowledgeDocuments()]);
      setStats(s);
      setDocuments(d.documents || []);
    } catch (e: any) {
      showToast(e.message || 'Failed to load knowledge base', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          const r = reader.result as string;
          const b = r?.split(',')[1];
          if (b) resolve(b);
          else reject(new Error('Could not read file'));
        };
        reader.onerror = () => reject(new Error('Read failed'));
        reader.readAsDataURL(file);
      });
      const res = await uploadKnowledgeBaseDocument({
        title: file.name,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        base64Content: base64
      });
      showToast(`Indexed ${res.chunksIndexed} chunk(s) from "${file.name}"`, 'success');
      await loadAll();
    } catch (err: any) {
      showToast(err.message || 'Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handlePasteUpload = async () => {
    const t = pasteText.trim();
    if (!t) {
      showToast('Enter text to add to the knowledge base', 'error');
      return;
    }
    setUploading(true);
    try {
      const res = await uploadKnowledgeBaseText({
        title: pasteTitle.trim() || 'Pasted notes',
        docType: 'guide',
        textContent: t
      });
      showToast(`Indexed ${res.chunksIndexed} chunk(s)`, 'success');
      setPasteText('');
      await loadAll();
    } catch (err: any) {
      showToast(err.message || 'Failed to add text', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Remove "${title}" from your knowledge base?`)) return;
    try {
      await deleteKnowledgeDocument(id);
      showToast('Document removed', 'success');
      await loadAll();
    } catch (err: any) {
      showToast(err.message || 'Delete failed', 'error');
    }
  };

  const handleSearch = async () => {
    const q = searchQuery.trim();
    if (!q) return;
    setSearching(true);
    setSearchResults([]);
    try {
      const { matches } = await searchKnowledgeBase(q, 15);
      setSearchResults(matches || []);
      if (!matches?.length) showToast('No matches', 'info');
    } catch (err: any) {
      showToast(err.message || 'Search failed', 'error');
    } finally {
      setSearching(false);
    }
  };

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500 gap-2">
        <Loader2 className="w-6 h-6 animate-spin" />
        Loading knowledge base…
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <BookOpen className="w-7 h-7 text-[#8C3A36]" />
          Nutrition knowledge base
        </h1>
        <p className="text-slate-600 text-sm mt-1">
          Upload your own guides for RAG (retrieval) in meal plans and AI chat. Platform-wide USDA food index and training
          documents are maintained separately by your operator (bookmark the admin URL they provide — it is not linked from this
          app). Run SQL migrations on Supabase if you have not already.
        </p>
      </div>

      {stats && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="text-xs font-bold text-slate-400 uppercase">Foods (USDA/custom)</div>
            <div className="text-2xl font-bold text-slate-900">{stats.foodsCount}</div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="text-xs font-bold text-slate-400 uppercase">Food embeddings</div>
            <div className="text-2xl font-bold text-slate-900">{stats.foodEmbeddingsCount}</div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="text-xs font-bold text-slate-400 uppercase">Your documents</div>
            <div className="text-2xl font-bold text-slate-900">{stats.myDocumentsCount}</div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="text-xs font-bold text-slate-400 uppercase">Your doc chunks</div>
            <div className="text-2xl font-bold text-slate-900">{stats.myDocumentChunksCount}</div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
        <h2 className="font-bold text-slate-900 flex items-center gap-2">
          <Upload className="w-5 h-5 text-[#8FAA41]" />
          Upload documents
        </h2>
        <p className="text-sm text-slate-600">PDF, DOCX, or plain text — chunked and embedded for your account only.</p>
        <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-dashed border-slate-300 cursor-pointer hover:border-[#8FAA41] text-sm font-medium text-slate-700">
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          Choose file
          <input type="file" accept=".pdf,.docx,.txt,text/plain,application/pdf" className="hidden" onChange={handleFileUpload} disabled={uploading} />
        </label>

        <div className="border-t border-slate-100 pt-4 mt-4 space-y-2">
          <label className="block text-xs font-bold text-slate-400 uppercase">Or paste text</label>
          <input
            type="text"
            value={pasteTitle}
            onChange={(e) => setPasteTitle(e.target.value)}
            placeholder="Title"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={5}
            placeholder="Protocols, meal templates, regional foods…"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={uploading}
            onClick={handlePasteUpload}
            className="px-4 py-2 rounded-lg bg-slate-800 text-white text-sm font-semibold hover:bg-slate-900 disabled:opacity-50"
          >
            Add pasted text
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
        <h2 className="font-bold text-slate-900 flex items-center gap-2">
          <Search className="w-5 h-5 text-[#8FAA41]" />
          Test search (RAG)
        </h2>
        <div className="flex gap-2 flex-wrap">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="e.g. high protein breakfast oats"
            className="flex-1 min-w-[200px] border border-slate-300 rounded-lg px-3 py-2 text-sm"
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button
            type="button"
            disabled={searching}
            onClick={handleSearch}
            className="px-4 py-2 rounded-lg bg-[#8FAA41] text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50"
          >
            {searching ? <Loader2 className="w-4 h-4 animate-spin inline" /> : 'Search'}
          </button>
        </div>
        {searchResults.length > 0 && (
          <ul className="space-y-3 max-h-96 overflow-y-auto text-sm">
            {searchResults.map((m) => (
              <li key={m.id} className="border border-slate-100 rounded-lg p-3 bg-slate-50">
                <div className="text-xs text-slate-500 mb-1">
                  {m.source_type} · similarity {(m.similarity ?? 0).toFixed(3)}
                </div>
                <div className="text-slate-800 whitespace-pre-wrap line-clamp-6">{m.content}</div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-bold text-slate-900">Your uploaded documents</h2>
          <button type="button" onClick={loadAll} className="text-sm text-[#8C3A36] font-medium hover:underline">
            Refresh
          </button>
        </div>
        {documents.length === 0 ? (
          <p className="text-slate-500 text-sm">No documents yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {documents.map((d) => (
              <li key={d.id} className="py-3 flex justify-between gap-3 items-start">
                <div className="min-w-0">
                  <div className="font-medium text-slate-900 truncate">{d.title}</div>
                  <div className="text-xs text-slate-500">
                    {d.doc_type} · {d.chunk_count} chunks · {new Date(d.created_at).toLocaleString()}
                  </div>
                  {d.file_name && <div className="text-xs text-slate-400 truncate">{d.file_name}</div>}
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(d.id, d.title)}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default KnowledgeBase;
