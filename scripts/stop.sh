#!/bin/bash
# PortAI Nexus - Stop Script

echo "🛑 Stopping PortAI Nexus services..."
docker compose down

echo ""
echo "✅ All services stopped"
echo ""
echo "💡 To remove all data volumes, run:"
echo "   docker compose down -v"
