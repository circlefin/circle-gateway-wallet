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
