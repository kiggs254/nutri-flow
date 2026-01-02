import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { Lock, Save, Loader2, User, AlertTriangle, CheckCircle, Brain, Cpu, Key } from 'lucide-react';
import { getAIProvider, setAIProvider, AIProvider } from '../services/geminiService';

const AccountSettings: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [userEmail, setUserEmail] = useState('');
    
    // For password change
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passwordSaving, setPasswordSaving] = useState(false);
    const [passwordError, setPasswordError] = useState('');
    const [passwordSuccess, setPasswordSuccess] = useState('');

    // AI Provider State
    const [selectedProvider, setSelectedProvider] = useState<AIProvider>('gemini');
    const [openAIKey, setOpenAIKey] = useState('');

    useEffect(() => {
        const fetchUser = async () => {
            setLoading(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                setUserEmail(user.email || '');
            }
            setSelectedProvider(getAIProvider());
            const storedKey = localStorage.getItem('nutriflow_openai_key');
            if (storedKey) setOpenAIKey(storedKey);
            setLoading(false);
        }
        fetchUser();
    }, []);

    const handleProviderChange = (provider: AIProvider) => {
        setSelectedProvider(provider);
        setAIProvider(provider);
    };

    const handleKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        setOpenAIKey(newValue);
        localStorage.setItem('nutriflow_openai_key', newValue);
    };

    const handlePasswordUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        setPasswordError('');
        setPasswordSuccess('');

        if (password !== confirmPassword) {
            setPasswordError("Passwords do not match.");
            return;
        }
        if (password.length < 6) {
            setPasswordError("Password must be at least 6 characters long.");
            return;
        }

        setPasswordSaving(true);
        
        const { error } = await supabase.auth.updateUser({ password });
        
        if (error) {
            setPasswordError(error.message);
        } else {
            setPasswordSuccess("Password updated successfully!");
            setPassword('');
            setConfirmPassword('');
        }
        setPasswordSaving(false);
    };

    if (loading) {
        return <div className="flex justify-center items-center p-12"><Loader2 className="w-8 h-8 animate-spin text-[#8C3A36]" /></div>
    }
    
    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-300">
            <h1 className="text-2xl font-bold text-slate-900">Account Settings</h1>
            
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2"><User className="w-5 h-5 text-[#8C3A36]" /> Account Information</h2>
                <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-600 uppercase">Email Address</label>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <input type="email" value={userEmail} readOnly className="w-full flex-grow p-2 border border-slate-200 bg-slate-100 rounded-lg text-sm text-slate-500 cursor-not-allowed" />
                        <p className="text-xs text-slate-500">To change your email, please contact support.</p>
                    </div>
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2"><Cpu className="w-5 h-5 text-[#8C3A36]" /> AI Preferences</h2>
                <div className="grid md:grid-cols-2 gap-4">
                    <div 
                        onClick={() => handleProviderChange('gemini')}
                        className={`cursor-pointer p-4 rounded-xl border-2 transition-all flex items-start gap-3 ${selectedProvider === 'gemini' ? 'border-[#8C3A36] bg-[#F9F5F5]' : 'border-slate-200 hover:border-slate-300'}`}
                    >
                        <div className="p-2 bg-white rounded-lg shadow-sm">
                           <Brain className={`w-6 h-6 ${selectedProvider === 'gemini' ? 'text-[#8C3A36]' : 'text-slate-400'}`} />
                        </div>
                        <div>
                            <h3 className={`font-bold ${selectedProvider === 'gemini' ? 'text-[#8C3A36]' : 'text-slate-700'}`}>Google Gemini</h3>
                            <p className="text-sm text-slate-500">Fast, efficient, and multimodal capabilities. The default provider.</p>
                        </div>
                        {selectedProvider === 'gemini' && <CheckCircle className="w-5 h-5 text-[#8C3A36] ml-auto" />}
                    </div>

                    <div 
                        onClick={() => handleProviderChange('openai')}
                        className={`cursor-pointer p-4 rounded-xl border-2 transition-all flex items-start gap-3 ${selectedProvider === 'openai' ? 'border-[#8C3A36] bg-[#F9F5F5]' : 'border-slate-200 hover:border-slate-300'}`}
                    >
                        <div className="p-2 bg-white rounded-lg shadow-sm">
                           <Cpu className={`w-6 h-6 ${selectedProvider === 'openai' ? 'text-[#8C3A36]' : 'text-slate-400'}`} />
                        </div>
                        <div>
                            <h3 className={`font-bold ${selectedProvider === 'openai' ? 'text-[#8C3A36]' : 'text-slate-700'}`}>OpenAI (GPT-4)</h3>
                            <p className="text-sm text-slate-500">High reasoning capabilities. Good for complex meal plans.</p>
                        </div>
                         {selectedProvider === 'openai' && <CheckCircle className="w-5 h-5 text-[#8C3A36] ml-auto" />}
                    </div>
                </div>

                {selectedProvider === 'openai' && (
                    <div className="mt-6 p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                        <label className="block text-xs font-bold text-slate-600 uppercase">OpenAI API Key</label>
                        <div className="relative">
                            <Key className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input 
                                type="password" 
                                value={openAIKey}
                                onChange={handleKeyChange}
                                placeholder="sk-..."
                                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-[#8C3A36] focus:border-[#8C3A36] outline-none"
                            />
                        </div>
                        <p className="text-xs text-slate-500">Your key is stored securely in your browser's local storage and is never sent to our servers, only directly to OpenAI.</p>
                    </div>
                )}
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2"><Lock className="w-5 h-5 text-[#8C3A36]" /> Change Password</h2>
                <form onSubmit={handlePasswordUpdate} className="space-y-4">
                    {passwordError && <div className="text-red-600 bg-red-50 p-3 rounded-lg text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> {passwordError}</div>}
                    {passwordSuccess && <div className="text-green-600 bg-green-50 p-3 rounded-lg text-sm flex items-center gap-2"><CheckCircle className="w-4 h-4" /> {passwordSuccess}</div>}
                    <div className="grid md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-600 uppercase mb-1">New Password</label>
                            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full p-2 border border-slate-300 rounded-lg" placeholder="••••••••" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Confirm New Password</label>
                            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required className="w-full p-2 border border-slate-300 rounded-lg" placeholder="••••••••" />
                        </div>
                    </div>
                    <div className="pt-2 flex justify-end">
                        <button type="submit" disabled={passwordSaving} className="bg-slate-900 text-white font-bold py-2 px-6 rounded-lg flex items-center gap-2 disabled:opacity-50 hover:bg-slate-800 transition-colors">
                            {passwordSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                            {passwordSaving ? 'Saving...' : 'Save Password'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default AccountSettings;