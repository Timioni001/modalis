// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title SavingsCircle
/// @notice A rotating savings pool (ajo / esusu / chama / tanda), enforced on-chain.
///         - A fixed group of members each pays the same amount every round.
///         - When everyone has paid, the whole pot goes to that round's member, in the order the
///           members were listed. After as many rounds as there are members, everyone has
///           received the pot exactly once and the circle is finished.
///         - If a round's deadline passes before everyone pays, the circle stops: anyone who paid
///           into that round takes their payment back, and no further rounds start. Nobody can
///           take money out except a member's own refund or the round's rightful recipient.
///         - There is no owner and no admin. Each circle's state is its own storage, so circles
///           never contend with each other (they execute in parallel on Monad).
contract SavingsCircle is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant MAX_MEMBERS = 20;
    uint64 public constant MIN_ROUND_SECONDS = 60;

    enum Status {
        Active,
        Completed,
        Stopped
    }

    struct Circle {
        IERC20 token;
        uint256 contribution;
        uint64 roundSeconds;
        uint64 roundDeadline;
        uint32 round; // zero-based index of the current round
        uint32 paidCount; // members who have paid into the current round
        Status status;
        address creator;
        string name;
        address[] members;
    }

    Circle[] private _circles;
    mapping(uint256 => mapping(address => bool)) public isMember;
    /// circleId => round => member => paid
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) public hasPaid;
    mapping(address => uint256[]) private _circlesOf;

    error BAD_MEMBERS();
    error DUPLICATE_MEMBER(address member);
    error ZERO_AMOUNT();
    error ROUND_TOO_SHORT();
    error NOT_MEMBER();
    error NOT_ACTIVE();
    error ALREADY_PAID();
    error ROUND_OVER();
    error ROUND_NOT_OVER();
    error NOT_ALL_PAID();
    error NOTHING_TO_REFUND();

    event CircleCreated(
        uint256 indexed circleId, address indexed creator, address token, uint256 contribution, uint64 roundSeconds
    );
    event Contributed(uint256 indexed circleId, uint32 indexed round, address indexed member, uint256 amount);
    event PotPaid(uint256 indexed circleId, uint32 indexed round, address indexed recipient, uint256 amount);
    event CircleCompleted(uint256 indexed circleId);
    event CircleStopped(uint256 indexed circleId, uint32 round);
    event Refunded(uint256 indexed circleId, uint32 indexed round, address indexed member, uint256 amount);

    /// @param members payout order: members[0] receives round 0's pot, and so on. Must include the creator.
    function create(
        string calldata name,
        IERC20 token,
        uint256 contribution,
        uint64 roundSeconds,
        address[] calldata members
    ) external returns (uint256 circleId) {
        uint256 n = members.length;
        if (n < 2 || n > MAX_MEMBERS) revert BAD_MEMBERS();
        if (contribution == 0) revert ZERO_AMOUNT();
        if (roundSeconds < MIN_ROUND_SECONDS) revert ROUND_TOO_SHORT();

        circleId = _circles.length;
        Circle storage c = _circles.push();
        c.token = token;
        c.contribution = contribution;
        c.roundSeconds = roundSeconds;
        c.roundDeadline = uint64(block.timestamp) + roundSeconds;
        c.creator = msg.sender;
        c.name = name;

        bool creatorIn;
        for (uint256 i; i < n; ++i) {
            address m = members[i];
            if (m == address(0)) revert BAD_MEMBERS();
            if (isMember[circleId][m]) revert DUPLICATE_MEMBER(m);
            isMember[circleId][m] = true;
            c.members.push(m);
            _circlesOf[m].push(circleId);
            if (m == msg.sender) creatorIn = true;
        }
        if (!creatorIn) revert BAD_MEMBERS();

        emit CircleCreated(circleId, msg.sender, address(token), contribution, roundSeconds);
    }

    /// @notice Pay this round's contribution. Pays the pot out automatically when the last member pays.
    function contribute(uint256 circleId) external nonReentrant {
        Circle storage c = _circles[circleId];
        if (c.status != Status.Active) revert NOT_ACTIVE();
        if (!isMember[circleId][msg.sender]) revert NOT_MEMBER();
        if (block.timestamp > c.roundDeadline) revert ROUND_OVER();
        uint32 round = c.round;
        if (hasPaid[circleId][round][msg.sender]) revert ALREADY_PAID();

        hasPaid[circleId][round][msg.sender] = true;
        c.paidCount += 1;
        c.token.safeTransferFrom(msg.sender, address(this), c.contribution);
        emit Contributed(circleId, round, msg.sender, c.contribution);

        if (c.paidCount == c.members.length) _payOut(circleId, c);
    }

    /// @notice After a missed deadline, stops the circle. Callable by anyone.
    function stop(uint256 circleId) public {
        Circle storage c = _circles[circleId];
        if (c.status != Status.Active) revert NOT_ACTIVE();
        if (block.timestamp <= c.roundDeadline) revert ROUND_NOT_OVER();
        c.status = Status.Stopped;
        emit CircleStopped(circleId, c.round);
    }

    /// @notice Take back what you paid into the round that never completed.
    function refund(uint256 circleId) external nonReentrant {
        Circle storage c = _circles[circleId];
        if (c.status == Status.Active) stop(circleId);
        if (c.status != Status.Stopped) revert NOT_ACTIVE();
        uint32 round = c.round;
        if (!hasPaid[circleId][round][msg.sender]) revert NOTHING_TO_REFUND();
        hasPaid[circleId][round][msg.sender] = false;
        c.paidCount -= 1;
        c.token.safeTransfer(msg.sender, c.contribution);
        emit Refunded(circleId, round, msg.sender, c.contribution);
    }

    function _payOut(uint256 circleId, Circle storage c) private {
        uint32 round = c.round;
        address recipient = c.members[round];
        uint256 pot = c.contribution * c.members.length;

        c.paidCount = 0;
        if (round + 1 == c.members.length) {
            c.status = Status.Completed;
        } else {
            c.round = round + 1;
            c.roundDeadline = uint64(block.timestamp) + c.roundSeconds;
        }

        c.token.safeTransfer(recipient, pot);
        emit PotPaid(circleId, round, recipient, pot);
        if (c.status == Status.Completed) emit CircleCompleted(circleId);
    }

    // ------------------------------------------------------------------ views

    function circleCount() external view returns (uint256) {
        return _circles.length;
    }

    function circlesOf(address member) external view returns (uint256[] memory) {
        return _circlesOf[member];
    }

    struct CircleView {
        uint256 id;
        string name;
        address token;
        uint256 contribution;
        uint64 roundSeconds;
        uint64 roundDeadline;
        uint32 round;
        uint32 paidCount;
        Status status;
        address creator;
        address[] members;
        bool[] paidThisRound;
    }

    function getCircle(uint256 circleId) external view returns (CircleView memory v) {
        Circle storage c = _circles[circleId];
        uint256 n = c.members.length;
        bool[] memory paid = new bool[](n);
        for (uint256 i; i < n; ++i) {
            paid[i] = hasPaid[circleId][c.round][c.members[i]];
        }
        v = CircleView({
            id: circleId,
            name: c.name,
            token: address(c.token),
            contribution: c.contribution,
            roundSeconds: c.roundSeconds,
            roundDeadline: c.roundDeadline,
            round: c.round,
            paidCount: c.paidCount,
            status: c.status,
            creator: c.creator,
            members: c.members,
            paidThisRound: paid
        });
    }
}
