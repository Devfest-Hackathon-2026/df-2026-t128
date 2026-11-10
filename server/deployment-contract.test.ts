// Static regression contracts only. No gcloud, Docker, credentials or cloud calls.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Docker build includes the license checker without opening the other scripts', async () => {
  const rules = (await read('.dockerignore')).split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'));
  assert.equal(rules[0], '**', 'Build context must remain deny-by-default');
  // Docker re-includes descendants when a parent is allowed. Re-exclude them
  // before allowing the one build-time checker, not the whole scripts tree.
  const directoryRule = rules.indexOf('!scripts/');
  assert.ok(directoryRule > 0);
  assert.deepEqual(rules.slice(directoryRule, directoryRule + 3), ['!scripts/', 'scripts/**', '!scripts/third-party-notices.mjs']);
  assert.deepEqual(rules.filter(rule => rule.startsWith('!scripts/')), ['!scripts/', '!scripts/third-party-notices.mjs']);
  assert.ok(rules.includes('!public/**'), 'Public third-party notices must enter the build context');
  const manifest = JSON.parse(await read('package.json'));
  assert.match(manifest.scripts.build, /^npm run licenses:check && /);
  assert.equal(manifest.scripts['licenses:check'], 'node scripts/third-party-notices.mjs --check');
  assert.match(await read('scripts/third-party-notices.mjs'), /public\/THIRD_PARTY_NOTICES\.txt/);
});

test('runtime role remains inference-only without resource or IAM administration', async () => {
  const role = JSON.parse(await read('infra/iam/runtime-vertex-role.json'));
  assert.deepEqual(role.includedPermissions, ['aiplatform.endpoints.predict']);
});

test('build-only template keeps dedicated identity, pinned inputs and no deployment steps', async () => {
  const config = JSON.parse(await read('infra/cloudbuild.build-only.json'));
  assert.equal(config.serviceAccount, 'projects/kindsignal-devfest-2026/serviceAccounts/kindsignal-build@kindsignal-devfest-2026.iam.gserviceaccount.com');
  assert.deepEqual(config.steps, [
    {
      name: 'node:24-bookworm-slim@sha256:${_NODE_DIGEST}', entrypoint: 'bash',
      args: ['-ceu', 'npm ci && npm test && npm run build'],
    },
    {
      name: 'gcr.io/cloud-builders/docker@sha256:${_DOCKER_BUILDER_DIGEST}',
      args: ['build', '--build-arg', 'NODE_IMAGE=node:24-bookworm-slim@sha256:${_NODE_DIGEST}', '-t',
        'asia-northeast1-docker.pkg.dev/$PROJECT_ID/kindsignal/kindsignal-api:$BUILD_ID', '.'],
    },
  ]);
  assert.deepEqual(config.images, ['asia-northeast1-docker.pkg.dev/$PROJECT_ID/kindsignal/kindsignal-api:$BUILD_ID']);
  assert.deepEqual(config.options, { logging: 'CLOUD_LOGGING_ONLY' });
  assert.equal(config.timeout, '1200s');
  // Additional top-level behavior must receive an explicit contract review as well.
  assert.deepEqual(Object.keys(config).sort(), ['images', 'options', 'serviceAccount', 'steps', 'timeout']);
});
