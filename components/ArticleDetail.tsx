import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { Article } from '../types';
import { Calendar, User, ArrowLeft, Loader2, Tag, Menu, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface ArticleDetailProps {
  articleId: string;
  onBack: () => void;
  onLogin: () => void;
}

const ArticleDetail: React.FC<ArticleDetailProps> = ({ articleId, onBack, onLogin }) => {
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    fetchArticle();
  }, [articleId]);

  const fetchArticle = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('articles')
        .select('*')
        .eq('id', articleId)
        .eq('is_published', true)
        .single();

      if (error) throw error;

      if (data) {
        const formattedArticle: Article = {
          id: data.id,
          title: data.title,
          content: data.content,
          excerpt: data.excerpt,
          author: data.author || 'NutriTherapy Team',
          imageUrl: data.image_url,
          publishedAt: data.published_at || data.created_at,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
          category: data.category,
          tags: data.tags || [],
          isPublished: data.is_published
        };
        setArticle(formattedArticle);
      }
    } catch (err: any) {
      console.error('Error fetching article:', err);
      setError(err.message || 'Article not found');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#8C3A36]" />
      </div>
    );
  }

  if (error || !article) {
    return (
      <div className="min-h-screen bg-white">
        <nav className="fixed w-full z-50 bg-white/80 backdrop-blur-md border-b border-slate-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16 md:h-20 items-center">
              <button onClick={onBack} className="flex items-center gap-2 text-slate-600 hover:text-[#8C3A36]">
                <ArrowLeft className="w-5 h-5" />
                <span>Back to Articles</span>
              </button>
            </div>
          </div>
        </nav>
        <div className="pt-32 pb-20 px-4 text-center">
          <p className="text-red-600 text-lg">{error || 'Article not found'}</p>
          <button onClick={onBack} className="mt-4 text-[#8C3A36] hover:underline">Go back to articles</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans">
      {/* Navigation */}
      <nav className="fixed w-full z-50 bg-white/80 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 md:h-20 items-center">
            <button onClick={onBack} className="flex items-center gap-2 text-slate-600 hover:text-[#8C3A36] transition-colors">
              <ArrowLeft className="w-5 h-5" />
              <span className="hidden sm:inline">Back to Articles</span>
            </button>
            <div className="hidden md:flex items-center space-x-4">
              <button onClick={onLogin} className="text-slate-900 hover:text-[#8C3A36] text-sm font-medium">Log In</button>
              <button onClick={onLogin} className="bg-[#8C3A36] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#7a2f2b] transition-colors">Start Free Trial</button>
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
        
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-200 bg-white">
            <div className="px-4 py-4 space-y-3">
              <button onClick={() => { setMobileMenuOpen(false); onLogin(); }} className="w-full text-left text-slate-900 hover:text-[#8C3A36] text-base font-medium py-2">Log In</button>
              <button onClick={() => { setMobileMenuOpen(false); onLogin(); }} className="w-full bg-[#8C3A36] text-white px-4 py-3 rounded-lg text-base font-medium hover:bg-[#7a2f2b] transition-colors">Start Free Trial</button>
            </div>
          </div>
        )}
      </nav>

      {/* Article Header */}
      <article className="pt-24 pb-12 md:pt-32 md:pb-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {article.category && (
            <span className="inline-block px-3 py-1 bg-[#F9F5F5] text-[#8C3A36] text-sm font-semibold rounded-full mb-6">
              {article.category}
            </span>
          )}
          
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-slate-900 mb-6">
            {article.title}
          </h1>

          <div className="flex items-center gap-6 text-slate-600 mb-8 pb-8 border-b border-slate-200">
            <span className="flex items-center gap-2">
              <User className="w-4 h-4" />
              {article.author}
            </span>
            <span className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              {new Date(article.publishedAt).toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </span>
          </div>

          {article.imageUrl && (
            <div className="mb-8 rounded-xl overflow-hidden">
              <img
                src={article.imageUrl}
                alt={article.title}
                className="w-full h-auto object-cover"
              />
            </div>
          )}

          {/* Article Content */}
          <div className="prose prose-slate max-w-none">
            <ReactMarkdown className="text-slate-700 leading-relaxed">
              {article.content}
            </ReactMarkdown>
          </div>

          {/* Tags */}
          {article.tags && article.tags.length > 0 && (
            <div className="mt-12 pt-8 border-t border-slate-200">
              <div className="flex items-center gap-2 mb-4">
                <Tag className="w-4 h-4 text-slate-500" />
                <span className="text-sm font-semibold text-slate-700">Tags:</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {article.tags.map((tag, index) => (
                  <span
                    key={index}
                    className="px-3 py-1 bg-slate-100 text-slate-700 text-sm rounded-full"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Back Button */}
          <div className="mt-12 pt-8 border-t border-slate-200">
            <button
              onClick={onBack}
              className="inline-flex items-center gap-2 text-[#8C3A36] hover:text-[#7a2f2b] font-medium transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to All Articles
            </button>
          </div>
        </div>
      </article>

      {/* Footer */}
      <footer className="bg-slate-900 text-white py-12 mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-slate-400">© {new Date().getFullYear()} NutriTherapy Solutions. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default ArticleDetail;
