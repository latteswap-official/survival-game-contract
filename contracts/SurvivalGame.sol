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
    Processing, // The game is preparing for the next state
    Started, // The game has been started
    Completed // The game has been completed and might have the winners
  }

  enum PlayerStatus {
    Pending, // The player have to check was killed
    Dead, // The player was killed
    Survived // The player survived the round
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
    uint256 survivorCount;
    // Request ID for random number
    bytes32 requestId;
    uint256 entropy;
  }

  // GameInfo ID's to info
  mapping(uint256 => GameInfo) public gameInfo;

  // Round Info
  mapping(uint256 => mapping(uint256 => RoundInfo)) public roundInfo;

  // Player
  mapping(uint256 => address) public playerMaster;
  mapping(uint256 => uint256) public playerGame;
  // player id => round number => status
  mapping(uint256 => mapping(uint8 => PlayerStatus)) public playerStatus;
  // game id => round number => master address => remaining votes
  mapping(uint256 => mapping(uint8 => mapping(address => uint256))) public remainingVote;

  event CreateGame(uint256 gameId, uint256 ticketPrice, uint256 burnBps);
  event SetGameStatus(uint256 gameId, string status);
  event SetTotalPlayer(uint256 gameId, uint256 totalPlayer);
  event SetRoundNumber(uint256 gameId, uint8 roundNumber);

  event CreateRound(uint256 gameId, uint8 roundNumber, uint256 prizeDistribution, uint256 survivalBps);
  event RequestRandomNumber(uint256 gameId, uint8 roundNumber, bytes32 requestId);
  event SetEntropy(uint256 gameId, uint8 roundNumber, uint256 entropy);
  
  event Buy(uint256 gameId, address playerMaster, uint256 playerId);
  event SetPlayerStatus(uint256 playerId, uint8 roundNumber, string status);
  event SetRemainingVote(uint256 gameId, uint8 roundNumber, address playerMaster, uint256 amount);
  event SetRoundSurvivor(uint256 gameId, uint8 roundNumber, uint256 survivorCount);

  /**
   * @notice Constructor
   * @param _latte: LATTE token contract
   */
  function initialize(address _latte, address _entropyGenerator) external initializer {
    OwnableUpgradeable.__Ownable_init();
    ReentrancyGuardUpgradeable.__ReentrancyGuard_init();
    AccessControlUpgradeable.__AccessControl_init();
    latte = IERC20(_latte);
    gameId = 0;
    roundNumber = 0;
    lastPlayerId = 0;

    _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
    _setupRole(OPERATOR_ROLE, _msgSender());
    entropyGenerator = IRandomNumberGenerator(_entropyGenerator);
  }

  /// Modifier
  /// @dev only the one having a OPERATOR_ROLE can continue an execution
  modifier onlyOper() {
    require(hasRole(OPERATOR_ROLE, _msgSender()), "SurvialGame::onlyOper::only OPERATOR role");
    _;
  }

  /// @dev only the master of the player can continue an execution
  modifier onlyMaster(uint256 _id) {
    require(playerMaster[_id] == msg.sender, "SurvialGame::onlyMaster::only player's master");
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

  /// @dev only after game completed
  modifier onlyCompleted() {
    require(gameInfo[gameId].status == GameStatus.Completed, "SurvialGame::onlyCompleted::only after game completed");
    _;
  }

  /// Getter functions
  function currentGame() external view returns (uint256 _gameId, uint8 _roundNumber) {
    _gameId = gameId;
    _roundNumber = roundNumber;
  }

  function currentPrizePoolInLatte() external view returns (uint256 _amount) {
    _amount = prizePoolInLatte;
  }

  function lastRoundSurvivors() external view onlyStarted returns (uint256 _amount) {
    if (roundNumber == 1) {
      _amount = gameInfo[gameId].totalPlayer;
    } else {
      _amount = roundInfo[gameId][roundNumber.sub(1)].survivorCount;
    }
  }

  /// Operator's functions
  /// @dev create a new game and open for registration
  function create(
    uint256 ticketPrice,
    uint256 burnBps,
    uint256[6] calldata prizeDistributions,
    uint256[6] calldata survivalsBps
  ) external onlyOper onlyCompleted {
    roundNumber = 0;
    gameId = gameId.add(1);
    GameInfo memory newGameInfo = GameInfo({
      status: GameStatus.Opened,
      roundNumber: 0,
      finalPrizeInLatte: 0,
      totalPlayer: 0,
      costPerTicket: ticketPrice,
      burnBps: burnBps
    });
    gameInfo[gameId] = newGameInfo;

    emit CreateGame(gameId, ticketPrice, burnBps);
    emit SetGameStatus(gameId, "Opened");

    // Warning: Round index start from 1 not 0
    for (uint8 i = 1; i <= maxRound; ++i) {
      RoundInfo memory initRound = RoundInfo({
        prizeDistribution: prizeDistributions[i - 1],
        survivalBps: survivalsBps[i - 1],
        stopVoteCount: 0,
        continueVoteCount: 0,
        survivorCount: 0,
        requestId: bytes32(0),
        entropy: 0
      });
      roundInfo[gameId][i] = initRound;

      emit CreateRound(gameId, i, prizeDistributions[i - 1], survivalsBps[i - 1]);
    }
  }

  /// @dev close registration and start round 1
  function start() external onlyOper onlyOpened {
    gameInfo[gameId].status = GameStatus.Processing;
    _requestRandomNumber();

    emit SetGameStatus(gameId, "Processing");
  }

  /// @dev sum up each round and either continue next round or complete the game
  function processing() external onlyOper onlyStarted {
    if (
      roundInfo[gameId][roundNumber].stopVoteCount > roundInfo[gameId][roundNumber].continueVoteCount ||
      roundNumber == maxRound ||
      roundInfo[gameId][roundNumber].survivorCount == 0
    ) {
      _complete();
    } else {
      gameInfo[gameId].status = GameStatus.Processing;
      _requestRandomNumber();

      emit SetGameStatus(gameId, "Processing");
    }
  }

  function _requestRandomNumber() internal {
    bytes32 requestId = roundInfo[gameId][roundNumber + 1].requestId;
    require(requestId == bytes32(0), "SurvivalGame::_requestRandomNumber::random numnber has been requested");
    roundInfo[gameId][roundNumber + 1].requestId = entropyGenerator.randomNumber();

    emit RequestRandomNumber(gameId, roundNumber, roundInfo[gameId][roundNumber + 1].requestId);
  }

  function consumeRandomNumber(bytes32 _requestId, uint256 _randomNumber) external override onlyEntropyGenerator {
    bytes32 requestId = roundInfo[gameId][roundNumber + 1].requestId;
    require(requestId == _requestId, "SurvivalGame::consumeRandomNumber:: invalid requestId");
    _proceed(_randomNumber);
  }

  function _proceed(uint256 _entropy) internal {
    roundNumber = roundNumber.add(1);
    gameInfo[gameId].roundNumber = roundNumber;
    gameInfo[gameId].status = GameStatus.Started;
    roundInfo[gameId][roundNumber].entropy = _entropy;

    emit SetGameStatus(gameId, "Started");
    emit SetRoundNumber(gameId, gameInfo[gameId].roundNumber);
    emit SetEntropy(gameId, roundNumber, _entropy);
  }

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
    latte.safeTransfer(DEAD_ADDR, totalLatteBurn);
    _ids = new uint256[](_size);
    for (uint256 i = 0; i < _size; ++i) {
      _ids[i] = _buy(_to);
    }
  }

  /// @dev check if players are not eliminated
  /// @param _ids - a list of player
  function checkBatch(uint256[] calldata _ids) external onlyStarted returns (bool[] memory _canVotes) {
    uint256 size = _ids.length;
    require(size != 0, "SurvivalGame::checkBatch::no players to be checked");
    require(size <= maxBatchSize, "SurvivalGame::checkBatch::size must not exceed max batch size");
    _canVotes = new bool[](size);
    for (uint256 i = 0; i < size; ++i) {
      uint256 id = _ids[i];
      _canVotes[i] = _check(id);
    }
  }

  /// @dev check if a player is not eliminated
  /// @param _id - the player id
  function check(uint256 _id) external onlyStarted returns (bool _canVote) {
    _canVote = _check(_id);
  }

  function voteContinue() external onlyStarted {
    uint256 voteCount = remainingVote[gameId][roundNumber][msg.sender];
    require(voteCount > 0, "SurvivalGame::_vote::no remaining vote");
    remainingVote[gameId][roundNumber][msg.sender] = 0;
    roundInfo[gameId][roundNumber].continueVoteCount.add(voteCount);
  }

  function voteStop() external onlyStarted {
    uint256 voteCount = remainingVote[gameId][roundNumber][msg.sender];
    require(voteCount > 0, "SurvivalGame::_vote::no remaining vote");
    remainingVote[gameId][roundNumber][msg.sender] = 0;
    roundInfo[gameId][roundNumber].stopVoteCount.add(voteCount);
  }

  function claimBatch(uint256[] calldata _ids, address _to) external {}

  /// Internal functions
  function _complete() internal {
    uint256 finalPrizeInLatte = prizePoolInLatte.mul(roundInfo[gameId][roundNumber].prizeDistribution).div(1e4);
    gameInfo[gameId].finalPrizeInLatte = finalPrizeInLatte;
    gameInfo[gameId].status = GameStatus.Completed;
    prizePoolInLatte = prizePoolInLatte.sub(finalPrizeInLatte);

    emit SetGameStatus(gameId, "Completed");
  }

  function _buy(address _to) internal returns (uint256 _id) {
    _id = lastPlayerId.add(1);
    playerMaster[_id] = _to;
    playerGame[_id] = gameId;

    emit Buy(gameId, playerMaster[_id], _id);

    for (uint8 i = 0; i < maxRound; ++i) {
      playerStatus[_id][i] = PlayerStatus.Pending;

      emit SetPlayerStatus(_id, i, "Pending");
    }

    lastPlayerId = _id;
    gameInfo[gameId].totalPlayer = gameInfo[gameId].totalPlayer.add(1);


    emit SetTotalPlayer(gameId, gameInfo[gameId].totalPlayer);
  }

  function _check(uint256 _id) internal onlyMaster(_id) returns (bool _survived) {
    if (roundNumber > 1) {
      require(
        playerStatus[_id][roundNumber.sub(1)] == PlayerStatus.Survived,
        "SurvivalGame::_check::player has been eliminated"
      );
    }
    require(playerStatus[_id][roundNumber] == PlayerStatus.Pending, "SurvivalGame::_check::player has been checked");
    RoundInfo memory info = roundInfo[gameId][roundNumber];
    uint256 entropy = info.entropy;
    require(entropy != 0, "SurvivalGame::_check::no entropy");
    uint256 survivalBps = info.survivalBps;
    require(survivalBps != 0, "SurvivalGame::_check::no survival BPS");
    bytes memory data = abi.encodePacked(entropy, address(this), msg.sender, _id);

    // eliminated if hash value mod 100 more than the survive percent
    _survived = (uint256(keccak256(data)) % 1e2) > survivalBps.div(1e4);
    if (_survived) {
      playerStatus[_id][roundNumber] = PlayerStatus.Survived;
      remainingVote[gameId][roundNumber][msg.sender].add(1);
      roundInfo[gameId][roundNumber].survivorCount.add(1);

    } else {
      playerStatus[_id][roundNumber] = PlayerStatus.Dead;
    }

    emit SetRoundSurvivor(gameId, roundNumber, roundInfo[gameId][roundNumber].survivorCount);
    emit SetRemainingVote(gameId, roundNumber, msg.sender, remainingVote[gameId][roundNumber][msg.sender]);
    emit SetPlayerStatus(_id, roundNumber, "Dead");
  }

  /// @dev mark player as claimed and return claim amount
  function _claim(uint256 _id) internal onlyMaster(_id) returns (bool) {}
}
