# ⚡ SiteSnap

> **Drop a ZIP. Get a permanent link in seconds.**

SiteSnap is a modern web application that lets you deploy WordPress static sites instantly — no GitHub, no hosting setup, no server configuration required. Upload a ZIP export from the Simply Static plugin and get a permanent shareable URL in under 30 seconds.

![SiteSnap Banner](https://img.shields.io/badge/SiteSnap-Deploy%20WordPress%20Instantly-ffe17c?style=for-the-badge&labelColor=0a0a0b)
![License](https://img.shields.io/badge/license-Apache%202.0-blue?style=for-the-badge)
![Node](https://img.shields.io/badge/Node.js-v20+-green?style=for-the-badge&logo=node.js)
![React](https://img.shields.io/badge/React-19-61dafb?style=for-the-badge&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178c6?style=for-the-badge&logo=typescript)

---

## 🚀 What is SiteSnap?

SiteSnap solves a real problem: **sharing WordPress sites is hard.**

Whether you're a freelancer showing a client a mockup, a student submitting a project, or an agency demoing work — you shouldn't need to deal with hosting, DNS, servers, or GitHub just to share a site.

With SiteSnap:
- Export your WordPress site as a ZIP using the [Simply Static](https://wordpress.org/plugins/simply-static/) plugin
- Drop the ZIP into SiteSnap
- Get a permanent link instantly — share it with anyone

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| ⚡ **Instant Deploy** | Upload a ZIP and get a live URL in seconds |
| 🔗 **Permanent Links** | Every deployment gets a URL that never expires |
| 📁 **Deploy History** | View, copy, and manage all your deployments |
| 🔐 **Auth System** | Secure signup/login with encrypted passwords |
| 👤 **Multi-User** | Each user sees only their own deployments |
| 🌙 **Dark/Light Mode** | Full theme support with persistent preference |
| 📦 **Chunked Uploads** | Handles large ZIP files reliably |
| 🛡️ **Security First** | SQL injection protection, rate limiting, JWT auth |

---

## 🛠️ Tech Stack

**Frontend**
- React 19 + TypeScript
- Vite
- Motion (animations)
- Lucide React (icons)

**Backend**
- Node.js + Express
- TypeScript (tsx)
- PostgreSQL via Supabase
- Cloudflare R2 (file storage)
- bcryptjs (password hashing)
- JSON Web Tokens (auth)

**Security**
- Parameterized SQL queries (no SQL injection)
- bcrypt 12 rounds password hashing
- JWT token authentication
- Rate limiting (brute force protection)
- Path traversal prevention
- Zip bomb protection
- Security headers (XSS, clickjacking protection)

---

## 📋 Prerequisites

- Node.js v20+
- A [Supabase](https://supabase.com) account (free)
- A [Cloudflare](https://cloudflare.com) account with R2 enabled (free)

---

## 🏗️ Local Development

### 1. Clone the repository

```bash
git clone https://github.com/Pooja-Kumarii/SiteSnap.git
cd SiteSnap
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up Supabase database

Run this SQL in your Supabase SQL editor:

```sql
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sites (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sites_user_id ON sites(user_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
```

### 4. Configure environment variables

Create a `.env` file in the project root:

```env
DATABASE_URL=your_supabase_connection_string
JWT_SECRET=your_long_random_secret_key
R2_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_r2_access_key
R2_SECRET_ACCESS_KEY=your_r2_secret_key
R2_BUCKET_NAME=sitesnap-files
NODE_ENV=development
```

### 5. Run the development server

```bash
npm run dev
```

Visit `http://localhost:3000`

---

## 🚀 Deployment

SiteSnap is deployed on [Vercel](https://vercel.com) (free) with:
- **Supabase** for the PostgreSQL database (free)
- **Cloudflare R2** for file storage (free — 10GB)

### Environment Variables (set in Vercel dashboard)

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Supabase PostgreSQL connection string |
| `JWT_SECRET` | Long random string for JWT signing |
| `R2_ACCOUNT_ID` | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | R2 API access key |
| `R2_SECRET_ACCESS_KEY` | R2 API secret key |
| `R2_BUCKET_NAME` | R2 bucket name (e.g. `sitesnap-files`) |

---

## 📁 Project Structure

```
SiteSnap/
├── src/
│   ├── App.tsx          # Main React application
│   ├── main.tsx         # Entry point
│   └── index.css        # Global styles
├── server.ts            # Express backend + API
├── render.yaml          # Render deployment config
├── .env.example         # Environment variable template
├── .gitignore           # Git ignore rules
├── package.json         # Dependencies & scripts
├── tsconfig.json        # TypeScript config
└── vite.config.ts       # Vite config
```

---

## 🔒 Security

SiteSnap is built with security as a priority:

- ✅ All database queries use parameterized statements — **SQL injection impossible**
- ✅ Passwords hashed with **bcrypt (12 rounds)** — irreversible encryption
- ✅ **JWT tokens** expire after 7 days
- ✅ **Rate limiting** — max 10 login attempts per 15 minutes
- ✅ **Path traversal protection** on all file operations
- ✅ **Zip slip attack** prevention
- ✅ **Zip bomb** protection (max 10,000 files)
- ✅ Security headers on all responses
- ✅ User data isolation — users can only access their own sites

---

## 📖 How to Use

1. **Export your WordPress site** using the [Simply Static](https://wordpress.org/plugins/simply-static/) plugin
2. **Sign up** for a SiteSnap account
3. **Upload your ZIP** by dragging and dropping it
4. **Copy your permanent link** and share it with anyone!

---

## 👩‍💻 Author

**Devjani**
- GitHub: [@Pooja-Kumarii](https://github.com/Pooja-Kumarii)

---

<div align="center">
  <strong>Built with ❤️ for freelancers, students, and agencies</strong>
  <br/>
  <sub>Drop your ZIP. Own your link.</sub>
</div>