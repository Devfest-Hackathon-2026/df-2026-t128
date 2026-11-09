import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { conversationScenarios } from './conversation-scenarios';

test('all configured WebP assets match the verified conversion report and retain their PNG originals', () => {
  const report = JSON.parse(readFileSync('docs/scene-image-sizes.json', 'utf8')) as Array<{
    source: string; target: string; width: number; height: number;
    sourceBytes: number; outputBytes: number; sourceSha256: string; outputSha256: string;
    visiblePixelsAndAlphaUnchanged: boolean;
  }>;
  const configured = conversationScenarios.flatMap(scene => [scene.assets.background, ...Object.values(scene.assets.expressions)]);
  assert.equal(report.length, 15);
  assert.deepEqual(report.map(item => '/' + item.target).sort(), configured.sort());
  for (const item of report) {
    assert.equal(item.source, item.target.replace(/\.webp$/, '.png'));
    const source = readFileSync('public/' + item.source);
    const output = readFileSync('public/' + item.target);
    assert.equal(createHash('sha256').update(source).digest('hex'), item.sourceSha256, item.source);
    assert.equal(createHash('sha256').update(output).digest('hex'), item.outputSha256, item.target);
    assert.equal(source.length, item.sourceBytes);
    assert.equal(output.length, item.outputBytes);
    assert.ok(output.length < source.length);
    assert.equal(source.readUInt32BE(16), item.width);
    assert.equal(source.readUInt32BE(20), item.height);
    assert.equal(output.toString('ascii', 0, 4), 'RIFF');
    assert.equal(output.toString('ascii', 8, 12), 'WEBP');
    assert.equal(item.visiblePixelsAndAlphaUnchanged, true);
  }
});
