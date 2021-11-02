import { FakeContract, smock } from "@defi-wonderland/smock";
import { Signer } from "ethers";
import { ethers, upgrades } from "hardhat";
import {
  SimpleRandomGenerator,
  SimpleRandomGenerator__factory,
  SimpleToken,
  SimpleToken__factory,
  SurvivalGame,
  SurvivalGame__factory,
} from "../../../typechain";

export interface ISurvivalGameUnitTestFixtureDTO {
  latte: SimpleToken;
  fee: SimpleToken;
  simpleRandomGenerator: SimpleRandomGenerator;
  fakeRandomGenerator: FakeContract<SimpleRandomGenerator>;
  survivalGame: SurvivalGame;
  survivalGameWithFake: SurvivalGame;
  signatureFn: (signer: Signer, msg?: string) => Promise<string>;
}

export async function survivalGameUnitTestFigture(): Promise<ISurvivalGameUnitTestFixtureDTO> {
  const OPER_COOLDOWN_TS = 0;
  const RAND_FEE_AMOUNT = ethers.utils.parseEther("1");
  const [deployer, alice, bob, operator] = await ethers.getSigners();

  // Deploy mocked latte
  const LATTE = (await ethers.getContractFactory("SimpleToken", deployer)) as SimpleToken__factory;
  const latte = (await LATTE.deploy("LATTEv2", "LATTE")) as SimpleToken;
  await latte.deployed();

  // mint latte for testing purpose
  await latte.mint(await alice.getAddress(), ethers.utils.parseEther("888888888"));
  await latte.mint(await bob.getAddress(), ethers.utils.parseEther("888888888"));

  // Deploy fee token
  const FEE = (await ethers.getContractFactory("SimpleToken", deployer)) as SimpleToken__factory;
  const fee = (await FEE.deploy("FEE Token", "FEE")) as SimpleToken;
  await fee.deployed();

  // mint fee token for testing purpose
  await fee.mint(await operator.getAddress(), ethers.utils.parseEther("888888888"));
  await fee.mint(await alice.getAddress(), ethers.utils.parseEther("888888888"));
  await fee.mint(await bob.getAddress(), ethers.utils.parseEther("888888888"));

  const SimpleRandomGenerator = (await ethers.getContractFactory(
    "SimpleRandomGenerator",
    deployer
  )) as SimpleRandomGenerator__factory;
  // Deploy simpleRandomGenerator
  const simpleRandomGenerator = await SimpleRandomGenerator.deploy(
    fee.address,
    [],
    ethers.utils.formatBytes32String("keyHash"),
    RAND_FEE_AMOUNT
  );
  // Deploy fakeRandomGenerator
  const fakeRandomGenerator = await smock.fake<SimpleRandomGenerator>(SimpleRandomGenerator);

  // fixed mock return
  fakeRandomGenerator.feeToken.returns(fee.address);
  fakeRandomGenerator.feeAmount.returns(RAND_FEE_AMOUNT);

  const SurvivalGame = (await ethers.getContractFactory("SurvivalGame", deployer)) as SurvivalGame__factory;
  // Deploy SurvivalGame
  const survivalGame = (await upgrades.deployProxy(SurvivalGame, [
    latte.address,
    simpleRandomGenerator.address,
    OPER_COOLDOWN_TS,
  ])) as SurvivalGame;
  await survivalGame.deployed();
  // Deploy SurvivalGameWithFake
  const survivalGameWithFake = (await upgrades.deployProxy(SurvivalGame, [
    latte.address,
    fakeRandomGenerator.address,
    OPER_COOLDOWN_TS,
  ])) as SurvivalGame;
  await survivalGame.deployed();

  // allow survivalGame to be consumer of simpleRandomGenerator
  await simpleRandomGenerator.setAllowance(survivalGame.address, true);

  // set operator role to operator
  await survivalGame.grantRole(await survivalGame.OPERATOR_ROLE(), operator.address);
  await survivalGameWithFake.grantRole(await survivalGame.OPERATOR_ROLE(), operator.address);

  // approve spend fee
  const feeAsOperator = SimpleToken__factory.connect(fee.address, operator);
  await feeAsOperator.approve(survivalGame.address, ethers.utils.parseEther("888888888"));
  await feeAsOperator.approve(survivalGameWithFake.address, ethers.utils.parseEther("888888888"));

  const signatureFn = async (signer: Signer, msg = "I am an EOA"): Promise<string> => {
    return await signer.signMessage(ethers.utils.arrayify(ethers.utils.keccak256(ethers.utils.toUtf8Bytes(msg))));
  };

  return {
    latte,
    fee,
    simpleRandomGenerator,
    fakeRandomGenerator,
    survivalGame,
    survivalGameWithFake,
    signatureFn,
  } as ISurvivalGameUnitTestFixtureDTO;
}
