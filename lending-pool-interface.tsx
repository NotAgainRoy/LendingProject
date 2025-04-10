"use client";
import { ethers } from "ethers";
import { ContractFunctionExecutionError } from "viem";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useState, useEffect } from "react";
import { JsonRpcProvider, Web3Provider } from "@ethersproject/providers";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowDownUp, PlusCircle, MinusCircle, RefreshCw } from "lucide-react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  usePublicClient,
} from "wagmi";
import { parseUnits, formatUnits } from "viem";

import tokenABI from "./abi/erc20.json";
import lendingPoolContractABI from "./abi/lendingpool.json";

const getRpcProvider = () => {
  const RPC_URL =
    process.env.NEXT_PUBLIC_RPC_URL ||
    "https://eth-sepolia.g.alchemy.com/v2/9QbFyMACsTwY7Vshvons_P36ADUye7vM";
  return new JsonRpcProvider(RPC_URL);
};

// Contract addresses
const LENDING_POOL_ADDRESS = process.env
  .NEXT_PUBLIC_LENDING_POOL_ADDRESS as `0x${string}`;
const ROY_TOKEN = process.env.NEXT_PUBLIC_ROY_TOKEN_ADDRESS as `0x${string}`;
const COLLATERAL_TOKEN = process.env
  .NEXT_PUBLIC_COLLATERAL_TOKEN_ADDRESS as `0x${string}`;
const zeroAddress = "0x0000000000000000000000000000000000000000";

// Define types for contract data
type DepositInfo = {
  amount: bigint;
  lastBlock: bigint;
  earnedInterest: bigint;
};

type LendingPoolData = {
  depositInfo: DepositInfo;
  borrowedBalance: bigint;
  collateralBalance: bigint;
  healthFactor: Number;
  interestRate: Number;
  // maxBorrowAmount: bigint;
  collateralizationRatio: bigint;
  liquidationThreshold: bigint;
  liquidationBonus: bigint;
  collateralPrice: bigint;
  currentBlock: number;
  tokenAllowance: bigint;
  totalInterest: bigint; // Added totalInterest property
  precision: bigint; // Added precision property
  borrowInfo: {
    borrowed: bigint;
    collateral: bigint;
    ratio: bigint;
  };
  coltBalance: Number;
  maxBorrowAmount: bigint;
  // interestInfo: {
  //   amount: bigint;
  //   lastBlock: bigint;
  //   earnedInterest: bigint;
  // };
};

async function fetchLendingPoolData(
  address: string,
  provider: Web3Provider
): Promise<LendingPoolData> {
  const lendingPoolContract = new ethers.Contract(
    LENDING_POOL_ADDRESS,
    lendingPoolContractABI,
    provider as any
  );
  const royTokenContract = new ethers.Contract(
    ROY_TOKEN,
    tokenABI,
    provider as any
  );

  const colTokenContract = new ethers.Contract(
    COLLATERAL_TOKEN,
    tokenABI,
    provider as any
  );

  const userAddress = address || zeroAddress;

  try {
    console.log(
      "Fetching data for address:",
      userAddress,
      LENDING_POOL_ADDRESS,
      ROY_TOKEN
    );
    // Get deposit info
    const depositInfo = await lendingPoolContract.deposits(userAddress);

    console.log("Deposit Info:", depositInfo);
    // Get borrow info
    const borrowInfo = await lendingPoolContract.getBorrowInfo(userAddress);
    console.log("Borrow Info:", borrowInfo);
    const borrowedBalance = borrowInfo.borrowed;
    console.log("Borrowed Balance:", borrowedBalance.toString());
    const collateralBalance = borrowInfo.collateral;
    console.log("Collateral Balance:", collateralBalance.toString());
    const healthRatio = borrowInfo.ratio || 0; // This is the collateralization ratio
    console.log("Health Ratio:", healthRatio.toString());
    const depositInterestInfo = 0;
    console.log("Deposit Interest Info:", depositInterestInfo);
    const totalInterest =
      (await lendingPoolContract.getTotalInterest(userAddress)) || 0;
    console.log("Total Interest:", totalInterest.toString());
    const interest = await lendingPoolContract.interestRatePerBlock();
    const interestRate: number = Number(interest) / Number(10 ** 18);
    console.log("Interest Rate:", interestRate);

    // Get constants
    const collateralizationRatio = await lendingPoolContract.COLLATERAL_RATIO();
    console.log("Collateralization Ratio:", collateralizationRatio.toString());
    const liquidationThreshold =
      await lendingPoolContract.LIQUIDATION_THRESHOLD();
    console.log("Liquidation Threshold:", liquidationThreshold.toString());
    const liquidationBonus = await lendingPoolContract.LIQUIDATION_BONUS();
    console.log("Liquidation Bonus:", liquidationBonus.toString());
    const precision = await lendingPoolContract.PRECISION();
    console.log("Precision:", precision.toString());
    const maxAvailableBorrowable = await lendingPoolContract.getMaxBorrowable(
      address
    );
    console.log("maxAvailableBorrowable:", maxAvailableBorrowable.toString());

    // Get collateral price
    const collateralPrice = await lendingPoolContract.fetchCollateralPrice();
    console.log("Collateral Price:", collateralPrice.toString());

    // Get token allowance
    const tokenAllowance = await royTokenContract.allowance(
      userAddress,
      LENDING_POOL_ADDRESS
    );
    console.log("Token Allowance:", tokenAllowance.toString());

    const coltBalance = await colTokenContract.balanceOf(userAddress);
    console.log("getBalance" , coltBalance)
    //  const  maxBorrowAmount =  await lendingPoolContract.getMaxBorrowAmount(userAddress)
    //  console.log("Max Borrow Amount:", maxBorrowAmount.toString());

    return {
      depositInfo: {
        amount: depositInfo.amount,
        lastBlock: depositInfo.lastBlock,
        earnedInterest: depositInfo.earnedInterest,
      },
      borrowInfo: {
        borrowed: borrowedBalance,
        collateral: collateralBalance,
        ratio: healthRatio,
      },
      totalInterest,
      interestRate,
      collateralizationRatio,
      liquidationThreshold,
      liquidationBonus,
      precision,
      collateralPrice,
      tokenAllowance,
      borrowedBalance,
      collateralBalance,
      healthFactor: healthRatio,
      maxBorrowAmount: maxAvailableBorrowable,
      coltBalance,
      // maxBorrowAmount,
      currentBlock: await provider.getBlockNumber(),
    };
  } catch (err) {
    console.error("Error fetching lending pool data:", err);
    throw err;
  }
}

export default function LendingPoolInterface() {
  // State variables
  const [activeTab, setActiveTab] = useState("deposit");
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [borrowAmount, setBorrowAmount] = useState("");
  const [repayAmount, setRepayAmount] = useState("");
  const [collateralAmount, setCollateralAmount] = useState("");
  const [transactionPending, setTransactionPending] = useState(false);
  const [poolData, setPoolData] = useState<LendingPoolData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Wagmi hooks
  const { address, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  console.log(
    "address",
    address,
    isConnected,
    LENDING_POOL_ADDRESS,
    ROY_TOKEN,
    COLLATERAL_TOKEN
  );

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);

        // Use the RPC provider directly instead of Web3Provider with publicClient
        const provider = getRpcProvider();

        if (address) {
          const data = await fetchLendingPoolData(address, provider as any);
          console.log("Fetched Lending Pool Data:", data);
          setPoolData(data);
        }

        setIsLoading(false);
      } catch (error) {
        console.error("Error loading data:", error);
        setIsLoading(false);
      }
    };

    fetchData();
  }, [address]);

  // Function to refresh data
  // const refreshData = async () => {
  //   if (!isConnected || !address) {
  //     setIsLoading(false);
  //     return;
  //   }

  //   try {
  //     setIsLoading(true);
  //     const provider = new Web3Provider(
  //       publicClient?.transport.provider as any
  //     );
  //     const data = await fetchLendingPoolData(address, provider);

  //     console.log("Fetched Lending Pool Data:", data);
  //     setPoolData(data);
  //   } catch (error) {
  //     console.error("Error refreshing data:", error);
  //     toast.error("Failed to load lending pool data");
  //   } finally {
  //     setIsLoading(false);
  //   }
  // };

  // Handle approval for ROY token
  const handleApproveUSDC = async () => {
    if (!address) return;

    try {
      setTransactionPending(true);
      // Use the correct decimals (18) for ROY_TOKEN
      const amountToApprove = parseUnits(depositAmount || "1000", 18); // Approve a large amount

      const txHash = await writeContractAsync({
        address: ROY_TOKEN,
        abi: tokenABI,
        functionName: "approve",
        args: [LENDING_POOL_ADDRESS, amountToApprove],
      });

      console.log("Approval tx hash:", txHash);
      toast.success("Approval transaction submitted!");

      // Wait for transaction to be mined before refreshing data
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Give blockchain time to process

      toast.success("ROY TOKEN approved successfully!");
      return txHash;
    } catch (error) {
      if (
        error instanceof ContractFunctionExecutionError &&
        error.message.includes("User rejected")
      ) {
        toast.warning("Transaction rejected by user.");
      } else {
        console.error("Error approving ROY Token:", error);
        toast.error("Something went wrong during approval.");
      }
      return null;
    } finally {
      setTransactionPending(false);
    }
  };

  // Handle deposit
  const handleDeposit = async () => {
    if (!address || !depositAmount) {
      toast.warn("Wallet not connected or invalid deposit amount");
      return;
    }
    try {
      setTransactionPending(true);
      // Check if we need to approve first
      const allowance = poolData?.tokenAllowance || BigInt(0);
      const amountToDeposit = parseUnits(depositAmount, 18);
      if (Number(allowance) < Number(amountToDeposit)) {
        const approvalTx = await handleApproveUSDC();
        if (!approvalTx) {
          setTransactionPending(false);
          return;
        }
      }
      // if(Number(allowance) > Number(amountToDeposit)){
      const txHash = await writeContractAsync({
        address: LENDING_POOL_ADDRESS,
        abi: lendingPoolContractABI,
        functionName: "deposit",
        args: [parseUnits(depositAmount, 18)],
      });
      console.log("Deposit tx hash:", txHash);
      toast.success("Deposit successful!");
      setDepositAmount("");
      // }else{
      // toast.error("Insufficient allowance. Please approve first.");
      // }
    } catch (error) {
      console.error("Error depositing:", error);
      toast.error("Deposit failed. Check console for details.");
    }
  };

  // Withdraw
  const handleWithdraw = async () => {
    if (!address) return;

    try {
      setTransactionPending(true);
      const withdrawAmountValue =
        withdrawAmount ||
        (poolData?.depositInfo?.amount
          ? formatUnits(poolData.depositInfo.amount, 18)
          : "0");


          if (Number(poolData?.collateralBalance ) > 0)  {
            toast.error("For withdrawl first clear repay collateral mount");
            return;
          }

      const txHash = await writeContractAsync({
        address: LENDING_POOL_ADDRESS,
        abi: lendingPoolContractABI,
        functionName: "withdraw",
        args: [],
      });

      setWithdrawAmount("");
      if (txHash) {
        toast.success("Withdraw successful!");
      }
    } catch (error) {
      console.error("Error withdrawing:", error);
      toast.error("Withdraw failed. Check console for details.");
    } finally {
      setTransactionPending(false);
    }
  };

  // Borrow
  const handleBorrow = async () => {
    if (!address || !borrowAmount) return;

    try {
      setTransactionPending(true);
      const amountToBorrow = parseUnits(borrowAmount, 18);
      console.log(
        "poolData?.collateralBalance",
        Number(poolData?.maxBorrowAmount),
        Number(amountToBorrow)
      );

      if (Number(poolData?.maxBorrowAmount) < Number(amountToBorrow)) {
        console.log("************", poolData?.collateralBalance);
        toast.error("Insufficient collateral to borrow");
      } else {
       
        const txHash = await writeContractAsync({
          address: LENDING_POOL_ADDRESS,
          abi: lendingPoolContractABI,
          functionName: "borrow",
          args: [amountToBorrow],
        });
        console.log("Borrow tx hash:", txHash);
        toast.success("Borrow successful!");
      }
    } catch (error) {
      console.error("Error borrowing:", error);
      toast.error("Borrow failed. Check console for details.");
    } finally {
      setTransactionPending(false);
    }
  };

  // Repay
  const handleRepay = async () => {
    if (!address || !repayAmount) return;

    try {
      // Check if approval is needed
      // const allowance = poolData?.tokenAllowance ;
      const amountToRepay = parseUnits(repayAmount, 18);

      // if (Number(allowance) < Number(amountToRepay)) {
        await handleApproveUSDC();
      // }

      // console.log("allowance **************", allowance, amountToRepay);

      // if (Number(allowance) > Number(amountToRepay)) {
      if(Number(poolData?.coltBalance) > Number(amountToRepay)){
        setTransactionPending(true);
        const txHash = await writeContractAsync({
          address: LENDING_POOL_ADDRESS,
          abi: lendingPoolContractABI,
          functionName: "repay",
          args: [amountToRepay],
        });

        setRepayAmount("");
        if (txHash) {
          toast.success("Repay successful!");
        }
      } else {
        toast.error("Insufficient Balance to repay");
      }
    } catch (error) {
      console.error("Error repaying:", error);
      toast.error("Repay failed. Check console for details.");
    } finally {
      setTransactionPending(false);
    }
  };

  // Add Collateral
  const handleAddCollateral = async () => {
    if (!address || !collateralAmount) return;

    try {
      setTransactionPending(true);

      

      const amountToApprove = parseUnits(depositAmount || "1000", 18); // Approve a large amount

      if (Number(poolData?.coltBalance) <= amountToApprove){
        toast.error("Insufficient balance to add collateral");
        return;
      }
      console.log("Adding collateral:", amountToApprove);
      const approveCollateralAllowance = await writeContractAsync({
        address: COLLATERAL_TOKEN,
        abi: tokenABI,
        functionName: "approve",
        args: [LENDING_POOL_ADDRESS, parseUnits(collateralAmount, 20)]
      });

      console.log("Approval Collateral Allowance:", Number(approveCollateralAllowance) , Number(collateralAmount));

      if (Number(approveCollateralAllowance) > Number(collateralAmount) ) {
        const txHash = await writeContractAsync({
          address: LENDING_POOL_ADDRESS,
          abi: lendingPoolContractABI,
          functionName: "addCollateral",
          args: [parseUnits(collateralAmount, 18)],
          // value: ,
        });
        console.log("Add Collateral tx hash:", txHash);
        setCollateralAmount("");
        if (txHash) {
          toast.success("Collateral added successfully!");
        }
      }
    } catch (error) {
      console.error("Error adding collateral:", error);
      toast.error("Failed to add collateral. Check console for details.");
    } finally {
      setTransactionPending(false);
    }
  };

  // Remove Collateral
  const handleRemoveCollateral = async () => {
    if (!address || !collateralAmount) return;

    try {
      setTransactionPending(true);
      const txHash = await writeContractAsync({
        address: LENDING_POOL_ADDRESS,
        abi: lendingPoolContractABI,
        functionName: "removeCollateral",
        args: [parseUnits(collateralAmount, 18)],
      });

      setCollateralAmount("");
      toast.success("Collateral removed successfully!");
    } catch (error) {
      console.error("Error removing collateral:", error);
      toast.error("Failed to remove collateral. Check console for details.");
    } finally {
      setTransactionPending(false);
    }
  };

  // Fetch data on load and when account changes

  // Format data for display
  const formattedDepositedBalance = parseFloat(
    formatUnits(poolData?.depositInfo?.amount || BigInt(0), 18)
  ).toFixed(4);

  const formattedBorrowedBalance = parseFloat(
    formatUnits(poolData?.borrowedBalance || BigInt(0), 18)
  ).toFixed(4);

  const formattedCollateralBalance = parseFloat(
    formatUnits(poolData?.collateralBalance || BigInt(0), 18)
  ).toFixed(4);

  // const formattedMaxBorrowAmount = parseFloat(
  //   formatUnits(poolData?.maxBorrowAmount || BigInt(0), 6)
  // ).toFixed(2);

  const formattedInterestRate = parseFloat(
    (poolData?.interestRate || BigInt(10)).toString()
  ).toFixed(4);

  const formattedCollateralPrice = parseFloat(
    formatUnits(poolData?.collateralPrice || BigInt(100), 18)
  ).toFixed(4);

  const formattedHealthFactor = parseFloat(
    (poolData?.healthFactor || BigInt(150)).toString()
  ).toFixed(0);

  const formattedTotalInterest = parseFloat(
    ((Number(poolData?.totalInterest) || 0) / 1e18).toString()
  );

  console.log("formattedTotalInterest", formattedTotalInterest);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Navbar */}
      <nav className="w-full bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center">
            <h1 className="text-xl font-bold text-[#059669]">LendingPool</h1>
          </div>

          <ConnectButton />
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-grow px-4 py-8 md:px-8">
        <div className="max-w-7xl mx-auto">
          <header className="mb-8">
            <p className="text-gray-600">
              Deposit, borrow, and manage your assets
            </p>
          </header>

          <div className="grid gap-6 md:grid-cols-3">
            <Card className="border-gray-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-black">Your Balance</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex justify-center p-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-500"></div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Deposited</span>
                      <span className="font-medium text-black">
                        {formattedDepositedBalance} (ROY-TOKEN)
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Borrowed</span>
                      <span className="font-medium text-black">
                        {formattedBorrowedBalance} (ROY-TOKEN)
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Collateral</span>
                      <span className="font-medium text-black">
                        {formattedCollateralBalance} (COL-TOKEN)
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
              <CardFooter className="pt-0">
                <div className="flex justify-between w-full">
                  <span className="font-medium text-[#059669]">
                    {formattedHealthFactor}% (Health Factor)
                  </span>
                  <span className="font-medium text-[#059669]">
                    {formattedTotalInterest}% (Your Current Interest Gained)
                  </span>
                  {/* <Button 
                    variant="outline" 
                    size="sm" 
                    // onClick={refreshData}
                    disabled={totalInterest || isLoading}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button> */}
                </div>
              </CardFooter>
            </Card>

            <Card className="border-gray-200 md:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-black">Actions</CardTitle>
                <CardDescription>
                  Manage your deposits, withdrawals, borrowing, and repayments
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs
                  defaultValue="deposit"
                  className="w-full"
                  onValueChange={setActiveTab}
                >
                  <TabsList className="grid grid-cols-4 mb-4">
                    <TabsTrigger
                      value="deposit"
                      className="data-[state=active]:bg-[#059669] data-[state=active]:text-white"
                    >
                      Deposit
                    </TabsTrigger>
                    <TabsTrigger
                      value="withdraw"
                      className="data-[state=active]:bg-[#059669] data-[state=active]:text-white"
                    >
                      Withdraw
                    </TabsTrigger>
                    <TabsTrigger
                      value="borrow"
                      className="data-[state=active]:bg-[#059669] data-[state=active]:text-white"
                    >
                      Borrow
                    </TabsTrigger>
                    <TabsTrigger
                      value="repay"
                      className="data-[state=active]:bg-[#059669] data-[state=active]:text-white"
                    >
                      Repay
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="deposit" className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">
                          Interest Rate
                        </span>
                        <span className="text-sm font-medium text-[#059669]">
                          {formattedInterestRate}% per block
                        </span>
                      </div>
                      <Input
                        type="number"
                        placeholder="Amount to deposit"
                        className="border-gray-300"
                        value={depositAmount}
                        onChange={(e) => setDepositAmount(e.target.value)}
                      />
                    </div>
                    <Button
                      className="w-full bg-[#059669] hover:bg-[#059669]/90"
                      onClick={handleDeposit}
                      disabled={
                        !isConnected ||
                        transactionPending ||
                        !depositAmount ||
                        isLoading
                      }
                    >
                      <PlusCircle className="mr-2 h-4 w-4" />
                      {transactionPending ? "Processing..." : "Deposit"}
                    </Button>
                  </TabsContent>

                  <TabsContent value="withdraw" className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">
                          Available to Withdraw
                        </span>
                        <span className="text-sm font-medium text-black">
                          {formattedDepositedBalance} ROY-TOKEN
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">
                          Interest Earned
                        </span>
                        <span className="text-sm font-medium text-[#059669]">
                          {parseFloat(
                            formatUnits(
                              // poolData?.depositInfo?.earnedInterest ||
                              poolData?.totalInterest || BigInt(1),
                              18
                            )
                          ).toFixed(4)}{" "}
                          ROY-TOKEN
                        </span>
                      </div>
                      {/* <Input
                        type="number"
                        placeholder="Amount to withdraw"
                        className="border-gray-300"
                        value={withdrawAmount}
                        onChange={(e) => setWithdrawAmount(e.target.value)}
                      /> */}
                    </div>
                    <Button
                      className="w-full bg-[#059669] hover:bg-[#059669]/90"
                      onClick={handleWithdraw}
                      disabled={
                        !isConnected ||
                        transactionPending ||
                        parseFloat(formattedDepositedBalance) <= 0 ||
                        isLoading
                      }
                    >
                      <MinusCircle className="mr-2 h-4 w-4" />
                      {transactionPending ? "Processing..." : "Withdraw"}
                    </Button>
                  </TabsContent>

                  <TabsContent value="borrow" className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">
                          Collateral Value
                        </span>
                        <span className="text-sm font-medium text-black">
                          {formattedCollateralBalance} COLLATERAL-TOKEN
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">
                          Max Borrow Amount
                        </span>
                        <span className="text-sm font-medium text-[#059669]">
                          {Number((Number(poolData?.maxBorrowAmount))/10**18).toFixed(2) } COLT-TOKEN
                        </span>
                      </div>
                      <Input
                        type="number"
                        placeholder="Amount to borrow"
                        className="border-gray-300"
                        value={borrowAmount}
                        onChange={(e) => setBorrowAmount(e.target.value)}
                      />
                    </div>
                    <Button
                      className="w-full bg-[#059669] hover:bg-[#059669]/90"
                      onClick={handleBorrow}
                      disabled={
                        !isConnected ||
                        transactionPending ||
                        !borrowAmount ||
                        // parseFloat(formattedMaxBorrowAmount) <= 0 ||
                        isLoading
                      }
                    >
                      <ArrowDownUp className="mr-2 h-4 w-4" />
                      {transactionPending ? "Processing..." : "Borrow"}
                    </Button>
                  </TabsContent>

                  <TabsContent value="repay" className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">
                          Outstanding Debt
                        </span>
                        <span className="text-sm font-medium text-black">
                          {formattedBorrowedBalance} ROY-TOKEN
                        </span>
                      </div>
                      <Input
                        type="number"
                        placeholder="Amount to repay"
                        className="border-gray-300"
                        value={repayAmount}
                        onChange={(e) => setRepayAmount(e.target.value)}
                      />
                    </div>
                    <Button
                      className="w-full bg-[#059669] hover:bg-[#059669]/90"
                      onClick={handleRepay}
                      disabled={
                        !isConnected ||
                        transactionPending ||
                        !repayAmount ||
                        parseFloat(formattedBorrowedBalance) <= 0 ||
                        isLoading
                      }
                    >
                      <RefreshCw className="mr-2 h-4 w-4" />
                      {transactionPending ? "Processing..." : "Repay"}
                    </Button>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <Card className="border-gray-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-black">
                  Collateral Management
                </CardTitle>
                <CardDescription>Add or remove collateral</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">
                      Current Collateral
                    </span>
                    <span className="text-sm font-medium text-black">
                      {formattedCollateralBalance} (COLT-TOKEN)
                    </span>
                  </div>
                  <Input
                    type="number"
                    placeholder="Amount"
                    className="border-gray-300"
                    value={collateralAmount}
                    onChange={(e) => setCollateralAmount(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    className="flex-1 bg-[#059669] hover:bg-[#059669]/90"
                    onClick={handleAddCollateral}
                    disabled={
                      !isConnected ||
                      transactionPending ||
                      !collateralAmount ||
                      isLoading
                    }
                  >
                    <PlusCircle className="mr-2 h-4 w-4" />
                    {transactionPending ? "Processing..." : "Add"}
                  </Button>
                  <Button
                    className="flex-1 bg-white text-black border border-gray-300 hover:bg-gray-100"
                    onClick={handleRemoveCollateral}
                    disabled={
                      !isConnected ||
                      transactionPending ||
                      !collateralAmount ||
                      parseFloat(formattedCollateralBalance) <= 0 ||
                      isLoading
                    }
                  >
                    <MinusCircle className="mr-2 h-4 w-4" />
                    {transactionPending ? "Processing..." : "Remove"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="border-gray-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-black">Market Info</CardTitle>
                <CardDescription>Current rates and parameters</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex justify-center p-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-500"></div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-600">
                        Collateralization Ratio
                      </span>
                      <span className="font-medium text-black">
                        {poolData?.collateralizationRatio?.toString() || "150"}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">
                        Liquidation Threshold
                      </span>
                      <span className="font-medium text-black">
                        {poolData?.liquidationThreshold?.toString() || "125"}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Liquidation Bonus</span>
                      <span className="font-medium text-[#059669]">
                        {poolData?.liquidationBonus?.toString() || "5"}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Collateral Price</span>
                      <span className="font-medium text-black">
                        {formattedCollateralPrice} (COLLETERAL TOKEN)
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Current Block</span>
                      <span className="font-medium text-black">
                        {poolData?.currentBlock?.toString() || "0"}
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-4 px-4">
        <div className="max-w-7xl mx-auto text-center text-gray-500 text-sm">
          © {new Date().getFullYear()} LendingPool. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
