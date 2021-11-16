// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@latteswap/latteswap-contract/contracts/nft/interfaces/ILatteNFT.sol";

contract SimpleLatteNFT is ERC721 {
  constructor(string memory _name, string memory _symbol) public ERC721(_name, _symbol) {}

  function mint(address _to, uint256 id) public {
    _mint(_to, id);
  }
}
