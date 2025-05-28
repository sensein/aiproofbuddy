import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

export async function DELETE(request: NextRequest) {
  try {
    await fs.promises.rm(UPLOADS_DIR, { recursive: true, force: true });
    await fs.promises.mkdir(UPLOADS_DIR, { recursive: true });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete all data:', error);
    return NextResponse.json({ error: 'Failed to delete all data', details: error instanceof Error ? error.stack || error.message : String(error) }, { status: 500 });
  }
} 