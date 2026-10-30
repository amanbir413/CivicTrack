const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeComplaintInput } = require("./complaints");

test("normalizes a valid report with category and both location formats", () => {
    const result = normalizeComplaintInput({
        title: "Pothole near the park",
        description: "Large pothole on the road.",
        category: " Roads ",
        location: { mapX: 120, mapY: 90, latitude: 30.7, longitude: 76.8 }
    });

    assert.equal(result.error, undefined);
    assert.equal(result.value.category, "roads");
    assert.deepEqual(result.value.location, { mapX: 120, mapY: 90, latitude: 30.7, longitude: 76.8 });
});

test("derives a title from the first description line when title is omitted", () => {
    const result = normalizeComplaintInput({ category: "water", description: "Pipe leaking\nNear the school" });

    assert.equal(result.value.title, "Pipe leaking");
});

test("rejects unknown categories and mismatched coordinate pairs", () => {
    assert.equal(normalizeComplaintInput({ category: "unknown" }).error.field, "category");
    assert.equal(normalizeComplaintInput({
        category: "roads",
        location: { latitude: 30.7 }
    }).error.field, "location");
});

test("rejects out-of-range coordinates and oversized descriptions", () => {
    assert.equal(normalizeComplaintInput({
        category: "roads",
        location: { latitude: 92, longitude: 20 }
    }).error.field, "latitude");
    assert.equal(normalizeComplaintInput({ category: "roads", description: "x".repeat(2001) }).error.field, "description");
});
