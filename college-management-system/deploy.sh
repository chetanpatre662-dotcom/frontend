#!/bin/bash

set -e

SOURCE="/var/www/askbook/frontend/college-management-system"
TARGET="/var/www/askbook"
BACKUP="/var/www/askbook-backups"

echo "======================================"
echo "       ASKBOOK DEPLOYMENT"
echo "======================================"

echo ""
echo "1. Checking Git status..."
cd "$SOURCE"

git status

echo ""
echo "2. Pulling latest code..."
git pull origin main

echo ""
echo "3. Creating backup..."
mkdir -p "$BACKUP"

BACKUP_DIR="$BACKUP/$(date +%Y%m%d-%H%M%S)"
cp -a "$TARGET" "$BACKUP_DIR"

echo "Backup created:"
echo "$BACKUP_DIR"

echo ""
echo "4. Syncing frontend files..."

rsync -av \
  --exclude='.git' \
  --exclude='backend' \
  --exclude='node_modules' \
  --exclude='.vscode' \
  --exclude='package.json' \
  --exclude='package-lock.json' \
  "$SOURCE/" "$TARGET/"

echo ""
echo "5. Testing Nginx configuration..."

nginx -t

echo ""
echo "6. Reloading Nginx..."

systemctl reload nginx

echo ""
echo "======================================"
echo "       DEPLOYMENT SUCCESSFUL"
echo "======================================"