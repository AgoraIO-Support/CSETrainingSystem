'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Upload, AlertCircle, CheckCircle2, FileText, X } from 'lucide-react';

interface TranscriptUploadProps {
  lessonId: string;
  videoAssetId?: string;
  onUploadComplete?: () => void;
}

export function TranscriptUpload({ lessonId, videoAssetId, onUploadComplete }: TranscriptUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.name.endsWith('.vtt')) {
      setError('Please select a VTT file (.vtt extension)');
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError('File size must be less than 10MB');
      return;
    }

    setSelectedFile(file);
    setError(null);
    setSuccess(false);
  };

  const handleUpload = async () => {
    if (!selectedFile || !videoAssetId) {
      setError('Please select a file and ensure a video is selected');
      return;
    }

    setUploading(true);
    setError(null);
    setUploadProgress(0);

    try {
      // Get auth token
      const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // Step 1: Get presigned URL
      setUploadProgress(10);
      const uploadResponse = await fetch(`/api/admin/lessons/${lessonId}/transcript`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          filename: selectedFile.name,
          contentType: 'text/vtt',
          videoAssetId,
          language: 'en',
        }),
      });

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json();
        throw new Error(errorData.error || 'Failed to get upload URL');
      }

      const { data } = await uploadResponse.json();
      setUploadProgress(30);

      // Step 2: Upload file to S3
      const s3Response = await fetch(data.uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'text/vtt',
          'x-amz-server-side-encryption': 'AES256',
        },
        body: selectedFile,
      });

      if (!s3Response.ok) {
        throw new Error('Failed to upload file to S3');
      }

      setUploadProgress(70);

      // Step 3: Trigger processing
      const processResponse = await fetch(`/api/admin/lessons/${lessonId}/transcript/process`, {
        method: 'POST',
        headers,  // Reuse the same auth headers
      });

      if (!processResponse.ok) {
        const errorData = await processResponse.json();
        throw new Error(errorData.error || 'Failed to start processing');
      }

      setUploadProgress(100);
      setSuccess(true);
      setSelectedFile(null);

      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      // Notify parent component
      onUploadComplete?.();

      // Auto-hide success message after 3 seconds
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setUploadProgress(0);
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setError(null);
    setSuccess(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Upload Transcript
        </CardTitle>
        <CardDescription>
          Upload a VTT transcription file to enable AI-powered Q&A for this video
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* File Input */}
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".vtt"
            onChange={handleFileSelect}
            className="hidden"
            id="transcript-upload"
            disabled={uploading || !videoAssetId}
          />
          <label htmlFor="transcript-upload">
            <Button
              variant="outline"
              className="w-full cursor-pointer"
              disabled={uploading || !videoAssetId}
              onClick={(e) => {
                e.preventDefault();
                fileInputRef.current?.click();
              }}
            >
              <Upload className="mr-2 h-4 w-4" />
              Select VTT File
            </Button>
          </label>

          {!videoAssetId && (
            <p className="mt-2 text-sm text-muted-foreground">
              Please select a video asset first
            </p>
          )}
        </div>

        {/* Selected File Display */}
        {selectedFile && (
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{selectedFile.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(selectedFile.size / 1024).toFixed(2)} KB
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRemoveFile}
              disabled={uploading}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Upload Progress */}
        {uploading && (
          <div className="space-y-2">
            <Progress value={uploadProgress} />
            <p className="text-sm text-muted-foreground text-center">
              {uploadProgress < 30 && 'Preparing upload...'}
              {uploadProgress >= 30 && uploadProgress < 70 && 'Uploading to S3...'}
              {uploadProgress >= 70 && 'Starting processing...'}
            </p>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Success Alert */}
        {success && (
          <Alert className="border-green-500 bg-green-50">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              Transcript uploaded successfully! Processing has started.
            </AlertDescription>
          </Alert>
        )}

        {/* Upload Button */}
        {selectedFile && !uploading && !success && (
          <Button
            onClick={handleUpload}
            disabled={!videoAssetId}
            className="w-full"
          >
            Upload and Process
          </Button>
        )}

        {/* Help Text */}
        <div className="rounded-lg bg-muted p-3 text-sm">
          <p className="font-medium mb-1">Requirements:</p>
          <ul className="list-disc list-inside space-y-1 text-muted-foreground">
            <li>File must be in WebVTT format (.vtt)</li>
            <li>Maximum file size: 10MB</li>
            <li>Timestamps should align with video duration</li>
            <li>UTF-8 encoding required</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
