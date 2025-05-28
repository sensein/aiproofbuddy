import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { promises as fsPromises } from 'fs';
import archiver from 'archiver';
import { Readable } from 'stream';
import fs from 'fs';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

interface ExportRequest {
  folders: string[];
  type: 'original' | 'evaluation' | 'both' | 'merged';
}

async function* walkDir(dir: string): AsyncGenerator<string> {
  const entries = await fsPromises.readdir(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkDir(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      yield fullPath;
    }
  }
}

async function mergeJsonFiles(originalPath: string, evalPath: string): Promise<any> {
  try {
    const [originalContent, evalContent] = await Promise.all([
      fsPromises.readFile(originalPath, 'utf-8').then(JSON.parse),
      fsPromises.readFile(evalPath, 'utf-8').then(JSON.parse),
    ]);

    return {
      ...originalContent,
      evaluation: evalContent,
    };
  } catch (error) {
    console.error('Error merging JSON files:', error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { folders, type } = await request.json() as ExportRequest;

    if (!folders || !Array.isArray(folders) || folders.length === 0) {
      return NextResponse.json({ error: 'No folders specified' }, { status: 400 });
    }

    const archive = archiver('zip', {
      zlib: { level: 9 }
    });

    // Buffer the archive in memory
    const chunks: Buffer[] = [];
    archive.on('data', (chunk: Buffer) => chunks.push(chunk));
    archive.on('error', (err: any) => { throw err; });

    // Process each folder
    for (const folder of folders) {
      const folderPath = path.join(UPLOADS_DIR, folder);
      
      try {
        for await (const filePath of walkDir(folderPath)) {
          const relPath = path.relative(UPLOADS_DIR, filePath);
          const evalPath = filePath.replace('.json', '_eval.json');
          
          switch (type) {
            case 'original':
              archive.file(filePath, { name: relPath });
              break;
              
            case 'evaluation':
              if (await fsPromises.access(evalPath).then(() => true).catch(() => false)) {
                archive.file(evalPath, { name: relPath.replace('.json', '_eval.json') });
              }
              break;
              
            case 'both':
              archive.file(filePath, { name: relPath });
              if (await fsPromises.access(evalPath).then(() => true).catch(() => false)) {
                archive.file(evalPath, { name: relPath.replace('.json', '_eval.json') });
              }
              break;
          }
        }
      } catch (error) {
        console.error(`Error processing folder ${folder}:`, error);
      }
    }

    archive.finalize();

    // Wait for archive to finish and return as buffer
    await new Promise<void>((resolve, reject) => {
      archive.on('end', resolve);
      archive.on('error', reject);
    });
    const buffer = Buffer.concat(chunks);
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="export.zip"',
      },
    });
  } catch (error) {
    console.error('Error handling export request:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  // DELETE /api/export/delete-all
  if (request.nextUrl.pathname.endsWith('/delete-all')) {
    try {
      await fs.promises.rm(UPLOADS_DIR, { recursive: true, force: true });
      await fs.promises.mkdir(UPLOADS_DIR, { recursive: true });
      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('Failed to delete all data:', error);
      return NextResponse.json({ error: 'Failed to delete all data', details: error instanceof Error ? error.stack || error.message : String(error) }, { status: 500 });
    }
  }
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
} 