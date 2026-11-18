// AgentGate front end — reads are public via BSC RPC; writes need a wallet
// holding an Agent ID. Set GATE_ADDRESS after deployment.
const GATE_ADDRESS = null; // e.g. "0x..." after mainnet deploy
const AGENT_ID = "0x60b9262456de011f7d15a54cdd8c48baaa8b022f";
const BSC_RPC = "https://bsc-dataseed.binance.org";
const BSC_CHAIN_ID = 56n;

const GATE_ABI = [
  "function totalCheckIns() view returns (uint256)",
  "function totalAgents() view returns (uint256)",
  "function listCount() view returns (uint256)",
  "function lists(uint256) view returns (string name, address creator, uint256 members, bool open)",
  "function isAgent(address) view returns (bool)",
  "function streak(address) view returns (uint256)",
  "function bestStreak(address) view returns (uint256)",
  "function checkInCount(address) view returns (uint256)",
  "function lastCheckInDay(address) view returns (uint256)",
  "function joined(uint256, address) view returns (bool)",
  "function checkIn()",
  "function createList(string name) returns (uint256)",
  "function joinList(uint256 id)",
];

const $ = (id) => document.getElementById(id);
const msg = (t) => { $("msg").textContent = t || ""; };
const short = (a) => a.slice(0, 6) + "…" + a.slice(-4);

let signer = null, account = null, gateWrite = null;

const readGate = GATE_ADDRESS
  ? new ethers.Contract(GATE_ADDRESS, GATE_ABI, new ethers.JsonRpcProvider(BSC_RPC))
  : null;

async function loadPublic() {
  if (!readGate) { msg("Contract not deployed yet — check back soon."); return; }
  try {
    const [agents, checkins, lists] = await Promise.all([
      readGate.totalAgents(), readGate.totalCheckIns(), readGate.listCount(),
    ]);
    $("statAgents").textContent = agents.toString();
    $("statCheckins").textContent = checkins.toString();
    $("statLists").textContent = lists.toString();
    $("contractLink").innerHTML =
      `<a href="https://bscscan.com/address/${GATE_ADDRESS}" target="_blank" rel="noopener">${short(GATE_ADDRESS)}</a> (verified on BscScan)`;
    await renderLists(Number(lists));
  } catch (e) { console.error(e); }
}

async function renderLists(count) {
  const box = $("lists");
  box.innerHTML = "";
  const max = Math.min(count, 25);
  for (let i = max - 1; i >= 0; i--) {
    const [name, creator, members, open] = await readGate.lists(i);
    const row = document.createElement("div");
    row.className = "list";
    let joined = false;
    if (account) joined = await readGate.joined(i, account);
    row.innerHTML = `<div><b>${name.replace(/</g, "&lt;")}</b>
      <div class="small">by ${short(creator)} · ${members} member(s) · ${open ? "open" : "closed"}</div></div>`;
    const btn = document.createElement("button");
    btn.className = "ghost";
    btn.textContent = joined ? "Joined" : open ? "Join" : "Closed";
    btn.disabled = !account || joined || !open;
    btn.onclick = () => joinList(i);
    row.appendChild(btn);
    box.appendChild(row);
  }
  if (count === 0) box.innerHTML = '<p class="small">No lists yet — be the first Agent ID holder to create one.</p>';
}

async function refreshYourStats() {
  if (!account || !readGate) return;
  const pill = $("agentPill");
  const isAg = await readGate.isAgent(account);
  pill.textContent = isAg ? "Agent ID holder ✓" : "No Agent ID on this wallet";
  pill.className = "pill " + (isAg ? "ok" : "bad");
  if (!isAg) {
    $("yourStats").textContent = "This wallet holds no Agent ID, so the desk is read-only for you. Claim an Agent ID in the Binance App (Wallet → Agent ID banner), then reconnect.";
    $("checkinBtn").disabled = true; $("createListBtn").disabled = true;
    return;
  }
  const [st, best, cnt, last] = await Promise.all([
    readGate.streak(account), readGate.bestStreak(account),
    readGate.checkInCount(account), readGate.lastCheckInDay(account),
  ]);
  const today = BigInt(Math.floor(Date.now() / 86400000));
  const doneToday = last === today;
  $("yourStats").textContent =
    `${short(account)} — current streak ${st} day(s), best ${best}, total check-ins ${cnt}.` +
    (doneToday ? " You have already checked in today — see you tomorrow." : " You have not checked in today yet.");
  $("checkinBtn").disabled = doneToday;
  $("createListBtn").disabled = false;
  await renderLists(Number(await readGate.listCount()));
}

async function ensureBsc(eth) {
  const chainId = await eth.request({ method: "eth_chainId" });
  if (BigInt(chainId) === BSC_CHAIN_ID) return;
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x38" }] });
  } catch (e) {
    await eth.request({
      method: "wallet_addEthereumChain",
      params: [{ chainId: "0x38", chainName: "BNB Smart Chain", rpcUrls: [BSC_RPC],
        nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
        blockExplorerUrls: ["https://bscscan.com"] }],
    });
  }
}

$("connectBtn").onclick = async () => {
  if (!window.ethereum) { msg("No wallet found in this browser. Open this page inside your wallet's dApp browser (e.g. Binance Wallet)."); return; }
  try {
    await ensureBsc(window.ethereum);
    const prov = new ethers.BrowserProvider(window.ethereum);
    signer = await prov.getSigner();
    account = await signer.getAddress();
    $("connectBtn").textContent = short(account);
    if (GATE_ADDRESS) {
      gateWrite = new ethers.Contract(GATE_ADDRESS, GATE_ABI, signer);
      await refreshYourStats();
    }
    msg("");
  } catch (e) { msg("Wallet connection failed: " + (e.shortMessage || e.message)); }
};

async function sendTx(fn, doneText) {
  try {
    msg("Confirm the transaction in your wallet…");
    const tx = await fn();
    msg("Transaction sent — waiting for confirmation…");
    await tx.wait();
    msg(doneText);
    await loadPublic(); await refreshYourStats();
  } catch (e) { msg("Failed: " + (e.shortMessage || e.message)); }
}

$("checkinBtn").onclick = () => gateWrite && sendTx(() => gateWrite.checkIn(), "Checked in. Streak updated!");
$("createListBtn").onclick = () => {
  const name = $("listName").value.trim();
  if (!name) { msg("Give your list a name first."); return; }
  if (gateWrite) sendTx(() => gateWrite.createList(name), "List created!");
};
function joinList(i) { if (gateWrite) sendTx(() => gateWrite.joinList(i), "Joined list #" + i + "!"); }

loadPublic();
