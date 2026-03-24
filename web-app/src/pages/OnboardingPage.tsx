import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useApp } from '@/contexts/AppContext';
import { useTypedTranslation } from '@/hooks/useTranslation';
import { Button } from '@/components/ui/button';
import { ArrowRight, ArrowLeft, Check } from 'lucide-react';

type OnboardingStep = 'welcome' | 'name' | 'notes' | 'email' | 'calendar' | 'complete';

export default function OnboardingPage() {
  const { isAuthenticated } = useAuth();
  const { actions } = useApp();
  const { t } = useTypedTranslation();
  const navigate = useNavigate();

  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [name, setName] = useState('');

  if (!isAuthenticated) {
    navigate('/login');
    return null;
  }

  const steps: OnboardingStep[] = ['welcome', 'name', 'notes', 'email', 'calendar', 'complete'];
  const currentStepIndex = steps.indexOf(step);
  const progress = ((currentStepIndex + 1) / steps.length) * 100;

  const handleNext = () => {
    if (step === 'complete') {
      navigate('/');
      return;
    }

    const nextStep = steps[currentStepIndex + 1];
    if (nextStep) {
      setStep(nextStep);
    }
  };

  const handleBack = () => {
    if (step === 'welcome') {
      navigate('/');
      return;
    }

    const prevStep = steps[currentStepIndex - 1];
    if (prevStep) {
      setStep(prevStep);
    }
  };

  const handleNameSubmit = () => {
    if (name.trim().length < 2) {
      actions.addToast(t('onboarding.nameMinChars'), 'error');
      return;
    }
    handleNext();
  };

  const renderStep = () => {
    switch (step) {
      case 'welcome':
        return <WelcomeStep onNext={handleNext} />;
      case 'name':
        return (
          <NameStep
            name={name}
            onNameChange={setName}
            onSubmit={handleNameSubmit}
          />
        );
      case 'notes':
        return (
          <ContentStep
            onBack={handleBack}
            onNext={handleNext}
            currentStepIndex={currentStepIndex}
            totalSteps={steps.length}
          >
            <NotesContent />
          </ContentStep>
        );
      case 'email':
        return (
          <ContentStep
            onBack={handleBack}
            onNext={handleNext}
            currentStepIndex={currentStepIndex}
            totalSteps={steps.length}
          >
            <EmailContent />
          </ContentStep>
        );
      case 'calendar':
        return (
          <ContentStep
            onBack={handleBack}
            onNext={handleNext}
            currentStepIndex={currentStepIndex}
            totalSteps={steps.length}
          >
            <CalendarContent />
          </ContentStep>
        );
      case 'complete':
        return <CompleteStep name={name} onNext={handleNext} />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <div className="max-w-3xl mx-auto">
        {renderStep()}
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t border-border">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="h-1 bg-muted rounded-full overflow-hidden mb-3">
            <div
              className="h-full bg-primary transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs sm:text-sm text-muted-foreground">
            <span>{t('onboarding.progress')}</span>
            <span>{Math.round(progress)}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function WelcomeStep({ onNext }: { onNext: () => void }) {
  const { t } = useTypedTranslation();

  return (
    <div className="animate-fade-in">
      <div className="mb-8 sm:mb-12">
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-4 leading-tight">
          {t('onboarding.welcome')}
        </h1>
        <p className="text-base sm:text-lg text-muted-foreground max-w-xl">
          {t('onboarding.welcomeSubtitle')}
        </p>
      </div>

      <div className="grid gap-4 sm:gap-6 mb-8 sm:mb-12">
        <FeatureBox
          num="01"
          title={t('onboarding.notesFeature')}
          desc={t('onboarding.notesFeatureDesc')}
        />
        <FeatureBox
          num="02"
          title={t('onboarding.emailFeature')}
          desc={t('onboarding.emailFeatureDesc')}
        />
        <FeatureBox
          num="03"
          title={t('onboarding.calendarFeature')}
          desc={t('onboarding.calendarFeatureDesc')}
        />
      </div>

      <Button onClick={onNext} size="lg" className="gap-2">
        {t('onboarding.getStarted')}
        <ArrowRight className="w-4 h-4" />
      </Button>
    </div>
  );
}

function NameStep({
  name,
  onNameChange,
  onSubmit
}: {
  name: string;
  onNameChange: (name: string) => void;
  onSubmit: () => void;
}) {
  const { t } = useTypedTranslation();
  const canSubmit = name.trim().length >= 2;

  return (
    <div className="animate-fade-in">
      <div className="mb-6 sm:mb-8">
        <p className="text-xs sm:text-sm font-medium tracking-wider text-muted-foreground mb-2 uppercase">
          {t('onboarding.stepOf')} 2 {t('onboarding.of')} 6
        </p>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-3">
          {t('onboarding.whatsYourName')}
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          {t('onboarding.nameDescription')}
        </p>
      </div>

      <div className="mb-6 sm:mb-8">
        <input
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder={t('onboarding.enterName')}
          autoFocus
          className="w-full text-lg sm:text-xl bg-transparent border-b-2 border-muted-foreground/30 focus:border-primary pb-3 transition-colors outline-none text-foreground placeholder:text-muted-foreground/50"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canSubmit) {
              onSubmit();
            }
          }}
        />
      </div>

      <Button
        onClick={onSubmit}
        disabled={!canSubmit}
        size="lg"
        className="gap-2"
      >
        {t('onboarding.continue')}
        <ArrowRight className="w-4 h-4" />
      </Button>
    </div>
  );
}

function ContentStep({
  onBack,
  onNext,
  currentStepIndex,
  totalSteps,
  children
}: {
  onBack: () => void;
  onNext: () => void;
  currentStepIndex: number;
  totalSteps: number;
  children: React.ReactNode;
}) {
  const { t } = useTypedTranslation();

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6 sm:mb-8">
        <Button variant="ghost" onClick={onBack} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          {t('common.back')}
        </Button>

        <span className="text-sm text-muted-foreground">
          {currentStepIndex + 1} / {totalSteps}
        </span>
      </div>

      {children}

      <div className="flex justify-end mt-8 sm:mt-10">
        <Button onClick={onNext} size="lg" className="gap-2">
          {t('onboarding.continue')}
          <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

function NotesContent() {
  const { t } = useTypedTranslation();

  return (
    <div>
      <div className="mb-6 sm:mb-8">
        <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-3">
          {t('onboarding.notesMemorySystem')}
        </h2>
        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
          {t('onboarding.notesDescription')}
        </p>
      </div>

      <div className="mb-6 sm:mb-8">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground/80 mb-4">
          {t('onboarding.howItWorks')}
        </h3>
        <div className="space-y-4">
          <div>
            <h4 className="font-medium text-foreground mb-1">{t('onboarding.aiTakesNotes')}</h4>
            <p className="text-sm text-muted-foreground">
              {t('onboarding.aiTakesNotesDescription')}
            </p>
          </div>
          <div>
            <h4 className="font-medium text-foreground mb-1">{t('onboarding.triggerWords')}</h4>
            <p className="text-sm text-muted-foreground">
              {t('onboarding.triggerWordsDescription')}
            </p>
          </div>
          <div>
            <h4 className="font-medium text-foreground mb-1">{t('onboarding.smarterResponses')}</h4>
            <p className="text-sm text-muted-foreground">
              {t('onboarding.smarterResponsesDescription')}
            </p>
          </div>
        </div>
      </div>

      <div className="border border-border rounded-xl p-4 sm:p-6 bg-muted/20">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
          {t('onboarding.example')}
        </h4>
        <div className="space-y-3 text-sm">
          <p>{t('onboarding.youSay')} &quot;My email is john@example.com&quot;</p>
          <p className="font-medium">{t('onboarding.aiCreatesNote')}</p>
          <div className="space-y-1 pl-4">
            <p><span className="font-medium">{t('onboarding.title')}</span> User&apos;s Email</p>
            <p><span className="font-medium">{t('onboarding.content')}</span> My email address is john@example.com</p>
            <p><span className="font-medium">{t('onboarding.triggerWordsLabel')}</span> email, contact, john</p>
          </div>
          <p>
            {t('onboarding.laterWhenYouSay')} &quot;Send an email to my contact,&quot; {t('onboarding.aiRetrievesNote')}
          </p>
        </div>
      </div>
    </div>
  );
}

function EmailContent() {
  const { t } = useTypedTranslation();

  return (
    <div>
      <div className="mb-6 sm:mb-8">
        <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-3">
          {t('onboarding.emailIntegration')}
        </h2>
        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
          {t('onboarding.emailDescription')}
        </p>
      </div>

      <div className="grid gap-4 sm:gap-6 mb-6 sm:mb-8">
        <EmailFeature
          title={t('onboarding.priorityScore')}
          desc={t('onboarding.priorityScoreDesc')}
          examples={t('onboarding.priorityScoreExample')}
        />
        <EmailFeature
          title={t('onboarding.smartSummaries')}
          desc={t('onboarding.smartSummariesDesc')}
          examples={t('onboarding.smartSummariesExample')}
        />
        <EmailFeature
          title={t('onboarding.scamDetection')}
          desc={t('onboarding.scamDetectionDesc')}
          examples={t('onboarding.scamDetectionExample')}
        />
      </div>

      <div className="border border-border rounded-xl p-4 sm:p-6 bg-muted/20">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
          {t('onboarding.howItWorks')}
        </h4>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Check className="w-4 h-4 text-primary flex-shrink-0" />
            <span className="text-sm">{t('onboarding.connectSecureImap')}</span>
          </div>
          <div className="flex items-center gap-3">
            <Check className="w-4 h-4 text-primary flex-shrink-0" />
            <span className="text-sm">{t('onboarding.aiReadsEmails')}</span>
          </div>
          <div className="flex items-center gap-3">
            <Check className="w-4 h-4 text-primary flex-shrink-0" />
            <span className="text-sm">{t('onboarding.createsNotes')}</span>
          </div>
          <div className="flex items-center gap-3">
            <Check className="w-4 h-4 text-primary flex-shrink-0" />
            <span className="text-sm">{t('onboarding.askQuestions')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function CalendarContent() {
  const { t } = useTypedTranslation();

  return (
    <div>
      <div className="mb-6 sm:mb-8">
        <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-3">
          {t('onboarding.calendarIntegration')}
        </h2>
        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
          {t('onboarding.calendarDescription')}
        </p>
      </div>

      <div className="mb-6 sm:mb-8">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground/80 mb-4">
          {t('onboarding.whatYouCanDo')}
        </h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <h4 className="font-medium text-foreground mb-1">{t('onboarding.viewAllEvents')}</h4>
            <p className="text-sm text-muted-foreground">{t('onboarding.viewAllEventsDesc')}</p>
          </div>
          <div>
            <h4 className="font-medium text-foreground mb-1">{t('onboarding.scheduleMeetings')}</h4>
            <p className="text-sm text-muted-foreground">{t('onboarding.scheduleMeetingsDesc')}</p>
          </div>
          <div>
            <h4 className="font-medium text-foreground mb-1">{t('onboarding.realtimeSync')}</h4>
            <p className="text-sm text-muted-foreground">{t('onboarding.realtimeSyncDesc')}</p>
          </div>
        </div>
      </div>

      <div className="border border-border rounded-xl p-4 sm:p-6 bg-muted/20">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          {t('onboarding.whyGoogleCalendar')}
        </h4>
        <p className="text-sm text-muted-foreground mb-4">
          {t('onboarding.whyGoogleCalendarDesc')}
        </p>
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <Check className="w-4 h-4 text-primary flex-shrink-0" />
            <span className="text-sm">{t('onboarding.connectOneClick')}</span>
          </div>
          <div className="flex items-center gap-3">
            <Check className="w-4 h-4 text-primary flex-shrink-0" />
            <span className="text-sm">{t('onboarding.keepWorkflow')}</span>
          </div>
          <div className="flex items-center gap-3">
            <Check className="w-4 h-4 text-primary flex-shrink-0" />
            <span className="text-sm">{t('onboarding.automaticSync')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function CompleteStep({ name, onNext }: { name: string; onNext: () => void }) {
  const { t } = useTypedTranslation();

  return (
    <div className="animate-fade-in">
      <div className="mb-8 sm:mb-12">
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-foreground mb-4 leading-tight">
          {t('onboarding.allSet', { name: name || 'there' })}
        </h1>
        <p className="text-base sm:text-lg text-muted-foreground max-w-xl">
          {t('onboarding.allSetDescription')}
        </p>
      </div>

      <div className="grid gap-4 sm:gap-6 mb-8 sm:mb-12">
        <ActionBox
          title={t('onboarding.createFirstChat')}
          desc={t('onboarding.createFirstChatDesc')}
        />
        <ActionBox
          title={t('onboarding.connectEmail')}
          desc={t('onboarding.connectEmailDesc')}
        />
        <ActionBox
          title={t('onboarding.syncCalendar')}
          desc={t('onboarding.syncCalendarDesc')}
        />
      </div>

      <Button onClick={onNext} size="lg" className="gap-2">
        {t('onboarding.startUsingZen')}
        <ArrowRight className="w-4 h-4" />
      </Button>
    </div>
  );
}

function FeatureBox({ num, title, desc }: { num: string; title: string; desc: string }) {
  return (
    <div className="border border-border rounded-xl p-4 sm:p-6 bg-card hover:bg-muted/30 transition-colors">
      <div className="text-xs sm:text-sm font-medium tracking-wider text-muted-foreground mb-3">
        {num}
      </div>
      <h3 className="text-base sm:text-lg font-semibold text-foreground mb-2">
        {title}
      </h3>
      <p className="text-sm text-muted-foreground leading-relaxed">
        {desc}
      </p>
    </div>
  );
}

function EmailFeature({ title, desc, examples }: { title: string; desc: string; examples: string }) {
  return (
    <div className="border border-border rounded-xl p-4 sm:p-5 bg-card">
      <h4 className="font-semibold text-foreground mb-2">{title}</h4>
      <p className="text-sm text-muted-foreground mb-3 leading-relaxed">{desc}</p>
      <p className="text-xs text-muted-foreground/70 italic">{examples}</p>
    </div>
  );
}

function ActionBox({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="border border-border rounded-xl p-4 sm:p-5 bg-card">
      <h3 className="font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
    </div>
  );
}
