import { FakeContract, MockContract } from "@defi-wonderland/smock";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { BigNumber, constants, Signer } from "ethers";
import { ethers, waffle } from "hardhat";
import {
  LatteNFT,
  SimpleRandomNumberGenerator,
  SimpleRandomNumberGenerator__factory,
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
  const burnBps = BigNumber.from(2000);
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
  const zeroBps: [BigNumber, BigNumber, BigNumber, BigNumber, BigNumber, BigNumber] = [
    BigNumber.from(0),
    BigNumber.from(0),
    BigNumber.from(0),
    BigNumber.from(0),
    BigNumber.from(0),
    BigNumber.from(0),
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
  let nft: MockContract<LatteNFT>;
  let categoryId: BigNumber;
  let simpleRandomNumberGenerator: SimpleRandomNumberGenerator;
  let fakeRandomNumberGenerator: FakeContract<SimpleRandomNumberGenerator>;
  let survivalGame: SurvivalGame;
  let survivalGameWithCooldown: SurvivalGame;
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
  let randomGeneratorAsDeployer: SimpleRandomNumberGenerator;

  beforeEach(async () => {
    ({
      latte,
      fee,
      nft,
      categoryId,
      simpleRandomNumberGenerator,
      fakeRandomNumberGenerator,
      survivalGame,
      survivalGameWithCooldown,
      survivalGameWithFake,
      signatureFn,
    } = await waffle.loadFixture(survivalGameUnitTestFigture));
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

    randomGeneratorAsDeployer = SimpleRandomNumberGenerator__factory.connect(
      simpleRandomNumberGenerator.address,
      deployer
    ) as SimpleRandomNumberGenerator;
  });

  describe("#create()", () => {
    context("when create game", () => {
      it("should revert if caller is not OPERATOR role", async () => {
        await expect(
          survivalGameAsAlice.create(lattePerTicket, burnBps, nft.address, categoryId, prizeDistributions, survivalBps)
        ).to.revertedWith("SurvivalGame::onlyOper::only OPERATOR role");
      });

      it("should revert if categoryId is not existed", async () => {
        await expect(
          survivalGameAsOperator.create(
            lattePerTicket,
            burnBps,
            nft.address,
            constants.MaxUint256,
            zeroBps,
            survivalBps
          )
        ).to.revertedWith("SurvivalGame::create::LatteNFT categoryId not existed");
      });

      it("should revert if some prizeDistributions is invalid", async () => {
        await expect(
          survivalGameAsOperator.create(lattePerTicket, burnBps, nft.address, categoryId, zeroBps, survivalBps)
        ).to.revertedWith("SurvivalGame::create::invalid prizeDistributions BPS");
      });

      it("should revert if some survivalBps is invalid", async () => {
        await expect(
          survivalGameAsOperator.create(lattePerTicket, burnBps, nft.address, categoryId, prizeDistributions, zeroBps)
        ).to.revertedWith("SurvivalGame::create::invalid survival BPS");
      });

      it("should revert if current game status is not NotStarted or Completed", async () => {
        await survivalGameAsOperator.create(
          lattePerTicket,
          burnBps,
          nft.address,
          categoryId,
          prizeDistributions,
          survivalBps
        );
        await expect(
          survivalGameAsOperator.create(
            lattePerTicket,
            burnBps,
            nft.address,
            categoryId,
            prizeDistributions,
            survivalBps
          )
        ).to.revertedWith("SurvivalGame::_isGameStatus::wrong GameStatus to proceed operation");
      });

      it("should emit LogCreateGame, LogSetGameStatus, and LogCreateRound with MAX_ROUND times", async () => {
        await expect(
          survivalGameAsOperator.create(
            lattePerTicket,
            burnBps,
            nft.address,
            categoryId,
            prizeDistributions,
            survivalBps
          )
        )
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
        await survivalGameAsOperator.create(
          lattePerTicket,
          burnBps,
          nft.address,
          categoryId,
          prizeDistributions,
          survivalBps
        );
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
    context("operator has cooldown", () => {
      it("should reverted if call consecutively", async () => {
        //create game
        await survivalGameWithCooldown.create(
          lattePerTicket,
          burnBps,
          nft.address,
          categoryId,
          prizeDistributions,
          survivalBps
        );

        await expect(survivalGameWithCooldown.start()).to.revertedWith(
          "SurvivalGame::onlyOper::OPERATOR should not proceed the game consecutively"
        );
      });
    });

    context("zero operator cooldown", () => {
      beforeEach(async () => {
        // create game
        await survivalGameWithFakeAsOperator.create(
          lattePerTicket,
          burnBps,
          nft.address,
          categoryId,
          prizeDistributions,
          survivalBps
        );
      });
      context("when start game", () => {
        it("should revert if caller is not OPERATOR role", async () => {
          await expect(survivalGameWithFakeAsAlice.start()).to.revertedWith(
            "SurvivalGame::onlyOper::only OPERATOR role"
          );
        });

        it("should emit LogRequestRandomNumber and LogSetGameStatus", async () => {
          const gameId = await survivalGameWithFake.gameId();
          const gameInfo = await survivalGameWithFake.gameInfo(gameId);
          const nextRound = gameInfo.roundNumber + 1;

          // mock returns
          const requestId = ethers.utils.formatBytes32String("requestId");
          fakeRandomNumberGenerator.randomNumber.returns(requestId);

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
          fakeRandomNumberGenerator.randomNumber.returns(requestId);

          const gameId = await survivalGameWithFake.gameId();
          const gameInfo = await survivalGameWithFake.gameInfo(gameId);
          const nextRoundNumber = gameInfo.roundNumber + 1;
          expect(gameInfo.status, "status should be processing").to.eq(GameStatus.Processing);
          const roundInfo = await survivalGameWithFake.roundInfo(gameId, nextRoundNumber);
          expect(roundInfo.requestId, "request id should be returned as `requestId`").to.eq(requestId);
        });
      });
    });
  });

  describe("#consumeRandomNumber", () => {
    context("after operator started game", () => {
      beforeEach(async () => {
        // create game
        await survivalGameAsOperator.create(
          lattePerTicket,
          burnBps,
          nft.address,
          categoryId,
          prizeDistributions,
          survivalBps
        );
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

  describe("#retry()", () => {
    context("when never got comsume random number", () => {
      let gameId: BigNumber;
      beforeEach(async () => {
        // create game
        await survivalGameAsOperator.create(
          lattePerTicket,
          burnBps,
          nft.address,
          categoryId,
          prizeDistributions,
          survivalGuaranteeBps
        );
        gameId = await survivalGame.gameId();
        // open game
        await survivalGameAsOperator.start();
      });

      it("should able to retry and change the requestId", async () => {
        const gameInfo = await survivalGame.gameInfo(gameId);
        const nextRoundNumber = gameInfo.roundNumber + 1;
        const roundInfo = await survivalGame.roundInfo(gameId, nextRoundNumber);

        expect((await survivalGame.gameInfo(gameId)).status, "status should be processing").to.eq(
          GameStatus.Processing
        );

        await survivalGameAsOperator.retry();
        const recent = await survivalGame.roundInfo(gameId, nextRoundNumber);
        expect(recent.requestId, "requestId should be changed").to.not.eq(roundInfo.requestId);
      });

      it("should retry and able to consumed random number", async () => {
        const gameInfo = await survivalGame.gameInfo(gameId);
        const nextRoundNumber = gameInfo.roundNumber + 1;
        let roundInfo = await survivalGame.roundInfo(gameId, nextRoundNumber);

        await survivalGameAsOperator.retry();
        roundInfo = await survivalGame.roundInfo(gameId, nextRoundNumber);

        // consumed random number
        await randomGeneratorAsDeployer.fulfillRandomness(roundInfo.requestId, randomness);

        expect((await survivalGame.gameInfo(gameId)).status, "status should be started").to.eq(GameStatus.Started);
        expect((await survivalGame.roundInfo(gameId, nextRoundNumber)).entropy, "entropy should have value").to.not.eq(
          constants.Zero
        );
      });
    });
  });

  describe("#processing()", () => {
    context("check access condition when not receive random from randomNumberGenerator", () => {
      beforeEach(async () => {
        // create game
        await survivalGameAsOperator.create(
          lattePerTicket,
          burnBps,
          nft.address,
          categoryId,
          prizeDistributions,
          survivalBps
        );
        // open game
        await survivalGameAsOperator.start();
      });

      it("should revert if caller is not OPERATOR role", async () => {
        await expect(survivalGameAsAlice.processing()).to.revertedWith("SurvivalGame::onlyOper::only OPERATOR role");
      });

      it("should revert if game status is not Started", async () => {
        await expect(survivalGameAsOperator.processing()).to.revertedWith(
          "SurvivalGame::_isGameStatus::wrong GameStatus to proceed operation"
        );
      });
    });

    context("when processing round", () => {
      context("second round, users never check their players", () => {
        let gameId: BigNumber;
        beforeEach(async () => {
          // create game
          await survivalGameAsOperator.create(
            lattePerTicket,
            burnBps,
            nft.address,
            categoryId,
            prizeDistributions,
            survivalBps
          );
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

      context("second round, users check their players", () => {
        let gameId: BigNumber;

        beforeEach(async () => {
          // create game
          await survivalGameAsOperator.create(
            lattePerTicket,
            burnBps,
            nft.address,
            categoryId,
            prizeDistributions,
            survivalGuaranteeBps
          );
          gameId = await survivalGame.gameId();

          const maxBatch = 10;
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
          await survivalGameAsOperator.create(
            lattePerTicket,
            burnBps,
            nft.address,
            categoryId,
            prizeDistributions,
            survivalGuaranteeBps
          );
          gameId = await survivalGame.gameId();
          const maxRound = await survivalGame.MAX_ROUND();

          const maxBatch = 10;
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
          const finalPrizePerPlayer = (await survivalGame.gameInfo(gameId)).maxPrizePool
            .mul(roundInfo.prizeDistribution)
            .div(10000)
            .div(20); // alice + bob max batch each

          await expect(survivalGameAsOperator.processing())
            .to.emit(survivalGame, "LogSetFinalPrizePerPlayer")
            .withArgs(gameId, finalPrizePerPlayer.toString())
            .to.emit(survivalGame, "LogSetGameStatus")
            .withArgs(gameId, "Completed");
        });

        it("should set game status to Completed and set finalPrizePerplayer in gameInfo", async () => {
          const roundInfo = await survivalGame.roundInfo(gameId, (await survivalGame.gameInfo(gameId)).roundNumber);
          const finalPrizePerPlayer = (await survivalGame.gameInfo(gameId)).maxPrizePool
            .mul(roundInfo.prizeDistribution)
            .div(10000)
            .div(20); // alice + bob max batch each

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

  describe("#buy()", () => {
    context("when 1 user buy 1 player", () => {
      let gameId: BigNumber;
      beforeEach(async () => {
        // create game
        await survivalGameAsOperator.create(
          lattePerTicket,
          burnBps,
          nft.address,
          categoryId,
          prizeDistributions,
          survivalGuaranteeBps
        );
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
      let buySize: number;
      beforeEach(async () => {
        // create game
        await survivalGameAsOperator.create(
          lattePerTicket,
          burnBps,
          nft.address,
          categoryId,
          prizeDistributions,
          survivalGuaranteeBps
        );
        gameId = await survivalGame.gameId();
        buySize = 10;
      });

      it("should transfer and burn LATTE correctly", async () => {
        await latteAsAlice.approve(survivalGame.address, lattePerTicket.mul(buySize));
        const aliceBalance = await latte.balanceOf(await alice.getAddress());
        await latteAsBob.approve(survivalGame.address, lattePerTicket.mul(buySize));
        const bobBalance = await latte.balanceOf(await bob.getAddress());
        const burnAmount = lattePerTicket.mul(2).mul(buySize).mul(burnBps).div(10000);

        await survivalGameAsAlice.buy(buySize, await alice.getAddress());
        await survivalGameAsBob.buy(buySize, await bob.getAddress());

        expect(await latte.balanceOf(await alice.getAddress()), "should deduct with ticket price").to.eq(
          aliceBalance.sub(lattePerTicket.mul(buySize))
        );
        expect(await latte.balanceOf(await bob.getAddress()), "should deduct with ticket price").to.eq(
          bobBalance.sub(lattePerTicket.mul(buySize))
        );
        expect(
          await latte.balanceOf(survivalGame.address),
          "should hold LATTE with total ticket price and deduct with burn amount"
        ).to.eq(lattePerTicket.mul(2).mul(buySize).sub(burnAmount));
      });

      it("should updated total player and user remaining player", async () => {
        await latteAsAlice.approve(survivalGame.address, lattePerTicket.mul(buySize));
        await latteAsBob.approve(survivalGame.address, lattePerTicket.mul(buySize));

        await survivalGameAsAlice.buy(buySize, await alice.getAddress());
        await survivalGameAsBob.buy(buySize, await bob.getAddress());

        const gameInfo = await survivalGame.gameInfo(gameId);
        const aliceInfo = await survivalGame.userInfo(gameId, gameInfo.roundNumber, await alice.getAddress());
        const bobInfo = await survivalGame.userInfo(gameId, gameInfo.roundNumber, await bob.getAddress());
        expect(aliceInfo.remainingPlayerCount, "totalPlayer should be increased with buy size").to.eq(buySize);
        expect(bobInfo.remainingPlayerCount, "totalPlayer should be increased with buy size").to.eq(buySize);
        expect(gameInfo.totalPlayer, "totalPlayer should be increased with buy size").to.eq(buySize * 2);
      });
    });

    context("when buy after start game", () => {
      it("should reverted", async () => {
        // create game
        await survivalGameAsOperator.create(
          lattePerTicket,
          burnBps,
          nft.address,
          categoryId,
          prizeDistributions,
          survivalGuaranteeBps
        );
        // start game
        await survivalGameAsOperator.start();

        await expect(survivalGameAsAlice.buy(1, await alice.getAddress())).to.revertedWith(
          "SurvivalGame::_isGameStatus::wrong GameStatus to proceed operation"
        );
      });
    });

    context("when buy more than buy limit", () => {
      it("should reverted", async () => {
        // create game
        await survivalGameAsOperator.create(
          lattePerTicket,
          burnBps,
          nft.address,
          categoryId,
          prizeDistributions,
          survivalGuaranteeBps
        );

        await expect(
          survivalGameAsAlice.buy((await survivalGame.MAX_BUY_LIMIT()).add(1), await alice.getAddress())
        ).to.revertedWith("SurvivalGame::buy::size must not exceed max buy limit");
      });
    });
  });

  describe("#check()", () => {
    context("when game is guarantee survival", () => {
      let gameId: BigNumber;
      let buySize: number;
      beforeEach(async () => {
        // create game
        await survivalGameAsOperator.create(
          lattePerTicket,
          burnBps,
          nft.address,
          categoryId,
          prizeDistributions,
          survivalGuaranteeBps
        );
        gameId = await survivalGame.gameId();

        buySize = 10;
        // alice registration
        await latteAsAlice.approve(survivalGame.address, lattePerTicket.mul(buySize));
        await survivalGameAsAlice.buy(buySize, await alice.getAddress());
        // bob registration
        await latteAsBob.approve(survivalGame.address, lattePerTicket.mul(buySize));
        await survivalGameAsBob.buy(buySize, await bob.getAddress());

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
        const gameInfo = await survivalGame.gameInfo(gameId);
        await expect(survivalGameAsAlice.check())
          .to.emit(survivalGame, "LogSetRoundSurvivorCount")
          .withArgs(gameId, gameInfo.roundNumber, buySize)
          .to.emit(survivalGame, "LogSetRemainingVoteCount")
          .withArgs(gameId, gameInfo.roundNumber, await alice.getAddress(), buySize);
        await expect(survivalGameAsBob.check())
          .to.emit(survivalGame, "LogSetRoundSurvivorCount")
          .withArgs(gameId, gameInfo.roundNumber, buySize * 2)
          .to.emit(survivalGame, "LogSetRemainingVoteCount")
          .withArgs(gameId, gameInfo.roundNumber, await bob.getAddress(), buySize);
      });

      it("should successfully check", async () => {
        const gameInfo = await survivalGame.gameInfo(gameId);

        await survivalGameAsAlice.check();

        const aliceInfo = await survivalGame.userInfo(gameId, gameInfo.roundNumber, await alice.getAddress());
        const lastAliceInfo = await survivalGame.userInfo(gameId, gameInfo.roundNumber - 1, await alice.getAddress());
        expect(aliceInfo.remainingPlayerCount).to.eq(buySize);
        expect(aliceInfo.remainingVoteCount).to.eq(buySize);
        expect(lastAliceInfo.remainingPlayerCount).to.eq(0);

        await survivalGameAsBob.check();

        const bobInfo = await survivalGame.userInfo(gameId, gameInfo.roundNumber, await bob.getAddress());
        const lastBobInfo = await survivalGame.userInfo(gameId, gameInfo.roundNumber - 1, await bob.getAddress());
        expect(bobInfo.remainingPlayerCount).to.eq(buySize);
        expect(bobInfo.remainingVoteCount).to.eq(buySize);
        expect(lastBobInfo.remainingPlayerCount).to.eq(0);

        const roundInfo = await survivalGame.roundInfo(gameId, gameInfo.roundNumber);
        expect(roundInfo.survivorCount).to.eq(buySize * 2);
      });
    });
  });

  describe("#voteContinue()", () => {
    context("when vote before check", async () => {
      let gameId: BigNumber;
      let buySize: number;
      beforeEach(async () => {
        // create game
        await survivalGameAsOperator.create(
          lattePerTicket,
          burnBps,
          nft.address,
          categoryId,
          prizeDistributions,
          survivalGuaranteeBps
        );
        gameId = await survivalGame.gameId();

        buySize = 10;
        // alice registration
        await latteAsAlice.approve(survivalGame.address, lattePerTicket.mul(buySize));
        await survivalGameAsAlice.buy(buySize, await alice.getAddress());

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

      it("should reverted with no remaining vote", async () => {
        await expect(survivalGameAsAlice.voteContinue()).to.revertedWith("SurvivalGame::_vote::no remaining vote");
      });
    });

    context("when game is guarantee survival", () => {
      let gameId: BigNumber;
      let buySize: number;
      beforeEach(async () => {
        // create game
        await survivalGameAsOperator.create(
          lattePerTicket,
          burnBps,
          nft.address,
          categoryId,
          prizeDistributions,
          survivalGuaranteeBps
        );
        gameId = await survivalGame.gameId();

        buySize = 10;
        // alice registration
        await latteAsAlice.approve(survivalGame.address, lattePerTicket.mul(buySize));
        await survivalGameAsAlice.buy(buySize, await alice.getAddress());

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
      });

      it("should emit LogSetRemainingVoteCount, and LogCurrentVoteCount", async () => {
        const gameInfo = await survivalGame.gameInfo(gameId);

        await expect(survivalGameAsAlice.voteContinue())
          .to.emit(survivalGame, "LogSetRemainingVoteCount")
          .withArgs(gameId, gameInfo.roundNumber, await alice.getAddress(), 0)
          .to.emit(survivalGame, "LogCurrentVoteCount")
          .withArgs(gameId, gameInfo.roundNumber, buySize, 0);
      });

      it("should sucessfully set vote continue", async () => {
        const gameInfo = await survivalGame.gameInfo(gameId);

        await survivalGameAsAlice.voteContinue();

        const roundInfo = await survivalGame.roundInfo(gameId, gameInfo.roundNumber);
        const aliceInfo = await survivalGame.userInfo(gameId, gameInfo.roundNumber, await alice.getAddress());
        expect(aliceInfo.remainingVoteCount).to.eq(0);
        expect(roundInfo.continueVoteCount).to.eq(buySize);
        expect(roundInfo.stopVoteCount).to.eq(0);
      });
    });
  });

  describe("#voteStop()", () => {
    context("when vote before check", async () => {
      let gameId: BigNumber;
      let buySize: number;
      beforeEach(async () => {
        // create game
        await survivalGameAsOperator.create(
          lattePerTicket,
          burnBps,
          nft.address,
          categoryId,
          prizeDistributions,
          survivalGuaranteeBps
        );
        gameId = await survivalGame.gameId();

        buySize = 10;
        // alice registration
        await latteAsAlice.approve(survivalGame.address, lattePerTicket.mul(buySize));
        await survivalGameAsAlice.buy(buySize, await alice.getAddress());

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

      it("should reverted with no remaining vote", async () => {
        await expect(survivalGameAsAlice.voteStop()).to.revertedWith("SurvivalGame::_vote::no remaining vote");
      });
    });

    context("when game is guarantee survival", () => {
      let gameId: BigNumber;
      let buySize: number;
      beforeEach(async () => {
        // create game
        await survivalGameAsOperator.create(
          lattePerTicket,
          burnBps,
          nft.address,
          categoryId,
          prizeDistributions,
          survivalGuaranteeBps
        );
        gameId = await survivalGame.gameId();
        buySize = 10;

        // alice registration
        await latteAsAlice.approve(survivalGame.address, lattePerTicket.mul(buySize));
        await survivalGameAsAlice.buy(buySize, await alice.getAddress());
        // bob registration
        await latteAsBob.approve(survivalGame.address, lattePerTicket.mul(buySize));
        await survivalGameAsBob.buy(buySize, await bob.getAddress());

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

      it("should emit LogSetRemainingVoteCount, and LogCurrentVoteCount", async () => {
        const gameInfo = await survivalGame.gameInfo(gameId);

        await expect(survivalGameAsAlice.voteStop())
          .to.emit(survivalGame, "LogSetRemainingVoteCount")
          .withArgs(gameId, gameInfo.roundNumber, await alice.getAddress(), 0)
          .to.emit(survivalGame, "LogCurrentVoteCount")
          .withArgs(gameId, gameInfo.roundNumber, 0, buySize);
      });

      it("should sucessfully set vote stop", async () => {
        const gameInfo = await survivalGame.gameInfo(gameId);

        await survivalGameAsAlice.voteStop();

        const roundInfo = await survivalGame.roundInfo(gameId, gameInfo.roundNumber);
        const aliceInfo = await survivalGame.userInfo(gameId, gameInfo.roundNumber, await alice.getAddress());
        expect(aliceInfo.remainingVoteCount).to.eq(0);
        expect(roundInfo.continueVoteCount).to.eq(0);
        expect(roundInfo.stopVoteCount).to.eq(buySize);
      });
    });
  });

  describe("#claim()", () => {
    context("when game is guarantee survival", () => {
      let gameId: BigNumber;
      let buySize: number;
      beforeEach(async () => {
        // create game
        await survivalGameAsOperator.create(
          lattePerTicket,
          burnBps,
          nft.address,
          categoryId,
          prizeDistributions,
          survivalGuaranteeBps
        );
        gameId = await survivalGame.gameId();
        buySize = await survivalGame.MAX_ROUND();

        // alice registration
        await latteAsAlice.approve(survivalGame.address, lattePerTicket.mul(buySize));
        await survivalGameAsAlice.buy(buySize, await alice.getAddress());

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
        // round 1 vote stop
        await survivalGameAsAlice.voteStop();
        // process round
        await survivalGameAsOperator.processing();
      });

      it("should reverted if caller is already claimed", async () => {
        await survivalGameAsAlice.claim(await alice.getAddress());

        await expect(survivalGameAsAlice.claim(await alice.getAddress())).to.revertedWith(
          "SurvivalGame::claim::rewards has been claimed"
        );
      });

      it("should emit LogClaimReward", async () => {
        const gameInfo = await survivalGame.gameInfo(gameId);
        const aliceInfo = await survivalGame.userInfo(gameId, gameInfo.roundNumber, await alice.getAddress());
        const finalPrizePerPlayer = gameInfo.finalPrizePerPlayer;
        const totalReward = finalPrizePerPlayer.mul(aliceInfo.remainingPlayerCount);

        await expect(survivalGameAsAlice.claim(await alice.getAddress()))
          .to.emit(survivalGame, "LogClaimReward")
          .withArgs(gameId, gameInfo.roundNumber, await alice.getAddress(), buySize, totalReward);
      });

      it("should successfully claim reward and transfer correctly", async () => {
        const gameInfo = await survivalGame.gameInfo(gameId);
        const aliceBalance = await latte.balanceOf(await alice.getAddress());
        const aliceInfo = await survivalGame.userInfo(gameId, gameInfo.roundNumber, await alice.getAddress());
        const finalPrizePerPlayer = gameInfo.finalPrizePerPlayer;
        const totalReward = finalPrizePerPlayer.mul(aliceInfo.remainingPlayerCount);

        await survivalGameAsAlice.claim(await alice.getAddress());

        expect((await survivalGame.userInfo(gameId, gameInfo.roundNumber, await alice.getAddress())).claimed).to.eq(
          true
        );
        expect(await latte.balanceOf(await alice.getAddress())).to.eq(aliceBalance.add(totalReward));
      });
    });

    context("when last round round and guarantee survival", () => {
      let gameId: BigNumber;

      beforeEach(async () => {
        // create game
        await survivalGameAsOperator.create(
          lattePerTicket,
          burnBps,
          nft.address,
          categoryId,
          prizeDistributions,
          survivalGuaranteeBps
        );
        gameId = await survivalGame.gameId();
        const maxRound = await survivalGame.MAX_ROUND();

        const maxBatch = 10;
        // alice registration
        await latteAsAlice.approve(survivalGame.address, lattePerTicket.mul(maxBatch));
        await survivalGameAsAlice.buy(maxBatch, await alice.getAddress());

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
        }

        // processing to complete
        await survivalGameAsOperator.processing();
      });

      it("should successfully claim reward, transfer latte and nft correctly", async () => {
        const gameInfo = await survivalGame.gameInfo(gameId);
        const aliceBalance = await latte.balanceOf(await alice.getAddress());
        const aliceNFT = await nft.balanceOf(await alice.getAddress());
        const aliceInfo = await survivalGame.userInfo(gameId, gameInfo.roundNumber, await alice.getAddress());
        const finalPrizePerPlayer = gameInfo.finalPrizePerPlayer;
        const totalReward = finalPrizePerPlayer.mul(aliceInfo.remainingPlayerCount);

        await survivalGameAsAlice.claim(await alice.getAddress());

        expect((await survivalGame.userInfo(gameId, gameInfo.roundNumber, await alice.getAddress())).claimed).to.eq(
          true
        );
        expect(await latte.balanceOf(await alice.getAddress())).to.eq(aliceBalance.add(totalReward));
        expect((await nft.balanceOf(await alice.getAddress())).sub(aliceNFT)).to.eq(BigNumber.from(1));
      });
    });
  });
});
