# Zen CLI

A beautiful terminal interface for Zen AI — your personal AI assistant.

![Python](https://img.shields.io/badge/python-3.10+-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

## Important Notice
This is a work in progress for my Jugend Forscht project. 
Currently only one testing server is available at `https://raspberrypi.tailf0b36d.ts.net`.
If this is down, the CLI will not function.
## ✨ Features

- 🔐 **Authentication** — Secure login/signup with session persistence
- 💬 **Chat** — Interactive AI conversations with markdown support
- 📝 **Notes** — Create, edit, search, and manage your notes
- 🎨 **Beautiful UI** — Rich terminal interface with colors and arrow-key navigation

## 📦 Installation

```bash
pip install zen-cli
```

## 🚀 Usage

Simply run:

```bash
zen
```

Navigate with arrow keys (↑↓) and press Enter to select.

## ⚙️ Configuration

By default, Zen CLI connects to `http://localhost:5000`. 

To use a different server, create a `.env` file:

```env
ZEN_API_URL=https://your-zen-server.com
```

Or set the environment variable directly.

## 📋 Requirements

- Python 3.10+
- A running Zen AI backend server

## 🛠️ Development

Clone and install in development mode:

```bash
git clone https://github.com/joan-code6/zen_ai.git
cd zen_ai/cli
pip install -e .
```

## 📄 License

MIT License - see LICENSE file for details.