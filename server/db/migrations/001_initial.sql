CREATE TABLE departments (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE issue_categories (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    department_id BIGINT NOT NULL REFERENCES departments(id),
    sla_hours INTEGER NOT NULL CHECK (sla_hours BETWEEN 1 AND 8760),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE complaints (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ticket_id TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 120),
    description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
    category_id BIGINT NOT NULL REFERENCES issue_categories(id),
    department_id BIGINT NOT NULL REFERENCES departments(id),
    status TEXT NOT NULL DEFAULT 'submitted'
        CHECK (status IN ('submitted', 'assigned', 'in_progress', 'resolution_pending_confirmation', 'closed', 'reopened')),
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    map_x DOUBLE PRECISION,
    map_y DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    due_at TIMESTAMPTZ NOT NULL,
    CHECK (
        (latitude IS NULL AND longitude IS NULL)
        OR (latitude IS NOT NULL AND longitude IS NOT NULL
            AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
    ),
    CHECK (
        (map_x IS NULL AND map_y IS NULL)
        OR (map_x IS NOT NULL AND map_y IS NOT NULL
            AND map_x BETWEEN 0 AND 600 AND map_y BETWEEN 0 AND 380)
    )
);

CREATE TABLE complaint_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    complaint_id BIGINT NOT NULL REFERENCES complaints(id),
    event_type TEXT NOT NULL
        CHECK (event_type IN ('submitted', 'status_changed', 'evidence_uploaded', 'citizen_confirmed', 'reopened', 'escalated', 'note_added')),
    actor_type TEXT NOT NULL DEFAULT 'citizen'
        CHECK (actor_type IN ('citizen', 'officer', 'administrator', 'system')),
    previous_status TEXT,
    new_status TEXT,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX complaints_department_status_idx ON complaints(department_id, status);
CREATE INDEX complaints_due_at_idx ON complaints(due_at) WHERE status NOT IN ('closed');
CREATE INDEX complaints_created_at_idx ON complaints(created_at DESC);
CREATE INDEX complaint_events_history_idx ON complaint_events(complaint_id, created_at, id);

INSERT INTO departments (slug, name) VALUES
    ('roads', 'Roads Department'),
    ('water', 'Water Board'),
    ('power', 'Power Department'),
    ('sanitation', 'Sanitation Department'),
    ('horticulture', 'Horticulture Department'),
    ('general', 'General Services')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO issue_categories (slug, label, department_id, sla_hours) VALUES
    ('roads', 'Roads', (SELECT id FROM departments WHERE slug = 'roads'), 48),
    ('water', 'Water', (SELECT id FROM departments WHERE slug = 'water'), 24),
    ('power', 'Power', (SELECT id FROM departments WHERE slug = 'power'), 24),
    ('garbage', 'Garbage', (SELECT id FROM departments WHERE slug = 'sanitation'), 24),
    ('drain', 'Drainage', (SELECT id FROM departments WHERE slug = 'sanitation'), 24),
    ('parks', 'Parks', (SELECT id FROM departments WHERE slug = 'horticulture'), 72),
    ('lights', 'Street lights', (SELECT id FROM departments WHERE slug = 'power'), 24),
    ('other', 'Other', (SELECT id FROM departments WHERE slug = 'general'), 72)
ON CONFLICT (slug) DO UPDATE
SET label = EXCLUDED.label,
    department_id = EXCLUDED.department_id,
    sla_hours = EXCLUDED.sla_hours;
