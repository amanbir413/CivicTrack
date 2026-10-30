const test = require("node:test");
const assert = require("node:assert/strict");
const { S3Storage } = require("./s3");

test("private S3 adapter signs server-mediated PUT, GET and DELETE requests", async t => {
    const objects = new Map(), seen = [];
    const originalFetch = global.fetch;
    global.fetch = async (url, options) => {
        const key = new URL(url).pathname.split("/").slice(2).join("/");
        seen.push({ method: options.method, headers: options.headers, key });
        if (options.method === "PUT") { objects.set(key, Buffer.from(options.body)); return new Response(null, { status: 200 }); }
        if (options.method === "GET" && objects.has(key)) return new Response(objects.get(key), { status: 200 });
        if (options.method === "DELETE" && objects.has(key)) { objects.delete(key); return new Response(null, { status: 204 }); }
        return new Response("missing", { status: 404 });
    };
    t.after(() => { global.fetch = originalFetch; });

    const storage = new S3Storage({
        S3_REGION: "us-east-1", S3_BUCKET: "private-evidence", S3_ACCESS_KEY_ID: "test-access",
        S3_SECRET_ACCESS_KEY: "test-secret", S3_ENDPOINT: "http://objects.example.test"
    });
    const image = Buffer.from("private test evidence");
    const key = await storage.put(image, "png");
    assert.match(key, /^evidence\/[0-9a-f-]{36}\.png$/);
    assert.deepEqual(await storage.get(key), image);
    await storage.delete(key);
    assert.equal(objects.size, 0);
    assert.deepEqual(seen.map(request => request.method), ["PUT", "GET", "DELETE"]);
    for (const request of seen) {
        const headers = Object.fromEntries(Object.entries(request.headers).map(([name, value]) => [name.toLowerCase(), value]));
        assert.match(headers.authorization, /^AWS4-HMAC-SHA256 Credential=test-access\//);
        assert.equal(headers["x-amz-content-sha256"].length, 64);
        assert.equal(headers["x-amz-acl"], undefined, "objects are not granted a public ACL");
    }
    assert.equal(seen[0].headers["content-type"], "image/png");
    await storage.delete(key);
    assert.equal(seen.length, 4, "deleting a missing private object is idempotent");
});

test("S3 adapter rejects missing credentials and unsafe object keys", () => {
    assert.throws(() => new S3Storage({}), /requires S3_REGION/);
    const storage = new S3Storage({ S3_REGION: "us-east-1", S3_BUCKET: "private-evidence", S3_ACCESS_KEY_ID: "a", S3_SECRET_ACCESS_KEY: "b" });
    assert.throws(() => storage.objectUrl("public/anything.png"), /Invalid object key/);
    assert.throws(() => new S3Storage({ S3_REGION: "us-east-1", S3_BUCKET: "private-evidence", S3_ACCESS_KEY_ID: "a", S3_SECRET_ACCESS_KEY: "b", S3_ENDPOINT: "http://example.test", NODE_ENV: "production" }), /HTTPS/);
});
