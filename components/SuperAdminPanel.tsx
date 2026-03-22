import React, { useState, useEffect, useCallback } from 'react';
import { fetchAdminMe } from '../services/geminiService';
import KnowledgeHub from './KnowledgeHub';
import { Shield, LogOut, ChevronLeft, Loader2 } from 'lucide-react';

interface SuperAdminPanelProps {
  onLogout: () => void;
}

const SuperAdminPanel: React.FC<SuperAdminPanelProps> = ({ onLogout }) => {
  const [checked, setChecked] = useState(false);
  const [allowed, setAllowed] = useState(false);

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
    void checkAccess();
  }, [checkAccess]);

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
          <span className="font-bold text-sm">Admin</span>
        </div>
        <div className="flex-1 p-4 text-xs text-slate-500">
          Unified knowledge hub: USDA, platform RAG, legacy user docs, admin search.
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

      <KnowledgeHub />
    </div>
  );
};

export default SuperAdminPanel;
