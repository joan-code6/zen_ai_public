import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  ArrowLeft, 
  Settings, 
  Link, 
  Link2Off,
  Zap,
  Activity,
  CheckCircle,
  XCircle,
  Clock,
  Terminal,
  Send
} from 'lucide-react';

interface McpOption {
  id: string;
  label: string;
  transport: 'websocket' | 'stdio';
  endpoint?: string;
  command?: string[];
  tools: string[];
  status?: 'connected' | 'disconnected' | 'connecting' | 'error';
}

interface McpMessage {
  id: string;
  type: 'request' | 'response' | 'notification';
  method?: string;
  params?: any;
  result?: any;
  error?: any;
  timestamp: string;
}

export default function McpView() {
  const { user } = useAuth();
  const [options, setOptions] = useState<McpOption[]>([]);
  const [selectedOption, setSelectedOption] = useState<McpOption | null>(null);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<McpMessage[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [customEndpoint, setCustomEndpoint] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    loadMcpOptions();
  }, []);

  const loadMcpOptions = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/mcp/options');
      const data = await response.json();
      
      if (data.options) {
        const optionsWithStatus = data.options.map((option: McpOption) => ({
          ...option,
          status: 'disconnected'
        }));
        setOptions(optionsWithStatus);
      }
    } catch (error) {
      console.error('Failed to load MCP options:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async (option: McpOption) => {
    try {
      setIsConnecting(true);
      setConnectionStatus('connecting');
      
      if (option.transport === 'websocket') {
        // Connect via WebSocket
        const ws = new WebSocket(option.endpoint!);
        
        ws.onopen = () => {
          setConnectionStatus('connected');
          setSelectedOption(option);
          setOptions(prev => prev.map(opt => 
            opt.id === option.id ? { ...opt, status: 'connected' } : opt
          ));
        };
        
        ws.onmessage = (event) => {
          try {
            const parsed = JSON.parse(event.data);
            const incoming: McpMessage = {
              id: parsed.id || Date.now().toString(),
              type: (parsed.type as any) === 'response' ? 'response' : (parsed.type as any) === 'notification' ? 'notification' : 'request',
              method: parsed.method,
              params: parsed.params,
              result: parsed.result,
              error: parsed.error,
              timestamp: parsed.timestamp || new Date().toISOString()
            };
            setMessages(prev => [...prev, incoming]);
          } catch (error) {
            console.error('Failed to parse MCP message:', error);
          }
        };
        
        ws.onclose = () => {
          setConnectionStatus('disconnected');
          setOptions(prev => prev.map(opt => 
            opt.id === option.id ? { ...opt, status: 'disconnected' } : opt
          ));
        };
        
        ws.onerror = (error) => {
          setConnectionStatus('error');
          console.error('WebSocket error:', error);
        };
        
      } else if (option.transport === 'stdio') {
        // Connect via stdio (for desktop apps)
        console.log('STDIO connection requested for:', option.command);
        setConnectionStatus('connected');
        setSelectedOption(option);
        setOptions(prev => prev.map(opt => 
          opt.id === option.id ? { ...opt, status: 'connected' } : opt
        ));
      }
    } catch (error) {
      setConnectionStatus('error');
      console.error('Failed to connect to MCP:', error);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async (option: McpOption) => {
    try {
      // Send disconnect command
      const response = await fetch('/api/mcp/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optionId: option.id })
      });
      
      if (response.ok) {
        setConnectionStatus('disconnected');
        setSelectedOption(null);
        setMessages([]);
        setOptions(prev => prev.map(opt => 
          opt.id === option.id ? { ...opt, status: 'disconnected' } : opt
        ));
      }
    } catch (error) {
      console.error('Failed to disconnect MCP:', error);
    }
  };

  const sendMessage = async (message: any) => {
    if (!selectedOption) return;

    try {
      const messagePayload: McpMessage = {
        id: Date.now().toString(),
        type: 'request',
        method: message.method,
        params: message.params,
        timestamp: new Date().toISOString()
      };

      setMessages(prev => [...prev, messagePayload]);

      // Send via appropriate transport
      if (selectedOption.transport === 'websocket') {
        const ws = new WebSocket(selectedOption.endpoint!);
        ws.onopen = () => {
          ws.send(JSON.stringify(messagePayload));
          ws.close();
        };
      } else {
        console.log('STDIO message:', messagePayload);
      }
    } catch (error) {
      console.error('Failed to send MCP message:', error);
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'connected': return 'text-green-600 bg-green-100';
      case 'connecting': return 'text-yellow-600 bg-yellow-100';
      case 'error': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading MCP options...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex">
      {/* Sidebar */}
      <div className="w-80 border-r border-border bg-card/50">
        <div className="p-6 border-b border-border">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Terminal className="w-6 h-6 text-primary" />
              <h2 className="text-2xl font-bold text-foreground">MCP</h2>
            </div>
            
            <Button variant="outline" size="sm">
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </Button>
          </div>

          <p className="text-sm text-muted-foreground mb-4">
            Model Context Protocol integration for advanced AI tooling
          </p>
        </div>

        {/* Connection Options */}
        <div className="p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Available Connections</h3>
          
          <div className="space-y-2">
            {options.map((option) => (
              <Card 
                key={option.id} 
                className="p-3 cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => option.status !== 'connected' && handleConnect(option)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <div className="font-medium text-sm">{option.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {option.transport.toUpperCase()} • {option.tools.length} tools
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant="outline" 
                      className={`text-xs ${getStatusColor(option.status)}`}
                    >
                      {option.status || 'disconnected'}
                    </Badge>
                    
                    {option.status === 'connected' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDisconnect(option);
                        }}
                        className="text-destructive hover:text-destructive p-1"
                      >
                        <Link2Off className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Custom Endpoint */}
          <Card className="p-3 mt-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Custom Endpoint</h3>
            
            <div className="space-y-3">
              <input
                type="text"
                value={customEndpoint}
                onChange={(e) => setCustomEndpoint(e.target.value)}
                placeholder="ws://localhost:8765"
                className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm"
              />
              
              <Button
                onClick={() => {
                  if (customEndpoint.trim()) {
                    handleConnect({
                      id: 'custom',
                      label: 'Custom Endpoint',
                      transport: 'websocket',
                      endpoint: customEndpoint,
                      tools: ['custom_tools'],
                      status: 'disconnected'
                    });
                  }
                }}
                disabled={!customEndpoint.trim() || isConnecting}
                className="w-full"
              >
                {isConnecting ? 'Connecting...' : 'Connect'}
              </Button>
            </div>
          </Card>
        </div>

        {/* Connection Status */}
        {connectionStatus !== 'disconnected' && (
          <div className="p-4 border-t border-border">
            <h3 className="text-sm font-semibold text-foreground mb-3">Connection Status</h3>
            
            <Card className="p-3">
              <div className="flex items-center gap-3">
                <Activity className={`w-4 h-4 ${getStatusColor(connectionStatus)}`} />
                <div>
                  <div className="font-medium text-sm capitalize">{connectionStatus}</div>
                  {selectedOption && (
                    <div className="text-xs text-muted-foreground">
                      Connected to {selectedOption.label}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="border-b border-border bg-card/50 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Terminal className="w-5 h-5" />
              <h2 className="text-lg font-semibold text-foreground">
                {selectedOption ? selectedOption.label : 'No Connection'}
              </h2>
            </div>
            
            {selectedOption && (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="gap-1">
                  {selectedOption.transport.toUpperCase()}
                </Badge>
                <Badge variant="secondary" className="gap-1">
                  <Activity className="w-3 h-3" />
                  {connectionStatus}
                </Badge>
              </div>
            )}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-auto">
          {!selectedOption ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center max-w-md">
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                  <Terminal className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">Select a Connection</h3>
                <p className="text-muted-foreground mb-6">
                  Choose an MCP connection from the sidebar to start using advanced AI tools and model context.
                </p>
                
                <div className="text-left space-y-4">
                  <div>
                    <h4 className="font-semibold text-foreground mb-2">Available Tools:</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      {options.flatMap(opt => opt.tools).map((tool, index) => (
                        <li key={index} className="flex items-center gap-2">
                          <CheckCircle className="w-3 h-3 text-green-500" />
                          <code className="bg-muted/50 px-2 py-1 rounded">{tool}</code>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex">
              {/* Message Interface */}
              <div className="flex-1 flex flex-col">
                {/* Messages */}
                <div className="flex-1 overflow-auto p-4">
                  <div className="space-y-3">
                    {messages.map((message, index) => (
                      <div key={message.id} className="flex gap-3">
                        <div className="w-2 h-2 rounded-full bg-muted-foreground flex-shrink-0 mt-2"></div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs text-muted-foreground">
                              {formatTimestamp(message.timestamp)}
                            </span>
                            
                            <Badge
                              variant={message.type === 'request' ? 'default' : 'secondary'}
                              className="text-xs"
                            >
                              {message.type}
                            </Badge>
                          </div>
                          
                          {message.method && (
                            <div className="font-mono text-sm bg-muted/30 p-2 rounded">
                              {message.method}
                            </div>
                          )}
                          
                          {message.params && (
                            <pre className="text-sm bg-blue-50/50 border border-blue-200 p-3 rounded overflow-auto">
                              {JSON.stringify(message.params, null, 2)}
                            </pre>
                          )}
                          
                          {message.result && (
                            <pre className="text-sm bg-green-50/50 border border-green-200 p-3 rounded overflow-auto">
                              {JSON.stringify(message.result, null, 2)}
                            </pre>
                          )}
                          
                          {message.error && (
                            <pre className="text-sm bg-red-50/50 border border-red-200 p-3 rounded overflow-auto text-red-700">
                              {JSON.stringify(message.error, null, 2)}
                            </pre>
                          )}
                        </div>
                      </div>
                    ))}
                    
                    {messages.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        <Terminal className="w-8 h-8 mx-auto mb-4 opacity-50" />
                        <p>Ready to send commands</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Input */}
                <div className="border-t border-border p-4">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Enter command or method name..."
                      className="flex-1 px-3 py-2 border border-border rounded-lg bg-background text-sm"
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          const command = e.currentTarget.value.trim();
                          if (command) {
                            try {
                              const parsed = JSON.parse(command.startsWith('{') ? command : `{}`);
                              sendMessage(parsed);
                              e.currentTarget.value = '';
                            } catch (error) {
                              // Send as method name
                              sendMessage({
                                method: command,
                                params: {}
                              });
                              e.currentTarget.value = '';
                            }
                          }
                        }
                      }}
                    />
                    <Button
                      onClick={() => {
                        const input = document.querySelector('input[type="text"]') as HTMLInputElement;
                        const command = input.value.trim();
                        if (command) {
                          try {
                            const parsed = JSON.parse(command.startsWith('{') ? command : `{}`);
                            sendMessage(parsed);
                            input.value = '';
                          } catch (error) {
                            sendMessage({
                              method: command,
                              params: {}
                            });
                            input.value = '';
                          }
                        }
                      }}
                      className="gap-2"
                    >
                      <Send className="w-4 h-4" />
                      Send
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}