import { ERC20__factory } from "./../typechain/factories/ERC20__factory";
import { constants } from "ethers";
import { ethers, upgrades } from "hardhat";
import { DeployFunction } from "hardhat-deploy/dist/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { RandomNumberGenerator__factory, SurvivalGame, SurvivalGame__factory } from "../typechain";
import { getConfig, withNetworkFile } from "../utils";

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

  const [deployer, operator] = await ethers.getSigners();

  const OPERATOR_ADDRESS = await operator.getAddress();
  const OPER_COOLDOWN_TS = 5 * 60; // 5 mins
  const FEE_TOKEN = "0x404460C6A5EdE2D891e8297795264fDe62ADBB75";

  await withNetworkFile(async () => {
    const randomNumberGenerator = RandomNumberGenerator__factory.connect(config.RandomNumberGenerator, deployer);

    // DEPLOY SurvivalGame
    console.log(`>> Deploy SurvivalGame via proxy`);
    const SurvivalGame = (await ethers.getContractFactory("SurvivalGame", deployer)) as SurvivalGame__factory;
    const survivalGame = (await upgrades.deployProxy(SurvivalGame, [
      config.Tokens.LATTEV2,
      randomNumberGenerator.address,
      OPER_COOLDOWN_TS,
    ])) as SurvivalGame;
    await survivalGame.deployed();
    console.log(`>> Deployed at ${survivalGame.address}`);
    console.log("✅ Done deploying a SurvivalGame");

    // add survivalGame's OPERATOR_ROLE to Operator
    console.log(`>> Execute Transaction to add an operator as an operator for survivalGame`);
    let estimateGas = await survivalGame.estimateGas.grantRole(await survivalGame.OPERATOR_ROLE(), OPERATOR_ADDRESS);
    let tx = await survivalGame.grantRole(await survivalGame.OPERATOR_ROLE(), OPERATOR_ADDRESS, {
      gasLimit: estimateGas.add(100000),
    });
    await tx.wait();
    console.log(`>> returned tx hash: ${tx.hash}`);
    console.log("✅ Done adding an operator as operator for survivalGame");

    // set survivalGame as consumer of randomNumberGenerator
    console.log(`>> Execute Transaction to add a survivalGame as a consumer of randomNumberGenerator`);
    estimateGas = await randomNumberGenerator.estimateGas.setAllowance(survivalGame.address, true);
    tx = await randomNumberGenerator.setAllowance(survivalGame.address, true, {
      gasLimit: estimateGas.add(100000),
    });
    await tx.wait();
    console.log(`>> returned tx hash: ${tx.hash}`);
    console.log("✅ Done adding a survivalGame as a consumer of randomNumberGenerator");

    // operator approve LINK Token with survivalGame as spender
    console.log(`>> Execute Transaction to approve operator's LINK to survivalGame`);
    const linkToken = ERC20__factory.connect(FEE_TOKEN, operator);
    estimateGas = await linkToken.estimateGas.approve(survivalGame.address, constants.MaxUint256);
    tx = await linkToken.approve(survivalGame.address, constants.MaxUint256, {
      gasLimit: estimateGas.add(100000),
    });
    await tx.wait();
    console.log(`>> returned tx hash: ${tx.hash}`);
    console.log("✅ Done approving operator's LINK to survivalGame");
  });
};

export default func;
func.tags = ["DeploySurvivalGame"];
