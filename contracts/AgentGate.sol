// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Minimal read interface for the Agent ID contract (SPACE ID Agent ID,
///         ERC-721, non-transferable) on BNB Chain: 0x60b9262456de011f7d15a54cdd8c48baaa8b022f
interface IAgentID {
    function balanceOf(address owner) external view returns (uint256);
}

/// @title AgentGate — the front desk for Agent ID holders
/// @notice A public check-in desk and allowlist registry that only Agent ID
///         holders (Agentic Wallet users with a name.ai identity) can use.
///         Agent ID is the access key for every write function.
/// @dev This contract holds NO funds and has no function that can move user
///      assets. The owner's only power is `setAgentId` (repointing the Agent
///      ID contract address if SPACE ID ever migrates it); that power is
///      disclosed here and in the README. No mint, no tax, no pause, no
///      freeze, no withdrawal functions exist.
contract AgentGate {
    IAgentID public agentId;
    address public owner;

    uint256 public totalCheckIns;
    /// @notice Unique Agent ID addresses that have ever interacted.
    uint256 public totalAgents;

    mapping(address => bool) public seen;
    mapping(address => uint256) public lastCheckInDay;
    mapping(address => uint256) public streak;
    mapping(address => uint256) public bestStreak;
    mapping(address => uint256) public checkInCount;

    struct List {
        string name;
        address creator;
        uint256 members;
        bool open;
    }

    List[] public lists;
    mapping(uint256 => mapping(address => bool)) public joined;

    event CheckedIn(address indexed agent, uint256 day, uint256 streak);
    event ListCreated(uint256 indexed id, address indexed creator, string name);
    event Joined(uint256 indexed id, address indexed agent);
    event ListClosed(uint256 indexed id);
    event AgentIdUpdated(address indexed newAgentId);

    modifier onlyAgent() {
        require(agentId.balanceOf(msg.sender) > 0, "Agent ID required");
        _;
    }

    constructor(address agentId_) {
        _setAgentId(agentId_);
        owner = msg.sender;
    }

    /// @dev Shared validation for the Agent ID pointer, used by both the
    ///      constructor and setAgentId: the target must be a deployed
    ///      contract that actually answers IAgentID.balanceOf, so a mistyped
    ///      address can never silently freeze every gated write. The probe
    ///      uses address(0x1) (never address(0), which ERC-721 balanceOf
    ///      legitimately rejects) and only checks that the call succeeds.
    function _setAgentId(address agentId_) internal {
        require(agentId_ != address(0), "Zero address");
        require(agentId_.code.length > 0, "Agent ID not a contract");
        try IAgentID(agentId_).balanceOf(address(0x1)) returns (uint256) {} catch {
            revert("Agent ID lacks balanceOf");
        }
        agentId = IAgentID(agentId_);
    }

    function _touch(address a) internal {
        if (!seen[a]) {
            seen[a] = true;
            totalAgents += 1;
        }
    }

    /// @notice Daily check-in. One per Agent ID address per UTC day.
    ///         Consecutive days build a streak.
    function checkIn() external onlyAgent {
        uint256 day = block.timestamp / 1 days;
        require(lastCheckInDay[msg.sender] != day, "Already checked in today");
        if (lastCheckInDay[msg.sender] + 1 == day) {
            streak[msg.sender] += 1;
        } else {
            streak[msg.sender] = 1;
        }
        lastCheckInDay[msg.sender] = day;
        checkInCount[msg.sender] += 1;
        totalCheckIns += 1;
        if (streak[msg.sender] > bestStreak[msg.sender]) {
            bestStreak[msg.sender] = streak[msg.sender];
        }
        _touch(msg.sender);
        emit CheckedIn(msg.sender, day, streak[msg.sender]);
    }

    /// @notice Create an allowlist that only Agent ID holders can join.
    function createList(string calldata name) external onlyAgent returns (uint256 id) {
        require(bytes(name).length > 0 && bytes(name).length <= 64, "Name 1-64 chars");
        id = lists.length;
        lists.push(List({name: name, creator: msg.sender, members: 0, open: true}));
        _touch(msg.sender);
        emit ListCreated(id, msg.sender, name);
    }

    /// @notice Join an open allowlist. Agent ID holders only, once per list.
    function joinList(uint256 id) external onlyAgent {
        require(id < lists.length, "No such list");
        require(lists[id].open, "List closed");
        require(!joined[id][msg.sender], "Already joined");
        joined[id][msg.sender] = true;
        lists[id].members += 1;
        _touch(msg.sender);
        emit Joined(id, msg.sender);
    }

    /// @notice Close your own list to new joins.
    function closeList(uint256 id) external {
        require(id < lists.length, "No such list");
        require(lists[id].creator == msg.sender, "Not the creator");
        lists[id].open = false;
        emit ListClosed(id);
    }

    /// @notice True if the address holds an Agent ID.
    function isAgent(address a) external view returns (bool) {
        return agentId.balanceOf(a) > 0;
    }

    function listCount() external view returns (uint256) {
        return lists.length;
    }

    /// @notice Owner's ONLY power: repoint the Agent ID contract address
    ///         (e.g. if SPACE ID migrates the Agent ID contract). Disclosed
    ///         in the README. Cannot touch user data or funds (none are held).
    function setAgentId(address agentId_) external {
        require(msg.sender == owner, "Not owner");
        _setAgentId(agentId_);
        emit AgentIdUpdated(agentId_);
    }
}
