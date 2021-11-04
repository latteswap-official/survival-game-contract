import { BigNumber } from "ethers";

export interface IChainLinkVRF {
  COORDINATOR_ADDRESS: string;
  LINK_TOKEN_ADDRESS: string;
  KEY_HASH: string;
  FEE: BigNumber;
}
