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
import "./interfaces/IRandomNumberGenerator.sol";
import "./interfaces/IRandomNumberConsumer.sol";

contract SurvivalGame is
  IRandomNumberConsumer,
  OwnableUpgradeable,
  ReentrancyGuardUpgradeable,
  AccessControlUpgradeable
{
  // Libraries
  using SafeMath for uint256;
  using SafeMath8 for uint8;
  using SafeMath16 for uint16;
  using SafeERC20 for IERC20;

  // State variable
  // Instance of LATTE token (collateral currency)
  IERC20 internal latte;
  // Instance of the random number generator
  IRandomNumberGenerator internal entropyGenerator;

  uint256 internal gameId = 0;
  uint256 internal nonce = 0;
  uint256 internal prizePoolInLatte = 0;

  // Constants
  uint8 public constant maxRound = 6;
  uint8 public constant maxBatchSize = 10;
  bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE"); // role for operator stuff
  address public constant DEAD_ADDR = 0x000000000000000000000000000000000000dEaD;

  // Represents the status of the game
  enum GameStatus {
    NotStarted, //The game has not started yet
    Opened, // The game has been opened for the registration
    Processing, // The game is preparing for the next state
    Started, // The game has been started
    Completed // The game has been completed and might have the winners
  }

  // All the needed info around the game
  struct GameInfo {
    GameStatus status;
    uint8 roundNumber;
    uint256 finalPrizePerUser;
    uint256 costPerTicket;
    uint256 burnBps;
    uint256 totalPlayer;
  }

  struct RoundInfo {
    uint256 prizeDistribution;
    uint256 survivalBps;
    uint256 stopVoteCount;
    uint256 continueVoteCount;
    uint256 survivorCount;
    // Request ID for random number
    bytes32 requestId;
    uint256 entropy;
  }

  struct UserInfo {
    uint256 remainingPlayerCount;
    uint256 remainingVoteCount;
    bool claimed;
  }

  // Game Info
  // gameId => gameInfo
  mapping(uint256 => GameInfo) public gameInfo;

  // Round Info
  // gameId => roundNumber => roundInfo
  mapping(uint256 => mapping(uint8 => RoundInfo)) public roundInfo;

  // User Info
  // gameId => roundNumber => userAddress => userInfo
  mapping(uint256 => mapping(uint8 => mapping(address => UserInfo))) public userInfo;

  /**
   * @notice Constructor
   * @param _latte: LATTE token contract
   */
  function initialize(address _latte, address _entropyGenerator) external initializer {
    // init functions
    OwnableUpgradeable.__Ownable_init();
    ReentrancyGuardUpgradeable.__ReentrancyGuard_init();
    AccessControlUpgradeable.__AccessControl_init();

    latte = IERC20(_latte);
    entropyGenerator = IRandomNumberGenerator(_entropyGenerator);

    // create and assign default roles
    _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
    _setupRole(OPERATOR_ROLE, _msgSender());
  }

  /// Modifier
  /// @dev only the one having a OPERATOR_ROLE can continue an execution
  modifier onlyOper() {
    require(hasRole(OPERATOR_ROLE, _msgSender()), "SurvialGame::onlyOper::only OPERATOR role");
    _;
  }

  /// @dev only the entropy generator can continue an execution
  modifier onlyEntropyGenerator() {
    require(msg.sender == address(entropyGenerator), "SurvialGame::onlyEntropyGenerator::only after game completed");
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

  /// @dev only before game opened
  modifier onlyBeforeOpen() {
    require(
      gameInfo[gameId].status == GameStatus.Completed || gameInfo[gameId].status == GameStatus.NotStarted,
      "SurvialGame::onlyBeforeOpen::only before game opened"
    );
    _;
  }

  /// @dev only before game opened
  modifier onlyCompleted() {
    require(gameInfo[gameId].status == GameStatus.Completed, "SurvialGame::onlyCompleted::only before game opened");
    _;
  }

  /// Getter functions
  function currentGame() external view returns (uint256 _gameId, uint8 _roundNumber) {
    _gameId = gameId;
    _roundNumber = gameInfo[gameId].roundNumber;
  }

  function currentPrizePoolInLatte() external view returns (uint256 _amount) {
    _amount = prizePoolInLatte;
  }

  function lastRoundSurvivors() external view onlyStarted returns (uint256 _amount) {
    GameInfo memory _gameInfo = gameInfo[gameId];
    if (_gameInfo.roundNumber == 1) {
      _amount = _gameInfo.totalPlayer;
    } else {
      _amount = roundInfo[gameId][_gameInfo.roundNumber.sub(1)].survivorCount;
    }
  }

  /// Operator's functions
  /// @dev create a new game and open for registration
  function create(
    uint256 _costPerTicket,
    uint256 _burnBps,
    uint256[6] calldata prizeDistributions,
    uint256[6] calldata survivalsBps
  ) external onlyOper onlyBeforeOpen {
    gameId = gameId.add(1);
    // Note: nonce is not reset

    gameInfo[gameId] = GameInfo({
      status: GameStatus.Opened,
      roundNumber: 0,
      finalPrizePerUser: 0,
      totalPlayer: 0,
      costPerTicket: _costPerTicket,
      burnBps: _burnBps
    });

    // Warning: Round index start from 1 not 0
    for (uint8 i = 1; i <= maxRound; ++i) {
      RoundInfo memory _roundInfo = RoundInfo({
        prizeDistribution: prizeDistributions[i.sub(1)],
        survivalBps: survivalsBps[i.sub(1)],
        stopVoteCount: 0,
        continueVoteCount: 0,
        survivorCount: 0,
        requestId: bytes32(0),
        entropy: 0
      });
      roundInfo[gameId][i] = _roundInfo;
    }
  }

  /// @dev close registration and start round 1
  function start() external onlyOper onlyOpened {
    gameInfo[gameId].status = GameStatus.Processing;
    _requestRandomNumber();
  }

  /// @dev sum up each round and either continue next round or complete the game
  function processing() external onlyOper onlyStarted {
    uint8 roundNumber = gameInfo[gameId].roundNumber;
    if (
      roundInfo[gameId][roundNumber].stopVoteCount > roundInfo[gameId][roundNumber].continueVoteCount ||
      roundNumber == maxRound ||
      roundInfo[gameId][roundNumber].survivorCount == 0
    ) {
      _complete();
    } else {
      gameInfo[gameId].status = GameStatus.Processing;
      _requestRandomNumber();
    }
  }

  function _requestRandomNumber() internal {
    uint8 nextRoundNumber = gameInfo[gameId].roundNumber.add(1);
    bytes32 requestId = roundInfo[gameId][nextRoundNumber].requestId;
    require(requestId == bytes32(0), "SurvivalGame::_requestRandomNumber::random numnber has been requested");
    roundInfo[gameId][nextRoundNumber].requestId = entropyGenerator.randomNumber();
  }

  function consumeRandomNumber(bytes32 _requestId, uint256 _randomNumber) external override onlyEntropyGenerator {
    uint8 nextRoundNumber = gameInfo[gameId].roundNumber.add(1);
    bytes32 requestId = roundInfo[gameId][nextRoundNumber].requestId;
    require(requestId == _requestId, "SurvivalGame::consumeRandomNumber:: invalid requestId");
    _proceed(_randomNumber);
  }

  function _proceed(uint256 _entropy) internal {
    uint8 nextRoundNumber = gameInfo[gameId].roundNumber.add(1);
    roundInfo[gameId][nextRoundNumber].entropy = _entropy;
    gameInfo[gameId].roundNumber = nextRoundNumber;
    gameInfo[gameId].status = GameStatus.Started;
  }

  /// @dev force complete the game
  function complete() external onlyOper onlyStarted {
    _complete();
  }

  /// User's functions
  /// @dev buy players and give ownership to _to
  /// @param _size - size of the batch
  /// @param _to - address of the player's master
  function buy(uint256 _size, address _to) external onlyOpened nonReentrant returns (uint256 _remainingPlayerCount) {
    require(_size != 0, "SurvivalGame::buyBatch::size must be greater than zero");
    //require(_size <= maxBatchSize, "SurvivalGame::buyBatch::size must not exceed max batch size");
    uint256 totalPrice;
    uint256 totalLatteBurn;
    {
      uint256 price = gameInfo[gameId].costPerTicket;
      totalPrice = price.mul(_size);
      totalLatteBurn = totalPrice.mul(gameInfo[gameId].burnBps).div(1e4);
    }
    latte.safeTransferFrom(msg.sender, address(this), totalPrice);
    latte.safeTransfer(DEAD_ADDR, totalLatteBurn);
    userInfo[gameId][0][_to].remainingPlayerCount.add(_size);
    _remainingPlayerCount = userInfo[gameId][0][_to].remainingPlayerCount;
  }

  /// @dev check if there are players left
  function check() external onlyStarted nonReentrant returns (uint256 _survivorCount) {
    uint8 roundNumber = gameInfo[gameId].roundNumber;
    uint8 lastRoundNumber = roundNumber.sub(1);
    uint256 _remainingPlayerCount = userInfo[gameId][lastRoundNumber][msg.sender].remainingPlayerCount;
    require(_remainingPlayerCount != 0, "SurvivalGame::checkBatch::no players to be checked");
    //require(_remainingPlayerCount <= maxBatchSize, "SurvivalGame::checkBatch::players exceed max batch size");

    RoundInfo memory _roundInfo = roundInfo[gameId][roundNumber];
    uint256 entropy = _roundInfo.entropy;
    require(entropy != 0, "SurvivalGame::_check::no entropy");
    uint256 survivalBps = _roundInfo.survivalBps;
    require(survivalBps != 0, "SurvivalGame::_check::no survival BPS");
    {
      _survivorCount = 0;
      for (uint256 i = 0; i < _remainingPlayerCount; ++i) {
        bytes memory data = abi.encodePacked(entropy, address(this), msg.sender, ++nonce);
        // eliminated if hash value mod 100 more than the survive percent
        bool survived = (uint256(keccak256(data)) % 1e2) > survivalBps.div(1e4);
        if (survived) {
          _survivorCount.add(1);
        }
      }
      userInfo[gameId][roundNumber][msg.sender].remainingPlayerCount = _survivorCount;
      userInfo[gameId][roundNumber][msg.sender].remainingVoteCount = _survivorCount;
      roundInfo[gameId][roundNumber].survivorCount.add(_survivorCount);
      userInfo[gameId][lastRoundNumber][msg.sender].remainingPlayerCount = 0;
    }
  }

  function voteContinue() external onlyStarted nonReentrant {
    uint8 roundNumber = gameInfo[gameId].roundNumber;
    uint256 voteCount = userInfo[gameId][roundNumber][msg.sender].remainingVoteCount;
    require(voteCount > 0, "SurvivalGame::_vote::no remaining vote");
    userInfo[gameId][roundNumber][msg.sender].remainingVoteCount = 0;
    roundInfo[gameId][roundNumber].continueVoteCount.add(voteCount);
  }

  function voteStop() external onlyStarted nonReentrant {
    uint8 roundNumber = gameInfo[gameId].roundNumber;
    uint256 voteCount = userInfo[gameId][roundNumber][msg.sender].remainingVoteCount;
    require(voteCount > 0, "SurvivalGame::_vote::no remaining vote");
    userInfo[gameId][roundNumber][msg.sender].remainingVoteCount = 0;
    roundInfo[gameId][roundNumber].stopVoteCount.add(voteCount);
  }

  function claim(address _to) external nonReentrant onlyCompleted {
    uint8 roundNumber = gameInfo[gameId].roundNumber;
    UserInfo memory _userInfo = userInfo[gameId][roundNumber][msg.sender];
    require(!_userInfo.claimed, "SurvivalGame::claim::rewards has been claimed");
    uint256 _remainingPlayer = _userInfo.remainingPlayerCount;
    require(_remainingPlayer > 0, "SurvivalGame::claim::no reward for losers");
    uint256 pendingReward = gameInfo[gameId].finalPrizePerUser.mul(_remainingPlayer);
    latte.safeTransfer(_to, pendingReward);
    userInfo[gameId][roundNumber][msg.sender].claimed = true;
  }

  /// Internal functions
  function _complete() internal {
    uint8 _roundNumber = gameInfo[gameId].roundNumber;
    RoundInfo memory _roundInfo = roundInfo[gameId][_roundNumber];
    uint256 finalPrizeInLatte = prizePoolInLatte.mul(_roundInfo.prizeDistribution).div(1e4);
    uint256 survivorCount = _roundInfo.survivorCount;
    gameInfo[gameId].finalPrizePerUser = finalPrizeInLatte.div(survivorCount);
    gameInfo[gameId].status = GameStatus.Completed;
  }
}
