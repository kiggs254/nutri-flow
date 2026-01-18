-- Migration: Add articles table for blog/content management
-- Run this in your Supabase SQL Editor

-- Create articles table
CREATE TABLE IF NOT EXISTS public.articles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  content text NOT NULL,
  excerpt text,
  author text,
  image_url text,
  published_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  category text,
  tags text[],
  is_published boolean DEFAULT false NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_articles_published ON public.articles(is_published, published_at) WHERE is_published = true;
CREATE INDEX IF NOT EXISTS idx_articles_category ON public.articles(category) WHERE is_published = true;
CREATE INDEX IF NOT EXISTS idx_articles_user_id ON public.articles(user_id);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_article_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER articles_updated_at
  BEFORE UPDATE ON public.articles
  FOR EACH ROW
  EXECUTE FUNCTION update_article_updated_at();

-- Enable RLS
ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Public can view published articles
CREATE POLICY "Public can view published articles"
  ON public.articles
  FOR SELECT
  TO public
  USING (is_published = true);

-- Authenticated users can manage their own articles
CREATE POLICY "Users can manage their own articles"
  ON public.articles
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Grant permissions
GRANT SELECT ON public.articles TO anon;
GRANT ALL ON public.articles TO authenticated;
