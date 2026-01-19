import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { X, Mail, Lock, Loader2, ArrowRight, CheckCircle, AlertTriangle } from 'lucide-react';

interface AuthProps {
  isOpen: boolean;
  onClose: () => void;
}

const Auth: React.FC<AuthProps> = ({ isOpen, onClose }) => {
  const [view, setView] = useState<'login' | 'signup' | 'forgot' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Backend URL helper (mirrors logic in geminiService)
  const getBackendUrl = (): string => {
    // Prefer Vite env in production
    const envUrl = import.meta.env.VITE_BACKEND_URL as string | undefined;
    if (envUrl && envUrl.trim() !== '') {
      return envUrl.trim();
    }
    // Fallback to localhost in development
    console.warn('VITE_BACKEND_URL not set, using default: http://localhost:3000');
    return 'http://localhost:3000';
  };

  // Check for reset token in URL when component mounts or opens
  // MUST be before early return to follow rules of hooks
  useEffect(() => {
    if (isOpen) {
      const urlParams = new URLSearchParams(window.location.search);
      const token = urlParams.get('token');
      const type = urlParams.get('type');
      
      if (token && type === 'recovery') {
        setResetToken(token);
        setView('reset');
        // Don't clean URL - token already extracted, avoid SecurityError
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const resetState = () => {
    setError(null);
    setSuccessMsg(null);
    setPassword('');
    setConfirmPassword('');
    setResetToken(null);
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    resetState();

    // @ts-ignore
    const currentUrl = supabase.supabaseUrl;
    if (!currentUrl || currentUrl.includes('placeholder')) {
      setError('Configuration Missing: Please set your SUPABASE_URL and SUPABASE_ANON_KEY in the environment variables.');
      setLoading(false);
      return;
    }

    try {
      // Create a timeout promise
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request timed out. Please check your connection.')), 10000)
      );

      if (view === 'login') {
        const { error } = await Promise.race([
          supabase.auth.signInWithPassword({ email, password }),
          timeoutPromise
        ]) as any;
        
        if (error) throw error;
        onClose();
      } else { // signup
        const { data, error } = await Promise.race([
          supabase.auth.signUp({ email, password }),
          timeoutPromise
        ]) as any;

        if (error) throw error;
        if (data.user && !data.session) {
           setSuccessMsg('Account created! Please check your email to confirm your registration.');
           setView('login');
        } else {
          onClose();
        }
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    resetState();

    try {
      const backendUrl = getBackendUrl();

      const response = await fetch(`${backendUrl}/api/auth/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message = data.error || data.message || 'Failed to send password reset email.';
        throw new Error(message);
      }

      setSuccessMsg(
        data.message || 'If an account exists with this email, a password reset link has been sent.'
      );
    } catch (err: any) {
      setError(err.message || 'Failed to send password reset email. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    resetState();

    if (!resetToken) {
      setError('Reset token is missing. Please request a new password reset link.');
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      setLoading(false);
      return;
    }

    try {
      const backendUrl = getBackendUrl();
      
      // Step 1: Verify token and get session from backend
      const verifyResponse = await fetch(`${backendUrl}/api/auth/verify-recovery-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: resetToken,
        }),
      });

      const verifyData = await verifyResponse.json().catch(() => ({}));

      if (!verifyResponse.ok) {
        const message = verifyData.error || 'Failed to verify recovery token.';
        throw new Error(message);
      }

      if (!verifyData.session || !verifyData.session.access_token) {
        throw new Error('Invalid session received from server');
      }

      // Step 2: Set the session in Supabase client
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: verifyData.session.access_token,
        refresh_token: verifyData.session.refresh_token || '',
      });

      if (sessionError) {
        throw new Error('Failed to establish session: ' + sessionError.message);
      }

      // Step 3: Update password using the authenticated session
      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      });

      if (updateError) {
        throw new Error('Failed to update password: ' + updateError.message);
      }

      setSuccessMsg('Password has been reset successfully! You can now log in with your new password.');
      setView('login');
      setPassword('');
      setConfirmPassword('');
      
      // Sign out to clear the recovery session
      await supabase.auth.signOut();
    } catch (err: any) {
      console.error('Password reset error:', err);
      setError(err.message || 'Failed to reset password. The link may have expired. Please request a new one.');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="bg-[#8C3A36] p-6 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-white/10 rounded-full blur-2xl" />
          <div className="absolute bottom-0 left-0 -mb-4 -ml-4 w-24 h-24 bg-black/10 rounded-full blur-2xl" />
          <button onClick={onClose} className="absolute top-4 right-4 text-white/80 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
          <h2 className="text-2xl font-bold mb-2">{view === 'login' ? 'Welcome Back' : view === 'signup' ? 'Create Account' : view === 'forgot' ? 'Reset Password' : 'Set New Password'}</h2>
          <p className="text-stone-100 text-sm">{view === 'login' ? 'Sign in to manage your nutrition practice.' : view === 'signup' ? 'Start your 14-day free trial today.' : view === 'forgot' ? 'Enter your email to receive a password reset link.' : 'Enter your new password below.'}</p>
        </div>
        <div className="p-8">
            {error && <div className="p-4 mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg flex gap-3 items-start"><AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" /><div>{error}</div></div>}
            {successMsg && <div className="p-4 mb-4 bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg flex gap-3 items-start"><CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" /><div>{successMsg}</div></div>}
            
            {view === 'forgot' ? (
              <form onSubmit={handleForgotPassword} className="space-y-5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Email</label>
                    <div className="relative">
                      <Mail className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl" placeholder="name@example.com" />
                    </div>
                  </div>
                  <button type="submit" disabled={loading} className="w-full bg-[#8C3A36] text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-2">
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Send Reset Link'}
                  </button>
              </form>
            ) : view === 'reset' ? (
              <form onSubmit={handlePasswordReset} className="space-y-5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">New Password</label>
                    <div className="relative">
                      <Lock className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl" placeholder="••••••••" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Confirm Password</label>
                    <div className="relative">
                      <Lock className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input type="password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl" placeholder="••••••••" />
                    </div>
                  </div>
                  <button type="submit" disabled={loading} className="w-full bg-[#8C3A36] text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-2">
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Reset Password'}
                  </button>
              </form>
            ) : (
              <form onSubmit={handleAuth} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Email</label>
                  <div className="relative">
                    <Mail className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-[#8C3A36] focus:ring-2 focus:ring-[#8C3A36]/20 transition-all" placeholder="name@example.com" />
                  </div>
                </div>
                <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Password</label>
                    <div className="relative">
                      <Lock className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-[#8C3A36] focus:ring-2 focus:ring-[#8C3A36]/20 transition-all" placeholder="••••••••" />
                    </div>
                </div>
                {view === 'login' && (
                    <div className="text-right text-sm">
                        <button type="button" onClick={() => { setView('forgot'); resetState(); }} className="font-semibold text-[#8C3A36] hover:underline">Forgot Password?</button>
                    </div>
                )}
                <button type="submit" disabled={loading} className="w-full bg-[#8C3A36] text-white py-3 rounded-xl font-semibold hover:bg-[#7a2f2b] transition-colors shadow-lg shadow-[#8C3A36]/20 flex items-center justify-center gap-2">
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (<> {view === 'login' ? 'Sign In' : 'Create Account'} <ArrowRight className="w-4 h-4" /> </>)}
                </button>
              </form>
            )}

            <div className="mt-6 text-center text-sm text-slate-500">
                {view === 'login' && (<>Don't have an account? <button onClick={() => { setView('signup'); resetState(); }} className="text-[#8C3A36] font-semibold hover:underline">Sign up</button></>)}
                {view === 'signup' && (<>Already have an account? <button onClick={() => { setView('login'); resetState(); }} className="text-[#8C3A36] font-semibold hover:underline">Log in</button></>)}
                {view === 'forgot' && (<>Remember your password? <button onClick={() => { setView('login'); resetState(); }} className="text-[#8C3A36] font-semibold hover:underline">Back to Login</button></>)}
                {view === 'reset' && (<>Remember your password? <button onClick={() => { setView('login'); resetState(); }} className="text-[#8C3A36] font-semibold hover:underline">Back to Login</button></>)}
            </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;