import { NextResponse } from 'next/server';
import { generateBerthForecastData } from '@/lib/berthScheduler';

export async function GET() {
  return NextResponse.json(generateBerthForecastData());
}
