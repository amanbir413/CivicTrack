ALTER TABLE complaints
    ADD COLUMN priority_level TEXT NOT NULL DEFAULT 'normal'
        CHECK (priority_level IN ('critical', 'high', 'normal', 'low')),
    ADD COLUMN priority_reason TEXT NOT NULL DEFAULT 'No clear high-risk signal was found by local rules. Review the report and adjust priority if needed.'
        CHECK (length(priority_reason) BETWEEN 1 AND 500),
    ADD COLUMN priority_source TEXT NOT NULL DEFAULT 'rules'
        CHECK (priority_source IN ('ai', 'rules', 'officer')),
    ADD COLUMN priority_assessed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE complaint_events
    DROP CONSTRAINT IF EXISTS complaint_events_event_type_check;

ALTER TABLE complaint_events
    ADD CONSTRAINT complaint_events_event_type_check
    CHECK (event_type IN ('submitted', 'status_changed', 'evidence_uploaded', 'report_photo_uploaded',
        'citizen_confirmed', 'reopened', 'escalated', 'note_added', 'priority_assessed', 'priority_updated'));

CREATE INDEX complaints_department_priority_due_idx
    ON complaints (department_id, priority_level, due_at);
