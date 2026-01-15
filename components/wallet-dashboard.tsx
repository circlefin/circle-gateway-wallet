/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

"use client";

import { Button } from "@/components/ui/button";
import { useAccount, useConnections } from "wagmi";
import { ConnectWallet } from "@/components/connect-wallet";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { useEffect, useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { ChainBalance } from "@/lib/chain-config";
import { AlertCircleIcon } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator"
import { TransactionHistory } from "@/components/transaction-history";
import { toast } from "sonner";

type SupportedChain = "arcTestnet" | "baseSepolia" | "avalancheFuji";

export function WalletDashboard() {
  const [isMounted, setIsMounted] = useState(false);

  const [hasCircleWallet, setHasCircleWallet] = useState(false);
  const [circleWalletAddresses, setCircleWalletAddresses] = useState<string[]>([]);
  const [isCheckingCircleWallet, setIsCheckingCircleWallet] = useState(true);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    const checkCircleWallet = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data, error } = await supabase
          .from("wallets")
          .select("wallet_address")
          .eq("user_id", user.id);

        if (data && data.length > 0 && !error) {
          setHasCircleWallet(true);
          setCircleWalletAddresses(data.map(w => w.wallet_address));
        }
      }
      setIsCheckingCircleWallet(false);
    };
    checkCircleWallet();
  }, []);

  const { isConnected, isConnecting } = useAccount();
  const connections = useConnections();

  // Create a unified list of all wallet addresses (from wagmi and Circle)
  const allWalletAddresses = useMemo(() => {
    const wagmiAddresses = connections.map((conn) => conn.accounts).flat();
    return Array.from(new Set([...wagmiAddresses, ...circleWalletAddresses]));
  }, [connections, circleWalletAddresses]);

  // Helper function to format address suffix
  const formatAddressSuffix = (address: string) => {
    if (!address || address.length < 10) return "";
    return `(${address.slice(0, 5)}...${address.slice(-4)})`;
  };
  const [totalBalance, setTotalBalance] = useState<number | null>(null);
  const [gatewayBalance, setGatewayBalance] = useState<number>(0);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [chainBalances, setChainBalances] = useState<ChainBalance[]>([]);
  const [balanceLoading, setBalanceLoading] = useState(true);

  // Deposit state
  const [depositAmount, setDepositAmount] = useState("");
  const [depositLoading, setDepositLoading] = useState(false);

  // Transfer state
  const [sourceChain] = useState<SupportedChain>("arcTestnet");
  const [destinationChain, setDestinationChain] = useState<SupportedChain>("baseSepolia");
  const [transferAmount, setTransferAmount] = useState("");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [transferLoading, setTransferLoading] = useState(false);

  // Refetchable balance function
  const fetchBalances = async (showLoadingState = true) => {
    // Wait until the initial wallet check is complete
    if (isCheckingCircleWallet) return;

    if (allWalletAddresses.length === 0) {
      setBalanceLoading(false);
      setTotalBalance(null);
      setGatewayBalance(0);
      setWalletBalance(0);
      setChainBalances([]);
      return;
    }

    if (showLoadingState) {
      setBalanceLoading(true);
    }

    try {
      const response = await fetch("/api/gateway/balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addresses: allWalletAddresses }),
      });

      if (!response.ok) {
        throw new Error(`Error: ${response.statusText}`);
      }

      const data = await response.json();

      let totalGateway = 0;
      let totalWallet = 0;
      const allGatewayBalances: ChainBalance[] = [];
      const allChainBalances: ChainBalance[] = [];

      data.balances.forEach((b: any) => {
        totalGateway += b.gatewayTotal || 0;
        totalWallet += b.walletTotal || 0;

        if (b.gatewayBalances) {
          allGatewayBalances.push(...b.gatewayBalances);
        }
        if (b.chainBalances) {
          allChainBalances.push(...b.chainBalances);
        }
      });

      setTotalBalance(data.totalUnified);
      setGatewayBalance(totalGateway);
      setWalletBalance(totalWallet);
      setChainBalances(allChainBalances);
    } catch (err: any) {
      toast.error("Balance Update Failed", {
        description: `Failed to fetch balances: ${err.message}`,
      });
    } finally {
      if (showLoadingState) {
        setBalanceLoading(false);
      }
    }
  };

  // Fetch balances whenever the unified list of addresses changes
  useEffect(() => {
    fetchBalances();
  }, [allWalletAddresses, isCheckingCircleWallet]);

  const handleDeposit = async () => {
    if (!depositAmount) {
      toast.error("Invalid Amount", {
        description: "Please provide an amount to deposit.",
      });
      return;
    }
    if (!hasCircleWallet) {
      toast.error("Missing Credentials", {
        description: "Please provide a private key for your connected wallet.",
      });
      return;
    }

    setDepositLoading(true);
    try {
      const payload: any = {
        chain: "arcTestnet",
        amount: depositAmount,
      };

      const response = await fetch("/api/gateway/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Deposit failed");
      }
      const data = await response.json();

      toast.success("Deposit Successful", {
        description: `Transaction Hash: ${data.txHash}`,
      });

      setDepositAmount("");
      
      // Instantly refresh balance
      await fetchBalances(false);
    } catch (err: any) {
      toast.error("Deposit Failed", {
        description: err.message || "An error occurred during deposit",
      });
    } finally {
      setDepositLoading(false);
    }
  };

  const handleTransfer = async () => {
    if (!transferAmount) {
      toast.error("Invalid Amount", {
        description: "Please provide an amount to transfer.",
      });
      return;
    }
    if (!hasCircleWallet) {
      toast.error("Missing Credentials", {
        description: "Please provide a private key for your connected wallet.",
      });
      return;
    }
    if (sourceChain === destinationChain) {
      toast.error("Invalid Chain Selection", {
        description: "Source and destination chains must be different.",
      });
      return;
    }

    setTransferLoading(true);
    try {
      const payload: any = {
        sourceChain,
        destinationChain,
        amount: transferAmount,
        recipientAddress: recipientAddress || undefined,
      };

      const response = await fetch("/api/gateway/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const error = await response.json();
        const errorMessage = error.error || "Transfer failed";

        if (errorMessage.includes("insufficient funds for transfer") ||
          errorMessage.includes("exceeds the balance of the account")) {
          const chainNames: Record<SupportedChain, string> = {
            arcTestnet: "Arc Testnet",
            avalancheFuji: "Avalanche Fuji",
            baseSepolia: "Base Sepolia",
          };
          const nativeTokens: Record<SupportedChain, string> = {
            arcTestnet: "ARC",
            avalancheFuji: "AVAX",
            baseSepolia: "ETH",
          };
          const chainName = chainNames[destinationChain];
          const nativeToken = nativeTokens[destinationChain];
          throw new Error(
            `Insufficient gas funds: You need ${nativeToken} on ${chainName} to pay for the minting transaction.`
          );
        } else if (errorMessage.includes("Insufficient balance") || errorMessage.includes("insufficient balance")) {
          throw new Error("Insufficient Gateway balance: You don't have enough USDC in your Gateway balance for this transfer.");
        } else if (errorMessage.includes("Invalid address") || errorMessage.includes("invalid recipient")) {
          throw new Error("Invalid address: Please check the recipient address and try again.");
        } else if (errorMessage.includes("Gateway API error")) {
          const apiErrorMatch = errorMessage.match(/Gateway API error: \d+ - (.+)/);
          if (apiErrorMatch) {
            throw new Error(`Transfer failed: ${apiErrorMatch[1]}`);
          }
          throw new Error(errorMessage);
        } else {
          throw new Error(errorMessage);
        }
      }
      const data = await response.json();

      toast.success("Transfer Successful", {
        description: `Mint Transaction Hash: ${data.mintTxHash}`,
      });

      setTransferAmount("");
      setRecipientAddress("");
      
      // Instantly refresh balance
      await fetchBalances(false);
    } catch (err: any) {
      toast.error("Transfer Failed", {
        description: err?.message || "An unexpected error occurred. Please try again.",
      });
    } finally {
      setTransferLoading(false);
    }
  };

  // This prevents the server (disconnected) and client (connected) mismatch
  const userHasWallet = (isMounted && isConnected) || hasCircleWallet;

  return (
    <>
      {/* Disconnected State View */}
      <div className={userHasWallet ? 'hidden' : 'block'}>
        <Card>
          <CardHeader>
            <CardTitle>Wallet Setup</CardTitle>
            <CardDescription>
              Connect your wallet to begin.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ConnectWallet />
          </CardContent>
        </Card>
      </div>

      {/* Connected State View */}
      <div className={userHasWallet ? 'block' : 'hidden'}>
        <div className="space-y-6">
          {/* Top Row: Wallet and Balances */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Wallet Setup</CardTitle>
                <CardDescription>
                  Manage your connected wallets.
                  {!hasCircleWallet && " Provide a private key to sign transactions."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ConnectWallet />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>USDC Balance Overview</CardTitle>
                <CardDescription>
                  Your combined balance across all wallets and chains.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {balanceLoading || isConnecting ? (
                  <div className="space-y-4">
                    <Skeleton className="h-8 w-[200px]" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-24 w-full" />
                  </div>
                ) : totalBalance !== null ? (
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Arc Gateway Balance
                      </p>
                      <p className="text-2xl font-bold">
                        {gatewayBalance.toFixed(2)} USDC
                      </p>
                    </div>
                    <Separator className="my-4" />
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Wallet Balance
                      </p>
                      <p className="text-2xl font-bold">
                        {walletBalance.toFixed(2)} USDC
                      </p>
                    </div>
                    {chainBalances.filter(cb => cb.balance > 0).length > 0 ? (
                      <ul className="text-xs space-y-1 mt-[-8px] text-muted-foreground">
                        {chainBalances.filter(cb => cb.balance > 0).map((cb, idx) => (
                          <li
                            key={`wallet-${idx}-${cb.chain}-${cb.balance}`}
                            className="flex justify-between"
                          >
                            <span className="capitalize">
                              {cb.chain} <span className="text-[10px]">{formatAddressSuffix(cb.address)}</span>
                            </span>
                            <span className="font-mono">
                              {cb.balance.toFixed(2)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">
                        No wallet balance on any chain
                      </p>
                    )}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>

          {/* Actions Card with Tabs */}
          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
              <CardDescription>
                Manage your unified balance by depositing or transferring funds.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="deposit">
                <TabsList className="w-full">
                  <TabsTrigger value="deposit">Deposit</TabsTrigger>
                  <TabsTrigger value="transfer">Transfer</TabsTrigger>
                </TabsList>

                <TabsContent value="deposit" className="pt-6">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="deposit-amount">Amount (USDC)</Label>
                      <Input
                        id="deposit-amount"
                        type="number"
                        step="0.01"
                        placeholder="10.00"
                        className="w-full"
                        value={depositAmount}
                        onChange={(e) => setDepositAmount(e.target.value)}
                        disabled={depositLoading}
                      />
                    </div>
                    <Button
                      onClick={handleDeposit}
                      disabled={depositLoading || !hasCircleWallet || !depositAmount}
                      className="w-full"
                    >
                      {depositLoading ? "Processing..." : "Deposit"}
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="transfer" className="pt-6">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="destination-chain">To</Label>
                      <Select
                        value={destinationChain}
                        onValueChange={(value) =>
                          setDestinationChain(value as SupportedChain)
                        }
                        disabled={transferLoading}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select destination chain" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="arcTestnet">Arc Testnet</SelectItem>
                          <SelectItem value="baseSepolia">Base Sepolia</SelectItem>
                          <SelectItem value="avalancheFuji">Avalanche Fuji</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Alert>
                      <AlertCircleIcon className="h-4 w-4" />
                      <AlertTitle>Gas Fees Required</AlertTitle>
                      <AlertDescription>
                        You need native tokens on the destination chain to pay for gas fees when minting.
                      </AlertDescription>
                    </Alert>
                    <div className="space-y-2">
                      <Label htmlFor="transfer-amount-gateway">Amount (USDC)</Label>
                      <Input
                        id="transfer-amount-gateway"
                        type="number"
                        step="0.01"
                        placeholder="5.00"
                        className="w-full"
                        value={transferAmount}
                        onChange={(e) => setTransferAmount(e.target.value)}
                        disabled={transferLoading}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="recipient-address">
                        Recipient Address (optional)
                      </Label>
                      <Input
                        id="recipient-address"
                        type="text"
                        placeholder="Defaults to your connected wallet"
                        className="w-full"
                        value={recipientAddress}
                        onChange={(e) => setRecipientAddress(e.target.value)}
                        disabled={transferLoading}
                      />
                    </div>
                    <Button
                      onClick={handleTransfer}
                      disabled={transferLoading || !hasCircleWallet || !transferAmount}
                      className="w-full"
                    >
                      {transferLoading ? "Processing..." : "Transfer"}
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* --- Transaction History Table --- */}
          <TransactionHistory />
        </div>
      </div>
    </>
  );
}
