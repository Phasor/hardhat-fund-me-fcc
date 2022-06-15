const { inputToConfig } = require("@ethereum-waffle/compiler")
const { assert, expect } = require("chai") //chai being overwritten by waffle
const { deployments, ethers, getNamedAccounts, network } = require("hardhat")
const { developmentChains } = require("../../helper-hardhat-config")

!developmentChains.includes(network.name)
    ? describe.skip //skip next describe block if on public test net
    : describe("FundMe", async function () {
          let fundMe
          let deployer
          let MockV3Aggregator
          const sendValue = ethers.utils.parseEther("1") //1 eth

          beforeEach(async function () {
              //deploy fundme contract
              //using hardhat deploy
              deployer = (await getNamedAccounts()).deployer

              //can also access accounts like this if using non named account
              //const accounts = await ethers.getSigners()
              //const accountOne = accounts[0]
              await deployments.fixture(["all"]) // will run the deploy scripts with "all" tag on in module.exports.
              fundMe = await ethers.getContract("FundMe", deployer) //gets most recent fundme contract/ WIll use deployer when we make transaction with this contract
              MockV3Aggregator = await ethers.getContract("MockV3Aggregator")
          })

          describe("constructor", async function () {
              it("sets the aggregator addresses correctly", async function () {
                  const response = await fundMe.getPriceFeed()
                  assert.equal(response, MockV3Aggregator.address)
                  //note the getPriceFeed is the price feed interface initialised with v3 address, and I guess it returns the address here
              })
          })

          describe("fund", async function () {
              it("fails if not enough eth sent", async function () {
                  //sending no value to fund() function should revert given the require minimum amouth
                  await expect(fundMe.fund()).to.be.revertedWith(
                      "You need to spend more ETH!"
                  )
              })
              it("updates the amount funded data structure", async function () {
                  await fundMe.fund({ value: sendValue }) //definitely more than $50 min so should pass
                  const response = await fundMe.getAddressToAmountFunded(
                      deployer
                  ) //returns BigNumber
                  assert.equal(response.toString(), sendValue.toString()) //convert from BN
              })
              it("adds the funder to the getFunders array", async function () {
                  await fundMe.fund({ value: sendValue }) //send 1 eth
                  const funder = await fundMe.getFunders(0) //funder should be at index 0
                  assert.equal(funder, deployer)
              })
          })

          describe("withdraw", async function () {
              //fund the contract
              beforeEach(async function () {
                  await fundMe.fund({ value: sendValue })
              })

              it("can withdraw eth from a single funder", async function () {
                  //arrange test
                  //get balance of contract, could also use ethers.provider.getBalance(), same
                  const startingFundMeBalance =
                      await fundMe.provider.getBalance(fundMe.address)
                  //get balance of deployer
                  const startingDeployerBalance =
                      await fundMe.provider.getBalance(deployer)

                  const transactionResponse = await fundMe.withdraw()
                  const transactionReceipt = await transactionResponse.wait(1)
                  //pull out gas price and amount used from transactionReceipt obj, they are BNs
                  const { gasUsed, effectiveGasPrice } = transactionReceipt
                  const gasCost = gasUsed.mul(effectiveGasPrice) //.mul == * for BNs

                  const endingFundMeBalance = await fundMe.provider.getBalance(
                      fundMe.address
                  )
                  const endingDeployerBalance =
                      await fundMe.provider.getBalance(deployer)

                  assert.equal(endingFundMeBalance, 0)
                  assert.equal(
                      startingFundMeBalance
                          .add(startingDeployerBalance)
                          .toString(),
                      endingDeployerBalance.add(gasCost).toString()
                  ) //we use .add() since the balances are BN's. Also the deployer used gas to withdraw so need to account for that
              })

              it("allows us to withdraw with multiple getFunders", async function () {
                  const accounts = await ethers.getSigners()
                  for (i = 1; i < 6; i++) {
                      //connect each account, remeber accounts[0] is the deployer!
                      const fundMeConnectedContract = await fundMe.connect(
                          accounts[i]
                      )
                      //get each account to fund the contract
                      await fundMeConnectedContract.fund({ value: sendValue })
                  }

                  const startingFundMeBalance =
                      await fundMe.provider.getBalance(fundMe.address)
                  const startingDeployerBalance =
                      await fundMe.provider.getBalance(deployer)

                  const transactionResponse = await fundMe.withdraw()
                  const transactionReceipt = await transactionResponse.wait(1)
                  const { gasUsed, effectiveGasPrice } = transactionReceipt
                  const gasCost = gasUsed.mul(effectiveGasPrice)

                  //assert
                  const endingFundMeBalance = await fundMe.provider.getBalance(
                      fundMe.address
                  )
                  const endingDeployerBalance =
                      await fundMe.provider.getBalance(deployer)

                  assert.equal(endingFundMeBalance, 0)
                  assert.equal(
                      startingFundMeBalance
                          .add(startingDeployerBalance)
                          .toString(),
                      endingDeployerBalance.add(gasCost).toString()
                  )

                  //make sure the getFunders are reset properly
                  await expect(fundMe.getFunders(0)).to.be.reverted

                  //all getFunders entries in the getFunders[] should be reset to 0 when deployer calls withdraw()
                  for (i = 1; i < 6; i++) {
                      assert.equal(
                          await fundMe.getAddressToAmountFunded(
                              accounts[i].address
                          ),
                          0
                      )
                  }
              })

              it("only allows the owner to withdraw", async function () {
                  const accounts = await ethers.getSigners()
                  const attacker = accounts[1] //any non deployer
                  const attackerConnectedContract = await fundMe.connect(
                      attacker
                  )
                  await expect(
                      attackerConnectedContract.withdraw()
                  ).to.be.revertedWith("FundMe__NotOwner") //uses contracts custom error code
              })

              it("cheaperWithdraw testing", async function () {
                  const accounts = await ethers.getSigners()
                  for (i = 1; i < 6; i++) {
                      //connect each account, remeber accounts[0] is the deployer!
                      const fundMeConnectedContract = await fundMe.connect(
                          accounts[i]
                      )
                      //get each account to fund the contract
                      await fundMeConnectedContract.fund({ value: sendValue })
                  }

                  const startingFundMeBalance =
                      await fundMe.provider.getBalance(fundMe.address)
                  const startingDeployerBalance =
                      await fundMe.provider.getBalance(deployer)

                  const transactionResponse = await fundMe.cheaperWithdraw()
                  const transactionReceipt = await transactionResponse.wait(1)
                  const { gasUsed, effectiveGasPrice } = transactionReceipt
                  const gasCost = gasUsed.mul(effectiveGasPrice)

                  //assert
                  const endingFundMeBalance = await fundMe.provider.getBalance(
                      fundMe.address
                  )
                  const endingDeployerBalance =
                      await fundMe.provider.getBalance(deployer)

                  assert.equal(endingFundMeBalance, 0)
                  assert.equal(
                      startingFundMeBalance
                          .add(startingDeployerBalance)
                          .toString(),
                      endingDeployerBalance.add(gasCost).toString()
                  )

                  //make sure the getFunders are reset properly
                  await expect(fundMe.getFunders(0)).to.be.reverted

                  //all getFunders entries in the getFunders[] should be reset to 0 when deployer calls withdraw()
                  for (i = 1; i < 6; i++) {
                      assert.equal(
                          await fundMe.getAddressToAmountFunded(
                              accounts[i].address
                          ),
                          0
                      )
                  }
              })

              it("can cheaperWithdraw eth from a single funder", async function () {
                  //arrange test
                  //get balance of contract, could also use ethers.provider.getBalance(), same
                  const startingFundMeBalance =
                      await fundMe.provider.getBalance(fundMe.address)
                  //get balance of deployer
                  const startingDeployerBalance =
                      await fundMe.provider.getBalance(deployer)

                  const transactionResponse = await fundMe.cheaperWithdraw()
                  const transactionReceipt = await transactionResponse.wait(1)
                  //pull out gas price and amount used from transactionReceipt obj, they are BNs
                  const { gasUsed, effectiveGasPrice } = transactionReceipt
                  const gasCost = gasUsed.mul(effectiveGasPrice) //.mul == * for BNs

                  const endingFundMeBalance = await fundMe.provider.getBalance(
                      fundMe.address
                  )
                  const endingDeployerBalance =
                      await fundMe.provider.getBalance(deployer)

                  assert.equal(endingFundMeBalance, 0)
                  assert.equal(
                      startingFundMeBalance
                          .add(startingDeployerBalance)
                          .toString(),
                      endingDeployerBalance.add(gasCost).toString()
                  ) //we use .add() since the balances are BN's. Also the deployer used gas to withdraw so need to account for that
              })
          })
      })
