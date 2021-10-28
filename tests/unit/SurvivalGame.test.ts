import { ModifiableContract } from "@eth-optimism/smock";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { BigNumber, constants, Signer } from "ethers";
import { ethers, waffle } from "hardhat";
import { MockWBNB, SimpleToken, SurvivalGame, SurvivalGame__factory } from "../../typechain";
import { survivalGameUnitTestFigture } from "../helpers/fixtures/SurvivalGame";

chai.use(solidity);
const { expect } = chai;

describe("SurvivalGame", () => {
  // Constants
  const lattePerTicket = constants.WeiPerEther.mul(2);
  const burnBps = BigNumber.from(200);
  const prizeDistributions: [BigNumber, BigNumber, BigNumber, BigNumber, BigNumber, BigNumber] = [
    BigNumber.from(1000),
    BigNumber.from(2000),
    BigNumber.from(3000),
    BigNumber.from(4000),
    BigNumber.from(6000),
    BigNumber.from(8000),
  ];
  const survivalBps: [BigNumber, BigNumber, BigNumber, BigNumber, BigNumber, BigNumber] = [
    BigNumber.from(1000),
    BigNumber.from(1000),
    BigNumber.from(1000),
    BigNumber.from(1000),
    BigNumber.from(1000),
    BigNumber.from(1000),
  ];

  // Accounts
  let deployer: Signer;
  let operator: Signer;

  // Lambas
  let signatureFn: (signer: Signer, msg?: string) => Promise<string>;

  // Contracts
  let latte: SimpleToken;
  let randomNumberGenerator: ModifiableContract;
  let survivalGame: SurvivalGame;
  let wbnb: MockWBNB;

  // Bindings
  let survivalGameAsOperator: SurvivalGame;
  let signatureAsDeployer: string;
  let signatureAsOperator: string;

  beforeEach(async () => {
    ({ latte, randomNumberGenerator, survivalGame, wbnb } = await waffle.loadFixture(survivalGameUnitTestFigture));
    [deployer, operator] = await ethers.getSigners();

    survivalGameAsOperator = SurvivalGame__factory.connect(survivalGame.address, operator) as SurvivalGame;

    signatureAsDeployer = await signatureFn(deployer);
    signatureAsOperator = await signatureFn(operator);
  });

  describe("#create()", () => {
    context("when create game", () => {
      it("should emit create game, set game status, and create round with MAX_ROUND times", async () => {
        await expect(survivalGameAsOperator.create(lattePerTicket, burnBps, prizeDistributions, survivalBps))
          .to.emit(survivalGame, "LogCreateGame")
          .withArgs(await survivalGame.gameId(), lattePerTicket, burnBps)
          .to.emit(survivalGame, "LogSetGameStatus")
          .withArgs(await survivalGame.gameId(), "Opened")
          .to.emit(survivalGame, "LogCreateRound")
          .withArgs(await survivalGame.gameId(), 1, prizeDistributions[0], survivalBps[0])
          .to.emit(survivalGame, "LogCreateRound")
          .withArgs(await survivalGame.gameId(), 2, prizeDistributions[1], survivalBps[1])
          .to.emit(survivalGame, "LogCreateRound")
          .withArgs(await survivalGame.gameId(), 3, prizeDistributions[2], survivalBps[2])
          .to.emit(survivalGame, "LogCreateRound")
          .withArgs(await survivalGame.gameId(), 4, prizeDistributions[3], survivalBps[3])
          .to.emit(survivalGame, "LogCreateRound")
          .withArgs(await survivalGame.gameId(), 5, prizeDistributions[4], survivalBps[4])
          .to.emit(survivalGame, "LogCreateRound")
          .withArgs(await survivalGame.gameId(), 6, prizeDistributions[5], survivalBps[5]);
      });
    });
  });
});
