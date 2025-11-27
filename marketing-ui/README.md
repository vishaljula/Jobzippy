# JobZippy Marketing Website

A modern, production-ready marketing landing page for JobZippy, built with Next.js 14, TypeScript, and Tailwind CSS.

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ installed
- npm or yarn

### Installation

```bash
cd marketing-ui
npm install
```

### Development

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3333](http://localhost:3333) in your browser to see the site.

### Build

Build for production:

```bash
npm run build
```

Start the production server:

```bash
npm start
```

## 📦 Deployment to Vercel

### Option 1: Deploy via Vercel CLI

1. Install Vercel CLI:
   ```bash
   npm i -g vercel
   ```

2. Deploy:
   ```bash
   cd marketing-ui
   vercel
   ```

3. Follow the prompts to link your project or create a new one.

### Option 2: Deploy via GitHub

1. Push this folder to a GitHub repository.

2. Go to [vercel.com](https://vercel.com) and sign in.

3. Click "New Project" and import your repository.

4. Vercel will auto-detect Next.js and configure everything.

5. Click "Deploy" - your site will be live in minutes!

### Environment Variables

No environment variables are required for the basic setup. The waitlist form currently uses a placeholder API route (`/api/placeholder`) that you can replace with your actual backend later.

## 🎨 Features

- **Modern Design**: Clean, professional UI with smooth animations
- **Responsive**: Mobile-first design that looks great on all devices
- **Fast**: Optimized for performance with Next.js 14
- **SEO Ready**: Proper meta tags and semantic HTML
- **Accessible**: WCAG-compliant components

## 📁 Project Structure

```
marketing-ui/
├── app/
│   ├── api/
│   │   └── placeholder/     # Placeholder API route for waitlist
│   ├── globals.css          # Global styles
│   ├── layout.tsx           # Root layout
│   └── page.tsx             # Home page
├── components/
│   ├── FAQ.tsx              # FAQ section
│   ├── Footer.tsx           # Footer component
│   ├── Hero.tsx             # Hero section with CTA
│   ├── HowItWorks.tsx       # How it works section
│   ├── IdealFor.tsx         # Target audience section
│   ├── Navbar.tsx           # Navigation bar
│   ├── Pricing.tsx          # Pricing section
│   ├── WaitlistForm.tsx     # Waitlist form component
│   └── WhyDifferent.tsx     # Features section
├── package.json
├── tailwind.config.ts       # Tailwind configuration
├── tsconfig.json            # TypeScript configuration
└── README.md
```

## 🔧 Customization

### Colors

Edit `tailwind.config.ts` to change the color scheme. The current theme uses:
- Primary: Blue (`#0ea5e9`)
- Secondary: Purple (`#a855f7`)

### Content

All content is in the component files. Edit the respective component to update text, features, FAQs, etc.

### Waitlist Form

The waitlist form currently submits to `/api/placeholder/route.ts`. To connect to your backend:

1. Update the API route or create a new one
2. Modify `components/WaitlistForm.tsx` to point to your endpoint
3. Add any required environment variables

## 📝 Next Steps

1. **Connect Backend**: Replace the placeholder API with your actual waitlist backend
2. **Analytics**: Add Google Analytics or similar tracking
3. **SEO**: Add more meta tags, Open Graph, and Twitter cards
4. **Legal Pages**: Create actual Privacy and Terms pages
5. **Email Integration**: Set up email notifications for waitlist signups

## 🐛 Troubleshooting

### Build Errors

If you encounter build errors:
1. Delete `node_modules` and `.next` folders
2. Run `npm install` again
3. Try `npm run build` again

### Port Already in Use

If port 3333 is already in use:
```bash
npm run dev -- -p 3334
```

## 📄 License

This project is part of the JobZippy application.

