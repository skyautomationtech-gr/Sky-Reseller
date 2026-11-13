# ReSellBD Firebase Cloud Functions & Firestore Rules Deployment Guide (Windows PowerShell)

All OTP verification (`sendEmailOtp`, `verifyEmailOtp`, `startSuperAdminLogin`, `verifySuperAdminOtp`), scheduled cleanup (`cleanupExpiredEmailOtps`, `checkPendingApprovals`), and admin management run on **Firebase 2nd-Gen Cloud Functions** in region **`asia-south1`** using Firestore database **`ai-studio-5b67ed85-eca9-4578-81ec-a8f1bfd7298e`**.

> **Important Prerequisites:**
> 1. Your Firebase project (`sky-automation-reseller`) must be on the **Blaze (Pay-as-you-go)** plan to deploy 2nd-gen Cloud Functions and Secret Manager secrets.
> 2. You need **Node.js 20 or 22 LTS** installed on your Windows PC.

---

## Step 1: Open Windows PowerShell in the Project Folder

1. Open **PowerShell** (or **Terminal** in VS Code).
2. Navigate to the root folder of this project (where `firebase.json` is located):

```powershell
cd C:\path\to\your\project
```

---

## Step 2: Install Firebase CLI & Log In

If you haven't installed the Firebase CLI globally yet, run:

```powershell
npm install -g firebase-tools
```

Now sign in to your Google / Firebase account (this opens a browser window):

```powershell
firebase login
```

Verify the active project is `sky-automation-reseller`:

```powershell
firebase use sky-automation-reseller
```

---

## Step 3: Set the 3 Required Secrets in Firebase Secret Manager

The Cloud Functions read these secrets securely at runtime (there are **no hardcoded defaults**):

1. **`GMAIL_USER`** — The Gmail address that sends OTP emails (e.g. `skyautomationtech@gmail.com`).
2. **`GMAIL_APP_PASSWORD`** — Your 16-character Google App Password (remove spaces, e.g. `abcdefghijklmnop`).
   - *How to get one:* Google Account → Security → 2-Step Verification (must be ON) → App passwords → Generate a new 16-character password for "Mail".
3. **`OTP_SECRET_SALT`** — A long random secret string used to hash OTP codes (for example: generate 32+ random characters; never share it).

Run each command below in PowerShell and paste the value when prompted, then press **Enter**:

```powershell
firebase functions:secrets:set GMAIL_USER
```

```powershell
firebase functions:secrets:set GMAIL_APP_PASSWORD
```

```powershell
firebase functions:secrets:set OTP_SECRET_SALT
```

*(Optional tip: if you ever want to double-check which secrets exist, run `firebase functions:secrets:access GMAIL_USER`.)*

---

## Step 4: Install Dependencies Inside `functions/`

Do **not** delete or rewrite the root `package.json`. Install dependencies inside the `functions` folder only:

```powershell
cd functions
npm install
cd ..
```

---

## Step 5: Deploy Cloud Functions & Firestore Security Rules

Run this single command from the project root folder:

```powershell
firebase deploy --only functions,firestore:rules
```

Wait until you see **`Deploy complete!`**.

> Note: First-time deployment of 2nd-gen functions + Cloud Scheduler (`cleanupExpiredEmailOtps` and `checkPendingApprovals`) may take 2–4 minutes and may prompt to enable required Google Cloud APIs (Secret Manager, Cloud Functions, Cloud Run, Eventarc, Cloud Scheduler) — press **`y`** if asked.

---

## Step 6: Redeploy Frontend on Vercel

Push your updated code to GitHub (or run `vercel --prod`) so Vercel builds the updated frontend targeting `asia-south1` Cloud Functions with no insecure local OTP fallbacks.
