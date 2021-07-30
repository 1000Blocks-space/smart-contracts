pragma solidity 0.8.5;
//SPDX-License-Identifier: MIT

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract BlockSpacePresale is ReentrancyGuard, Ownable {
  
    IERC20 public token; // The token being sold
    uint constant public rate = 10500; // tokens / BNB
    uint constant public hardCap = 400 ether; // Presale(s) cap   
    uint public individualCap = 10 ether; // Individual cap   
    uint constant private presale1Start = 1624129200; //GMT: Saturday, June 19, 2021 7:00:00 PM
    uint constant private presale2Start = 1624179600; //GMT: Sunday, June 20, 2021 9:00:00 AM

    address payable private _deployer; // Address where funds are collected
    uint private _weiRaised = 43020800000000000000; // Amount of wei raised from part 1 of presale
    uint public participants = 61; // Number of participants from part 1 of presale
    mapping(address => uint256) private _contributions;

    /**
     * Event for token purchase logging
     * @param purchaser who paid for the tokens
     * @param value weis paid for purchase
     * @param amount amount of tokens purchased
     */
    event TokensPurchased(address indexed purchaser, uint value, uint amount);

    constructor (IERC20 tokenSold) {
        require(address(tokenSold) != address(0), "Crowdsale: token is the zero address");
        _deployer = payable(msg.sender);
        token = tokenSold;
    }

    // Fallback function. Dont call this from another smart contract, wont work.
    fallback() external payable {
        buyTokens();
    }

    receive() external payable{
        buyTokens();
    }

    function buyTokens() public nonReentrant payable {

        require(isPresaleActive(), "Presale not active or already finished");
        require(_preValidatePurchase(), "Invalid purchase");

        uint weiAmount = msg.value;

        _contributions[msg.sender] = _contributions[msg.sender] + weiAmount;

        // calculate token amount buyer gets
        uint tokens = weiAmount * rate;

        // update state of raised funds
        _weiRaised += weiAmount;
        participants++;

        token.transferFrom(_deployer, msg.sender, tokens);
        
        emit TokensPurchased(msg.sender, weiAmount, tokens);

        _forwardFunds();
    }

    function amountRaised() public view returns(uint){
        return _weiRaised;
    }

    function _preValidatePurchase() private view returns (bool) {
        bool isIndividualCapOk = _contributions[msg.sender] + msg.value <= individualCap;
        bool withinHardCap = _weiRaised + msg.value <= hardCap;
        bool nonZeroPurchase = msg.value != 0;

        return withinHardCap && nonZeroPurchase && isIndividualCapOk;
    }

    function _forwardFunds() internal {
        _deployer.transfer(msg.value);
    }

    function isPresaleActive() public view returns (bool) {

        bool firstPresaleValid = block.timestamp >= presale1Start && _weiRaised < hardCap/2;
        bool secondPresaleValid = block.timestamp >= presale2Start && _weiRaised < hardCap;

        return firstPresaleValid || secondPresaleValid;
    }

    function changeIndividualCap(uint newCap) external onlyOwner {
        individualCap = newCap;
    }

}