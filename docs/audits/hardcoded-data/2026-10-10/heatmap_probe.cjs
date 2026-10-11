// Read-only runtime calculation using installed dependencies; transpilation stays in memory.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../../..');
const ts = require(path.join(root, 'web/node_modules/typescript'));
require.extensions['.ts'] = (module, filename) => {
  const result = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  });
  module._compile(result.outputText, filename);
};
const { buildObservationHeatmap } = require(path.join(root, 'web/src/components/map/heatmap.ts'));
const input = JSON.parse(fs.readFileSync(path.join(root, 'data/live/aqi.json'), 'utf8'));
const auditTime = '2026-10-10T00:00:00Z';
const result = buildObservationHeatmap(input, Date.parse(auditTime));
const evidence = {
  node_version: process.version,
  executable: process.execPath,
  audit_time: auditTime,
  input: 'Existing captured AQI file; no fabricated stations or source writes.',
  samples: result.samples,
  occupied_cells: result.geojson.features.length,
  rejected: result.rejected,
  duplicates: result.duplicates,
  stale_samples: result.staleCount,
  oldest: result.oldest,
  newest: result.newest,
  sources: result.sources,
};
assert.equal(evidence.samples, 59);
assert.equal(evidence.occupied_cells, 28);
assert.equal(evidence.stale_samples, 59);
fs.writeFileSync(path.join(__dirname, 'HEATMAP_PROBE.json'), JSON.stringify(evidence, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(evidence));
