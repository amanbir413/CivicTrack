const CATEGORIES = new Set([
    "roads",
    "water",
    "power",
    "garbage",
    "drain",
    "parks",
    "lights",
    "other"
]);

const CATEGORY_LABELS = {
    roads: "Roads",
    water: "Water",
    power: "Power",
    garbage: "Garbage",
    drain: "Drainage",
    parks: "Parks",
    lights: "Street lights",
    other: "Other"
};

function validationError(message, field) {
    return { code: "VALIDATION_ERROR", message, field };
}

function readOptionalCoordinate(value, field, min, max) {
    if (value === undefined || value === null || value === "") return { value: null };
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
        return { error: validationError(`${field} must be a number between ${min} and ${max}.`, field) };
    }
    return { value };
}

function normalizeComplaintInput(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return { error: validationError("Request body must be a JSON object.") };
    }

    const category = typeof body.category === "string" ? body.category.trim().toLowerCase() : "";
    if (!CATEGORIES.has(category)) {
        return { error: validationError("Choose a valid complaint category.", "category") };
    }

    const description = typeof body.description === "string" ? body.description.trim() : "";
    if (description.length > 2000) {
        return { error: validationError("Description must be 2,000 characters or fewer.", "description") };
    }

    const submittedTitle = typeof body.title === "string" ? body.title.trim() : "";
    const title = (submittedTitle || description.split(/\r?\n/, 1)[0] || `${CATEGORY_LABELS[category]} issue`).trim();
    if (!title) return { error: validationError("A title is required.", "title") };
    if (title.length > 120) {
        return { error: validationError("Title must be 120 characters or fewer.", "title") };
    }

    const location = body.location === undefined || body.location === null ? {} : body.location;
    if (typeof location !== "object" || Array.isArray(location)) {
        return { error: validationError("Location must be an object.", "location") };
    }

    const latitude = readOptionalCoordinate(location.latitude, "latitude", -90, 90);
    if (latitude.error) return latitude;
    const longitude = readOptionalCoordinate(location.longitude, "longitude", -180, 180);
    if (longitude.error) return longitude;
    if ((latitude.value === null) !== (longitude.value === null)) {
        return { error: validationError("Latitude and longitude must be provided together.", "location") };
    }

    const mapX = readOptionalCoordinate(location.mapX, "mapX", 0, 600);
    if (mapX.error) return mapX;
    const mapY = readOptionalCoordinate(location.mapY, "mapY", 0, 380);
    if (mapY.error) return mapY;
    if ((mapX.value === null) !== (mapY.value === null)) {
        return { error: validationError("Both schematic map coordinates must be provided together.", "location") };
    }

    return {
        value: {
            title,
            description,
            category,
            location: {
                latitude: latitude.value,
                longitude: longitude.value,
                mapX: mapX.value,
                mapY: mapY.value
            }
        }
    };
}

module.exports = { CATEGORY_LABELS, CATEGORIES, normalizeComplaintInput };
