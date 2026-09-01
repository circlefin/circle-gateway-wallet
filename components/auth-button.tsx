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

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/logout-button";
import { CreditsBadge } from "@/components/credits-badge";

export async function AuthButton() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    // Check if the logged-in user is the admin.
    const isAdmin = user.email === process.env.ADMIN_EMAIL;

    // Only fetch credits if the user is NOT the admin.
    let initialCredits = 0;
    if (!isAdmin) {
      const { data: creditsData } = await supabase
        .from("credits")
        .select("credits")
        .eq("user_id", user.id)
        .single();
      initialCredits = creditsData?.credits ?? 0;
    }

    return (
      <div className="flex items-center gap-4">
        <span>Hey, {user.email}!</span>

        {!isAdmin && (
          <CreditsBadge initialCredits={initialCredits} userId={user.id} />
        )}

        <LogoutButton />
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <Button asChild size="sm" variant={"outline"}>
        <Link href="/auth/login">Sign in</Link>
      </Button>
      <Button asChild size="sm" variant={"default"}>
        <Link href="/auth/sign-up">Sign up</Link>
      </Button>
    </div>
  );
}