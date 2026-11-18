# AE FREE FIRE — Setup Guide

This is a Firebase-backed tournament web app starter for project `ae-free-fire-arena`.

## Included
- Responsive gaming-style website and PWA manifest
- Email/password player registration and login
- Player profile creation
- Tournament listing and admin create/edit/delete
- Player wallet view, deposit/withdraw requests and transaction history
- Cloud Functions for trusted tournament entry-fee deductions, money request approval, admin balance adjustment and prize awards
- Firestore security rules

## Important security notes
- The Firebase web config is public browser configuration, not a private key.
- Never upload a Firebase service-account JSON, private key, password or OTP.
- Real-money deposits/withdrawals require manual verification by the admin and compliance with payment-provider rules. Do not accept screenshots alone as proof of payment; verify the transaction in the provider account.
- Tournament fee deduction and balance changes happen in Cloud Functions, not in browser code.
- The admin account is recognized by email `pctime310@gmail.com`. Create this account through the app once, then use it for admin access.
- The current UI has basic player and admin tools. It does not include payment gateway integration, automated bKash/Nagad verification, room-password release workflow, or automatic match result verification. Those require provider/server integrations and additional admin workflow.
- Set up Firebase billing/Blaze if required by Cloud Functions deployment. Check current Firebase pricing before enabling paid services.

## 1. Enable Firebase Authentication
Firebase Console → Authentication → Get started → Sign-in method → Email/Password → Enable → Save.

## 2. Create Firestore
Firebase Console → Firestore Database → Create database → Production mode.
Choose a region near your users, ideally `asia-south1` if available.

## 3. Deploy rules and Cloud Functions
Install Node.js 20+ and Firebase CLI on a computer:
```bash
npm install -g firebase-tools
firebase login
firebase use ae-free-fire-arena
npm --prefix functions install
firebase deploy --only firestore:rules,functions
```
If prompted to enable APIs or upgrade billing, review the Firebase pricing and enable only if you accept the costs.

## 4. Host the site
From this project folder:
```bash
firebase deploy --only hosting
```
Or upload the static files to another HTTPS host. Cloud Functions still must be deployed to Firebase.

## 5. Create admin account
Open the site and Create Account with `pctime310@gmail.com`. This email gets admin UI permissions after sign-in. Use a strong password and enable 2-step verification on the Google account.

## 6. Publish tournaments
Sign in as admin → Admin Panel → Tournaments → fill form → Save Tournament.

## First test
Use a separate player email to create a player account. The player starts with no balance. Submit a deposit request, verify payment manually, then approve it in Admin Panel → Money Requests. The player can then join an open tournament if balance covers the entry fee.
