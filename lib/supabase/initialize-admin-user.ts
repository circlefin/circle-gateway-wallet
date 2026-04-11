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

import { createClient } from "@supabase/supabase-js";
import { SupabaseClient } from "@supabase/supabase-js";

// These environment variables must be available on your server.
// You should have them in a .env.local file for local development.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SECRET_KEY;

// A server-side-only, admin client for Supabase.
let adminAuthClient: SupabaseClient | null = null;

if (supabaseUrl && supabaseServiceRoleKey) {
  adminAuthClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
} else {
  console.warn(
    "Supabase URL or Service Role Key is not set. Admin user creation will be skipped."
  );
}

const createAdminUserIfNotExists = async () => {
  if (!adminAuthClient) {
    return;
  }

  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@admin.com";
  const adminPassword = process.env.INITIAL_ADMIN_PASSWORD;
  if (!adminPassword) {
    console.warn("INITIAL_ADMIN_PASSWORD not set, skipping admin user creation.");
    return;
  }
  // We call our custom database function via RPC (Remote Procedure Call).
  // This is a single, fast, and scalable database query.
  const { data: adminUserExists, error: rpcError } = await adminAuthClient.rpc(
    "check_user_exists",
    { user_email: adminEmail }
  );

  if (rpcError) {
    const errorMessage = rpcError.message || "Unknown error";
    const errorCode = rpcError.code || "Unknown code";
    const errorDetails = rpcError.details || "";

    // Check if it's a network/connection error
    if (
      errorMessage.includes("invalid response") ||
      errorMessage.includes("fetch failed") ||
      errorMessage.includes("ECONNREFUSED") ||
      errorMessage.includes("ENOTFOUND")
    ) {
      console.warn(
        "⚠️  Admin user initialization skipped: Unable to connect to Supabase.",
        "This may be due to network issues or Supabase service being unavailable.",
        "The app will continue to run, but admin user initialization will be retried on next server restart."
      );
    } else {
      console.error(
        "❌ Error checking for admin user:",
        `${errorMessage} (Code: ${errorCode}${errorDetails ? `, Details: ${errorDetails}` : ""})`
      );
    }
    return;
  }

  if (adminUserExists) {
    console.log(
      `Admin user with email ${adminEmail} already exists. Skipping creation.`
    );
    return;
  }

  // If the RPC call returns false, we create the user.
  console.log(
    `Admin user not found. Creating user with email ${adminEmail}...`
  );
  const { data, error: createError } =
    await adminAuthClient.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      // Automatically confirm the user's email
      email_confirm: true,
    });

  if (createError) {
    console.error("Error creating admin user:", createError.message);
    return;
  }

  if (data.user) {
    console.log(`Admin user with email ${adminEmail} created successfully.`);
  }
};

// This is the key: we call the function immediately.
// When this file is imported, this function will run.
createAdminUserIfNotExists();
