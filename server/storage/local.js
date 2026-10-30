const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

class LocalStorage {
    constructor(root = process.env.UPLOAD_DIR || path.resolve(__dirname, "../../data/private-uploads")) {
        this.root = path.resolve(root);
    }
    async put(buffer, extension) {
        await fs.mkdir(this.root, { recursive: true });
        const objectKey = `${randomUUID()}.${extension}`;
        await fs.writeFile(path.join(this.root, objectKey), buffer, { flag: "wx", mode: 0o600 });
        return objectKey;
    }
    async get(objectKey) {
        if (!/^[0-9a-f-]{36}\.(jpg|png|webp)$/.test(objectKey)) throw Object.assign(new Error("Invalid storage key."), { code: "ENOENT" });
        return fs.readFile(path.join(this.root, objectKey));
    }
    async delete(objectKey) {
        if (/^[0-9a-f-]{36}\.(jpg|png|webp)$/.test(objectKey)) await fs.unlink(path.join(this.root, objectKey)).catch(() => {});
    }
}

module.exports = { LocalStorage };
