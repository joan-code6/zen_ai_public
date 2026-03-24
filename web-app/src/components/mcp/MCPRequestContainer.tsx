import React from 'react';
import { MCPQueuedRequest } from '@/services';
import { MCPRequest } from './MCPRequest';

export interface MCPRequestContainerProps {
  requests: MCPQueuedRequest[];
  onClear?: () => void;
}

const MCPRequestContainer: React.FC<MCPRequestContainerProps> = ({
  requests,
}) => {
  console.log('MCPRequestContainer rendered, requests:', requests.length);
  
  if (requests.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {requests.map((req) => (
        <MCPRequest
          key={req.id}
          request={req.request}
          response={req.response}
          isLoading={!req.response}
        />
      ))}
    </div>
  );
};

export default MCPRequestContainer;
