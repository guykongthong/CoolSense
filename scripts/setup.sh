#!/bin/bash

# Smart AC Optimization Hackathon — Automated setup script
# Run from project root: ./scripts/setup.sh

set -e

PROJECT_ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$PROJECT_ROOT"

echo "🚀 Smart AC Optimization — Setup Script"
echo "========================================"
echo ""

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check prerequisites
echo -e "${BLUE}📋 Checking prerequisites...${NC}"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}⚠️  Node.js not found. Install from https://nodejs.org/${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Node.js $(node -v)${NC}"

# Check npm
if ! command -v npm &> /dev/null; then
    echo -e "${YELLOW}⚠️  npm not found. Install Node.js${NC}"
    exit 1
fi
echo -e "${GREEN}✓ npm $(npm -v)${NC}"

# Check Docker
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}⚠️  Docker not found. Supabase local dev requires Docker.${NC}"
    echo -e "${YELLOW}   Install from https://www.docker.com/products/docker-desktop${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Docker is installed${NC}"

# Check/install Supabase CLI
echo ""
echo -e "${BLUE}📦 Checking Supabase CLI...${NC}"
if ! command -v supabase &> /dev/null; then
    echo -e "${YELLOW}Installing Supabase CLI...${NC}"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if command -v brew &> /dev/null; then
            brew install supabase/tap/supabase
        else
            npm install -g supabase
        fi
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        npm install -g supabase
    else
        # Windows or other
        npm install -g supabase
    fi
fi
echo -e "${GREEN}✓ Supabase CLI $(supabase --version)${NC}"

echo ""

# Install frontend dependencies
echo -e "${BLUE}📦 Installing frontend dependencies...${NC}"
cd "$PROJECT_ROOT/frontend"
npm install
echo -e "${GREEN}✓ Frontend dependencies installed${NC}"

echo ""

# Create env files if they don't exist
echo -e "${BLUE}🔐 Setting up environment variables...${NC}"

if [ ! -f "$PROJECT_ROOT/supabase/.env" ]; then
    cp "$PROJECT_ROOT/supabase/.env.example" "$PROJECT_ROOT/supabase/.env"
    echo -e "${GREEN}✓ Created supabase/.env${NC}"
    echo -e "${YELLOW}⚠️  Add your WEATHERAPI_KEY to supabase/.env${NC}"
    echo -e "${YELLOW}   Get free key at https://www.weatherapi.com/${NC}"
else
    echo -e "${GREEN}✓ supabase/.env already exists${NC}"
fi

echo ""

# Start Supabase
echo -e "${BLUE}🗄️  Starting local Supabase...${NC}"
cd "$PROJECT_ROOT/supabase"

# Check if already running
if supabase status &> /dev/null; then
    echo -e "${YELLOW}⚠️  Supabase is already running${NC}"
else
    echo "Starting Supabase (this may take 30-60 seconds)..."
    supabase start
fi

echo -e "${GREEN}✓ Supabase is running${NC}"

echo ""
echo -e "${BLUE}✅ Verifying database migrations...${NC}"

# Give Supabase a moment to settle
sleep 2

# Check if tables exist
TABLES=$(supabase db list 2>/dev/null | grep -c "room_config\|occupancy_readings\|ac_calculations" || true)

if [ "$TABLES" -gt 0 ]; then
    echo -e "${GREEN}✓ Database tables created${NC}"
else
    echo -e "${YELLOW}⚠️  Could not verify tables. Check Supabase Studio at http://127.0.0.1:54323${NC}"
fi

echo ""
echo "========================================"
echo -e "${GREEN}✅ Setup Complete!${NC}"
echo "========================================"
echo ""
echo "🎉 Next steps:"
echo ""
echo "1️⃣  Start the frontend dev server:"
echo -e "   ${BLUE}cd frontend && npm run dev${NC}"
echo ""
echo "2️⃣  Open in browser:"
echo -e "   ${BLUE}http://localhost:5173${NC}"
echo ""
echo "3️⃣  Backend API is ready at:"
echo -e "   ${BLUE}http://127.0.0.1:54321${NC}"
echo ""
echo "4️⃣  Supabase Studio (database GUI):"
echo -e "   ${BLUE}http://127.0.0.1:54323${NC}"
echo ""
echo "5️⃣  Test calculation locally (no backend needed):"
echo -e "   ${BLUE}open tools/calculation-tester.html${NC}"
echo ""
echo "📖 Full setup guide: See README.md"
echo "📋 Project spec: See CLAUDE.md"
echo ""
