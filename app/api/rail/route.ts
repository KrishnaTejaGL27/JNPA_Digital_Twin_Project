import { NextResponse } from 'next/server';
import { generateRailData } from '@/lib/mockDataGen';

export async function GET() {
  return NextResponse.json(generateRailData());
}
