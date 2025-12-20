#!/bin/bash

# PicBest Installation Script for Apple Silicon (M1/M2/M3)
# This script handles dlib's special requirements on ARM Macs

set -e  # Exit on error

echo "🍎 PicBest Installation for Apple Silicon"
echo "=========================================="
echo ""

# Check if running on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo "❌ Error: This script is for macOS only"
    exit 1
fi

# Check if running on Apple Silicon
ARCH=$(uname -m)
if [[ "$ARCH" != "arm64" ]]; then
    echo "⚠️  Warning: This script is optimized for Apple Silicon (M1/M2/M3)"
    echo "   Detected architecture: $ARCH"
    read -p "   Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Check Python 3.11 (required for M1 compatibility with dlib)
echo "📍 Checking Python 3.11..."
if ! command -v python3.11 &> /dev/null; then
    echo "❌ Python 3.11 not found. Installing..."
    brew install python@3.11

    if ! command -v python3.11 &> /dev/null; then
        echo "❌ Failed to install Python 3.11"
        exit 1
    fi
fi

PYTHON_VERSION=$(python3.11 --version | cut -d' ' -f2)
echo "   ✓ Using Python $PYTHON_VERSION"

# Check for Xcode Command Line Tools (required for compiling dlib)
echo ""
echo "📍 Checking Xcode Command Line Tools..."
if ! xcode-select -p &> /dev/null; then
    echo "❌ Xcode Command Line Tools not found. Installing..."
    xcode-select --install
    echo ""
    echo "⚠️  Please wait for Xcode Command Line Tools installation to complete,"
    echo "   then run this script again."
    exit 1
else
    echo "   ✓ Xcode Command Line Tools installed at $(xcode-select -p)"
fi

# Check if Homebrew is installed
echo ""
echo "📍 Checking Homebrew..."
if ! command -v brew &> /dev/null; then
    echo "❌ Homebrew not found. Installing Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
else
    echo "   ✓ Homebrew installed"
fi

# Install system dependencies for dlib
echo ""
echo "📦 Installing system dependencies..."
echo "   This includes cmake, openblas, and other tools needed for dlib"
brew install cmake openblas

# Create virtual environment with Python 3.11
echo ""
echo "🐍 Setting up Python virtual environment..."
if [ -d "venv" ]; then
    echo "   ⚠️  venv directory already exists"
    read -p "   Remove and recreate? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -rf venv
        virtualenv venv --python=python3.11
    fi
else
    virtualenv venv --python=python3.11
fi

# Activate virtual environment
echo "   Activating virtual environment..."
source venv/bin/activate

# Upgrade pip
echo ""
echo "⬆️  Upgrading pip..."
pip install --upgrade pip wheel setuptools

# Install dlib with special M1 configuration
echo ""
echo "🔨 Installing dlib (this takes 5-10 minutes)..."
echo "   Building from source with OpenBLAS optimizations for Apple Silicon..."

# Set SDK path (critical for macOS Sequoia and M1)
export SDKROOT=$(xcrun --show-sdk-path)

# Install remaining requirements
echo ""
echo "📦 Installing remaining dependencies..."
pip install -r requirements.txt

# Create necessary directories
echo ""
echo "📁 Creating directories..."
mkdir -p photos
mkdir -p thumbnails/400
mkdir -p thumbnails/1200

# Test imports
echo ""
echo "🧪 Testing installation..."
python3 << 'EOF'
import sys
try:
    print("   Testing dlib...", end=" ")
    import dlib
    print("✓")

    print("   Testing face_recognition...", end=" ")
    import face_recognition
    print("✓")

    print("   Testing torch...", end=" ")
    import torch
    print(f"✓ (MPS available: {torch.backends.mps.is_available()})")

    print("   Testing sentence-transformers...", end=" ")
    from sentence_transformers import SentenceTransformer
    print("✓")

    print("   Testing fastapi...", end=" ")
    import fastapi
    print("✓")

    print("\n✅ All core packages imported successfully!")

except ImportError as e:
    print(f"\n❌ Import failed: {e}")
    sys.exit(1)
EOF

if [ $? -ne 0 ]; then
    echo ""
    echo "❌ Installation test failed. Please check the error messages above."
    exit 1
fi

# Print success message
echo ""
echo "=========================================="
echo "✅ Installation Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo ""
echo "1. Activate the virtual environment:"
echo "   source venv/bin/activate"
echo ""
echo "2. Add your photos to the ./photos folder:"
echo "   ln -s /path/to/your/photos ./photos"
echo ""
echo "3. Index your photos:"
echo "   python index_photos.py"
echo ""
echo "4. Start the web server:"
echo "   python server.py"
echo ""
echo "5. Open http://localhost:8000 in your browser"
echo ""
echo "For more information, see README.md"
echo ""

