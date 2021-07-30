const { ethers } = require("hardhat");
const { use, expect } = require("chai");
const { MockProvider, solidity } = require("ethereum-waffle");

use(solidity);

describe("Testing BlocksVault", function() {
  const [walletA, walletB, walletC] = new MockProvider().getWallets();

  console.log("walletA:", walletA.address);
  console.log("walletB:", walletB.address);
  console.log("walletC:", walletC.address);

  describe("Scenario 1", function() {
    let contract;
    it("Expected to deploy BlocksVault contract", async function () {
      const contractObject = await ethers.getContractFactory("BlocksVault");
      contract = await contractObject.deploy();
    });

    it("No tokens and rewards yet in the Vault", async function() {
      expect(await contract.getTotalTokens()).to.equal(0); // no tokens yet in the Vault
      expect(await contract.getTotalRewardPerToken()).to.equal(0); // no rewards yet in the Vault
    });

    it("Wallet A deposits 1 BLS tokens", async function() {
      await contract.deposit(walletA.address, 1);
      expect(await contract.getTotalTokens()).to.equal(1);
    });

    it("We distribute 10 BNBs of rewards", async function() {
      await contract.distribute(10);
      expect(await contract.getTotalTokens()).to.equal(1);
    });

    it("Wallet B deposits 1 BLS tokens", async function() {
      await contract.deposit(walletB.address, 1);
      expect(await contract.getTotalTokens()).to.equal(2);
    });

    it("We distribute 10 BNBs of rewards", async function() {
      await contract.distribute(10);
      expect(await contract.getTotalTokens()).to.equal(2);
    });

    it("Wallet A withdraws rewards", async function() {
      await contract.withdraw(walletA.address);
      expect(await contract.getTotalTokens()).to.equal(1);
    });

    it("Wallet B withdraws rewards", async function() {
      await contract.withdraw(walletB.address);
      expect(await contract.getTotalTokens()).to.equal(0);
    });
  });

  describe("Scenario 2", function() {
    let contract;
    it("Expected to deploy BlocksVault contract", async function () {
      const contractObject = await ethers.getContractFactory("BlocksVault");
      contract = await contractObject.deploy();
    });
    const [walletA, walletB, walletC] = new MockProvider().getWallets();
  
    it("No tokens and rewards yet in the Vault", async function() {
      expect(await contract.getTotalTokens()).to.equal(0); // no tokens yet in the Vault
      expect(await contract.getTotalRewardPerToken()).to.equal(0); // no rewards yet in the Vault
    });
  
    it("Wallet A deposits 2 BLS tokens", async function() {
      await contract.deposit(walletA.address, 2);
      expect(await contract.getTotalTokens()).to.equal(2);
    });
  
    it("We distribute 10 BNBs of rewards", async function() {
      await contract.distribute(10);
    });
  
    it("Wallet B deposits 4 BLS tokens", async function() {
      await contract.deposit(walletB.address, 4);
      expect(await contract.getTotalTokens()).to.equal(6);
    });
  
    it("We distribute 12 BNBs of rewards", async function() {
      await contract.distribute(12);
    });
  
    it("Wallet A withdraws rewards", async function() {
      await contract.withdraw(walletA.address);
      expect(await contract.getTotalTokens()).to.equal(4);
    });
  
    it("Wallet B withdraws rewards", async function() {
      await contract.withdraw(walletB.address);
      expect(await contract.getTotalTokens()).to.equal(0);
    });
  });

  describe("Scenario 3", function() {
    let contract;
    it("Expected to deploy BlocksVault contract", async function () {
      const contractObject = await ethers.getContractFactory("BlocksVault");
      contract = await contractObject.deploy();
    });
    const [walletA, walletB, walletC] = new MockProvider().getWallets();
  
    it("No tokens and rewards yet in the Vault", async function() {
      expect(await contract.getTotalTokens()).to.equal(0); // no tokens yet in the Vault
      expect(await contract.getTotalRewardPerToken()).to.equal(0); // no rewards yet in the Vault
    });
  
    it("Wallet A deposits 3 BLS tokens", async function() {
      await contract.deposit(walletA.address, 3);
      expect(await contract.getTotalTokens()).to.equal(3);
    });
  
    it("We distribute 10 BNBs of rewards", async function() {
      await contract.distribute(10);
    });
  
    it("Wallet B deposits 4 BLS tokens", async function() {
      await contract.deposit(walletB.address, 4);
      expect(await contract.getTotalTokens()).to.equal(7);
    });
  
    it("We distribute 11 BNBs of rewards", async function() {
      await contract.distribute(11);
    });

    it("Wallet C deposits 5 BLS tokens", async function() {
      await contract.deposit(walletC.address, 5);
      expect(await contract.getTotalTokens()).to.equal(12);
    });

    it("We distribute 12 BNBs of rewards", async function() {
      await contract.distribute(12);
    });
  
    it("Wallet A withdraws rewards", async function() {
      await contract.withdraw(walletA.address);
      expect(await contract.getTotalTokens()).to.equal(9);
    });
  
    it("Wallet B withdraws rewards", async function() {
      await contract.withdraw(walletB.address);
      expect(await contract.getTotalTokens()).to.equal(5);
    });

    it("Wallet C withdraws rewards", async function() {
      await contract.withdraw(walletC.address);
      expect(await contract.getTotalTokens()).to.equal(0);
    });
  });

  describe("Scenario 4", function() {
    let contract;
    it("Expected to deploy BlocksVault contract", async function () {
      const contractObject = await ethers.getContractFactory("BlocksVault");
      contract = await contractObject.deploy();
    });

    const [walletA] = new MockProvider().getWallets();

    it("Deposit, distribute, get current reward", async function() {
      await contract.deposit(walletA.address, 3);
      await contract.distribute(10);
      var ret = await contract.getCurrentReward(walletA.address);
      expect(ret).to.equal(9);
    });
  });

  describe("Scenario 5", function() {
    let contract;
    it("Expected to deploy BlocksVault contract", async function () {
      const contractObject = await ethers.getContractFactory("BlocksVault");
      contract = await contractObject.deploy();
    });

    const [walletA, walletB] = new MockProvider().getWallets();

    it("A:1, 10, B:1, 10 -> A=15, B=5", async function() {
      await contract.deposit(walletA.address, 1);
      await contract.distribute(10);
      await contract.deposit(walletB.address, 1);
      await contract.distribute(10);
      var retA = await contract.getCurrentReward(walletA.address);
      var retB = await contract.getCurrentReward(walletB.address);
      expect(retA).to.equal(15);
      expect(retB).to.equal(5);
    });
  });

  describe("Scenario 6", function() {
    let contract;
    it("Expected to deploy BlocksVault contract", async function () {
      const contractObject = await ethers.getContractFactory("BlocksVault");
      contract = await contractObject.deploy();
    });

    const [walletA, walletB] = new MockProvider().getWallets();

    it("Complex", async function() {
      await contract.deposit(walletA.address, 1);
      await contract.distribute(10);
      await contract.harvest(walletA.address);
      await contract.deposit(walletB.address, 1);
      await contract.distribute(10);
      var retA = await contract.getCurrentReward(walletA.address);
      var retB = await contract.getCurrentReward(walletB.address);
      expect(retA).to.equal(5);
      expect(retB).to.equal(5);

      await contract.withdraw(walletA.address);
      await contract.distribute(10);
      var retB = await contract.getCurrentReward(walletB.address);
      expect(retB).to.equal(15);

      await contract.withdraw(walletB.address);
      var retB = await contract.getCurrentReward(walletB.address);
      expect(retB).to.equal(0);

      expect(await contract.getTotalTokens()).to.equal(0);

      await contract.deposit(walletA.address, 1);
      await contract.distribute(10);
      await contract.deposit(walletB.address, 1);
      await contract.distribute(10);
      var retA = await contract.getCurrentReward(walletA.address);
      var retB = await contract.getCurrentReward(walletB.address);
      expect(retA).to.equal(15);
      expect(retB).to.equal(5);
      await contract.harvest(walletA.address);
      var retA = await contract.getCurrentReward(walletA.address);
      var retB = await contract.getCurrentReward(walletB.address);
      expect(retA).to.equal(0);
      expect(retB).to.equal(5);
      
      expect(await contract.getTotalTokens()).to.equal(2);
    });
  });
});

// describe("My Dapp", function () {
//   let myContract;

//   describe("YourContract", function () {
//     it("Should deploy YourContract", async function () {
//       const YourContract = await ethers.getContractFactory("BlocksContract");

//       myContract = await YourContract.deploy();
//     });

    // describe("calculatePrice()", function () {
    //   it("Proper prices shown", async function () {

    //     let res = await ethers.provider.getStorageAt('0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0', 0);
    //     let next = ethers.hexToAscii(res)
    //     // .then(result => {
    //     //   console.log(ethers.utils.hexToAscii(result));
    //     // });
    //     // .testing("0xb3B5e4c37BA0c173dA6347D99Dc0f1F77ad5AA91");
    //     console.log(next);
    //     // const responseArray = await myContract.calculatePrice(101, 202);
    //     // let block1 = responseArray[0];
    //     // console.log(responseArray[0]);
    //     // expect(block1.price).to.equal(0); // Price is 0
    //   });
    // });

    // describe("isPosterValid2()", function () {
    //   it("Poster validation should fail", async function () {
    //     // const newPurpose = "Test Purpose";
    //     await expect(myContract.calculatePrice("0203", "0102")).to.be.reverted;
    //     await expect(myContract.calculatePrice("0000", "4224")).to.be.reverted;
    //     await expect(myContract.calculatePrice("4454545", "4224")).to.be.reverted;
    //     await expect(myContract.calculatePrice("4123", "4022")).to.be.reverted;
    //   });
    // });

    // describe("purchasePoster()", function () {
    //   it("Should error if you dont pay anything", async function () {
    //     await expect(myContract.purchasePoster("0000", "0000",'imagehash1')).to.be.reverted;
    //   });

    //   it("Simple buy with proper amount of money", async function () {
    //     await myContract.setInitialBlockPrice(1);
    //     await myContract.purchasePoster("0000", "0000",'imagehash1',{value: 1});
    //   });

    //   it("should increase price after someone bought", async function () {
    //     await myContract.setInitialBlockPrice(1);
    //     await myContract.purchasePoster("0101", "0101",'imagehash1',{value: 1});

    //     expect(await myContract.calculatePrice("0101", "0101")).to.equal(5);
    //   });


    //   it("should be possible to pay more. Paying 5x more than initial price", async function () {
    //     await myContract.setInitialBlockPrice(1);
    //     await myContract.purchasePoster("0202", "0202",'imagehash1',{value: 5});

    //     expect(await myContract.calculatePrice("0202", "0202")).to.equal(25);
    //   });

    //   describe("Posting over existing posters.", function () {
         
    //     it("should be possible to buy once its already bought", async function () {         
    //       await myContract.setInitialBlockPrice(1);
    //       // Initial buy
    //       await myContract.purchasePoster("0404", "0404",'imagehash4',{value: 1});
    //       // Price now 5x  
    //       await myContract.purchasePoster("0404", "0404",'imagehash44',{value: 5});
    //       // expect(await myContract.calculatePrice("0101", "0101")).to.equal(5);
    //     });

    //     it("Bigger poster and increase price, but does not count as price increase per block < 1", async function () {         
    //       await myContract.setInitialBlockPrice(1);
    //       // Initial buy
    //       await myContract.purchasePoster("0505", "0505",'imagehash5',{value: 1});
    //       // Price now 5x
    //       await myContract.purchasePoster("0505", "0606",'imagehash66',{value: 11});
    //       // expect(await myContract.calculatePrice("0101", "0101")).to.equal(5);
    //       expect(await myContract.calculatePrice("0505", "0606")).to.equal(40);
    //     });

    //     it("Bigger poster and increase price.", async function () {         
    //       await myContract.setInitialBlockPrice(1);
    //       // Initial buy
    //       await myContract.purchasePoster("0707", "0707",'imagehash5',{value: 1});
    //       // Price now 5x
    //       await myContract.purchasePoster("0707", "0808",'imagehash66',{value: 12});
    //       // expect(await myContract.calculatePrice("0101", "0101")).to.equal(5);
    //       expect(await myContract.calculatePrice("0707", "0808")).to.equal(60);
    //     });

    //   });


    // });
    
//   });
// });
