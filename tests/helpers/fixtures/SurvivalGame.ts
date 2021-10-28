import { ModifiableContract, smoddit } from "@eth-optimism/smock";
import { Signer } from "ethers";
import { ethers, upgrades } from "hardhat";
import { MockWBNB, SimpleToken } from "../../../compiled-typechain";
import { MockWBNB__factory, SimpleToken__factory, SurvivalGame, SurvivalGame__factory } from "../../../typechain";

export interface ISurvivalGameUnitTestFixtureDTO {
  latte: SimpleToken;
  randomNumberGenerator: ModifiableContract;
  survivalGame: SurvivalGame;
  wbnb: MockWBNB;
  signatureFn: (signer: Signer, msg?: string) => Promise<string>;
}

export async function survivalGameUnitTestFigture(): Promise<ISurvivalGameUnitTestFixtureDTO> {
  const OPER_COOLDOWN_TS = 60000;
  const [deployer, operator] = await ethers.getSigners();

  // Deploy mocked latte
  const LATTE = (await ethers.getContractFactory("SimpleToken", deployer)) as SimpleToken__factory;
  const latte = (await LATTE.deploy("LATTEv2", "LATTE")) as SimpleToken;
  await latte.deployed();

  // Deploy mocked randomNumberGenerator
  const RandomNumberGenerator = await smoddit("RandomNumberGenerator", deployer);
  const randomNumberGenerator: ModifiableContract = await RandomNumberGenerator.deploy();

  // Deploy SurvivalGame
  const SurvivalGame = (await ethers.getContractFactory(
    "SurvivalGame",
    (
      await ethers.getSigners()
    )[0]
  )) as SurvivalGame__factory;
  const survivalGame = (await upgrades.deployProxy(SurvivalGame, [
    latte.address,
    randomNumberGenerator.address,
    OPER_COOLDOWN_TS,
  ])) as SurvivalGame;
  await survivalGame.deployed();

  // set operator role to operator
  await survivalGame.grantRole(await survivalGame.OPERATOR_ROLE(), operator.address);

  const WBNB = (await ethers.getContractFactory("MockWBNB", deployer)) as MockWBNB__factory;
  const wbnb = await WBNB.deploy();
  await wbnb.deployed();

  const signatureFn = async (signer: Signer, msg = "I am an EOA"): Promise<string> => {
    return await signer.signMessage(ethers.utils.arrayify(ethers.utils.keccak256(ethers.utils.toUtf8Bytes(msg))));
  };

  return {
    latte,
    randomNumberGenerator,
    survivalGame,
    wbnb,
    signatureFn,
  } as ISurvivalGameUnitTestFixtureDTO;
}
