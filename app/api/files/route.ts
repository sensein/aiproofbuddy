import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { promises as fsPromises } from 'fs';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
  evaluated?: boolean;
}

async function buildFileTree(dir: string, relativePath: string = ''): Promise<FileNode[]> {
  const entries = await fsPromises.readdir(dir, { withFileTypes: true });
  const nodes: FileNode[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.join(relativePath, entry.name);

    if (entry.isDirectory()) {
      const children = await buildFileTree(fullPath, relPath);
      nodes.push({
        name: entry.name,
        path: relPath,
        type: 'directory',
        children,
      });
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      const evalPath = fullPath.replace('.json', '_eval.json');
      const evaluated = await fsPromises.access(evalPath).then(() => true).catch(() => false);
      
      nodes.push({
        name: entry.name,
        path: relPath,
        type: 'file',
        evaluated,
      });
    }
  }

  return nodes;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const filePath = searchParams.get('path');

    if (filePath) {
      // Handle file download
      const fullPath = path.join(UPLOADS_DIR, filePath);
      
      try {
        const fileContent = await fsPromises.readFile(fullPath, 'utf-8');
        return new NextResponse(fileContent, {
          headers: {
            'Content-Type': 'application/json',
            'Content-Disposition': `attachment; filename="${path.basename(filePath)}"`,
          },
        });
      } catch (error) {
        return NextResponse.json({ error: 'File not found' }, { status: 404 });
      }
    }

    // List all files
    const fileTree = await buildFileTree(UPLOADS_DIR);
    return NextResponse.json(fileTree);
  } catch (error) {
    console.error('Error handling files request:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const filePath = searchParams.get('path');

    if (!filePath) {
      return NextResponse.json({ error: 'No file path provided' }, { status: 400 });
    }

    const fullPath = path.join(UPLOADS_DIR, filePath);
    
    try {
      await fsPromises.unlink(fullPath);
      
      // Also try to delete the evaluation file if it exists
      const evalPath = fullPath.replace('.json', '_eval.json');
      await fsPromises.unlink(evalPath).catch(() => {}); // Ignore if eval file doesn't exist
      
      return NextResponse.json({ success: true });
    } catch (error) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
  } catch (error) {
    console.error('Error handling file deletion:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const data = await request.json();
    const { filePath, evaluationData } = data;

    if (!filePath || !evaluationData) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const evalFilePath = filePath.replace('.json', '_eval.json');
    const fullPath = path.join(process.cwd(), evalFilePath);

    // Ensure the directory exists
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write the evaluation data
    fs.writeFileSync(fullPath, JSON.stringify(evaluationData, null, 2));

    return NextResponse.json({ success: true, path: evalFilePath });
  } catch (error) {
    console.error('Error saving evaluation:', error);
    return NextResponse.json(
      { error: 'Failed to save evaluation' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const url = new URL(request.url);
  const filePath = url.searchParams.get('path');
  if (filePath) {
    // Save evaluation for a single file
    try {
      const evalData = await request.json();
      const fullPath = path.join(UPLOADS_DIR, filePath);
      // Ensure the directory exists
      const dir = path.dirname(fullPath);
      await fsPromises.mkdir(dir, { recursive: true });
      await fsPromises.writeFile(fullPath, JSON.stringify(evalData, null, 2), 'utf-8');
      return NextResponse.json({ success: true, path: filePath });
    } catch (error) {
      console.error('Error saving evaluation:', error);
      return NextResponse.json({ error: 'Failed to save evaluation' }, { status: 500 });
    }
  }
  // Bulk export: /api/files?type=original|eval|both|merged
  const type = url.searchParams.get('type') || 'eval';
  const uploadsDir = path.join(process.cwd(), 'uploads');
  const files: string[] = [];
  function walk(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else if (entry.isFile() && entry.name.endsWith('.json')) {
        if (type === 'original' && !entry.name.endsWith('_eval.json')) files.push(fullPath);
        else if (type === 'eval' && entry.name.endsWith('_eval.json')) files.push(fullPath);
        else if (type === 'both') files.push(fullPath);
      }
    }
  }
  walk(uploadsDir);
  if (type === 'merged') {
    // Return a single merged JSON array of all evaluation results
    const merged = files.filter(f => f.endsWith('_eval.json')).map(f => {
      try {
        return JSON.parse(fs.readFileSync(f, 'utf-8'));
      } catch { return null; }
    }).filter(Boolean);
    return NextResponse.json({ merged });
  } else {
    // Return a zip file (buffered)
    const archiverLib = (await import('archiver')).default;
    const archive = archiverLib('zip');
    const chunks: Buffer[] = [];
    archive.on('data', (chunk: Buffer) => chunks.push(chunk));
    for (const file of files) {
      archive.file(file, { name: path.relative(uploadsDir, file) });
    }
    await archive.finalize();
    const zipBuffer = Buffer.concat(chunks);
    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="bulk_export.zip"`
      }
    });
  }
} 