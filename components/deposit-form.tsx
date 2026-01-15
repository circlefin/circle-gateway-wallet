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
import { SupportedChain, SUPPORTED_CHAINS } from "@/lib/chain-config";

interface DepositFormProps {
  onSuccess: () => void;
}

export function DepositForm({ onSuccess }: DepositFormProps) {
  const [depositChain, setDepositChain] = useState<SupportedChain>("arcTestnet");
  const [depositAmount, setDepositAmount] = useState("");
  const [depositLoading, setDepositLoading] = useState(false);
  const [depositSuccess, setDepositSuccess] = useState<string | null>(null);
  const [depositError, setDepositError] = useState<string | null>(null);

  const handleDeposit = async () => {
    if (!depositAmount) {
      setDepositError("Please provide private key and amount");
      return;
    }
    setDepositLoading(true);
    setDepositSuccess(null);
    setDepositError(null);
    try {
      const response = await fetch("/api/gateway/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chain: depositChain,
          amount: depositAmount,
        }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Deposit failed");
      }
      const data = await response.json();
      setDepositSuccess(`Deposit successful! Tx: ${data.txHash}`);
      setDepositAmount("");
      setTimeout(() => {
        onSuccess();
        window.location.reload();
      }, 2000);
    } catch (err: any) {
      setDepositError(err.message);
    } finally {
      setDepositLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="deposit-chain">Chain</Label>
        <Select
          value={depositChain}
          onValueChange={(value) => setDepositChain(value as SupportedChain)}
          disabled={depositLoading}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select a chain" />
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
        <Label htmlFor="deposit-amount">Amount (USDC)</Label>
        <Input
          id="deposit-amount"
          type="number"
          step="0.01"
          min="0.01"
          max="1000000000"
          placeholder="10.00"
          className="w-full"
          value={depositAmount}
          onChange={(e) => setDepositAmount(e.target.value)}
          disabled={depositLoading}
        />
        {depositAmount && parseFloat(depositAmount) <= 0 && (
          <p className="text-xs text-red-500">Amount must be greater than 0</p>
        )}
      </div>
      <Button
        onClick={handleDeposit}
        disabled={
          depositLoading ||
          !depositAmount ||
          parseFloat(depositAmount) <= 0
        }
        className="w-full"
      >
        {depositLoading ? "Processing..." : "Deposit"}
      </Button>
      {depositSuccess && (
        <p className="text-sm text-green-500">{depositSuccess}</p>
      )}
      {depositError && <p className="text-sm text-red-500">{depositError}</p>}
    </div>
  );
}
