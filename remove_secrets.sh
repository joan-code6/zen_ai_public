#!/bin/bash

# Remove sensitive files
echo "Removing sensitive files..."

# Remove workflow file
rm -f .github/workflows/deploy-pages.yml

# Remove environment file
rm -f backend/.env

# Remove Firebase credentials
rm -f config/zen-ai6-firebase-adminsdk-fbsvc-db8e215cea.json

# Remove any other potential credential files
find . -name "*.env" -type f -delete
find . -name ".env.*" -type f -delete
find config/ -name "*firebase*.json" -type f -delete 2>/dev/null || true
find config/ -name "*adminsdk*.json" -type f -delete 2>/dev/null || true

# Create a .gitignore for secrets if it doesn't exist
if [ ! -f .gitignore ]; then
    touch .gitignore
fi

# Add patterns to .gitignore
grep -qxF '*.env' .gitignore || echo '*.env' >> .gitignore
grep -qxF '.env' .gitignore || echo '.env' >> .gitignore
grep -qxF 'backend/.env' .gitignore || echo 'backend/.env' >> .gitignore
grep -qxF 'config/*firebase*.json' .gitignore || echo 'config/*firebase*.json' >> .gitignore
grep -qxF 'config/*adminsdk*.json' .gitignore || echo 'config/*adminsdk*.json' >> .gitignore

echo "Sensitive files removed and .gitignore updated."