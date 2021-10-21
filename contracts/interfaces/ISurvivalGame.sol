// SPDX-License-Identifier: GPL-3.0
//        .-.                               .-.
//       / (_)         /      /       .--.-'
//      /      .-. ---/------/---.-. (  (_)`)    (  .-.   .-.
//     /      (  |   /      /  ./.-'_ `-.  /  .   )(  |   /  )
//  .-/.    .-.`-'-'/      /   (__.'_    )(_.' `-'  `-'-'/`-'
// (_/ `-._.                       (_.--'               /

pragma solidity 0.6.12;

interface ISurvivalGame {
  function numberRandomed(
    uint256 _gameId,
    uint8 _roundId,
    bytes32 _requestId,
    uint256 _randomNumber
  ) external;
}

// currentGameId, currentRoundId, requestId, randomness
