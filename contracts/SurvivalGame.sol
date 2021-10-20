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
  uint256 gameId;
  uint256 prizePoolInLatte;
  uint8 roundNumber;
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

    _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
    _setupRole(OPERATOR_ROLE, _msgSender());
  }

  /// @dev only the one having a OPERATOR_ROLE can continue an execution
  modifier onlyOper() {
    require(hasRole(OPERATOR_ROLE, _msgSender()), "SurvialGame::onlyOper::only OPERATOR role");
    _;
  }
}
