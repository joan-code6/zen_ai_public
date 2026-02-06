import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useApp } from "@/contexts/AppContext";
import { useTypedTranslation } from "@/hooks/useTranslation";
import UserService, { type User } from "@/services/userService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Camera, Trash2, Mail, Lock, RefreshCw, Copy, Check, LogOut, Shield, Calendar, Zap, Globe } from "lucide-react";

interface ProfileSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ProfileSettingsModal({ isOpen, onClose }: ProfileSettingsModalProps) {
  const { user, logout } = useAuth();
  const { actions } = useApp();
  const { t, changeLanguage, currentLanguage } = useTypedTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [profile, setProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  
  const [formData, setFormData] = useState({
    displayName: '',
    photoUrl: '',
    preferredLanguage: 'auto' as 'auto' | 'en' | 'de'
  });

  useEffect(() => {
    if (user && isOpen) {
      loadUserProfile();
    }
  }, [user, isOpen]);

  const loadUserProfile = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const userProfile = await UserService.getUser(user.uid);
      setProfile(userProfile);
      setFormData({
        displayName: userProfile.displayName || '',
        photoUrl: userProfile.photoUrl || '',
        preferredLanguage: (userProfile as any).preferredLanguage || 'auto'
      });
      
      if ((userProfile as any).preferredLanguage && (userProfile as any).preferredLanguage !== 'auto') {
        await changeLanguage((userProfile as any).preferredLanguage);
      }
    } catch (error) {
      console.error('Failed to load user profile:', error);
      actions.addToast(t('common.error') + ': Failed to load profile', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;

    try {
      setSaving(true);
      const updatedProfile = await UserService.updateUser(user.uid, {
        displayName: formData.displayName || undefined,
        photoUrl: formData.photoUrl || undefined,
        preferredLanguage: formData.preferredLanguage
      });
      
      setProfile(updatedProfile);
      actions.addToast(t('settings.accountSettings') + ' ' + t('common.success'), 'success');
      onClose();
    } catch (error) {
      console.error('Failed to save profile:', error);
      actions.addToast('Failed to update profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (file.size > 5 * 1024 * 1024) {
      actions.addToast('Photo must be smaller than 5MB', 'error');
      return;
    }

    try {
      setUploadingPhoto(true);
      const photoUrl = await UserService.uploadProfilePicture(user.uid, file);
      setFormData(prev => ({ ...prev, photoUrl }));
      actions.addToast('Photo uploaded successfully', 'success');
    } catch (error) {
      console.error('Failed to upload photo:', error);
      actions.addToast('Failed to upload photo', 'error');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleRemovePhoto = () => {
    setFormData(prev => ({ ...prev, photoUrl: '' }));
  };

  const handleCopyId = () => {
    if (profile?.uid) {
      navigator.clipboard.writeText(profile.uid);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  const handlePasswordReset = async () => {
    if (user?.email) {
      try {
        await UserService.changePassword(user.email);
        actions.addToast('Password reset email sent', 'success');
      } catch (error) {
        actions.addToast('Failed to send password reset email', 'error');
      }
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString([], {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-popover border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden animate-in zoom-in-95 duration-200 relative" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-lg hover:bg-muted/50 transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex flex-col h-[600px]">
          <div className="p-6 border-b border-border/50">
            <h2 className="text-xl font-semibold font-display">{t('settings.settings')}</h2>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <RefreshCw className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="p-6 space-y-6">
                <div className="flex flex-col items-center gap-4">
                  <div className="relative">
                    {formData.photoUrl || profile?.photoUrl ? (
                      <img
                        src={formData.photoUrl || profile?.photoUrl}
                        alt={profile?.displayName || profile?.email}
                        className="w-28 h-28 rounded-full object-cover shadow-xl ring-4 ring-primary/20"
                      />
                    ) : (
                      <div className="w-28 h-28 rounded-full bg-gradient-to-br from-primary to-primary/60 text-primary-foreground flex items-center justify-center text-4xl font-bold shadow-xl ring-4 ring-primary/20">
                        {(profile?.displayName || profile?.email || 'U').charAt(0).toUpperCase()}
                      </div>
                    )}
                    
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute bottom-2 right-2 h-10 w-10 bg-foreground text-background rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform border-4 border-background"
                    >
                      {uploadingPhoto ? (
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-background"></div>
                      ) : (
                        <Camera className="w-5 h-5" />
                      )}
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      className="hidden"
                    />
                  </div>
                  
                  <div className="text-center">
                    <div className="text-lg font-semibold font-display">
                      {profile?.displayName || 'User'}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {profile?.email}
                    </div>
                  </div>
                </div>

                 <div className="space-y-4">
                   <div>
                     <label className="block text-sm font-semibold mb-2">{t('settings.displayName')}</label>
                     <Input
                       value={formData.displayName}
                       onChange={(e) => setFormData(prev => ({ ...prev, displayName: e.target.value }))}
                       placeholder={t('settings.displayName')}
                       maxLength={50}
                       className="h-11 text-base"
                     />
                   </div>

                   <div>
                     <label className="block text-sm font-semibold mb-2">{t('settings.language')}</label>
                     <div className="relative">
                       <Globe className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                       <select
                         value={formData.preferredLanguage}
                         onChange={(e) => setFormData(prev => ({ ...prev, preferredLanguage: e.target.value as any }))}
                         className="w-full pl-10 pr-4 py-3 border-2 border-border rounded-xl bg-input text-foreground font-medium focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/20 transition-all h-11"
                       >
                         <option value="auto">{t('settings.auto')}</option>
                         <option value="en">{t('settings.english')}</option>
                         <option value="de">{t('settings.german')}</option>
                       </select>
                     </div>
                   </div>

                   <div>
                     <label className="block text-sm font-semibold mb-2">{t('settings.photoUrl', 'Photo URL')}</label>
                     <div className="flex gap-2">
                       <Input
                         value={formData.photoUrl}
                         onChange={(e) => setFormData(prev => ({ ...prev, photoUrl: e.target.value }))}
                         placeholder="Enter photo URL"
                         className="flex-1 h-11 text-base"
                       />
                       {formData.photoUrl && (
                         <Button
                           variant="outline"
                           size="icon"
                           onClick={handleRemovePhoto}
                           className="h-11 w-11"
                         >
                           <Trash2 className="w-4 h-4" />
                         </Button>
                       )}
                     </div>
                   </div>
                 </div>

                 <div className="border-t border-border/50 pt-6">
                   <h3 className="text-sm font-semibold mb-4 text-muted-foreground uppercase tracking-wider">{t('settings.accountSettings')}</h3>
                   
                   <div className="space-y-4">
                     <div>
                       <label className="block text-sm font-medium mb-2">User ID</label>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 bg-muted/50 p-3 rounded-lg text-sm font-mono border break-all">
                          {profile?.uid}
                        </code>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={handleCopyId}
                          className="h-10 w-10"
                        >
                          {copiedId ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        </Button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">Email Address</label>
                      <div className="p-3 bg-muted/50 rounded-lg text-sm border font-medium">
                        {profile?.email}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">Account Created</label>
                        <div className="p-3 bg-muted/50 rounded-lg text-sm border font-medium">
                          {profile ? formatDate(profile.createdAt) : 'Loading...'}
                        </div>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium mb-2">Last Updated</label>
                        <div className="p-3 bg-muted/50 rounded-lg text-sm border font-medium">
                          {profile ? formatDate(profile.updatedAt) : 'Loading...'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                 <div className="border-t border-border/50 pt-6">
                   <h3 className="text-sm font-semibold mb-4 text-muted-foreground uppercase tracking-wider">{t('settings.accountSettings')}</h3>
                   
                   <div className="space-y-2">
                     <Button
                       variant="outline"
                       className="w-full justify-start"
                       onClick={handlePasswordReset}
                     >
                       <Lock className="w-4 h-4 mr-3" />
                       {t('settings.changePassword')}
                     </Button>

                     <Button
                       variant="outline"
                       className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10"
                       onClick={logout}
                     >
                       <LogOut className="w-4 h-4 mr-3" />
                       {t('settings.logout')}
                     </Button>
                   </div>
                 </div>
              </div>
            )}
          </div>

          <div className="p-4 border-t border-border/50 flex justify-end gap-3 bg-muted/20">
            <Button
              onClick={onClose}
              variant="outline"
              disabled={saving}
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="gap-2"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  {t('common.save')}...
                </>
              ) : (
                t('settings.saveChanges')
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
