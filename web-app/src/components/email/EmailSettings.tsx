import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import EmailService from '@/services/emailService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, Link, Link2Off, Plus, Settings, Check, X } from 'lucide-react';

interface EmailSettingsProps {
  onBack: () => void;
  onAccountsChanged: () => void;
}

export default function EmailSettings({ onBack, onAccountsChanged }: EmailSettingsProps) {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [showImapForm, setShowImapForm] = useState(false);
  const [showSmtpForm, setShowSmtpForm] = useState(false);

  // IMAP Form State
  const [imapConfig, setImapConfig] = useState({
    host: '',
    port: 993,
    useSsl: true,
    email: '',
    password: ''
  });

  // SMTP Form State
  const [smtpConfig, setSmtpConfig] = useState({
    host: '',
    port: 587,
    useTls: true,
    email: '',
    password: ''
  });

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      setLoading(true);
      const userAccounts = await EmailService.getAccounts();
      setAccounts(userAccounts);
    } catch (error) {
      console.error('Failed to load accounts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConnectGmail = async () => {
    if (!user) return;

    try {
      setConnecting('gmail');
      const redirectUri = `${window.location.origin}/email-callback`;
      const authUrl = await EmailService.getGmailAuthUrl(redirectUri);
      
      // Use redirect so the OAuth callback handler can finish linking
      window.location.href = authUrl.authorizationUrl;
    } catch (error) {
      console.error('Failed to connect Gmail:', error);
    } finally {
      setConnecting(null);
    }
  };

  const handleDisconnect = async (provider: string) => {
    try {
      if (provider === 'gmail') {
        await EmailService.deleteGmailConnection();
      } else if (provider === 'imap') {
        await EmailService.deleteImapConnection();
      } else if (provider === 'smtp') {
        await EmailService.deleteSmtpConnection();
      }
      await loadAccounts();
      onAccountsChanged();
    } catch (error) {
      console.error(`Failed to disconnect ${provider}:`, error);
    }
  };

  const handleConnectImap = async () => {
    try {
      setConnecting('imap');
      await EmailService.connectImap(imapConfig);
      setShowImapForm(false);
      setImapConfig({
        host: '',
        port: 993,
        useSsl: true,
        email: '',
        password: ''
      });
      await loadAccounts();
      onAccountsChanged();
    } catch (error) {
      console.error('Failed to connect IMAP:', error);
    } finally {
      setConnecting(null);
    }
  };

  const handleConnectSmtp = async () => {
    try {
      setConnecting('smtp');
      await EmailService.connectSmtp(smtpConfig);
      setShowSmtpForm(false);
      setSmtpConfig({
        host: '',
        port: 587,
        useTls: true,
        email: '',
        password: ''
      });
      await loadAccounts();
      onAccountsChanged();
    } catch (error) {
      console.error('Failed to connect SMTP:', error);
    } finally {
      setConnecting(null);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-border bg-card/50 p-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <h2 className="text-lg font-semibold text-foreground">Email Settings</h2>
        </div>
      </div>

      {/* Settings Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Connected Accounts */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4">Connected Accounts</h3>
            
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
              </div>
            ) : accounts.filter(acc => acc.connected).length === 0 ? (
              <div className="text-center py-8">
                <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                  <Settings className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground">No email accounts connected yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {accounts.filter(acc => acc.connected).map((account) => (
                  <div key={account.provider} className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                      <div>
                        <div className="font-medium text-foreground">
                          {account.provider.charAt(0).toUpperCase() + account.provider.slice(1)}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {account.email || 'Connected'}
                          {account.expiresAt && (
                            <span className="ml-2">
                              (Expires: {new Date(account.expiresAt).toLocaleDateString()})
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {account.hasRefreshToken && (
                        <Badge variant="outline" className="text-xs">
                          Auto-refresh enabled
                        </Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDisconnect(account.provider)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Link2Off className="w-4 h-4 mr-2" />
                        Disconnect
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Add New Account */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4">Add Email Account</h3>
            
            <div className="space-y-3">
              <Button
                onClick={handleConnectGmail}
                disabled={connecting !== null}
                className="w-full justify-start gap-3"
                variant="outline"
              >
                <div className="w-5 h-5 bg-red-500 rounded"></div>
                Gmail
                {connecting === 'gmail' && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary ml-auto"></div>}
              </Button>

              <Separator />

              <Button
                onClick={() => setShowImapForm(true)}
                disabled={connecting !== null}
                className="w-full justify-start gap-3"
                variant="outline"
              >
                <div className="w-5 h-5 bg-blue-500 rounded"></div>
                IMAP (Incoming Mail)
              </Button>

              <Button
                onClick={() => setShowSmtpForm(true)}
                disabled={connecting !== null}
                className="w-full justify-start gap-3"
                variant="outline"
              >
                <div className="w-5 h-5 bg-green-500 rounded"></div>
                SMTP (Outgoing Mail)
              </Button>
            </div>
          </Card>

          {/* IMAP Configuration Form */}
          {showImapForm && (
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-foreground">IMAP Configuration</h3>
                <Button variant="ghost" size="sm" onClick={() => setShowImapForm(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="imap-host">IMAP Server</Label>
                  <Input
                    id="imap-host"
                    value={imapConfig.host}
                    onChange={(e) => setImapConfig(prev => ({ ...prev, host: e.target.value }))}
                    placeholder="imap.example.com"
                  />
                </div>

                <div>
                  <Label htmlFor="imap-port">Port</Label>
                  <Input
                    id="imap-port"
                    type="number"
                    value={imapConfig.port}
                    onChange={(e) => setImapConfig(prev => ({ ...prev, port: parseInt(e.target.value) }))}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="imap-ssl"
                    checked={imapConfig.useSsl}
                    onChange={(e) => setImapConfig(prev => ({ ...prev, useSsl: e.target.checked }))}
                  />
                  <Label htmlFor="imap-ssl">Use SSL/TLS</Label>
                </div>

                <div>
                  <Label htmlFor="imap-email">Email</Label>
                  <Input
                    id="imap-email"
                    type="email"
                    value={imapConfig.email}
                    onChange={(e) => setImapConfig(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="your@example.com"
                  />
                </div>

                <div>
                  <Label htmlFor="imap-password">Password</Label>
                  <Input
                    id="imap-password"
                    type="password"
                    value={imapConfig.password}
                    onChange={(e) => setImapConfig(prev => ({ ...prev, password: e.target.value }))}
                    placeholder="Your password"
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={handleConnectImap}
                    disabled={connecting !== null || !imapConfig.host || !imapConfig.email || !imapConfig.password}
                    className="flex-1"
                  >
                    {connecting === 'imap' ? 'Connecting...' : 'Connect'}
                  </Button>
                  <Button variant="outline" onClick={() => setShowImapForm(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* SMTP Configuration Form */}
          {showSmtpForm && (
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-foreground">SMTP Configuration</h3>
                <Button variant="ghost" size="sm" onClick={() => setShowSmtpForm(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="smtp-host">SMTP Server</Label>
                  <Input
                    id="smtp-host"
                    value={smtpConfig.host}
                    onChange={(e) => setSmtpConfig(prev => ({ ...prev, host: e.target.value }))}
                    placeholder="smtp.example.com"
                  />
                </div>

                <div>
                  <Label htmlFor="smtp-port">Port</Label>
                  <Input
                    id="smtp-port"
                    type="number"
                    value={smtpConfig.port}
                    onChange={(e) => setSmtpConfig(prev => ({ ...prev, port: parseInt(e.target.value) }))}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="smtp-tls"
                    checked={smtpConfig.useTls}
                    onChange={(e) => setSmtpConfig(prev => ({ ...prev, useTls: e.target.checked }))}
                  />
                  <Label htmlFor="smtp-tls">Use STARTTLS</Label>
                </div>

                <div>
                  <Label htmlFor="smtp-email">Email</Label>
                  <Input
                    id="smtp-email"
                    type="email"
                    value={smtpConfig.email}
                    onChange={(e) => setSmtpConfig(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="your@example.com"
                  />
                </div>

                <div>
                  <Label htmlFor="smtp-password">Password</Label>
                  <Input
                    id="smtp-password"
                    type="password"
                    value={smtpConfig.password}
                    onChange={(e) => setSmtpConfig(prev => ({ ...prev, password: e.target.value }))}
                    placeholder="Your password"
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={handleConnectSmtp}
                    disabled={connecting !== null || !smtpConfig.host || !smtpConfig.email || !smtpConfig.password}
                    className="flex-1"
                  >
                    {connecting === 'smtp' ? 'Connecting...' : 'Connect'}
                  </Button>
                  <Button variant="outline" onClick={() => setShowSmtpForm(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* Instructions */}
          <Card className="p-6 bg-muted/30">
            <h3 className="text-lg font-semibold text-foreground mb-4">Email Provider Settings</h3>
            <div className="space-y-4 text-sm">
              <div>
                <h4 className="font-medium text-foreground mb-2">Gmail</h4>
                <p className="text-muted-foreground">
                  Click the Gmail button to authenticate via OAuth. No manual configuration needed.
                </p>
              </div>
              
              <div>
                <h4 className="font-medium text-foreground mb-2">IMAP (Common Settings)</h4>
                <ul className="text-muted-foreground space-y-1 ml-4">
                  <li>• Gmail: imap.gmail.com:993 (SSL)</li>
                  <li>• Outlook: outlook.office365.com:993 (SSL)</li>
                  <li>• Yahoo: imap.mail.yahoo.com:993 (SSL)</li>
                </ul>
              </div>
              
              <div>
                <h4 className="font-medium text-foreground mb-2">SMTP (Common Settings)</h4>
                <ul className="text-muted-foreground space-y-1 ml-4">
                  <li>• Gmail: smtp.gmail.com:587 (STARTTLS)</li>
                  <li>• Outlook: smtp.office365.com:587 (STARTTLS)</li>
                  <li>• Yahoo: smtp.mail.yahoo.com:587 (STARTTLS)</li>
                </ul>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}