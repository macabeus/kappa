#!/bin/bash
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_NAME="${1:-base}"

# Detect OS and architecture to pick the right agbcc executable
if [[ "$OSTYPE" == "darwin"* ]]; then
  AGBCC="$DIR/agbcc-mac-arm64"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
  AGBCC="$DIR/agbcc-linux-x86"
else
  echo "Unsupported OS: $OSTYPE"
  exit 1
fi

rm -f "$DIR/${BASE_NAME}.o" "$DIR/${BASE_NAME}.s"

"$AGBCC" "$DIR/${BASE_NAME}.c" -o "$DIR/${BASE_NAME}.s" && \
arm-none-eabi-as "$DIR/${BASE_NAME}.s" -o "$DIR/${BASE_NAME}.o" && \
rm "$DIR/${BASE_NAME}.s"

