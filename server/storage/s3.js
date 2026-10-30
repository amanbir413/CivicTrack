const { createHash, createHmac, randomUUID } = require("node:crypto");

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function hmac(key, value, encoding) { return createHmac("sha256", key).update(value).digest(encoding); }
function encodePath(pathname) {
    return pathname.split("/").map(part => encodeURIComponent(decodeURIComponent(part)).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)).join("/");
}

class S3Storage {
    constructor(config = process.env) {
        this.region = config.S3_REGION;
        this.bucket = config.S3_BUCKET;
        this.accessKey = config.S3_ACCESS_KEY_ID;
        this.secretKey = config.S3_SECRET_ACCESS_KEY;
        this.sessionToken = config.S3_SESSION_TOKEN || "";
        this.forcePathStyle = config.S3_FORCE_PATH_STYLE === "true" || Boolean(config.S3_ENDPOINT);
        if (!this.region || !this.bucket || !this.accessKey || !this.secretKey) {
            throw new Error("S3 storage requires S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY.");
        }
        this.endpoint = new URL(config.S3_ENDPOINT || `https://s3.${this.region}.amazonaws.com`);
        if (this.endpoint.protocol !== "https:" && config.NODE_ENV === "production") throw new Error("S3_ENDPOINT must use HTTPS in production.");
        if (!this.forcePathStyle && !config.S3_ENDPOINT) this.endpoint.hostname = `${this.bucket}.s3.${this.region}.amazonaws.com`;
    }

    objectUrl(objectKey) {
        if (!/^evidence\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(objectKey)) throw new Error("Invalid object key.");
        const url = new URL(this.endpoint);
        const prefix = url.pathname.replace(/\/$/, "");
        url.pathname = `${prefix}${this.forcePathStyle ? `/${this.bucket}` : ""}/${objectKey}`;
        url.search = "";
        return url;
    }

    signedHeaders(method, url, body, contentType) {
        const now = new Date();
        const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
        const day = amzDate.slice(0, 8);
        const payloadHash = sha256(body);
        const headers = { host: url.host, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate };
        if (contentType) headers["content-type"] = contentType;
        if (this.sessionToken) headers["x-amz-security-token"] = this.sessionToken;
        const names = Object.keys(headers).sort();
        const canonicalHeaders = names.map(name => `${name}:${headers[name].trim()}\n`).join("");
        const signedNames = names.join(";");
        const canonicalRequest = [method, encodePath(url.pathname), "", canonicalHeaders, signedNames, payloadHash].join("\n");
        const scope = `${day}/${this.region}/s3/aws4_request`;
        const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${sha256(canonicalRequest)}`;
        const dateKey = hmac(`AWS4${this.secretKey}`, day);
        const regionKey = hmac(dateKey, this.region);
        const serviceKey = hmac(regionKey, "s3");
        const signingKey = hmac(serviceKey, "aws4_request");
        const signature = hmac(signingKey, stringToSign, "hex");
        return { ...headers, Authorization: `AWS4-HMAC-SHA256 Credential=${this.accessKey}/${scope}, SignedHeaders=${signedNames}, Signature=${signature}` };
    }

    async request(method, objectKey, body = Buffer.alloc(0), contentType) {
        const url = this.objectUrl(objectKey);
        const response = await fetch(url, { method, headers: this.signedHeaders(method, url, body, contentType), ...(method === "PUT" ? { body } : {}) });
        if (!response.ok) {
            const detail = (await response.text()).slice(0, 300);
            throw Object.assign(new Error(`Private object storage returned HTTP ${response.status}${detail ? `: ${detail}` : "."}`), { statusCode: 502, storageStatus: response.status, code: "OBJECT_STORAGE_ERROR" });
        }
        return response;
    }

    async put(buffer, extension) {
        const objectKey = `evidence/${randomUUID()}.${extension}`;
        await this.request("PUT", objectKey, buffer, ({ jpg: "image/jpeg", png: "image/png", webp: "image/webp" })[extension]);
        return objectKey;
    }

    async get(objectKey) { return Buffer.from(await (await this.request("GET", objectKey)).arrayBuffer()); }
    async delete(objectKey) { try { await this.request("DELETE", objectKey); } catch (error) { if (error.storageStatus !== 404) throw error; } }
}

module.exports = { S3Storage, encodePath, sha256 };
