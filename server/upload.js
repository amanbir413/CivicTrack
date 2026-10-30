const path = require("node:path");

const MAX_UPLOAD = 5 * 1024 * 1024;
function validPng(buffer) {
    if (buffer.length < 45 || !buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return false;
    let offset = 8, first = true, ended = false;
    while (offset + 12 <= buffer.length) {
        const length = buffer.readUInt32BE(offset), end = offset + 12 + length;
        if (end > buffer.length) return false;
        const kind = buffer.toString("ascii", offset + 4, offset + 8);
        if (first && (kind !== "IHDR" || length !== 13)) return false;
        first = false;
        if (kind === "IEND") { if (length !== 0) return false; ended = end === buffer.length; break; }
        offset = end;
    }
    return ended;
}
function validWebp(buffer) {
    if (buffer.length < 20 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") return false;
    if (buffer.readUInt32LE(4) !== buffer.length - 8) return false;
    return ["VP8 ", "VP8L", "VP8X"].includes(buffer.toString("ascii", 12, 16)) && buffer.readUInt32LE(16) <= buffer.length - 20;
}
function validJpeg(buffer) {
    if (buffer.length < 12 || buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[buffer.length - 2] !== 0xff || buffer[buffer.length - 1] !== 0xd9) return false;
    return /\xff[\xc0-\xc3\xc5-\xc7\xc9-\xcb\xcd-\xcf]/.test(buffer.toString("latin1", 2, buffer.length - 2));
}
const TYPE_INFO = {
    "image/jpeg": { ext: "jpg", check: validJpeg },
    "image/png": { ext: "png", check: validPng },
    "image/webp": { ext: "webp", check: validWebp }
};

function parseMultipart(req) {
    const type = req.headers["content-type"] || "";
    const boundaryMatch = type.match(/^multipart\/form-data\s*;\s*boundary=(?:"([^"]+)"|([^;]+))/i);
    if (!boundaryMatch) throw Object.assign(new Error("Send one image in multipart form field 'file'."), { statusCode: 400, code: "INVALID_UPLOAD" });
    const boundary = Buffer.from(`--${(boundaryMatch[1] || boundaryMatch[2]).trim()}`);
    const body = req.body;
    if (!Buffer.isBuffer(body)) throw Object.assign(new Error("Upload body is required."), { statusCode: 400, code: "INVALID_UPLOAD" });
    let cursor = body.indexOf(boundary);
    if (cursor < 0) throw Object.assign(new Error("Malformed multipart upload."), { statusCode: 400, code: "INVALID_UPLOAD" });
    cursor += boundary.length + 2;
    const headerEnd = body.indexOf(Buffer.from("\r\n\r\n"), cursor);
    if (headerEnd < 0) throw Object.assign(new Error("Malformed multipart upload."), { statusCode: 400, code: "INVALID_UPLOAD" });
    const headers = body.toString("latin1", cursor, headerEnd);
    const disposition = headers.match(/content-disposition:\s*form-data;([^\r\n]+)/i)?.[1] || "";
    if (!/name="file"/i.test(disposition)) throw Object.assign(new Error("Upload must use multipart form field 'file'."), { statusCode: 400, code: "INVALID_UPLOAD" });
    const filename = disposition.match(/filename="([^"]*)"/i)?.[1];
    const mimeType = headers.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim().toLowerCase();
    if (!filename || !mimeType) throw Object.assign(new Error("Select an image file."), { statusCode: 400, code: "INVALID_UPLOAD" });
    const dataStart = headerEnd + 4;
    const nextBoundary = body.indexOf(Buffer.concat([Buffer.from("\r\n"), boundary]), dataStart);
    if (nextBoundary < 0) throw Object.assign(new Error("Malformed multipart upload."), { statusCode: 400, code: "INVALID_UPLOAD" });
    const buffer = body.subarray(dataStart, nextBoundary);
    if (!buffer.length) throw Object.assign(new Error("The selected file is empty."), { statusCode: 400, code: "INVALID_UPLOAD" });
    if (buffer.length > MAX_UPLOAD) throw Object.assign(new Error("Evidence images must be 5 MB or smaller."), { statusCode: 413, code: "UPLOAD_TOO_LARGE" });
    const info = TYPE_INFO[mimeType];
    if (!info || !info.check(buffer)) throw Object.assign(new Error("Upload a valid JPEG, PNG, or WebP image."), { statusCode: 415, code: "UNSUPPORTED_MEDIA_TYPE" });
    return { buffer, mimeType, extension: info.ext, originalName: path.basename(filename).replace(/[\x00-\x1f\x7f]/g, "").slice(0, 255) || `evidence.${info.ext}` };
}

module.exports = { MAX_UPLOAD, TYPE_INFO, parseMultipart, validJpeg, validPng, validWebp };
