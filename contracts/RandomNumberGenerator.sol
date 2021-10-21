// SPDX-License-Identifier: GPL-3.0
//        .-.                               .-.
//       / (_)         /      /       .--.-'
//      /      .-. ---/------/---.-. (  (_)`)    (  .-.   .-.
//     /      (  |   /      /  ./.-'_ `-.  /  .   )(  |   /  )
//  .-/.    .-.`-'-'/      /   (__.'_    )(_.' `-'  `-'-'/`-'
// (_/ `-._.                       (_.--'               /

pragma solidity 0.6.12;

import "@chainlink/contracts/src/v0.6/VRFConsumerBase.sol";
import "./interfaces/ISurvivalGame.sol";

contract RandomNumberGenerator is VRFConsumerBase {
  bytes32 internal keyHash;
  uint256 internal fee;
  address internal requester;
  uint256 public randomResult;
  address public survivalGame;

  modifier onlySurvivalGame() {
    require(msg.sender == survivalGame, "RandomNumberGenerator::Only survivalGame can call function");
    _;
  }

  constructor(
    address _vrfCoordinator,
    address _linkToken,
    address _survivalGame,
    bytes32 _keyHash,
    uint256 _fee
  ) public VRFConsumerBase(_vrfCoordinator, _linkToken) {
    keyHash = _keyHash;
    fee = _fee;
    survivalGame = _survivalGame;
  }

  /**
   * Requests randomness from a user-provided seed
   */
  function getRandomNumber() public onlySurvivalGame returns (bytes32 requestId) {
    require(keyHash != bytes32(0), "RandomNumberGenerator::getRandomNumber::Must have valid key hash");
    require(
      LINK.balanceOf(address(this)) >= fee,
      "RandomNumberGenerator::getRandomNumber::Not enough LINK - fill contract with faucet"
    );
    requester = msg.sender;
    return requestRandomness(keyHash, fee);
  }

  /**
   * Callback function used by VRF Coordinator
   */
  function fulfillRandomness(bytes32 requestId, uint256 randomness) internal override {
    ISurvivalGame(requester).proceed(requestId, randomness);
    randomResult = randomness;
  }
}
