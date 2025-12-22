'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, AlertCircle, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface Chunk {
  id: string;
  sequenceIndex: number;
  startTime: number;
  endTime: number;
  timestamp: string;
  text: string;
  tokenCount: number;
  metadata: any;
}

interface ChunkPreviewProps {
  lessonId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChunkPreview({ lessonId, open, onOpenChange }: ChunkPreviewProps) {
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const pageSize = 10;

  const fetchChunks = async (pageNum: number) => {
    try {
      setLoading(true);
      const response = await fetch(
        `/api/admin/lessons/${lessonId}/transcript/chunks?page=${pageNum}&pageSize=${pageSize}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch chunks');
      }

      const { data } = await response.json();
      setChunks(data.chunks);
      setTotalPages(data.pagination.totalPages);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load chunks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setPage(1);
      fetchChunks(1);
    }
  }, [open, lessonId]);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    fetchChunks(newPage);
  };

  const filteredChunks = chunks.filter(chunk =>
    searchQuery === '' ||
    chunk.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
    chunk.timestamp.includes(searchQuery)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Transcript Chunks</DialogTitle>
          <DialogDescription>
            View parsed transcript segments with timestamps and token counts
          </DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search chunks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : (
          <>
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-4">
                {filteredChunks.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-8">
                    {searchQuery ? 'No chunks match your search' : 'No chunks found'}
                  </p>
                ) : (
                  filteredChunks.map((chunk) => (
                    <div
                      key={chunk.id}
                      className="rounded-lg border p-4 space-y-2 hover:bg-muted/50 transition-colors"
                    >
                      {/* Header */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">#{chunk.sequenceIndex + 1}</Badge>
                          <Badge variant="secondary">{chunk.timestamp}</Badge>
                        </div>
                        <Badge className="bg-blue-500">
                          {chunk.tokenCount} tokens
                        </Badge>
                      </div>

                      {/* Text */}
                      <p className="text-sm leading-relaxed">
                        {chunk.text}
                      </p>

                      {/* Metadata */}
                      {chunk.metadata && (
                        <details className="text-xs">
                          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                            View metadata
                          </summary>
                          <pre className="mt-2 rounded bg-muted p-2 overflow-x-auto">
                            {JSON.stringify(chunk.metadata, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>

            {/* Pagination */}
            {!searchQuery && totalPages > 1 && (
              <div className="flex items-center justify-between border-t pt-4">
                <p className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(page - 1)}
                    disabled={page === 1 || loading}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(page + 1)}
                    disabled={page === totalPages || loading}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
