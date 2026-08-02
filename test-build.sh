#!/bin/bash
cd "$(dirname "$0")"
echo "Running TypeScript check..."
npx tsc --noEmit
exit_code=$?
if [ $exit_code -eq 0 ]; then
  echo "✅ TypeScript check passed!"
else
  echo "❌ TypeScript check failed with exit code $exit_code"
fi
exit $exit_code
