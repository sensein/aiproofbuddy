import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const relPath = url.searchParams.get('path');
  if (!relPath) {
    return new NextResponse('Missing path', { status: 400 });
  }
  // Prevent path traversal
  const uploadsDir = path.join(process.cwd(), 'uploads');
  const filePath = path.join(uploadsDir, relPath);
  if (!filePath.startsWith(uploadsDir)) {
    return new NextResponse('Forbidden', { status: 403 });
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return new NextResponse('Not found', { status: 404 });
  }
  const ext = path.extname(filePath).toLowerCase();
  let contentType = 'application/octet-stream';
  if (ext === '.json') contentType = 'application/json';
  // Stream the file
  const fileBuffer = fs.readFileSync(filePath);
  return new NextResponse(fileBuffer, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${path.basename(filePath)}"`
    }
  });
} 