import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { Article } from '../types';
import { Calendar, User, ArrowRight, Loader2, FileText, Menu, X } from 'lucide-react';

interface ArticlesLandingProps {
  onLogin: () => void;
}

const ArticlesLanding: React.FC<ArticlesLandingProps> = ({ onLogin }) => {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    fetchArticles();
  }, []);

  const fetchArticles = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('articles')
        .select('*')
        .eq('is_published', true)
        .order('published_at', { ascending: false });

      if (error) throw error;

      if (data) {
        const formattedArticles: Article[] = data.map((a: any) => ({
          id: a.id,
          title: a.title,
          content: a.content,
          excerpt: a.excerpt || a.content.substring(0, 150) + '...',
          author: a.author || 'NutriTherapy Team',
          imageUrl: a.image_url,
          publishedAt: a.published_at || a.created_at,
          createdAt: a.created_at,
          updatedAt: a.updated_at,
          category: a.category,
          tags: a.tags || [],
          isPublished: a.is_published
        }));
        setArticles(formattedArticles);
      }
    } catch (err: any) {
      console.error('Error fetching articles:', err);
      setError(err.message || 'Failed to load articles');
    } finally {
      setLoading(false);
    }
  };

  const handleArticleClick = (articleId: string) => {
    window.location.hash = `/articles/${articleId}`;
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans">
      {/* Navigation */}
      <nav className="fixed w-full z-50 bg-white/80 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 md:h-20 items-center">
            <a href="#home" className="flex items-center gap-2" onClick={() => setMobileMenuOpen(false)}>
              <img src="https://nutritherapy.co.ke/wp-content/uploads/2024/08/Untitled-design-2024-08-28T154953.396.png" alt="NutriTherapy Solutions Logo" className="h-10 md:h-12" />
            </a>
            <div className="hidden md:flex items-center space-x-8">
              <a href="#home" className="text-slate-600 hover:text-[#8C3A36] text-sm font-medium transition-colors">Home</a>
              <a href="#articles" className="text-[#8C3A36] text-sm font-medium transition-colors">Articles</a>
            </div>
            <div className="hidden md:flex items-center space-x-4">
              <button onClick={onLogin} className="text-slate-900 hover:text-[#8C3A36] text-sm font-medium">Log In</button>
              <button onClick={onLogin} className="bg-[#8C3A36] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#7a2f2b] transition-colors shadow-lg shadow-[#8C3A36]/20">Start Free Trial</button>
            </div>
            <button 
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-slate-600 hover:text-[#8C3A36]"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
        
        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-200 bg-white">
            <div className="px-4 py-4 space-y-4">
              <a href="#home" onClick={() => setMobileMenuOpen(false)} className="block text-slate-600 hover:text-[#8C3A36] text-base font-medium py-2">Home</a>
              <a href="#articles" onClick={() => setMobileMenuOpen(false)} className="block text-[#8C3A36] text-base font-medium py-2">Articles</a>
              <div className="pt-4 border-t border-slate-200 space-y-3">
                <button onClick={() => { setMobileMenuOpen(false); onLogin(); }} className="w-full text-left text-slate-900 hover:text-[#8C3A36] text-base font-medium py-2">Log In</button>
                <button onClick={() => { setMobileMenuOpen(false); onLogin(); }} className="w-full bg-[#8C3A36] text-white px-4 py-3 rounded-lg text-base font-medium hover:bg-[#7a2f2b] transition-colors">Start Free Trial</button>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="pt-24 pb-12 md:pt-32 md:pb-20 px-4">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-slate-900 mb-4">
            Nutrition Articles & Insights
          </h1>
          <p className="text-lg sm:text-xl text-slate-600 max-w-2xl mx-auto">
            Expert advice, research, and tips to help you on your nutrition journey
          </p>
        </div>
      </section>

      {/* Articles Grid */}
      <section id="articles" className="py-12 md:py-20 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {loading ? (
            <div className="flex justify-center items-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-[#8C3A36]" />
            </div>
          ) : error ? (
            <div className="text-center py-20">
              <p className="text-red-600">{error}</p>
            </div>
          ) : articles.length === 0 ? (
            <div className="text-center py-20">
              <FileText className="w-16 h-16 mx-auto text-slate-300 mb-4" />
              <p className="text-slate-600 text-lg">No articles available yet.</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
              {articles.map((article) => (
                <article
                  key={article.id}
                  onClick={() => handleArticleClick(article.id)}
                  className="bg-white rounded-xl overflow-hidden shadow-sm border border-slate-200 hover:shadow-lg transition-shadow cursor-pointer group"
                >
                  {article.imageUrl && (
                    <div className="aspect-video overflow-hidden bg-slate-100">
                      <img
                        src={article.imageUrl}
                        alt={article.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    </div>
                  )}
                  <div className="p-6">
                    {article.category && (
                      <span className="inline-block px-3 py-1 bg-[#F9F5F5] text-[#8C3A36] text-xs font-semibold rounded-full mb-3">
                        {article.category}
                      </span>
                    )}
                    <h2 className="text-xl font-bold text-slate-900 mb-2 group-hover:text-[#8C3A36] transition-colors">
                      {article.title}
                    </h2>
                    <p className="text-slate-600 text-sm mb-4 line-clamp-3">
                      {article.excerpt}
                    </p>
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <div className="flex items-center gap-4">
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {article.author}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(article.publishedAt).toLocaleDateString()}
                        </span>
                      </div>
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-slate-400">© {new Date().getFullYear()} NutriTherapy Solutions. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default ArticlesLanding;
