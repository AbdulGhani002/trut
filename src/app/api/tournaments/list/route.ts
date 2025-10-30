import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Tournament from '@shared/models/Tournament';

export async function GET() {
  await dbConnect();
  const items = await Tournament.find().sort({ createdAt: -1 }).limit(50).lean();
  return NextResponse.json({ tournaments: items });
}

export const dynamic = 'force-dynamic';
