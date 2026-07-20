# arc-commerce Troubleshooting Guide

This guide helps you resolve common issues when developing with arc-commerce.

## Table of Contents
- [Installation Issues](#installation-issues)
- [API Key Setup](#api-key-setup)
- [Database Issues](#database-issues)
- [Webhook Issues](#webhook-issues)
- [Credit Purchase Errors](#credit-purchase-errors)
- [Admin Dashboard Issues](#admin-dashboard-issues)
- [Runtime Errors](#runtime-errors)
- [Deployment Issues](#deployment-issues)
- [FAQ](#faq)

---

## Installation Issues

### Node Version Mismatch

**Problem:** README requires Node v22+, but you have v20

**Error:**
Warning: The current Node version v20.x.x does not meet the required version v22+

**Solutions:**

1. **Install Node v22 with nvm:**
```bash
   nvm install 22
   nvm use 22
   node --version  # Should show v22.x.x
```

2. **Or continue with v20:** (may work but not officially supported)
```bash
   # arc-commerce likely works on v20, test it
   npm install
   npm run dev
```

### npm Install Warnings

**Problem:** Deprecation warnings during `npm install`

**Common warnings:**
npm warn deprecated inflight@1.0.6
npm warn deprecated @humanwhocodes/config-array@0.11.14

**Solution:** These are generally safe to ignore. They're from dependencies and don't affect functionality.

### npm Vulnerabilities

**Problem:** `npm install` reports vulnerabilities

**Output:**
21 vulnerabilities (15 moderate, 6 high)

**Solution:**

1. **Check if fixable:**
```bash
   npm audit fix
```

2. **Most are in dev dependencies:** Generally safe for development

3. **For production:** Address before deploying:
```bash
   npm audit fix --force  # Use with caution
```

### Docker Not Running

**Problem:** `npx supabase start` fails

**Error:**
Error: Cannot connect to the Docker daemon

**Solution:**

1. **Start Docker Desktop**
2. **Wait for Docker to fully start** (check icon)
3. **Try again:**
```bash
   npx supabase start
```

---

## API Key Setup

### Circle API Key Not Working

**Problem:** API requests fail with authentication error

**Error:**
Error: Invalid API key

**Solutions:**

1. **Verify API key format:**
```bash
   # Should start with: TEST_API_KEY:xxx or LIVE_API_KEY:xxx
   echo $CIRCLE_API_KEY
```

2. **Check environment file:**
```bash
   cat .env.local | grep CIRCLE_API_KEY
```

3. **Regenerate key:**
   - Go to https://console.circle.com
   - Navigate to **Settings → API Keys**
   - Create new **Sandbox** key (for testnet)
   - Update `.env.local`

### Entity Secret Issues

**Problem:** Wallet creation fails

**Error:**
Error: Invalid entity secret

**Solutions:**

1. **Verify entity secret exists:**
```bash
   cat .env.local | grep CIRCLE_ENTITY_SECRET
```

2. **Generate new entity secret:**
   - Go to Circle Console → **Settings → Entity Secrets**
   - Click **"Generate Entity Secret"**
   - **Copy immediately** (can't view again!)
   - Update `.env.local`

3. **Format check:** Should be a long alphanumeric string

### Admin Wallet Not Created

**Problem:** App starts but admin wallet missing

**Error:**
Error: Admin wallet not found

**Solutions:**

1. **Check database:**
```bash
   # Local Supabase
   npx supabase db reset
   npx supabase migration up
   
   # Then restart app
   npm run dev
```

2. **Verify admin email:**
```bash
   # Must match ADMIN_EMAIL in .env.local
   cat .env.local | grep ADMIN_EMAIL
```

3. **Check logs:** Look for wallet creation errors on startup

4. **Manual creation:** Check admin initialization code in `lib/admin.ts`

---

## Database Issues

### Supabase Connection Failed

**Problem:** Can't connect to Supabase

**Error:**
Error: Failed to connect to Supabase

**Solutions:**

**Local Supabase:**
```bash
# Check if running
npx supabase status

# If not running, start it
npx supabase start

# Verify URL matches .env.local
npx supabase status | grep "API URL"
```

**Remote Supabase:**
```bash
# Test connection
curl https://your-project.supabase.co/rest/v1/

# Verify credentials in Supabase dashboard:
# Settings → API → Project URL and keys
```

### Migration Errors

**Problem:** Database migrations fail

**Error:**
Error applying migration

**Solutions:**

1. **Reset database (local):**
```bash
   npx supabase db reset
   npx supabase migration up
```

2. **Check migration files:**
```bash
   ls supabase/migrations/
   # Should see .sql files
```

3. **Manual migration (remote):**
```bash
   npx supabase db push
```

### RLS Policy Errors

**Problem:** "Row level security policy violation"

**Error:**
Error: new row violates row-level security policy

**Solutions:**

1. **Verify RLS enabled:**
```sql
   -- In Supabase SQL Editor
   SELECT tablename, rowsecurity 
   FROM pg_tables 
   WHERE schemaname = 'public';
```

2. **Check policies exist:**
```sql
   SELECT * FROM pg_policies;
```

3. **Disable RLS temporarily (dev only):**
```sql
   ALTER TABLE users DISABLE ROW LEVEL SECURITY;
   -- Remember to re-enable!
```

### Email Rate Limit

**Problem:** "Email rate limit exceeded"

**Error:**
Error: Email rate limit exceeded. Please try again later.

**Solutions:**

**Local Supabase:**
```bash
# Check Inbucket for emails
open http://127.0.0.1:54324

# Adjust rate limit in supabase/config.toml
[auth.rate_limit]
emails = 10  # Increase from 2
```

**Remote Supabase:**
- Use unique email addresses
- Wait 1 hour between signups
- Configure custom SMTP (Settings → Auth → SMTP)
- Manually add users via dashboard

---

## Webhook Issues

### Webhooks Not Received

**Problem:** Transactions stuck in "pending" status

**Checklist:**

1. **ngrok running?**
```bash
   # In separate terminal
   ngrok http 3000
   # Copy HTTPS URL
```

2. **Webhook URL configured in Circle Console?**
   - Go to Circle Console → **Webhooks**
   - Add endpoint: `https://your-ngrok-url.ngrok.io/api/circle/webhook`
   - Save changes

3. **Test webhook endpoint:**
```bash
   curl -X POST http://localhost:3000/api/circle/webhook \
     -H "Content-Type: application/json" \
     -d '{"type":"test"}'
   
   # Should return 200 OK
```

4. **Check Circle webhook logs:**
   - Circle Console → Webhooks → Your endpoint
   - View delivery attempts and errors

### Webhook Signature Verification Failed

**Problem:** Webhooks rejected

**Error:**
Error: Invalid webhook signature

**Solutions:**

1. **Get webhook secret from Circle Console**
2. **Add to environment:**
```bash
   # .env.local
   CIRCLE_WEBHOOK_SECRET=your-webhook-secret
```

3. **Verify signature logic:**
```typescript
   // Check implementation in /api/circle/webhook/route.ts
   const signature = request.headers.get('circle-signature')
   // Should match HMAC SHA256 of payload
```

4. **Test with Circle's test events** in Console

---

## Credit Purchase Errors

### Purchase Fails Immediately

**Problem:** Purchase API returns error

**Common errors:**

**1. User wallet not found:**
Error: User wallet not created
**Solution:** 
- Wallet should auto-create on first purchase
- Check wallet creation logic in `/api/purchase/route.ts`
- Verify Circle credentials

**2. Insufficient USDC:**
Error: Insufficient balance
**Solution:**
- Get testnet USDC from [Circle Faucet](https://faucet.circle.com/)
- Enter your wallet address (shown in dashboard)
- Wait for transaction confirmation

**3. Invalid amount:**
Error: Invalid credit amount
**Solution:**
- Check amount is positive number
- Verify USDC calculation logic

### Transaction Stuck in Pending

**Problem:** Purchase doesn't complete

**Debugging:**

1. **Check transaction status:**
```bash
   # In Supabase SQL Editor
   SELECT * FROM transactions 
   WHERE status = 'pending' 
   ORDER BY created_at DESC;
```

2. **Verify webhook received:**
   - Check ngrok request log
   - Check Circle webhook delivery status
   - Check app logs for webhook processing

3. **Manual completion (dev only):**
```sql
   -- Update transaction
   UPDATE transactions 
   SET status = 'completed', 
       completed_at = NOW() 
   WHERE id = 'transaction-id';
   
   -- Credit user
   UPDATE users 
   SET credits = credits + 100 
   WHERE id = 'user-id';
```

### Credits Not Added After Payment

**Problem:** USDC transferred but credits not updated

**Debugging:**

1. **Check webhook processed:**
```bash
   # Check app logs
   # Should see: "Webhook received: transfer.completed"
```

2. **Verify transaction updated:**
```sql
   SELECT * FROM transactions 
   WHERE circle_transfer_id = 'transfer-id';
```

3. **Check user credits:**
```sql
   SELECT id, email, credits 
   FROM users 
   WHERE id = 'user-id';
```

4. **Manual fix:**
```sql
   UPDATE users 
   SET credits = credits + [amount] 
   WHERE id = 'user-id';
```

---

## Admin Dashboard Issues

### Can't Access Admin Dashboard

**Problem:** Redirected to user dashboard

**Solutions:**

1. **Verify admin email:**
```bash
   cat .env.local | grep ADMIN_EMAIL
   # Default: admin@admin.com
```

2. **Check logged-in email matches:**
   - Log out
   - Log in with admin@admin.com
   - Password: 123456 (default)

3. **Verify admin check logic:**
```typescript
   // In app/admin/page.tsx
   const isAdmin = user.email === process.env.ADMIN_EMAIL
```

### Admin Dashboard Shows No Data

**Problem:** Dashboard empty despite having users/transactions

**Solutions:**

1. **Check RLS policies allow admin access:**
```sql
   -- Admin should see all users
   SELECT * FROM users;  -- Run as admin
```

2. **Verify admin policy exists:**
```sql
   SELECT * FROM pg_policies 
   WHERE tablename = 'users' 
   AND policyname LIKE '%admin%';
```

3. **Add missing admin policy:**
```sql
   CREATE POLICY "Admins can view all users"
     ON users FOR SELECT
     USING (
       (SELECT email FROM users WHERE id = auth.uid()) = 'admin@admin.com'
     );
```

---

## Runtime Errors

### Wallet Creation Fails

**Problem:** "Error creating wallet"

**Solutions:**

1. **Verify Circle credentials:**
```bash
   cat .env.local | grep CIRCLE
```

2. **Check Circle SDK initialized:**
```typescript
   import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets'
   
   const client = initiateDeveloperControlledWalletsClient({
     apiKey: process.env.CIRCLE_API_KEY!,
     entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
   })
```

3. **Test wallet creation:**
```bash
   # Create test script
   node scripts/test-wallet-creation.js
```

### USDC Transfer Fails

**Problem:** Transfer API call fails

**Common issues:**

1. **Invalid wallet ID:**
Error: Wallet not found
   - Verify wallet exists in database
   - Check wallet ID format

2. **Invalid token address:**
Error: Invalid token address
   - Verify `CIRCLE_USDC_TOKEN_ID` in `.env.local`
   - Should match Arc testnet USDC address

3. **Insufficient balance:**
Error: Insufficient balance for transfer
   - Get USDC from faucet
   - Check actual wallet balance

### Authentication Errors

**Problem:** User not authenticated

**Error:**
Error: Not authenticated

**Solutions:**

1. **Check Supabase client:**
```typescript
   import { createClient } from '@/lib/supabase/client'
   const supabase = createClient()
   const { data: { user } } = await supabase.auth.getUser()
```

2. **Verify session:**
```bash
   # Check browser localStorage
   # Should have supabase.auth.token
```

3. **Re-login:**
   - Log out
   - Clear browser cache
   - Log back in

---

## Deployment Issues

### Environment Variables Not Working

**Problem:** App can't find environment variables in production

**Solutions:**

1. **Verify variables set in deployment platform:**
   - Vercel: Settings → Environment Variables
   - Add all from `.env.local`

2. **Check variable names:**
   - Must be EXACT match (case-sensitive)
   - No typos

3. **Redeploy after adding variables:**
   - Changes require new deployment

### Build Fails

**Problem:** `npm run build` fails in production

**Common issues:**

1. **TypeScript errors:**
```bash
   # Fix locally first
   npx tsc --noEmit
   # Fix all errors shown
```

2. **Missing environment variables:**
```bash
   # Add all required vars to deployment platform
```

3. **Linting errors:**
```bash
   npm run lint
   # Fix all errors
```

---

## FAQ

### Q: How do I get testnet USDC?

**A:** Use the [Circle Faucet](https://faucet.circle.com/)
1. Get your wallet address from dashboard
2. Visit faucet
3. Select Arc Testnet
4. Request USDC
5. Wait for confirmation (~1 minute)

### Q: Why is my purchase stuck?

**A:** Usually webhook not received:
1. Check ngrok is running
2. Verify webhook URL in Circle Console
3. Check webhook logs in Circle Console
4. Test endpoint manually

### Q: How do I reset everything?

**A:** Fresh start:
```bash
# Stop everything
npx supabase stop

# Clear database
rm -rf supabase/.branches

# Restart
npx supabase start
npx supabase migration up
npm run dev
```

### Q: Can I test without real USDC?

**A:** Yes, use Arc testnet:
- Testnet USDC is free (use faucet)
- No real money involved
- Reset anytime

### Q: How do I add more admins?

**A:** Current design: single admin
To add more:
1. Modify admin check to use array:
```typescript
   const adminEmails = [
     'admin@admin.com',
     'admin2@admin.com'
   ]
   const isAdmin = adminEmails.includes(user.email)
```
2. Update RLS policies
3. Redeploy

### Q: What's the credit-to-USDC ratio?

**A:** Configurable in your code:
```typescript
// Example: 1 USDC = 10 credits
const USDC_PER_CREDIT = 0.1
```

### Q: Can users withdraw USDC?

**A:** Not in current implementation
- System is one-way (USDC → Credits)
- Add withdrawal feature requires:
  - Reverse transfer logic
  - Credit deduction
  - Admin approval (optional)

### Q: How do I handle refunds?

**A:** Manual process currently:
1. Reverse credit transaction in database
2. Initiate USDC transfer back to user
3. Update transaction status

### Q: Why do I see npm warnings?

**A:** Common and usually safe:
- Deprecation warnings: Dependencies will update
- Vulnerabilities: Mostly in dev dependencies
- Ignore unless critical

### Q: How do I monitor transactions?

**A:** Multiple ways:
1. Admin dashboard (UI)
2. Supabase dashboard (database)
3. Circle Console (webhooks)
4. Application logs (errors)

---

## Still Having Issues?

1. **Check GitHub Issues:** https://github.com/circlefin/arc-commerce/issues
2. **Circle Documentation:** https://developers.circle.com
3. **Supabase Docs:** https://supabase.com/docs
4. **Open a Discussion:** Share your problem with the community

---

**Remember:** This is a sample application for testnet. For production use, implement additional error handling, monitoring, and security measures.
