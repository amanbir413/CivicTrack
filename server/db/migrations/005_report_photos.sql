ALTER TABLE complaint_media
    DROP CONSTRAINT IF EXISTS complaint_media_media_kind_check;

ALTER TABLE complaint_media
    ADD CONSTRAINT complaint_media_media_kind_check
    CHECK (media_kind IN ('resolution', 'report'));
ALTER TABLE complaint_events
    DROP CONSTRAINT IF EXISTS complaint_events_event_type_check;

ALTER TABLE complaint_events
    ADD CONSTRAINT complaint_events_event_type_check
    CHECK (event_type IN ('submitted', 'status_changed', 'evidence_uploaded', 'report_photo_uploaded',
        'citizen_confirmed', 'reopened', 'escalated', 'note_added'));