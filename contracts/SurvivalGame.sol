// SPDX-License-Identifier: GPL-3.0
//        .-.                               .-.
//       / (_)         /      /       .--.-'
//      /      .-. ---/------/---.-. (  (_)`)    (  .-.   .-.
//     /      (  |   /      /  ./.-'_ `-.  /  .   )(  |   /  )
//  .-/.    .-.`-'-'/      /   (__.'_    )(_.' `-'  `-'-'/`-'
// (_/ `-._.                       (_.--'               /

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

import "./math/SafeMath8.sol";
import "./math/SafeMath16.sol";

contract SurvivalGame is OwnableUpgradeable, ReentrancyGuardUpgradeable, AccessControlUpgradeable {
  // Libraries
  using SafeMath for uint256;
  using SafeMath8 for uint8;
  using SafeMath16 for uint16;
  using SafeERC20 for IERC20;

  // State variable
  // Instance of LATTE token (collateral currency)
  IERC20 internal latte;
  uint256 internal gameId;
  uint256 internal lastPlayerId;
  uint256 internal prizePoolInLatte;
  uint8 internal roundNumber;
  uint8 constant maxRound = 6;

  bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE"); // role for operator stuff

  // Represents the status of the game
  enum GameStatus {
    Opened, // The game has been opened for the registration
    Started, // The game has been started
    Completed // The game has been completed and might have the winners
  }

  enum PlayerStatus {
    Pending, // The player have to check was killed
    Dead, // The player was killed
    Voting, // The player waiting to vote
    Survived // The player is survived of round
  }

  enum VoteType {
    Continue,
    Stop
  }

  // All the needed info around the game
  struct GameInfo {
    GameStatus status;
    uint8 roundNumber;
    uint256 finalPrizeInLatte;
    uint256 costPerTicket;
    uint256 burnBps;
    uint256 totalPlayer;
  }

  struct RoundInfo {
    uint256 prizeDistribution;
    uint256 survivalBps;
    uint256 stopVoteCount;
    uint256 continueVoteCount;
    uint256 surviverCount;
    uint256 entropy;
  }

  // GameInfo ID's to info
  mapping(uint256 => GameInfo) public gameInfo;

  // Round Info
  mapping(uint256 => mapping(uint256 => RoundInfo)) public roundInfo;

  // Player
  mapping(uint256 => address) public playerOwner;
  mapping(uint256 => uint256) public playerGame;
  mapping(uint256 => mapping(uint8 => PlayerStatus)) public playerStatus;

  /**
   * @notice Constructor
   * @param _latte: LATTE token contract
   */
  function initialize(address _latte) external initializer {
    OwnableUpgradeable.__Ownable_init();
    ReentrancyGuardUpgradeable.__ReentrancyGuard_init();
    AccessControlUpgradeable.__AccessControl_init();

    latte = IERC20(_latte);
    gameId = 0;
    roundNumber = 0;
    lastPlayerId = 0;

    _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
    _setupRole(OPERATOR_ROLE, _msgSender());
  }

  /// Modifier
  /// @dev only the one having a OPERATOR_ROLE can continue an execution
  modifier onlyOper() {
    require(hasRole(OPERATOR_ROLE, _msgSender()), "SurvialGame::onlyOper::only OPERATOR role");
    _;
  }

  /// @dev only the master of the player can continue an execution
  modifier onlyMaster(uint256 _id) {
    require(playerOwner[_id] == msg.sender, "SurvialGame::onlyMaster::only player's master");
    _;
  }

  /// @dev only before game starting
  modifier onlyOpened() {
    require(gameInfo[gameId].status == GameStatus.Opened, "SurvialGame::onlyOpened::only before game starting");
    _;
  }

  /// @dev only after game started
  modifier onlyStarted() {
    require(gameInfo[gameId].status == GameStatus.Started, "SurvialGame::onlyStarted::only after game started");
    _;
  }

  /// @dev only after game completed
  modifier onlyCompleted() {
    require(gameInfo[gameId].status == GameStatus.Completed, "SurvialGame::onlyCompleted::only after game completed");
    _;
  }

  /// Getter functions
  function currentGame() external returns (uint256 _gameId, uint8 _roundNumber) {
    return (uint256 gameId, uint8 roundNumber)
  }

  function currentPrizePoolInLatte() external returns (uint256 _amount) {
    return (uint256 prizePoolInLatte)
  }

  function getLastRoundSurvivors() external onlyStarted returns (uint256 _amount) {
    if(roundNumber == 1) {
      _amount = gameInfo[gameId].totalPlayer
    } else {
      _amount = roundInfo[gameId][roundNumber.sub(1);].surviverCount
    }
  }

  /// Operator's functions
  /// @dev create a new game and open for registration
  function create(uint256 ticketPrice, uint256 burnBps) external onlyOper onlyCompleted {
    roundNumber = 0
    info = new GameInfo({
      roundNumber: 0
      finalPrizeInLatte: 0
      totalPlayer: 0
      costPerTicket: ticketPrice
      burnBps: burnBps
    })
    // set total start with 0
  }

  /// @dev close registration and start round 1
  function start() external onlyOper onlyOpened {}

  /// @dev sum up each round and either continue next round or complete the game
  function proceed() external onlyOper onlyStarted {}

  /// @dev force complete the game
  function complete() external onlyOper onlyStarted {
    _complete();
  }

  /// User's functions
  /// @dev buy players and give ownership to _to
  function buyBatch(uint256 _playerAmount, address _to) external onlyOpened {}

  function checkBatch(uint256[] calldata _ids) external onlyStarted returns (uint256[] memory _survivor_ids) {}

  function voteContinue(uint256[] calldata _ids) external onlyStarted {}

  function voteStop(uint256[] calldata _ids) external onlyStarted {}

  function claimBatch(uint256[] calldata _ids, address _to) external {}

  /// Internal functions
  function _complete() internal {}

  function _buy(address _to) internal {}

  function _check(uint256 _id) internal onlyMaster(_id) {}

  function _vote(uint256 _id, VoteType _type) internal onlyMaster(_id) {}

  /// @dev mark player as claimed and return claim amount
  function _claim(uint256 _id) internal onlyMaster(_id) returns (bool) {}
}
