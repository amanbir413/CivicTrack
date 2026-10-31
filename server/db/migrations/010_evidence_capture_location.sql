ALTER TABLE complaint_media
    ADD COLUMN capture_distance_m DOUBLE PRECISION,
    ADD COLUMN capture_accuracy_m DOUBLE PRECISION,
    ADD CONSTRAINT complaint_media_capture_distance_check
        CHECK (capture_distance_m IS NULL OR capture_distance_m BETWEEN 0 AND 100),
    ADD CONSTRAINT complaint_media_capture_accuracy_check
        CHECK (capture_accuracy_m IS NULL OR capture_accuracy_m BETWEEN 0 AND 100);
