import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    
    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    let uploadedCount = 0;
    const errors: string[] = [];

    for (const file of files) {
      try {
        // Get the relative path from the file's webkitRelativePath
        const relativePath = (file as any).webkitRelativePath || file.name;
        const fullPath = path.join(UPLOADS_DIR, relativePath);

        // Ensure the directory exists
        await mkdir(path.dirname(fullPath), { recursive: true });

        // Convert the file to a buffer and write it
        const buffer = Buffer.from(await file.arrayBuffer());
        await writeFile(fullPath, buffer);

        uploadedCount++;
      } catch (error) {
        console.error(`Error uploading file ${file.name}:`, error);
        errors.push(file.name);
      }
    }

    if (uploadedCount === 0) {
      return NextResponse.json(
        { error: 'Failed to upload any files', details: errors },
        { status: 500 }
      );
    }

    return NextResponse.json({
      uploaded: uploadedCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Error handling upload:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 