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

import { handleDeposit } from '@/lib/deposit';

describe('handleDeposit', () => {
  it('returns success for valid deposit', async () => {
    const result = await handleDeposit({
      userId: 'user-1',
      chain: 'Ethereum',
      amount: 100,
    });
    if ('success' in result) {
      expect(result.success).toBe(true);
      expect(result.depositResult).toBeDefined();
    } else {
      throw new Error('Expected success result');
    }
  });

  it('returns error for missing userId', async () => {
    const result = await handleDeposit({
      chain: 'Ethereum',
      amount: 100,
    });
    if ('error' in result) {
      expect(result.error).toBeDefined();
    } else {
      throw new Error('Expected error result');
    }
  });

  it('returns error for missing chain', async () => {
    const result = await handleDeposit({
      userId: 'user-1',
      amount: 100,
    });
    if ('error' in result) {
      expect(result.error).toBeDefined();
    } else {
      throw new Error('Expected error result');
    }
  });

  it('returns error for missing amount', async () => {
    const result = await handleDeposit({
      userId: 'user-1',
      chain: 'Ethereum',
    });
    if ('error' in result) {
      expect(result.error).toBeDefined();
    } else {
      throw new Error('Expected error result');
    }
  });
});
