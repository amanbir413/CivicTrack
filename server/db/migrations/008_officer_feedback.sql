CREATE TABLE officer_feedback (
    complaint_id BIGINT PRIMARY KEY REFERENCES complaints(id) ON DELETE CASCADE,
    officer_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    citizen_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT NOT NULL DEFAULT '' CHECK (length(comment) <= 500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (officer_id <> citizen_id)
);

CREATE INDEX officer_feedback_officer_created_idx ON officer_feedback(officer_id, created_at DESC);
