// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "../interfaces/IRandomNumberGenerator.sol";
import "../interfaces/IRandomNumberConsumer.sol";

contract SimpleRandomNumberGenerator is IRandomNumberGenerator, Ownable {
  bytes32 internal keyHash;
  address internal linkToken;
  uint256 internal fee;
  mapping(bytes32 => address) internal requesters;
  mapping(bytes32 => uint256) public randomResults;
  mapping(address => bool) internal consumers;

  constructor(
    address _linkToken,
    bytes32 _keyHash,
    uint256 _fee
  ) public {
    linkToken = _linkToken;
    keyHash = _keyHash;
    fee = _fee;
  }

  modifier onlyConsumer() {
    require(consumers[msg.sender], "SimpleRandomNumberGenerator::Only survivalGame can call function");
    _;
  }

  function feeAmount() public view override onlyConsumer returns (uint256 _fee) {
    _fee = fee;
  }

  function feeToken() public view override onlyConsumer returns (address _linkToken) {
    _linkToken = linkToken;
  }

  function setAllowance(address _consumer, bool _allowance) external onlyOwner {
    consumers[_consumer] = _allowance;
  }

  function randomNumber() public override onlyConsumer returns (bytes32 requestId) {
    require(keyHash != bytes32(0), "SimpleRandomNumberGenerator::getRandomNumber::Must have valid key hash");
    require(
      IERC20(linkToken).balanceOf(address(this)) >= fee,
      "SimpleRandomNumberGenerator::getRandomNumber::Not enough LINK"
    );
    requestId = keccak256(abi.encodePacked(keyHash, block.timestamp));
    requesters[requestId] = msg.sender;
  }

  function fulfillRandomness(bytes32 requestId, uint256 randomness) external {
    IRandomNumberConsumer(requesters[requestId]).consumeRandomNumber(requestId, randomness);
    randomResults[requestId] = randomness;
  }
}
