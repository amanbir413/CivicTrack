ALTER TABLE complaints ADD COLUMN closed_at TIMESTAMPTZ;
UPDATE complaints SET closed_at = updated_at WHERE status = 'closed' AND closed_at IS NULL;

CREATE TABLE complaint_media (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    complaint_id BIGINT NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
    uploader_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    object_key TEXT NOT NULL UNIQUE,
    original_name TEXT NOT NULL CHECK (length(original_name) BETWEEN 1 AND 255),
    mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
    byte_size INTEGER NOT NULL CHECK (byte_size BETWEEN 1 AND 5242880),
    media_kind TEXT NOT NULL DEFAULT 'resolution' CHECK (media_kind = 'resolution'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX complaint_media_complaint_idx ON complaint_media(complaint_id, created_at);
CREATE INDEX complaints_due_open_idx ON complaints(due_at) WHERE status <> 'closed';
CREATE UNIQUE INDEX complaint_events_one_escalation_idx ON complaint_events(complaint_id)
    WHERE event_type = 'escalated';
