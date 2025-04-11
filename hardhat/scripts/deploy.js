// scripts/deploy.js
async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);

  // Deploy mock tokens first
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const lendingToken = await MockERC20.deploy("Lending Token", "LT", 18);
  await lendingToken.waitForDeployment();
  console.log("LendingToken deployed to:", await lendingToken.getAddress());

  const collateralToken = await MockERC20.deploy("Collateral Token", "CT", 18);
  await collateralToken.waitForDeployment();
  console.log("CollateralToken deployed to:", await collateralToken.getAddress());

  // Deploy mock price feed
  const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
  const priceFeed = await MockPriceFeed.deploy(ethers.parseEther("1.0"));
  await priceFeed.waitForDeployment();
  console.log("PriceFeed deployed to:", await priceFeed.getAddress());

  // Deploy lending pool
  const interestRate = ethers.parseEther("0.001"); // 0.1% per block
  const LendingPoolSimple = await ethers.getContractFactory("LendingPoolSimple");
  const lendingPool = await LendingPoolSimple.deploy(
    await lendingToken.getAddress(),
    await collateralToken.getAddress(),
    interestRate,
    await priceFeed.getAddress()
  );
  await lendingPool.waitForDeployment();
  console.log("LendingPool deployed to:", await lendingPool.getAddress());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });