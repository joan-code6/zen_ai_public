import React from 'react';
import { Badge } from '@/components/ui/badge';
import { MessageMetadata } from '@/services/chatService';
import { formatMilliseconds, formatTokens } from '@/utils/metricsTracker';

export interface MessageMetadataDisplayProps {
  metadata?: MessageMetadata;
  compact?: boolean;
}

/**
 * Component to display message generation metadata
 * Shows model, tokens, cost, time-to-first-token, and tokens per second
 */
export const MessageMetadataDisplay: React.FC<MessageMetadataDisplayProps> = ({
  metadata,
  compact = false,
}) => {
  if (!metadata) {
    return null;
  }

  const { model, totalTokens, totalCost, timeToFirstToken, tokensPerSecond } = metadata;

  // Only show if we have at least some meaningful data
  const hasData = model || (totalTokens && totalTokens > 0) || (totalCost && totalCost > 0);
  if (!hasData) {
    return null;
  }

  return (
    <div
      className={`flex flex-wrap items-center gap-2 ${
        compact ? 'text-xs' : 'text-sm'
      } text-gray-600`}
    >
      {/* Model */}
      {model && (
        <Badge
          variant="outline"
          className={compact ? 'text-xs' : 'text-sm'}
        >
          {model}
        </Badge>
      )}

      {/* Tokens */}
      {totalTokens && totalTokens > 0 && (
        <Badge
          variant="secondary"
          className={compact ? 'text-xs' : 'text-sm'}
        >
          {formatTokens(totalTokens)}
        </Badge>
      )}

      {/* Tokens per Second */}
      {tokensPerSecond && tokensPerSecond > 0 && (
        <Badge
          variant="secondary"
          className={compact ? 'text-xs' : 'text-sm'}
        >
          {tokensPerSecond.toFixed(1)} tok/s
        </Badge>
      )}

      {/* Time to First Token */}
      {timeToFirstToken !== undefined && timeToFirstToken > 0 && (
        <Badge
          variant="secondary"
          className={compact ? 'text-xs' : 'text-sm'}
          title="Time to First Token"
        >
          TTFT: {formatMilliseconds(timeToFirstToken)}
        </Badge>
      )}

      {/* Cost */}
      {totalCost && totalCost > 0 && (
        <Badge
          variant="secondary"
          className={compact ? 'text-xs' : 'text-sm'}
        >
          ${totalCost.toFixed(4)}
        </Badge>
      )}
    </div>
  );
};

export default MessageMetadataDisplay;

