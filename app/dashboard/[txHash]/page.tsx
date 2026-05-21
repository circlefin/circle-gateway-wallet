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

import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { CopyTxHashButton } from "@/components/CopyTxHashButton";
import { format } from "date-fns";
import { getNetworkName, getExplorerUrl } from "@/lib/utils/chain-utils";

// This is a helper component for displaying rows in the receipt
const DetailRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-1 sm:gap-4">
    <span className="text-sm text-muted-foreground">{label}</span>
    <span className="font-medium text-right break-all">{value}</span>
  </div>
);

// This is the corrected async server component signature
export default async function TransactionDetailsPage(
  props: {
    params: Promise<{ txHash: string }>;
  }
) {
  const params = await props.params;

  const {
    txHash
  } = params;

  // Authenticate the user
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    redirect("/auth/login");
  }

  const { data: transaction, error: txError } = await supabase
    .from("transactions")
    .select("*")
    .eq("tx_hash", txHash)
    .eq("user_id", data.user.id)
    .single();

  if (txError || !transaction) {
    notFound();
  }

  // Fetch related status events
  const { data: statusEvents } = await supabase
    .from("transaction_events")
    .select("*")
    .eq("transaction_id", transaction.id)
    .order("created_at", { ascending: true });

  const networkName = getNetworkName(transaction.chain);
  const explorerUrl = getExplorerUrl(transaction.chain, transaction.tx_hash);

  return (
    <div className="container mx-auto py-10">
      <div className="space-y-6">
        <div>
          {/* This button now correctly points back to the main dashboard */}
          <Button asChild variant="outline" className="mb-4">
            <Link href="/dashboard">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Link>
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">
            Transaction Details
          </h1>
          <p className="text-muted-foreground">
            Full receipt and event log for your transaction.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left side: Receipt */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Purchase Receipt</CardTitle>
                <CardDescription>
                  Transaction ID: {transaction.id}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <DetailRow
                  label="Date & Time"
                  value={format(new Date(transaction.created_at), "PPpp")}
                />
                <DetailRow
                  label="Status"
                  value={
                    <Badge
                      variant={
                        transaction.status === "failed"
                          ? "destructive"
                          : transaction.status === "pending"
                            ? "secondary"
                            : "default"
                      }
                    >
                      {transaction.status.charAt(0).toUpperCase() + transaction.status.slice(1)}
                    </Badge>
                  }
                />
                <Separator />
                <DetailRow
                  label="Credits Purchased"
                  value={transaction.credit_amount.toLocaleString()}
                />
                <DetailRow
                  label="USDC Paid"
                  value={`$${transaction.amount_usdc.toFixed(2)}`}
                />
                <DetailRow
                  label="Network Fee"
                  value={`$${transaction.fee_usdc.toFixed(2)}`}
                />
                <Separator />
                <DetailRow label="Network" value={networkName} />
                <DetailRow
                  label="Transaction Hash"
                  value={
                    <div className="flex items-center gap-2">
                      <Link
                        href={explorerUrl || "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-blue-600 hover:text-blue-800"
                      >
                        <span className="font-mono text-xs">
                          {transaction.tx_hash.slice(0, 10)}...{transaction.tx_hash.slice(-8)}
                        </span>
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                      <CopyTxHashButton txHash={transaction.tx_hash} />
                    </div>
                  }
                />
              </CardContent>
            </Card>
          </div>

          {/* Right side: Events */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle>Transaction Events</CardTitle>
                <CardDescription>A log of status changes.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Timestamp</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {statusEvents && statusEvents.length > 0 ? (
                      statusEvents.map((event) => (
                        <TableRow key={event.id}>
                          <TableCell>
                            <Badge variant="outline">
                              {event.new_status.charAt(0).toUpperCase() + event.new_status.slice(1)}
                            </Badge>
                          </TableCell>
                          <TableCell>{format(new Date(event.created_at), "PPpp")}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={2} className="text-center text-muted-foreground">
                          No status events yet
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
