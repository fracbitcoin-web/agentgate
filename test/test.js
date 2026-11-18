const assert = require("assert");
const ganache = require("ganache");
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

async function main() {
  const provider = new ethers.BrowserProvider(ganache.provider({ logging: { quiet: true } }));
  const [deployer, alice, bob, carol] = await Promise.all([0, 1, 2, 3].map((i) => provider.getSigner(i)));

  const mockArt = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "artifacts", "MockAgentID.json"), "utf8"));
  const gateArt = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "artifacts", "AgentGate.json"), "utf8"));

  const mock = await new ethers.ContractFactory(mockArt.abi, mockArt.bytecode, deployer).deploy();
  await mock.waitForDeployment();
  const gate = await new ethers.ContractFactory(gateArt.abi, gateArt.bytecode, deployer).deploy(await mock.getAddress());
  await gate.waitForDeployment();
  console.log("deployed gate:", await gate.getAddress());

  const A = (s) => gate.connect(s);

async function expectRevert(promise) {
  try { await promise; } catch (e) {
    const msg = String(e.message || e);
    assert.ok(/CALL_EXCEPTION|revert/i.test(msg), "expected revert, got: " + msg);
    return;
  }
  assert.fail("expected revert but call succeeded");
}

  let passed = 0;
  const ok = (name) => { passed++; console.log("PASS", name); };

  // non-holder cannot check in
  await expectRevert(A(alice).checkIn());
  ok("non-holder checkIn reverts");

  // give alice + bob Agent IDs
  await (await mock.mint(await alice.getAddress())).wait();
  await (await mock.mint(await bob.getAddress())).wait();
  assert.equal(await gate.isAgent(await alice.getAddress()), true);
  assert.equal(await gate.isAgent(await carol.getAddress()), false);
  ok("isAgent reflects holdings");

  // alice checks in
  await (await A(alice).checkIn({ gasLimit: 500000 })).wait();
  assert.equal(await gate.streak(await alice.getAddress()), 1n);
  assert.equal(await gate.totalCheckIns(), 1n);
  assert.equal(await gate.totalAgents(), 1n);
  ok("first check-in: streak 1, totals 1/1");

  // same-day second check-in reverts
  await expectRevert(A(alice).checkIn());
  ok("double check-in same day reverts");

  // next day: streak grows
  await provider.send("evm_increaseTime", [86400]);
  await provider.send("evm_mine", []);
  await (await A(alice).checkIn({ gasLimit: 500000 })).wait();
  assert.equal(await gate.streak(await alice.getAddress()), 2n);
  assert.equal(await gate.bestStreak(await alice.getAddress()), 2n);
  ok("next-day check-in: streak 2");

  // skip a day: streak resets
  await provider.send("evm_increaseTime", [2 * 86400]);
  await provider.send("evm_mine", []);
  await (await A(alice).checkIn({ gasLimit: 500000 })).wait();
  assert.equal(await gate.streak(await alice.getAddress()), 1n);
  assert.equal(await gate.bestStreak(await alice.getAddress()), 2n);
  ok("gap day resets streak, best kept");

  // lists: non-holder cannot create; holder creates; holder joins; dup join reverts; non-holder join reverts
  await expectRevert(A(carol).createList("Early Agents"));
  await (await A(alice).createList("Early Agents", { gasLimit: 500000 })).wait();
  assert.equal(await gate.listCount(), 1n);
  await (await A(bob).joinList(0, { gasLimit: 500000 })).wait();
  const l0 = await gate.lists(0);
  assert.equal(l0.members, 1n);
  assert.equal(await gate.totalAgents(), 2n);
  await expectRevert(A(bob).joinList(0));
  await expectRevert(A(carol).joinList(0));
  ok("allowlist create/join gating + totals");

  // close list: only creator; joins then revert
  await expectRevert(A(bob).closeList(0));
  await (await A(alice).closeList(0, { gasLimit: 500000 })).wait();
  await (await mock.mint(await carol.getAddress())).wait();
  await expectRevert(A(carol).joinList(0));
  ok("closeList creator-only + closed list rejects joins");

  // owner power: only setAgentId
  await expectRevert(A(alice).setAgentId(await mock.getAddress()));
  await (await gate.connect(deployer).setAgentId(await mock.getAddress(), { gasLimit: 500000 })).wait();
  ok("setAgentId owner-only");

  console.log(`\nALL ${passed} TEST GROUPS PASSED`);
}

main().catch((e) => { console.error("TEST FAILURE:", e.message); process.exit(1); });
