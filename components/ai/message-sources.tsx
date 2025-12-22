'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ExternalLink, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

export interface MessageSource {
  chunkId: string;
  chapterTitle: string;
  lessonTitle: string;
  timestamp: string;
  snippet: string;
  relevanceScore: number;
}

interface MessageSourcesProps {
  sources: MessageSource[];
  onTimestampClick?: (timestamp: string) => void;
}

export function MessageSources({ sources, onTimestampClick }: MessageSourcesProps) {
  const [expanded, setExpanded] = useState(false);

  if (!sources || sources.length === 0) {
    return null;
  }

  return (
    <div className="mt-2 space-y-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs w-full justify-between"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className="flex items-center gap-2">
          <FileText className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">
            Sources ({sources.length})
          </span>
        </span>
        {expanded ? (
          <ChevronUp className="h-3 w-3 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        )}
      </Button>

      {expanded && (
        <div className="space-y-1.5">
          {sources.map((source) => (
            <Card
              key={source.chunkId}
              className="p-2 bg-muted/50 border-muted hover:bg-muted/70 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium text-foreground">
                      {source.chapterTitle} › {source.lessonTitle}
                    </span>
                    <Badge
                      variant="secondary"
                      className="text-xs px-1.5 py-0 h-4 cursor-pointer hover:bg-primary hover:text-primary-foreground"
                      onClick={() => onTimestampClick?.(source.timestamp)}
                    >
                      {source.timestamp}
                    </Badge>
                  </div>

                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {source.snippet}
                  </p>

                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">Relevance:</span>
                    <div className="flex-1 max-w-[100px] bg-muted rounded-full h-1.5">
                      <div
                        className="bg-primary h-1.5 rounded-full transition-all"
                        style={{ width: `${source.relevanceScore * 100}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium text-muted-foreground">
                      {Math.round(source.relevanceScore * 100)}%
                    </span>
                  </div>
                </div>

                {onTimestampClick && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs flex-shrink-0"
                    onClick={() => onTimestampClick(source.timestamp)}
                    title="Jump to this timestamp in video"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
