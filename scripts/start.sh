#!/bin/bash
# PortAI Nexus - Quick Start Script

set -e

echo "=============================================="
echo "  PortAI Nexus - Industrial AI Platform"
echo "=============================================="
echo ""

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    echo "   Visit: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check Docker Compose
if ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

echo "✅ Docker and Docker Compose are installed"
echo ""

# Check .env file
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp .env.template .env
    
    # Generate random JWT secret
    JWT_SECRET=$(openssl rand -base64 32 2>/dev/null || cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 32 | head -n 1)
    sed -i "s/your-super-secret-jwt-key-change-in-production-min-32-chars/$JWT_SECRET/" .env
    
    echo "✅ .env file created with random JWT secret"
    echo ""
fi

# Start services
echo "🚀 Starting PortAI Nexus services..."
echo ""

docker compose up -d

echo ""
echo "⏳ Waiting for services to start..."
sleep 10

# Check service status
echo ""
echo "📊 Service Status:"
docker compose ps

echo ""
echo "=============================================="
echo "  PortAI Nexus is starting up!"
echo "=============================================="
echo ""
echo "  🌐 Application:  http://localhost:3000"
echo "  📊 Grafana:      http://localhost:3001 (admin/admin123)"
echo "  📈 Prometheus:   http://localhost:9090"
echo "  🔍 Jaeger:       http://localhost:16686"
echo ""
echo "  📝 View logs:    docker compose logs -f app"
echo "  🛑 Stop:         docker compose down"
echo ""
echo "=============================================="
