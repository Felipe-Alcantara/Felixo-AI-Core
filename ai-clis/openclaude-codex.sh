#!/bin/bash
# OpenClaude com Codex (GPT-5.5 xhigh)
export PATH="/home/felipe/.nvm/versions/node/v25.9.0/bin:/home/felipe/.npm-global/bin:$PATH"
exec konsole --hold --workdir "$HOME" -e /home/felipe/.nvm/versions/node/v25.9.0/bin/openclaude --provider openai --model 'gpt-5.5?reasoning=xhigh'
