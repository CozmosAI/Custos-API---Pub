#!/bin/bash
# Remove all caching logic and period logic
sed -i -e '/if (usePromptCache && cacheDiscount > 0) {/,/\} else {/d' src/App.tsx
sed -i -e 's/custoCall = (inputTokens \* preçoInput + outputTokens \* preçoOutput) \/ 1_000_000;/custoCall = (inputTokens * preçoInput + outputTokens * preçoOutput) \/ 1_000_000;/g' src/App.tsx

# Wait, the block is:
# if (usePromptCache && cacheDiscount > 0) {
#   ...
# } else {
#   custoCall = ...
# }
# If I delete from 'if' to '} else {', I just leave the inside of the else!
# And then I need to delete the trailing '}' of the else block.
