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
  uint8 constant maxBatchSize = 10;

  bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE"); // role for operator stuff
  address public constant DEAD_ADDR = 0x000000000000000000000000000000000000dEaD;

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
  function currentGame() external returns (uint256 _gameId, uint8 _roundNumber) {}

  function currentPrizePoolInLatte() external returns (uint256 _amount) {}

  function getLastRoundSurvivors() external returns (uint256 _amount) {}

  /// Operator's functions
  /// @dev create a new game and open for registration
  function create() external onlyOper onlyCompleted {}

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
  /// @param _size - size of the batch
  /// @param _to - address of the player's master
  function buyBatch(uint256 _size, address _to) external onlyOpened returns (uint256[] memory _ids) {
    require(_size != 0, "SurvivalGame::buyBatch::size must be greater than zero");
    require(_size <= maxBatchSize, "SurvivalGame::buyBatch::size must not exceed max batch size");
    uint256 totalPrice;
    uint256 totalLatteBurn;
    {
      GameInfo memory game = gameInfo[gameId];
      uint256 price = game.costPerTicket;
      totalPrice = price.mul(_size);
      uint256 burnBps = game.burnBps;
      totalLatteBurn = totalPrice.mul(burnBps).div(1e4);
    }
    latte.safeTransferFrom(msg.sender, address(this), totalPrice);
    latte.safeTransferFrom(address(this), DEAD_ADDR, totalLatteBurn);
    _ids = new uint256[](_size);
    for (uint256 i = 0; i < _size; ++i) {
      _ids[i] = _buy(_to);
    }
  }

  function checkBatch(uint256[] calldata _ids) external onlyStarted returns (uint256[] memory _survivor_ids) {}

  function voteContinue(uint256[] calldata _ids) external onlyStarted {}

  function voteStop(uint256[] calldata _ids) external onlyStarted {}

  function claimBatch(uint256[] calldata _ids, address _to) external {}

  /// Internal functions
  function _complete() internal {}

  function _buy(address _to) internal returns (uint256 _id) {
    _id = lastPlayerId.add(1);
    playerOwner[_id] = _to;
    playerGame[_id] = gameId;
    playerStatus[gameId][roundNumber] = PlayerStatus.Pending;
    lastPlayerId = _id;
  }

  function _check(uint256 _id) internal onlyMaster(_id) {}

  function _vote(uint256 _id, VoteType _type) internal onlyMaster(_id) {}

  /// @dev mark player as claimed and return claim amount
  function _claim(uint256 _id) internal onlyMaster(_id) returns (bool) {}
}
