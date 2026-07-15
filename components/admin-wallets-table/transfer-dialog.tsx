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

import { useState, useEffect, useMemo } from "react";
import { Database } from "@/types/supabase";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { transferFromAdminWallet, transferFromAdminWalletCCTP } from "@/lib/actions/admin-wallets";
import { Loader2, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

// The Wallet type now correctly reflects that `chain` can be `string | null`,
// matching the database schema.
type Wallet = Database["public"]["Tables"]["admin_wallets"]["Row"];

interface TransferDialogProps {
  sourceWallet: Wallet | null;
  otherWallets: Wallet[];
  onClose: () => void;
}

export function TransferDialog({
  sourceWallet,
  otherWallets,
  onClose,
}: TransferDialogProps) {
  const [amount, setAmount] = useState("");
  const [destinationType, setDestinationType] = useState<
    "existing" | "custom"
  >("existing");
  const [selectedAddress, setSelectedAddress] = useState("");
  const [customAddress, setCustomAddress] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCrossChain, setIsCrossChain] = useState(false);

  useEffect(() => {
    if (!sourceWallet) {
      setAmount("");
      setDestinationType("existing");
      setSelectedAddress("");
      setCustomAddress("");
      setIsCrossChain(false);
    }
  }, [sourceWallet]);

  useEffect(() => {
    if (destinationType === "existing" && selectedAddress && sourceWallet) {
      const destinationWallet = otherWallets.find(
        (wallet) => wallet.address === selectedAddress
      );
      // A cross-chain transfer is only possible if both wallets have a chain.
      if (destinationWallet && sourceWallet.chain && destinationWallet.chain) {
        setIsCrossChain(sourceWallet.chain !== destinationWallet.chain);
      } else {
        setIsCrossChain(false);
      }
    } else {
      setIsCrossChain(false);
    }
  }, [selectedAddress, sourceWallet, otherWallets, destinationType]);

  const isFormValid = useMemo(() => {
    const isAmountValid = Number(amount) > 0;
    const isDestinationValid =
      (destinationType === "existing" && selectedAddress !== "") ||
      (destinationType === "custom" && customAddress.trim() !== "");
    return isAmountValid && isDestinationValid;
  }, [amount, destinationType, selectedAddress, customAddress]);

  const handleTransfer = async () => {
    if (!isFormValid) {
      toast.error("Missing or invalid information", {
        description:
          "Please fill out all fields with valid values to proceed.",
      });
      return;
    }

    const destination =
      destinationType === "existing" ? selectedAddress : customAddress;

    setIsSubmitting(true);

    try {
      if (isCrossChain) {
        console.log("Initiating CCTP Cross-Chain Transfer...");
        toast.info("Cross-chain transfer detected", {
          description: "This will be handled by Circle's CCTP.",
        });
      }

      const transferArguments: [string, string, string] = [
        sourceWallet!.circle_wallet_id,
        destination,
        amount
      ];

      const result = isCrossChain
        ? await transferFromAdminWalletCCTP(...transferArguments)
        : await transferFromAdminWallet(...transferArguments);

      if (result.error) {
        toast.error("Transfer Failed", { description: result.error });
      } else {
        toast.success("Transfer Submitted Successfully", {
          description: `Tx: ${result.txHash?.slice(0, 15)}...`,
        });
        onClose();
      }
    } catch {
      toast.error("An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={!!sourceWallet} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Transfer Amount</DialogTitle>
          <DialogDescription>
            Transfer funds from{" "}
            <span className="font-semibold">{sourceWallet?.label}</span>
            {sourceWallet?.chain && ` (${sourceWallet.chain})`}.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {isCrossChain && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Cross-Chain Transfer</AlertTitle>
              <AlertDescription>
                You are sending USDC to a wallet on a different blockchain. This
                will use Circle&apos;s CCTP.
              </AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="amount">Amount (USDC)</Label>
            <Input
              id="amount"
              type="number"
              placeholder="e.g., 100.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={isSubmitting}
            />
          </div>
          <RadioGroup
            value={destinationType}
            onValueChange={(value: "existing" | "custom") =>
              setDestinationType(value)
            }
            className="space-y-2"
            disabled={isSubmitting}
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="existing" id="r1" />
              <Label htmlFor="r1">To Existing Admin Wallet</Label>
            </div>
            {/* <div className="flex items-center space-x-2">
              <RadioGroupItem value="custom" id="r2" />
              <Label htmlFor="r2">To Custom Address</Label>
            </div> */}
          </RadioGroup>
          {destinationType === "existing" ? (
            <Select
              onValueChange={setSelectedAddress}
              value={selectedAddress}
              disabled={isSubmitting}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a destination wallet" />
              </SelectTrigger>
              <SelectContent>
                {otherWallets.map((wallet) => (
                  <SelectItem key={wallet.id} value={wallet.address}>
                    {wallet.label}{" "}
                    {wallet.chain ? `(${wallet.chain})` : "(No chain)"} - (
                    {wallet.address.slice(0, 6)}...
                    {wallet.address.slice(-4)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              placeholder="Enter external wallet address"
              value={customAddress}
              onChange={(e) => setCustomAddress(e.target.value)}
              disabled={isSubmitting}
            />
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            onClick={onClose}
            variant="outline"
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleTransfer}
            disabled={!isFormValid || isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              "Submit Transfer"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}