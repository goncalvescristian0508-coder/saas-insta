-- AlterTable: add captionedUrl to LibraryVideo (nullable, stores URL of version with burned-in captions)
ALTER TABLE "LibraryVideo" ADD COLUMN IF NOT EXISTS "captionedUrl" TEXT;
