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

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useConnect } from "wagmi";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function ConnectDialog({ children }: { children: React.ReactNode }) {
  const { isPending } = useConnect();
  const [open, setOpen] = useState(false);
  const [isCreatingCircleWallet, setIsCreatingCircleWallet] = useState(false);
  const [circleWalletError, setCircleWalletError] = useState<string | null>(
    null
  );

  const handleCreateCircleWallet = async () => {
    setIsCreatingCircleWallet(true);
    setCircleWalletError(null);
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

      // Success
      setOpen(false);
      window.location.reload(); // Reload to reflect the new wallet in the dashboard
    } catch (error: any) {
      setCircleWalletError(error.message);
    } finally {
      setIsCreatingCircleWallet(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect a Wallet</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Button
            onClick={handleCreateCircleWallet}
            disabled={isPending || isCreatingCircleWallet}
            className="w-full flex items-center justify-center gap-2"
          >
            {isCreatingCircleWallet && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            Create Circle Wallet
          </Button>

          {circleWalletError && (
            <p className="text-sm text-red-500 text-center">
              {circleWalletError}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}