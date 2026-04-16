// app/api/test/production-compute/route.ts
// ⚠️ UNIQUEMENT EN DÉVELOPPEMENT — désactivé en production
import { NextRequest, NextResponse } from 'next/server';
import { computeProductionSuggestions } from '@/lib/ai-production-compute';

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 404 });
  }
  const body = await req.json();
  const suggestions = computeProductionSuggestions(body);
  return NextResponse.json({ suggestions });
}
