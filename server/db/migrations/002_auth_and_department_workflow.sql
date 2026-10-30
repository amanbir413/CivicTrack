CREATE TABLE users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 80),
    email TEXT NOT NULL UNIQUE CHECK (email = lower(email) AND length(email) <= 254),
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('citizen', 'officer', 'administrator')),
    department_id BIGINT REFERENCES departments(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK ((role = 'officer' AND department_id IS NOT NULL)
        OR (role IN ('citizen', 'administrator') AND department_id IS NULL))
);

ALTER TABLE complaints ADD COLUMN user_id BIGINT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE complaint_events ADD COLUMN actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE issue_categories ADD CONSTRAINT issue_categories_id_department_unique UNIQUE (id, department_id);
ALTER TABLE complaints ADD CONSTRAINT complaints_category_department_fk
    FOREIGN KEY (category_id, department_id) REFERENCES issue_categories(id, department_id);

CREATE INDEX complaints_user_created_idx ON complaints(user_id, created_at DESC);
CREATE INDEX users_department_role_idx ON users(department_id, role);
