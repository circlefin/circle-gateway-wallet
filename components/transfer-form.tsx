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
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircleIcon } from "lucide-react";
import { SupportedChain, SUPPORTED_CHAINS, CHAIN_NAMES, NATIVE_TOKENS } from "@/lib/chain-config";

interface TransferFormProps {
  onSuccess: () => void;
}

export function TransferForm({ onSuccess }: TransferFormProps) {
  const [sourceChain, setSourceChain] = useState<SupportedChain>("arcTestnet");
  const [destinationChain, setDestinationChain] = useState<SupportedChain>("baseSepolia");
  const [transferAmount, setTransferAmount] = useState("");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferSuccess, setTransferSuccess] = useState<string | null>(null);
  const [transferError, setTransferError] = useState<string | null>(null);

  const handleTransfer = async () => {
    if (!transferAmount) {
      setTransferError("Please provide private key and amount");
      return;
    }

    if (sourceChain === destinationChain) {
      setTransferError("Source and destination chains must be different");
      return;
    }

    setTransferLoading(true);
    setTransferSuccess(null);
    setTransferError(null);
    try {
      const response = await fetch("/api/gateway/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceChain,
          destinationChain,
          amount: transferAmount,
          recipientAddress: recipientAddress || undefined,
        }),
      });
      if (!response.ok) {
        const error = await response.json();
        const errorMessage = error.error || "Transfer failed";

        // Parse and format common error messages for better UX
        if (
          errorMessage.includes("insufficient funds for transfer") ||
          errorMessage.includes("exceeds the balance of the account")
        ) {
          // This is a gas fee issue on destination chain
          const chainName = CHAIN_NAMES[destinationChain];
          const nativeToken = NATIVE_TOKENS[destinationChain];
          throw new Error(
            `Insufficient gas funds: You need ${nativeToken} on ${chainName} to pay for the minting transaction. ` +
            `Please add some ${nativeToken} to your wallet on ${chainName} and try again.`
          );
        } else if (
          errorMessage.includes("Insufficient balance") ||
          errorMessage.includes("insufficient balance")
        ) {
          throw new Error(
            "Insufficient Gateway balance: You don't have enough USDC in your Gateway balance for this transfer."
          );
        } else if (
          errorMessage.includes("Invalid address") ||
          errorMessage.includes("invalid recipient")
        ) {
          throw new Error(
            "Invalid address: Please check the recipient address and try again."
          );
        } else if (errorMessage.includes("Gateway API error")) {
          // Extract the actual API error message
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
      setTransferSuccess(`Transfer successful! Mint Tx: ${data.mintTxHash}`);
      setTransferAmount("");
      setTimeout(() => {
        onSuccess();
        window.location.reload();
      }, 2000);
    } catch (err: any) {
      // Ensure error message is always a string and doesn't break the UI
      const errorMessage =
        err?.message || "An unexpected error occurred. Please try again.";
      setTransferError(errorMessage);
    } finally {
      setTransferLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="source-chain">From</Label>
          <Select
            value={sourceChain}
            onValueChange={(value) => setSourceChain(value as SupportedChain)}
            disabled={transferLoading}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select source chain" />
            </SelectTrigger>
            <SelectContent>
              {SUPPORTED_CHAINS.map((chain) => (
                <SelectItem key={chain.value} value={chain.value}>
                  {chain.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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
              {SUPPORTED_CHAINS.map((chain) => (
                <SelectItem key={chain.value} value={chain.value}>
                  {chain.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Alert>
        <AlertCircleIcon className="h-4 w-4" />
        <AlertTitle>Gas Fees Required</AlertTitle>
        <AlertDescription>
          You need native tokens on the destination chain to pay for gas fees
          when minting.
        </AlertDescription>
      </Alert>
      <div className="space-y-2">
        <Label htmlFor="transfer-amount-gateway">Amount (USDC)</Label>
        <Input
          id="transfer-amount-gateway"
          type="number"
          step="1"
          min="0.01"
          max="1000000000"
          placeholder="5.00"
          className="w-full"
          value={transferAmount}
          onChange={(e) => setTransferAmount(e.target.value)}
          disabled={transferLoading}
        />
        {transferAmount && parseFloat(transferAmount) <= 0 && (
          <p className="text-xs text-red-500">Amount must be greater than 0</p>
        )}
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
        disabled={
          transferLoading ||
          !transferAmount ||
          parseFloat(transferAmount) <= 0
        }
        className="w-full"
      >
        {transferLoading ? "Processing..." : "Transfer"}
      </Button>
      {transferSuccess && (
        <p className="text-sm text-green-500">{transferSuccess}</p>
      )}
      {transferError && <p className="text-sm text-red-500">{transferError}</p>}
    </div>
  );
}
