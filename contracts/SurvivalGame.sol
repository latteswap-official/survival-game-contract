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

import "./math/SafeMath8.sol";
import "./math/SafeMath16.sol";

contract SurvivalGame is OwnableUpgradeable, ReentrancyGuardUpgradeable {
  // Libraries
  using SafeMath for uint256;
  using SafeMath8 for uint8;
  using SafeMath16 for uint16;
  using SafeERC20 for IERC20;

  // State variable
  // Instance of LATTE token (collateral currency)
  IERC20 internal _latte;
  uint256 gameId;
  uint8 roundNumber;

  // Represents the status of the game
  enum GameStatus {
    Opened, // The game has been opened for the registration
    Started, // The game has been started
    Completed // The game has been completed and might have the winners
  }
  // All the needed info around the game
  struct GameInfo {
    GameStatus status;
    uint8 roundNumber;
    uint256 pricePoolInLatte;
    uint256 costPerTicket;
    uint256 burnBps;
  }
}
