import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/dist/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { RandomNumberGenerator__factory } from "../typechain";
import { getConfig, withNetworkFile, IChainLinkVRF } from "../utils";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  /*
  ░██╗░░░░░░░██╗░█████╗░██████╗░███╗░░██╗██╗███╗░░██╗░██████╗░
  ░██║░░██╗░░██║██╔══██╗██╔══██╗████╗░██║██║████╗░██║██╔════╝░
  ░╚██╗████╗██╔╝███████║██████╔╝██╔██╗██║██║██╔██╗██║██║░░██╗░
  ░░████╔═████║░██╔══██║██╔══██╗██║╚████║██║██║╚████║██║░░╚██╗
  ░░╚██╔╝░╚██╔╝░██║░░██║██║░░██║██║░╚███║██║██║░╚███║╚██████╔╝
  ░░░╚═╝░░░╚═╝░░╚═╝░░╚═╝╚═╝░░╚═╝╚═╝░░╚══╝╚═╝╚═╝░░╚══╝░╚═════╝░
  Check all variables below before execute the deployment script
  */

  const { deployments, getNamedAccounts, network } = hre;
  const { deploy } = deployments;
  const config = getConfig();

  // chainlink VRF details https://docs.chain.link/docs/vrf-contracts/#binance-smart-chain-mainnet
  const VRF: IChainLinkVRF = {
    COORDINATOR_ADDRESS: "0x747973a5A2a4Ae1D3a8fDF5479f1514F65Db9C31",
    LINK_TOKEN_ADDRESS: "0x404460C6A5EdE2D891e8297795264fDe62ADBB75",
    KEY_HASH: "0xc251acd21ec4fb7f31bb8868288bfdbaeb4fbfec2df3735ddbd4f7dc8d60103c",
    FEE: ethers.utils.parseEther("0.2"),
  };

  const [deployer] = await ethers.getSigners();

  await withNetworkFile(async () => {
    // DEPLOY RandomNumberGenerator
    console.log(`>> Deploy RandomNumberGenerator`);
    const RandomNumberGenerator = (await ethers.getContractFactory(
      "RandomNumberGenerator",
      deployer
    )) as RandomNumberGenerator__factory;
    const randomNumberGenerator = await RandomNumberGenerator.deploy(
      VRF.COORDINATOR_ADDRESS,
      VRF.LINK_TOKEN_ADDRESS,
      VRF.KEY_HASH,
      VRF.FEE
    );
    console.log(`>> Deployed at ${randomNumberGenerator.address}`);
    console.log("✅ Done deploying a RandomNumberGenerator");
  });
};

export default func;
func.tags = ["DeployRandomNumberGenerator"];
