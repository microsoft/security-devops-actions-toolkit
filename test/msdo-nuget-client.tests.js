const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const { IncomingMessage } = require('node:http');
const https = require('node:https');
const os = require('node:os');
const path = require('node:path');
const { PassThrough } = require('node:stream');
const { test } = require('node:test');
const zlib = require('node:zlib');
const core = require('@actions/core');
const AdmZip = require('adm-zip');
const nuget = require('../dist/msdo-nuget-client');

function createFeed(t, configuration = {}) {
    const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'msdo-nuget-brotli-'));
    t.after(() => fs.rmSync(outputDirectory, { recursive: true, force: true }));
    t.mock.method(core, 'debug', () => {});

    const archive = new AdmZip();
    archive.addFile('guardian.txt', Buffer.from('benign package fixture'));
    const requests = [];
    const responses = [];
    const decoder = t.mock.method(zlib, 'createBrotliDecompress', () => new PassThrough());
    const previousLatest = process.env.MSDO_FIXTUREPACKAGE_LATESTVERSION;
    delete process.env.MSDO_FIXTUREPACKAGE_LATESTVERSION;
    t.after(() => {
        if (previousLatest === undefined) {
            delete process.env.MSDO_FIXTUREPACKAGE_LATESTVERSION;
        } else {
            process.env.MSDO_FIXTUREPACKAGE_LATESTVERSION = previousLatest;
        }
    });
    t.mock.method(core, 'exportVariable', (name, value) => {
        process.env[name] = value;
    });

    t.mock.method(https, 'request', (url, options, callback) => {
        requests.push({ url, auth: options.auth, headers: { ...options.headers } });
        const isPackage = url.endsWith('.nupkg');
        const isRegistration = url.includes('/registration/');
        const encoding = isPackage ? undefined : configuration.encoding;
        const response = new IncomingMessage(new PassThrough());
        response.statusCode = isPackage ? 200 : configuration.statusCode || 200;
        response.headers = encoding === undefined ? {} : { 'content-encoding': encoding };
        responses.push(response);

        const document = isRegistration
            ? { items: [{ items: [{ catalogEntry: { listed: true, version: '1.0.0' } }] }] }
            : {
                resources: [
                    { '@id': 'https://nuget.test/registration/', '@type': 'RegistrationsBaseUrl/3.6.0' },
                    { '@id': 'https://nuget.test/flat/', '@type': 'PackageBaseAddress/3.0.0' }
                ]
            };
        let body = isPackage ? archive.toBuffer() : Buffer.from(JSON.stringify(document));
        if (!isPackage) {
            if (encoding && encoding.toLowerCase() === 'gzip') {
                body = configuration.invalidCompression
                    ? Buffer.from('not gzip')
                    : zlib.gzipSync(body);
            } else if (encoding === 'deflate') {
                body = configuration.rawDeflate ? zlib.deflateRawSync(body, { level: 0 }) : zlib.deflateSync(body);
            }
        }

        const request = new EventEmitter();
        request.end = () => {
            queueMicrotask(() => {
                callback(response);
                setImmediate(() => {
                    if (configuration.responseError && !isPackage) {
                        response.destroy(new Error('fixture response failure'));
                    } else if (!response.destroyed) {
                        response.complete = true;
                        response.push(body);
                        response.push(null);
                    }
                });
            });
        };
        return request;
    });

    return {
        outputDirectory,
        requests,
        responses,
        decoder,
        install: version => nuget.install(
            'https://nuget.test/index.json',
            'Fixture.Package',
            version || '1.0.0',
            outputDirectory,
            'fixture-only'
        )
    };
}

for (const encoding of [undefined, 'identity', 'gzip', 'GZIP', 'deflate']) {
    test(`installs a package with ${encoding || 'unencoded'} NuGet metadata`, { timeout: 3000 }, async t => {
        const feed = createFeed(t, { encoding });

        const result = await feed.install();

        assert.equal(result.success, true);
        assert.equal(result.resolvedVersion, '1.0.0');
        assert.equal(fs.readFileSync(path.join(result.packageFolder, 'guardian.txt'), 'utf8'), 'benign package fixture');
        assert.equal(feed.decoder.mock.callCount(), 0);
    });
}

test('preserves raw deflate metadata compatibility', { timeout: 3000 }, async t => {
    const feed = createFeed(t, { encoding: 'deflate', rawDeflate: true });

    assert.equal((await feed.install()).success, true);
    assert.equal(feed.decoder.mock.callCount(), 0);
});

for (const encoding of ['br', 'BR', ' br ', 'gzip, br', 'br, gzip', 'zstd', 'gzip, deflate']) {
    test(`rejects unsupported encoding "${encoding}" before decoding or package download`, { timeout: 3000 }, async t => {
        const feed = createFeed(t, { encoding });

        await assert.rejects(feed.install(), /Unsupported NuGet Content-Encoding/);

        assert.equal(feed.decoder.mock.callCount(), 0);
        assert.equal(feed.requests.length, 1);
        assert.equal(feed.responses[0].destroyed, true);
        assert.deepEqual(fs.readdirSync(feed.outputDirectory), []);
    });
}

test('declines Brotli for metadata without changing package transfer or authentication', { timeout: 3000 }, async t => {
    const feed = createFeed(t);

    await feed.install();

    assert.equal(feed.requests[0].headers['Accept-Encoding'], 'gzip, deflate, identity, br;q=0');
    assert.equal(feed.requests[1].headers['Accept-Encoding'], undefined);
    assert.equal(feed.requests[0].auth, ':fixture-only');
    assert.equal(feed.requests[1].auth, ':fixture-only');
});

test('resolves Latest through compressed registration metadata', { timeout: 3000 }, async t => {
    const feed = createFeed(t, { encoding: 'gzip' });

    const result = await feed.install('Latest');

    assert.equal(result.resolvedVersion, '1.0.0');
    assert.equal(feed.requests.length, 3);
    assert.equal(feed.requests[1].headers['Accept-Encoding'], 'gzip, deflate, identity, br;q=0');
    assert.equal(feed.decoder.mock.callCount(), 0);
});

test('preserves cached installations without another request', { timeout: 3000 }, async t => {
    const feed = createFeed(t);
    await feed.install();
    const requestsAfterInstall = feed.requests.length;

    const cached = await feed.install();

    assert.equal(cached.success, true);
    assert.equal(cached.inCache, true);
    assert.equal(feed.requests.length, requestsAfterInstall);
});

test('rejects non-success responses before decompression', { timeout: 3000 }, async t => {
    const feed = createFeed(t, { encoding: 'br', statusCode: 503 });

    await assert.rejects(feed.install(), /Status code: 503/);
    assert.equal(feed.decoder.mock.callCount(), 0);
});

test('rejects decompression errors instead of hanging', { timeout: 3000 }, async t => {
    const feed = createFeed(t, { encoding: 'gzip', invalidCompression: true });

    await assert.rejects(feed.install(), /header check|gzip|decompress/i);
});

test('rejects response stream errors instead of hanging', { timeout: 3000 }, async t => {
    const feed = createFeed(t, { responseError: true });

    await assert.rejects(feed.install(), /fixture response failure/);
});
