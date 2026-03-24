# Zen AI Admin Panel - Quick Start

## 🎉 Your admin panel is ready!

The admin panel is now running at: **http://localhost:5178/**

## 🎨 Design Philosophy

This admin panel features a **bold, modern dark theme** with:
- Custom gradient accents (indigo/purple/pink)
- DM Sans & Syne typography for a distinctive look
- Smooth animations and transitions
- Clean, functional layout with sidebar navigation

## 🔑 Features

### Dashboard
- Real-time statistics: users, chats, messages, costs
- Current configuration overview
- Gradient stat cards with icons

### Models Management
- Add new AI models
- Edit existing models
- Enable/disable models
- Delete models
- Support for both OpenRouter and Hack Club providers

### Configuration
- Switch between OpenRouter and Hack Club AI
- Set default model for users
- Configure cost per message for tracking
- View all available models

### Settings
- Manage environment variables
- Add, edit, and remove configuration settings
- Restart the backend server

## 🚀 Usage

1. **Login**: Use your Firebase admin credentials to sign in
2. **Dashboard**: View system statistics at a glance
3. **Models**: Manage available AI models
4. **Configuration**: Adjust system settings
5. **Settings**: Manage environment variables and system actions

## 📝 API Requirements

Make sure your backend is running with these admin endpoints:
- `POST /auth/login`
- `GET /admin/stats`
- `GET /admin/config`
- `PATCH /admin/config`
- `GET /admin/models`
- `POST /admin/models`
- `GET /admin/settings`
- `PATCH /admin/settings`
- `POST /admin/restart`
- `PATCH /admin/models/{id}`
- `DELETE /admin/models/{id}`

## 🎯 Next Steps

1. Ensure your backend is running at `http://localhost:5000`
2. Create an admin user in Firebase (or use existing admin account)
3. Open http://localhost:5178/ and log in
4. Start managing your Zen AI system!

## 🛠️ Development

```bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## 📦 Tech Stack

- **React 19** with TypeScript
- **Vite** for fast development
- **React Router** for navigation
- **Axios** for API calls
- **Lucide React** for icons
- Custom CSS with animations

Enjoy your new admin panel! 🚀
