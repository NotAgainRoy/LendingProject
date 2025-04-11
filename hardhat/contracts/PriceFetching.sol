// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/access/Ownable.sol";

contract CollateralPriceFeedMock is Ownable {
    int256 private _price;
    uint8 public decimals = 18;

    constructor(int256 initialPrice) Ownable(msg.sender) {
        _price = initialPrice;
    }

    function setPrice(int256 newPrice) external onlyOwner {
        require(newPrice > 0, "Invalid price");
        _price = newPrice ;
    }

    function latestPrice() external view returns (int256) {
        return _price;
    }
}