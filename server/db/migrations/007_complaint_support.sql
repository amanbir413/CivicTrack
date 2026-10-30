CREATE TABLE complaint_support (
    complaint_id BIGINT NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (complaint_id, user_id)
);

CREATE INDEX complaint_support_user_idx ON complaint_support(user_id);
