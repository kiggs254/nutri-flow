import React, { useState, useEffect, useCallback } from 'react';
import {
  fetchAdminMe,
  fetchAdminOverview,
  fetchAdminNutritionists,
  fetchAdminClients,
  fetchAdminMealPlans,
  fetchAdminMealPlan,
  adminDeleteMealPlan,
  fetchAdminFoodLogs,
  fetchAdminKnowledgeDocuments,
  adminDeleteKnowledgeDocument,
  fetchAdminPlatformDocuments,
  adminUploadPlatformDocument,
  adminUploadPlatformText,
  adminDeletePlatformDocument,
  adminSyncUsda
} from '../services/geminiService';
import { useToast } from '../utils/toast';
import {
  Shield,
  LayoutDashboard,
  Users,
  UserCircle,
  UtensilsCrossed,
  Apple,
  BookOpen,
  LogOut,
  Loader2,
  Trash2,
  RefreshCw,
  ChevronLeft,
  Database,
  Upload
} from 'lucide-react';

type Section = 'overview' | 'nutritionists' | 'clients' | 'meal_plans' | 'food_logs' | 'knowledge';

interface SuperAdminPanelProps {
  onLogout: () => void;
}

const SuperAdminPanel: React.FC<SuperAdminPanelProps> = ({ onLogout }) => {
  const { showToast } = useToast();
  const [checked, setChecked] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [section, setSection] = useState<Section>('overview');
  const [loading, setLoading] = useState(false);
  const [overview, setOverview] = useState<Record<string, number> | null>(null);
  const [nutritionists, setNutritionists] = useState<Array<{ id: string; email?: string; created_at?: string }>>([]);
  const [nutPage, setNutPage] = useState(1);
  const [nutHasMore, setNutHasMore] = useState(false);
  const [clients, setClients] = useState<any[]>([]);
  const [clPage, setClPage] = useState(1);
  const [clTotal, setClTotal] = useState(0);
  const [filterUserId, setFilterUserId] = useState('');
  const [mealPlans, setMealPlans] = useState<any[]>([]);
  const [mpPage, setMpPage] = useState(1);
  const [mpTotal, setMpTotal] = useState(0);
  const [planDetail, setPlanDetail] = useState<any | null>(null);
  const [foodLogs, setFoodLogs] = useState<any[]>([]);
  const [flPage, setFlPage] = useState(1);
  const [flTotal, setFlTotal] = useState(0);
  const [userDocs, setUserDocs] = useState<any[]>([]);
  const [platformDocs, setPlatformDocs] = useState<any[]>([]);
  const [maxPages, setMaxPages] = useState(3);
  const [syncing, setSyncing] = useState(false);
  const [platformTitle, setPlatformTitle] = useState('Platform guide');
  const [platformText, setPlatformText] = useState('');
  const [uploadingPlat, setUploadingPlat] = useState(false);

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

  const loadOverview = async () => {
    setLoading(true);
    try {
      const o = await fetchAdminOverview();
      setOverview(o);
    } catch (e: any) {
      showToast(e.message || 'Failed to load overview', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!allowed) return;
    if (section === 'overview') loadOverview();
  }, [allowed, section]);

  const loadNutritionists = async (page: number) => {
    setLoading(true);
    try {
      const r = await fetchAdminNutritionists(page, 50);
      setNutritionists(r.users || []);
      setNutPage(page);
      setNutHasMore(!!r.hasMore);
    } catch (e: any) {
      showToast(e.message || 'Failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (allowed && section === 'nutritionists') loadNutritionists(1);
  }, [allowed, section]);

  const loadClients = async (page: number) => {
    setLoading(true);
    try {
      const r = await fetchAdminClients(page, 40, filterUserId.trim() || undefined);
      setClients(r.clients || []);
      setClPage(page);
      setClTotal(r.total ?? 0);
    } catch (e: any) {
      showToast(e.message || 'Failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (allowed && section === 'clients') loadClients(1);
  }, [allowed, section]);

  const loadMealPlans = async (page: number) => {
    setLoading(true);
    try {
      const r = await fetchAdminMealPlans(page, 30);
      setMealPlans(r.mealPlans || []);
      setMpPage(page);
      setMpTotal(r.total ?? 0);
    } catch (e: any) {
      showToast(e.message || 'Failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (allowed && section === 'meal_plans') loadMealPlans(1);
  }, [allowed, section]);

  const loadFoodLogs = async (page: number) => {
    setLoading(true);
    try {
      const r = await fetchAdminFoodLogs(page, 40);
      setFoodLogs(r.foodLogs || []);
      setFlPage(page);
      setFlTotal(r.total ?? 0);
    } catch (e: any) {
      showToast(e.message || 'Failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (allowed && section === 'food_logs') loadFoodLogs(1);
  }, [allowed, section]);

  const loadKnowledge = async () => {
    setLoading(true);
    try {
      const [u, p] = await Promise.all([fetchAdminKnowledgeDocuments(), fetchAdminPlatformDocuments()]);
      setUserDocs(u.documents || []);
      setPlatformDocs(p.documents || []);
    } catch (e: any) {
      showToast(e.message || 'Failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (allowed && section === 'knowledge') loadKnowledge();
  }, [allowed, section]);

  const openPlan = async (id: string) => {
    try {
      const r = await fetchAdminMealPlan(id);
      setPlanDetail(r.mealPlan);
    } catch (e: any) {
      showToast(e.message || 'Failed', 'error');
    }
  };

  const handleDeletePlan = async (id: string) => {
    if (!confirm('Permanently delete this meal plan?')) return;
    try {
      await adminDeleteMealPlan(id);
      showToast('Deleted', 'success');
      setPlanDetail(null);
      loadMealPlans(mpPage);
    } catch (e: any) {
      showToast(e.message || 'Delete failed', 'error');
    }
  };

  const handleDeleteUserDoc = async (id: string) => {
    if (!confirm('Delete this nutritionist document and its embeddings?')) return;
    try {
      await adminDeleteKnowledgeDocument(id);
      showToast('Removed', 'success');
      loadKnowledge();
    } catch (e: any) {
      showToast(e.message || 'Failed', 'error');
    }
  };

  const handleDeletePlatformDoc = async (id: string) => {
    if (!confirm('Delete platform document?')) return;
    try {
      await adminDeletePlatformDocument(id);
      showToast('Removed', 'success');
      loadKnowledge();
    } catch (e: any) {
      showToast(e.message || 'Failed', 'error');
    }
  };

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
      loadOverview();
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
      showToast('Platform document indexed', 'success');
      setPlatformText('');
      loadKnowledge();
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
      showToast('Uploaded', 'success');
      loadKnowledge();
    } catch (err: any) {
      showToast(err.message || 'Upload failed', 'error');
    } finally {
      setUploadingPlat(false);
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

  const nav = [
    { id: 'overview' as Section, label: 'Overview', icon: LayoutDashboard },
    { id: 'nutritionists' as Section, label: 'Nutritionists', icon: Users },
    { id: 'clients' as Section, label: 'All clients', icon: UserCircle },
    { id: 'meal_plans' as Section, label: 'Meal plans', icon: UtensilsCrossed },
    { id: 'food_logs' as Section, label: 'Food logs', icon: Apple },
    { id: 'knowledge' as Section, label: 'Knowledge base', icon: BookOpen }
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex font-sans">
      <aside className="w-56 border-r border-slate-800 flex flex-col shrink-0">
        <div className="p-4 border-b border-slate-800 flex items-center gap-2">
          <Shield className="w-6 h-6 text-amber-500" />
          <span className="font-bold text-sm">Super Admin</span>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {nav.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setSection(item.id);
                setPlanDetail(null);
              }}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                section === item.id ? 'bg-amber-600/20 text-amber-400' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </button>
          ))}
        </nav>
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

      <main className="flex-1 overflow-y-auto p-6 md:p-8">
        {loading && section !== 'overview' && (
          <div className="fixed top-4 right-4 z-50 flex items-center gap-2 bg-slate-800 px-3 py-2 rounded-lg text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading…
          </div>
        )}

        {section === 'overview' && (
          <div className="space-y-6">
            <h1 className="text-2xl font-bold text-white">Platform overview</h1>
            {loading && !overview ? (
              <Loader2 className="w-8 h-8 animate-spin text-slate-500" />
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  ['Auth users (sample)', overview?.usersCount],
                  ['Clients', overview?.clientsCount],
                  ['Meal plans', overview?.mealPlansCount],
                  ['Food logs', overview?.foodLogsCount],
                  ['User KB docs', overview?.userKnowledgeDocumentsCount],
                  ['Foods (DB)', overview?.foodsCount],
                  ['Food embeddings', overview?.foodEmbeddingsCount],
                  ['Platform docs', overview?.platformDocumentsCount]
                ].map(([k, v]) => (
                  <div key={String(k)} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                    <div className="text-xs text-slate-500 uppercase font-bold">{k}</div>
                    <div className="text-2xl font-bold text-white mt-1">{v ?? '—'}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {section === 'nutritionists' && (
          <div className="space-y-4">
            <h1 className="text-2xl font-bold">Nutritionists (auth users)</h1>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={nutPage <= 1}
                onClick={() => loadNutritionists(nutPage - 1)}
                className="px-3 py-1 rounded bg-slate-800 text-sm disabled:opacity-40"
              >
                Prev
              </button>
              <button
                type="button"
                disabled={!nutHasMore}
                onClick={() => loadNutritionists(nutPage + 1)}
                className="px-3 py-1 rounded bg-slate-800 text-sm disabled:opacity-40"
              >
                Next
              </button>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-800/80 text-left text-slate-400">
                  <tr>
                    <th className="p-3">Email</th>
                    <th className="p-3">User ID</th>
                    <th className="p-3">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {nutritionists.map((u) => (
                    <tr key={u.id} className="border-t border-slate-800">
                      <td className="p-3">{u.email || '—'}</td>
                      <td className="p-3 font-mono text-xs text-slate-500 break-all">{u.id}</td>
                      <td className="p-3 text-slate-400">{u.created_at ? new Date(u.created_at).toLocaleString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {section === 'clients' && (
          <div className="space-y-4">
            <h1 className="text-2xl font-bold">All clients</h1>
            <div className="flex flex-wrap gap-2 items-end">
              <input
                type="text"
                placeholder="Filter by nutritionist user_id"
                value={filterUserId}
                onChange={(e) => setFilterUserId(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm flex-1 min-w-[200px]"
              />
              <button type="button" onClick={() => loadClients(1)} className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium">
                Apply
              </button>
            </div>
            <p className="text-slate-500 text-sm">Total: {clTotal}</p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={clPage <= 1}
                onClick={() => loadClients(clPage - 1)}
                className="px-3 py-1 rounded bg-slate-800 text-sm disabled:opacity-40"
              >
                Prev
              </button>
              <button
                type="button"
                disabled={clPage * 40 >= clTotal}
                onClick={() => loadClients(clPage + 1)}
                className="px-3 py-1 rounded bg-slate-800 text-sm disabled:opacity-40"
              >
                Next
              </button>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-slate-800/80 text-left text-slate-400">
                  <tr>
                    <th className="p-2">Name</th>
                    <th className="p-2">Owner user_id</th>
                    <th className="p-2">Goal</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((c: any) => (
                    <tr key={c.id} className="border-t border-slate-800">
                      <td className="p-2 font-medium">{c.name}</td>
                      <td className="p-2 font-mono text-xs text-slate-500">{c.user_id}</td>
                      <td className="p-2 text-slate-400">{c.goal || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {section === 'meal_plans' && (
          <div className="space-y-4">
            <h1 className="text-2xl font-bold">Meal plans</h1>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={mpPage <= 1}
                onClick={() => loadMealPlans(mpPage - 1)}
                className="px-3 py-1 rounded bg-slate-800 text-sm disabled:opacity-40"
              >
                Prev
              </button>
              <button
                type="button"
                disabled={mpPage * 30 >= mpTotal}
                onClick={() => loadMealPlans(mpPage + 1)}
                className="px-3 py-1 rounded bg-slate-800 text-sm disabled:opacity-40"
              >
                Next
              </button>
            </div>
            <p className="text-slate-500 text-sm">Total: {mpTotal}</p>
            <div className="grid lg:grid-cols-2 gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden max-h-[70vh] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-800/80 text-left text-slate-400 sticky top-0">
                    <tr>
                      <th className="p-2">Label</th>
                      <th className="p-2">Client</th>
                      <th className="p-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mealPlans.map((p: any) => (
                      <tr key={p.id} className="border-t border-slate-800">
                        <td className="p-2">{p.day_label || '—'}</td>
                        <td className="p-2 text-slate-400">{p.clients?.name || p.client_id}</td>
                        <td className="p-2">
                          <button type="button" onClick={() => openPlan(p.id)} className="text-amber-400 text-xs hover:underline mr-2">
                            View
                          </button>
                          <button type="button" onClick={() => handleDeletePlan(p.id)} className="text-red-400 text-xs hover:underline">
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 max-h-[70vh] overflow-y-auto">
                {planDetail ? (
                  <>
                    <div className="flex justify-between items-start mb-2">
                      <h2 className="font-bold text-amber-400">Plan JSON</h2>
                      <button type="button" onClick={() => setPlanDetail(null)} className="text-slate-500 text-sm">
                        Close
                      </button>
                    </div>
                    <pre className="text-xs text-slate-300 whitespace-pre-wrap break-words">{JSON.stringify(planDetail.plan_data, null, 2)}</pre>
                  </>
                ) : (
                  <p className="text-slate-500 text-sm">Select a plan to view.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {section === 'food_logs' && (
          <div className="space-y-4">
            <h1 className="text-2xl font-bold">Food logs</h1>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={flPage <= 1}
                onClick={() => loadFoodLogs(flPage - 1)}
                className="px-3 py-1 rounded bg-slate-800 text-sm disabled:opacity-40"
              >
                Prev
              </button>
              <button
                type="button"
                disabled={flPage * 40 >= flTotal}
                onClick={() => loadFoodLogs(flPage + 1)}
                className="px-3 py-1 rounded bg-slate-800 text-sm disabled:opacity-40"
              >
                Next
              </button>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-800/80 text-left text-slate-400">
                  <tr>
                    <th className="p-2">Client</th>
                    <th className="p-2">Notes</th>
                    <th className="p-2">Analysis</th>
                  </tr>
                </thead>
                <tbody>
                  {foodLogs.map((f: any) => (
                    <tr key={f.id} className="border-t border-slate-800 align-top">
                      <td className="p-2 font-mono text-xs">{f.client_id}</td>
                      <td className="p-2 text-slate-400 max-w-[200px] truncate">{f.notes || '—'}</td>
                      <td className="p-2 text-slate-500 text-xs max-w-md line-clamp-3">{f.ai_analysis || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {section === 'knowledge' && (
          <div className="space-y-8">
            <h1 className="text-2xl font-bold">Knowledge base</h1>

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
                <button type="button" onClick={loadOverview} className="text-sm text-slate-400 hover:text-white">
                  Refresh stats
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
                  className="px-4 py-2 rounded-lg bg-slate-700 text-white text-sm font-medium"
                >
                  Index pasted text
                </button>
                <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-dashed border-slate-600 cursor-pointer text-sm">
                  {uploadingPlat ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  Upload PDF/DOCX/TXT
                  <input type="file" accept=".pdf,.docx,.txt" className="hidden" onChange={handlePlatformFile} disabled={uploadingPlat} />
                </label>
              </div>
              <ul className="divide-y divide-slate-800 border border-slate-800 rounded-lg">
                {platformDocs.map((d: any) => (
                  <li key={d.id} className="p-3 flex justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{d.title}</div>
                      <div className="text-xs text-slate-500">
                        {d.chunk_count} chunks · {new Date(d.created_at).toLocaleString()}
                      </div>
                    </div>
                    <button type="button" onClick={() => handleDeletePlatformDoc(d.id)} className="p-2 text-red-400 hover:bg-slate-800 rounded-lg shrink-0">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
              <h2 className="font-bold mb-4">All nutritionist-uploaded documents</h2>
              <button type="button" onClick={loadKnowledge} className="text-sm text-amber-400 mb-4 hover:underline">
                Refresh list
              </button>
              <ul className="divide-y divide-slate-800">
                {userDocs.map((d: any) => (
                  <li key={d.id} className="py-3 flex justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium">{d.title}</div>
                      <div className="text-xs text-slate-500 font-mono break-all">owner: {d.user_id}</div>
                      <div className="text-xs text-slate-500">
                        {d.chunk_count} chunks · {new Date(d.created_at).toLocaleString()}
                      </div>
                    </div>
                    <button type="button" onClick={() => handleDeleteUserDoc(d.id)} className="p-2 text-red-400 hover:bg-slate-800 rounded-lg shrink-0">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default SuperAdminPanel;
