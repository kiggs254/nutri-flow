import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { Lock, Save, Loader2, User, AlertTriangle, CheckCircle, Brain, Cpu } from 'lucide-react';
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
    const [availableProviders, setAvailableProviders] = useState<AIProvider[]>(['gemini']);
    const [loadingProviders, setLoadingProviders] = useState(true);

    useEffect(() => {
        const fetchUser = async () => {
            setLoading(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                setUserEmail(user.email || '');
            }
            
            // Fetch available providers from backend
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (session?.access_token) {
                    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
                    const response = await fetch(`${backendUrl}/api/ai/providers`, {
                        headers: {
                            'Authorization': `Bearer ${session.access_token}`
                        }
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        const providers = data.providers || ['gemini'];
                        setAvailableProviders(providers);
                        
                        // If current provider is not available, switch to first available
                        const currentProvider = getAIProvider();
                        if (!providers.includes(currentProvider)) {
                            setAIProvider(providers[0] as AIProvider);
                            setSelectedProvider(providers[0] as AIProvider);
                        } else {
                            setSelectedProvider(currentProvider);
                        }
                    }
                }
            } catch (error) {
                console.error('Failed to fetch available providers:', error);
                // Fallback to default
                setSelectedProvider(getAIProvider());
            } finally {
                setLoadingProviders(false);
            }
            
            setLoading(false);
        }
        fetchUser();
    }, []);

    const handleProviderChange = (provider: AIProvider) => {
        setSelectedProvider(provider);
        setAIProvider(provider);
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
        <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6 lg:space-y-8 animate-in fade-in duration-300 w-full overflow-x-hidden px-3 sm:px-0">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Account Settings</h1>
            
            <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-slate-200">
                <h2 className="text-base sm:text-lg font-bold text-slate-800 mb-3 sm:mb-4 flex items-center gap-2"><User className="w-4 h-4 sm:w-5 sm:h-5 text-[#8C3A36]" /> Account Information</h2>
                <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-600 uppercase">Email Address</label>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <input type="email" value={userEmail} readOnly className="w-full flex-grow p-2 border border-slate-200 bg-slate-100 rounded-lg text-xs sm:text-sm text-slate-500 cursor-not-allowed" />
                        <p className="text-xs text-slate-500">To change your email, please contact support.</p>
                    </div>
                </div>
            </div>

            <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-slate-200">
                <h2 className="text-base sm:text-lg font-bold text-slate-800 mb-3 sm:mb-4 flex items-center gap-2"><Cpu className="w-4 h-4 sm:w-5 sm:h-5 text-[#8C3A36]" /> AI Preferences</h2>
                {loadingProviders ? (
                    <div className="flex items-center justify-center p-8">
                        <Loader2 className="w-6 h-6 animate-spin text-[#8C3A36]" />
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
                        {availableProviders.includes('gemini') && (
                            <div 
                                onClick={() => handleProviderChange('gemini')}
                                className={`cursor-pointer p-3 sm:p-4 rounded-xl border-2 transition-all flex items-start gap-2 sm:gap-3 ${selectedProvider === 'gemini' ? 'border-[#8C3A36] bg-[#F9F5F5]' : 'border-slate-200 hover:border-slate-300'}`}
                            >
                                <div className="p-1.5 sm:p-2 bg-white rounded-lg shadow-sm flex-shrink-0">
                                   <Brain className={`w-5 h-5 sm:w-6 sm:h-6 ${selectedProvider === 'gemini' ? 'text-[#8C3A36]' : 'text-slate-400'}`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className={`font-bold text-sm sm:text-base ${selectedProvider === 'gemini' ? 'text-[#8C3A36]' : 'text-slate-700'}`}>Google Gemini</h3>
                                    <p className="text-xs sm:text-sm text-slate-500">Fast, efficient, and multimodal capabilities. The default provider.</p>
                                </div>
                                {selectedProvider === 'gemini' && <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-[#8C3A36] ml-auto flex-shrink-0" />}
                            </div>
                        )}

                        {availableProviders.includes('openai') && (
                            <div 
                                onClick={() => handleProviderChange('openai')}
                                className={`cursor-pointer p-3 sm:p-4 rounded-xl border-2 transition-all flex items-start gap-2 sm:gap-3 ${selectedProvider === 'openai' ? 'border-[#8C3A36] bg-[#F9F5F5]' : 'border-slate-200 hover:border-slate-300'}`}
                            >
                                <div className="p-1.5 sm:p-2 bg-white rounded-lg shadow-sm flex-shrink-0">
                                   <Cpu className={`w-5 h-5 sm:w-6 sm:h-6 ${selectedProvider === 'openai' ? 'text-[#8C3A36]' : 'text-slate-400'}`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className={`font-bold text-sm sm:text-base ${selectedProvider === 'openai' ? 'text-[#8C3A36]' : 'text-slate-700'}`}>OpenAI (GPT-4)</h3>
                                    <p className="text-xs sm:text-sm text-slate-500">High reasoning capabilities. Good for complex meal plans.</p>
                                </div>
                                 {selectedProvider === 'openai' && <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-[#8C3A36] ml-auto flex-shrink-0" />}
                            </div>
                        )}

                        {availableProviders.includes('deepseek') && (
                            <div 
                                onClick={() => handleProviderChange('deepseek')}
                                className={`cursor-pointer p-3 sm:p-4 rounded-xl border-2 transition-all flex items-start gap-2 sm:gap-3 ${selectedProvider === 'deepseek' ? 'border-[#8C3A36] bg-[#F9F5F5]' : 'border-slate-200 hover:border-slate-300'}`}
                            >
                                <div className="p-1.5 sm:p-2 bg-white rounded-lg shadow-sm flex-shrink-0">
                                   <Brain className={`w-5 h-5 sm:w-6 sm:h-6 ${selectedProvider === 'deepseek' ? 'text-[#8C3A36]' : 'text-slate-400'}`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className={`font-bold text-sm sm:text-base ${selectedProvider === 'deepseek' ? 'text-[#8C3A36]' : 'text-slate-700'}`}>DeepSeek</h3>
                                    <p className="text-xs sm:text-sm text-slate-500">Cost-effective AI with strong reasoning. Great alternative to OpenAI.</p>
                                </div>
                                 {selectedProvider === 'deepseek' && <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-[#8C3A36] ml-auto flex-shrink-0" />}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-slate-200">
                <h2 className="text-base sm:text-lg font-bold text-slate-800 mb-3 sm:mb-4 flex items-center gap-2"><Lock className="w-4 h-4 sm:w-5 sm:h-5 text-[#8C3A36]" /> Change Password</h2>
                <form onSubmit={handlePasswordUpdate} className="space-y-3 sm:space-y-4">
                    {passwordError && <div className="text-red-600 bg-red-50 p-2.5 sm:p-3 rounded-lg text-xs sm:text-sm flex items-center gap-2"><AlertTriangle className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" /> {passwordError}</div>}
                    {passwordSuccess && <div className="text-green-600 bg-green-50 p-2.5 sm:p-3 rounded-lg text-xs sm:text-sm flex items-center gap-2"><CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" /> {passwordSuccess}</div>}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-600 uppercase mb-1">New Password</label>
                            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full p-2 text-sm border border-slate-300 rounded-lg" placeholder="••••••••" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Confirm New Password</label>
                            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required className="w-full p-2 text-sm border border-slate-300 rounded-lg" placeholder="••••••••" />
                        </div>
                    </div>
                    <div className="pt-2 flex justify-end">
                        <button type="submit" disabled={passwordSaving} className="w-full sm:w-auto bg-slate-900 text-white font-bold py-2 px-4 sm:px-6 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-slate-800 transition-colors text-sm sm:text-base">
                            {passwordSaving ? <><Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" /> Saving...</> : <><Save className="w-4 h-4 sm:w-5 sm:h-5" /> Save Password</>}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default AccountSettings;