# Zen AI Admin Panel

A powerful admin dashboard for managing Zen AI's configuration, models, and monitoring system statistics.

## Features

- **Dashboard**: View real-time statistics including user count, chat count, messages, and estimated costs
- **Model Management**: Add, edit, enable/disable, and delete AI models
- **Configuration**: Set default models, switch between OpenRouter and Hack Club AI, and adjust cost tracking
- **Authentication**: Secure login with Firebase authentication

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file based on `.env.example`:
```bash
cp .env.example .env
```

3. Update the `.env` file with your backend URL:
```
VITE_API_URL=http://localhost:5000
```

4. Start the development server:
```bash
npm run dev
```

The admin panel will be available at `http://localhost:5174`

## Building for Production

```bash
npm run build
```

The built files will be in the `dist/` directory.

## API Configuration

The admin panel connects to the Zen AI backend API. Make sure the backend is running and accessible at the URL specified in your `.env` file.

Required backend endpoints:
- `POST /auth/login` - Authentication
- `GET /admin/stats` - System statistics
- `GET /admin/config` - Configuration data
- `PATCH /admin/config` - Update configuration
- `GET /admin/models` - List models
- `POST /admin/models` - Create model
- `PATCH /admin/models/{id}` - Update model
- `DELETE /admin/models/{id}` - Delete model

## Technologies

- React 19
- TypeScript
- Vite
- Axios for API calls
- React Router for navigation
- Lucide React for icons
