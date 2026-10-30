CREATE INDEX complaints_nearby_recent_idx ON complaints(category_id, created_at DESC)
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND status <> 'closed';
