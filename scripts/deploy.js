const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

// Usage: RPC_URL=... DEPLOYER_KEY=0x... AGENT_ID=0x60b9... node scripts/deploy.js
async function main() {
  const rpc = process.env.RPC_URL || "https://bsc-dataseed.binance.org";
  const key = process.env.DEPLOYER_KEY;
  const agentId = process.env.AGENT_ID || "0x60b9262456de011f7d15a54cdd8c48baaa8b022f";
  if (!key) { console.error("DEPLOYER_KEY env required"); process.exit(1); }
  const provider = new ethers.JsonRpcProvider(rpc);
  const wallet = new ethers.Wallet(key, provider);
  const bal = await provider.getBalance(wallet.address);
  console.log("deployer:", wallet.address, "balance:", ethers.formatEther(bal), "BNB");
  const art = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "artifacts", "AgentGate.json"), "utf8"));
  const factory = new ethers.ContractFactory(art.abi, art.bytecode, wallet);
  const gate = await factory.deploy(agentId);
  await gate.waitForDeployment();
  const addr = await gate.getAddress();
  console.log("AgentGate deployed:", addr);
  console.log("Agent ID pointer:", await gate.agentId());
  fs.writeFileSync(path.join(__dirname, "..", "deploy", "deployment.json"),
    JSON.stringify({ address: addr, agentId, deployer: wallet.address, time: new Date().toISOString() }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
