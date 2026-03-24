import React, { useState } from 'react';
import { MCPRequestEvent, MCPResponseEvent } from '@/types/mcp';
import LoadingSpinner from '@/components/LoadingSpinner';
import { ChevronRight, ChevronDown, CheckCircle2, XCircle } from 'lucide-react';

export interface MCPRequestProps {
  request: MCPRequestEvent;
  response?: MCPResponseEvent;
  isLoading?: boolean;
}

export const MCPRequest: React.FC<MCPRequestProps> = ({
  request,
  response,
  isLoading = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const formatToolName = (name: string): string => {
    return name
      .replace(/^functions\./, '')
      .replace(/_/g, ' ')
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const getStatusIcon = () => {
    if (isLoading) {
      return <LoadingSpinner size="xs" />;
    }
    if (response?.success) {
      return <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />;
    }
    if (response && !response.success) {
      return <XCircle className="w-3.5 h-3.5 text-red-600" />;
    }
    return null;
  };

  const renderValue = (value: unknown): React.ReactNode => {
    if (value === null || value === undefined) {
      return <span className="text-muted-foreground italic">null</span>;
    }
    if (typeof value === 'string') {
      return <span className="text-foreground">"{value}"</span>;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return <span className="text-blue-600">{String(value)}</span>;
    }
    if (Array.isArray(value)) {
      return (
        <span className="text-muted-foreground">
          [{value.length} items]
        </span>
      );
    }
    if (typeof value === 'object') {
      return (
        <pre className="text-xs bg-muted p-2 rounded mt-1 overflow-x-auto">
          {JSON.stringify(value, null, 2)}
        </pre>
      );
    }
    return String(value);
  };

  return (
    <div className="text-xs text-muted-foreground border border-border rounded-lg p-2 bg-card/50">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 w-full text-left hover:text-foreground transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />
        )}
        {getStatusIcon()}
        <span className="font-medium">{formatToolName(request.toolName)}</span>
        {isLoading && <span className="text-muted-foreground">running...</span>}
      </button>

      {isExpanded && (
        <div className="mt-2 pl-9 space-y-2 text-xs">
          {Object.keys(request.toolArgs).length > 0 && (
            <div>
              <div className="font-medium text-foreground mb-1">Arguments:</div>
              <div className="space-y-1">
                {Object.entries(request.toolArgs).map(([key, value]) => (
                  <div key={key} className="flex gap-2">
                    <span className="text-muted-foreground">{key}:</span>
                    {renderValue(value)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {response && (
            <div>
              <div className="font-medium text-foreground mb-1">
                {response.success ? 'Result:' : 'Error:'}
              </div>
              {response.success ? (
                renderValue(response.result)
              ) : (
                <div className="text-red-600">{response.error}</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
