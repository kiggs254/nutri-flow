-- Client notes table for manual notes with optional "include in AI prompt" flag
CREATE TABLE IF NOT EXISTS public.client_notes (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    include_in_ai_prompt boolean DEFAULT false NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_client_notes_client_id ON public.client_notes(client_id);

ALTER TABLE public.client_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_notes FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Nutritionists can manage client notes" ON public.client_notes;
CREATE POLICY "Nutritionists can manage client notes" ON public.client_notes
    FOR ALL TO authenticated
    USING (check_client_owner(client_id))
    WITH CHECK (check_client_owner(client_id));
