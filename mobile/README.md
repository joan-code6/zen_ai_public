# Zen AI Mobile

Initial Expo + React Native scaffold for the Zen AI mobile client.

## What is implemented

- Mobile-first chat shell matching the web app visual language:
  - Dark graphite theme with rounded cards, soft borders, and muted hierarchy
  - Slide-in drawer for navigation and history
  - Centered conversation hero and suggestion chips
  - Long-form assistant message card
  - Bottom-fixed composer with model/action toggles and attachment/mic icons
  - Safe area and keyboard-aware layout
- TypeScript project setup ready for feature work.

## Run locally

1. Install dependencies:
   - `npm install`
2. Start Expo:
   - `npm run start`
3. Open on device/emulator:
   - Android: `npm run android`
   - iOS: `npm run ios`

## Next implementation milestones

- Hook drawer/chat list to real backend conversation APIs.
- Add auth flow and persisted sessions.
- Add i18n and language parity with web-app locales.
- Replace mock message/chips with live data.
