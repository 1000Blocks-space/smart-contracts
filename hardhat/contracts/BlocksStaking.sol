pragma solidity ^0.8.0;
//SPDX-License-Identifier: MIT

import "hardhat/console.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract BlocksStaking {

  using SafeERC20 for IERC20;

  struct UserInfo {
    uint256 tokens; // amount of tokens in the Vault for a wallet
    uint256 totalRewardPerTokenSnapshot; // snapshot of totalRewardPerToken value for a wallet
  }

  // total amount of tokens currently in the Vault
  uint256 public totalTokens;
  // total amount of rewards per each staked token in the Vault
  uint256 private totalRewardPerToken;

  mapping(address => UserInfo) public userInfo;

  IERC20 private blsToken;

  event Claim(address indexed user, uint256 reward);

  constructor(IERC20 _blsTokenAddress) {
    blsToken = IERC20(_blsTokenAddress);
  }

  function getTotalRewardPerToken() public view returns(uint256) {
    return totalRewardPerToken / 1e12;
  }

  function getCurrentReward() public view returns(uint256) {
    UserInfo storage user = userInfo[msg.sender];
    uint256 tokens = user.tokens;
    uint256 rewardSnapshot = user.totalRewardPerTokenSnapshot;
    uint256 reward = tokens * (totalRewardPerToken - rewardSnapshot); // tokens * the difference between current reward per token and at the time of deposit

    return reward / 1e12;
  }

  function deposit(uint256 _amount) public {
    UserInfo storage user = userInfo[msg.sender];
    if (user.tokens > 0) { // if there are tokens in the Vault, fully harvest current reward
      claim();
    }

    totalTokens += _amount; // sum of total tokens in the Vault
    user.tokens += _amount; // cache tokens count for this wallet
    user.totalRewardPerTokenSnapshot = totalRewardPerToken; // cache current total reward per token

    blsToken.safeTransferFrom(address(msg.sender), address(this), _amount);
  }

  function withdraw() public {
    UserInfo storage user = userInfo[msg.sender];
    require(user.tokens > 0, "No tokens deposited for withdrawal.");
    
    claim();
    
    uint256 tokens = user.tokens;

    totalTokens -= tokens;
    user.tokens = 0;
    
    safeTransfer(msg.sender, tokens);
  }

  // CR:Mislim da mi tudi rabimo emergency withdraw. Npr, kaj se zgodi ce hoces withdrawat BLS tokene, ampak harvest funkcija zmeri faila? Torej ne mores...
  // CR...poglej kak majo v ostalih narejeno to....

  function claim() public {
    uint256 reward = getCurrentReward();
    
    if (reward <= 0) return;
    
    emit Claim(msg.sender, reward);

    userInfo[msg.sender].totalRewardPerTokenSnapshot = totalRewardPerToken; // cache current total reward per token
    // TODO: transfer BNBs reward to the wallet
  }

  function distribute() public payable {
    if (totalTokens > 0) {
      totalRewardPerToken += msg.value * 1e12 / totalTokens; // accumulated rewards calculated per each token in the Vault
    }
  }

  function safeTransfer(address _to, uint256 _amount) internal returns (uint256){
    uint256 blsBalance = blsToken.balanceOf(address(this));
    if (_amount > blsBalance) {            
      blsToken.transfer(_to, blsBalance);
      return blsBalance;
    } else {
      blsToken.transfer(_to, _amount);
      return _amount;
    }
  }
}