require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();
console.log("RPC_URL", process.env.RPC_URL);

module.exports = {
  solidity: "0.8.26",
  networks: {
    sepolia: {
      url: `${process.env.RPC_URL}`,
      accounts: [process.env.PRIVATE_KEY]
    }
  }
};
