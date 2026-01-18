import React, { useState, useEffect } from 'react';
import LandingPage from './components/LandingPage';
import Dashboard from './components/Dashboard';
import Auth from './components/Auth';
// FIX: Changed to named import for ClientPortal.
import { ClientPortal } from './components/ClientPortal';
import ArticlesLanding from './components/ArticlesLanding';
import ArticleDetail from './components/ArticleDetail';
import { supabase } from './services/supabase';
import { Loader2 } from 'lucide-react';
import { ToastProvider } from './utils/toast';

const App: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [path, setPath] = useState(window.location.hash);

  useEffect(() => {
    const onLocationChange = () => {
      setPath(window.location.hash);
    };
    window.addEventListener('hashchange', onLocationChange);
    // Also check on popstate for browser back/forward buttons
    window.addEventListener('popstate', onLocationChange);

    return () => {
      window.removeEventListener('hashchange', onLocationChange);
      window.removeEventListener('popstate', onLocationChange);
    };
  }, []);

  useEffect(() => {
    const checkSession = async () => {
      try {
        // Create a timeout promise to prevent endless loading if Supabase is unreachable
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Session check timed out')), 5000)
        );

        // Race the session check against the timeout
        const { data } = await Promise.race([
          supabase.auth.getSession(),
          timeoutPromise
        ]) as any;

        setSession(data?.session ?? null);
      } catch (err) {
        console.warn("Supabase connection check failed (possibly offline or wrong URL):", err);
        // If it fails/times out, we assume user is logged out so they can see the landing page
        setSession(null);
      } finally {
        setLoading(false);
      }
    };

    checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        setShowAuthModal(false);
        if (window.location.hash && window.location.hash.includes('access_token')) {
          // Clear the hash from URL after Supabase redirect
          window.history.replaceState(null, '', window.location.pathname);
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-[#8C3A36]">
        <Loader2 className="w-10 h-10 animate-spin" />
      </div>
    );
  }

  // Hash will be like #/portal/<portal_access_token>
  const portalPath = path.substring(1); // remove '#'
  if (portalPath.startsWith('/portal/')) {
    const portalToken = portalPath.substring(8); // length of '/portal/'
    if (portalToken) {
      return (
        <ToastProvider>
          <ClientPortal portalToken={portalToken} />
        </ToastProvider>
      );
    }
  }

  // Handle articles routes
  const routePath = path.substring(1); // remove '#'
  if (routePath.startsWith('/articles/')) {
    const articleId = routePath.substring(10); // length of '/articles/'
    if (articleId) {
      return (
        <ToastProvider>
          <ArticleDetail 
            articleId={articleId}
            onBack={() => { window.location.hash = '/articles'; }}
            onLogin={() => setShowAuthModal(true)}
          />
        </ToastProvider>
      );
    }
  }

  if (routePath === '/articles') {
    return (
      <ToastProvider>
        <ArticlesLanding onLogin={() => setShowAuthModal(true)} />
        <Auth isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      {session ? (
        <Dashboard onLogout={handleLogout} />
      ) : (
        <LandingPage onLogin={() => setShowAuthModal(true)} />
      )}
      
      <Auth isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </ToastProvider>
  );
};

export default App;