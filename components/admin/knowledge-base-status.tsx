'use client';

import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Database,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Trash2,
  Eye,
  Clock,
  FileText,
} from 'lucide-react';
import { ApiClient } from '@/lib/api-client';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

interface TranscriptStatus {
  transcriptAsset: {
    id: string;
    filename: string;
    language: string;
    uploadedAt: string;
  } | null;
  processing: {
    status: string;
    progress: number;
    totalChunks: number;
    processedChunks: number;
    error: string | null;
    processedAt: string | null;
    job: {
      id: string;
      state: string;
      stage: string;
      attempt: number;
      maxAttempts: number;
      scheduledAt: string;
      startedAt: string | null;
      finishedAt: string | null;
      lastHeartbeatAt: string | null;
      workerId: string | null;
    } | null;
  } | null;
  knowledgeBase: {
    isReady: boolean;
    chunkCount: number;
    tokenCount: number;
    lastUpdated: string | null;
  };
}

interface KnowledgeBaseStatusProps {
  lessonId: string;
  onViewChunks?: () => void;
  onDelete?: () => void;
}

const STATUS_CONFIG = {
  PENDING: { label: 'Pending', color: 'bg-gray-500', icon: Clock },
  VALIDATING: { label: 'Validating', color: 'bg-blue-500', icon: Loader2 },
  CHUNKING: { label: 'Chunking', color: 'bg-blue-500', icon: Loader2 },
  EMBEDDING: { label: 'Embedding', color: 'bg-blue-500', icon: Loader2 },
  INDEXING: { label: 'Indexing', color: 'bg-blue-500', icon: Loader2 },
  READY: { label: 'Ready', color: 'bg-green-500', icon: CheckCircle2 },
  FAILED: { label: 'Failed', color: 'bg-red-500', icon: AlertCircle },
  STALE: { label: 'Stale', color: 'bg-yellow-500', icon: AlertCircle },
};

export function KnowledgeBaseStatus({ lessonId, onViewChunks, onDelete }: KnowledgeBaseStatusProps) {
  const [status, setStatus] = useState<TranscriptStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logs, setLogs] = useState<Array<{
    id: string;
    level: string;
    stage: string | null;
    message: string;
    createdAt: string;
  }> | null>(null);
  const confirmActionRef = useRef<null | (() => void)>(null);
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    title: '',
    description: '',
    confirmLabel: 'Confirm',
    confirmVariant: 'default' as 'default' | 'destructive',
  });

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const response = await ApiClient.request(`/admin/lessons/${lessonId}/transcript`);

      const { data } = response as any;
      setStatus(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();

    // Auto-refresh while processing
    const interval = setInterval(() => {
      if (status?.processing?.status && !['READY', 'FAILED'].includes(status.processing.status)) {
        fetchStatus();
      }
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(interval);
  }, [lessonId, status?.processing?.status]);

  const handleReprocess = async () => {
    confirmActionRef.current = async () => {
      try {
        setReprocessing(true);
        await ApiClient.request(`/admin/lessons/${lessonId}/transcript/process`, {
          method: 'POST',
          body: JSON.stringify({ force: true }),
        });

        await fetchStatus();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to reprocess');
      } finally {
        setReprocessing(false);
      }
    };
    setConfirmDialog({
      open: true,
      title: 'Reprocess transcript?',
      description: 'This will regenerate all embeddings.',
      confirmLabel: 'Reprocess',
      confirmVariant: 'default',
    });
  };

  const handleDelete = async () => {
    confirmActionRef.current = async () => {
      try {
        setDeleting(true);
        await ApiClient.request(`/admin/lessons/${lessonId}/transcript`, {
          method: 'DELETE',
        });

        await fetchStatus();
        onDelete?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete');
      } finally {
        setDeleting(false);
      }
    };
    setConfirmDialog({
      open: true,
      title: 'Delete transcript?',
      description: 'This will delete the transcript and all associated embeddings.',
      confirmLabel: 'Delete',
      confirmVariant: 'destructive',
    });
  };

  const fetchLogs = async () => {
    try {
      setLogsLoading(true);
      const response = await ApiClient.request(`/admin/lessons/${lessonId}/transcript/events`);
      const { data } = response as any;
      setLogs((data?.events || []).map((e: any) => ({
        id: e.id,
        level: e.level,
        stage: e.stage,
        message: e.message,
        createdAt: e.createdAt,
      })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load logs');
    } finally {
      setLogsLoading(false);
    }
  };

  if (loading && !status) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!status?.transcriptAsset) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Knowledge Base Status
          </CardTitle>
          <CardDescription>
            No transcript uploaded yet
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Upload a VTT transcript to enable AI-powered Q&A with source citations.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const processingStatus = status.processing?.status || 'UNKNOWN';
  const statusConfig = STATUS_CONFIG[processingStatus as keyof typeof STATUS_CONFIG] || {
    label: processingStatus,
    color: 'bg-gray-500',
    icon: Clock,
  };
  const StatusIcon = statusConfig.icon;
  const job = status.processing?.job || null;
  const lastHeartbeatAgeSeconds = job?.lastHeartbeatAt
    ? Math.floor((Date.now() - new Date(job.lastHeartbeatAt).getTime()) / 1000)
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Knowledge Base Status
        </CardTitle>
        <CardDescription>
          RAG processing status and statistics
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Error Alert */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Transcript Info */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Transcript File</span>
            <span className="text-sm text-muted-foreground">
              {status.transcriptAsset.filename}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Language</span>
            <Badge variant="outline">{status.transcriptAsset.language.toUpperCase()}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Uploaded</span>
            <span className="text-sm text-muted-foreground">
              {new Date(status.transcriptAsset.uploadedAt).toLocaleDateString()}
            </span>
          </div>
        </div>

        <div className="border-t pt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Status</span>
            <Badge className={statusConfig.color}>
              <StatusIcon className={`mr-1 h-3 w-3 ${processingStatus !== 'READY' && processingStatus !== 'FAILED' ? 'animate-spin' : ''}`} />
              {statusConfig.label}
            </Badge>
          </div>

          {job && (
            <div className="space-y-1 text-xs text-muted-foreground">
              <div className="flex items-center justify-between">
                <span>Job</span>
                <span className="font-mono">{job.id}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>State</span>
                <span>{job.state}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Attempts</span>
                <span>
                  {job.attempt} / {job.maxAttempts}
                </span>
              </div>
              {job.lastHeartbeatAt && (
                <div className="flex items-center justify-between">
                  <span>Last heartbeat</span>
                  <span>{lastHeartbeatAgeSeconds !== null ? `${lastHeartbeatAgeSeconds}s ago` : '-'}</span>
                </div>
              )}
              {job.workerId && (
                <div className="flex items-center justify-between">
                  <span>Worker</span>
                  <span className="font-mono">{job.workerId}</span>
                </div>
              )}
            </div>
          )}

          {/* Progress Bar for Processing States */}
          {status.processing && !['READY', 'FAILED'].includes(processingStatus) && (
            <div className="space-y-2">
              <Progress value={status.processing.progress} />
              <p className="text-xs text-muted-foreground text-center">
                {status.processing.processedChunks > 0 &&
                  `${status.processing.processedChunks} / ${status.processing.totalChunks} chunks processed`}
              </p>
            </div>
          )}

          {/* Error Message */}
          {status.processing?.error && (
            <Alert variant="destructive" className="mt-2">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-sm">
                {status.processing.error}
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* Knowledge Base Stats */}
        {status.knowledgeBase.isReady && (
          <div className="rounded-lg bg-muted p-3 space-y-2">
            <p className="text-sm font-medium">Knowledge Base Statistics</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Chunks:</span>
                <span className="ml-2 font-medium">{status.knowledgeBase.chunkCount}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Tokens:</span>
                <span className="ml-2 font-medium">
                  {status.knowledgeBase.tokenCount.toLocaleString()}
                </span>
              </div>
            </div>
            {status.knowledgeBase.lastUpdated && (
              <p className="text-xs text-muted-foreground">
                Last updated: {new Date(status.knowledgeBase.lastUpdated).toLocaleString()}
              </p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchStatus}
            disabled={loading}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          {status.processing?.job && (
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                const next = !showLogs;
                setShowLogs(next);
                if (next && !logs) {
                  await fetchLogs();
                }
              }}
              disabled={logsLoading}
            >
              <FileText className={`mr-2 h-4 w-4 ${logsLoading ? 'animate-spin' : ''}`} />
              Logs
            </Button>
          )}

          {status.knowledgeBase.isReady && (
            <Button
              variant="outline"
              size="sm"
              onClick={onViewChunks}
            >
              <Eye className="mr-2 h-4 w-4" />
              View Chunks
            </Button>
          )}

          {processingStatus === 'FAILED' && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleReprocess}
              disabled={reprocessing}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${reprocessing ? 'animate-spin' : ''}`} />
              Retry
            </Button>
          )}

          <Button
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={deleting}
            className="ml-auto"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>

        {showLogs && (
          <div className="rounded-lg border p-3 text-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium">Recent Logs</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchLogs}
                disabled={logsLoading}
              >
                <RefreshCw className={`mr-2 h-3 w-3 ${logsLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
            {logsLoading && !logs && (
              <div className="text-muted-foreground">Loading...</div>
            )}
            {logs && logs.length === 0 && (
              <div className="text-muted-foreground">No events yet.</div>
            )}
            {logs && logs.length > 0 && (
              <div className="max-h-48 overflow-auto space-y-1">
                {logs.map(e => (
                  <div key={e.id} className="flex gap-2">
                    <span className="text-muted-foreground shrink-0">
                      {new Date(e.createdAt).toLocaleTimeString()}
                    </span>
                    <span className="shrink-0 uppercase text-muted-foreground">{e.level}</span>
                    <span className="shrink-0 text-muted-foreground">{e.stage || '-'}</span>
                    <span className="break-words">{e.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => {
          setConfirmDialog((prev) => ({ ...prev, open }));
          if (!open) confirmActionRef.current = null;
        }}
        title={confirmDialog.title}
        description={confirmDialog.description}
        confirmLabel={confirmDialog.confirmLabel}
        confirmVariant={confirmDialog.confirmVariant}
        onConfirm={() => {
          const action = confirmActionRef.current;
          setConfirmDialog((prev) => ({ ...prev, open: false }));
          confirmActionRef.current = null;
          if (action) action();
        }}
      />
    </Card>
  );
}
