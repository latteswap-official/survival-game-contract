import { FakeContract, smock } from "@defi-wonderland/smock";
import { constants, Signer } from "ethers";
import { ethers, upgrades } from "hardhat";
import {
  SimpleRandomNumberGenerator,
  SimpleRandomNumberGenerator__factory,
  SimpleToken,
  SimpleToken__factory,
  SurvivalGame,
  SurvivalGame__factory,
} from "../../../typechain";

export interface ISurvivalGameUnitTestFixtureDTO {
  latte: SimpleToken;
  fee: SimpleToken;
  simpleRandomNumberGenerator: SimpleRandomNumberGenerator;
  fakeRandomNumberGenerator: FakeContract<SimpleRandomNumberGenerator>;
  survivalGame: SurvivalGame;
  survivalGameWithCooldown: SurvivalGame;
  survivalGameWithFake: SurvivalGame;
  signatureFn: (signer: Signer, msg?: string) => Promise<string>;
}

export async function survivalGameUnitTestFigture(): Promise<ISurvivalGameUnitTestFixtureDTO> {
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

  const SimpleRandomNumberGenerator = (await ethers.getContractFactory(
    "SimpleRandomNumberGenerator",
    deployer
  )) as SimpleRandomNumberGenerator__factory;
  // Deploy SimpleRandomNumberGenerator
  const simpleRandomNumberGenerator = await SimpleRandomNumberGenerator.deploy(
    fee.address,
    ethers.utils.formatBytes32String("keyHash"),
    RAND_FEE_AMOUNT
  );
  // Deploy fakeRandomNumberGenerator
  const fakeRandomNumberGenerator = await smock.fake<SimpleRandomNumberGenerator>(SimpleRandomNumberGenerator);

  // fixed mock return
  fakeRandomNumberGenerator.feeToken.returns(fee.address);
  fakeRandomNumberGenerator.feeAmount.returns(RAND_FEE_AMOUNT);

  const SurvivalGame = (await ethers.getContractFactory("SurvivalGame", deployer)) as SurvivalGame__factory;
  // Deploy SurvivalGame
  const survivalGame = (await upgrades.deployProxy(SurvivalGame, [
    latte.address,
    simpleRandomNumberGenerator.address,
    0,
  ])) as SurvivalGame;
  await survivalGame.deployed();
  // Deploy SurvivalGameWithCoolDown
  const survivalGameWithCooldown = (await upgrades.deployProxy(SurvivalGame, [
    latte.address,
    simpleRandomNumberGenerator.address,
    10,
  ])) as SurvivalGame;
  await survivalGameWithCooldown.deployed();
  // Deploy SurvivalGameWithFake
  const survivalGameWithFake = (await upgrades.deployProxy(SurvivalGame, [
    latte.address,
    fakeRandomNumberGenerator.address,
    0,
  ])) as SurvivalGame;
  await survivalGameWithFake.deployed();

  // allow survivalGame to be consumer of SimpleRandomNumberGenerator
  await simpleRandomNumberGenerator.setAllowance(survivalGame.address, true);

  // set operator role to operator
  await survivalGame.grantRole(await survivalGame.OPERATOR_ROLE(), operator.address);
  await survivalGameWithFake.grantRole(await survivalGame.OPERATOR_ROLE(), operator.address);

  // approve spend fee
  const feeAsOperator = SimpleToken__factory.connect(fee.address, operator);
  await feeAsOperator.approve(survivalGame.address, constants.MaxUint256);
  await feeAsOperator.approve(survivalGameWithFake.address, constants.MaxUint256);

  const signatureFn = async (signer: Signer, msg = "I am an EOA"): Promise<string> => {
    return await signer.signMessage(ethers.utils.arrayify(ethers.utils.keccak256(ethers.utils.toUtf8Bytes(msg))));
  };

  return {
    latte,
    fee,
    simpleRandomNumberGenerator,
    fakeRandomNumberGenerator,
    survivalGame,
    survivalGameWithCooldown,
    survivalGameWithFake,
    signatureFn,
  } as ISurvivalGameUnitTestFixtureDTO;
}
