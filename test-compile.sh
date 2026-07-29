#!/bin/bash
npx tsc --noEmit functions/api/proposeChanges.ts functions/api/refineSuggestions.ts 2>&1
echo "Exit code: $?"
