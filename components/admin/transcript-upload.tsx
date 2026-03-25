'use client';

import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Upload, AlertCircle, CheckCircle2, FileText, Loader2, Trash2, Sparkles, Languages } from 'lucide-react';
import { ApiClient } from '@/lib/api-client';
import { inferTranscriptLanguageFromFilename, getTranscriptLabel } from '@/lib/transcript-tracks';

interface TranscriptUploadProps {
  lessonId: string;
  videoAssetId?: string;
  onUploadComplete?: () => void;
}

interface TranscriptTrack {
  id: string;
  lessonId: string;
  videoAssetId: string;
  filename: string;
  s3Key: string;
  url: string | null;
  language: string;
  label: string;
  isDefaultSubtitle: boolean;
  isPrimaryForAI: boolean;
  isActive: boolean;
  status: string;
  uploadedAt: string;
  processedAt: string | null;
}

interface TranscriptStatusResponse {
  data: {
    tracks: TranscriptTrack[];
    primaryAiTrackId: string | null;
    defaultSubtitleTrackId: string | null;
  };
}

type PromptTemplate = { id: string; name: string; isActive: boolean };

const COMMON_LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'zh-CN', label: 'Chinese (Simplified)' },
  { value: 'zh-TW', label: 'Chinese (Traditional)' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
];

export function TranscriptUpload({ lessonId, videoAssetId, onUploadComplete }: TranscriptUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [tracks, setTracks] = useState<TranscriptTrack[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [knowledgeTemplates, setKnowledgeTemplates] = useState<PromptTemplate[] | null>(null);
  const [anchorsTemplates, setAnchorsTemplates] = useState<PromptTemplate[] | null>(null);
  const [knowledgePromptTemplateId, setKnowledgePromptTemplateId] = useState<string>('auto');
  const [anchorsPromptTemplateId, setAnchorsPromptTemplateId] = useState<string>('auto');
  const [languageCode, setLanguageCode] = useState<string>('en');
  const [customLanguageCode, setCustomLanguageCode] = useState<string>('');
  const [label, setLabel] = useState<string>('');
  const [replaceExistingLanguage, setReplaceExistingLanguage] = useState(true);
  const [setAsDefaultSubtitle, setSetAsDefaultSubtitle] = useState(true);
  const [setAsPrimaryForAI, setSetAsPrimaryForAI] = useState(false);
  const [savingTrackId, setSavingTrackId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const effectiveLanguageCode = useMemo(
    () => (languageCode === 'custom' ? customLanguageCode.trim() : languageCode),
    [customLanguageCode, languageCode]
  );
  const inferredLanguageFromSelectedFile = useMemo(
    () => (selectedFile ? inferTranscriptLanguageFromFilename(selectedFile.name) : null),
    [selectedFile]
  );
  const languageLockedByFilename = Boolean(inferredLanguageFromSelectedFile);

  const fetchPromptTemplates = async (useCase: string) => {
    try {
      const response = await ApiClient.request<{ data?: Array<{ id: string; name: string; isActive: boolean }> }>(
        `/admin/ai/prompt-templates?useCase=${encodeURIComponent(useCase)}`
      );
      const templates = Array.isArray(response?.data) ? response.data : [];
      return templates
        .filter((template) => template && typeof template.id === 'string' && typeof template.name === 'string')
        .map((template) => ({ id: template.id, name: template.name, isActive: Boolean(template.isActive) }));
    } catch {
      return [];
    }
  };

  const fetchTracks = useCallback(async () => {
    try {
      const response = await ApiClient.request<TranscriptStatusResponse>(`/admin/lessons/${lessonId}/transcript`);
      const nextTracks = Array.isArray(response.data?.tracks) ? response.data.tracks : [];
      setTracks(nextTracks);
      setError(null);
      setSetAsDefaultSubtitle(
        nextTracks.length === 0
          ? true
          : !nextTracks.some((track) => track.videoAssetId === videoAssetId && track.isDefaultSubtitle)
      );
      setSetAsPrimaryForAI(nextTracks.length === 0 ? true : !nextTracks.some((track) => track.isPrimaryForAI));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load transcript tracks');
    }
  }, [lessonId, videoAssetId]);

  useEffect(() => {
    (async () => {
      const [knowledge, anchors] = await Promise.all([
        fetchPromptTemplates('VTT_TO_XML_ENRICHMENT'),
        fetchPromptTemplates('KNOWLEDGE_ANCHORS_GENERATION'),
      ]);
      setKnowledgeTemplates(knowledge);
      setAnchorsTemplates(anchors);
    })();
  }, []);

  useEffect(() => {
    void fetchTracks();
  }, [fetchTracks]);

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.vtt')) {
      setError('Please select a VTT file (.vtt extension)');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('File size must be less than 10MB');
      return;
    }

    const inferredLanguage = inferTranscriptLanguageFromFilename(file.name);
    if (inferredLanguage) {
      const knownLanguage = COMMON_LANGUAGES.find((option) => option.value === inferredLanguage);
      if (knownLanguage) {
        setLanguageCode(knownLanguage.value);
        setCustomLanguageCode('');
      } else {
        setLanguageCode('custom');
        setCustomLanguageCode(inferredLanguage);
      }

      if (!label.trim()) {
        setLabel(getTranscriptLabel({ language: inferredLanguage, label: null }));
      }
    }

    setSelectedFile(file);
    setError(null);
    setSuccess(null);
  };

  const resetFileSelection = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !videoAssetId) {
      setError('Please select a file and ensure a video is selected');
      return;
    }

    if (!effectiveLanguageCode) {
      setError('Please provide a subtitle language code');
      return;
    }

    setUploading(true);
    setError(null);
    setSuccess(null);
    setUploadProgress(0);

    try {
      setUploadProgress(10);
      const uploadResponse = await ApiClient.request<{
        data: {
          uploadUrl: string;
          transcriptAsset: {
            id: string;
            language: string;
            label: string;
            isPrimaryForAI: boolean;
          };
        };
      }>(`/admin/lessons/${lessonId}/transcript`, {
        method: 'POST',
        body: JSON.stringify({
          filename: selectedFile.name,
          contentType: 'text/vtt',
          videoAssetId,
          languageCode: effectiveLanguageCode,
          label: label.trim() || null,
          replaceExistingLanguage,
          setAsDefaultSubtitle,
          setAsPrimaryForAI,
        }),
      });

      setUploadProgress(35);

      const s3Response = await fetch(uploadResponse.data.uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'text/vtt',
          'x-amz-server-side-encryption': 'AES256',
        },
        body: selectedFile,
      });

      if (!s3Response.ok) {
        const bodyText = await s3Response.text().catch(() => '');
        throw new Error(
          `S3 upload failed (${s3Response.status} ${s3Response.statusText})${bodyText ? `: ${bodyText.slice(0, 500)}` : ''}`
        );
      }

      setUploadProgress(75);

      if (uploadResponse.data.transcriptAsset.isPrimaryForAI) {
        await ApiClient.request(`/admin/lessons/${lessonId}/knowledge/process`, {
          method: 'POST',
          body: JSON.stringify({
            transcriptId: uploadResponse.data.transcriptAsset.id,
            knowledgePromptTemplateId: knowledgePromptTemplateId !== 'auto' ? knowledgePromptTemplateId : null,
            anchorsPromptTemplateId: anchorsPromptTemplateId !== 'auto' ? anchorsPromptTemplateId : null,
          }),
        });
        setSuccess(`Uploaded ${uploadResponse.data.transcriptAsset.label} and queued AI knowledge processing.`);
      } else {
        setSuccess(`Uploaded ${uploadResponse.data.transcriptAsset.label}. It is available for playback.`);
      }

      setUploadProgress(100);
      resetFileSelection();
      setLabel('');
      await fetchTracks();
      onUploadComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setUploadProgress(0);
    } finally {
      setUploading(false);
    }
  };

  const updateTrack = async (trackId: string, payload: { setAsDefaultSubtitle?: boolean; setAsPrimaryForAI?: boolean }) => {
    try {
      setSavingTrackId(trackId);
      setError(null);
      setSuccess(null);
      await ApiClient.request(`/admin/lessons/${lessonId}/transcript`, {
        method: 'PATCH',
        body: JSON.stringify({
          transcriptId: trackId,
          ...payload,
        }),
      });

      if (payload.setAsPrimaryForAI) {
        await ApiClient.request(`/admin/lessons/${lessonId}/knowledge/process`, {
          method: 'POST',
          body: JSON.stringify({
            transcriptId: trackId,
            knowledgePromptTemplateId: knowledgePromptTemplateId !== 'auto' ? knowledgePromptTemplateId : null,
            anchorsPromptTemplateId: anchorsPromptTemplateId !== 'auto' ? anchorsPromptTemplateId : null,
          }),
        });
        setSuccess('AI source updated and knowledge processing queued.');
      } else {
        setSuccess('Subtitle track updated.');
      }

      await fetchTracks();
      onUploadComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update track');
    } finally {
      setSavingTrackId(null);
    }
  };

  const deleteTrack = async (trackId: string) => {
    try {
      setSavingTrackId(trackId);
      setError(null);
      setSuccess(null);
      await ApiClient.request(`/admin/lessons/${lessonId}/transcript?transcriptId=${trackId}`, {
        method: 'DELETE',
      });
      setSuccess('Subtitle track deleted.');
      await fetchTracks();
      onUploadComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete track');
    } finally {
      setSavingTrackId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Languages className="h-5 w-5" />
          Subtitle Tracks
        </CardTitle>
        <CardDescription>
          Upload multiple VTT subtitle tracks. Choose which one is the default subtitle and which one powers AI knowledge.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <p className="text-sm font-medium">Knowledge Context Template</p>
          <Select value={knowledgePromptTemplateId} onValueChange={setKnowledgePromptTemplateId} disabled={uploading}>
            <SelectTrigger>
              <SelectValue placeholder="Auto (course/default)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto (course/default)</SelectItem>
              {(knowledgeTemplates || [])
                .filter((template) => template.isActive)
                .map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Key Moments (Anchors) Template</p>
          <Select value={anchorsPromptTemplateId} onValueChange={setAnchorsPromptTemplateId} disabled={uploading}>
            <SelectTrigger>
              <SelectValue placeholder="Auto (course/default)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto (course/default)</SelectItem>
              {(anchorsTemplates || [])
                .filter((template) => template.isActive)
                .map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-sm font-medium">Language</p>
            <Select value={languageCode} onValueChange={setLanguageCode} disabled={uploading || languageLockedByFilename}>
              <SelectTrigger>
                <SelectValue placeholder="Select language" />
              </SelectTrigger>
              <SelectContent>
                {COMMON_LANGUAGES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
                <SelectItem value="custom">Custom code</SelectItem>
              </SelectContent>
            </Select>
            {languageCode === 'custom' && (
              <Input
                placeholder="e.g. pt-BR"
                value={customLanguageCode}
                onChange={(event) => setCustomLanguageCode(event.target.value)}
                disabled={uploading || languageLockedByFilename}
              />
            )}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Label (optional)</p>
            <Input
              placeholder="e.g. English, Mandarin, Japanese CC"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              disabled={uploading}
            />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <label className="flex items-center justify-between rounded-lg border p-3 text-sm">
            <span>Replace existing track for this language</span>
            <Switch checked={replaceExistingLanguage} onCheckedChange={setReplaceExistingLanguage} disabled={uploading} />
          </label>
          <label className="flex items-center justify-between rounded-lg border p-3 text-sm">
            <span>Set as default subtitle</span>
            <Switch checked={setAsDefaultSubtitle} onCheckedChange={setSetAsDefaultSubtitle} disabled={uploading} />
          </label>
          <label className="flex items-center justify-between rounded-lg border p-3 text-sm">
            <span>Use as AI knowledge source</span>
            <Switch checked={setAsPrimaryForAI} onCheckedChange={setSetAsPrimaryForAI} disabled={uploading} />
          </label>
        </div>

        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".vtt"
            onChange={handleFileSelect}
            className="hidden"
            id={`transcript-upload-${lessonId}`}
            disabled={uploading || !videoAssetId}
          />
          <Button
            variant="outline"
            className="w-full"
            disabled={uploading || !videoAssetId}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="mr-2 h-4 w-4" />
            Select VTT File
          </Button>
          {!videoAssetId && <p className="mt-2 text-sm text-muted-foreground">Please select a video asset first.</p>}
        </div>

        {inferredLanguageFromSelectedFile && (
          <Alert>
            <Languages className="h-4 w-4" />
            <AlertDescription>
              Language inferred from filename:{' '}
              <span className="font-medium">
                {getTranscriptLabel({ language: inferredLanguageFromSelectedFile, label: null })} ({inferredLanguageFromSelectedFile})
              </span>
              .{' '}
              Manual language selection is locked, and the server will enforce this value during upload.
            </AlertDescription>
          </Alert>
        )}

        {selectedFile && (
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="flex items-center gap-3">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{selectedFile.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(selectedFile.size / 1024).toFixed(2)} KB • {effectiveLanguageCode || 'No language selected'}
                </p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={resetFileSelection} disabled={uploading}>
              Remove
            </Button>
          </div>
        )}

        {uploading && (
          <div className="space-y-2">
            <Progress value={uploadProgress} />
            <p className="text-center text-sm text-muted-foreground">
              {uploadProgress < 35 && 'Preparing upload...'}
              {uploadProgress >= 35 && uploadProgress < 75 && 'Uploading subtitle track to S3...'}
              {uploadProgress >= 75 && 'Finalizing track and AI source...'}
            </p>
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert className="border-green-500 bg-green-50">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">{success}</AlertDescription>
          </Alert>
        )}

        {selectedFile && !uploading && (
          <Button onClick={handleUpload} disabled={!videoAssetId} className="w-full">
            Upload Subtitle Track
          </Button>
        )}

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Current Tracks</p>
            <Badge variant="outline">{tracks.length} total</Badge>
          </div>

          {tracks.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              No subtitle tracks uploaded yet.
            </div>
          ) : (
            <div className="space-y-3">
              {tracks.map((track) => {
                const busy = savingTrackId === track.id;
                return (
                  <div key={track.id} className="rounded-lg border p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium">{track.label}</p>
                          <Badge variant="outline">{track.language}</Badge>
                          {track.isDefaultSubtitle && <Badge>Default subtitle</Badge>}
                          {track.isPrimaryForAI && (
                            <Badge variant="secondary">
                              <Sparkles className="mr-1 h-3 w-3" />
                              AI source
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{track.filename}</p>
                        <p className="text-xs text-muted-foreground">
                          Uploaded {new Date(track.uploadedAt).toLocaleString()}
                          {track.processedAt ? ` • Processed ${new Date(track.processedAt).toLocaleString()}` : ''}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {!track.isDefaultSubtitle && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void updateTrack(track.id, { setAsDefaultSubtitle: true })}
                            disabled={busy}
                          >
                            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Set default'}
                          </Button>
                        )}
                        {!track.isPrimaryForAI && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void updateTrack(track.id, { setAsPrimaryForAI: true })}
                            disabled={busy}
                          >
                            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Use for AI'}
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => void deleteTrack(track.id)} disabled={busy}>
                          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-lg bg-muted p-3 text-sm">
          <p className="mb-1 font-medium">Track behavior</p>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>Different languages can coexist on the same video.</li>
            <li>Replacing a language archives only that language&apos;s current active track.</li>
            <li>Only one track is used as the lesson&apos;s AI knowledge source at a time.</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
