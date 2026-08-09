/**
 * Copyright 2025 Circle Internet Group, Inc.  All rights reserved.
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

import { useState, useMemo, useEffect } from "react";
import { useAccount, useChainId, useWriteContract } from "wagmi";
import { BaseError, erc20Abi } from "viem";
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
import { Label } from "@/components/ui/label";
import { useUsdcBalance } from "@/lib/wagmi/useUsdcBalance";
import { toast } from "sonner";
import Image from "next/image";
import Link from "next/link";
import { TransactionConfirmationModal } from "@/components/wallet/transaction-confirmation-modal";

const USDC_PER_CREDIT = 1;
const presetUsdcAmounts = [10, 25, 50, 100];

export function PurchaseCreditsCard() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const {
    usdcAddress,
    balance,
    hasBalance,
    isLoading: isBalanceLoading,
  } = useUsdcBalance();
  const { writeContractAsync } = useWriteContract();
  const [creditsToPurchase, setCreditsToPurchase] = useState(10);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentTransaction, setCurrentTransaction] = useState<{
    id: string;
    credits: number;
    usdcAmount: number;
    txHash: string;
    chainId: number;
    status: "pending" | "confirmed" | "failed";
    createdAt: string;
    fee?: number;
  } | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  // State to hold the fetched destination address and its loading status
  const [destination, setDestination] = useState<`0x${string}` | undefined>();
  const [isLoadingDestination, setIsLoadingDestination] = useState(true);

  // Effect to fetch the destination address from our new API endpoint
  useEffect(() => {
    async function fetchDestinationWallet() {
      try {
        setIsLoadingDestination(true);
        const response = await fetch('/api/destination-wallet');
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Failed to fetch destination wallet");
        }
        if (data.address) {
          setDestination(data.address);
        } else {
          throw new Error("API did not return a valid address.");
        }
      } catch (error) {
        console.error(error);
        toast.error("Configuration Error", {
          description: error instanceof Error ? error.message : "Could not load the destination address.",
        });
      } finally {
        setIsLoadingDestination(false);
      }
    }

    fetchDestinationWallet();
  }, []);

  const requiredUsdc = creditsToPurchase * USDC_PER_CREDIT;
  const requiredUsdcMicro = useMemo(() => {
    // Convert to 6‑decimal integer (avoid FP drift)
    const micro = Math.round(requiredUsdc * 1_000_000);
    return BigInt(micro);
  }, [requiredUsdc]);

  const hasSufficientBalance =
    hasBalance && balance !== null
      ? balance >= requiredUsdcMicro
      : false;

  const buttonDisabled =
    !isConnected ||
    !hasSufficientBalance ||
    creditsToPurchase <= 0 ||
    !destination ||
    !usdcAddress ||
    isSubmitting ||
    isBalanceLoading;

  async function handlePurchase() {
    if (!isConnected || !address) {
      toast.error("Not connected", {
        description: "Connect your wallet first.",
      });
      return;
    }
    if (!destination) {
      toast.error("Configuration error", {
        description: "Destination address missing.",
      });
      return;
    }
    if (!usdcAddress) {
      toast.error("Unsupported network", {
        description: "USDC not supported on current chain.",
      });
      return;
    }
    if (!hasSufficientBalance) {
      toast.error("Insufficient balance", {
        description: "Your USDC balance is too low for this purchase.",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      // Prompt wallet (MetaMask/etc) for ERC20 transfer
      const txHash = await writeContractAsync({
        address: usdcAddress,
        abi: erc20Abi,
        functionName: "transfer",
        args: [destination, requiredUsdcMicro],
      });

      toast.success("Transaction submitted", {
        description: `Hash: ${txHash.slice(0, 10)}...`,
      });

      // Persist (fire-and-forget with basic handling)
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credits: creditsToPurchase,
          usdcAmount:
            Number((requiredUsdcMicro / 1_000_000n).toString()) +
            Number(requiredUsdcMicro % 1_000_000n) / 1_000_000,
          txHash,
          chainId,
          walletAddress: address,
          destinationAddress: destination, // Include admin wallet destination
        }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error("Recording failed", {
          description: j.error || "Could not record transaction.",
        });
      } else {
        const responseData = await res.json();

        // Create transaction object for confirmation modal
        const transaction = {
          id: responseData.transactionId || txHash, // Fallback to txHash if no ID returned
          credits: creditsToPurchase,
          usdcAmount: Number((requiredUsdcMicro / 1_000_000n).toString()) +
            Number(requiredUsdcMicro % 1_000_000n) / 1_000_000,
          txHash,
          chainId,
          status: "pending" as const,
          createdAt: new Date().toISOString(),
          fee: 0, // Network fees are handled separately
        };

        setCurrentTransaction(transaction);
        setShowConfirmation(true);

        toast.success("Transaction recorded", {
          description: "Monitoring for confirmation...",
        });
      }
    } catch (err) {
      const message =
        err instanceof BaseError
          ? err.shortMessage
          : "Transaction failed unexpectedly.";
      toast.error("Transaction error", {
        description: message,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleRetry = () => {
    setShowConfirmation(false);
    setCurrentTransaction(null);
    // The user can click the purchase button again to retry
  };

  const handleCloseConfirmation = () => {
    setShowConfirmation(false);
    setCurrentTransaction(null);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Purchase Credits</CardTitle>
          <CardDescription>
            Top up your account balance using USDC.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pb-4">
          <div className="space-y-2">
            <Label htmlFor="credits-amount">Amount of Credits</Label>
            <Input
              id="credits-amount"
              type="number"
              value={creditsToPurchase}
              onChange={(e) =>
                setCreditsToPurchase(Math.max(0, Number(e.target.value)))
              }
              min="1"
              disabled={!isConnected || isSubmitting}
            />
          </div>

          <div className="grid grid-cols-4 gap-2">
            {presetUsdcAmounts.map((amount) => {
              // The logic here updates automatically with the new conversion rate.
              // e.g., $10 button now sets credits to 10.
              const credits = amount / USDC_PER_CREDIT;
              const isActive = creditsToPurchase === credits;
              return (
                <Button
                  key={amount}
                  variant={isActive ? "secondary" : "outline"}
                  onClick={() => setCreditsToPurchase(credits)}
                  disabled={!isConnected || isSubmitting}
                >
                  ${amount}
                </Button>
              );
            })}
          </div>

          <div className="text-xs space-y-1">
            <div className="text-center text-muted-foreground p-2 rounded-md bg-muted/50">
              You will pay{" "}
              <span className="font-bold text-foreground">
                {requiredUsdc.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                USDC
              </span>
            </div>
            {!isLoadingDestination && !destination && (
              <div className="text-red-500 text-center pt-2">
                Destination address not configured.
              </div>
            )}
            {!hasSufficientBalance && isConnected && !isBalanceLoading && (
              <div className="text-amber-600 text-center pt-2">
                Insufficient USDC balance.
              </div>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex flex-col items-center gap-3">
          <Button
            className="w-full gap-1"
            onClick={handlePurchase}
            disabled={buttonDisabled}
          >
            <Image
              src="/usdc-logo.svg"
              alt="USDC Logo"
              width={20}
              height={20}
            />
            {isSubmitting ? "Submitting..." : "Pay with USDC"}
          </Button>
          <div className="flex items-center gap-2">
            <p className="text-xs text-muted-foreground">
              Powered by{" "}
              <Link
                className="underline font-bold"
                href="https://www.circle.com"
                target="_blank"
              >
                Circle
              </Link>
            </p>
          </div>
        </CardFooter>
      </Card>

      <TransactionConfirmationModal
        isOpen={showConfirmation}
        onClose={handleCloseConfirmation}
        transaction={currentTransaction}
        onRetry={handleRetry}
      />
    </>
  );
}