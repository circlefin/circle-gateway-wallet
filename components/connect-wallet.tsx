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

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useAccount, useDisconnect, useConnections } from "wagmi";
import { ConnectDialog } from "@/components/connect-wallet-dialog";
import { createClient } from "@/lib/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2 } from "lucide-react";

type CircleWallet = {
  wallet_address: string;
};

export function ConnectWallet({ onAccountsChange }: { onAccountsChange?: (accounts: string[]) => void }) {
  const { isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const connections = useConnections();
  const [circleWallets, setCircleWallets] = useState<CircleWallet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingCircleWallet, setIsCreatingCircleWallet] = useState(false);

  const handleCreateCircleWallet = async () => {
    setIsCreatingCircleWallet(true);
    const supabase = createClient();

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user || !user.email) {
        throw new Error("User not authenticated. Please sign in.");
      }

      // 1. Create Wallet Set
      const walletSetResponse = await fetch("/api/wallet-set", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityName: user.email }),
      });
      if (!walletSetResponse.ok) {
        const { error } = await walletSetResponse.json();
        throw new Error(error || "Failed to create wallet set.");
      }
      const createdWalletSet = await walletSetResponse.json();

      // 2. Create Wallet
      const walletResponse = await fetch("/api/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletSetId: createdWalletSet.id }),
      });
      if (!walletResponse.ok) {
        const { error } = await walletResponse.json();
        throw new Error(error || "Failed to create wallet.");
      }
      const createdWallet = await walletResponse.json();

      // 3. Insert wallet into Supabase, linking it directly to the auth user
      const { error: insertError } = await supabase.from("wallets").insert({
        user_id: user.id, // Use the user_id from auth.users
        circle_wallet_id: createdWallet.id,
        wallet_set_id: createdWalletSet.id,
        wallet_address: createdWallet.address,
      });

      if (insertError) {
        console.error("Supabase insert error:", insertError);
        throw new Error("Failed to save wallet to your profile.");
      }

      window.location.reload();
    } finally {
      setIsCreatingCircleWallet(false);
    }
  };

  useEffect(() => {
    const fetchCircleWallet = async () => {
      setIsLoading(true);
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data, error } = await supabase
          .from("wallets")
          .select("wallet_address")
          .eq("user_id", user.id);
        if (data && !error) {
          setCircleWallets(data);
        }
      }
      setIsLoading(false);
    };
    fetchCircleWallet();
  }, []);

  useEffect(() => {
    const wagmiAddresses = connections.map(conn => conn.accounts).flat();
    const circleAddresses = circleWallets.map(w => w.wallet_address);
    const allAddresses = [...wagmiAddresses, ...circleAddresses];
    const uniqueAddresses = Array.from(new Set(allAddresses));
    onAccountsChange?.(uniqueAddresses);
  }, [connections, circleWallets, onAccountsChange]);

  const hasWagmiWallet = isConnected && connections.length > 0;
  const hasCircleWallet = circleWallets.length > 0;
  const hasAnyWallet = hasWagmiWallet || hasCircleWallet;

  if (isLoading) {
    return <Skeleton className="h-10 w-full" />;
  }

  if (!hasAnyWallet) {
    return (
      <Button
        className="w-full"
        onClick={handleCreateCircleWallet}
        disabled={isCreatingCircleWallet}
      >
        {isCreatingCircleWallet && (
          <Loader2 className="h-4 w-4 animate-spin" />
        )}
        Create Circle Wallet
      </Button>
    )
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-sm">Connected Wallets:</span>
          <ConnectDialog>
            <Button variant="outline" size="sm">
              Connect Another Wallet
            </Button>
          </ConnectDialog>
        </div>
        <ul className="space-y-1">
          {/* Render Circle Wallets */}
          {circleWallets.map((wallet) => (
            <li key={wallet.wallet_address} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 px-3 py-2 rounded">
              <span className="font-mono text-xs truncate flex-1 text-gray-900 dark:text-gray-100">{wallet.wallet_address}</span>
            </li>
          ))}
        </ul>
      </div>
      {/* Only show Disconnect button if a wagmi wallet is connected */}
      {hasWagmiWallet && (
        <Button variant="outline" onClick={() => disconnect()} className="w-full">
          Disconnect All
        </Button>
      )}
    </div>
  );
}