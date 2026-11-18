const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const solc = require("solc");
const { compile } = require("./compile");

// Usage: RPC_URL=... DEPLOYER_KEY=0x... AGENT_ID=0x60b9... node scripts/deploy.js
async function main() {
  const rpc = process.env.RPC_URL || "https://bsc-dataseed.binance.org";
  const key = process.env.DEPLOYER_KEY;
  const agentId = process.env.AGENT_ID || "0x60b9262456de011f7d15a54cdd8c48baaa8b022f";
  if (!key) { console.error("DEPLOYER_KEY env required"); process.exit(1); }

  // Bind deployment to the reviewed source: always recompile, then verify the
  // artifact's recorded provenance (source hash, solc version, bytecode hash)
  // against freshly computed values. Refuse to deploy on any mismatch — never
  // trust whatever artifact happens to sit on disk.
  compile();
  const artPath = path.join(__dirname, "..", "artifacts", "AgentGate.json");
  const art = JSON.parse(fs.readFileSync(artPath, "utf8"));
  const srcHash = crypto.createHash("sha256")
    .update(fs.readFileSync(path.join(__dirname, "..", "contracts", "AgentGate.sol"), "utf8"), "utf8")
    .digest("hex");
  const bytecodeHash = ethers.keccak256(art.bytecode);
  const problems = [];
  if (art.sourceSha256 !== srcHash) problems.push(`sourceSha256 mismatch (artifact ${art.sourceSha256} != source ${srcHash})`);
  if (art.bytecodeHash !== bytecodeHash) problems.push(`bytecodeHash mismatch (artifact ${art.bytecodeHash} != computed ${bytecodeHash})`);
  if (art.solcVersion !== solc.version()) problems.push(`solcVersion mismatch (artifact ${art.solcVersion} != current ${solc.version()})`);
  if (problems.length) {
    console.error("Artifact provenance check FAILED — refusing to deploy:");
    for (const p of problems) console.error(" -", p);
    process.exit(1);
  }
  console.log("artifact provenance verified: source sha256:", srcHash, "| solc:", art.solcVersion, "| bytecode keccak:", bytecodeHash);

  const provider = new ethers.JsonRpcProvider(rpc);
  const wallet = new ethers.Wallet(key, provider);
  const bal = await provider.getBalance(wallet.address);
  console.log("deployer:", wallet.address, "balance:", ethers.formatEther(bal), "BNB");
  const factory = new ethers.ContractFactory(art.abi, art.bytecode, wallet);
  const gate = await factory.deploy(agentId);
  await gate.waitForDeployment();
  const addr = await gate.getAddress();
  const runtimeCodehash = ethers.keccak256(await provider.getCode(addr));
  console.log("AgentGate deployed:", addr);
  console.log("Agent ID pointer:", await gate.agentId());
  console.log("deployed runtime codehash:", runtimeCodehash);
  fs.writeFileSync(path.join(__dirname, "..", "deploy", "deployment.json"),
    JSON.stringify({
      address: addr, agentId, deployer: wallet.address, time: new Date().toISOString(),
      sourceSha256: srcHash, solcVersion: art.solcVersion, bytecodeHash, runtimeCodehash,
    }, null, 2));

  // Bind the front end to this deployment automatically — no manual
  // transcription of the address into docs/app.js.
  const appPath = path.join(__dirname, "..", "docs", "app.js");
  const appSrc = fs.readFileSync(appPath, "utf8");
  let updated = appSrc.replace(/const GATE_ADDRESS = [^;]*;/, `const GATE_ADDRESS = "${addr}";`);
  if (updated === appSrc) { console.error("GATE_ADDRESS line not found in docs/app.js"); process.exit(1); }
  const withFlag = updated.replace(/const GATE_DEPLOYED = [^;]*;/, "const GATE_DEPLOYED = true;");
  if (withFlag === updated) { console.error("GATE_DEPLOYED line not found in docs/app.js"); process.exit(1); }
  fs.writeFileSync(appPath, withFlag);
  console.log("docs/app.js GATE_ADDRESS set to", addr, "(GATE_DEPLOYED = true)");
}

main().catch((e) => { console.error(e); process.exit(1); });
