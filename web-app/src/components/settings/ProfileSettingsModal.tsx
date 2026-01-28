import React from "react";

interface ProfileSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ProfileSettingsModal({ isOpen, onClose }: ProfileSettingsModalProps) {
  const [name, setName] = React.useState("Benne");
  const [email, setEmail] = React.useState("bennet@example.com");

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-popover border border-border rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b border-border/50">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Profile Settings</h2>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div className="flex flex-col items-center gap-4">
            <div className="relative group">
              <div className="h-24 w-24 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-3xl font-medium text-primary-foreground shadow-lg ring-4 ring-primary/20">
                B
              </div>
              <button className="absolute bottom-0 right-0 h-8 w-8 rounded-full bg-foreground text-background flex items-center justify-center shadow-lg ring-2 ring-background hover:scale-110 transition-transform">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <polyline points="16 5 12 9 8 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Display Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3 border border-border rounded-xl bg-input focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-border rounded-xl bg-input focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-border/50">
            <h3 className="text-sm font-semibold mb-3 text-muted-foreground">Account</h3>
            <div className="space-y-2">
              <button className="w-full px-4 py-3 text-left text-sm text-foreground hover:bg-muted/50 flex items-center gap-3 transition-colors rounded-xl">
                <svg className="w-4 h-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" stroke="currentColor" strokeWidth="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="currentColor" strokeWidth="2"/>
                </svg>
                Change Password
              </button>
              <button className="w-full px-4 py-3 text-left text-sm text-foreground hover:bg-muted/50 flex items-center gap-3 transition-colors rounded-xl">
                <svg className="w-4 h-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <polyline points="7 10 12 15 17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Enable Two-Factor Authentication
              </button>
              <button className="w-full px-4 py-3 text-left text-sm text-foreground hover:bg-muted/50 flex items-center gap-3 transition-colors rounded-xl">
                <svg className="w-4 h-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <polyline points="10 17 15 17 15 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Linked Accounts
              </button>
              <button className="w-full px-4 py-3 text-left text-sm text-destructive hover:bg-destructive/10 flex items-center gap-3 transition-colors rounded-xl">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Delete Account
              </button>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-border/50 flex justify-end gap-3 bg-muted/20">
          <button onClick={onClose} className="px-6 py-2.5 text-foreground hover:bg-muted/50 rounded-xl transition-colors">
            Cancel
          </button>
          <button className="px-6 py-2.5 bg-foreground text-background rounded-xl hover:brightness-95 transition-colors font-medium">
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
