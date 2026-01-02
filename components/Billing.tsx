
import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { BillingSettings, Invoice, Client } from '../types';
import { DollarSign, Save, Loader2, Settings, TrendingUp, AlertCircle, Database, RefreshCw, Send, X, CheckCircle } from 'lucide-react';
import { SETUP_SQL } from '../utils/dbSchema';

interface InvoiceWithClient extends Invoice {
  clients: Client | null;
}

const getCurrencySymbol = (currencyCode?: string): string => {
  if (!currencyCode) return '$';
  switch (currencyCode.toUpperCase()) {
    case 'USD': return '$';
    case 'KES': return 'KSh';
    case 'NGN': return '₦';
    case 'GHS': return 'GH₵';
    default: return '$';
  }
};

const Billing: React.FC<{onClientClick: (client: Client) => void}> = ({onClientClick}) => {
  const [settings, setSettings] = useState<Partial<BillingSettings>>({ currency: 'USD' });
  const [invoices, setInvoices] = useState<InvoiceWithClient[]>([]);
  const [stats, setStats] = useState({ total: 0, pending: 0 });
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [loadingInvoices, setLoadingInvoices] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isTableMissing, setIsTableMissing] = useState(false);
  
  const [showActionModal, setShowActionModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceWithClient | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchData = async () => {
    setLoadingSettings(true);
    setLoadingInvoices(true);
    setError(null);
    setIsTableMissing(false);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not found");
      
      const [settingsRes, invoicesRes] = await Promise.all([
        supabase.from('billing_settings').select('*').eq('user_id', user.id).single(),
        supabase.from('invoices').select(`
          *, 
          clients (
              id, name, email, status, goal, 
              lastCheckIn:last_check_in, 
              avatarUrl:avatar_url, 
              joinedAt:created_at, 
              portalAccessToken:portal_access_token, 
              age, gender, weight, height, 
              activityLevel:activity_level, 
              allergies, preferences, 
              medicalHistory:medical_history, 
              medications, habits, 
              bodyFatPercentage:body_fat_percentage, 
              bodyFatMass:body_fat_mass, 
              skeletalMuscleMass:skeletal_muscle_mass, 
              skeletalMusclePercentage:skeletal_muscle_percentage,
              dietaryHistory:dietary_history
          )
        `).order('created_at', { ascending: false })
      ]);

      if (settingsRes.error && settingsRes.error.code !== 'PGRST116') {
        if (settingsRes.error.code === 'PGRST205' || settingsRes.error.message.includes("does not exist")) {
           setIsTableMissing(true);
           return;
        }
        throw settingsRes.error;
      }
      if (settingsRes.data) {
        setSettings(settingsRes.data);
      }
      
      if (invoicesRes.error) {
        throw invoicesRes.error;
      }
      if (invoicesRes.data) {
        const typedInvoices = invoicesRes.data as unknown as InvoiceWithClient[];
        setInvoices(typedInvoices);
        const total = typedInvoices.reduce((acc, inv) => inv.status === 'Paid' ? acc + inv.amount : acc, 0);
        const pending = typedInvoices.reduce((acc, inv) => inv.status === 'Pending' || inv.status === 'Overdue' ? acc + inv.amount : acc, 0);
        setStats({ total, pending });
      }

    } catch (err: any) {
      if (err.code === '42P01' || (err.message && err.message.includes('does not exist'))) {
        setIsTableMissing(true);
      } else {
        setError("Failed to fetch billing data. " + err.message);
      }
    } finally {
      setLoadingSettings(false);
      setLoadingInvoices(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const { error } = await supabase.from('billing_settings').upsert({
        user_id: user.id,
        currency: settings.currency || 'USD',
        paystack_public_key: settings.paystack_public_key || ''
      }, { onConflict: 'user_id' });

      if (error) throw error;
      alert("Settings saved successfully!");
    } catch(err: any) {
      alert("Error saving settings: " + err.message);
    } finally {
      setSaving(false);
    }
  };
  
  const getInvoiceStatusColor = (status: Invoice['status']) => {
     switch(status) { case 'Paid': return 'bg-green-100 text-green-800'; case 'Overdue': return 'bg-red-100 text-red-800'; case 'Processing': return 'bg-blue-100 text-blue-800'; default: return 'bg-amber-100 text-amber-800'; }
  };

  const handleActionClick = (invoice: InvoiceWithClient) => {
    setSelectedInvoice(invoice);
    setShowActionModal(true);
  };
  
  const handleMarkAsPaid = async () => {
    if (!selectedInvoice) return;
    try {
      const { error } = await supabase
        .from('invoices')
        .update({ status: 'Paid', payment_method: 'Manual' })
        .eq('id', selectedInvoice.id);
      if (error) throw error;
      await fetchData();
      setShowActionModal(false);
    } catch(err: any) {
      alert("Failed to update invoice status: " + err.message);
    }
  };

  if (isTableMissing) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-8 border border-red-100 max-w-4xl mx-auto">
        <div className="flex items-center gap-3 text-red-600 mb-4">
          <Database className="w-8 h-8" />
          <h2 className="text-xl font-bold">Database Update Required</h2>
        </div>
        <p className="text-slate-600 mb-6">
          The billing feature requires a database update. Please run the SQL script below in your Supabase SQL Editor to create the necessary tables and enable this page.
        </p>
        <div className="bg-slate-900 text-slate-300 p-4 rounded-lg overflow-x-auto text-xs font-mono mb-6 relative group">
          <button 
            onClick={() => navigator.clipboard.writeText(SETUP_SQL)}
            className="absolute top-2 right-2 bg-slate-700 hover:bg-slate-600 text-white px-3 py-1 rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity"
          >
            Copy SQL
          </button>
          <pre>{SETUP_SQL}</pre>
        </div>
        <button onClick={fetchData} className="bg-[#8C3A36] text-white px-6 py-2 rounded-lg font-bold hover:bg-[#7a2f2b] flex items-center gap-2">
          <RefreshCw className="w-4 h-4" /> I've Run the SQL, Refresh
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
       <h1 className="text-2xl font-bold text-slate-900">Billing & Payments</h1>
      
      {error && <div className="bg-red-50 text-red-700 p-4 rounded-lg flex items-center gap-3"><AlertCircle />{error}</div>}
      
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
           <h3 className="text-slate-500 text-sm font-medium mb-1 flex items-center gap-2"><TrendingUp className="w-4 h-4" /> Total Revenue (Paid)</h3>
           <div className="text-3xl font-bold text-slate-900">{getCurrencySymbol(settings.currency)}{stats.total.toFixed(2)}</div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
           <h3 className="text-slate-500 text-sm font-medium mb-1 flex items-center gap-2"><AlertCircle className="w-4 h-4" /> Outstanding Amount</h3>
           <div className="text-3xl font-bold text-slate-900">{getCurrencySymbol(settings.currency)}{stats.pending.toFixed(2)}</div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2"><Settings className="w-5 h-5 text-[#8C3A36]"/> Billing Settings</h2>
          {loadingSettings ? <Loader2 className="animate-spin" /> : (
            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Currency</label>
                <select 
                  value={settings.currency}
                  onChange={e => setSettings({...settings, currency: e.target.value as any})}
                  className="w-full p-2 border border-slate-300 rounded-lg text-sm"
                >
                  <option value="USD">USD</option>
                  <option value="KES">KES</option>
                  <option value="NGN">NGN</option>
                  <option value="GHS">GHS</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Paystack Public Key</label>
                <input 
                  type="text"
                  placeholder="pk_live_..."
                  value={settings.paystack_public_key || ''}
                  onChange={e => setSettings({...settings, paystack_public_key: e.target.value})}
                  className="w-full p-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <p className="text-xs text-slate-500">
                Your API keys are stored securely. Only your Public Key is used in the client portal.
              </p>
              <button 
                type="submit" 
                disabled={saving}
                className="w-full bg-slate-900 text-white font-bold py-2.5 rounded-lg hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin"/> : <><Save className="w-4 h-4"/> Save Settings</>}
              </button>
            </form>
          )}
        </div>

        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200">
          <h2 className="text-lg font-bold text-slate-800 p-6 border-b">Recent Invoices</h2>
          {loadingInvoices ? <div className="p-6"><Loader2 className="animate-spin" /></div> : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-6 py-3">Client</th>
                    <th className="px-6 py-3">Amount</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Date</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoices.map(inv => (
                    <tr key={inv.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4 font-medium text-slate-800">
                        {inv.clients ? (
                           <button onClick={() => onClientClick(inv.clients as Client)} className="hover:underline text-[#8C3A36]">{inv.clients.name}</button>
                        ) : 'Unknown Client'}
                      </td>
                      <td className="px-6 py-4">{getCurrencySymbol(inv.currency)}{inv.amount.toFixed(2)}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getInvoiceStatusColor(inv.status)}`}>
                          {inv.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-500">{new Date(inv.generatedAt).toLocaleDateString()}</td>
                      <td className="px-6 py-4 text-right">
                        <button onClick={() => handleActionClick(inv)} className="p-2 text-slate-400 hover:text-[#8C3A36] hover:bg-[#F9F5F5] rounded-full transition-colors" title="Send Payment Link">
                           <Send className="w-4 h-4" />
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
      
      {showActionModal && selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
           <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="p-5 flex justify-between items-center border-b bg-slate-50">
                 <h3 className="font-bold text-lg text-slate-800">Invoice Actions</h3>
                 <button onClick={() => setShowActionModal(false)} className="text-slate-500 hover:text-slate-800"><X className="w-5 h-5"/></button>
              </div>
              <div className="p-6 space-y-6">
                 <div>
                    <p><span className="font-semibold text-slate-600">Client:</span> {selectedInvoice.clients?.name}</p>
                    <p><span className="font-semibold text-slate-600">Amount:</span> {getCurrencySymbol(selectedInvoice.currency)}{selectedInvoice.amount.toFixed(2)}</p>
                    <p><span className="font-semibold text-slate-600">Status:</span> <span className={`font-medium ${getInvoiceStatusColor(selectedInvoice.status)} px-1.5 py-0.5 rounded-full text-xs`}>{selectedInvoice.status}</span></p>
                 </div>
                 
                 {selectedInvoice.status !== 'Paid' && (
                  <>
                    <div>
                      <label className="text-xs font-bold uppercase text-slate-600">Client Payment Link</label>
                      <div className="relative mt-1">
                          <input 
                              type="text" 
                              readOnly 
                              value={`${window.location.origin}/#/portal/${selectedInvoice.clients?.portalAccessToken}?tab=billing`} 
                              className="w-full bg-slate-100 border border-slate-200 rounded-lg p-2.5 text-sm pr-20 text-slate-700" 
                          />
                          <button 
                            onClick={() => {
                              navigator.clipboard.writeText(`${window.location.origin}/#/portal/${selectedInvoice.clients?.portalAccessToken}?tab=billing`);
                              setCopied(true);
                              setTimeout(() => setCopied(false), 2000);
                            }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 bg-[#8C3A36] text-white px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#7a2f2b] w-16"
                          >
                           {copied ? <CheckCircle className="w-4 h-4 mx-auto"/> : 'Copy'}
                          </button>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">Share this link with your client to pay online.</p>
                    </div>

                    <button 
                      onClick={handleMarkAsPaid}
                      className="w-full py-2 bg-green-100 text-green-700 border border-green-200 font-bold rounded-lg text-sm hover:bg-green-200 transition-colors"
                    >
                      Mark as Paid Manually
                    </button>
                  </>
                 )}
              </div>
              <div className="p-4 bg-slate-50 border-t flex justify-end">
                 <button onClick={() => setShowActionModal(false)} className="bg-slate-200 text-slate-700 px-4 py-2 rounded-lg font-bold text-sm hover:bg-slate-300">
                    Close
                 </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default Billing;
