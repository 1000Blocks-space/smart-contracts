pragma solidity 0.8.5;
//SPDX-License-Identifier: MIT

import "hardhat/console.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

contract BlocksVault {
  
  using SafeMath for uint256;

  // total amount of tokens currently in the Vault
  uint256 private totalTokens;
  // total amount of rewards per each staked token in the Vault
  uint256 private totalRewardPerToken;

  // amount of tokens in the Vault for each wallet
  mapping(address => uint256) private tokensPerWallet;
  // snapshot of
  mapping(address => uint256) private rewardSnapshotPerWallet;

  function getTotalTokens() public view returns(uint256) {
    return totalTokens;
  }

  function getTotalRewardPerToken() public view returns(uint256) {
    return totalRewardPerToken;
  }

  function getCurrentReward(address _wallet) public view returns(uint256) {
    uint256 tokens = tokensPerWallet[_wallet];
    uint256 rewardSnapshot = rewardSnapshotPerWallet[_wallet];
    uint256 reward = tokens.mul(totalRewardPerToken.sub(rewardSnapshot)); // tokens * the difference between current reward per token and at the time of deposit

    return reward.div(1e12);
  }

  function deposit(address _wallet, uint256 _amount) public {
    if (tokensPerWallet[_wallet] > 0) { // if there are tokens in the Vault, fully harvest current reward
      harvest(_wallet);
    }

    totalTokens = totalTokens.add(_amount); // sum of total tokens in the Vault
    tokensPerWallet[_wallet] = _amount; // cache tokens count for this wallet
    rewardSnapshotPerWallet[_wallet] = totalRewardPerToken; // cache current total reward per token
  }

  function withdraw(address _wallet) public {
    require(tokensPerWallet[_wallet] > 0, "No tokens deposited for withdrawal.");
    
    harvest(_wallet);
    
    uint256 tokens = tokensPerWallet[_wallet];

    totalTokens = totalTokens.sub(tokens);
    tokensPerWallet[_wallet] = 0;
    
    // TODO: transfer staked BLBs to the wallet
  }

  function harvest(address _wallet) public {
    uint256 reward = getCurrentReward(_wallet);
    
    console.log("HARVEST REWARD:", _wallet, reward);

    rewardSnapshotPerWallet[_wallet] = totalRewardPerToken; // cache current total reward per token
    // TODO: transfer BNBs reward to the wallet
  }

  function distribute(uint256 _reward) public {
    if (totalTokens > 0) {
      totalRewardPerToken = totalRewardPerToken.add(_reward.mul(1e12).div(totalTokens)); // accumulated rewards calculated per each token in the Vault
    }
  }
}