const fs = require("fs");
const path = require("path");
const solc = require("solc");

function compile() {
  const sources = {};
  for (const f of ["AgentGate.sol", "MockAgentID.sol"]) {
    sources[f] = { content: fs.readFileSync(path.join(__dirname, "..", "contracts", f), "utf8") };
  }
  const input = {
    language: "Solidity",
    sources,
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "paris",
      outputSelection: { "*": { "*": ["abi", "evm.bytecode"] } },
    },
  };
  const out = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (out.errors || []).filter((e) => e.severity === "error");
  if (errors.length) {
    for (const e of errors) console.error(e.formattedMessage);
    process.exit(1);
  }
  const dir = path.join(__dirname, "..", "artifacts");
  fs.mkdirSync(dir, { recursive: true });
  for (const [file, contracts] of Object.entries(out.contracts)) {
    for (const [name, c] of Object.entries(contracts)) {
      fs.writeFileSync(
        path.join(dir, `${name}.json`),
        JSON.stringify({ abi: c.abi, bytecode: "0x" + c.evm.bytecode.object }, null, 2)
      );
      console.log(`compiled ${file}:${name} (bytecode ${(c.evm.bytecode.object.length / 2)} bytes)`);
    }
  }
}

if (require.main === module) compile();
module.exports = { compile };
