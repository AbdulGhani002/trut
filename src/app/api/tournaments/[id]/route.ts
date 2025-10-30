import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Tournament from '@shared/models/Tournament';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parts = url.pathname.split('/').filter(Boolean);
  const id = parts[parts.length - 1];
  await dbConnect();
  const t = await Tournament.findById(id);
  if (!t) return NextResponse.json({ message: 'Tournament not found' }, { status: 404 });
  return NextResponse.json({ tournament: t });
}

export const dynamic = 'force-dynamic';
