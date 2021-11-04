// SPDX-License-Identifier: GPL-3.0
//        .-.                               .-.
//       / (_)         /      /       .--.-'
//      /      .-. ---/------/---.-. (  (_)`)    (  .-.   .-.
//     /      (  |   /      /  ./.-'_ `-.  /  .   )(  |   /  )
//  .-/.    .-.`-'-'/      /   (__.'_    )(_.' `-'  `-'-'/`-'
// (_/ `-._.                       (_.--'               /

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";
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
  using SafeMathUpgradeable for uint256;
  using SafeMath8 for uint8;
  using SafeMath16 for uint16;
  using SafeERC20Upgradeable for IERC20Upgradeable;

  // State variable
  // Instance of LATTE token (collateral currency)
  IERC20Upgradeable public latte;
  // Instance of the random number generator
  IRandomNumberGenerator public entropyGenerator;
  // Minimum required blocks before operator can execute function again
  uint256 public operatorCooldown;

  uint256 public gameId;
  uint256 internal nonce;
  uint256 public prizePoolInLatte;
  uint256 public lastUpdatedBlock;

  // Constants
  uint8 public constant MAX_ROUND = 6;
  uint256 public constant MAX_BUY_LIMIT = 1000;
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
    uint256 finalPrizePerPlayer;
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

  event LogCreateGame(uint256 gameId, uint256 costPerTicket, uint256 burnBps);
  event LogSetGameStatus(uint256 gameId, string status);
  event LogSetTotalPlayer(uint256 gameId, uint256 totalPlayer);
  event LogSetRoundNumber(uint256 gameId, uint8 roundNumber);
  event LogSetFinalPrizePerPlayer(uint256 gameId, uint256 prize);
  event LogCreateRound(uint256 gameId, uint8 roundNumber, uint256 prizeDistribution, uint256 survivalBps);
  event LogRequestRandomNumber(uint256 gameId, uint8 roundNumber, bytes32 requestId);
  event LogSetEntropy(uint256 gameId, uint8 roundNumber, uint256 entropy);

  event LogBuyPlayer(uint256 gameId, address to, uint256 size);
  event LogSetRemainingVoteCount(uint256 gameId, uint8 roundNumber, address playerMaster, uint256 remainingVoteCount);
  event LogCurrentVoteCount(uint256 gameId, uint8 roundNumber, uint256 voteContinueCount, uint256 voteStopCount);
  event LogSetRoundSurvivorCount(uint256 gameId, uint8 roundNumber, uint256 survivorCount);
  event LogClaimReward(uint256 gameId, address to, uint256 players, uint256 amount);

  /**
   * @notice Constructor
   * @param _latte: LATTE token contract
   */
  function initialize(
    address _latte,
    address _entropyGenerator,
    uint256 _operatorCooldown
  ) external initializer {
    // init functions
    OwnableUpgradeable.__Ownable_init();
    ReentrancyGuardUpgradeable.__ReentrancyGuard_init();
    AccessControlUpgradeable.__AccessControl_init();

    latte = IERC20Upgradeable(_latte);
    entropyGenerator = IRandomNumberGenerator(_entropyGenerator);
    operatorCooldown = _operatorCooldown;

    gameId = 0;
    nonce = 0;
    prizePoolInLatte = 0;
    lastUpdatedBlock = 0;

    // create and assign default roles
    _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
    _setupRole(OPERATOR_ROLE, _msgSender());
  }

  /// Modifier
  /// @dev only the one having a OPERATOR_ROLE can continue an execution
  modifier onlyOper() {
    require(hasRole(OPERATOR_ROLE, _msgSender()), "SurvivalGame::onlyOper::only OPERATOR role");
    require(
      uint256(block.timestamp) - lastUpdatedBlock >= operatorCooldown,
      "SurvivalGame::onlyOper::OPERATOR should not proceed the game consecutively"
    );
    _;
  }

  /// @dev only the entropy generator can continue an execution
  modifier onlyEntropyGenerator() {
    require(msg.sender == address(entropyGenerator), "SurvivalGame::onlyEntropyGenerator::only entropy generator");
    _;
  }

  /// @dev only before game starting
  modifier onlyOpened() {
    require(gameInfo[gameId].status == GameStatus.Opened, "SurvivalGame::onlyOpened::only before game starting");
    _;
  }

  /// @dev only after game started
  modifier onlyStarted() {
    require(gameInfo[gameId].status == GameStatus.Started, "SurvivalGame::onlyStarted::only after game started");
    _;
  }

  /// @dev only before game opened
  modifier onlyBeforeOpen() {
    require(
      gameInfo[gameId].status == GameStatus.Completed || gameInfo[gameId].status == GameStatus.NotStarted,
      "SurvivalGame::onlyBeforeOpen::only before game opened"
    );
    _;
  }

  /// @dev only after game completed
  modifier onlyCompleted() {
    require(gameInfo[gameId].status == GameStatus.Completed, "SurvivalGame::onlyCompleted::only after game completed");
    _;
  }

  /// Getter functions
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
    uint256[6] calldata _prizeDistributions,
    uint256[6] calldata _survivalsBps
  ) external onlyOper onlyBeforeOpen {
    gameId = gameId.add(1);
    // Note: nonce is not reset

    gameInfo[gameId] = GameInfo({
      status: GameStatus.Opened,
      roundNumber: 0,
      finalPrizePerPlayer: 0,
      totalPlayer: 0,
      costPerTicket: _costPerTicket,
      burnBps: _burnBps
    });

    emit LogCreateGame(gameId, _costPerTicket, _burnBps);
    emit LogSetGameStatus(gameId, "Opened");

    // Warning: Round index start from 1 not 0
    for (uint8 i = 1; i <= MAX_ROUND; ++i) {
      require(
        _prizeDistributions[i.sub(1)] > 0 && _prizeDistributions[i.sub(1)] <= 1e4,
        "SurvivalGame::create::invalid prizeDistributions BPS"
      );
      require(
        _survivalsBps[i.sub(1)] > 0 && _survivalsBps[i.sub(1)] <= 1e4,
        "SurvivalGame::create::invalid survival BPS"
      );
      RoundInfo memory _roundInfo = RoundInfo({
        prizeDistribution: _prizeDistributions[i.sub(1)],
        survivalBps: _survivalsBps[i.sub(1)],
        stopVoteCount: 0,
        continueVoteCount: 0,
        survivorCount: 0,
        requestId: bytes32(0),
        entropy: 0
      });

      roundInfo[gameId][i] = _roundInfo;
      emit LogCreateRound(gameId, i, _prizeDistributions[i - 1], _survivalsBps[i - 1]);
    }
    lastUpdatedBlock = block.number;
  }

  /// @dev close registration and start round 1
  function start() external onlyOper onlyOpened {
    gameInfo[gameId].status = GameStatus.Processing;
    _requestRandomNumber();
    lastUpdatedBlock = block.number;
    emit LogSetGameStatus(gameId, "Processing");
  }

  /// @dev sum up each round and either continue next round or complete the game
  function processing() external onlyOper onlyStarted {
    uint8 _roundNumber = gameInfo[gameId].roundNumber;
    if (
      roundInfo[gameId][_roundNumber].stopVoteCount > roundInfo[gameId][_roundNumber].continueVoteCount ||
      _roundNumber == MAX_ROUND ||
      roundInfo[gameId][_roundNumber].survivorCount == 0
    ) {
      _complete();
    } else {
      gameInfo[gameId].status = GameStatus.Processing;
      _requestRandomNumber();

      emit LogSetGameStatus(gameId, "Processing");
    }
  }

  function consumeRandomNumber(bytes32 _requestId, uint256 _randomNumber) external override onlyEntropyGenerator {
    uint8 _nextRoundNumber = gameInfo[gameId].roundNumber.add(1);
    bytes32 _nextRoundRequestId = roundInfo[gameId][_nextRoundNumber].requestId;
    // Do not revert transaction when requestId is incorrect to avoid VRF routine mulfunction
    if (_requestId == _nextRoundRequestId) {
      _proceed(_randomNumber);
    }
  }

  // /// @dev force complete the game
  // function complete() external onlyOper onlyStarted {
  //   _complete();
  // }

  /// User's functions
  /// @dev buy players and give ownership to _to
  /// @param _size - size of the batch
  /// @param _to - address of the player's master
  function buy(uint256 _size, address _to) external onlyOpened nonReentrant returns (uint256 _remainingPlayerCount) {
    require(_size != 0, "SurvivalGame::buy::size must be greater than zero");
    require(
      userInfo[gameId][0][_to].remainingPlayerCount.add(_size) <= MAX_BUY_LIMIT,
      "SurvivalGame::buy::size must not exceed max buy limit"
    );
    uint256 _totalPrice;
    uint256 _totalLatteBurn;
    {
      uint256 _price = gameInfo[gameId].costPerTicket;
      _totalPrice = _price.mul(_size);
      _totalLatteBurn = _totalPrice.mul(gameInfo[gameId].burnBps).div(1e4);
    }
    latte.safeTransferFrom(msg.sender, address(this), _totalPrice);
    latte.safeTransfer(DEAD_ADDR, _totalLatteBurn);
    prizePoolInLatte = prizePoolInLatte.add(_totalPrice).sub(_totalLatteBurn);
    userInfo[gameId][0][_to].remainingPlayerCount = userInfo[gameId][0][_to].remainingPlayerCount.add(_size);
    _remainingPlayerCount = userInfo[gameId][0][_to].remainingPlayerCount;
    gameInfo[gameId].totalPlayer = gameInfo[gameId].totalPlayer.add(_size);

    emit LogBuyPlayer(gameId, _to, _size);
    emit LogSetTotalPlayer(gameId, gameInfo[gameId].totalPlayer);
  }

  /// @dev check if there are players left
  function check() external onlyStarted nonReentrant returns (uint256 _survivorCount) {
    uint8 _roundNumber = gameInfo[gameId].roundNumber;
    uint8 _lastRoundNumber = _roundNumber.sub(1);
    uint256 _remainingPlayerCount = userInfo[gameId][_lastRoundNumber][msg.sender].remainingPlayerCount;
    require(_remainingPlayerCount != 0, "SurvivalGame::checkBatch::no players to be checked");

    RoundInfo memory _roundInfo = roundInfo[gameId][_roundNumber];
    uint256 _entropy = _roundInfo.entropy;
    require(_entropy != 0, "SurvivalGame::_check::no entropy");
    uint256 _survivalBps = _roundInfo.survivalBps;
    {
      _survivorCount = 0;
      for (uint256 i = 0; i < _remainingPlayerCount; ++i) {
        bytes memory _data = abi.encodePacked(_entropy, address(this), msg.sender, ++nonce);
        // eliminated if hash value mod 100 more than the survive percent
        bool _survived = _survivalBps > (uint256(keccak256(_data)) % 1e4);
        if (_survived) {
          ++_survivorCount;
        }
      }
      userInfo[gameId][_roundNumber][msg.sender].remainingPlayerCount = _survivorCount;
      userInfo[gameId][_roundNumber][msg.sender].remainingVoteCount = _survivorCount;
      roundInfo[gameId][_roundNumber].survivorCount = roundInfo[gameId][_roundNumber].survivorCount.add(_survivorCount);
      userInfo[gameId][_lastRoundNumber][msg.sender].remainingPlayerCount = 0;

      emit LogSetRoundSurvivorCount(gameId, _roundNumber, roundInfo[gameId][_roundNumber].survivorCount);
      emit LogSetRemainingVoteCount(
        gameId,
        _roundNumber,
        msg.sender,
        userInfo[gameId][_roundNumber][msg.sender].remainingVoteCount
      );
    }
  }

  function voteContinue() external onlyStarted nonReentrant {
    uint8 _roundNumber = gameInfo[gameId].roundNumber;
    uint256 _voteCount = userInfo[gameId][_roundNumber][msg.sender].remainingVoteCount;
    require(_voteCount > 0, "SurvivalGame::_vote::no remaining vote");
    userInfo[gameId][_roundNumber][msg.sender].remainingVoteCount = 0;
    roundInfo[gameId][_roundNumber].continueVoteCount = roundInfo[gameId][_roundNumber].continueVoteCount.add(
      _voteCount
    );
    emit LogSetRemainingVoteCount(gameId, _roundNumber, msg.sender, 0);
    emit LogCurrentVoteCount(
      gameId,
      _roundNumber,
      roundInfo[gameId][_roundNumber].continueVoteCount,
      roundInfo[gameId][_roundNumber].stopVoteCount
    );
  }

  function voteStop() external onlyStarted nonReentrant {
    uint8 _roundNumber = gameInfo[gameId].roundNumber;
    uint256 _voteCount = userInfo[gameId][_roundNumber][msg.sender].remainingVoteCount;
    require(_voteCount > 0, "SurvivalGame::_vote::no remaining vote");
    userInfo[gameId][_roundNumber][msg.sender].remainingVoteCount = 0;
    roundInfo[gameId][_roundNumber].stopVoteCount = roundInfo[gameId][_roundNumber].stopVoteCount.add(_voteCount);
    emit LogSetRemainingVoteCount(gameId, _roundNumber, msg.sender, 0);
    emit LogCurrentVoteCount(
      gameId,
      _roundNumber,
      roundInfo[gameId][_roundNumber].continueVoteCount,
      roundInfo[gameId][_roundNumber].stopVoteCount
    );
  }

  function claim(address _to) external nonReentrant onlyCompleted {
    uint8 _roundNumber = gameInfo[gameId].roundNumber;
    UserInfo memory _userInfo = userInfo[gameId][_roundNumber][msg.sender];
    require(!_userInfo.claimed, "SurvivalGame::claim::rewards has been claimed");
    uint256 _remainingPlayer = _userInfo.remainingPlayerCount;
    require(_remainingPlayer > 0, "SurvivalGame::claim::no reward for losers");
    uint256 _pendingReward = gameInfo[gameId].finalPrizePerPlayer.mul(_remainingPlayer);
    latte.safeTransfer(_to, _pendingReward);
    userInfo[gameId][_roundNumber][msg.sender].claimed = true;

    emit LogClaimReward(gameId, _to, _remainingPlayer, _pendingReward);
  }

  function _requestRandomNumber() internal {
    uint8 _nextRoundNumber = gameInfo[gameId].roundNumber.add(1);
    bytes32 _requestId = roundInfo[gameId][_nextRoundNumber].requestId;
    require(_requestId == bytes32(0), "SurvivalGame::_requestRandomNumber::random numnber has been requested");
    IERC20Upgradeable feeToken = IERC20Upgradeable(entropyGenerator.feeToken());
    uint256 _feeAmount = entropyGenerator.feeAmount();
    feeToken.safeTransferFrom(msg.sender, address(entropyGenerator), _feeAmount);
    roundInfo[gameId][_nextRoundNumber].requestId = entropyGenerator.randomNumber();

    emit LogRequestRandomNumber(gameId, _nextRoundNumber, roundInfo[gameId][_nextRoundNumber].requestId);
  }

  function _proceed(uint256 _entropy) internal {
    uint8 _nextRoundNumber = gameInfo[gameId].roundNumber.add(1);
    roundInfo[gameId][_nextRoundNumber].entropy = _entropy;
    emit LogSetEntropy(gameId, _nextRoundNumber, _entropy);

    gameInfo[gameId].roundNumber = _nextRoundNumber;
    emit LogSetRoundNumber(gameId, _nextRoundNumber);

    gameInfo[gameId].status = GameStatus.Started;
    emit LogSetGameStatus(gameId, "Started");

    lastUpdatedBlock = block.number;
  }

  function _complete() internal {
    uint8 _roundNumber = gameInfo[gameId].roundNumber;
    RoundInfo memory _roundInfo = roundInfo[gameId][_roundNumber];
    uint256 _finalPrizeInLatte = prizePoolInLatte.mul(_roundInfo.prizeDistribution).div(1e4);
    uint256 _survivorCount = _roundInfo.survivorCount;
    if (_survivorCount > 0) {
      gameInfo[gameId].finalPrizePerPlayer = _finalPrizeInLatte.div(_survivorCount);
    }
    emit LogSetFinalPrizePerPlayer(gameId, gameInfo[gameId].finalPrizePerPlayer);

    gameInfo[gameId].status = GameStatus.Completed;
    emit LogSetGameStatus(gameId, "Completed");

    lastUpdatedBlock = block.number;
  }
}
