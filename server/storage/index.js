const { LocalStorage } = require("./local");
const { S3Storage } = require("./s3");

function createStorage(config = process.env) {
    const driver = String(config.MEDIA_STORAGE_DRIVER || "local").toLowerCase();
    if (driver === "local") return new LocalStorage(config.UPLOAD_DIR);
    if (driver === "s3") return new S3Storage(config);
    throw new Error("MEDIA_STORAGE_DRIVER must be 'local' or 's3'.");
}

module.exports = { createStorage };
