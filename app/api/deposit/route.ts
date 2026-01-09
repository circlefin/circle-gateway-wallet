import { NextRequest, NextResponse } from 'next/server';
import { handleDeposit } from '@/lib/deposit';

export async function POST(req: NextRequest) {
  const params = await req.json();
  const result = await handleDeposit(params);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result);
}
