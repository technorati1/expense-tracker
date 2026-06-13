# Expense Tracker

AI-powered personal expense tracker. Paste receipts, SMS alerts, or upload screenshots — Claude extracts and categorizes everything automatically.

## Deploy to Vercel

### 1. Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/expense-tracker.git
git push -u origin main
```

### 2. Import on Vercel
- Go to https://vercel.com/new
- Import your GitHub repo
- Add environment variable:
  - `ANTHROPIC_API_KEY` = your key from https://console.anthropic.com

### 3. Deploy
Vercel will build and deploy automatically. You'll get a URL like `expense-tracker.vercel.app`.

## Local Development
```bash
cp .env.example .env.local
# Add your ANTHROPIC_API_KEY to .env.local
npm install
npm run dev
```
