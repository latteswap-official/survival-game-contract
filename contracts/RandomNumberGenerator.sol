// SPDX-License-Identifier: GPL-3.0
//        .-.                               .-.
//       / (_)         /      /       .--.-'
//      /      .-. ---/------/---.-. (  (_)`)    (  .-.   .-.
//     /      (  |   /      /  ./.-'_ `-.  /  .   )(  |   /  )
//  .-/.    .-.`-'-'/      /   (__.'_    )(_.' `-'  `-'-'/`-'
// (_/ `-._.                       (_.--'               /

pragma solidity 0.6.12;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@chainlink/contracts/src/v0.6/VRFConsumerBase.sol";

import "./interfaces/IRandomNumberGenerator.sol";
import "./interfaces/IRandomNumberConsumer.sol";

contract RandomNumberGenerator is IRandomNumberGenerator, VRFConsumerBase, Ownable {
  bytes32 internal keyHash;
  uint256 internal fee;
  mapping(bytes32 => address) internal requesters;
  mapping(bytes32 => uint256) public randomResults;
  mapping(address => bool) internal consumers;

  modifier onlyConsumer() {
    require(consumers[msg.sender], "RandomNumberGenerator::Only survivalGame can call function");
    _;
  }

  constructor(
    address _vrfCoordinator,
    address _linkToken,
    address[] memory _consumers,
    bytes32 _keyHash,
    uint256 _fee
  ) public VRFConsumerBase(_vrfCoordinator, _linkToken) {
    keyHash = _keyHash;
    fee = _fee;
    for (uint256 i; i < _consumers.length; ++i) {
      consumers[_consumers[i]] = true;
    }
  }

  function setAllowance(address _consumer, bool _allowance) external onlyOwner {
    consumers[_consumer] = _allowance;
  }

  /**
   * Requests randomness from a user-provided seed
   */
  function randomNumber() public override onlyConsumer returns (bytes32 requestId) {
    require(keyHash != bytes32(0), "RandomNumberGenerator::getRandomNumber::Must have valid key hash");
    require(
      LINK.balanceOf(address(this)) >= fee,
      "RandomNumberGenerator::getRandomNumber::Not enough LINK - fill contract with faucet"
    );
    requesters[requestId] = msg.sender;
    return requestRandomness(keyHash, fee);
  }

  /**
   * Callback function used by VRF Coordinator
   */
  function fulfillRandomness(bytes32 requestId, uint256 randomness) internal override {
    IRandomNumberConsumer(requesters[requestId]).consumeRandomNumber(requestId, randomness);
    randomResults[requestId] = randomness;
  }
}
