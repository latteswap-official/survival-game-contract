import { FakeContract } from "@defi-wonderland/smock";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { BigNumber, constants, Signer } from "ethers";
import { ethers, waffle } from "hardhat";
import {
  SimpleRandomGenerator,
  SimpleRandomGenerator__factory,
  SimpleToken,
  SimpleToken__factory,
  SurvivalGame,
  SurvivalGame__factory,
} from "../../typechain";
import { survivalGameUnitTestFigture } from "../helpers/fixtures/SurvivalGame";

chai.use(solidity);
const { expect } = chai;

describe("SurvivalGame", () => {
  // Constants
  const MAX_ROUND = 6;
  const lattePerTicket = constants.WeiPerEther;
  const burnBps = BigNumber.from(200);
  const randomness = ethers.utils.formatBytes32String("randomness");
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
  const survivalGuaranteeBps: [BigNumber, BigNumber, BigNumber, BigNumber, BigNumber, BigNumber] = [
    BigNumber.from(10000),
    BigNumber.from(10000),
    BigNumber.from(10000),
    BigNumber.from(10000),
    BigNumber.from(10000),
    BigNumber.from(10000),
  ];
  enum GameStatus {
    NotStarted, //The game has not started yet
    Opened, // The game has been opened for the registration
    Processing, // The game is preparing for the next state
    Started, // The game has been started
    Completed, // The game has been completed and might have the winners
  }

  // Accounts
  let deployer: Signer;
  let alice: Signer;
  let bob: Signer;
  let operator: Signer;

  // Lambas
  let signatureFn: (signer: Signer, msg?: string) => Promise<string>;

  // Contracts
  let latte: SimpleToken;
  let fee: SimpleToken;
  let simpleRandomGenerator: SimpleRandomGenerator;
  let fakeRandomGenerator: FakeContract<SimpleRandomGenerator>;
  let survivalGame: SurvivalGame;
  let survivalGameWithFake: SurvivalGame;

  // Bindings
  let latteAsAlice: SimpleToken;
  let latteAsBob: SimpleToken;
  let survivalGameAsDeployer: SurvivalGame;
  let survivalGameAsAlice: SurvivalGame;
  let survivalGameAsBob: SurvivalGame;
  let survivalGameAsOperator: SurvivalGame;
  let survivalGameWithFakeAsAlice: SurvivalGame;
  let survivalGameWithFakeAsOperator: SurvivalGame;
  let randomGeneratorAsDeployer: SimpleRandomGenerator;

  beforeEach(async () => {
    ({ latte, fee, simpleRandomGenerator, fakeRandomGenerator, survivalGame, survivalGameWithFake, signatureFn } =
      await waffle.loadFixture(survivalGameUnitTestFigture));
    [deployer, alice, bob, operator] = await ethers.getSigners();

    latteAsAlice = SimpleToken__factory.connect(latte.address, alice);
    latteAsBob = SimpleToken__factory.connect(latte.address, bob);

    survivalGameAsDeployer = SurvivalGame__factory.connect(survivalGame.address, deployer) as SurvivalGame;
    survivalGameAsAlice = SurvivalGame__factory.connect(survivalGame.address, alice) as SurvivalGame;
    survivalGameAsBob = SurvivalGame__factory.connect(survivalGame.address, bob) as SurvivalGame;
    survivalGameAsOperator = SurvivalGame__factory.connect(survivalGame.address, operator) as SurvivalGame;

    survivalGameWithFakeAsAlice = SurvivalGame__factory.connect(survivalGameWithFake.address, alice) as SurvivalGame;
    survivalGameWithFakeAsOperator = SurvivalGame__factory.connect(
      survivalGameWithFake.address,
      operator
    ) as SurvivalGame;

    randomGeneratorAsDeployer = SimpleRandomGenerator__factory.connect(
      simpleRandomGenerator.address,
      deployer
    ) as SimpleRandomGenerator;
  });

  describe("#create()", () => {
    context("when create game", () => {
      it("should revert if caller is not OPERATOR role", async () => {
        await expect(
          survivalGameAsAlice.create(lattePerTicket, burnBps, prizeDistributions, survivalBps)
        ).to.revertedWith("SurvialGame::onlyOper::only OPERATOR role");
      });

      it("should revert if current game status is not NotStarted or Completed", async () => {
        await survivalGameAsOperator.create(lattePerTicket, burnBps, prizeDistributions, survivalBps);
        await expect(
          survivalGameAsOperator.create(lattePerTicket, burnBps, prizeDistributions, survivalBps)
        ).to.revertedWith("SurvialGame::onlyBeforeOpen::only before game opened");
      });

      it("should emit LogCreateGame, LogSetGameStatus, and LogCreateRound with MAX_ROUND times", async () => {
        await expect(survivalGameAsOperator.create(lattePerTicket, burnBps, prizeDistributions, survivalBps))
          .to.emit(survivalGame, "LogCreateGame")
          .withArgs("1", lattePerTicket, burnBps)
          .to.emit(survivalGame, "LogSetGameStatus")
          .withArgs("1", "Opened")
          .to.emit(survivalGame, "LogCreateRound")
          .withArgs("1", 1, prizeDistributions[0], survivalBps[0])
          .to.emit(survivalGame, "LogCreateRound")
          .withArgs("1", 2, prizeDistributions[1], survivalBps[1])
          .to.emit(survivalGame, "LogCreateRound")
          .withArgs("1", 3, prizeDistributions[2], survivalBps[2])
          .to.emit(survivalGame, "LogCreateRound")
          .withArgs("1", 4, prizeDistributions[3], survivalBps[3])
          .to.emit(survivalGame, "LogCreateRound")
          .withArgs("1", 5, prizeDistributions[4], survivalBps[4])
          .to.emit(survivalGame, "LogCreateRound")
          .withArgs("1", 6, prizeDistributions[5], survivalBps[5]);
      });

      it("should create with correct gameInfo and all roundInfo", async () => {
        // create game
        await survivalGameAsOperator.create(lattePerTicket, burnBps, prizeDistributions, survivalBps);
        // game info
        const gameId = await survivalGame.gameId();
        const gameInfo = await survivalGame.gameInfo(gameId);
        expect(gameInfo.status, "status should be Opened").to.eq(GameStatus.Opened);
        expect(gameInfo.costPerTicket, "costPerTicket should set as valud of `lattePerTicket`").to.eq(lattePerTicket);
        expect(gameInfo.burnBps, "burnBps should set as valud of `burnBps`").to.eq(burnBps);
        // round info
        for (let i = 1; i <= MAX_ROUND; i++) {
          const roundInfo = await survivalGame.roundInfo(gameId, i);
          expect(
            roundInfo.prizeDistribution,
            "prizeDistribution should be set with value of `prizeDistribution`"
          ).to.eq(prizeDistributions[i - 1]);
          expect(roundInfo.survivalBps, "survivalBps should be set with value of `survivalBps`").to.eq(
            survivalBps[i - 1]
          );
        }
      });
    });
  });

  describe("#start()", () => {
    beforeEach(async () => {
      // create game
      await survivalGameWithFakeAsOperator.create(lattePerTicket, burnBps, prizeDistributions, survivalBps);
    });
    context("when start game", () => {
      it("should revert if caller is not OPERATOR role", async () => {
        await expect(survivalGameWithFakeAsAlice.start()).to.revertedWith("SurvialGame::onlyOper::only OPERATOR role");
      });

      it("should emit LogRequestRandomNumber and LogSetGameStatus", async () => {
        const gameId = await survivalGameWithFake.gameId();
        const gameInfo = await survivalGameWithFake.gameInfo(gameId);
        const nextRound = gameInfo.roundNumber + 1;

        // mock returns
        const requestId = ethers.utils.formatBytes32String("requestId");
        fakeRandomGenerator.randomNumber.returns(requestId);

        expect(await survivalGameWithFakeAsOperator.start())
          .to.emit(survivalGameWithFake, "LogRequestRandomNumber")
          .withArgs(gameId, nextRound, requestId)
          .to.emit(survivalGameWithFake, "LogSetGameStatus")
          .withArgs(gameId, "Processing");
      });

      it("should change current game status to Processing and correct requestId of next round", async () => {
        await survivalGameWithFakeAsOperator.start();

        // mock returns
        const requestId = ethers.utils.formatBytes32String("requestId");
        fakeRandomGenerator.randomNumber.returns(requestId);

        const gameId = await survivalGameWithFake.gameId();
        const gameInfo = await survivalGameWithFake.gameInfo(gameId);
        const nextRoundNumber = gameInfo.roundNumber + 1;
        expect(gameInfo.status, "status should be processing").to.eq(GameStatus.Processing);
        const roundInfo = await survivalGameWithFake.roundInfo(gameId, nextRoundNumber);
        expect(roundInfo.requestId, "request id should be returned as `requestId`").to.eq(requestId);
      });
    });
  });

  describe("#consumeRandomNumber", () => {
    context("after operator started game", () => {
      beforeEach(async () => {
        // create game
        await survivalGameAsOperator.create(lattePerTicket, burnBps, prizeDistributions, survivalBps);
        // open game
        await survivalGameAsOperator.start();
      });

      it("should emit LogSetEntropy, LogSetRoundNumber, and LogSetGameStatus", async () => {
        const gameId = await survivalGame.gameId();
        const gameInfo = await survivalGame.gameInfo(gameId);
        const nextRoundNumber = gameInfo.roundNumber + 1;
        const roundInfo = await survivalGame.roundInfo(gameId, nextRoundNumber);

        await expect(randomGeneratorAsDeployer.fulfillRandomness(roundInfo.requestId, randomness))
          .to.emit(survivalGame, "LogSetEntropy")
          .withArgs(gameId, nextRoundNumber, randomness)
          .to.emit(survivalGame, "LogSetRoundNumber")
          .withArgs(gameId, nextRoundNumber)
          .to.emit(survivalGame, "LogSetGameStatus")
          .withArgs(gameId, "Started");
      });

      it("should change current game status to Started and update round number to 1 after consumeRandomNumber", async () => {
        const gameId = await survivalGame.gameId();
        const gameInfo = await survivalGame.gameInfo(gameId);
        const nextRoundNumber = gameInfo.roundNumber + 1;
        const roundInfo = await survivalGame.roundInfo(gameId, nextRoundNumber);

        await randomGeneratorAsDeployer.fulfillRandomness(roundInfo.requestId, randomness);
        expect((await survivalGame.gameInfo(gameId)).status, "status should be started").to.eq(GameStatus.Started);
        expect((await survivalGame.gameInfo(gameId)).roundNumber, "roundNumber should be 1").to.eq(1);
      });
    });
  });

  describe("#processing()", () => {
    context("check access condition", () => {
      beforeEach(async () => {
        // create game
        await survivalGameAsOperator.create(lattePerTicket, burnBps, prizeDistributions, survivalBps);
        // open game
        await survivalGameAsOperator.start();
      });

      it("should revert if caller is not OPERATOR role", async () => {
        await expect(survivalGameAsAlice.processing()).to.revertedWith("SurvialGame::onlyOper::only OPERATOR role");
      });

      it("should revert if game status is not Started", async () => {
        await expect(survivalGameAsOperator.processing()).to.revertedWith(
          "SurvialGame::onlyStarted::only after game started"
        );
      });
    });

    context("when processing round", () => {
      context("second round, no check", () => {
        let gameId: BigNumber;
        beforeEach(async () => {
          // create game
          await survivalGameAsOperator.create(lattePerTicket, burnBps, prizeDistributions, survivalBps);
          gameId = await survivalGame.gameId();
          // start game
          await survivalGameAsOperator.start();
          // round 1 started
          const gameInfo = await survivalGame.gameInfo(gameId);
          const nextRoundNumber = gameInfo.roundNumber + 1;
          const roundInfo = await survivalGame.roundInfo(gameId, nextRoundNumber);
          await randomGeneratorAsDeployer.fulfillRandomness(roundInfo.requestId, randomness);
        });

        it("should emit LogSetFinalPrizePerPlayer, and LogSetGameStatus ", async () => {
          await expect(survivalGameAsOperator.processing())
            .to.emit(survivalGame, "LogSetFinalPrizePerPlayer")
            .withArgs(gameId, 0)
            .to.emit(survivalGame, "LogSetGameStatus")
            .withArgs(gameId, "Completed");
        });

        it("should not set finalPrizePerPlayer and set game status to Completed", async () => {
          await survivalGameAsOperator.processing();

          expect((await survivalGame.gameInfo(gameId)).finalPrizePerPlayer, "finalPrizePerPlayer will be zero").to.eq(
            0
          );
          expect((await survivalGame.gameInfo(gameId)).status, "status should be Completed").to.eq(
            GameStatus.Completed
          );
        });
      });

      context("second round, some checked", () => {
        let gameId: BigNumber;

        beforeEach(async () => {
          // create game
          await survivalGameAsOperator.create(lattePerTicket, burnBps, prizeDistributions, survivalGuaranteeBps);
          gameId = await survivalGame.gameId();

          const maxBatch = await survivalGame.MAX_BATCH_SIZE();
          // alice registration
          await latteAsAlice.approve(survivalGame.address, lattePerTicket.mul(maxBatch));
          await survivalGameAsAlice.buy(maxBatch, await alice.getAddress());
          // bob registration
          await latteAsBob.approve(survivalGame.address, lattePerTicket.mul(maxBatch));
          await survivalGameAsBob.buy(maxBatch, await bob.getAddress());

          // start game
          await survivalGameAsOperator.start();

          // round 1 started
          const gameInfo = await survivalGame.gameInfo(gameId);
          const nextRoundNumber = gameInfo.roundNumber + 1;
          const roundInfo = await survivalGame.roundInfo(gameId, nextRoundNumber);
          await randomGeneratorAsDeployer.fulfillRandomness(roundInfo.requestId, randomness);

          // round 1 checked
          await survivalGameAsAlice.check();
          await survivalGameAsBob.check();
        });

        it("should emit LogRequestRandomNumber, and LogSetGameStatus", async () => {
          await expect(survivalGameAsOperator.processing())
            .to.emit(survivalGame, "LogRequestRandomNumber")
            .to.emit(survivalGame, "LogSetGameStatus")
            .withArgs(gameId, "Processing");
        });

        it("should set game status to Processing and random requestId of next round", async () => {
          await survivalGameAsOperator.processing();
          expect((await survivalGame.gameInfo(gameId)).status, "status should be Processing").to.eq(
            GameStatus.Processing
          );
          expect(
            (await survivalGame.roundInfo(gameId, (await survivalGame.gameInfo(gameId)).roundNumber + 1)).requestId,
            "requestId should not chage"
          ).to.not.eq(ethers.utils.formatBytes32String("0"));
        });
      });

      context("last round round", () => {
        let gameId: BigNumber;

        beforeEach(async () => {
          // create game
          await survivalGameAsOperator.create(lattePerTicket, burnBps, prizeDistributions, survivalGuaranteeBps);
          gameId = await survivalGame.gameId();
          const maxRound = await survivalGame.MAX_ROUND();

          const maxBatch = await survivalGame.MAX_BATCH_SIZE();
          // alice registration
          await latteAsAlice.approve(survivalGame.address, lattePerTicket.mul(maxBatch));
          await survivalGameAsAlice.buy(maxBatch, await alice.getAddress());
          // bob registration
          await latteAsBob.approve(survivalGame.address, lattePerTicket.mul(maxBatch));
          await survivalGameAsBob.buy(maxBatch, await bob.getAddress());

          // start game
          await survivalGameAsOperator.start();

          // round 1 started
          await randomGeneratorAsDeployer.fulfillRandomness(
            (
              await survivalGame.roundInfo(gameId, (await survivalGame.gameInfo(gameId)).roundNumber + 1)
            ).requestId,
            randomness
          );

          // round 1 checked
          await survivalGameAsAlice.check();
          await survivalGameAsBob.check();

          for (let round = 2; round <= maxRound; round++) {
            // processing
            await survivalGameAsOperator.processing();
            // started
            await randomGeneratorAsDeployer.fulfillRandomness(
              (
                await survivalGame.roundInfo(gameId, (await survivalGame.gameInfo(gameId)).roundNumber + 1)
              ).requestId,
              randomness
            );
            // checked
            await survivalGameAsAlice.check();
            await survivalGameAsBob.check();
          }
        });

        it("should emit LogSetFinalPrizePerPlayer, and LogSetGameStatus", async () => {
          const roundInfo = await survivalGame.roundInfo(gameId, (await survivalGame.gameInfo(gameId)).roundNumber);
          const finalPrizePerPlayer = (await survivalGame.prizePoolInLatte())
            .mul(roundInfo.prizeDistribution)
            .div(10000)
            .div((await survivalGame.MAX_BATCH_SIZE()) * 2); // alice + bob max batch each

          await expect(survivalGameAsOperator.processing())
            .to.emit(survivalGame, "LogSetFinalPrizePerPlayer")
            .withArgs(gameId, finalPrizePerPlayer.toString())
            .to.emit(survivalGame, "LogSetGameStatus")
            .withArgs(gameId, "Completed");
        });

        it("should set game status to Completed and set finalPrizePerplayer in gameInfo", async () => {
          const roundInfo = await survivalGame.roundInfo(gameId, (await survivalGame.gameInfo(gameId)).roundNumber);
          const finalPrizePerPlayer = (await survivalGame.prizePoolInLatte())
            .mul(roundInfo.prizeDistribution)
            .div(10000)
            .div((await survivalGame.MAX_BATCH_SIZE()) * 2); // alice + bob max batch each

          await survivalGameAsOperator.processing();

          expect((await survivalGame.gameInfo(gameId)).status, "status should be Completed").to.eq(
            GameStatus.Completed
          );
          expect(
            (await survivalGame.gameInfo(gameId)).finalPrizePerPlayer,
            "should be returned as `finalPrizePerPlayer`"
          ).to.eq(finalPrizePerPlayer);
        });
      });
    });
  });

  describe("#complete()", () => {
    context("when force completed", () => {
      let gameId: BigNumber;

      beforeEach(async () => {
        // create game
        await survivalGameAsOperator.create(lattePerTicket, burnBps, prizeDistributions, survivalGuaranteeBps);
        gameId = await survivalGame.gameId();

        const maxBatch = await survivalGame.MAX_BATCH_SIZE();
        // alice registration
        await latteAsAlice.approve(survivalGame.address, lattePerTicket.mul(maxBatch));
        await survivalGameAsAlice.buy(maxBatch, await alice.getAddress());
        // bob registration
        await latteAsBob.approve(survivalGame.address, lattePerTicket.mul(maxBatch));
        await survivalGameAsBob.buy(maxBatch, await bob.getAddress());

        // start game
        await survivalGameAsOperator.start();

        // round 1 started
        await randomGeneratorAsDeployer.fulfillRandomness(
          (
            await survivalGame.roundInfo(gameId, (await survivalGame.gameInfo(gameId)).roundNumber + 1)
          ).requestId,
          randomness
        );

        // round 1 checked
        await survivalGameAsAlice.check();
        await survivalGameAsBob.check();
      });

      it("should emit LogSetFinalPrizePerPlayer, and LogSetGameStatus", async () => {
        const roundInfo = await survivalGame.roundInfo(gameId, (await survivalGame.gameInfo(gameId)).roundNumber);
        const finalPrizePerPlayer = (await survivalGame.prizePoolInLatte())
          .mul(roundInfo.prizeDistribution)
          .div(10000)
          .div((await survivalGame.MAX_BATCH_SIZE()) * 2); // alice + bob max batch each

        await expect(survivalGameAsOperator.complete())
          .to.emit(survivalGame, "LogSetFinalPrizePerPlayer")
          .withArgs(gameId, finalPrizePerPlayer.toString())
          .to.emit(survivalGame, "LogSetGameStatus")
          .withArgs(gameId, "Completed");
      });

      it("should set game status to Completed and set finalPrizePerplayer in gameInfo", async () => {
        const roundInfo = await survivalGame.roundInfo(gameId, (await survivalGame.gameInfo(gameId)).roundNumber);
        const finalPrizePerPlayer = (await survivalGame.prizePoolInLatte())
          .mul(roundInfo.prizeDistribution)
          .div(10000)
          .div((await survivalGame.MAX_BATCH_SIZE()) * 2); // alice + bob max batch each

        await survivalGameAsOperator.complete();

        const gameInfo = await survivalGame.gameInfo(gameId);
        expect(gameInfo.status, "status should be Completed").to.eq(GameStatus.Completed);
        expect(gameInfo.finalPrizePerPlayer, "should be returned as `finalPrizePerPlayer`").to.eq(finalPrizePerPlayer);
      });
    });
  });

  describe("#buy()", () => {
    context("when 1 user buy 1 player", () => {
      let gameId: BigNumber;
      beforeEach(async () => {
        // create game
        await survivalGameAsOperator.create(lattePerTicket, burnBps, prizeDistributions, survivalGuaranteeBps);
        gameId = await survivalGame.gameId();
      });

      it("should reverted if caller never approve LATTE with SurvivalGame as spender", async () => {
        await expect(survivalGameAsAlice.buy(1, await alice.getAddress())).to.revertedWith(
          "ERC20: transfer amount exceeds allowance"
        );
      });

      it("should emit LogBuyPlayer, and LogSetTotalPlayer", async () => {
        await latteAsAlice.approve(survivalGame.address, lattePerTicket);

        await expect(survivalGameAsAlice.buy(1, await alice.getAddress()))
          .to.emit(survivalGame, "LogBuyPlayer")
          .withArgs(gameId, await alice.getAddress(), 1)
          .to.emit(survivalGame, "LogSetTotalPlayer")
          .withArgs(gameId, 1);
      });

      it("should transfer and burn LATTE correctly", async () => {
        await latteAsAlice.approve(survivalGame.address, lattePerTicket);
        const aliceBalance = await latte.balanceOf(await alice.getAddress());
        const burnAmount = lattePerTicket.mul(burnBps).div(10000);

        await survivalGameAsAlice.buy(1, await alice.getAddress());

        expect(await latte.balanceOf(await alice.getAddress()), "should deduct with ticket price").to.eq(
          aliceBalance.sub(lattePerTicket)
        );
        expect(
          await latte.balanceOf(survivalGame.address),
          "should hold LATTE with total ticket price and deduct with burn amount"
        ).to.eq(lattePerTicket.sub(burnAmount));
      });

      it("should updated total player and user remaining player", async () => {
        await latteAsAlice.approve(survivalGame.address, lattePerTicket);

        await survivalGameAsAlice.buy(1, await alice.getAddress());

        const gameInfo = await survivalGame.gameInfo(gameId);
        const userInfo = await survivalGame.userInfo(gameId, gameInfo.roundNumber, await alice.getAddress());
        expect(userInfo.remainingPlayerCount, "totalPlayer should be increased with buy size").to.eq(1);
        expect(gameInfo.totalPlayer, "totalPlayer should be increased with buy size").to.eq(1);
      });
    });

    context("when many users buy max batch size players", () => {
      let gameId: BigNumber;
      beforeEach(async () => {
        // create game
        await survivalGameAsOperator.create(lattePerTicket, burnBps, prizeDistributions, survivalGuaranteeBps);
        gameId = await survivalGame.gameId();
      });

      it("should transfer and burn LATTE correctly", async () => {
        const maxBatch = await survivalGame.MAX_BATCH_SIZE();
        await latteAsAlice.approve(survivalGame.address, lattePerTicket.mul(maxBatch));
        const aliceBalance = await latte.balanceOf(await alice.getAddress());
        await latteAsBob.approve(survivalGame.address, lattePerTicket.mul(maxBatch));
        const bobBalance = await latte.balanceOf(await bob.getAddress());
        const burnAmount = lattePerTicket.mul(2).mul(maxBatch).mul(burnBps).div(10000);

        await survivalGameAsAlice.buy(maxBatch, await alice.getAddress());
        await survivalGameAsBob.buy(maxBatch, await bob.getAddress());

        expect(await latte.balanceOf(await alice.getAddress()), "should deduct with ticket price").to.eq(
          aliceBalance.sub(lattePerTicket.mul(maxBatch))
        );
        expect(await latte.balanceOf(await bob.getAddress()), "should deduct with ticket price").to.eq(
          bobBalance.sub(lattePerTicket.mul(maxBatch))
        );
        expect(
          await latte.balanceOf(survivalGame.address),
          "should hold LATTE with total ticket price and deduct with burn amount"
        ).to.eq(lattePerTicket.mul(2).mul(maxBatch).sub(burnAmount));
      });

      it("should updated total player and user remaining player", async () => {
        const maxBatch = await survivalGame.MAX_BATCH_SIZE();
        await latteAsAlice.approve(survivalGame.address, lattePerTicket.mul(maxBatch));
        await latteAsBob.approve(survivalGame.address, lattePerTicket.mul(maxBatch));

        await survivalGameAsAlice.buy(maxBatch, await alice.getAddress());
        await survivalGameAsBob.buy(maxBatch, await bob.getAddress());

        const gameInfo = await survivalGame.gameInfo(gameId);
        const aliceInfo = await survivalGame.userInfo(gameId, gameInfo.roundNumber, await alice.getAddress());
        const bobInfo = await survivalGame.userInfo(gameId, gameInfo.roundNumber, await bob.getAddress());
        expect(aliceInfo.remainingPlayerCount, "totalPlayer should be increased with buy size").to.eq(maxBatch);
        expect(bobInfo.remainingPlayerCount, "totalPlayer should be increased with buy size").to.eq(maxBatch);
        expect(gameInfo.totalPlayer, "totalPlayer should be increased with buy size").to.eq(maxBatch * 2);
      });
    });

    context("when buy after start game", () => {
      let gameId: BigNumber;
      beforeEach(async () => {
        // create game
        await survivalGameAsOperator.create(lattePerTicket, burnBps, prizeDistributions, survivalGuaranteeBps);
        gameId = await survivalGame.gameId();
        // start game
        await survivalGameAsOperator.start();
      });

      it("should reverted", async () => {
        await expect(survivalGameAsAlice.buy(1, await alice.getAddress())).to.revertedWith(
          "SurvialGame::onlyOpened::only before game starting"
        );
      });
    });
  });

  describe("#check()", () => {
    context("when game is guarantee survival", () => {
      let gameId: BigNumber;
      beforeEach(async () => {
        // create game
        await survivalGameAsOperator.create(lattePerTicket, burnBps, prizeDistributions, survivalGuaranteeBps);
        gameId = await survivalGame.gameId();

        const maxBatch = await survivalGame.MAX_BATCH_SIZE();
        // alice registration
        await latteAsAlice.approve(survivalGame.address, lattePerTicket.mul(maxBatch));
        await survivalGameAsAlice.buy(maxBatch, await alice.getAddress());
        // bob registration
        await latteAsBob.approve(survivalGame.address, lattePerTicket.mul(maxBatch));
        await survivalGameAsBob.buy(maxBatch, await bob.getAddress());

        // start game
        await survivalGameAsOperator.start();

        // round 1 started
        await randomGeneratorAsDeployer.fulfillRandomness(
          (
            await survivalGame.roundInfo(gameId, (await survivalGame.gameInfo(gameId)).roundNumber + 1)
          ).requestId,
          randomness
        );
      });

      it("should emit LogSetRoundSurvivorCount, and LogSetRemainingVoteCount", async () => {
        const maxBatch = await survivalGame.MAX_BATCH_SIZE();
        const gameInfo = await survivalGame.gameInfo(gameId);
        await expect(survivalGameAsAlice.check())
          .to.emit(survivalGame, "LogSetRoundSurvivorCount")
          .withArgs(gameId, gameInfo.roundNumber, maxBatch)
          .to.emit(survivalGame, "LogSetRemainingVoteCount")
          .withArgs(gameId, gameInfo.roundNumber, await alice.getAddress(), maxBatch);
        await expect(survivalGameAsBob.check())
          .to.emit(survivalGame, "LogSetRoundSurvivorCount")
          .withArgs(gameId, gameInfo.roundNumber, maxBatch * 2)
          .to.emit(survivalGame, "LogSetRemainingVoteCount")
          .withArgs(gameId, gameInfo.roundNumber, await bob.getAddress(), maxBatch);
      });

      it("should successfully check", async () => {
        const maxBatch = await survivalGame.MAX_BATCH_SIZE();
        const gameInfo = await survivalGame.gameInfo(gameId);

        await survivalGameAsAlice.check();

        const aliceInfo = await survivalGame.userInfo(gameId, gameInfo.roundNumber, await alice.getAddress());
        const lastAliceInfo = await survivalGame.userInfo(gameId, gameInfo.roundNumber - 1, await alice.getAddress());
        expect(aliceInfo.remainingPlayerCount).to.eq(maxBatch);
        expect(aliceInfo.remainingVoteCount).to.eq(maxBatch);
        expect(lastAliceInfo.remainingPlayerCount).to.eq(0);

        await survivalGameAsBob.check();

        const bobInfo = await survivalGame.userInfo(gameId, gameInfo.roundNumber, await bob.getAddress());
        const lastBobInfo = await survivalGame.userInfo(gameId, gameInfo.roundNumber - 1, await bob.getAddress());
        expect(bobInfo.remainingPlayerCount).to.eq(maxBatch);
        expect(bobInfo.remainingVoteCount).to.eq(maxBatch);
        expect(lastBobInfo.remainingPlayerCount).to.eq(0);

        const roundInfo = await survivalGame.roundInfo(gameId, gameInfo.roundNumber);
        expect(roundInfo.survivorCount).to.eq(maxBatch * 2);
      });
    });
  });

  describe.skip("#voteContinue()", () => {
    context("when game is guarantee survival", () => {
      let gameId: BigNumber;
      beforeEach(async () => {
        // create game
        await survivalGameAsOperator.create(lattePerTicket, burnBps, prizeDistributions, survivalGuaranteeBps);
        gameId = await survivalGame.gameId();

        const maxBatch = await survivalGame.MAX_BATCH_SIZE();
        // alice registration
        await latteAsAlice.approve(survivalGame.address, lattePerTicket.mul(maxBatch));
        await survivalGameAsAlice.buy(maxBatch, await alice.getAddress());
        // bob registration
        await latteAsBob.approve(survivalGame.address, lattePerTicket.mul(maxBatch));
        await survivalGameAsBob.buy(maxBatch, await bob.getAddress());

        // start game
        await survivalGameAsOperator.start();

        // round 1 started
        await randomGeneratorAsDeployer.fulfillRandomness(
          (
            await survivalGame.roundInfo(gameId, (await survivalGame.gameInfo(gameId)).roundNumber + 1)
          ).requestId,
          randomness
        );

        // round 1 checked
        await survivalGameAsAlice.check();
        await survivalGameAsBob.check();
      });
    });

    /**TODO voteContinue unit tests
     * emit events
     * check states
     */
  });

  describe.skip("#voteStop()", () => {
    context("when game is guarantee survival", () => {
      let gameId: BigNumber;
      beforeEach(async () => {
        // create game
        await survivalGameAsOperator.create(lattePerTicket, burnBps, prizeDistributions, survivalGuaranteeBps);
        gameId = await survivalGame.gameId();

        const maxBatch = await survivalGame.MAX_BATCH_SIZE();
        // alice registration
        await latteAsAlice.approve(survivalGame.address, lattePerTicket.mul(maxBatch));
        await survivalGameAsAlice.buy(maxBatch, await alice.getAddress());
        // bob registration
        await latteAsBob.approve(survivalGame.address, lattePerTicket.mul(maxBatch));
        await survivalGameAsBob.buy(maxBatch, await bob.getAddress());

        // start game
        await survivalGameAsOperator.start();

        // round 1 started
        await randomGeneratorAsDeployer.fulfillRandomness(
          (
            await survivalGame.roundInfo(gameId, (await survivalGame.gameInfo(gameId)).roundNumber + 1)
          ).requestId,
          randomness
        );

        // round 1 checked
        await survivalGameAsAlice.check();
        await survivalGameAsBob.check();
      });
    });

    /**TODO voteStop unit tests
     * emit events
     * check states
     */
  });

  describe.skip("#claim()", () => {
    context("when game is guarantee survival", () => {
      let gameId: BigNumber;
      beforeEach(async () => {
        // create game
        await survivalGameAsOperator.create(lattePerTicket, burnBps, prizeDistributions, survivalGuaranteeBps);
        gameId = await survivalGame.gameId();

        const maxRound = await survivalGame.MAX_ROUND();
        const maxBatch = await survivalGame.MAX_BATCH_SIZE();
        // alice registration
        await latteAsAlice.approve(survivalGame.address, lattePerTicket.mul(maxBatch));
        await survivalGameAsAlice.buy(maxBatch, await alice.getAddress());
        // bob registration
        await latteAsBob.approve(survivalGame.address, lattePerTicket.mul(maxBatch));
        await survivalGameAsBob.buy(maxBatch, await bob.getAddress());

        // start game
        await survivalGameAsOperator.start();

        // round 1 started
        await randomGeneratorAsDeployer.fulfillRandomness(
          (
            await survivalGame.roundInfo(gameId, (await survivalGame.gameInfo(gameId)).roundNumber + 1)
          ).requestId,
          randomness
        );

        // round 1 checked
        await survivalGameAsAlice.check();
        await survivalGameAsBob.check();

        for (let round = 2; round <= maxRound; round++) {
          // processing
          await survivalGameAsOperator.processing();
          // started
          await randomGeneratorAsDeployer.fulfillRandomness(
            (
              await survivalGame.roundInfo(gameId, (await survivalGame.gameInfo(gameId)).roundNumber + 1)
            ).requestId,
            randomness
          );
          // checked
          await survivalGameAsAlice.check();
          await survivalGameAsBob.check();
        }
      });
    });

    /**TODO claim unit tests
     * emit events
     * check states
     * check balances
     */
  });
});
