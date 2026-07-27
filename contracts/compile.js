const fs = require('fs');
const path = require('path');
const solc = require('solc');

const ROOT = __dirname;

function readSource(p) {
  return fs.readFileSync(path.join(ROOT, p), 'utf8');
}

function findImport(importPath) {
  const candidates = [
    path.join(ROOT, 'node_modules', importPath),
    path.join(ROOT, importPath)
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return { contents: fs.readFileSync(c, 'utf8') };
  }
  return { error: 'not found: ' + importPath };
}

const input = {
  language: 'Solidity',
  sources: {
    'HoodCards.sol': { content: readSource('HoodCards.sol') },
    'HoodPacksSale.sol': { content: readSource('HoodPacksSale.sol') }
  },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: 'paris',
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.methodIdentifiers'] } }
  }
};

const out = JSON.parse(solc.compile(JSON.stringify(input), { import: findImport }));

const errors = (out.errors || []).filter(e => e.severity === 'error');
const warnings = (out.errors || []).filter(e => e.severity === 'warning');

warnings.forEach(w => console.log('WARN:', w.formattedMessage.split('\n')[0]));

if (errors.length) {
  errors.forEach(e => console.error(e.formattedMessage));
  process.exit(1);
}

fs.mkdirSync(path.join(ROOT, 'build'), { recursive: true });

for (const file of Object.keys(out.contracts)) {
  for (const name of Object.keys(out.contracts[file])) {
    const c = out.contracts[file][name];
    const size = c.evm.bytecode.object.length / 2;
    fs.writeFileSync(
      path.join(ROOT, 'build', name + '.json'),
      JSON.stringify({ abi: c.abi, bytecode: '0x' + c.evm.bytecode.object }, null, 2)
    );
    if (['HoodCards', 'HoodPacksSale'].includes(name)) {
      console.log(`OK ${name}: ${size} bytes` + (size > 24576 ? '  << OVER 24KB LIMIT' : ''));
    }
  }
}
