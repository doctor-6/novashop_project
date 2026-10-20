// scripts/run-api-tests.js
// One-command test workflow: `npm test`.
//
// 1. Creates throwaway data/uploads folders in the OS temp directory, so the
//    developer's real products.json and uploads/ are never touched.
// 2. Starts an isolated server instance on a dedicated test port.
// 3. Runs scripts/test-api.js against it.
// 4. Verifies product persistence across a server restart.
// 5. Kills the server and deletes the temp folders - on success AND failure.
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TEST_PORT = Number(process.env.TEST_PORT) || 3947;
const ROOT = path.join(__dirname, '..');

const tmpRoot = path.join(os.tmpdir(), `nova-shop-tests-${process.pid}`);
const dataDir = path.join(tmpRoot, 'data');
const uploadDir = path.join(tmpRoot, 'uploads');

let serverProcess = null;

/** Environment for the isolated server (also used by child test scripts). */
const testEnv = {
  ...process.env,
  PORT: String(TEST_PORT),
  DATA_DIR: dataDir,
  UPLOAD_DIR: uploadDir,
  ADMIN_PASSWORD: '1234', // keep login deterministic even if .env differs
  SESSION_SECRET: 'test-only-secret',
};

/** Spawn the server and resolve once it answers on the test port. */
function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
      cwd: ROOT,
      env: testEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', () => {});
    child.stderr.on('data', (chunk) => process.stderr.write(`[server] ${chunk}`));
    child.on('exit', (code) => {
      if (code !== null && code !== 0) {
        reject(new Error(`Server exited early with code ${code}`));
      }
    });

    const deadline = Date.now() + 15000;
    (async function poll() {
      try {
        const response = await fetch(`http://localhost:${TEST_PORT}/api/products`);
        if (response.ok) return resolve(child);
      } catch (error) {
        // not up yet
      }
      if (Date.now() > deadline) {
        child.kill();
        return reject(new Error('Server did not start within 15 s.'));
      }
      setTimeout(poll, 200);
    })();
  });
}

function stopServer() {
  return new Promise((resolve) => {
    if (!serverProcess || serverProcess.exitCode !== null) return resolve();
    serverProcess.once('exit', resolve);
    serverProcess.kill();
  });
}

/** Minimal cookie-keeping fetch so the runner can act as the admin. */
async function runScript(scriptPath) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: ROOT,
      env: testEnv,
      stdio: 'inherit',
    });
    child.on('exit', (code) => resolve(code || 0));
  });
}

/**
 * Phase 2: after restarting the server, confirm that a product created before
 * the restart is still there, then clean it up.
 */
function makeClient() {
  let cookie = '';
  return async function request(apiPath, options = {}) {
    const headers = Object.assign({ Accept: 'application/json' }, options.headers || {});
    if (cookie) headers.Cookie = cookie;
    if (options.body && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    const response = await fetch(`http://localhost:${TEST_PORT}${apiPath}`, {
      ...options,
      headers,
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    let data = null;
    if ((response.headers.get('content-type') || '').includes('application/json')) {
      data = await response.json();
    }
    return { status: response.status, data };
  };
}

async function persistencePhase() {
  let failed = false;

  const admin = makeClient();
  const login = await admin('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify({ password: '1234' }),
  });
  const created = await admin('/api/products', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Persistence Probe',
      description: 'Created before the test restart; must survive it.',
      price: 1,
      category: 'Testing',
    }),
  });
  const probeId = created.data && created.data.product ? created.data.product.id : null;

  if (login.status !== 200 || !probeId) {
    console.log('  FAIL  could not create the persistence probe product');
    return 1;
  }

  console.log('\n== 9. Persistence across a server restart ==');
  await stopServer();
  serverProcess = await startServer();

  const guest = makeClient();
  const list = await guest('/api/products');
  const survived =
    list.status === 200 &&
    Array.isArray(list.data.products) &&
    list.data.products.some((product) => product.id === probeId);
  console.log(survived ? '  PASS  product survives a server restart' : '  FAIL  product lost after restart');
  if (!survived) failed = true;

  const cleanupAdmin = makeClient();
  await cleanupAdmin('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify({ password: '1234' }),
  });
  await cleanupAdmin(`/api/products/${probeId}`, { method: 'DELETE' });

  return failed ? 1 : 0;
}

async function main() {
  console.log(`\nRunning API tests on port ${TEST_PORT}`);
  console.log(`Temporary data: ${tmpRoot}\n`);

  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(uploadDir, { recursive: true });

  serverProcess = await startServer();
  let exitCode = await runScript(path.join(ROOT, 'scripts', 'test-api.js'));
  if (exitCode === 0) {
    exitCode = await persistencePhase();
  }
  return exitCode;
}

main()
  .then(async (exitCode) => {
    await stopServer();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    console.log(`\nTest server stopped; temp data removed. Exit code: ${exitCode}\n`);
    process.exit(exitCode);
  })
  .catch(async (error) => {
    console.error('Test run failed:', error.message);
    await stopServer();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    process.exit(1);
  });
