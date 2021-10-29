// SPDX-License-Identifier: GPL-3.0
//        .-.                               .-.
//       / (_)         /      /       .--.-'
//      /      .-. ---/------/---.-. (  (_)`)    (  .-.   .-.
//     /      (  |   /      /  ./.-'_ `-.  /  .   )(  |   /  )
//  .-/.    .-.`-'-'/      /   (__.'_    )(_.' `-'  `-'-'/`-'
// (_/ `-._.                       (_.--'               /

pragma solidity 0.6.12;

interface IRandomNumberGenerator {
  function feeAmount() external view returns (uint256 _feeAmount);

  function feeToken() external view returns (address _feeToken);

  /**
   * Requests randomness from a user-provided seed
   */
  function randomNumber() external returns (bytes32 requestId);
}
