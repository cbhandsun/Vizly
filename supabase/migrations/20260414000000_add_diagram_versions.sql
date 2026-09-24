-- Add diagram_versions table for storing diagram snapshots
CREATE TABLE IF NOT EXISTS public.diagram_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    diagram_id TEXT NOT NULL,
    snapshot_data JSONB NOT NULL,
    author_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    message TEXT
);

-- Index for fast lookup by diagram_id
CREATE INDEX IF NOT EXISTS diagram_versions_diagram_id_idx ON public.diagram_versions (diagram_id);
-- Index for sorting by created_at
CREATE INDEX IF NOT EXISTS diagram_versions_created_at_idx ON public.diagram_versions (created_at DESC);
