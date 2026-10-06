CREATE TABLE IF NOT EXISTS threat_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source_ip TEXT,
    sender_email TEXT,
    recipient TEXT,
    subject TEXT,
    verdict TEXT CHECK (verdict IN ('allow', 'quarantine', 'block')),
    threat_score NUMERIC,
    threat_type TEXT,
    indicators JSONB DEFAULT '[]'::jsonb,
    raw_headers JSONB DEFAULT '{}'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS threat_events_timestamp_idx ON threat_events(timestamp DESC);
CREATE INDEX IF NOT EXISTS threat_events_verdict_idx ON threat_events(verdict);

CREATE TABLE IF NOT EXISTS triage_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID REFERENCES threat_events(id) ON DELETE CASCADE,
    analyst_id TEXT,
    agent_id TEXT,
    action_taken TEXT,
    onyx_dispatch_status TEXT,
    dispatch_payload JSONB DEFAULT '{}'::jsonb,
    resolved_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS triage_actions_event_id_idx ON triage_actions(event_id);

ALTER TABLE threat_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE triage_actions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    DROP POLICY IF EXISTS "Allow read access for authenticated analysts" ON threat_events;
    CREATE POLICY "Allow read access for authenticated analysts" ON threat_events
        FOR SELECT
        TO authenticated
        USING (true);

    DROP POLICY IF EXISTS "Allow service role full access to threat_events" ON threat_events;
    CREATE POLICY "Allow service role full access to threat_events" ON threat_events
        FOR ALL
        TO service_role
        USING (true)
        WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow read access for authenticated analysts on triage_actions" ON triage_actions;
    CREATE POLICY "Allow read access for authenticated analysts on triage_actions" ON triage_actions
        FOR SELECT
        TO authenticated
        USING (true);

    DROP POLICY IF EXISTS "Allow insert for authenticated analysts on triage_actions" ON triage_actions;
    CREATE POLICY "Allow insert for authenticated analysts on triage_actions" ON triage_actions
        FOR INSERT
        TO authenticated
        WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow service role full access to triage_actions" ON triage_actions;
    CREATE POLICY "Allow service role full access to triage_actions" ON triage_actions
        FOR ALL
        TO service_role
        USING (true)
        WITH CHECK (true);
END
$$;
