// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IPriceFeed {
    function latestAnswer() external view returns (int256);
}

contract LendingPoolSimple is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;
    IERC20 public immutable lendingToken;
    IERC20 public immutable collateralToken;

    uint256 public interestRatePerBlock;
    uint256 public constant COLLATERAL_RATIO = 150;
    uint256 public constant LIQUIDATION_THRESHOLD = 125;
    uint256 public constant LIQUIDATION_BONUS = 105;
    uint256 public constant PRECISION = 100;

    // uint256 public collateralPrice = 1e18;

    struct Deposit {
        uint256 amount;
        uint256 lastBlock;
        uint256 earnedInterest;
    }

    struct Borrow {
        uint256 borrowed;
        uint256 collateral;
    }

    mapping(address => Deposit) public deposits;
    mapping(address => Borrow) public borrows;

    IPriceFeed public priceFeed; // collateral price fetching contract

    constructor(
        address _lending,
        address _collateral,
        uint256 _rate,
        address _priceFetchingAddr
    ) Ownable(msg.sender) {
        lendingToken = IERC20(_lending);
        collateralToken = IERC20(_collateral);
        interestRatePerBlock = _rate;
        priceFeed = IPriceFeed(_priceFetchingAddr);
    }

    function deposit(uint256 amount) external nonReentrant {
        require(amount > 0, "Invalid amount");
        _accrueInterest(msg.sender);

        lendingToken.safeTransferFrom(msg.sender, address(this), amount);
        deposits[msg.sender].amount += amount;
        deposits[msg.sender].lastBlock = block.number;
    }

    // function withdraw() external nonReentrant {
    //     _accrueInterest(msg.sender);

    //     uint256 total = deposits[msg.sender].amount;
    //     require(total > 0, "No deposit");

    //     deposits[msg.sender].amount = 0;
    //     deposits[msg.sender].lastBlock = 0;

    //     lendingToken.safeTransfer(msg.sender, total);
    // }

    function withdraw() external nonReentrant {
        _accrueInterest(msg.sender);

        uint256 total = deposits[msg.sender].amount;
        require(total > 0, "No deposit");

        Borrow memory b = borrows[msg.sender];
        if (b.borrowed > 0) {
            uint256 collateralPrice = fetchCollateralPrice();
            uint256 collateralValue = (b.collateral * collateralPrice) / 1e18;
            uint256 requiredCollateralValue = (b.borrowed * COLLATERAL_RATIO) /
                PRECISION;

            require(
                collateralValue >= requiredCollateralValue,
                "Cannot withdraw: undercollateralized"
            );
        }

        deposits[msg.sender].amount = 0;
        deposits[msg.sender].lastBlock = 0;

        lendingToken.safeTransfer(msg.sender, total);
    }

    function getTotalInterest(address user) public view returns (uint256) {
        Deposit memory d = deposits[user];
        if (d.amount == 0) return d.earnedInterest;

        uint256 interest = (d.amount *
            interestRatePerBlock *
            (block.number - d.lastBlock)) / 1e18;
        return d.earnedInterest + interest;
    }

    function addCollateral(uint256 amount) external nonReentrant {
        require(amount > 0, "Invalid amount");
        collateralToken.safeTransferFrom(msg.sender, address(this), amount);
        borrows[msg.sender].collateral += amount;
    }

    function fetchCollateralPrice() internal view returns (uint256) {
        int256 price = priceFeed.latestAnswer();
        require(price > 0, "Invalid price");
        return uint256(price);
    }

    function borrow(uint256 amount) external nonReentrant {
        require(amount > 0, "Invalid amount");

        uint256 collateralPrice = fetchCollateralPrice();

        uint256 collateralValue = (borrows[msg.sender].collateral *
            collateralPrice) / 1e18;
        uint256 maxBorrow = (collateralValue * PRECISION) / COLLATERAL_RATIO;

        require(
            borrows[msg.sender].borrowed + amount <= maxBorrow,
            "Insufficient collateral"
        );

        borrows[msg.sender].borrowed += amount;
        lendingToken.safeTransfer(msg.sender, amount);
    }

    function repay(uint256 amount) external nonReentrant {
        require(amount > 0, "Invalid amount");
        Borrow storage b = borrows[msg.sender];
        require(b.borrowed > 0, "Nothing to repay");

        if (amount > b.borrowed) amount = b.borrowed;
        lendingToken.safeTransferFrom(msg.sender, address(this), amount);
        b.borrowed -= amount;
    }

    function removeCollateral(uint256 amount) external nonReentrant {
        require(
            amount > 0 && amount <= borrows[msg.sender].collateral,
            "Invalid amount"
        );

        uint256 collateralPrice = fetchCollateralPrice();

        uint256 newCollateral = borrows[msg.sender].collateral - amount;
        uint256 newValue = (newCollateral * collateralPrice) / 1e18;
        uint256 required = (borrows[msg.sender].borrowed * COLLATERAL_RATIO) /
            PRECISION;

        require(newValue >= required, "Would violate collateral ratio");

        borrows[msg.sender].collateral = newCollateral;
        collateralToken.safeTransfer(msg.sender, amount);
    }

    // function liquidate(address user, uint256 repayAmount)
    //     external
    //     nonReentrant
    // {
    //     require(user != msg.sender, "Self-liquidation not allowed");

    //     Borrow storage b = borrows[user];
    //     require(b.borrowed >= repayAmount, "Too much");
    //     uint256 collateralPrice = fetchCollateralPrice();

    //     uint256 value = (b.collateral * collateralPrice) / 1e18;
    //     uint256 ratio = (value * PRECISION) / b.borrowed;
    //     require(ratio < LIQUIDATION_THRESHOLD, "Not liquidatable");

    //     uint256 discountedCollateral = (repayAmount *
    //         1e18 *
    //         LIQUIDATION_BONUS) / (collateralPrice * PRECISION);
    //     require(
    //         discountedCollateral <= b.collateral,
    //         "Insufficient collateral"
    //     );

    //     lendingToken.safeTransferFrom(msg.sender, address(this), repayAmount);
    //     b.borrowed -= repayAmount;
    //     b.collateral -= discountedCollateral;

    //     collateralToken.safeTransfer(msg.sender, discountedCollateral);
    // }

    function liquidate(address user, uint256 repayAmount)
        external
        nonReentrant
    {
        require(user != msg.sender, "Self-liquidation not allowed");

        Borrow storage b = borrows[user];
        require(b.borrowed >= repayAmount, "Repay too much");

        uint256 collateralPrice = fetchCollateralPrice();
        uint256 collateralValue = (b.collateral * collateralPrice) / 1e18;
        uint256 healthFactor = (collateralValue * PRECISION) / b.borrowed;
        require(
            healthFactor < LIQUIDATION_THRESHOLD,
            "Not eligible for liquidation"
        );

        uint256 discountedCollateral = (repayAmount *
            1e18 *
            LIQUIDATION_BONUS) / (collateralPrice * PRECISION);
        require(
            discountedCollateral <= b.collateral,
            "Insufficient collateral"
        );

        lendingToken.safeTransferFrom(msg.sender, address(this), repayAmount);
        b.borrowed -= repayAmount;
        b.collateral -= discountedCollateral;

        collateralToken.safeTransfer(msg.sender, discountedCollateral);
    }

    function _accrueInterest(address user) internal {
        Deposit storage d = deposits[user];
        if (d.amount == 0) return;

        uint256 interest = (d.amount *
            interestRatePerBlock *
            (block.number - d.lastBlock)) / 1e18;
        d.earnedInterest += interest;
        d.amount += interest;
        d.lastBlock = block.number;
    }

    // function updateCollateralPrice(uint256 newPrice) external onlyOwner {
    //     require(newPrice > 0, "Invalid price");
    //        uint collateralPrice =  fetchCollateralPrice();
    //     collateralPrice = newPrice;
    // }

    function getBorrowInfo(address user)
        external
        view
        returns (
            uint256 borrowed,
            uint256 collateral,
            uint256 ratio
        )
    {
        Borrow memory b = borrows[user];
        uint256 collateralPrice = fetchCollateralPrice();
        uint256 value = (b.collateral * collateralPrice) / 1e18;
        borrowed = b.borrowed;
        collateral = b.collateral;
        ratio = b.borrowed > 0 ? (value * PRECISION) / b.borrowed : 0;
    }

    // function getDepositInterestInfo(address user ) external view returns (uint256 amount ,uint256 lastblock, uint256 interestEarned  ){
    //     return (deposits[user].amount, deposits[user].lastBlock , deposits[user].earnedInterest );
    // }

    function getMaxBorrowable(address user) external view returns (uint256) {
        Borrow memory b = borrows[user];
        uint256 collateralPrice = fetchCollateralPrice();
        uint256 collateralValue = (b.collateral * collateralPrice) / 1e18;
        return (collateralValue * PRECISION) / COLLATERAL_RATIO;
    }

    function getHealthFactor(address user) public view returns (uint256) {
        Borrow memory b = borrows[user];
        if (b.borrowed == 0) {
            return type(uint256).max;
        }
        uint256 collateralPrice = fetchCollateralPrice();
        uint256 collateralValue = (b.collateral * collateralPrice) / 1e18;
        return (collateralValue * PRECISION) / b.borrowed;
    }
}
