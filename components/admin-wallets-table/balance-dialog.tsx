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

import { useState, useEffect } from "react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2 } from "lucide-react";
import { getWalletBalance, TokenBalance } from "@/lib/actions/admin-wallets";

type Wallet = Database["public"]["Tables"]["admin_wallets"]["Row"];

interface BalanceDialogProps {
  wallet: Wallet | null;
  onClose: () => void;
}

export function BalanceDialog({ wallet, onClose }: BalanceDialogProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (wallet) {
      setIsLoading(true);
      setError(null);
      getWalletBalance(wallet.address, wallet.chain ?? "").then((result) => {
        if (result.error) {
          setError(result.error);
        } else {
          setBalances(result.balances ?? []);
        }
        setIsLoading(false);
      });
    }
  }, [wallet]);

  return (
    <Dialog open={!!wallet} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Wallet Balance</DialogTitle>
          <DialogDescription>
            Balances for wallet:{" "}
            <span className="font-semibold">{wallet?.label}</span>
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-24">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="text-center text-destructive">{error}</div>
          ) : balances.length === 0 ? (
            <div className="text-center text-muted-foreground">
              This wallet holds no balances.
            </div>
          ) : (
            <div className="rounded-md border max-h-64 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Asset</TableHead>
                    <TableHead>Blockchain</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {balances.map((balance) => {
                    // The API returns the amount as a string in its major unit (e.g., "29.99").
                    // We just need to parse it as a number. No division is needed.
                    const formattedAmount = Number(balance.amount);
                    return (
                      <TableRow key={balance.token.symbol}>
                        <TableCell className="font-medium">
                          {balance.token.name} ({balance.token.symbol})
                        </TableCell>
                        <TableCell>{balance.token.blockchain}</TableCell>
                        <TableCell className="text-right">
                          {formattedAmount.toLocaleString(undefined, {
                            maximumFractionDigits: 6,
                          })}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}