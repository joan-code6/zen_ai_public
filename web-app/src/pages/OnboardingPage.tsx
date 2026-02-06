import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useApp } from '@/contexts/AppContext';
import { useTypedTranslation } from '@/hooks/useTranslation';
import { ArrowRight, ArrowLeft, Check } from 'lucide-react';

type OnboardingStep = 'welcome' | 'name' | 'notes' | 'email' | 'calendar' | 'complete';

export default function OnboardingPage() {
  const { user, isAuthenticated } = useAuth();
  const { actions } = useApp();
  const { t } = useTypedTranslation();
  const navigate = useNavigate();

  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [name, setName] = useState('');

  React.useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, navigate]);

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
      window.scrollTo({ top: 0, behavior: 'smooth' });
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
      actions.addToast('Name must be at least 2 characters', 'error');
      return;
    }
    handleNext();
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#000000',
      color: '#FFFFFF',
      fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
      display: 'flex',
      flexDirection: 'column'
    }}>

      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '3rem 2rem'
      }}>
        <div style={{ width: '100%', maxWidth: '900px' }}>

          {step === 'welcome' && (
            <div>
              <div style={{ marginBottom: '4rem' }}>
                <h1 style={{
                  fontSize: 'clamp(2.5rem, 6vw, 4rem)',
                  fontWeight: 700,
                  lineHeight: 1.1,
                  marginBottom: '1.5rem'
                }}>
                  Welcome to Zen AI
                </h1>
                <p style={{
                  fontSize: '1.125rem',
                  opacity: 0.7,
                  lineHeight: 1.6,
                  maxWidth: '600px'
                }}>
                  Your intelligent assistant that remembers what matters and helps you stay organized.
                </p>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                gap: '2rem',
                marginBottom: '4rem'
              }}>
                <FeatureBox
                  num="01"
                  title="Notes"
                  desc="Store your information with trigger words. When you ask about something, Zen AI automatically retrieves the right notes."
                />
                <FeatureBox
                  num="02"
                  title="Email"
                  desc="Connect Gmail or any email. Get priority scores, smart summaries, and scam detection."
                />
                <FeatureBox
                  num="03"
                  title="Calendar"
                  desc="Sync your Google Calendar to view events and get help scheduling meetings."
                />
              </div>

              <button
                onClick={handleNext}
                style={{
                  padding: '1rem 2rem',
                  background: '#FFFFFF',
                  color: '#000000',
                  fontSize: '0.9375rem',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.75rem'
                }}
              >
                Get Started
                <ArrowRight size={18} />
              </button>
            </div>
          )}

          {step === 'name' && (
            <div style={{ maxWidth: '500px' }}>
              <div style={{ marginBottom: '3rem' }}>
                <div style={{
                  fontSize: '0.75rem',
                  letterSpacing: '0.15em',
                  opacity: 0.5,
                  marginBottom: '1rem'
                }}>
                  STEP 2 OF 6
                </div>
                <h1 style={{
                  fontSize: '2rem',
                  fontWeight: 700,
                  lineHeight: 1.2,
                  marginBottom: '1rem'
                }}>
                  What should we call you?
                </h1>
                <p style={{ fontSize: '1rem', opacity: 0.7, lineHeight: 1.6 }}>
                  We'll use this name to personalize your experience and make conversations feel more natural.
                </p>
              </div>

              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name"
                autoFocus
                style={{
                  width: '100%',
                  padding: '1rem 0',
                  fontSize: '1.125rem',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '1px solid #FFFFFF33',
                  color: '#FFFFFF',
                  fontFamily: 'inherit',
                  outline: 'none',
                  marginBottom: '2rem'
                }}
              />

              <button
                onClick={handleNameSubmit}
                disabled={name.trim().length < 2}
                style={{
                  padding: '1rem 2rem',
                  background: name.trim().length >= 2 ? '#FFFFFF' : 'transparent',
                  color: name.trim().length >= 2 ? '#000000' : '#FFFFFF33',
                  fontSize: '0.9375rem',
                  fontWeight: 600,
                  border: name.trim().length >= 2 ? 'none' : '1px solid #FFFFFF33',
                  cursor: name.trim().length >= 2 ? 'pointer' : 'default',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.75rem'
                }}
              >
                Continue
                <ArrowRight size={18} />
              </button>
            </div>
          )}

          {step === 'notes' && (
            <ContentStep
              step={step}
              handleBack={handleBack}
              handleNext={handleNext}
              currentStepIndex={currentStepIndex}
              steps={steps}
            >
              <div style={{ marginBottom: '3rem' }}>
                <h1 style={{
                  fontSize: '2rem',
                  fontWeight: 700,
                  lineHeight: 1.2,
                  marginBottom: '1rem'
                }}>
                  Notes - Your Memory System
                </h1>
                <p style={{ fontSize: '1rem', opacity: 0.7, lineHeight: 1.6 }}>
                  Zen AI automatically takes notes while you talk to it. These notes act as a memory system - when you mention something related to a note, Zen AI retrieves that information instead of searching through your entire conversation history.
                </p>
              </div>

              <div style={{ marginBottom: '3rem' }}>
                <h3 style={{
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  marginBottom: '1.5rem',
                  letterSpacing: '0.05em',
                  opacity: 0.9
                }}>
                  How it works:
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <div>
                    <strong style={{ fontSize: '1rem', display: 'block', marginBottom: '0.25rem' }}>1. AI takes notes automatically</strong>
                    <p style={{ fontSize: '0.9375rem', opacity: 0.6, lineHeight: 1.6 }}>
                      As you chat, Zen AI remembers important information like your email, preferences, or details you share and stores them as notes
                    </p>
                  </div>
                  <div>
                    <strong style={{ fontSize: '1rem', display: 'block', marginBottom: '0.25rem' }}>2. Notes have trigger words</strong>
                    <p style={{ fontSize: '0.9375rem', opacity: 0.6, lineHeight: 1.6 }}>
                      Each note is tagged with trigger words. When you mention those words or similar words, the relevant note activates
                    </p>
                  </div>
                  <div>
                    <strong style={{ fontSize: '1rem', display: 'block', marginBottom: '0.25rem' }}>3. Smarter, faster responses</strong>
                    <p style={{ fontSize: '0.9375rem', opacity: 0.6, lineHeight: 1.6 }}>
                      Only relevant notes are sent to the AI, saving tokens and making responses more accurate
                    </p>
                  </div>
                </div>
              </div>

              <div style={{
                border: '1px solid #FFFFFF33',
                padding: '1.5rem',
                marginBottom: '2rem'
              }}>
                <h4 style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  marginBottom: '1rem',
                  letterSpacing: '0.1em',
                  opacity: 0.7
                }}>
                  EXAMPLE
                </h4>
                <div style={{ fontSize: '0.875rem', opacity: 0.9, lineHeight: 1.7 }}>
                  <p style={{ marginBottom: '1rem' }}>
                    You say: "My email is john@example.com"
                  </p>
                  <p style={{ marginBottom: '1rem' }}>
                    <strong>AI creates a note:</strong>
                  </p>
                  <div style={{ marginBottom: '0.5rem' }}>
                    <strong>Title:</strong> User's Email
                  </div>
                  <div style={{ marginBottom: '0.5rem' }}>
                    <strong>Content:</strong> My email address is john@example.com
                  </div>
                  <div>
                    <strong>Trigger words:</strong> email, contact, john
                  </div>
                  <p style={{ marginTop: '1rem' }}>
                    Later when you say "Send an email to my contact," Zen AI retrieves this note and knows who to email.
                  </p>
                </div>
              </div>
            </ContentStep>
          )}

          {step === 'email' && (
            <ContentStep
              step={step}
              handleBack={handleBack}
              handleNext={handleNext}
              currentStepIndex={currentStepIndex}
              steps={steps}
            >
              <div style={{ marginBottom: '3rem' }}>
                <h1 style={{
                  fontSize: '2rem',
                  fontWeight: 700,
                  lineHeight: 1.2,
                  marginBottom: '1rem'
                }}>
                  Email Integration
                </h1>
                <p style={{ fontSize: '1rem', opacity: 0.7, lineHeight: 1.6 }}>
                  Connect your Gmail or any email account through IMAP. Zen AI will analyze your emails to help you prioritize and understand what's important.
                </p>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                gap: '1.5rem',
                marginBottom: '3rem'
              }}>
                <EmailFeature
                  title="Priority Score"
                  desc="Every email is rated 1-10 based on importance. Focus on what matters most."
                  examples="Urgent deadlines get 8-10, newsletters get 1-3"
                />
                <EmailFeature
                  title="Smart Summaries"
                  desc="Long emails are automatically summarized into key points."
                  examples="Save time by reading 3 bullet points instead of 5 paragraphs"
                />
                <EmailFeature
                  title="Scam Detection"
                  desc="AI checks sender authenticity and warns about suspicious emails."
                  examples="Phishing attempts are flagged before you click"
                />
              </div>

              <div style={{
                border: '1px solid #FFFFFF33',
                padding: '1.5rem'
              }}>
                <h4 style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  marginBottom: '1rem',
                  letterSpacing: '0.1em',
                  opacity: 0.7
                }}>
                  HOW IT WORKS
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Check size={14} />
                    <span style={{ fontSize: '0.875rem', opacity: 0.9 }}>
                      Connect email via secure IMAP
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Check size={14} />
                    <span style={{ fontSize: '0.875rem', opacity: 0.9 }}>
                      AI reads and analyzes each email
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Check size={14} />
                    <span style={{ fontSize: '0.875rem', opacity: 0.9 }}>
                      Automatically creates notes from important info
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Check size={14} />
                    <span style={{ fontSize: '0.875rem', opacity: 0.9 }}>
                      Ask Zen AI questions about your emails
                    </span>
                  </div>
                </div>
              </div>
            </ContentStep>
          )}

          {step === 'calendar' && (
            <ContentStep
              step={step}
              handleBack={handleBack}
              handleNext={handleNext}
              currentStepIndex={currentStepIndex}
              steps={steps}
            >
              <div style={{ marginBottom: '3rem' }}>
                <h1 style={{
                  fontSize: '2rem',
                  fontWeight: 700,
                  lineHeight: 1.2,
                  marginBottom: '1rem'
                }}>
                  Calendar Integration
                </h1>
                <p style={{ fontSize: '1rem', opacity: 0.7, lineHeight: 1.6 }}>
                  Sync your Google Calendar to see all your events in one place. Zen AI can help you schedule, remind you of meetings, and suggest optimal times.
                </p>
              </div>

              <div style={{ marginBottom: '3rem' }}>
                <h3 style={{
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  marginBottom: '1.5rem',
                  letterSpacing: '0.05em',
                  opacity: 0.9
                }}>
                  What you can do:
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
                  <div>
                    <strong style={{ fontSize: '0.9375rem', display: 'block', marginBottom: '0.5rem' }}>View all events</strong>
                    <p style={{ fontSize: '0.875rem', opacity: 0.6, lineHeight: 1.6 }}>
                      See your Google Calendar events alongside emails and notes in one unified view
                    </p>
                  </div>
                  <div>
                    <strong style={{ fontSize: '0.9375rem', display: 'block', marginBottom: '0.5rem' }}>Schedule meetings</strong>
                    <p style={{ fontSize: '0.875rem', opacity: 0.6, lineHeight: 1.6 }}>
                      Ask Zen AI to find meeting times that work for everyone
                    </p>
                  </div>
                  <div>
                    <strong style={{ fontSize: '0.9375rem', display: 'block', marginBottom: '0.5rem' }}>Real-time sync</strong>
                    <p style={{ fontSize: '0.875rem', opacity: 0.6, lineHeight: 1.6 }}>
                      Changes in Google Calendar appear instantly in Zen AI
                    </p>
                  </div>
                </div>
              </div>

              <div style={{
                border: '1px solid #FFFFFF33',
                padding: '1.5rem'
              }}>
                <h4 style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  marginBottom: '1rem',
                  letterSpacing: '0.1em',
                  opacity: 0.7
                }}>
                  WHY GOOGLE CALENDAR?
                </h4>
                <p style={{ fontSize: '0.875rem', opacity: 0.8, lineHeight: 1.6, marginBottom: '1rem' }}>
                  Google Calendar is the most widely used calendar service. By integrating it, you can:
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Check size={14} />
                    <span style={{ fontSize: '0.875rem', opacity: 0.9 }}>Connect with one click via OAuth</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Check size={14} />
                    <span style={{ fontSize: '0.875rem', opacity: 0.9 }}>Keep using your existing workflow</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Check size={14} />
                    <span style={{ fontSize: '0.875rem', opacity: 0.9 }}>Automatic event syncing</span>
                  </div>
                </div>
              </div>
            </ContentStep>
          )}

          {step === 'complete' && (
            <div>
              <div style={{ marginBottom: '4rem' }}>
                <h1 style={{
                  fontSize: '2.5rem',
                  fontWeight: 700,
                  lineHeight: 1.1,
                  marginBottom: '1rem'
                }}>
                  You're all set, {name}!
                </h1>
                <p style={{ fontSize: '1.125rem', opacity: 0.7, lineHeight: 1.6, maxWidth: '500px' }}>
                  Your intelligent workspace is ready. Here's what you can do next:
                </p>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                gap: '2rem',
                marginBottom: '4rem'
              }}>
                <ActionBox
                  title="Create youre first Chat"
                  desc="Start a conversation with Zen AI like with any other chat assistant."
                />
                <ActionBox
                  title="Connect your email"
                  desc="Link your Gmail account to start getting smart summaries and priority scores."
                />
                <ActionBox
                  title="Sync your calendar"
                  desc="Connect Google Calendar to see events and get AI-powered scheduling help."
                />
              </div>

              <button
                onClick={handleNext}
                style={{
                  padding: '1rem 2rem',
                  background: '#FFFFFF',
                  color: '#000000',
                  fontSize: '0.9375rem',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.75rem'
                }}
              >
                Start Using Zen AI
                <ArrowRight size={18} />
              </button>
            </div>
          )}
        </div>
      </div>

      <div style={{
        padding: '1.5rem',
        borderTop: '1px solid #FFFFFF33',
        display: 'flex',
        justifyContent: 'center'
      }}>
        <div style={{ maxWidth: '400px', width: '100%' }}>
          <div style={{
            height: '2px',
            background: '#FFFFFF33',
            marginBottom: '0.5rem',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                height: '100%',
                background: '#FFFFFF',
                width: `${progress}%`,
                transition: 'width 0.3s ease'
              }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', opacity: 0.7 }}>
            <span>Progress</span>
            <span>{Math.round(progress)}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureBox({ num, title, desc }: { num: string, title: string, desc: string }) {
  return (
    <div style={{
      border: '1px solid #FFFFFF33',
      padding: '1.5rem'
    }}>
      <div style={{
        fontSize: '0.75rem',
        letterSpacing: '0.15em',
        opacity: 0.5,
        marginBottom: '1rem'
      }}>
        {num}
      </div>
      <h3 style={{
        fontSize: '1.125rem',
        fontWeight: 600,
        marginBottom: '0.75rem'
      }}>
        {title}
      </h3>
      <p style={{ fontSize: '0.9375rem', opacity: 0.7, lineHeight: 1.6 }}>
        {desc}
      </p>
    </div>
  );
}

function EmailFeature({ title, desc, examples }: { title: string, desc: string, examples: string }) {
  return (
    <div style={{
      border: '1px solid #FFFFFF33',
      padding: '1.5rem'
    }}>
      <h4 style={{
        fontSize: '1rem',
        fontWeight: 600,
        marginBottom: '0.75rem'
      }}>
        {title}
      </h4>
      <p style={{ fontSize: '0.875rem', opacity: 0.7, lineHeight: 1.6, marginBottom: '0.75rem' }}>
        {desc}
      </p>
      <p style={{ fontSize: '0.8125rem', opacity: 0.5, lineHeight: 1.5, fontStyle: 'italic' }}>
        {examples}
      </p>
    </div>
  );
}

function ActionBox({ title, desc }: { title: string, desc: string }) {
  return (
    <div style={{
      border: '1px solid #FFFFFF33',
      padding: '1.5rem'
    }}>
      <h3 style={{
        fontSize: '1rem',
        fontWeight: 600,
        marginBottom: '0.5rem'
      }}>
        {title}
      </h3>
      <p style={{ fontSize: '0.875rem', opacity: 0.7, lineHeight: 1.6 }}>
        {desc}
      </p>
    </div>
  );
}

function ContentStep({ step, handleBack, handleNext, currentStepIndex, steps, children }: any) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem' }}>
        <button
          onClick={handleBack}
          style={{
            padding: '0.75rem 1.5rem',
            background: 'transparent',
            color: '#FFFFFF',
            fontSize: '0.875rem',
            fontWeight: 500,
            border: '1px solid #FFFFFF33',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <ArrowLeft size={16} />
          Back
        </button>

        <div style={{ fontSize: '0.875rem', opacity: 0.6 }}>
          Step {currentStepIndex + 1} of {steps.length}
        </div>
      </div>

      {children}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '3rem' }}>
        <button
          onClick={handleNext}
          style={{
            padding: '1rem 2rem',
            background: '#FFFFFF',
            color: '#000000',
            fontSize: '0.9375rem',
            fontWeight: 600,
            border: 'none',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.75rem'
          }}
        >
          Continue
          <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}
